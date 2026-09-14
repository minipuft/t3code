import * as NodeCrypto from "node:crypto";

import {
  AgentWorkbenchCatalog,
  AgentWorkbenchAssociationCommand,
  AgentWorkbenchPlanAnnotations,
  AgentWorkbenchPlanAssociations,
  AgentWorkbenchPlanList,
  AgentWorkbenchPlanMutationResult,
  AgentWorkbenchPlanSource,
  AgentWorkbenchPlanSuggestions,
  AgentWorkbenchPromptDetail,
  AgentWorkbenchPromptHistory,
  AgentWorkbenchPromptMutationResult,
  AgentWorkbenchPromptReview,
  AgentWorkbenchResourceAuthority,
  AgentWorkbenchResourceLibrary,
  AgentWorkbenchResourceMutationLedger,
  AgentWorkbenchResourceMutationReceipt,
  AgentWorkbenchResourceMutationReview,
  AgentWorkbenchResourcePolicy,
  AgentWorkbenchResourceSource,
  AgentWorkbenchReviewInbox,
  AgentWorkbenchReviewInboxCommand,
  AgentWorkbenchProjectionHealth,
  AgentWorkbenchProjectionReview,
  AgentWorkbenchProjectionReceipt,
  AgentWorkbenchVitals,
  AgentWorkbenchTopology,
  ThreadId,
  type UsageSummary,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { ProviderRegistry } from "../provider/Services/ProviderRegistry.ts";
import { ProviderSessionDirectory } from "../provider/Services/ProviderSessionDirectory.ts";
import { UsageService } from "../usage/UsageService.ts";
import { makeCurrentWeekWindow } from "@t3tools/shared/usageFormat";
import {
  AgentWorkbenchConnection,
  AgentWorkbenchConnectionError,
  makeAgentWorkbenchConnectionDependencies,
} from "./AgentWorkbenchConnection.ts";

export class AgentWorkbenchAdapterError extends Schema.TaggedError<AgentWorkbenchAdapterError>()(
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
  readonly planAssociations: (
    input: T3ConversationInput,
  ) => Effect.Effect<AgentWorkbenchPlanAssociations, AgentWorkbenchAdapterError>;
  readonly mutatePlanAssociation: (
    input: T3AssociationCommandInput,
  ) => Effect.Effect<AgentWorkbenchPlanAssociations, AgentWorkbenchAdapterError>;
  readonly suggestPlans: (
    input: T3PlanSuggestionInput,
  ) => Effect.Effect<AgentWorkbenchPlanSuggestions, AgentWorkbenchAdapterError>;
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
  readonly resourceLibrary: (input: {
    readonly lens: "global" | "effective";
    readonly project?: string;
  }) => Effect.Effect<AgentWorkbenchResourceLibrary, AgentWorkbenchAdapterError>;
  readonly reviewInbox: Effect.Effect<AgentWorkbenchReviewInbox, AgentWorkbenchAdapterError>;
  readonly reviewInboxCommand: (
    input: AgentWorkbenchReviewInboxCommand,
  ) => Effect.Effect<AgentWorkbenchReviewInbox, AgentWorkbenchAdapterError>;
  readonly projectionHealth: Effect.Effect<
    AgentWorkbenchProjectionHealth,
    AgentWorkbenchAdapterError
  >;
  readonly reviewProjection: (input: {
    readonly requestId: string;
  }) => Effect.Effect<AgentWorkbenchProjectionReview, AgentWorkbenchAdapterError>;
  readonly applyProjection: (input: {
    readonly reviewId: string;
    readonly diffDigest: string;
  }) => Effect.Effect<AgentWorkbenchProjectionReceipt, AgentWorkbenchAdapterError>;
  readonly rollbackProjection: (input: {
    readonly requestId: string;
    readonly receiptId: string;
  }) => Effect.Effect<AgentWorkbenchProjectionReceipt, AgentWorkbenchAdapterError>;
  readonly topology: Effect.Effect<typeof AgentWorkbenchTopology.Type, AgentWorkbenchAdapterError>;
  readonly audit: Effect.Effect<AgentWorkbenchReviewInbox, AgentWorkbenchAdapterError>;
  readonly reviewRelationship: (
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchResourceMutationReview, AgentWorkbenchAdapterError>;
  readonly resourceAuthority: (
    sessionId: string,
  ) => Effect.Effect<AgentWorkbenchResourceAuthority, AgentWorkbenchAdapterError>;
  readonly unlockResources: (
    sessionId: string,
    directLocal: boolean,
  ) => Effect.Effect<AgentWorkbenchResourceAuthority, AgentWorkbenchAdapterError>;
  readonly relockResources: (
    sessionId: string,
  ) => Effect.Effect<AgentWorkbenchResourceAuthority, AgentWorkbenchAdapterError>;
  readonly resourcePolicy: (
    sessionId: string,
  ) => Effect.Effect<AgentWorkbenchResourcePolicy, AgentWorkbenchAdapterError>;
  readonly resourceMutations: Effect.Effect<
    AgentWorkbenchResourceMutationLedger,
    AgentWorkbenchAdapterError
  >;
  readonly resourceSource: (
    target: AgentWorkbenchResourceTargetInput,
  ) => Effect.Effect<AgentWorkbenchResourceSource, AgentWorkbenchAdapterError>;
  readonly reviewResource: (
    sessionId: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchResourceMutationReview, AgentWorkbenchAdapterError>;
  readonly applyResource: (
    sessionId: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchResourceMutationReceipt, AgentWorkbenchAdapterError>;
  readonly rollbackResource: (
    sessionId: string,
    input: unknown,
  ) => Effect.Effect<AgentWorkbenchResourceMutationReceipt, AgentWorkbenchAdapterError>;
}

export class AgentWorkbench extends Context.Service<AgentWorkbench, AgentWorkbenchShape>()(
  "t3/agentWorkbenchAdapter/AgentWorkbench",
) {}

interface AgentWorkbenchContextDependencies {
  readonly getEnvironmentId: Effect.Effect<string>;
  readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly getHarnessAliases?: (
    threadId: string,
  ) => Effect.Effect<ReadonlyArray<{ readonly provider: string; readonly sessionId: string }>>;
  readonly getUsageAttribution?: Effect.Effect<unknown>;
}

interface T3ConversationInput {
  readonly threadId: string;
  readonly project?: string;
}

interface T3AssociationCommandInput extends T3ConversationInput {
  readonly op: "use" | "reference.add" | "reference.remove" | "unlink" | "repair";
  readonly planPath?: string;
  readonly associationId?: string;
  readonly expectedRevision?: number;
}

interface T3PlanSuggestionInput extends T3ConversationInput {
  readonly message: string;
}

interface AgentWorkbenchResourceTargetInput {
  readonly kind: "workspace" | "profile" | "skill" | "projection" | "rule" | "hook";
  readonly sourceId: string;
  readonly relativePath: string;
  readonly project?: string;
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

  const conversation = (input: T3ConversationInput) =>
    context.getEnvironmentId.pipe(
      Effect.map((environmentId) => ({
        host: "t3" as const,
        environmentId,
        conversationId: input.threadId,
        ...(input.project === undefined ? {} : { project: input.project }),
      })),
    );

  const aliases = (threadId: string) => context.getHarnessAliases?.(threadId) ?? Effect.succeed([]);

  const authorityContext = (sessionId: string) =>
    Effect.tryPromise({ try: () => connection.leaseId(), catch: mapConnectionError }).pipe(
      Effect.map((leaseId) => ({ sessionId, leaseId })),
    );

  const vitals = Effect.gen(function* () {
    if (context.getUsageAttribution !== undefined) {
      const [leaseId, usage] = yield* Effect.all([
        Effect.tryPromise({ try: () => connection.leaseId(), catch: mapConnectionError }),
        context.getUsageAttribution,
      ]);
      yield* request(Schema.Unknown, "/v1/usage-attribution", {
        method: "PUT",
        admin: true,
        body: { protocolVersion: "1.0.0", leaseId, usage },
      });
    }
    return yield* request(AgentWorkbenchVitals, "/v1/vitals");
  });

  return AgentWorkbench.of({
    listPlans: request(AgentWorkbenchPlanList, "/v1/plans"),
    vitals,
    planAssociations: (input) =>
      conversation(input).pipe(
        Effect.flatMap((value) =>
          request(
            AgentWorkbenchPlanAssociations,
            `/v1/plan-associations?${conversationQuery(value)}`,
          ),
        ),
      ),
    mutatePlanAssociation: (input) =>
      Effect.all([conversation(input), aliases(input.threadId)]).pipe(
        Effect.flatMap(([value, harnessAliases]) =>
          request(AgentWorkbenchPlanAssociations, "/v1/plan-associations/commands", {
            method: "POST",
            admin: true,
            body: AgentWorkbenchAssociationCommand.make({
              op: input.op,
              conversation: value,
              ...(input.planPath === undefined ? {} : { planPath: input.planPath }),
              ...(input.associationId === undefined ? {} : { associationId: input.associationId }),
              ...(input.expectedRevision === undefined
                ? {}
                : { expectedRevision: input.expectedRevision }),
              aliases: harnessAliases,
            }),
          }),
        ),
      ),
    suggestPlans: (input) =>
      conversation(input).pipe(
        Effect.flatMap((value) =>
          request(AgentWorkbenchPlanSuggestions, "/v1/plan-suggestions", {
            method: "POST",
            body: { conversation: value, query: input.message, project: input.project, limit: 3 },
          }),
        ),
      ),
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
    resourceLibrary: (input) =>
      Effect.tryPromise({ try: () => connection.leaseId(), catch: mapConnectionError }).pipe(
        Effect.flatMap((leaseId) => {
          const query = new URLSearchParams({ lens: input.lens, leaseId });
          if (input.project !== undefined) query.set("project", input.project);
          return request(AgentWorkbenchResourceLibrary, `/v1/library?${query}`);
        }),
      ),
    reviewInbox: request(AgentWorkbenchReviewInbox, "/v1/review-inbox"),
    reviewInboxCommand: (input) =>
      request(AgentWorkbenchReviewInbox, "/v1/review-inbox/commands", {
        method: "POST",
        admin: true,
        body: input,
      }),
    projectionHealth: request(AgentWorkbenchProjectionHealth, "/v1/projections"),
    reviewProjection: (input) =>
      request(AgentWorkbenchProjectionReview, "/v1/projections/review", {
        method: "POST",
        admin: true,
        body: input,
      }),
    applyProjection: (input) =>
      request(AgentWorkbenchProjectionReceipt, "/v1/projections/apply", {
        method: "POST",
        admin: true,
        body: input,
      }),
    rollbackProjection: (input) =>
      request(AgentWorkbenchProjectionReceipt, "/v1/projections/rollback", {
        method: "POST",
        admin: true,
        body: input,
      }),
    topology: request(AgentWorkbenchTopology, "/v1/topology"),
    audit: request(AgentWorkbenchReviewInbox, "/v1/audit", {
      method: "POST",
      admin: true,
      body: { targetId: "t3code" },
    }),
    reviewRelationship: (input) =>
      request(AgentWorkbenchResourceMutationReview, "/v1/relationships/review", {
        method: "POST",
        admin: true,
        body: input,
      }),
    resourceAuthority: (sessionId) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(
            AgentWorkbenchResourceAuthority,
            `/v1/resource-mutations/authority?${authorityQuery(authority)}`,
          ),
        ),
      ),
    unlockResources: (sessionId, directLocal) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(AgentWorkbenchResourceAuthority, "/v1/resource-mutations/authority/unlock", {
            method: "POST",
            admin: true,
            body: { ...authority, directLocal, administrative: true },
          }),
        ),
      ),
    relockResources: (sessionId) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(AgentWorkbenchResourceAuthority, "/v1/resource-mutations/authority/relock", {
            method: "POST",
            admin: true,
            body: authority,
          }),
        ),
      ),
    resourcePolicy: (sessionId) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(
            AgentWorkbenchResourcePolicy,
            `/v1/resource-mutations/policy?${authorityQuery(authority)}`,
          ),
        ),
      ),
    resourceMutations: request(AgentWorkbenchResourceMutationLedger, "/v1/resource-mutations"),
    resourceSource: (target) =>
      request(AgentWorkbenchResourceSource, `/v1/resources/source?${resourceTargetQuery(target)}`),
    reviewResource: (sessionId, input) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(AgentWorkbenchResourceMutationReview, "/v1/resource-mutations/review", {
            method: "POST",
            admin: true,
            body: { ...(input as object), authority },
          }),
        ),
      ),
    applyResource: (sessionId, input) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(AgentWorkbenchResourceMutationReceipt, "/v1/resource-mutations/apply", {
            method: "POST",
            admin: true,
            body: { ...(input as object), authority },
          }),
        ),
      ),
    rollbackResource: (sessionId, input) =>
      authorityContext(sessionId).pipe(
        Effect.flatMap((authority) =>
          request(AgentWorkbenchResourceMutationReceipt, "/v1/resource-mutations/rollback", {
            method: "POST",
            admin: true,
            body: { ...(input as object), authority },
          }),
        ),
      ),
  });
}

