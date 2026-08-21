import {
  ProviderDriverKind,
  WorkflowCatalogItemId,
  WorkflowPresetId,
  WorkflowRevision,
  type WorkflowPromptSummary,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkflowInvocation,
  planWorkflowInsertion,
  projectWorkflowLibrary,
  searchWorkflowCatalog,
  shouldShowWorkflowActions,
} from "./workflowInvocation";

const prompt: WorkflowPromptSummary = {
  kind: "prompt",
  id: WorkflowCatalogItemId.make("strategicImplement"),
  name: "Strategic implementation",
  category: "development",
  description: "Implement an approved plan",
  arguments: [
    { name: "task", description: null, required: true, type: "string" },
    { name: "attempts", description: null, required: false, type: "number" },
    { name: "options", description: null, required: false, type: "object" },
  ],
  composerInputArgument: "task",
  executionType: "single",
  providers: [ProviderDriverKind.make("codex")],
  revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
};

const skill = {
  kind: "skill" as const,
  id: WorkflowCatalogItemId.make("skill:review"),
  name: "review-follow-up",
  description: "Resolve review feedback",
  scope: "personal",
  sourcePath: "/skills/review/SKILL.md",
  providers: [ProviderDriverKind.make("claude")],
};

describe("searchWorkflowCatalog", () => {
  it("searches prompt metadata and skill scope", () => {
    expect(searchWorkflowCatalog([prompt, skill], "approved")).toEqual([prompt]);
    expect(searchWorkflowCatalog([prompt, skill], "personal review")).toEqual([skill]);
  });
});

describe("shouldShowWorkflowActions", () => {
  it("hides a wholly unavailable catalog but preserves usable provider skills", () => {
    expect(
      shouldShowWorkflowActions({
        capability: { status: "unavailable", sourceKind: "http", reason: "offline" },
        items: [],
      }),
    ).toBe(false);
    expect(
      shouldShowWorkflowActions({
        capability: { status: "unavailable", sourceKind: "http", reason: "offline" },
        items: [skill],
      }),
    ).toBe(true);
  });
});

describe("projectWorkflowLibrary", () => {
  it("projects live sections without duplicating item rows and preserves named preset actions", () => {
    const projection = projectWorkflowLibrary({
      items: [prompt, skill],
      preferences: {
        pinnedItemIds: [prompt.id],
        presets: [
          {
            id: WorkflowPresetId.make("preset-1"),
            label: "Ship carefully",
            itemId: prompt.id,
            itemRevision: prompt.revision,
            values: { attempts: "3" },
          },
        ],
      },
      recentItemIds: [prompt.id, skill.id],
    });

    expect(projection.pinned).toEqual([prompt]);
    expect(projection.presets).toEqual([
      { item: prompt, preset: expect.objectContaining({ label: "Ship carefully" }) },
    ]);
    expect(projection.recent).toEqual([skill]);
    expect(projection.all).toEqual([]);
    expect(projection.staleReferenceCount).toBe(0);
  });

  it("omits stale references from actions while reporting them without changing storage", () => {
    const staleId = WorkflowCatalogItemId.make("missing");
    const preferences = {
      pinnedItemIds: [staleId],
      presets: [
        {
          id: WorkflowPresetId.make("stale-preset"),
          label: "Missing preset",
          itemId: staleId,
          itemRevision: prompt.revision,
          values: {},
        },
      ],
    };
    const projection = projectWorkflowLibrary({
      items: [prompt],
      preferences,
      recentItemIds: [staleId],
    });

    expect(projection.pinned).toEqual([]);
    expect(projection.presets).toEqual([]);
    expect(projection.recent).toEqual([]);
    expect(projection.all).toEqual([prompt]);
    expect(projection.staleReferenceCount).toBe(3);
    expect(preferences.pinnedItemIds).toEqual([staleId]);
  });
});

describe("buildWorkflowInvocation", () => {
  it("maps draft text only to the declared composer argument", () => {
    const result = buildWorkflowInvocation({
      item: prompt,
      draftText: 'Ship the "catalog" safely',
      values: { attempts: "3" },
    });

    expect(result.text).toContain('>>strategicImplement task:"Ship the \\"catalog\\" safely"');
    expect(result.text).toContain("attempts:3");
    expect(result.text).toContain("Infer omitted workflow arguments (options)");
    expect(result.errors).toEqual({});
  });

  it("treats a whitespace-only mapped field as blank and uses the draft", () => {
    const result = buildWorkflowInvocation({
      item: prompt,
      draftText: "Implement it",
      values: { task: "   " },
    });
    expect(result.text).toContain('task:"Implement it"');
  });

  it("keeps omissions visible and does not fabricate required values", () => {
    const result = buildWorkflowInvocation({ item: prompt, draftText: "", values: {} });
    expect(result.text).toBe(
      ">>strategicImplement\n\nInfer omitted workflow arguments (task, attempts, options) from the draft and thread context; ask only when inference fails.",
    );
  });

  it("rejects invalid typed values before insertion", () => {
    const result = buildWorkflowInvocation({
      item: prompt,
      draftText: "Implement it",
      values: { attempts: "many", options: "[]" },
    });
    expect(result.errors).toEqual({
      attempts: "Enter a finite number.",
      options: "Enter a JSON object.",
    });
  });

  it("preserves provider skill invocation syntax", () => {
    expect(buildWorkflowInvocation({ item: skill, draftText: "", values: {} }).text).toBe(
      "$review-follow-up",
    );
  });
});

describe("planWorkflowInsertion", () => {
  it("replaces a mapped draft instead of duplicating it", () => {
    expect(
      planWorkflowInsertion({
        item: prompt,
        invocation: '>>strategicImplement task:"Implement it"',
        draftText: "Implement it >strategic",
        cursor: 23,
        triggerRange: { start: 13, end: 23 },
      }),
    ).toEqual({
      rangeStart: 0,
      rangeEnd: 23,
      replacement: '>>strategicImplement task:"Implement it"',
      expectedText: "Implement it >strategic",
    });
  });

  it("replaces only a skill trigger and preserves surrounding boundaries", () => {
    expect(
      planWorkflowInsertion({
        item: skill,
        invocation: "$review-follow-up",
        draftText: "Use >rev next",
        cursor: 8,
        triggerRange: { start: 4, end: 8 },
      }),
    ).toEqual({
      rangeStart: 4,
      rangeEnd: 8,
      replacement: "$review-follow-up",
      expectedText: ">rev",
    });
  });

  it("adds boundaries when inserting from the Actions button mid-word", () => {
    expect(
      planWorkflowInsertion({
        item: skill,
        invocation: "$review-follow-up",
        draftText: "leftright",
        cursor: 4,
        triggerRange: null,
      }).replacement,
    ).toBe(" $review-follow-up ");
  });
});
