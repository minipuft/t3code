import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  WORKFLOW_LIBRARY_MAX_PINS,
  WORKFLOW_PRESET_MAX_ARGUMENTS,
  WORKFLOW_PRESET_MAX_VALUE_LENGTH,
  WorkflowCatalogCapability,
  WorkflowCatalogList,
  WorkflowCatalogSource,
  WorkflowCatalogError,
  WorkflowPromptDetail,
  WorkflowPromptSummary,
  WorkflowLibraryPreferenceMutation,
  WorkflowLibraryPreferences,
} from "./workflowCatalog.ts";

const summary = {
  id: "strategicImplement",
  name: "Strategic Implementation",
  category: "development",
  description: "Implement a planned change",
  arguments: [
    {
      name: "task",
      description: "What to implement",
      required: true,
      type: "string",
    },
  ],
  composerInputArgument: "task",
  executionType: "single",
  revision: `sha256:${"a".repeat(64)}`,
};

const decodeWorkflowPromptSummary = Schema.decodeUnknownSync(WorkflowPromptSummary);
const decodeWorkflowPromptDetail = Schema.decodeUnknownSync(WorkflowPromptDetail);
const decodeWorkflowCatalogCapability = Schema.decodeUnknownSync(WorkflowCatalogCapability);
const decodeWorkflowCatalogList = Schema.decodeUnknownSync(WorkflowCatalogList);
const decodeWorkflowCatalogSource = Schema.decodeUnknownSync(WorkflowCatalogSource);
const decodeWorkflowCatalogError = Schema.decodeUnknownSync(WorkflowCatalogError);
const decodeWorkflowLibraryPreferences = Schema.decodeUnknownSync(WorkflowLibraryPreferences);
const decodeWorkflowLibraryPreferenceMutation = Schema.decodeUnknownSync(
  WorkflowLibraryPreferenceMutation,
);

describe("workflow catalog contracts", () => {
  it("decodes a prompt summary and defaults provider availability", () => {
    const decoded = decodeWorkflowPromptSummary(summary);

    expect(decoded.providers).toEqual([]);
    expect(decoded.kind).toBe("prompt");
    expect(decoded.composerInputArgument).toBe("task");
  });

  it("decodes HTTP source configuration and rejects unsupported or non-http sources", () => {
    expect(decodeWorkflowCatalogSource({ kind: "http", baseUrl: "http://127.0.0.1:4317" })).toEqual(
      { kind: "http", baseUrl: "http://127.0.0.1:4317" },
    );
    expect(() =>
      decodeWorkflowCatalogSource({ kind: "executable", baseUrl: "http://localhost" }),
    ).toThrow();
    expect(() => decodeWorkflowCatalogSource({ kind: "http", baseUrl: "file:///tmp" })).toThrow();
  });

  it("decodes one list containing prompts and provider skills", () => {
    const decoded = decodeWorkflowCatalogList({
      capability: { status: "available", sourceKind: "http", reason: null },
      items: [
        summary,
        {
          kind: "skill",
          id: "skill:review",
          name: "review",
          description: "Review a change",
          scope: "user",
          sourcePath: "/home/user/.agents/skills/review/SKILL.md",
          providers: ["codex", "claude"],
        },
      ],
    });

    expect(decoded.items.map((item) => item.kind)).toEqual(["prompt", "skill"]);
  });

  it("decodes prompt detail separately from list metadata", () => {
    const decoded = decodeWorkflowPromptDetail({
      summary,
      userMessageTemplate: "Implement {{ task }}",
      systemMessage: null,
    });

    expect(decoded.userMessageTemplate).toContain("{{ task }}");
  });

  it.each(["available", "misconfigured", "unavailable"] as const)(
    "decodes the %s capability state",
    (status) => {
      expect(
        decodeWorkflowCatalogCapability({
          status,
          sourceKind: status === "available" ? "http" : null,
          reason: status === "available" ? null : "Configure a catalog source",
        }).status,
      ).toBe(status);
    },
  );

  it("rejects invalid argument and capability vocabulary", () => {
    expect(() =>
      decodeWorkflowPromptSummary({
        ...summary,
        arguments: [{ ...summary.arguments[0], type: "text" }],
      }),
    ).toThrow();
    expect(() =>
      decodeWorkflowCatalogCapability({
        status: "ready",
        sourceKind: null,
        reason: null,
      }),
    ).toThrow();
    expect(() => decodeWorkflowPromptSummary({ ...summary, providers: [""] })).toThrow();
    expect(() => decodeWorkflowPromptSummary({ ...summary, revision: "latest" })).toThrow();
    expect(() =>
      decodeWorkflowCatalogCapability({
        status: "available",
        sourceKind: "filesystem",
        reason: null,
      }),
    ).toThrow();
  });

  it("decodes typed catalog errors", () => {
    expect(
      decodeWorkflowCatalogError({
        code: "item_not_found",
        message: "Prompt not found",
      }).code,
    ).toBe("item_not_found");
  });

  it("decodes bounded pins and explicit prompt preset values", () => {
    const preset = {
      id: "preset-1",
      label: "Implement this plan",
      itemId: "strategicImplement",
      itemRevision: summary.revision,
      values: { task: "Implement the approved plan" },
    };
    expect(
      decodeWorkflowLibraryPreferences({
        pinnedItemIds: ["strategicImplement"],
        presets: [preset],
      }),
    ).toEqual({ pinnedItemIds: ["strategicImplement"], presets: [preset] });
    expect(
      decodeWorkflowLibraryPreferenceMutation({
        type: "workflow.preset.upsert",
        preset,
      }).type,
    ).toBe("workflow.preset.upsert");
  });

  it("rejects oversized workflow preference collections and preset content", () => {
    expect(() =>
      decodeWorkflowLibraryPreferences({
        pinnedItemIds: Array.from(
          { length: WORKFLOW_LIBRARY_MAX_PINS + 1 },
          (_, index) => `workflow-${index}`,
        ),
        presets: [],
      }),
    ).toThrow();
    expect(() =>
      decodeWorkflowLibraryPreferences({
        pinnedItemIds: [],
        presets: [
          {
            id: "preset-1",
            label: "Too many values",
            itemId: "strategicImplement",
            itemRevision: summary.revision,
            values: Object.fromEntries(
              Array.from({ length: WORKFLOW_PRESET_MAX_ARGUMENTS + 1 }, (_, index) => [
                `argument-${index}`,
                "value",
              ]),
            ),
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      decodeWorkflowLibraryPreferences({
        pinnedItemIds: [],
        presets: [
          {
            id: "preset-1",
            label: "Oversized value",
            itemId: "strategicImplement",
            itemRevision: summary.revision,
            values: { task: "x".repeat(WORKFLOW_PRESET_MAX_VALUE_LENGTH + 1) },
          },
        ],
      }),
    ).toThrow();
  });
});
