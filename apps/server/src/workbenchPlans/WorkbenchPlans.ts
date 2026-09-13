import {
  WorkbenchPlanPath,
  type AgentWorkbenchPlanAssociations,
  type AgentWorkbenchPlanSuggestions,
  type AgentWorkbenchTopology,
  type WorkbenchConversationInput,
  type WorkbenchPlanAssociationMutationInput,
  type WorkbenchPlanAssociations,
  type AgentWorkbenchPlanList,
  type AgentWorkbenchVitals,
  type AgentWorkbenchReviewInbox as RawReviewInbox,
  type AgentWorkbenchResourceLibrary as RawResourceLibrary,
  type AgentWorkbenchResourceMutationLedger as RawResourceMutationLedger,
  type AgentWorkbenchResourceMutationReceipt as RawResourceMutationReceipt,
  type AgentWorkbenchResourceMutationReview as RawResourceMutationReview,
  type AgentWorkbenchResourcePolicy as RawResourcePolicy,
  type WorkbenchPlanAnnotationMutationInput,
  type WorkbenchPlanAnnotations,
  type WorkbenchPlanList,
  type WorkbenchPlanMutationInput,
  type WorkbenchPlanMutationResult,
  type WorkbenchPlanSaveInput,
  type WorkbenchPlanSaveResult,
  type WorkbenchPlanSourceDocument,
  type WorkbenchPlanSuggestionInput,
  type WorkbenchPlanSuggestions,
  type WorkbenchPlanSummary,
  type WorkbenchQuotaWindow,
  type WorkbenchVitalsSnapshot,
  type WorkbenchResourceApplyInput,
  type WorkbenchResourceAuthority,
  type WorkbenchResourceLibrary,
  type WorkbenchResourceMutationLedger,
  type WorkbenchResourceMutationReceipt,
  type WorkbenchResourceMutationReview,
  type WorkbenchResourcePolicy,
  type WorkbenchResourceReviewInput,
  type WorkbenchResourceRollbackInput,
  type WorkbenchResourceSource,
  type WorkbenchResourceTarget,
  type WorkbenchReviewInbox,
  type WorkbenchReviewInboxCommand,
  type WorkbenchProjectionHealth,
  type WorkbenchProjectionReview,
  type WorkbenchProjectionReceipt,
  type WorkbenchTopology,
  type WorkbenchRelationshipReviewInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AgentWorkbench,
  type AgentWorkbenchAdapterError,
  type AgentWorkbenchShape,
} from "../agentWorkbenchAdapter/AgentWorkbench.ts";

export class WorkbenchPlansAdapterError extends Data.TaggedError("WorkbenchPlansAdapterError")<{
  readonly reason:
    | "request_failed"
    | "invalid_response"
    | "unsupported_version"
    | "invalid_request"
    | "not_found"
    | "conflict";
}> {}

