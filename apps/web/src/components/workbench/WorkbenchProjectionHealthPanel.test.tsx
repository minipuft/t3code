import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

type AuditFixture = {
  readonly id: string;
  readonly audit: {
    readonly identity: string;
    readonly family: "claude";
    readonly state: "stale" | "current";
    readonly sourceHash: string;
    readonly targetHash: string;
    readonly reason: string;
    readonly evidence: ReadonlyArray<{
      readonly kind: string;
      readonly locator: string;
      readonly detail: string;
    }>;
    readonly updatedAt: string;
  };
};

function auditFixture(state: AuditFixture["audit"]["state"]): AuditFixture {
  return {
    id: "audit:claude",
    audit: {
      identity: "claude",
      family: "claude",
      state,
      sourceHash: "source",
      targetHash: "target",
      reason: "Projection differs from its source.",
      evidence: [{ kind: "file", locator: "AGENTS.md", detail: "digest mismatch" }],
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
  };
}

const state = vi.hoisted(() => ({
  error: null as string | null,
  isPending: false,
  items: [auditFixture("stale")] as AuditFixture[],
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

import { WorkbenchProjectionHealthPanel } from "./WorkbenchProjectionHealthPanel";

const render = (directLocal: boolean) =>
  renderToStaticMarkup(
    <WorkbenchProjectionHealthPanel
      environmentId={EnvironmentId.make("environment-1")}
      directLocal={directLocal}
    />,
  );

describe("WorkbenchProjectionHealthPanel", () => {
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
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("Current");
  });

  it("keeps current health out of the attention detail while offering its filter", () => {
    state.items = [auditFixture("current")];
    const markup = render(true);
    expect(markup).toContain("Projection health filter");
    expect(markup).toContain("No projection health findings for this filter.");
    state.items = [auditFixture("stale")];
  });

  it("keeps audit evidence readable while disabling remote mutations", () => {
    const markup = render(false);
    expect(markup).toContain("Remote read-only");
    expect(markup).toContain("Review repair");
    expect(markup).toContain("disabled");
  });
});
