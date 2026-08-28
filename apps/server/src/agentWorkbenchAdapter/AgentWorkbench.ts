import * as NodeCrypto from "node:crypto";

import {
  AgentWorkbenchCatalog,
  AgentWorkbenchPlanAnnotations,
  AgentWorkbenchPlanList,
  AgentWorkbenchPlanMutationResult,
  AgentWorkbenchPlanSource,
  AgentWorkbenchPromptDetail,
  AgentWorkbenchPromptHistory,
  AgentWorkbenchPromptMutationResult,
  AgentWorkbenchPromptReview,
  AgentWorkbenchVitals,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import {
  AgentWorkbenchConnection,
  AgentWorkbenchConnectionError,
  makeAgentWorkbenchConnectionDependencies,
} from "./AgentWorkbenchConnection.ts";

export class AgentWorkbenchAdapterError extends Schema.TaggedErrorClass<AgentWorkbenchAdapterError>()(
  "AgentWorkbenchAdapterError",
  {
    reason: Schema.Literals([
      "not_installed",
      "configuration_invalid",
      "start_failed",
      "request_failed",
      "unsupported_version",
      "unauthorized",
      "forbidden",
      "not_found",
      "conflict",
      "invalid_response",
    ]),
  },
) {}

export interface AgentWorkbenchShape {
  readonly listPlans: Effect.Effect<AgentWorkbenchPlanList, AgentWorkbenchAdapterError>;
  readonly vitals: Effect.Effect<AgentWorkbenchVitals, AgentWorkbenchAdapterError>;
  readonly readPlan: (
    path: string,
  ) => Effect.Effect<typeof AgentWorkbenchPlanSource.Type, AgentWorkbenchAdapterError>;
  readonly savePlan: (
    path: string,
    input: unknown,
  ) => Effect.Effect<typeof AgentWorkbenchPlanMutationResult.Type, AgentWorkbenchAdapterError>;
  readonly mutatePlan: (
    input: unknown,
  ) => Effect.Effect<typeof AgentWorkbenchPlanMutationResult.Type, AgentWorkbenchAdapterError>;
  readonly readAnnotations: (
    path: string,
  ) => Effect.Effect<typeof AgentWorkbenchPlanAnnotations.Type, AgentWorkbenchAdapterError>;
  readonly mutateAnnotations: (
    path: string,
    input: unknown,
  ) => Effect.Effect<typeof AgentWorkbenchPlanAnnotations.Type, AgentWorkbenchAdapterError>;
  readonly catalog: Effect.Effect<AgentWorkbenchCatalog, AgentWorkbenchAdapterError>;
  readonly promptDetail: (
    id: string,
  ) => Effect.Effect<AgentWorkbenchPromptDetail, AgentWorkbenchAdapterError>;
  readonly promptHistory: (
    id: string,
    limit?: number,
  ) => Effect.Effect<AgentWorkbenchPromptHistory, AgentWorkbenchAdapterError>;
  readonly comparePrompt: (
    id: string,
    from: number,
    to: number,
  ) => Effect.Effect<AgentWorkbenchPromptReview, AgentWorkbenchAdapterError>;
  readonly reviewPrompt: (
    id: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchPromptReview, AgentWorkbenchAdapterError>;
  readonly applyPrompt: (
    id: string,
    requestId: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchPromptMutationResult, AgentWorkbenchAdapterError>;
  readonly rollbackPrompt: (
    id: string,
    requestId: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchPromptMutationResult, AgentWorkbenchAdapterError>;
}

export class AgentWorkbench extends Context.Service<AgentWorkbench, AgentWorkbenchShape>()(
  "t3/agentWorkbenchAdapter/AgentWorkbench",
) {}

interface AgentWorkbenchContextDependencies {
  readonly getEnvironmentId: Effect.Effect<string>;
  readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>>;
}

export interface AgentWorkbenchConnectionShape {
  readonly request: AgentWorkbenchConnection["request"];
  readonly leaseId: AgentWorkbenchConnection["leaseId"];
}

export function makeAgentWorkbench(
  connection: AgentWorkbenchConnectionShape,
  context: AgentWorkbenchContextDependencies,
): AgentWorkbenchShape {
  const isAdapterError = Schema.is(AgentWorkbenchAdapterError);
  const request = <S extends Schema.Codec<unknown, unknown, never, never>>(
    schema: S,
    pathname: string,
    options?: {
      readonly method?: string;
      readonly admin?: boolean;
      readonly body?: unknown;
      readonly requestId?: string;
    },
  ): Effect.Effect<S["Type"], AgentWorkbenchAdapterError> =>
    Effect.tryPromise({
      try: () => connection.request(pathname, options),
      catch: mapConnectionError,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError((error) =>
        isAdapterError(error)
          ? error
          : new AgentWorkbenchAdapterError({ reason: "invalid_response" }),
      ),
    );

  const catalog = Effect.gen(function* () {
    const [environmentId, providers] = yield* Effect.all([
      context.getEnvironmentId,
      context.getProviders,
    ]);
    const leaseId = yield* Effect.tryPromise({
      try: () => connection.leaseId(),
      catch: mapConnectionError,
    });
    yield* request(Schema.Unknown, "/v1/context", {
      method: "PUT",
      admin: true,
      body: {
        protocolVersion: "1.0.0",
        leaseId,
        environmentId,
        skills: providerSkills(providers),
      },
    });
    return yield* request(
      AgentWorkbenchCatalog,
      `/v1/catalog?leaseId=${encodeURIComponent(leaseId)}`,
    );
  });

  return AgentWorkbench.of({
    listPlans: request(AgentWorkbenchPlanList, "/v1/plans"),
    vitals: request(AgentWorkbenchVitals, "/v1/vitals"),
    readPlan: (path) => request(AgentWorkbenchPlanSource, `/v1/plans/${encodeURIComponent(path)}`),
    savePlan: (path, input) =>
      request(AgentWorkbenchPlanMutationResult, `/v1/plans/${encodeURIComponent(path)}`, {
        method: "PUT",
        admin: true,
        body: input,
      }),
    mutatePlan: (input) =>
      request(AgentWorkbenchPlanMutationResult, "/v1/plans/commands", {
        method: "POST",
        admin: true,
        body: input,
      }),
    readAnnotations: (path) =>
      request(AgentWorkbenchPlanAnnotations, `/v1/plans/${encodeURIComponent(path)}/annotations`),
    mutateAnnotations: (path, input) =>
      request(AgentWorkbenchPlanAnnotations, `/v1/plans/${encodeURIComponent(path)}/annotations`, {
        method: "POST",
        admin: true,
        body: input,
      }),
    catalog,
    promptDetail: (id) =>
      request(AgentWorkbenchPromptDetail, `/v1/prompts/${encodeURIComponent(id)}`),
    promptHistory: (id, limit = 20) =>
      request(
        AgentWorkbenchPromptHistory,
        `/v1/prompts/${encodeURIComponent(id)}/history?limit=${encodeURIComponent(limit)}`,
      ),
    comparePrompt: (id, from, to) =>
      request(
        AgentWorkbenchPromptReview,
        `/v1/prompts/${encodeURIComponent(id)}/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    reviewPrompt: (id, input) =>
      request(AgentWorkbenchPromptReview, `/v1/prompts/${encodeURIComponent(id)}/review`, {
        method: "POST",
        admin: true,
        body: input,
      }),
    applyPrompt: (id, requestId, input) =>
      request(AgentWorkbenchPromptMutationResult, `/v1/prompts/${encodeURIComponent(id)}/apply`, {
        method: "POST",
        admin: true,
        body: input,
        requestId,
      }),
    rollbackPrompt: (id, requestId, input) =>
      request(
        AgentWorkbenchPromptMutationResult,
        `/v1/prompts/${encodeURIComponent(id)}/rollback`,
        { method: "POST", admin: true, body: input, requestId },
      ),
  });
}

const make = Effect.gen(function* () {
  const environment = yield* ServerEnvironment;
  const providers = yield* ProviderRegistry;
  const connection = new AgentWorkbenchConnection(makeAgentWorkbenchConnectionDependencies());
  yield* Effect.addFinalizer(() => Effect.promise(() => connection.close()));
  return makeAgentWorkbench(connection, {
    getEnvironmentId: environment.getEnvironmentId,
    getProviders: providers.getProviders,
  });
});

export const layer = Layer.effect(AgentWorkbench, make);

function providerSkills(providers: ReadonlyArray<ServerProvider>) {
  const skills = new Map<
    string,
    {
      readonly id: string;
      readonly name: string;
      readonly description: string | null;
      readonly scope: string | null;
      readonly sourcePath: string | null;
      readonly providers: Set<string>;
    }
  >();
  for (const provider of providers) {
    for (const skill of provider.skills) {
      const identity = `${skill.name}\0${skill.path}`;
      const existing = skills.get(identity);
      if (existing !== undefined) {
        existing.providers.add(provider.driver);
        continue;
      }
      const id = NodeCrypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
      skills.set(identity, {
        id: `skill:${id}`,
        name: skill.name,
        description: skill.description ?? null,
        scope: skill.scope ?? null,
        sourcePath: skill.path ?? null,
        providers: new Set([provider.driver]),
      });
    }
  }
  return [...skills.values()].map((skill) => ({ ...skill, providers: [...skill.providers] }));
}

function mapConnectionError(cause: unknown) {
  return new AgentWorkbenchAdapterError({
    reason: cause instanceof AgentWorkbenchConnectionError ? cause.reason : "request_failed",
  });
}