export interface WorkbenchPlansShape {
  readonly list: Effect.Effect<WorkbenchPlanList>;
  readonly vitals: Effect.Effect<WorkbenchVitalsSnapshot>;
  readonly associations: (
    input: WorkbenchConversationInput,
  ) => Effect.Effect<WorkbenchPlanAssociations, WorkbenchPlansAdapterError>;
  readonly associate: (
    input: WorkbenchPlanAssociationMutationInput,
  ) => Effect.Effect<WorkbenchPlanAssociations, WorkbenchPlansAdapterError>;
  readonly suggest: (
    input: WorkbenchPlanSuggestionInput,
  ) => Effect.Effect<WorkbenchPlanSuggestions, WorkbenchPlansAdapterError>;
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
  readonly resourceLibrary: (input: {
    readonly lens: "global" | "effective";
    readonly project?: string;
  }) => Effect.Effect<WorkbenchResourceLibrary, WorkbenchPlansAdapterError>;
  readonly reviewInbox: Effect.Effect<WorkbenchReviewInbox, WorkbenchPlansAdapterError>;
  readonly reviewInboxCommand: (
    input: WorkbenchReviewInboxCommand,
  ) => Effect.Effect<WorkbenchReviewInbox, WorkbenchPlansAdapterError>;
  readonly projectionHealth: Effect.Effect<WorkbenchProjectionHealth, WorkbenchPlansAdapterError>;
  readonly reviewProjection: (input: {
    readonly requestId: string;
  }) => Effect.Effect<WorkbenchProjectionReview, WorkbenchPlansAdapterError>;
  readonly applyProjection: (input: {
    readonly reviewId: string;
    readonly diffDigest: string;
  }) => Effect.Effect<WorkbenchProjectionReceipt, WorkbenchPlansAdapterError>;
  readonly rollbackProjection: (input: {
    readonly requestId: string;
    readonly receiptId: string;
  }) => Effect.Effect<WorkbenchProjectionReceipt, WorkbenchPlansAdapterError>;
  readonly topology: Effect.Effect<WorkbenchTopology, WorkbenchPlansAdapterError>;
  readonly reviewRelationship: (
    input: WorkbenchRelationshipReviewInput,
  ) => Effect.Effect<WorkbenchResourceMutationReview, WorkbenchPlansAdapterError>;
  readonly resourceAuthority: (
    sessionId: string,
  ) => Effect.Effect<WorkbenchResourceAuthority, WorkbenchPlansAdapterError>;
  readonly unlockResources: (
    sessionId: string,
    directLocal: boolean,
  ) => Effect.Effect<WorkbenchResourceAuthority, WorkbenchPlansAdapterError>;
  readonly relockResources: (
    sessionId: string,
  ) => Effect.Effect<WorkbenchResourceAuthority, WorkbenchPlansAdapterError>;
  readonly resourcePolicy: (
    sessionId: string,
  ) => Effect.Effect<WorkbenchResourcePolicy, WorkbenchPlansAdapterError>;
  readonly resourceMutations: Effect.Effect<
    WorkbenchResourceMutationLedger,
    WorkbenchPlansAdapterError
  >;
  readonly resourceSource: (
    target: WorkbenchResourceTarget,
  ) => Effect.Effect<WorkbenchResourceSource, WorkbenchPlansAdapterError>;
  readonly reviewResource: (
    sessionId: string,
    input: WorkbenchResourceReviewInput,
  ) => Effect.Effect<WorkbenchResourceMutationReview, WorkbenchPlansAdapterError>;
  readonly applyResource: (
    sessionId: string,
    input: WorkbenchResourceApplyInput,
  ) => Effect.Effect<WorkbenchResourceMutationReceipt, WorkbenchPlansAdapterError>;
  readonly rollbackResource: (
    sessionId: string,
    input: WorkbenchResourceRollbackInput,
  ) => Effect.Effect<WorkbenchResourceMutationReceipt, WorkbenchPlansAdapterError>;
}

export class WorkbenchPlans extends Context.Service<WorkbenchPlans, WorkbenchPlansShape>()(
  "t3/workbenchPlans/WorkbenchPlans",
) {}