const make = Effect.gen(function* () {
  const environment = yield* ServerEnvironment;
  const providers = yield* ProviderRegistry;
  const sessions = yield* Effect.serviceOption(ProviderSessionDirectory);
  const usage = yield* UsageService;
  const connection = new AgentWorkbenchConnection(makeAgentWorkbenchConnectionDependencies());
  yield* Effect.addFinalizer(() => Effect.promise(() => connection.close()));
  return makeAgentWorkbench(connection, {
    getEnvironmentId: environment.getEnvironmentId,
    getProviders: providers.getProviders,
    getUsageAttribution: environment.getEnvironmentId.pipe(
      Effect.flatMap((environmentId) =>
        usage.readSummary(makeCurrentWeekWindow()).pipe(
          Effect.match({
            onFailure: () => ({
              environmentId,
              label: environmentId,
              capturedAt: "",
              usageContractVersion: 6,
              source: "host-transcript-usage" as const,
              state: "unavailable" as const,
              reason: "Transcript usage could not be read from this environment.",
              totals: { costUsd: 0, totalTokens: 0, records: 0 },
              projects: [],
              unattributed: [],
            }),
            onSuccess: (summary) => usageAttributionPayload(environmentId, summary),
          }),
        ),
      ),
    ),
    getHarnessAliases: (threadId) =>
      Option.match(sessions, {
        onNone: () => Effect.succeed([]),
        onSome: (directory) =>
          directory.getBinding(ThreadId.make(threadId)).pipe(
            Effect.map((binding) => Option.flatMap(binding, projectHarnessAlias)),
            Effect.map(Option.toArray),
            Effect.orElseSucceed(() => []),
          ),
      }),
  });
});

