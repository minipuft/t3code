import {
  WorkbenchPlanPath,
  type ServerSettings,
  type WorkbenchPlanAnnotation,
  type WorkbenchPlanAnnotationMutationInput,
  type WorkbenchPlanAnnotations,
  type WorkbenchPlanList,
  type WorkbenchPlanMutationInput,
  type WorkbenchPlanMutationResult,
  type WorkbenchPlanSaveInput,
  type WorkbenchPlanSaveResult,
  type WorkbenchPlanSourceDocument,
  type WorkbenchPlanSummary,
  type WorkbenchPlansSource,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { ServerSettingsService } from "../serverSettings.ts";

const REQUEST_TIMEOUT = "6 seconds";

export class WorkbenchPlansAdapterError extends Data.TaggedError("WorkbenchPlansAdapterError")<{
  readonly reason:
    | "invalid_url"
    | "request_failed"
    | "invalid_response"
    | "invalid_request"
    | "not_found"
    | "conflict";
}> {}

type LoadJson = (
  source: WorkbenchPlansSource,
  path: string,
  body?: unknown,
) => Effect.Effect<unknown, WorkbenchPlansAdapterError>;

type LegacyFile = {
  readonly rel?: unknown;
  readonly name?: unknown;
  readonly dir?: unknown;
  readonly project?: unknown;
  readonly status?: unknown;
  readonly date?: unknown;
  readonly tags?: unknown;
  readonly mtimeMs?: unknown;
  readonly source?: unknown;
};

type LegacyBinding = {
  readonly rel?: unknown;
  readonly title?: unknown;
  readonly threads?: unknown;
  readonly confirmed?: unknown;
  readonly bound_at?: unknown;
  readonly notesRel?: unknown;
  readonly notesStale?: unknown;
  readonly deviations?: unknown;
};

type LegacyAnnotation = {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly body?: unknown;
  readonly quote?: unknown;
  readonly heading?: unknown;
  readonly created_at?: unknown;
};

const unavailable = (reason: string): WorkbenchPlanList => ({
  capability: { status: "unavailable", reason },
  items: [],
});

const configuredSource = (settings: ServerSettings) =>
  settings.workbenchPlansSource === null
    ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_url" }))
    : Effect.succeed(settings.workbenchPlansSource);

function optionalPlanPath(value: unknown): WorkbenchPlanPath | null {
  if (typeof value !== "string") return null;
  try {
    return WorkbenchPlanPath.make(value);
  } catch {
    return null;
  }
}

function parseAnnotations(
  path: WorkbenchPlanPath,
  body: unknown,
): Effect.Effect<WorkbenchPlanAnnotations, WorkbenchPlansAdapterError> {
  const value = body as { items?: unknown; markdown?: unknown };
  if (!Array.isArray(value.items) || typeof value.markdown !== "string") {
    return Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }));
  }
  const items = value.items.flatMap((item): ReadonlyArray<WorkbenchPlanAnnotation> => {
    const annotation = item as LegacyAnnotation;
    if (
      typeof annotation.id !== "string" ||
      (annotation.kind !== "comment" && annotation.kind !== "delete") ||
      typeof annotation.created_at !== "string"
    ) {
      return [];
    }
    return [
      {
        id: annotation.id,
        kind: annotation.kind,
        body: typeof annotation.body === "string" ? annotation.body : "",
        quote: typeof annotation.quote === "string" ? annotation.quote : "",
        heading: typeof annotation.heading === "string" ? annotation.heading : "",
        createdAt: annotation.created_at,
      },
    ];
  });
  return Effect.succeed({ path, items, markdown: value.markdown });
}

export interface WorkbenchPlansShape {
  readonly list: Effect.Effect<WorkbenchPlanList>;
  readonly read: (
    path: WorkbenchPlanPath,
  ) => Effect.Effect<WorkbenchPlanSourceDocument, WorkbenchPlansAdapterError>;
  readonly save: (
    input: WorkbenchPlanSaveInput,
  ) => Effect.Effect<WorkbenchPlanSaveResult, WorkbenchPlansAdapterError>;
  readonly mutate: (
    input: WorkbenchPlanMutationInput,
  ) => Effect.Effect<WorkbenchPlanMutationResult, WorkbenchPlansAdapterError>;
  readonly readAnnotations: (
    path: WorkbenchPlanPath,
  ) => Effect.Effect<WorkbenchPlanAnnotations, WorkbenchPlansAdapterError>;
  readonly mutateAnnotations: (
    input: WorkbenchPlanAnnotationMutationInput,
  ) => Effect.Effect<WorkbenchPlanAnnotations, WorkbenchPlansAdapterError>;
}

