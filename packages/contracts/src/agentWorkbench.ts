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

export const AgentWorkbenchConversationRef = Schema.Struct({
  host: TrimmedNonEmptyString,
  environmentId: Schema.optionalKey(TrimmedNonEmptyString),
  conversationId: TrimmedNonEmptyString,
  project: Schema.optionalKey(TrimmedNonEmptyString),
});
export type AgentWorkbenchConversationRef = typeof AgentWorkbenchConversationRef.Type;

export const AgentWorkbenchHarnessAlias = Schema.Struct({
  provider: TrimmedNonEmptyString,
  sessionId: TrimmedNonEmptyString,
  conversation: AgentWorkbenchConversationRef,
  observedAt: Schema.String,
});

export const AgentWorkbenchPlanAssociation = Schema.Struct({
  id: TrimmedNonEmptyString,
  conversation: AgentWorkbenchConversationRef,
  planId: TrimmedNonEmptyString,
  planPath: TrimmedNonEmptyString,
  role: Schema.Literals(["primary", "reference"]),
  state: Schema.Literals(["current", "historical", "broken", "unverified"]),
  source: Schema.Literals(["explicit", "workflow", "migration"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export const AgentWorkbenchPlanAssociations = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: NonNegativeInt,
  conversation: AgentWorkbenchConversationRef,
  primary: Schema.NullOr(AgentWorkbenchPlanAssociation),
  references: Schema.Array(AgentWorkbenchPlanAssociation),
  history: Schema.Array(AgentWorkbenchPlanAssociation),
  aliases: Schema.Array(AgentWorkbenchHarnessAlias),
});
export type AgentWorkbenchPlanAssociations = typeof AgentWorkbenchPlanAssociations.Type;

const AgentWorkbenchAssociationAliasInput = Schema.Struct({
  provider: TrimmedNonEmptyString,
  sessionId: TrimmedNonEmptyString,
});

export const AgentWorkbenchAssociationCommand = Schema.Struct({
  op: Schema.Literals([
    "use",
    "reference.add",
    "reference.remove",
    "unlink",
    "alias.add",
    "repair",
  ]),
  conversation: AgentWorkbenchConversationRef,
  planPath: Schema.optionalKey(TrimmedNonEmptyString),
  associationId: Schema.optionalKey(TrimmedNonEmptyString),
  provider: Schema.optionalKey(TrimmedNonEmptyString),
  sessionId: Schema.optionalKey(TrimmedNonEmptyString),
  source: Schema.optionalKey(Schema.Literals(["explicit", "workflow", "migration"])),
  expectedRevision: Schema.optionalKey(NonNegativeInt),
  aliases: Schema.optionalKey(Schema.Array(AgentWorkbenchAssociationAliasInput)),
});
export type AgentWorkbenchAssociationCommand = typeof AgentWorkbenchAssociationCommand.Type;

export const AgentWorkbenchPlanSuggestionInput = Schema.Struct({
  conversation: AgentWorkbenchConversationRef,
  query: Schema.String,
  project: Schema.optionalKey(TrimmedNonEmptyString),
  limit: Schema.optionalKey(NonNegativeInt),
});

export const AgentWorkbenchPlanSuggestions = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  query: Schema.String,
  suggestions: Schema.Array(
    Schema.Struct({
      planId: TrimmedNonEmptyString,
      planPath: TrimmedNonEmptyString,
      title: TrimmedNonEmptyString,
      project: TrimmedNonEmptyString,
      score: Schema.Number,
      reasons: Schema.Array(Schema.String),
    }),
  ),
});
export type AgentWorkbenchPlanSuggestions = typeof AgentWorkbenchPlanSuggestions.Type;

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