export function makeWorkbenchPlans(workbench: AgentWorkbenchShape): WorkbenchPlansShape {
  return WorkbenchPlans.of({
    list: workbench.listPlans.pipe(
      Effect.map(projectPlanList),
      Effect.orElseSucceed(() => unavailable("Agent Workbench plans are unavailable.")),
    ),
    vitals: workbench.vitals.pipe(
      Effect.map(projectVitals),
      Effect.orElseSucceed(() => ({
        capturedAt: null,
        capability: {
          status: "unavailable" as const,
          reason: "Agent Workbench vitals are unavailable.",
        },
        windows: [],
      })),
    ),
    associations: (input) =>
      workbench
        .planAssociations(input)
        .pipe(Effect.map(projectAssociations), Effect.mapError(mapAdapterError)),
    associate: (input) =>
      workbench
        .mutatePlanAssociation(input)
        .pipe(Effect.map(projectAssociations), Effect.mapError(mapAdapterError)),
    suggest: (input) =>
      workbench
        .suggestPlans(input)
        .pipe(Effect.map(projectSuggestions), Effect.mapError(mapAdapterError)),
    read: (path) =>
      workbench.readPlan(path).pipe(
        Effect.map((value) => ({
          path,
          text: value.text,
          mtimeMs: value.mtimeMs,
          size: value.size,
        })),
        Effect.mapError(mapAdapterError),
      ),
    save: (input) =>
      workbench.savePlan(input.path, { text: input.text, baseMtimeMs: input.baseMtimeMs }).pipe(
        Effect.mapError(mapAdapterError),
        Effect.flatMap((value) =>
          value.mtimeMs === undefined || value.size === undefined
            ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }))
            : Effect.succeed({ path: input.path, mtimeMs: value.mtimeMs, size: value.size }),
        ),
      ),
    mutate: (input) =>
      workbench.mutatePlan(input).pipe(
        Effect.map((value) => ({ path: WorkbenchPlanPath.make(value.path) })),
        Effect.mapError(mapAdapterError),
      ),
    readAnnotations: (path) =>
      workbench.readAnnotations(path).pipe(
        Effect.map((value) => ({ path, items: value.items, markdown: value.markdown })),
        Effect.mapError(mapAdapterError),
      ),
    mutateAnnotations: (input) =>
      workbench.mutateAnnotations(input.path, input).pipe(
        Effect.map((value) => ({ path: input.path, items: value.items, markdown: value.markdown })),
        Effect.mapError(mapAdapterError),
      ),
    resourceLibrary: (input) =>
      workbench
        .resourceLibrary(input)
        .pipe(Effect.map(projectResourceLibrary), Effect.mapError(mapAdapterError)),
    topology: workbench.topology.pipe(
      Effect.map(projectTopology),
      Effect.mapError(mapAdapterError),
    ),
    reviewRelationship: (input) =>
      workbench.reviewRelationship(input).pipe(
        Effect.map((value) => ({
          revision: value.revision,
          proposal: projectResourceProposal(value.proposal),
        })),
        Effect.mapError(mapAdapterError),
      ),
    reviewInbox: workbench.audit.pipe(
      Effect.map(projectReviewInbox),
      Effect.mapError(mapAdapterError),
    ),
    reviewInboxCommand: (input) =>
      workbench
        .reviewInboxCommand(input)
        .pipe(Effect.map(projectReviewInbox), Effect.mapError(mapAdapterError)),
    projectionHealth: workbench.projectionHealth.pipe(Effect.mapError(mapAdapterError)),
    reviewProjection: (input) =>
      workbench.reviewProjection(input).pipe(Effect.mapError(mapAdapterError)),
    applyProjection: (input) =>
      workbench.applyProjection(input).pipe(Effect.mapError(mapAdapterError)),
    rollbackProjection: (input) =>
      workbench.rollbackProjection(input).pipe(Effect.mapError(mapAdapterError)),
    resourceAuthority: (sessionId) =>
      workbench.resourceAuthority(sessionId).pipe(Effect.mapError(mapAdapterError)),
    unlockResources: (sessionId, directLocal) =>
      workbench.unlockResources(sessionId, directLocal).pipe(Effect.mapError(mapAdapterError)),
    relockResources: (sessionId) =>
      workbench.relockResources(sessionId).pipe(Effect.mapError(mapAdapterError)),
    resourcePolicy: (sessionId) =>
      workbench
        .resourcePolicy(sessionId)
        .pipe(Effect.map(projectResourcePolicy), Effect.mapError(mapAdapterError)),
    resourceMutations: workbench.resourceMutations.pipe(
      Effect.map(projectResourceLedger),
      Effect.mapError(mapAdapterError),
    ),
    resourceSource: (target) =>
      workbench.resourceSource(target).pipe(
        Effect.map((value) => ({
          target: value.target,
          content: value.content,
          digest: value.digest,
          scope: value.scope,
        })),
        Effect.mapError(mapAdapterError),
      ),
    reviewResource: (sessionId, input) =>
      workbench.reviewResource(sessionId, input).pipe(
        Effect.map((value) => ({
          revision: value.revision,
          proposal: projectResourceProposal(value.proposal),
        })),
        Effect.mapError(mapAdapterError),
      ),
    applyResource: (sessionId, input) =>
      workbench.applyResource(sessionId, input).pipe(
        Effect.map((value) => ({
          revision: value.revision,
          receipt: projectResourceReceipt(value.receipt),
        })),
        Effect.mapError(mapAdapterError),
      ),
    rollbackResource: (sessionId, input) =>
      workbench.rollbackResource(sessionId, input).pipe(
        Effect.map((value) => ({
          revision: value.revision,
          receipt: projectResourceReceipt(value.receipt),
        })),
        Effect.mapError(mapAdapterError),
      ),
  });
}

