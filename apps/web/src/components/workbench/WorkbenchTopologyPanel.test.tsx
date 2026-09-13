import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { nextTopologyNodeIndex, TopologyCards } from "./WorkbenchTopologyPanel";

const topology = {
  protocolVersion: "1.0.0",
  nodes: [
    { id: "project:a", kind: "project", label: "Alpha", provenance: "/work/alpha" },
    { id: "repo:b", kind: "repository", label: "Beta", provenance: "/work/beta" },
  ],
  approved: [],
  proposed: [
    {
      id: "review-1",
      kind: "project_uses_repository",
      source: "project:a",
      target: "repo:b",
      state: "proposed",
      evidence: { type: "git", locator: "/work/beta" },
    },
  ],
} as const;

const baseProps = {
  topology,
  selectedId: "project:a",
  onSelect: vi.fn(),
  onRefresh: vi.fn(),
  busy: false,
  mutationReview: null,
  checkpoint: false,
  notice: null,
  onCheckpoint: vi.fn(),
  onReview: vi.fn(),
  onApply: vi.fn(),
  onOpenLibrary: vi.fn(),
};

describe("Workbench topology", () => {
  it("keeps remote topology readable while disabling relationship review", () => {
    const markup = renderToStaticMarkup(<TopologyCards {...baseProps} directLocal={false} />);
    expect(markup).toContain("Read-only: relationship approval");
    expect(markup).toContain("Review relationship");
    expect(markup).toContain("disabled");
    expect(markup).toContain("/work/alpha");
  });

  it("renders the prepared exact diff and rollback handoff", () => {
    const markup = renderToStaticMarkup(
      <TopologyCards
        {...baseProps}
        directLocal
        mutationReview={{
          revision: 4,
          proposal: {
            id: "proposal-1",
            requestId: "request-1",
            revision: 4,
            state: "prepared",
            mutationClass: "metadata",
            operation: "upsert",
            target: {
              kind: "workspace",
              sourceId: "workspace",
              relativePath: "workspace.yaml",
            },
            sourceReviewId: "review-1",
            beforeDigest: null,
            afterDigest: "sha256:after",
            diff: "+ project_uses_repository",
            diffDigest: "sha256:diff",
            scope: "global",
            validator: { id: "workspace-validator", valid: true, errors: [], checks: [] },
            git: {
              head: "abc",
              clean: true,
              statusDigest: "clean",
              changedPaths: [],
              requiresCheckpoint: false,
            },
            dependencies: [],
            createdAt: "2026-09-11T00:00:00.000Z",
            updatedAt: "2026-09-11T00:00:00.000Z",
          },
        }}
      />,
    );
    expect(markup).toContain("Review exact workspace diff");
    expect(markup).toContain("+ project_uses_repository");
    expect(markup).toContain("Apply reviewed relationship");
    expect(markup).toContain("Open changes &amp; rollback");
  });

  it("moves node focus with wraparound", () => {
    expect(nextTopologyNodeIndex(0, 1, 2)).toBe(1);
    expect(nextTopologyNodeIndex(1, 1, 2)).toBe(0);
    expect(nextTopologyNodeIndex(0, -1, 2)).toBe(1);
    expect(nextTopologyNodeIndex(0, 1, 0)).toBe(-1);
  });
});
