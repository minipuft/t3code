import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const topologyState = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("../../state/workbenchPlans", () => ({
  useWorkbenchTopology: () => ({
    data: topologyState.data,
    error: null,
    isPending: false,
    refresh: vi.fn(),
    review: vi.fn(),
  }),
}));

vi.mock("../../state/workbenchResources", () => ({
  useWorkbenchResourceActions: () => ({ apply: vi.fn() }),
}));

import {
  nextTopologyNodeIndex,
  TopologyCards,
  WorkbenchRelationshipIndexPanel,
  WorkbenchRelationshipSummary,
} from "./WorkbenchRelationshipIndexPanel";

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
  onOpenChanges: vi.fn(),
};

const nodeOnlyTopology = {
  protocolVersion: "1.0.0",
  nodes: [{ id: "project:a", kind: "project", label: "Alpha", provenance: "/work/alpha" }],
  approved: [],
  proposed: [],
} as const;

const resourceRelationshipTopology = {
  protocolVersion: "1.0.0",
  nodes: [
    { id: "resource:rule", kind: "resource", label: "Rule", provenance: "source:claude" },
    { id: "project:a", kind: "project", label: "Alpha", provenance: "/work/alpha" },
  ],
  approved: [
    {
      id: "approved-1",
      kind: "resource_projects_to_target",
      source: "resource:rule",
      target: "project:a",
      state: "approved",
    },
  ],
  proposed: [
    {
      id: "proposed-1",
      kind: "project_uses_resource_source",
      source: "project:a",
      target: "resource:rule",
      state: "proposed",
      evidence: { type: "workspace", locator: "workspace.yaml" },
    },
  ],
} as const;

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

  it("renders the full index only when approved or proposed edges exist", () => {
    topologyState.data = nodeOnlyTopology;
    const nodeOnlyMarkup = renderToStaticMarkup(
      <WorkbenchRelationshipIndexPanel
        environmentId={"environment-1" as never}
        directLocal
        onOpenChanges={vi.fn()}
      />,
    );
    expect(nodeOnlyMarkup).toContain("No relationship index");
    expect(nodeOnlyMarkup).not.toContain("Topology nodes");

    topologyState.data = topology;
    const edgeMarkup = renderToStaticMarkup(
      <WorkbenchRelationshipIndexPanel
        environmentId={"environment-1" as never}
        directLocal
        onOpenChanges={vi.fn()}
      />,
    );
    expect(edgeMarkup).toContain("Relationship Index");
    expect(edgeMarkup).toContain("Topology nodes");
    topologyState.data = null;
  });

  it("shows the selected resource relationship summary only for incident edges", () => {
    topologyState.data = resourceRelationshipTopology;
    const edgeMarkup = renderToStaticMarkup(
      <WorkbenchRelationshipSummary
        environmentId={"environment-1" as never}
        directLocal
        subjectLabel="Rule"
        candidateIds={["resource:rule"]}
        onOpenChanges={vi.fn()}
      />,
    );
    expect(edgeMarkup).toContain("Relationships");
    expect(edgeMarkup).toContain("Rule · 2 approved or proposed");
    expect(edgeMarkup).toContain("Open Relationship Index");

    topologyState.data = nodeOnlyTopology;
    const nodeOnlyMarkup = renderToStaticMarkup(
      <WorkbenchRelationshipSummary
        environmentId={"environment-1" as never}
        directLocal
        subjectLabel="Rule"
        candidateIds={["resource:rule"]}
        onOpenChanges={vi.fn()}
      />,
    );
    expect(nodeOnlyMarkup).not.toContain("Relationships");
    expect(nodeOnlyMarkup).not.toContain("Relationship Index");
    topologyState.data = null;
  });
});
