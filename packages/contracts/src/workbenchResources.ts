import * as Schema from "effect/Schema";

export const WorkbenchResourceKind = Schema.Literals([
  "workspace",
  "profile",
  "skill",
  "projection",
  "rule",
  "hook",
]);
export type WorkbenchResourceKind = typeof WorkbenchResourceKind.Type;

export const WorkbenchResourceTarget = Schema.Struct({
  kind: WorkbenchResourceKind,
  sourceId: Schema.String,
  relativePath: Schema.String,
  project: Schema.optionalKey(Schema.String),
});
export type WorkbenchResourceTarget = typeof WorkbenchResourceTarget.Type;

export const WorkbenchResourceAuthority = Schema.Struct({
  state: Schema.Literals(["locked", "unlocked"]),
  reason: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  capabilities: Schema.Struct({
    review: Schema.Boolean,
    apply: Schema.Boolean,
    rollback: Schema.Boolean,
  }),
});
export type WorkbenchResourceAuthority = typeof WorkbenchResourceAuthority.Type;

export const WorkbenchResourcePolicy = Schema.Struct({
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
export type WorkbenchResourcePolicy = typeof WorkbenchResourcePolicy.Type;

export const WorkbenchResourceEntry = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["prompt", "skill", "rule", "hook", "plan"]),
  name: Schema.String,
  description: Schema.String,
  category: Schema.String,
  group: Schema.String,
  scope: Schema.Literals(["global", "project"]),
  project: Schema.NullOr(Schema.String),
  provenance: Schema.Struct({
    sourceId: Schema.String,
    sourceType: Schema.Literals(["authority", "filesystem", "github", "zip", "markdown"]),
    canonical: Schema.Boolean,
    revision: Schema.optionalKey(Schema.String),
  }),
  effective: Schema.Literals(["enabled", "disabled", "replaced", "not-applicable"]),
  reason: Schema.optionalKey(Schema.String),
  replacementId: Schema.optionalKey(Schema.String),
  relativePath: Schema.optionalKey(Schema.String),
});

export const WorkbenchResourceLibrary = Schema.Struct({
  revision: Schema.String,
  lens: Schema.Literals(["global", "effective"]),
  project: Schema.NullOr(Schema.String),
  entries: Schema.Array(WorkbenchResourceEntry),
  projects: Schema.Array(Schema.String),
});
export type WorkbenchResourceLibrary = typeof WorkbenchResourceLibrary.Type;

export const WorkbenchReviewInbox = Schema.Struct({
  revision: Schema.Number,
  items: Schema.Array(
    Schema.Struct({
      id: Schema.String,
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
    }),
  ),
});
export type WorkbenchReviewInbox = typeof WorkbenchReviewInbox.Type;

const WorkbenchValidator = Schema.Struct({
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
const WorkbenchGitState = Schema.Struct({
  head: Schema.NullOr(Schema.String),
  clean: Schema.Boolean,
  statusDigest: Schema.String,
  changedPaths: Schema.Array(Schema.String),
  requiresCheckpoint: Schema.Boolean,
});
const WorkbenchMutationClass = Schema.Literals(["metadata", "skill", "projection", "rule", "hook"]);

export const WorkbenchResourceSource = Schema.Struct({
  target: WorkbenchResourceTarget,
  content: Schema.String,
  digest: Schema.String,
  scope: Schema.Literals(["global", "project"]),
});
export type WorkbenchResourceSource = typeof WorkbenchResourceSource.Type;

const WorkbenchResourceProposal = Schema.Struct({
  id: Schema.String,
  requestId: Schema.String,
  revision: Schema.Number,
  state: Schema.Literals(["prepared", "applying", "applied", "failed"]),
  operation: Schema.Literals(["upsert", "quarantine", "hard-delete"]),
  mutationClass: WorkbenchMutationClass,
  target: WorkbenchResourceTarget,
  scope: Schema.Literals(["global", "project"]),
  beforeDigest: Schema.NullOr(Schema.String),
  afterDigest: Schema.NullOr(Schema.String),
  diff: Schema.String,
  diffDigest: Schema.String,
  validator: WorkbenchValidator,
  git: WorkbenchGitState,
  dependencies: Schema.Array(Schema.String),
  sourceReviewId: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

const WorkbenchResourceReceipt = Schema.Struct({
  id: Schema.String,
  requestId: Schema.String,
  proposalId: Schema.String,
  operation: Schema.String,
  mutationClass: WorkbenchMutationClass,
  target: WorkbenchResourceTarget,
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

export const WorkbenchResourceMutationReview = Schema.Struct({
  revision: Schema.Number,
  proposal: WorkbenchResourceProposal,
});
export type WorkbenchResourceMutationReview = typeof WorkbenchResourceMutationReview.Type;
export const WorkbenchResourceMutationLedger = Schema.Struct({
  revision: Schema.Number,
  proposals: Schema.Array(WorkbenchResourceProposal),
  receipts: Schema.Array(WorkbenchResourceReceipt),
});
export type WorkbenchResourceMutationLedger = typeof WorkbenchResourceMutationLedger.Type;
export const WorkbenchResourceMutationReceipt = Schema.Struct({
  revision: Schema.Number,
  receipt: WorkbenchResourceReceipt,
});
export type WorkbenchResourceMutationReceipt = typeof WorkbenchResourceMutationReceipt.Type;

export const WorkbenchResourceReviewInput = Schema.Struct({
  requestId: Schema.String,
  operation: Schema.Literals(["upsert", "quarantine", "hard-delete"]),
  target: WorkbenchResourceTarget,
  content: Schema.optionalKey(Schema.String),
  sourceReviewId: Schema.optionalKey(Schema.String),
  sourceFilePath: Schema.optionalKey(Schema.String),
  confirmHardDelete: Schema.optionalKey(Schema.String),
});
export type WorkbenchResourceReviewInput = typeof WorkbenchResourceReviewInput.Type;
export const WorkbenchResourceApplyInput = Schema.Struct({
  proposalId: Schema.String,
  expectedRevision: Schema.Number,
  diffDigest: Schema.String,
  checkpoint: Schema.optionalKey(Schema.String),
});
export type WorkbenchResourceApplyInput = typeof WorkbenchResourceApplyInput.Type;
export const WorkbenchResourceRollbackInput = Schema.Struct({
  requestId: Schema.String,
  receiptId: Schema.String,
  expectedDigest: Schema.NullOr(Schema.String),
});
export type WorkbenchResourceRollbackInput = typeof WorkbenchResourceRollbackInput.Type;
