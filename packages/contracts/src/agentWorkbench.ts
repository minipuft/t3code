import * as Schema from "effect/Schema";

import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const AgentWorkbenchProtocolVersion = Schema.Literal("1.0.0");
export type AgentWorkbenchProtocolVersion = typeof AgentWorkbenchProtocolVersion.Type;

export const AgentWorkbenchCapabilityState = Schema.Literals([
  "available",
  "partial",
  "unavailable",
  "unsupported",
  "read-only",
]);

const AgentWorkbenchPlanSummary = Schema.Struct({
  id: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  directory: Schema.String,
  project: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  status: Schema.Literals(["active", "backlog", "done", "reference", "untriaged"]),
  revision: TrimmedNonEmptyString,
  stale: Schema.Boolean,
  readOnly: Schema.Boolean,
  updatedAt: Schema.String,
  date: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  binding: Schema.NullOr(Schema.Unknown),
});

export const AgentWorkbenchPlanList = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: TrimmedNonEmptyString,
  state: AgentWorkbenchCapabilityState,
  plans: Schema.Array(AgentWorkbenchPlanSummary),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchPlanList = typeof AgentWorkbenchPlanList.Type;

export const AgentWorkbenchPlanSource = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  path: TrimmedNonEmptyString,
  text: Schema.String,
  mtimeMs: Schema.Number,
  size: Schema.Number,
});

export const AgentWorkbenchPlanMutationResult = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  path: TrimmedNonEmptyString,
  revision: Schema.optionalKey(Schema.String),
  mtimeMs: Schema.optionalKey(Schema.Number),
  size: Schema.optionalKey(Schema.Number),
});

const AgentWorkbenchAnnotation = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literals(["comment", "delete"]),
  body: Schema.String,
  quote: Schema.String,
  heading: Schema.String,
  createdAt: Schema.String,
});

export const AgentWorkbenchPlanAnnotations = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  path: TrimmedNonEmptyString,
  items: Schema.Array(AgentWorkbenchAnnotation),
  markdown: Schema.String,
});

export const AgentWorkbenchVitals = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  capturedAt: Schema.String,
  state: AgentWorkbenchCapabilityState,
  reason: Schema.optionalKey(Schema.String),
  binding: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
  windows: Schema.Array(
    Schema.Struct({
      id: TrimmedNonEmptyString,
      label: TrimmedNonEmptyString,
      provider: Schema.optionalKey(Schema.String),
      providerLabel: Schema.optionalKey(Schema.String),
      usedPercent: Schema.NullOr(Schema.Number),
      remainingPercent: Schema.NullOr(Schema.Number),
      expectedPercent: Schema.optionalKey(Schema.NullOr(Schema.Number)),
      resetsAt: Schema.NullOr(Schema.String),
      exhaustsBeforeReset: Schema.optionalKey(Schema.Boolean),
      secondsToExhaustion: Schema.optionalKey(Schema.NullOr(Schema.Number)),
      state: Schema.Literals(["available", "stale", "unavailable"]),
    }),
  ),
});
export type AgentWorkbenchVitals = typeof AgentWorkbenchVitals.Type;

export const AgentWorkbenchCatalogEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literals(["prompt", "skill", "rule"]),
  name: TrimmedNonEmptyString,
  description: Schema.String,
  category: TrimmedNonEmptyString,
  source: TrimmedNonEmptyString,
  revision: Schema.optionalKey(Schema.String),
  available: Schema.Boolean,
  arguments: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  composerInputArgument: Schema.optionalKey(Schema.NullOr(Schema.String)),
  executionType: Schema.optionalKey(Schema.String),
  providers: Schema.optionalKey(Schema.Array(Schema.String)),
  scope: Schema.optionalKey(Schema.NullOr(Schema.String)),
  sourcePath: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export const AgentWorkbenchCatalog = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: TrimmedNonEmptyString,
  state: AgentWorkbenchCapabilityState,
  entries: Schema.Array(AgentWorkbenchCatalogEntry),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchCatalog = typeof AgentWorkbenchCatalog.Type;

