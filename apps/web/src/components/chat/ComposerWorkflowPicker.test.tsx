import {
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vite-plus/test";

import { ComposerWorkflowPicker } from "./ComposerWorkflowPicker";

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

const renderPicker = (overrides: Partial<ComponentProps<typeof ComposerWorkflowPicker>> = {}) =>
  renderToStaticMarkup(
    <ComposerWorkflowPicker
      catalog={catalog}
      error={null}
      isPending={false}
      draftText="Implement the library"
      onRefresh={() => {}}
      onClose={() => {}}
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
  });

  it("renders progressive prompt arguments and a non-submit Insert button", () => {
    const markup = renderPicker({ initialSelectedItemId: "strategicImplement" });
    expect(markup).toContain("Arguments");
    expect(markup).toContain("task · required");
    expect(markup).toContain("Uses the current draft when blank");
    expect(markup).toContain('<button type="button"');
    expect(markup).toContain(">Insert</button>");
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