export const layer = Layer.effect(AgentWorkbench, make);

function usageAttributionPayload(environmentId: string, summary: UsageSummary) {
  const projects = new Map<string, { costUsd: number; totalTokens: number; records: number }>();
  const unattributed = new Map<string, { costUsd: number; totalTokens: number; records: number }>();
  const add = (
    target: Map<string, { costUsd: number; totalTokens: number; records: number }>,
    key: string,
    bucket: UsageSummary["buckets"][number],
  ) => {
    const current = target.get(key) ?? { costUsd: 0, totalTokens: 0, records: 0 };
    target.set(key, {
      costUsd: current.costUsd + bucket.costUsd,
      totalTokens:
        current.totalTokens +
        bucket.totals.uncachedInputTokens +
        bucket.totals.cachedInputTokens +
        bucket.totals.cacheCreationTokens +
        bucket.totals.outputTokens,
      records: current.records + bucket.records,
    });
  };
  for (const bucket of summary.buckets) {
    if (bucket.projectId !== null && bucket.attributionStatus === "attributed") {
      add(projects, bucket.projectId, bucket);
    } else {
      add(
        unattributed,
        bucket.attributionStatus === "attributed" ? "unknownRoot" : bucket.attributionStatus,
        bucket,
      );
    }
  }
  const projectRows = [...projects].map(([projectId, totals]) => ({
    environmentId,
    projectId,
    ...totals,
  }));
  const unattributedRows = [...unattributed].map(([status, totals]) => ({
    environmentId,
    status,
    ...totals,
  }));
  const totals = [...projectRows, ...unattributedRows].reduce(
    (result, item) => ({
      costUsd: result.costUsd + item.costUsd,
      totalTokens: result.totalTokens + item.totalTokens,
      records: result.records + item.records,
    }),
    { costUsd: 0, totalTokens: 0, records: 0 },
  );
  return {
    environmentId,
    label: environmentId,
    capturedAt: summary.readAt,
    usageContractVersion: summary.contractVersion,
    source: "host-transcript-usage" as const,
    state: "available" as const,
    totals,
    projects: projectRows,
    unattributed: unattributedRows,
  };
}

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