export function projectResourceLibrary(value: RawResourceLibrary): WorkbenchResourceLibrary {
  return {
    revision: value.revision,
    lens: value.lens,
    project: value.project,
    entries: value.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      group: entry.group,
      scope: entry.scope,
      project: entry.project,
      provenance: {
        sourceId: entry.provenance.sourceId,
        sourceType: entry.provenance.sourceType,
        canonical: entry.provenance.canonical,
        ...(entry.provenance.revision === undefined ? {} : { revision: entry.provenance.revision }),
      },
      effective: entry.effective,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      ...(entry.replacementId === undefined ? {} : { replacementId: entry.replacementId }),
      ...(entry.relativePath === undefined ? {} : { relativePath: entry.relativePath }),
    })),
    projects: [...value.projects],
  };
}

export function projectTopology(value: AgentWorkbenchTopology): WorkbenchTopology {
  return {
    protocolVersion: value.protocolVersion,
    nodes: value.nodes.map((node) => ({
      ...node,
      provenance: redactTopologyProvenance(node.provenance),
    })),
    approved: value.approved,
    proposed: value.proposed.map((edge) => ({
      ...edge,
      evidence: redactTopologyEvidence(edge.evidence),
    })),
  };
}

/**
 * The agent workbench is a host-local authority. Its audit findings may name
 * files or include diagnostics copied from provider configuration, so project
 * the small browser-safe finding shape here rather than teaching the UI about
 * host data.
 */
export function projectReviewInbox(value: RawReviewInbox): WorkbenchReviewInbox {
  return {
    revision: value.revision,
    items: value.items.map(projectReviewInboxItem),
  };
}

function projectReviewInboxItem(
  item: RawReviewInbox["items"][number],
): WorkbenchReviewInbox["items"][number] {
  return {
    id: item.id,
    ...(item.kind === undefined ? {} : { kind: item.kind }),
    source: {
      type: item.source.type,
      locator: redactAuditText(item.source.locator),
      ...(item.source.revision === undefined
        ? {}
        : { revision: redactAuditText(item.source.revision) }),
    },
    proposedKind: item.proposedKind,
    files: item.files.map((file) => ({
      path: redactAuditText(file.path),
      content: redactAuditText(file.content),
      ...(file.executable === undefined ? {} : { executable: file.executable }),
    })),
    digest: item.digest,
    state: item.state,
    activatable: false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    warnings: item.warnings.map(redactAuditText),
    ...(item.receiptId === undefined ? {} : { receiptId: item.receiptId }),
    ...(item.audit === undefined ? {} : { audit: projectAuditFinding(item.audit) }),
  };
}

function projectAuditFinding(audit: NonNullable<RawReviewInbox["items"][number]["audit"]>) {
  return {
    identity: audit.identity,
    family: audit.family,
    state: audit.state,
    sourceHash: audit.sourceHash,
    targetHash: audit.targetHash,
    reason: redactAuditText(audit.reason),
    evidence: audit.evidence.map((evidence) => ({
      kind: redactAuditText(evidence.kind),
      locator: redactAuditText(evidence.locator),
      detail: redactAuditText(evidence.detail),
    })),
    ...(audit.repairReviewId === undefined ? {} : { repairReviewId: audit.repairReviewId }),
    updatedAt: audit.updatedAt,
  };
}

const ABSOLUTE_PATH_PATTERNS = [
  /file:(?:\/\/)?[^\s'"`)}\],;]+/gi,
  /(?:^|[\s("'=,{])~[\\/][^\s'"`)}\],;]*/g,
  /(?:^|[\s("'=,{])[a-z]:[\\/][^\s'"`)}\],;]*/gi,
  /(?:^|[\s("'=,{])\\\\[^\s'"`)}\],;]*/g,
  /(?:^|[\s("'=,{])\/(?:[^\s'"`)}\],;]*)/g,
] as const;

const CREDENTIAL_VALUE_PATTERN =
  /(?:bearer\s+\S+|(?:authorization|token|secret|password|credential|api[_-]?key|access[_-]?key|private[_-]?key)\s*(?:=|:)\s*(?:bearer\s+)?\S+)/gi;

