import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const WorkbenchPlanPath = TrimmedNonEmptyString.check(
  Schema.isMaxLength(1_024),
  Schema.isPattern(/^[^\p{Cc}]+$/u),
  Schema.isPattern(/^(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?:[^/\\]+\/)*[^/\\]+\.(?:md|markdown|mdx)$/i),
).pipe(Schema.brand("WorkbenchPlanPath"));
export type WorkbenchPlanPath = typeof WorkbenchPlanPath.Type;

export const WorkbenchPlansHttpBaseUrl = TrimmedNonEmptyString.check(
  Schema.isMaxLength(2_048),
  Schema.isPattern(/^https?:\/\//i),
).pipe(Schema.brand("WorkbenchPlansHttpBaseUrl"));

export const WorkbenchPlansSource = Schema.Struct({
  kind: Schema.Literal("http"),
  baseUrl: WorkbenchPlansHttpBaseUrl,
});
export type WorkbenchPlansSource = typeof WorkbenchPlansSource.Type;

export const WorkbenchPlanSummary = Schema.Struct({
  path: WorkbenchPlanPath,
  name: TrimmedNonEmptyString,
  directory: Schema.String,
  project: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.Literals(["active", "backlog", "done", "reference"])),
  date: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  mtimeMs: Schema.Number,
  binding: Schema.NullOr(
    Schema.Struct({
      title: Schema.NullOr(Schema.String),
      threads: Schema.Number,
      confirmed: Schema.Boolean,
      boundAt: Schema.NullOr(Schema.String),
      notesPath: Schema.NullOr(WorkbenchPlanPath),
      notesStale: Schema.Boolean,
      deviations: Schema.Number,
    }),
  ),
});
export type WorkbenchPlanSummary = typeof WorkbenchPlanSummary.Type;

export const WorkbenchPlansCapability = Schema.Struct({
  status: Schema.Literals(["available", "misconfigured", "unavailable"]),
  reason: Schema.NullOr(Schema.String),
});

export const WorkbenchPlanList = Schema.Struct({
  capability: WorkbenchPlansCapability,
  items: Schema.Array(WorkbenchPlanSummary),
});
export type WorkbenchPlanList = typeof WorkbenchPlanList.Type;

export const WorkbenchPlanSourceDocument = Schema.Struct({
  path: WorkbenchPlanPath,
  text: Schema.String,
  mtimeMs: Schema.Number,
  size: Schema.Number,
});
export type WorkbenchPlanSourceDocument = typeof WorkbenchPlanSourceDocument.Type;

export const WorkbenchPlanSaveInput = Schema.Struct({
  path: WorkbenchPlanPath,
  text: Schema.String.check(Schema.isMaxLength(2 * 1024 * 1024)),
  baseMtimeMs: Schema.Number,
});
export type WorkbenchPlanSaveInput = typeof WorkbenchPlanSaveInput.Type;

export const WorkbenchPlanSaveResult = Schema.Struct({
  path: WorkbenchPlanPath,
  mtimeMs: Schema.Number,
  size: Schema.Number,
});
export type WorkbenchPlanSaveResult = typeof WorkbenchPlanSaveResult.Type;

export const WorkbenchPlanMoveState = Schema.Literals([
  "active",
  "backlog",
  "archive",
  "reference",
]);

export const WorkbenchPlanMutationInput = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("move"),
    path: WorkbenchPlanPath,
    to: WorkbenchPlanMoveState,
  }),
  Schema.Struct({
    op: Schema.Literal("rename"),
    path: WorkbenchPlanPath,
    name: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  }),
  Schema.Struct({
    op: Schema.Literal("create"),
    project: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
    title: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
    state: WorkbenchPlanMoveState.pipe(Schema.withDecodingDefault(Effect.succeed("active"))),
  }),
]);
export type WorkbenchPlanMutationInput = typeof WorkbenchPlanMutationInput.Type;

export const WorkbenchPlanMutationResult = Schema.Struct({
  path: WorkbenchPlanPath,
});
export type WorkbenchPlanMutationResult = typeof WorkbenchPlanMutationResult.Type;

export const WorkbenchPlanAnnotation = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Schema.Literals(["comment", "delete"]),
  body: Schema.String,
  quote: Schema.String,
  heading: Schema.String,
  createdAt: Schema.String,
});
export type WorkbenchPlanAnnotation = typeof WorkbenchPlanAnnotation.Type;

export const WorkbenchPlanAnnotations = Schema.Struct({
  path: WorkbenchPlanPath,
  items: Schema.Array(WorkbenchPlanAnnotation),
  markdown: Schema.String,
});
export type WorkbenchPlanAnnotations = typeof WorkbenchPlanAnnotations.Type;

export const WorkbenchPlanAnnotationMutationInput = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("add"),
    path: WorkbenchPlanPath,
    kind: Schema.Literals(["comment", "delete"]),
    body: Schema.String.check(Schema.isMaxLength(4_000)),
    quote: Schema.String.check(Schema.isMaxLength(600)),
    heading: Schema.String.check(Schema.isMaxLength(300)),
  }),
  Schema.Struct({
    op: Schema.Literal("resolve"),
    path: WorkbenchPlanPath,
    annotationId: TrimmedNonEmptyString,
  }),
]);
export type WorkbenchPlanAnnotationMutationInput = typeof WorkbenchPlanAnnotationMutationInput.Type;

export const WorkbenchVitalsCapability = Schema.Struct({
  status: Schema.Literals(["available", "misconfigured", "unavailable"]),
  reason: Schema.NullOr(Schema.String),
});

export const WorkbenchQuotaWindow = Schema.Struct({
  provider: Schema.Literals(["claude", "codex"]),
  providerLabel: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  usedPct: Schema.Number,
  expectedPct: Schema.Number,
  secondsToReset: Schema.Number,
  exhaustsBeforeReset: Schema.Boolean,
  secondsToExhaustion: Schema.NullOr(Schema.Number),
});
export type WorkbenchQuotaWindow = typeof WorkbenchQuotaWindow.Type;

export const WorkbenchQuotaBinding = Schema.Struct({
  provider: Schema.Literals(["claude", "codex"]),
  providerLabel: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  remainingPct: Schema.Number,
  usedPct: Schema.Number,
  secondsToReset: Schema.Number,
  exhaustsBeforeReset: Schema.Boolean,
  secondsToExhaustion: Schema.NullOr(Schema.Number),
});
export type WorkbenchQuotaBinding = typeof WorkbenchQuotaBinding.Type;

/** Account quota is provider-owned; absent windows stay absent rather than being estimated. */
export const WorkbenchVitalsSnapshot = Schema.Struct({
  capability: WorkbenchVitalsCapability,
  binding: Schema.NullOr(WorkbenchQuotaBinding),
  windows: Schema.Array(WorkbenchQuotaWindow),
});
export type WorkbenchVitalsSnapshot = typeof WorkbenchVitalsSnapshot.Type;
