import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  WorkbenchPlanPath,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { projectWorkbenchCatalog } from "../../workbenchCatalog";
import { groupCatalogItems, WorkbenchCatalogView } from "./WorkbenchCatalogView";
import { WorkbenchModuleRail } from "./WorkbenchModuleRail";
import { markdownHeadingBefore } from "./WorkbenchPlanAnnotations";
import { resolveWorkbenchProjectSelection } from "./WorkbenchProjectLens";
import { filterWorkbenchPlans, PlanList, resolveEnvironmentCwd } from "./WorkbenchPlansPanel";
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

function catalogPrompt(overrides: { readonly id: string; readonly category: string }) {
  return {
    kind: "prompt" as const,
    id: WorkflowCatalogItemId.make(overrides.id),
    name: overrides.id,
    category: overrides.category,
    description: "",
    arguments: [],
    composerInputArgument: null,
    executionType: "single" as const,
    providers: [],
    revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
  };
}

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
    expect(groupCatalogItems(catalog.items)).toEqual([
      { id: "category:development", label: "development", items: [catalog.items[0]] },
      { id: "scope:none", label: "Unscoped", items: [catalog.items[1]] },
    ]);
    // Grouping renders through the shared collapsible primitive (WorkbenchGroupSections),
    // open by default, so both the compact (chat-side) and page variants share this markup.
    const markup = renderCatalog({ variant: "compact" });
    expect(markup).toContain("development");
    expect(markup).toContain('aria-expanded="true"');
  });

  it("puts an uncategorized prompt group last regardless of item order", () => {
    const items = [
      catalogPrompt({ id: "no-category", category: "" }),
      catalogPrompt({ id: "first-development", category: "development" }),
      catalogPrompt({ id: "second-development", category: "development" }),
    ];
    expect(groupCatalogItems(items).map((group) => ({ id: group.id, label: group.label }))).toEqual(
      [
        { id: "category:development", label: "development" },
        { id: "category:none", label: "Uncategorized" },
      ],
    );
  });

  it("drops a category group once filtering leaves it with no items", () => {
    const items = [
      catalogPrompt({ id: "kept", category: "development" }),
      catalogPrompt({ id: "filtered-out", category: "operations" }),
    ];
    const filtered = projectWorkbenchCatalog({ items, module: "prompts", query: "kept" });
    expect(groupCatalogItems(filtered).map((group) => group.label)).toEqual(["development"]);
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

    const environmentId = EnvironmentId.make("environment-a");
    const markup = renderToStaticMarkup(
      <PlanList
        items={[bound]}
        selectedPath={bound.path}
        environmentId={environmentId}
        onSelect={() => {}}
      />,
    );
    expect(markup).toContain("Agent Workbench thread");
    expect(markup).toContain("2 threads");
    expect(markup).toContain('aria-current="true"');
  });

  it("groups plans by project then status, with Global first and the fixed status order", () => {
    const environmentId = EnvironmentId.make("environment-a");
    const plan = (overrides: {
      path: string;
      project: string | null;
      status: "active" | "backlog" | "done" | "reference" | null;
    }) => ({
      path: WorkbenchPlanPath.make(overrides.path),
      name: overrides.path,
      directory: "",
      project: overrides.project,
      status: overrides.status,
      date: null,
      tags: [],
      mtimeMs: 0,
      binding: null,
    });
    const items = [
      plan({ path: "t3code/done.md", project: "t3code", status: "done" }),
      plan({ path: "global/active.md", project: null, status: "active" }),
      plan({ path: "apricot/active.md", project: "apricot", status: "active" }),
      plan({ path: "t3code/reference.md", project: "t3code", status: "reference" }),
      plan({ path: "t3code/active.md", project: "t3code", status: "active" }),
      plan({ path: "apricot/backlog.md", project: "apricot", status: "backlog" }),
    ];

    const markup = renderToStaticMarkup(
      <PlanList
        items={items}
        selectedPath={null}
        environmentId={environmentId}
        onSelect={() => {}}
      />,
    );

    // Global sorts first among projects, then alphabetical: Global, apricot, t3code.
    const projectOrder = ["Global", "apricot", "t3code"].map((label) => markup.indexOf(label));
    expect(projectOrder).toEqual([...projectOrder].sort((left, right) => left - right));
    expect(projectOrder.every((index) => index >= 0)).toBe(true);

    // Within a project, status follows the fixed order (active, reference, done),
    // with an out-of-order status like "backlog" appended after using its raw label.
    const t3codeStatusOrder = ["Active", "Reference", "Done"].map((label) =>
      markup.indexOf(label, markup.indexOf("t3code")),
    );
    expect(t3codeStatusOrder).toEqual([...t3codeStatusOrder].sort((left, right) => left - right));

    const apricotSection = markup.slice(markup.indexOf("apricot"), markup.indexOf("t3code"));
    expect(apricotSection.indexOf("Active")).toBeLessThan(apricotSection.indexOf("Backlog"));
  });

  it("drops a status section left with zero plans after filtering", () => {
    const environmentId = EnvironmentId.make("environment-a");
    const items = filterWorkbenchPlans(
      [
        {
          path: WorkbenchPlanPath.make("t3code/active.md"),
          name: "active.md",
          directory: "",
          project: "t3code",
          status: "active",
          date: null,
          tags: [],
          mtimeMs: 0,
          binding: null,
        },
        {
          path: WorkbenchPlanPath.make("t3code/done.md"),
          name: "shipped-feature.md",
          directory: "",
          project: "t3code",
          status: "done",
          date: null,
          tags: [],
          mtimeMs: 0,
          binding: null,
        },
      ],
      "shipped",
    );

    const markup = renderToStaticMarkup(
      <PlanList
        items={items}
        selectedPath={null}
        environmentId={environmentId}
        onSelect={() => {}}
      />,
    );
    expect(markup).toContain("Done");
    expect(markup).not.toContain("Active");
  });

  it("resolves the plan editor's cwd from the environment's first project, yielding a defined imageBaseDir anchor", () => {
    const environmentA = EnvironmentId.make("environment-a");
    const environmentB = EnvironmentId.make("environment-b");
    const projects = [
      { environmentId: environmentB, workspaceRoot: "/repos/other" },
      { environmentId: environmentA, workspaceRoot: "/repos/t3code" },
    ];
    expect(resolveEnvironmentCwd(projects, environmentA)).toBe("/repos/t3code");
    expect(resolveEnvironmentCwd([], environmentA)).toBeUndefined();
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