export class WorkbenchPlans extends Context.Service<WorkbenchPlans, WorkbenchPlansShape>()(
  "t3/workbenchPlans/WorkbenchPlans",
) {}

export function makeWorkbenchPlans<E>(
  getSettings: Effect.Effect<ServerSettings, E>,
  loadJson: LoadJson,
): WorkbenchPlansShape {
  const source = getSettings.pipe(
    Effect.mapError(() => new WorkbenchPlansAdapterError({ reason: "request_failed" })),
    Effect.flatMap(configuredSource),
  );
  return {
    list: getSettings.pipe(
      Effect.flatMap((settings): Effect.Effect<WorkbenchPlanList> => {
        if (settings.workbenchPlansSource === null) {
          return Effect.succeed({
            capability: {
              status: "misconfigured",
              reason: "Configure a Workbench plans source in this environment.",
            },
            items: [],
          });
        }
        return loadJson(settings.workbenchPlansSource, "__t3md/api/tree").pipe(
          Effect.map((body): WorkbenchPlanList => {
            const payload = body as {
              groups?: ReadonlyArray<{ files?: ReadonlyArray<LegacyFile> }>;
              bindings?: ReadonlyArray<LegacyBinding>;
            };
            const groups = payload.groups ?? [];
            const bindings = new Map(
              (payload.bindings ?? [])
                .filter(
                  (binding): binding is LegacyBinding & { readonly rel: string } =>
                    typeof binding.rel === "string",
                )
                .map((binding) => [binding.rel, binding] as const),
            );
            const items = groups
              .flatMap((group) => group.files ?? [])
              .flatMap((file) => {
                if (
                  file.source !== "plans" ||
                  typeof file.rel !== "string" ||
                  typeof file.name !== "string" ||
                  typeof file.mtimeMs !== "number"
                )
                  return [];
                try {
                  const status: WorkbenchPlanSummary["status"] =
                    file.status === "active" ||
                    file.status === "backlog" ||
                    file.status === "done" ||
                    file.status === "reference"
                      ? file.status
                      : null;
                  const legacyBinding = bindings.get(file.rel);
                  const notesPath = optionalPlanPath(legacyBinding?.notesRel);
                  return [
                    {
                      path: WorkbenchPlanPath.make(file.rel),
                      name: file.name,
                      directory: typeof file.dir === "string" ? file.dir : "",
                      project: typeof file.project === "string" ? file.project : null,
                      status,
                      date: typeof file.date === "string" ? file.date : null,
                      tags: Array.isArray(file.tags)
                        ? file.tags.filter((tag): tag is string => typeof tag === "string")
                        : [],
                      mtimeMs: file.mtimeMs,
                      binding:
                        legacyBinding === undefined
                          ? null
                          : {
                              title:
                                typeof legacyBinding.title === "string"
                                  ? legacyBinding.title
                                  : null,
                              threads:
                                typeof legacyBinding.threads === "number"
                                  ? legacyBinding.threads
                                  : 1,
                              confirmed: legacyBinding.confirmed === true,
                              boundAt:
                                typeof legacyBinding.bound_at === "string"
                                  ? legacyBinding.bound_at
                                  : null,
                              notesPath,
                              notesStale: legacyBinding.notesStale === true,
                              deviations:
                                typeof legacyBinding.deviations === "number"
                                  ? legacyBinding.deviations
                                  : 0,
                            },
                    },
                  ];
                } catch {
                  return [];
                }
              });
            return { capability: { status: "available", reason: null }, items };
          }),
          Effect.orElseSucceed(() =>
            unavailable("The configured Workbench plans source is unavailable."),
          ),
        );
      }),
      Effect.orElseSucceed(() =>
        unavailable("The environment could not read its Workbench plans configuration."),
      ),
    ),
    read: (path) =>
      source.pipe(
        Effect.flatMap((value) =>
          loadJson(value, `__t3md/api/source?p=${encodeURIComponent(path)}`),
        ),
        Effect.flatMap((body) => {
          const value = body as { text?: unknown; mtimeMs?: unknown; size?: unknown };
          return typeof value.text === "string" &&
            typeof value.mtimeMs === "number" &&
            typeof value.size === "number"
            ? Effect.succeed({ path, text: value.text, mtimeMs: value.mtimeMs, size: value.size })
            : Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }));
        }),
      ),
    save: (input) =>
      source.pipe(
        Effect.flatMap((value) =>
          loadJson(value, "__t3md/api/save", {
            rel: input.path,
            text: input.text,
            baseMtimeMs: input.baseMtimeMs,
          }),
        ),
        Effect.flatMap((body) => {
          const value = body as { mtimeMs?: unknown; size?: unknown };
          return typeof value.mtimeMs === "number" && typeof value.size === "number"
            ? Effect.succeed({ path: input.path, mtimeMs: value.mtimeMs, size: value.size })
            : Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }));
        }),
      ),
    mutate: (input) =>
      source.pipe(
        Effect.flatMap((value) =>
          loadJson(
            value,
            "__t3md/api/plan",
            input.op === "create" ? input : { ...input, rel: input.path },
          ),
        ),
        Effect.flatMap((body) => {
          const path = (body as { rel?: unknown }).rel;
          return typeof path === "string"
            ? Effect.succeed({ path: WorkbenchPlanPath.make(path) })
            : Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }));
        }),
      ),
    readAnnotations: (path) =>
      source.pipe(
        Effect.flatMap((value) =>
          loadJson(value, `__t3md/api/annotations?p=${encodeURIComponent(path)}`),
        ),
        Effect.flatMap((body) => parseAnnotations(path, body)),
      ),
    mutateAnnotations: (input) =>
      source.pipe(
        Effect.flatMap((value) =>
          loadJson(value, "__t3md/api/annotations", {
            rel: input.path,
            ...(input.op === "resolve"
              ? { resolve: input.annotationId }
              : {
                  kind: input.kind,
                  body: input.body,
                  quote: input.quote,
                  heading: input.heading,
                }),
          }).pipe(
            Effect.andThen(
              loadJson(value, `__t3md/api/annotations?p=${encodeURIComponent(input.path)}`),
            ),
          ),
        ),
        Effect.flatMap((body) => parseAnnotations(input.path, body)),
      ),
  };
}

