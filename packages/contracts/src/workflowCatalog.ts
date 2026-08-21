/** Provider-neutral workflow-library contracts shared by server and clients. */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderDriverKind } from "./providerInstance.ts";

export const WorkflowCatalogItemId = TrimmedNonEmptyString.check(Schema.isMaxLength(256)).pipe(
  Schema.brand("WorkflowCatalogItemId"),
);
export type WorkflowCatalogItemId = typeof WorkflowCatalogItemId.Type;

export const WorkflowArgumentType = Schema.Literals([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);
export type WorkflowArgumentType = typeof WorkflowArgumentType.Type;

export const WorkflowArgument = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.NullOr(Schema.String),
  required: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  type: WorkflowArgumentType,
  defaultValue: Schema.optionalKey(Schema.Unknown),
});
export type WorkflowArgument = typeof WorkflowArgument.Type;

export const WorkflowRevision = TrimmedNonEmptyString.check(
  Schema.isPattern(/^sha256:[a-f0-9]{64}$/),
).pipe(Schema.brand("WorkflowRevision"));
export type WorkflowRevision = typeof WorkflowRevision.Type;

export const WORKFLOW_LIBRARY_MAX_PINS = 64;
export const WORKFLOW_LIBRARY_MAX_PRESETS = 64;
export const WORKFLOW_PRESET_MAX_ARGUMENTS = 32;
export const WORKFLOW_PRESET_MAX_LABEL_LENGTH = 128;
export const WORKFLOW_PRESET_MAX_VALUE_LENGTH = 16_384;

export const WorkflowPresetId = TrimmedNonEmptyString.check(Schema.isMaxLength(128)).pipe(
  Schema.brand("WorkflowPresetId"),
);
export type WorkflowPresetId = typeof WorkflowPresetId.Type;

const WorkflowPresetValues = Schema.Record(
  TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  Schema.String.check(Schema.isMaxLength(WORKFLOW_PRESET_MAX_VALUE_LENGTH)),
).check(
  Schema.makeFilter(
    (values) =>
      Object.keys(values).length <= WORKFLOW_PRESET_MAX_ARGUMENTS ||
      `Workflow presets support at most ${WORKFLOW_PRESET_MAX_ARGUMENTS} arguments.`,
  ),
);

export const WorkflowPreset = Schema.Struct({
  id: WorkflowPresetId,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(WORKFLOW_PRESET_MAX_LABEL_LENGTH)),
  itemId: WorkflowCatalogItemId,
  itemRevision: WorkflowRevision,
  values: WorkflowPresetValues,
});
export type WorkflowPreset = typeof WorkflowPreset.Type;

export const WorkflowLibraryPreferences = Schema.Struct({
  pinnedItemIds: Schema.Array(WorkflowCatalogItemId)
    .check(Schema.isMaxLength(WORKFLOW_LIBRARY_MAX_PINS))
    .pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  presets: Schema.Array(WorkflowPreset)
    .check(Schema.isMaxLength(WORKFLOW_LIBRARY_MAX_PRESETS))
    .pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type WorkflowLibraryPreferences = typeof WorkflowLibraryPreferences.Type;

export const EMPTY_WORKFLOW_LIBRARY_PREFERENCES: WorkflowLibraryPreferences = {
  pinnedItemIds: [],
  presets: [],
};

export const WorkflowLibraryPreferenceMutation = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("workflow.pin"),
    itemId: WorkflowCatalogItemId,
  }),
  Schema.Struct({
    type: Schema.Literal("workflow.unpin"),
    itemId: WorkflowCatalogItemId,
  }),
  Schema.Struct({
    type: Schema.Literal("workflow.preset.upsert"),
    preset: WorkflowPreset,
  }),
  Schema.Struct({
    type: Schema.Literal("workflow.preset.remove"),
    presetId: WorkflowPresetId,
  }),
]);
export type WorkflowLibraryPreferenceMutation = typeof WorkflowLibraryPreferenceMutation.Type;

export const WorkflowCatalogHttpBaseUrl = TrimmedNonEmptyString.check(
  Schema.isMaxLength(2_048),
  Schema.isPattern(/^https?:\/\//i),
).pipe(Schema.brand("WorkflowCatalogHttpBaseUrl"));
export type WorkflowCatalogHttpBaseUrl = typeof WorkflowCatalogHttpBaseUrl.Type;

export const WorkflowCatalogSource = Schema.Struct({
  kind: Schema.Literal("http"),
  baseUrl: WorkflowCatalogHttpBaseUrl,
});
export type WorkflowCatalogSource = typeof WorkflowCatalogSource.Type;

export const WorkflowPromptSummary = Schema.Struct({
  kind: Schema.Literal("prompt").pipe(
    Schema.withDecodingDefault(Effect.succeed("prompt" as const)),
  ),
  id: WorkflowCatalogItemId,
  name: TrimmedNonEmptyString,
  category: TrimmedNonEmptyString,
  description: Schema.String,
  arguments: Schema.Array(WorkflowArgument),
  composerInputArgument: Schema.NullOr(TrimmedNonEmptyString),
  executionType: Schema.Literals(["single", "chain"]),
  providers: Schema.Array(ProviderDriverKind).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  revision: WorkflowRevision,
});
export type WorkflowPromptSummary = typeof WorkflowPromptSummary.Type;

export const WorkflowSkillSummary = Schema.Struct({
  kind: Schema.Literal("skill"),
  id: WorkflowCatalogItemId,
  name: TrimmedNonEmptyString,
  description: Schema.NullOr(Schema.String),
  scope: Schema.NullOr(TrimmedNonEmptyString),
  sourcePath: Schema.NullOr(TrimmedNonEmptyString),
  providers: Schema.Array(ProviderDriverKind),
});
export type WorkflowSkillSummary = typeof WorkflowSkillSummary.Type;

export const WorkflowCatalogItem = Schema.Union([WorkflowPromptSummary, WorkflowSkillSummary]);
export type WorkflowCatalogItem = typeof WorkflowCatalogItem.Type;

export const WorkflowPromptDetail = Schema.Struct({
  summary: WorkflowPromptSummary,
  userMessageTemplate: Schema.String,
  systemMessage: Schema.NullOr(Schema.String),
});
export type WorkflowPromptDetail = typeof WorkflowPromptDetail.Type;

export const WorkflowCatalogCapability = Schema.Struct({
  status: Schema.Literals(["available", "misconfigured", "unavailable"]),
  sourceKind: Schema.NullOr(Schema.Literals(["http", "executable"])),
  reason: Schema.NullOr(Schema.String),
});
export type WorkflowCatalogCapability = typeof WorkflowCatalogCapability.Type;

export const WorkflowCatalogList = Schema.Struct({
  capability: WorkflowCatalogCapability,
  items: Schema.Array(WorkflowCatalogItem),
});
export type WorkflowCatalogList = typeof WorkflowCatalogList.Type;

export const WorkflowCatalogError = Schema.Struct({
  code: Schema.Literals([
    "catalog_unavailable",
    "catalog_misconfigured",
    "item_not_found",
    "invalid_catalog_response",
  ]),
  message: TrimmedNonEmptyString,
});
export type WorkflowCatalogError = typeof WorkflowCatalogError.Type;
