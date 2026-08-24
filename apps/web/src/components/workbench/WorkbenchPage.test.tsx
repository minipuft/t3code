import {
  ProviderDriverKind,
  WorkbenchPlanPath,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { WorkbenchCatalogView } from "./WorkbenchCatalogView";
import { WorkbenchModuleRail } from "./WorkbenchPage";
import { filterWorkbenchPlans, markdownHeadingBefore, PlanList } from "./WorkbenchPlansPanel";

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
      description: null,
      scope: null,
      sourcePath: null,
      providers: [ProviderDriverKind.make("codex"), ProviderDriverKind.make("claude-agent")],
    },
  ],
};

const renderCatalog = (
  overrides: Partial<React.ComponentProps<typeof WorkbenchCatalogView>> = {},
) =>
  renderToStaticMarkup(
    <WorkbenchCatalogView
      data={catalog}
      error={null}
      isPending={false}
      module="prompts"
      onRefresh={() => {}}
      {...overrides}
    />,
  );

describe("WorkbenchCatalogView", () => {
  it("keeps all four modules directly visible with one active item", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchModuleRail activeModule="skills" onChange={() => {}} />,
    );
    expect(markup).toContain("Plans");
    expect(markup).toContain("Prompts");
    expect(markup).toContain("Skills");
    expect(markup).toContain("Vitals");
    expect(markup).toContain('aria-current="page"');
  });

  it("renders only the selected catalog kind", () => {
    const prompts = renderCatalog();
    expect(prompts).toContain("Strategic implementation");
    expect(prompts).not.toContain("review-follow-up");

    const skills = renderCatalog({ module: "skills" });
    expect(skills).toContain("review-follow-up");
    expect(skills).not.toContain("Strategic implementation");
  });

  it("keeps skills visible when the prompt source is unavailable", () => {
    const markup = renderCatalog({
      module: "skills",
      data: {
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
    expect(markup).toContain("Retry");
  });

  it("distinguishes loading, empty, and transport failure states", () => {
    expect(renderCatalog({ data: null, isPending: true })).toContain("Loading Prompts");
    expect(renderCatalog({ data: { ...catalog, items: [] } })).toContain("No prompts found");
    const failed = renderCatalog({ data: null, error: "This environment could not answer." });
    expect(failed).toContain("This environment could not answer.");
    expect(failed).toContain("Retry");
  });

  it("renders complete prompt metadata and reserves protected detail for an environment", () => {
    const markup = renderCatalog({ initialSelectedItemId: "strategicImplement" });
    expect(markup).toContain("task");
    expect(markup).toContain("string · required");
    expect(markup).toContain("Composer mapping");
    expect(markup).toContain("Connect this view to an environment");
  });

  it("renders null-safe skill metadata and multi-provider aggregation", () => {
    const markup = renderCatalog({
      module: "skills",
      initialSelectedItemId: "skill:review",
    });
    expect(markup).toContain("No description provided.");
    expect(markup).toContain("Not reported");
    expect(markup).toContain("codex, claude-agent");
    expect(markup).toContain("$review-follow-up");
    expect(markup).not.toContain("undefined");
  });

  it("keeps bound plans first while searching bounded metadata", () => {
    const unbound = {
      path: WorkbenchPlanPath.make("other/backlog/release.md"),
      name: "release.md",
      directory: "other/backlog",
      project: "other",
      status: "backlog" as const,
      date: null,
      tags: ["shipping"],
      mtimeMs: 20,
      binding: null,
    };
    const bound = {
      ...unbound,
      path: WorkbenchPlanPath.make("t3code/agent-workbench.md"),
      name: "agent-workbench.md",
      project: "t3code",
      mtimeMs: 10,
      binding: {
        title: "Agent Workbench thread",
        threads: 2,
        confirmed: true,
        boundAt: "2026-08-23T10:00:00.000Z",
        notesPath: null,
        notesStale: false,
        deviations: 1,
      },
    };
    expect(filterWorkbenchPlans([unbound, bound], "").map((item) => item.path)).toEqual([
      bound.path,
      unbound.path,
    ]);
    expect(filterWorkbenchPlans([unbound, bound], "shipping")).toHaveLength(2);
    expect(filterWorkbenchPlans([unbound, bound], "t3code")).toEqual([bound]);

    const markup = renderToStaticMarkup(
      <PlanList items={[bound]} selectedPath={bound.path} onSelect={() => {}} />,
    );
    expect(markup).toContain("Agent Workbench thread");
    expect(markup).toContain("2 threads");
    expect(markup).toContain('aria-current="true"');
  });

  it("anchors annotations to the nearest preceding Markdown heading", () => {
    const markdown = "# Plan\n\nIntro\n\n## Boundary\nSelected text";
    expect(markdownHeadingBefore(markdown, markdown.indexOf("Selected"))).toBe("Boundary");
    expect(markdownHeadingBefore("No heading", 5)).toBe("");
  });
});