function conversationQuery(value: {
  readonly host: string;
  readonly environmentId?: string;
  readonly conversationId: string;
  readonly project?: string;
}) {
  const query = new URLSearchParams({ host: value.host, conversationId: value.conversationId });
  if (value.environmentId !== undefined) query.set("environmentId", value.environmentId);
  if (value.project !== undefined) query.set("project", value.project);
  return query.toString();
}

function authorityQuery(value: { readonly sessionId: string; readonly leaseId: string }) {
  return new URLSearchParams(value).toString();
}

function resourceTargetQuery(value: AgentWorkbenchResourceTargetInput) {
  const query = new URLSearchParams({
    kind: value.kind,
    sourceId: value.sourceId,
    relativePath: value.relativePath,
  });
  if (value.project !== undefined) query.set("project", value.project);
  return query.toString();
}

export function projectHarnessAlias(binding: {
  readonly provider: string;
  readonly resumeCursor?: unknown | null;
}) {
  const cursor = binding.resumeCursor;
  if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return Option.none();
  const value = cursor as Record<string, unknown>;
  const provider = binding.provider === "claudeAgent" ? "claude" : binding.provider;
  const sessionId =
    binding.provider === "codex"
      ? value["threadId"]
      : binding.provider === "claudeAgent"
        ? value["resume"]
        : binding.provider === "opencode"
          ? value["sessionId"]
          : undefined;
  return typeof sessionId === "string" && sessionId.length > 0
    ? Option.some({ provider, sessionId })
    : Option.none();
}
