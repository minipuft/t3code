import {
  ProjectId,
  ProviderDriverKind,
  WorkbenchPlanPath,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { groupCatalogItems, WorkbenchCatalogView } from "./WorkbenchCatalogView";
import { WorkbenchModuleRail } from "./WorkbenchModuleRail";
import { markdownHeadingBefore } from "./WorkbenchPlanAnnotations";
import { resolveWorkbenchProjectSelection } from "./WorkbenchProjectLens";
import { filterWorkbenchPlans, PlanList } from "./WorkbenchPlansPanel";
import { authorityReason } from "./WorkbenchSystemPanel";
import { resourceApplyInput } from "./WorkbenchResourceMutation";

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
  it("uses explicit project, then local selection, then All Projects without first-project inference", () => {
    const available = [ProjectId.make("a"), ProjectId.make("b")];
    expect(
      resolveWorkbenchProjectSelection({
        highlightedProjectId: ProjectId.make("b"),
        selectedProjectId: ProjectId.make("a"),
        availableProjectIds: available,
      }),
    ).toBe("b");
    expect(
      resolveWorkbenchProjectSelection({
        selectedProjectId: ProjectId.make("a"),
        availableProjectIds: available,
      }),
    ).toBe("a");
    expect(
      resolveWorkbenchProjectSelection({
        selectedProjectId: ProjectId.make("deleted"),
        availableProjectIds: available,
      }),
    ).toBeUndefined();
    expect(
      resolveWorkbenchProjectSelection({ selectedProjectId: null, availableProjectIds: available }),
    ).toBeNull();
  });
  it("keeps all four modules directly visible with one active item", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchModuleRail activeModule="skills" onChange={() => {}} />,
    );
    expect(markup).toContain("Plans");
    expect(markup).toContain("Prompts");
    expect(markup).toContain("Skills");
    expect(markup).toContain("System");
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup.indexOf(">Plans</button>")).toBeLessThan(markup.indexOf(">Prompts</button>"));
    expect(markup.indexOf(">Prompts</button>")).toBeLessThan(markup.indexOf(">Skills</button>"));
    expect(markup.indexOf(">Skills</button>")).toBeLessThan(markup.indexOf(">System</button>"));
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

  it("adapts the catalog to the compact Actions surface with an insert affordance", () => {
    const markup = renderCatalog({
      initialSelectedItemId: "strategicImplement",
      variant: "compact",
      onInsertInvocation: () => undefined,
    });
    expect(markup).toContain("Actions");
    expect(markup).toContain("&gt;&gt;strategicImplement");
    expect(markup).toContain("Insert");
  });

  it("groups actions by category and skills by scope without changing catalog authority", () => {
    expect(groupCatalogItems(catalog.items).map((group) => group.label)).toEqual([
      "development",
      "Unscoped",
    ]);
    const markup = renderCatalog({ variant: "compact" });
    expect(markup).toContain('aria-label="development"');
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

  it("explains why canonical mutations remain locked", () => {
    expect(authorityReason("remote_session")).toContain("remote, relay, and tunnel");
    expect(authorityReason("unlock_expired")).toContain("expired");
    expect(authorityReason(null)).toContain("direct local administrative session");
  });

  it("echoes the reviewed git status digest when a dirty checkpoint is required", () => {
    const review = {
      proposal: {
        id: "proposal-1",
        revision: 7,
        diffDigest: "diff-digest",
        git: { requiresCheckpoint: true, statusDigest: "reviewed-status-digest" },
      },
    };
    expect(resourceApplyInput(review as never)).toEqual({
      proposalId: "proposal-1",
      expectedRevision: 7,
      diffDigest: "diff-digest",
      checkpoint: "reviewed-status-digest",
    });
    expect(
      resourceApplyInput({
        proposal: { ...review.proposal, git: { requiresCheckpoint: false, statusDigest: "clean" } },
      } as never),
    ).not.toHaveProperty("checkpoint");
  });
});
