import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  error: null as string | null,
  isPending: false,
  items: [
    {
      id: "audit:claude",
      audit: {
        identity: "claude",
        family: "claude",
        state: "stale",
        sourceHash: "source",
        targetHash: "target",
        reason: "Projection differs from its source.",
        evidence: [{ kind: "file", locator: "AGENTS.md", detail: "digest mismatch" }],
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
    },
  ],
}));

vi.mock("../../state/workbenchResources", () => ({
  useWorkbenchReviewInbox: () => ({
    data: state.isPending ? null : { revision: 1, items: state.items },
    error: state.error,
    isPending: state.isPending,
    refresh: vi.fn(),
  }),
  useWorkbenchAuditActions: () => ({
    command: vi.fn(),
    review: vi.fn(),
    apply: vi.fn(),
    rollback: vi.fn(),
  }),
}));

import { WorkbenchAuditPanel } from "./WorkbenchAuditPanel";

const render = (directLocal: boolean) =>
  renderToStaticMarkup(
    <WorkbenchAuditPanel
      environmentId={EnvironmentId.make("environment-1")}
      directLocal={directLocal}
    />,
  );

describe("WorkbenchAuditPanel", () => {
  it("reports an unavailable audit instead of treating it as an empty result", () => {
    state.error = "Workbench capability is unavailable.";
    const markup = render(true);
    expect(markup).toContain("Provider audit unavailable");
    expect(markup).toContain("Workbench capability is unavailable.");
    expect(markup).not.toContain("No provider audit findings");
    state.error = null;
  });

  it("shows evidence and local review controls for a stale projection", () => {
    const markup = render(true);
    expect(markup).toContain("Projection differs from its source.");
    expect(markup).toContain("AGENTS.md");
    expect(markup).toContain("Review repair");
    expect(markup).toContain("Dismiss");
    expect(markup).not.toContain("Remote read-only");
  });

  it("keeps audit evidence readable while disabling remote mutations", () => {
    const markup = render(false);
    expect(markup).toContain("Remote read-only");
    expect(markup).toContain("Review repair");
    expect(markup).toContain("disabled");
  });
});
