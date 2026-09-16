import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  libraryError: null as string | null,
  projectionState: "stale" as "stale" | "current",
}));

const resource = {
  id: "resource:rule",
  kind: "rule",
  name: "Rule",
  description: "A governed rule.",
  category: "System",
  group: "Rules",
  scope: "global",
  project: null,
  provenance: {
    sourceId: "source:claude",
    sourceType: "filesystem",
    canonical: true,
  },
  effective: "enabled",
  relativePath: "rules/example.md",
} as const;

// A second resource of a different kind so the grouping tests can tell sections apart, and a
// third kind (hook) stays absent from `entries` to prove an empty section disappears.
const skillResource = {
  id: "resource:skill",
  kind: "skill",
  name: "Skill",
  description: "A governed skill.",
  category: "System",
  group: "Skills",
  scope: "global",
  project: null,
  provenance: {
    sourceId: "source:claude",
    sourceType: "filesystem",
    canonical: true,
  },
  effective: "enabled",
  relativePath: "skills/example/SKILL.md",
} as const;

vi.mock("../../state/workbenchResources", () => ({
  useWorkbenchResourceLibrary: () => ({
    data: state.libraryError ? null : { projects: [], entries: [resource, skillResource] },
    error: state.libraryError,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchResourceAuthority: () => ({
    data: { state: "locked" },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchResourcePolicy: () => ({
    data: { enabledThrough: "rule" },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchReviewInbox: () => ({
    data: { revision: 1, items: [] },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchProjectionHealth: () => ({
    data: { state: state.projectionState },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchResourceMutations: () => ({
    data: { receipts: [] },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchResourceActions: () => ({
    unlock: vi.fn(),
    relock: vi.fn(),
    review: vi.fn(),
    apply: vi.fn(),
    rollback: vi.fn(),
  }),
  useWorkbenchResourceSource: () => ({
    data: null,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkbenchAuditActions: () => ({
    command: vi.fn(),
    review: vi.fn(),
    apply: vi.fn(),
    rollback: vi.fn(),
  }),
}));

vi.mock("../../state/workbenchPlans", () => ({
  useWorkbenchRelationshipIndex: () => ({
    data: null,
    error: null,
    isPending: false,
    refresh: vi.fn(),
    review: vi.fn(),
  }),
}));

import { WorkbenchSystemPanel } from "./WorkbenchSystemPanel";

function render(directLocal: boolean) {
  return renderToStaticMarkup(
    <WorkbenchSystemPanel
      environmentId={EnvironmentId.make("environment-1")}
      directLocal={directLocal}
    />,
  );
}

describe("WorkbenchSystemPanel", () => {
  it("composes Resources, Inbox, Changes, and an attention projection badge", () => {
    state.projectionState = "stale";
    const markup = render(true);
    expect(markup).toContain("System");
    expect(markup).toContain("Resources");
    expect(markup).toContain("Inbox");
    expect(markup).toContain("Changes");
    expect(markup).toContain("Projection stale");
    expect(markup).toContain("Rule");
  });

  it("keeps the System shell available for remote sessions and current health", () => {
    state.projectionState = "current";
    const markup = render(false);
    expect(markup).toContain("Projection current");
    expect(markup).toContain("Unlock local session");
    state.projectionState = "stale";
  });

  it("reports a resource error without removing System navigation", () => {
    state.libraryError = "Workbench capability is unavailable.";
    const markup = render(true);
    expect(markup).toContain("Resources");
    expect(markup).toContain("Resources unavailable");
    expect(markup).toContain("Workbench capability is unavailable.");
    state.libraryError = null;
  });

  it("groups the Resources list into sections by resource type", () => {
    const markup = render(true);
    expect(markup).toContain("Rules");
    expect(markup).toContain("Skills");
  });

  it("omits a resource-type section that has no entries", () => {
    const markup = render(true);
    expect(markup).not.toContain("Hooks");
  });

  it("marks each resource-type section trigger with aria-expanded", () => {
    const markup = render(true);
    expect(markup).toContain('aria-expanded="true"');
  });
});
