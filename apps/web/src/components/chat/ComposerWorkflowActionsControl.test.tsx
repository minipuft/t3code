import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerWorkflowActionsControl } from "./ComposerWorkflowActionsControl";

describe("ComposerWorkflowActionsControl", () => {
  it("renders a non-submit Agent Actions control", () => {
    const markup = renderToStaticMarkup(
      <ComposerWorkflowActionsControl compact={false} open={false} onToggle={() => {}} />,
    );
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Agent Actions"');
    expect(markup).toContain(">Actions</span>");
  });

  it("exposes the selected surface when the picker is open", () => {
    const markup = renderToStaticMarkup(
      <ComposerWorkflowActionsControl compact open onToggle={() => {}} />,
    );
    expect(markup).toContain("bg-accent text-accent-foreground");
    expect(markup).toContain("sr-only");
  });
});
