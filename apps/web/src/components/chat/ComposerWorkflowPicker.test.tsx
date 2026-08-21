import {
  WorkflowCatalogItemId,
  WorkflowPresetId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vite-plus/test";

import { ComposerWorkflowPicker } from "./ComposerWorkflowPicker";
import { projectWorkflowLibrary } from "../../workflowInvocation";

const catalog: WorkflowCatalogList = {
  capability: { status: "available", sourceKind: "http", reason: null },
  items: [
    {
      kind: "prompt",
      id: WorkflowCatalogItemId.make("strategicImplement"),
      name: "Strategic implementation",
      category: "development",
      description: "Implement an approved plan",
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
      providers: [],
      revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
    },
    {
      kind: "skill",
      id: WorkflowCatalogItemId.make("skill:review"),
      name: "review-follow-up",
      description: "Resolve review feedback",
      scope: "personal",
      sourcePath: "/skills/review/SKILL.md",
      providers: [],
    },
  ],
};

const library = projectWorkflowLibrary({
  items: catalog.items,
  preferences: { pinnedItemIds: [], presets: [] },
  recentItemIds: [],
});

const renderPicker = (overrides: Partial<ComponentProps<typeof ComposerWorkflowPicker>> = {}) =>
  renderToStaticMarkup(
    <ComposerWorkflowPicker
      catalog={catalog}
      library={library}
      canMutatePreferences
      error={null}
      isPending={false}
      draftText="Implement the library"
      onRefresh={() => {}}
      onClose={() => {}}
      onTogglePin={() => {}}
      onSavePreset={() => null}
      onRemovePreset={() => {}}
      onInsert={() => {}}
      {...overrides}
    />,
  );

describe("ComposerWorkflowPicker", () => {
  it("renders one attached library with prompt and skill kinds", () => {
    const markup = renderPicker();
    expect(markup).toContain('data-composer-workflow-picker="true"');
    expect(markup).toContain("Strategic implementation");
    expect(markup).toContain("review-follow-up");
    expect(markup).toContain(">prompt<");
    expect(markup).toContain(">skill<");
    expect(markup).toContain("All");
  });

  it("renders progressive prompt arguments and a non-submit Insert button", () => {
    const markup = renderPicker({ initialSelectedItemId: "strategicImplement" });
    expect(markup).toContain("Arguments");
    expect(markup).toContain("task · required");
    expect(markup).toContain("Uses the current draft when blank");
    expect(markup).toContain("Named preset");
    expect(markup).toContain("Save preset");
    expect(markup).toContain('<button type="button"');
    expect(markup).toContain(">Insert</button>");
  });

  it("renders pinned, preset, recent, and stale-reference semantics", () => {
    const preset = {
      id: WorkflowPresetId.make("preset-1"),
      label: "Careful rollout",
      itemId: catalog.items[0]!.id,
      itemRevision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
      values: { task: "Roll out carefully" },
    };
    const markup = renderPicker({
      library: {
        pinned: [catalog.items[0]!],
        presets: [{ preset, item: catalog.items[0]! }],
        recent: [catalog.items[1]!],
        all: [],
        staleReferenceCount: 2,
      },
    });
    expect(markup).toContain("Pinned");
    expect(markup).toContain("Presets");
    expect(markup).toContain("Recent");
    expect(markup).toContain("Careful rollout");
    expect(markup).toContain("2 saved actions are currently unavailable");
    expect(markup).toContain('aria-label="Unpin Strategic implementation"');
  });

  it("hides preference controls against an older server capability", () => {
    const markup = renderPicker({ canMutatePreferences: false });
    expect(markup).not.toContain('aria-label="Pin Strategic implementation"');
    const detail = renderPicker({
      canMutatePreferences: false,
      initialSelectedItemId: "strategicImplement",
    });
    expect(detail).not.toContain("Named preset");
  });

  it("explains a misconfigured environment without hiding retry", () => {
    const markup = renderPicker({
      catalog: {
        capability: {
          status: "misconfigured",
          sourceKind: null,
          reason: "Configure a workflow catalog source in this environment.",
        },
        items: [],
      },
    });
    expect(markup).toContain("Configure a workflow catalog source");
    expect(markup).toContain("Retry");
  });

  it("keeps provider skills usable when the prompt source is unavailable", () => {
    const markup = renderPicker({
      catalog: {
        capability: {
          status: "unavailable",
          sourceKind: "http",
          reason: "The configured prompt catalog is unavailable.",
        },
        items: [catalog.items[1]!],
      },
    });
    expect(markup).toContain("The configured prompt catalog is unavailable.");
    expect(markup).toContain("review-follow-up");
  });
});