export const layer = Layer.effect(
  WorkbenchPlans,
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService;
    const httpClient = yield* HttpClient.HttpClient;
    const loadJson: LoadJson = (source, path, body) =>
      Effect.gen(function* () {
        const url = yield* Effect.try({
          try: () =>
            new URL(path, source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`),
          catch: () => new WorkbenchPlansAdapterError({ reason: "invalid_url" }),
        });
        const request =
          body === undefined
            ? HttpClientRequest.get(url)
            : yield* HttpClientRequest.post(url).pipe(
                HttpClientRequest.bodyJson(body),
                Effect.mapError(
                  () => new WorkbenchPlansAdapterError({ reason: "invalid_response" }),
                ),
              );
        return yield* httpClient.execute(request).pipe(
          Effect.flatMap((response) =>
            response.status === 400
              ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_request" }))
              : response.status === 404
                ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "not_found" }))
                : response.status === 409
                  ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "conflict" }))
                  : HttpClientResponse.filterStatusOk(response).pipe(
                      Effect.mapError(
                        () => new WorkbenchPlansAdapterError({ reason: "request_failed" }),
                      ),
                    ),
          ),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Unknown)),
          Effect.timeout(REQUEST_TIMEOUT),
          Effect.mapError((error) =>
            error instanceof WorkbenchPlansAdapterError
              ? error
              : new WorkbenchPlansAdapterError({ reason: "request_failed" }),
          ),
        );
      });
    return WorkbenchPlans.of(makeWorkbenchPlans(settings.getSettings, loadJson));
  }),
);
