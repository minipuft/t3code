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
    expect(markup).toContain("bg-accent text-accent-foreground hover:bg-accent/80");
    expect(markup).toContain("sr-only");
  });

  it("renders the resting strip skin when size is xs, matching sibling controls", () => {
    const markup = renderToStaticMarkup(
      <ComposerWorkflowActionsControl compact open={false} onToggle={() => {}} size="xs" />,
    );
    expect(markup).toContain("text-muted-foreground/70");
    expect(markup).toContain('shrink-0 size-3" aria-hidden="true" data-composer-control-icon');
    expect(markup).not.toContain("h-7 min-h-7");
  });
});