function redactAuditText(value: string): string {
  const withoutPaths = ABSOLUTE_PATH_PATTERNS.reduce((text, pattern) => {
    return text.replace(pattern, (match) => {
      const prefix = /^[\s("'=,{]/.test(match) ? match[0] : "";
      return `${prefix}[path redacted]`;
    });
  }, value);
  return withoutPaths.replace(CREDENTIAL_VALUE_PATTERN, "[redacted]");
}

function redactTopologyProvenance(value: string | null) {
  if (value === null) return null;
  return /^(?:\/|\\\\|[a-z]:[\\/]|file:|~[\\/])/i.test(value.trim()) ? null : value;
}

function redactTopologyEvidence(value: unknown, key = ""): unknown {
  if (/(?:authorization|token|secret|password|api[_-]?key)/i.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (/^(?:\/|\\\\|[a-z]:[\\/]|file:|~[\\/])/i.test(value.trim())) return "[path redacted]";
    if (/(?:bearer\s+\S+|(?:token|secret|password|api[_-]?key)=\S+)/i.test(value)) {
      return "[redacted]";
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactTopologyEvidence(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, item]) => [
        entryKey,
        redactTopologyEvidence(item, entryKey),
      ]),
    );
  }
  return value;
}

function projectResourcePolicy(value: RawResourcePolicy): WorkbenchResourcePolicy {
  return { revision: value.revision, enabledThrough: value.enabledThrough, stages: value.stages };
}

function redactDependency(value: string) {
  return value.split(/[\\/]/).at(-1) ?? "registered dependency";
}