const AgentWorkbenchResourceTarget = Schema.Struct({
  kind: Schema.Literals(["workspace", "profile", "skill", "projection", "rule", "hook"]),
  sourceId: Schema.String,
  relativePath: Schema.String,
  project: Schema.optionalKey(Schema.String),
});
const AgentWorkbenchResourceProvenance = Schema.Struct({
  sourceId: Schema.String,
  sourceType: Schema.Literals(["authority", "filesystem", "github", "zip", "markdown"]),
  locator: Schema.String,
  canonical: Schema.Boolean,
  revision: Schema.optionalKey(Schema.String),
});
export const AgentWorkbenchResourceLibrary = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.String,
  lens: Schema.Literals(["global", "effective"]),
  project: Schema.NullOr(Schema.String),
  entries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.Literals(["prompt", "skill", "rule", "hook", "plan"]),
      name: Schema.String,
      description: Schema.String,
      category: Schema.String,
      group: Schema.String,
      scope: Schema.Literals(["global", "project"]),
      project: Schema.NullOr(Schema.String),
      provenance: AgentWorkbenchResourceProvenance,
      effective: Schema.Literals(["enabled", "disabled", "replaced", "not-applicable"]),
      reason: Schema.optionalKey(Schema.String),
      replacementId: Schema.optionalKey(Schema.String),
      planPath: Schema.optionalKey(Schema.String),
      relativePath: Schema.optionalKey(Schema.String),
    }),
  ),
  projects: Schema.Array(Schema.String),
});
export type AgentWorkbenchResourceLibrary = typeof AgentWorkbenchResourceLibrary.Type;
export const AgentWorkbenchReviewInbox = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.Number,
  items: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.optionalKey(Schema.Literals(["import", "relationship", "audit"])),
      source: Schema.Struct({
        type: Schema.Literals(["github", "zip", "markdown"]),
        locator: Schema.String,
        revision: Schema.optionalKey(Schema.String),
      }),
      proposedKind: Schema.Literals(["prompt", "skill", "rule", "hook", "plan"]),
      files: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          content: Schema.String,
          executable: Schema.optionalKey(Schema.Boolean),
        }),
      ),
      digest: Schema.String,
      state: Schema.Literals(["staged", "discarded", "applied"]),
      activatable: Schema.Literal(false),
      createdAt: Schema.String,
      updatedAt: Schema.String,
      warnings: Schema.Array(Schema.String),
      receiptId: Schema.optionalKey(Schema.String),
      audit: Schema.optionalKey(
        Schema.Struct({
          identity: Schema.String,
          family: Schema.Literals(["claude", "codex", "opencode"]),
          state: Schema.Literals([
            "current",
            "stale",
            "missing",
            "unsupported",
            "resolved",
            "reopened",
            "dismissed",
            "restored",
          ]),
          sourceHash: Schema.NullOr(Schema.String),
          targetHash: Schema.NullOr(Schema.String),
          reason: Schema.String,
          evidence: Schema.Array(
            Schema.Struct({ kind: Schema.String, locator: Schema.String, detail: Schema.String }),
          ),
          repairReviewId: Schema.optionalKey(Schema.String),
          updatedAt: Schema.String,
        }),
      ),
    }),
  ),
});
export type AgentWorkbenchReviewInbox = typeof AgentWorkbenchReviewInbox.Type;

export const AgentWorkbenchReviewInboxCommand = Schema.Struct({
  op: Schema.Literals(["discard", "restore", "dismiss", "reopen"]),
  id: Schema.String,
  expectedRevision: Schema.optionalKey(Schema.Number),
});
export type AgentWorkbenchReviewInboxCommand = typeof AgentWorkbenchReviewInboxCommand.Type;

