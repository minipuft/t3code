import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { splitWorkbenchMarkdown, WorkbenchPlanMarkdown } from "./WorkbenchPlanMarkdown";

afterEach(() => {
  vi.doUnmock("../ChatMarkdown");
  vi.resetModules();
});

describe("WorkbenchPlanMarkdown", () => {
  it("keeps ordinary Markdown around Mermaid fences in source order", () => {
    expect(
      splitWorkbenchMarkdown(
        "# Before\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      ),
    ).toEqual([
      { kind: "markdown", offset: 0, text: "# Before\n\n" },
      { kind: "mermaid", offset: 10, text: "graph TD\n  A --> B" },
      { kind: "markdown", offset: 43, text: "\n\n| A | B |\n| - | - |\n| 1 | 2 |" },
    ]);
  });

  it("renders GFM content and an accessible lazy diagram placeholder", () => {
    const html = renderToStaticMarkup(
      <WorkbenchPlanMarkdown
        text={"# Plan\n\n> [!NOTE]\n> Check this\n\n```mermaid\ngraph LR\nA-->B\n```"}
      />,
    );

    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("Mermaid diagram");
    expect(html).toContain("Show source");
    expect(html).toContain("Rendering diagram");
  });

  it("derives imageBaseDir from the plan's own directory, not cwd", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.doMock("../ChatMarkdown", () => ({
      default: (props: Record<string, unknown>) => {
        calls.push(props);
        return null;
      },
    }));
    const { WorkbenchPlanMarkdown: MockedWorkbenchPlanMarkdown } =
      await import("./WorkbenchPlanMarkdown");

    renderToStaticMarkup(
      <MockedWorkbenchPlanMarkdown
        text="Plan body"
        cwd="/workspace"
        planPath="plans/active/rollout.md"
      />,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.["imageBaseDir"]).toBe("/workspace/plans/active");
  });

  it("leaves imageBaseDir undefined when the plan's path or cwd is unknown", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.doMock("../ChatMarkdown", () => ({
      default: (props: Record<string, unknown>) => {
        calls.push(props);
        return null;
      },
    }));
    const { WorkbenchPlanMarkdown: MockedWorkbenchPlanMarkdown } =
      await import("./WorkbenchPlanMarkdown");

    renderToStaticMarkup(<MockedWorkbenchPlanMarkdown text="Plan body" cwd="/workspace" />);

    expect(calls[0]?.["imageBaseDir"]).toBeUndefined();
  });
});
