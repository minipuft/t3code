import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { splitWorkbenchMarkdown, WorkbenchPlanMarkdown } from "./WorkbenchPlanMarkdown";

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
});