const AgentWorkbenchProjectionItem = Schema.Struct({
  provider: Schema.String,
  state: Schema.String,
  sourceDigest: Schema.NullOr(Schema.String),
  targetDigest: Schema.NullOr(Schema.String),
  changedArtifacts: Schema.optionalKey(Schema.Array(Schema.String)),
});
export const AgentWorkbenchProjectionHealth = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  capturedAt: Schema.String,
  state: Schema.Literals(["current", "stale", "partial", "unavailable"]),
  items: Schema.Array(AgentWorkbenchProjectionItem),
});
export type AgentWorkbenchProjectionHealth = typeof AgentWorkbenchProjectionHealth.Type;
export const AgentWorkbenchProjectionReviewInput = Schema.Struct({ requestId: Schema.String });
export const AgentWorkbenchProjectionApplyInput = Schema.Struct({
  reviewId: Schema.String,
  diffDigest: Schema.String,
});
export const AgentWorkbenchProjectionRollbackInput = Schema.Struct({
  requestId: Schema.String,
  receiptId: Schema.String,
});
export const AgentWorkbenchProjectionReview = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  id: Schema.String,
  requestId: Schema.String,
  state: Schema.Literals(["prepared", "current"]),
  diff: Schema.String,
  diffDigest: Schema.String,
  health: AgentWorkbenchProjectionHealth,
});
export const AgentWorkbenchProjectionReceipt = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  id: Schema.String,
  requestId: Schema.String,
  reviewId: Schema.String,
  status: Schema.Literals(["applied", "rolled-back"]),
  changedArtifacts: Schema.Array(Schema.String),
  undoAvailable: Schema.Boolean,
  appliedAt: Schema.String,
  rolledBackAt: Schema.optionalKey(Schema.String),
  health: AgentWorkbenchProjectionHealth,
});
export type AgentWorkbenchProjectionReview = typeof AgentWorkbenchProjectionReview.Type;
export type AgentWorkbenchProjectionReceipt = typeof AgentWorkbenchProjectionReceipt.Type;
export const AgentWorkbenchTopology = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  nodes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      label: Schema.String,
      provenance: Schema.NullOr(Schema.String),
    }),
  ),
  approved: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.Literals([
        "project_uses_repository",
        "project_uses_resource_source",
        "resource_projects_to_target",
      ]),
      source: Schema.String,
      target: Schema.String,
      state: Schema.Literal("approved"),
    }),
  ),
  proposed: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      source: Schema.String,
      target: Schema.String,
      state: Schema.Literal("proposed"),
      evidence: Schema.Unknown,
    }),
  ),
});
export type AgentWorkbenchTopology = typeof AgentWorkbenchTopology.Type;
export const AgentWorkbenchResourceAuthority = Schema.Struct({
  state: Schema.Literals(["locked", "unlocked"]),
  reason: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  capabilities: Schema.Struct({
    review: Schema.Boolean,
    apply: Schema.Boolean,
    rollback: Schema.Boolean,
  }),
});
export type AgentWorkbenchResourceAuthority = typeof AgentWorkbenchResourceAuthority.Type;
export const AgentWorkbenchResourcePolicy = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.Number,
  enabledThrough: Schema.Literals(["metadata", "skill", "projection", "rule", "hook"]),
  stages: Schema.Array(
    Schema.Struct({
      id: Schema.Literals(["metadata", "skill", "projection", "rule", "hook"]),
      state: Schema.Literals(["available", "locked"]),
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type AgentWorkbenchResourcePolicy = typeof AgentWorkbenchResourcePolicy.Type;
const AgentWorkbenchValidator = Schema.Struct({
  id: Schema.String,
  valid: Schema.Boolean,
  errors: Schema.Array(Schema.String),
  checks: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        state: Schema.Literals(["passed", "failed"]),
        detail: Schema.String,
      }),
    ),
  ),
});
const AgentWorkbenchGitState = Schema.Struct({
  root: Schema.NullOr(Schema.String),
  head: Schema.NullOr(Schema.String),
  clean: Schema.Boolean,
  statusDigest: Schema.String,
  changedPaths: Schema.Array(Schema.String),
  requiresCheckpoint: Schema.Boolean,
});
const AgentWorkbenchMutationClass = Schema.Literals([
  "metadata",
  "skill",
  "projection",
  "rule",
  "hook",
]);
const AgentWorkbenchResourceProposal = Schema.Struct({
  id: Schema.String,
  requestId: Schema.String,
  revision: Schema.Number,
  state: Schema.Literals(["prepared", "applying", "applied", "failed"]),
  operation: Schema.Literals(["upsert", "quarantine", "hard-delete"]),
  mutationClass: AgentWorkbenchMutationClass,
  target: AgentWorkbenchResourceTarget,
  path: Schema.String,
  scope: Schema.Literals(["global", "project"]),
  beforeDigest: Schema.NullOr(Schema.String),
  afterDigest: Schema.NullOr(Schema.String),
  diff: Schema.String,
  diffDigest: Schema.String,
  validator: AgentWorkbenchValidator,
  git: AgentWorkbenchGitState,
  dependencies: Schema.Array(Schema.String),
  sourceReviewId: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
const AgentWorkbenchResourceReceipt = Schema.Struct({
  id: Schema.String,
  requestId: Schema.String,
  proposalId: Schema.String,
  operation: Schema.String,
  mutationClass: AgentWorkbenchMutationClass,
  target: AgentWorkbenchResourceTarget,
  path: Schema.String,
  scope: Schema.Literals(["global", "project"]),
  beforeDigest: Schema.NullOr(Schema.String),
  afterDigest: Schema.NullOr(Schema.String),
  diffDigest: Schema.String,
  validatorId: Schema.String,
  checkpoint: Schema.NullOr(Schema.String),
  status: Schema.Literals(["applied", "rolled-back"]),
  undoAvailable: Schema.Boolean,
  sourceReviewId: Schema.optionalKey(Schema.String),
  appliedAt: Schema.String,
  rolledBackAt: Schema.optionalKey(Schema.String),
});
export const AgentWorkbenchResourceSource = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  target: AgentWorkbenchResourceTarget,
  content: Schema.String,
  digest: Schema.String,
  scope: Schema.Literals(["global", "project"]),
});
export type AgentWorkbenchResourceSource = typeof AgentWorkbenchResourceSource.Type;
export const AgentWorkbenchResourceMutationReview = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.Number,
  proposal: AgentWorkbenchResourceProposal,
});
export type AgentWorkbenchResourceMutationReview = typeof AgentWorkbenchResourceMutationReview.Type;
export const AgentWorkbenchResourceMutationLedger = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.Number,
  proposals: Schema.Array(AgentWorkbenchResourceProposal),
  receipts: Schema.Array(AgentWorkbenchResourceReceipt),
});
export type AgentWorkbenchResourceMutationLedger = typeof AgentWorkbenchResourceMutationLedger.Type;
export const AgentWorkbenchResourceMutationReceipt = Schema.Struct({
  protocolVersion: AgentWorkbenchProtocolVersion,
  revision: Schema.Number,
  receipt: AgentWorkbenchResourceReceipt,
});
export type AgentWorkbenchResourceMutationReceipt =
  typeof AgentWorkbenchResourceMutationReceipt.Type;
