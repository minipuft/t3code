import * as NodeCrypto from "node:crypto";

import {
  WorkflowCatalogItemId,
  WorkflowPromptSummary,
  type ServerProvider,
  type ServerSettings,
  type WorkflowCatalogItem,
  type WorkflowCatalogList,
  type WorkflowCatalogSource,
  type WorkflowSkillSummary,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ServerSettingsService } from "../serverSettings.ts";

const CATALOG_REQUEST_TIMEOUT = "5 seconds";

const McpPromptCatalogResponse = Schema.Struct({
  prompts: Schema.Array(WorkflowPromptSummary),
});

export class WorkflowCatalogSourceError extends Schema.TaggedErrorClass<WorkflowCatalogSourceError>()(
  "WorkflowCatalogSourceError",
  {
    reason: Schema.Literals(["invalid_url", "request_failed", "invalid_response"]),
  },
) {}

export class WorkflowCatalogDependencyError extends Schema.TaggedErrorClass<WorkflowCatalogDependencyError>()(
  "WorkflowCatalogDependencyError",
  { dependency: Schema.Literals(["settings", "providers"]) },
) {}

const isWorkflowCatalogSourceError = Schema.is(WorkflowCatalogSourceError);

export interface WorkflowCatalogDependencies {
  readonly getSettings: Effect.Effect<ServerSettings, WorkflowCatalogDependencyError>;
  readonly getProviders: Effect.Effect<
    ReadonlyArray<ServerProvider>,
    WorkflowCatalogDependencyError
  >;
  readonly loadPrompts: (
    source: WorkflowCatalogSource,
  ) => Effect.Effect<ReadonlyArray<WorkflowPromptSummary>, WorkflowCatalogSourceError>;
}

export interface WorkflowCatalogShape {
  readonly list: Effect.Effect<WorkflowCatalogList>;
  readonly find: (
    itemId: WorkflowCatalogItemId,
  ) => Effect.Effect<Option.Option<WorkflowCatalogItem>>;
}

export class WorkflowCatalog extends Context.Service<WorkflowCatalog, WorkflowCatalogShape>()(
  "t3/workflowCatalog/WorkflowCatalog",
) {}

function stableSkillId(name: string, path: string): WorkflowCatalogItemId {
  const digest = NodeCrypto.createHash("sha256")
    .update(`${name}\0${path}`)
    .digest("hex")
    .slice(0, 24);
  return WorkflowCatalogItemId.make(`skill:${digest}`);
}

export function mergeProviderSkills(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<WorkflowSkillSummary> {
  const skillsByIdentity = new Map<
    string,
    {
      readonly skill: ServerProvider["skills"][number];
      readonly providers: Set<ServerProvider["driver"]>;
    }
  >();

  for (const provider of providers) {
    for (const skill of provider.skills) {
      const identity = `${skill.name}\0${skill.path}`;
      const existing = skillsByIdentity.get(identity);
      if (existing !== undefined) {
        existing.providers.add(provider.driver);
        continue;
      }
      skillsByIdentity.set(identity, { skill, providers: new Set([provider.driver]) });
    }
  }

  return [...skillsByIdentity.values()]
    .map(({ skill, providers: skillProviders }) => ({
      kind: "skill" as const,
      id: stableSkillId(skill.name, skill.path),
      name: skill.name,
      description: skill.description ?? null,
      scope: skill.scope ?? null,
      sourcePath: skill.path,
      providers: [...skillProviders].toSorted((left, right) => left.localeCompare(right)),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

const sourceFailureReason = (error: WorkflowCatalogSourceError): string => {
  switch (error.reason) {
    case "invalid_url":
      return "The configured prompt catalog URL is invalid.";
    case "invalid_response":
      return "The configured prompt catalog returned an invalid response.";
    case "request_failed":
      return "The configured prompt catalog is unavailable.";
  }
};

export function makeWorkflowCatalog(
  dependencies: WorkflowCatalogDependencies,
): WorkflowCatalogShape {
  const list = Effect.gen(function* () {
    const [settings, providers] = yield* Effect.all([
      dependencies.getSettings,
      dependencies.getProviders,
    ]);
    const skills = mergeProviderSkills(providers);
    const source = settings.workflowCatalogSource;

    if (source === null) {
      return {
        capability: {
          status: "misconfigured" as const,
          sourceKind: null,
          reason: "Configure a workflow catalog source in this environment.",
        },
        items: skills,
      } satisfies WorkflowCatalogList;
    }

    const promptsResult = yield* dependencies.loadPrompts(source).pipe(
      Effect.map((prompts) => ({ ok: true as const, prompts })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
    );
    if (!promptsResult.ok) {
      return {
        capability: {
          status: "unavailable" as const,
          sourceKind: source.kind,
          reason: isWorkflowCatalogSourceError(promptsResult.error)
            ? sourceFailureReason(promptsResult.error)
            : "The configured prompt catalog is unavailable.",
        },
        items: skills,
      } satisfies WorkflowCatalogList;
    }

    return {
      capability: { status: "available" as const, sourceKind: source.kind, reason: null },
      items: [...promptsResult.prompts, ...skills],
    } satisfies WorkflowCatalogList;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError("workflow catalog settings or provider read failed", { cause }).pipe(
        Effect.as({
          capability: {
            status: "unavailable" as const,
            sourceKind: null,
            reason: "The environment could not read its workflow catalog configuration.",
          },
          items: [],
        } satisfies WorkflowCatalogList),
      ),
    ),
  );

  return {
    list,
    find: (itemId) =>
      list.pipe(
        Effect.map((catalog) =>
          Option.fromUndefinedOr(catalog.items.find((item) => item.id === itemId)),
        ),
      ),
  };
}

const make = Effect.gen(function* () {
  const settings = yield* ServerSettingsService;
  const providers = yield* ProviderRegistry;
  const httpClient = yield* HttpClient.HttpClient;

  const loadPrompts: WorkflowCatalogDependencies["loadPrompts"] = Effect.fn(
    "WorkflowCatalog.loadPrompts",
  )(function* (source) {
    const catalogUrl = yield* Effect.try({
      try: () =>
        new URL("prompts", source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`),
      catch: () => new WorkflowCatalogSourceError({ reason: "invalid_url" }),
    });

    return yield* httpClient.get(catalogUrl).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(McpPromptCatalogResponse)),
      Effect.map((response) => response.prompts),
      Effect.timeout(CATALOG_REQUEST_TIMEOUT),
      Effect.mapError((error) =>
        Schema.isSchemaError(error)
          ? new WorkflowCatalogSourceError({ reason: "invalid_response" })
          : new WorkflowCatalogSourceError({ reason: "request_failed" }),
      ),
    );
  });

  return WorkflowCatalog.of(
    makeWorkflowCatalog({
      getSettings: settings.getSettings.pipe(
        Effect.mapError(() => new WorkflowCatalogDependencyError({ dependency: "settings" })),
      ),
      getProviders: providers.getProviders,
      loadPrompts,
    }),
  );
});

export const layer = Layer.effect(WorkflowCatalog, make);