export const AgentWorkbenchPromptDetail = Schema.Struct({
  state: Schema.Literals(["available", "read-only", "unavailable", "conflict", "rejected"]),
  id: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  category: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  arguments: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  composerInputArgument: Schema.optionalKey(Schema.NullOr(Schema.String)),
  executionType: Schema.optionalKey(Schema.String),
  contentRevision: Schema.optionalKey(Schema.String),
  currentVersion: Schema.optionalKey(Schema.Number),
  userMessageTemplate: Schema.optionalKey(Schema.String),
  systemMessage: Schema.optionalKey(Schema.NullOr(Schema.String)),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchPromptDetail = typeof AgentWorkbenchPromptDetail.Type;

export const AgentWorkbenchPromptRevision = Schema.Struct({
  version: NonNegativeInt,
  date: Schema.String,
  description: Schema.String,
  diff_summary: Schema.String,
});
export type AgentWorkbenchPromptRevision = typeof AgentWorkbenchPromptRevision.Type;

export const AgentWorkbenchPromptHistory = Schema.Struct({
  state: Schema.Literals(["available", "read-only", "unavailable", "conflict", "rejected"]),
  action: Schema.optionalKey(Schema.String),
  id: Schema.optionalKey(Schema.String),
  current_version: Schema.optionalKey(Schema.Number),
  versions: Schema.optionalKey(Schema.Array(AgentWorkbenchPromptRevision)),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchPromptHistory = typeof AgentWorkbenchPromptHistory.Type;

export const AgentWorkbenchPromptReview = Schema.Struct({
  state: Schema.Literals(["available", "read-only", "unavailable", "conflict", "rejected"]),
  reviewId: Schema.optionalKey(Schema.String),
  action: Schema.optionalKey(Schema.String),
  dry_run: Schema.optionalKey(Schema.Boolean),
  valid: Schema.optionalKey(Schema.Boolean),
  mutated: Schema.optionalKey(Schema.Boolean),
  has_changes: Schema.optionalKey(Schema.Boolean),
  diff: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchPromptReview = typeof AgentWorkbenchPromptReview.Type;

export const AgentWorkbenchPromptMutationResult = Schema.Struct({
  receipt: Schema.optionalKey(Schema.Unknown),
  prompt: Schema.optionalKey(AgentWorkbenchPromptDetail),
  history: Schema.optionalKey(AgentWorkbenchPromptHistory),
  state: Schema.optionalKey(
    Schema.Literals(["available", "read-only", "unavailable", "conflict", "rejected"]),
  ),
  reason: Schema.optionalKey(Schema.String),
});
export type AgentWorkbenchPromptMutationResult = typeof AgentWorkbenchPromptMutationResult.Type;

const AgentWorkbenchPromptArgumentMutation = Schema.Struct({
  name: TrimmedNonEmptyString,
  type: Schema.optionalKey(Schema.Literals(["string", "number", "boolean", "object", "array"])),
  description: Schema.optionalKey(Schema.String),
  required: Schema.optionalKey(Schema.Boolean),
  defaultValue: Schema.optionalKey(Schema.Unknown),
});

const AgentWorkbenchPromptPatch = Schema.Struct({
  field: Schema.Literals(["user_message_template", "system_message"]),
  old_string: TrimmedNonEmptyString,
  new_string: Schema.String,
  replace_all: Schema.optionalKey(Schema.Boolean),
});

export const AgentWorkbenchPromptReviewInput = Schema.Struct({
  expected_version: NonNegativeInt,
  name: Schema.optionalKey(TrimmedNonEmptyString),
  category: Schema.optionalKey(TrimmedNonEmptyString),
  description: Schema.optionalKey(Schema.String),
  user_message_template: Schema.optionalKey(Schema.String),
  system_message: Schema.optionalKey(Schema.String),
  arguments: Schema.optionalKey(Schema.Array(AgentWorkbenchPromptArgumentMutation)),
  argument_updates: Schema.optionalKey(Schema.Array(AgentWorkbenchPromptArgumentMutation)),
  composer: Schema.optionalKey(Schema.Struct({ inputArgument: TrimmedNonEmptyString })),
  chain_steps: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  gate_configuration: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  patch: Schema.optionalKey(Schema.Array(AgentWorkbenchPromptPatch)),
});
export type AgentWorkbenchPromptReviewInput = typeof AgentWorkbenchPromptReviewInput.Type;

export const AgentWorkbenchPromptApplyInput = Schema.Struct({
  ...AgentWorkbenchPromptReviewInput.fields,
  requestId: TrimmedNonEmptyString,
});
export type AgentWorkbenchPromptApplyInput = typeof AgentWorkbenchPromptApplyInput.Type;

export const AgentWorkbenchPromptRollbackInput = Schema.Struct({
  version: NonNegativeInt,
  expected_version: NonNegativeInt,
  requestId: TrimmedNonEmptyString,
});
export type AgentWorkbenchPromptRollbackInput = typeof AgentWorkbenchPromptRollbackInput.Type;