function projectResourceProposal(
  value: RawResourceMutationReview["proposal"] | RawResourceMutationLedger["proposals"][number],
): WorkbenchResourceMutationReview["proposal"] {
  return {
    id: value.id,
    requestId: value.requestId,
    revision: value.revision,
    state: value.state,
    operation: value.operation,
    mutationClass: value.mutationClass,
    target: value.target,
    scope: value.scope,
    beforeDigest: value.beforeDigest,
    afterDigest: value.afterDigest,
    diff: value.diff,
    diffDigest: value.diffDigest,
    validator: value.validator,
    git: {
      head: value.git.head,
      clean: value.git.clean,
      statusDigest: value.git.statusDigest,
      changedPaths: value.git.changedPaths,
      requiresCheckpoint: value.git.requiresCheckpoint,
    },
    dependencies: value.dependencies.map(redactDependency),
    ...(value.sourceReviewId === undefined ? {} : { sourceReviewId: value.sourceReviewId }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function projectResourceReceipt(
  value: RawResourceMutationReceipt["receipt"] | RawResourceMutationLedger["receipts"][number],
): WorkbenchResourceMutationReceipt["receipt"] {
  return {
    id: value.id,
    requestId: value.requestId,
    proposalId: value.proposalId,
    operation: value.operation,
    mutationClass: value.mutationClass,
    target: value.target,
    scope: value.scope,
    beforeDigest: value.beforeDigest,
    afterDigest: value.afterDigest,
    diffDigest: value.diffDigest,
    validatorId: value.validatorId,
    checkpoint: value.checkpoint,
    status: value.status,
    undoAvailable: value.undoAvailable,
    ...(value.sourceReviewId === undefined ? {} : { sourceReviewId: value.sourceReviewId }),
    appliedAt: value.appliedAt,
    ...(value.rolledBackAt === undefined ? {} : { rolledBackAt: value.rolledBackAt }),
  };
}

export function projectResourceLedger(
  value: RawResourceMutationLedger,
): WorkbenchResourceMutationLedger {
  return {
    revision: value.revision,
    proposals: value.proposals.map(projectResourceProposal),
    receipts: value.receipts.map(projectResourceReceipt),
  };
}

export function projectPlanList(value: AgentWorkbenchPlanList): WorkbenchPlanList {
  const items = value.plans.flatMap((plan): ReadonlyArray<WorkbenchPlanSummary> => {
    try {
      return [
        {
          path: WorkbenchPlanPath.make(plan.path),
          name: plan.name,
          directory: plan.directory,
          project: plan.project,
          status: plan.status === "untriaged" ? null : plan.status,
          date: plan.date,
          tags: [...plan.tags],
          mtimeMs: Date.parse(plan.updatedAt),
          binding: projectBinding(plan.binding),
        },
      ];
    } catch {
      return [];
    }
  });
  return {
    capability: {
      status:
        value.state === "unavailable" || value.state === "unsupported"
          ? "unavailable"
          : "available",
      reason: value.reason ?? null,
    },
    items: [...new Map(items.map((item) => [item.path, item])).values()],
  };
}

export function projectVitals(value: AgentWorkbenchVitals): WorkbenchVitalsSnapshot {
  const windows = value.windows.flatMap((window): ReadonlyArray<WorkbenchQuotaWindow> => {
    if (window.provider !== "claude" && window.provider !== "codex") return [];
    return [
      {
        id: window.id,
        provider: window.provider,
        providerInstanceId: window.providerInstanceId ?? window.provider,
        providerLabel: window.providerLabel ?? window.provider,
        label: window.label,
        usedPercent: window.usedPercent,
        remainingPercent: window.remainingPercent,
        resetsAt: window.resetsAt,
        observedAt: window.observedAt,
        source: window.source,
        state: window.state,
      },
    ];
  });
  const partial =
    value.state === "partial" || windows.some((window) => window.state !== "available");
  return {
    capturedAt: value.capturedAt,
    capability: {
      status:
        value.state === "unavailable" || value.state === "unsupported"
          ? "unavailable"
          : partial
            ? "partial"
            : "available",
      reason:
        value.reason ??
        (windows.length === 0
          ? "No provider quota is currently reported."
          : partial
            ? "One or more provider quota observations are stale or unavailable."
            : null),
    },
    windows,
  };
}

export function projectAssociations(
  value: AgentWorkbenchPlanAssociations,
): WorkbenchPlanAssociations {
  const project = (item: NonNullable<AgentWorkbenchPlanAssociations["primary"]>) => ({
    id: item.id,
    planPath: WorkbenchPlanPath.make(item.planPath),
    role: item.role,
    state: item.state,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
  return {
    revision: value.revision,
    primary: value.primary === null ? null : project(value.primary),
    references: value.references.map(project),
    history: value.history.map(project),
  };
}

export function projectSuggestions(value: AgentWorkbenchPlanSuggestions): WorkbenchPlanSuggestions {
  return {
    query: value.query,
    items: value.suggestions.map((item) => ({
      path: WorkbenchPlanPath.make(item.planPath),
      title: item.title,
      project: item.project,
      score: item.score,
      reasons: [...item.reasons],
    })),
  };
}

export const layer = Layer.effect(
  WorkbenchPlans,
  Effect.gen(function* () {
    return makeWorkbenchPlans(yield* AgentWorkbench);
  }),
);

function unavailable(reason: string): WorkbenchPlanList {
  return { capability: { status: "unavailable", reason }, items: [] };
}

function projectBinding(value: unknown): WorkbenchPlanSummary["binding"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  try {
    return {
      title: typeof binding["planTitle"] === "string" ? binding["planTitle"] : null,
      threads: typeof binding["threads"] === "number" ? binding["threads"] : 1,
      confirmed: binding["confirmed"] === true,
      boundAt: typeof binding["bound_at"] === "string" ? binding["bound_at"] : null,
      notesPath:
        typeof binding["notesRel"] === "string"
          ? WorkbenchPlanPath.make(binding["notesRel"])
          : null,
      notesStale: binding["notesStale"] === true,
      deviations: typeof binding["deviations"] === "number" ? binding["deviations"] : 0,
    };
  } catch {
    return null;
  }
}

function mapAdapterError(error: AgentWorkbenchAdapterError) {
  switch (error.reason) {
    case "not_found":
      return new WorkbenchPlansAdapterError({ reason: "not_found" });
    case "conflict":
      return new WorkbenchPlansAdapterError({ reason: "conflict" });
    case "invalid_response":
      return new WorkbenchPlansAdapterError({ reason: "invalid_response" });
    case "unsupported_version":
      return new WorkbenchPlansAdapterError({ reason: "unsupported_version" });
    case "forbidden":
    case "unauthorized":
      return new WorkbenchPlansAdapterError({ reason: "invalid_request" });
    default:
      return new WorkbenchPlansAdapterError({ reason: "request_failed" });
  }
}
