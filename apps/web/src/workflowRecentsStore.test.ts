import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, WorkflowCatalogItemId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE,
  WORKFLOW_RECENTS_MAX_PROJECT_SCOPES,
  getWorkflowRecents,
  migratePersistedWorkflowRecentsState,
  resetWorkflowRecentsForTests,
  useWorkflowRecentsStore,
} from "./workflowRecentsStore";

const environmentId = EnvironmentId.make("environment-1");
const otherEnvironmentId = EnvironmentId.make("environment-2");
const projectRef = scopeProjectRef(environmentId, ProjectId.make("project-1"));
const otherProjectRef = scopeProjectRef(environmentId, ProjectId.make("project-2"));
const threadRef = scopeThreadRef(environmentId, ThreadId.make("thread-1"));
const otherThreadRef = scopeThreadRef(environmentId, ThreadId.make("thread-2"));
const itemId = (value: string) => WorkflowCatalogItemId.make(value);

beforeEach(resetWorkflowRecentsForTests);

describe("workflow recents persistence", () => {
  it("stores identity and timestamp only in project and thread scopes", () => {
    useWorkflowRecentsStore.getState().record({
      projectRef,
      threadRef,
      itemId: itemId("strategicImplement"),
      usedAt: 100,
    });

    const state = useWorkflowRecentsStore.getState();
    expect(state.byProjectKey[scopedProjectKey(projectRef)]).toEqual([
      { itemId: "strategicImplement", usedAt: 100 },
    ]);
    expect(state.byThreadKey[scopedThreadKey(threadRef)]).toEqual([
      { itemId: "strategicImplement", usedAt: 100 },
    ]);
    expect(
      JSON.stringify({
        byProjectKey: state.byProjectKey,
        byThreadKey: state.byThreadKey,
      }),
    ).not.toMatch(/argument|draft|invocation|value/i);
  });

  it("keeps project, thread, and environment identities isolated", () => {
    useWorkflowRecentsStore.getState().record({
      projectRef,
      threadRef,
      itemId: itemId("first"),
      usedAt: 100,
    });
    useWorkflowRecentsStore.getState().record({
      projectRef: otherProjectRef,
      threadRef: otherThreadRef,
      itemId: itemId("second"),
      usedAt: 200,
    });
    const remoteProjectRef = scopeProjectRef(otherEnvironmentId, projectRef.projectId);
    useWorkflowRecentsStore.getState().record({
      projectRef: remoteProjectRef,
      threadRef: null,
      itemId: itemId("remote"),
      usedAt: 300,
    });

    expect(getWorkflowRecents({ projectRef, threadRef }).map((entry) => entry.itemId)).toEqual([
      "first",
    ]);
    expect(
      getWorkflowRecents({ projectRef: otherProjectRef, threadRef: otherThreadRef }).map(
        (entry) => entry.itemId,
      ),
    ).toEqual(["second"]);
    expect(getWorkflowRecents({ projectRef: remoteProjectRef, threadRef: null })[0]?.itemId).toBe(
      "remote",
    );

    useWorkflowRecentsStore.getState().record({
      projectRef,
      threadRef: scopeThreadRef(otherEnvironmentId, ThreadId.make("mismatched")),
      itemId: itemId("project-only"),
      usedAt: 400,
    });
    expect(
      useWorkflowRecentsStore.getState().byThreadKey[`${otherEnvironmentId}:mismatched`],
    ).toBeUndefined();
  });

  it("merges thread-first, deduplicates, and enforces per-scope bounds", () => {
    for (let index = 0; index < WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE + 2; index += 1) {
      useWorkflowRecentsStore.getState().record({
        projectRef,
        threadRef: index === 0 ? threadRef : null,
        itemId: itemId(`workflow-${index}`),
        usedAt: index,
      });
    }
    useWorkflowRecentsStore.getState().record({
      projectRef,
      threadRef,
      itemId: itemId("workflow-9"),
      usedAt: 100,
    });

    const recents = getWorkflowRecents({ projectRef, threadRef });
    expect(recents).toHaveLength(WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE);
    expect(recents[0]?.itemId).toBe("workflow-9");
    expect(new Set(recents.map((entry) => entry.itemId)).size).toBe(recents.length);
  });

  it("sanitizes malformed state, restores MRU order, and evicts old scopes", () => {
    const byProjectKey = Object.fromEntries(
      Array.from({ length: WORKFLOW_RECENTS_MAX_PROJECT_SCOPES + 2 }, (_, index) => [
        `${environmentId}:project-${index}`,
        [{ itemId: `workflow-${index}`, usedAt: index }],
      ]),
    );
    byProjectKey[scopedProjectKey(projectRef)] = [
      { itemId: "duplicate", usedAt: 1 },
      { itemId: "newest", usedAt: 3 },
      { itemId: "duplicate", usedAt: 2 },
      { itemId: "", usedAt: 4 },
      { itemId: "bad-time", usedAt: Number.NaN },
    ];
    const migrated = migratePersistedWorkflowRecentsState({
      byProjectKey,
      byThreadKey: { broken: [{ itemId: "secret", usedAt: 1 }] },
      draftText: "must not survive",
    });

    expect(Object.keys(migrated.byProjectKey)).toHaveLength(WORKFLOW_RECENTS_MAX_PROJECT_SCOPES);
    expect(migrated.byProjectKey[scopedProjectKey(projectRef)]).toEqual([
      { itemId: "newest", usedAt: 3 },
      { itemId: "duplicate", usedAt: 2 },
    ]);
    expect(migrated.byThreadKey).toEqual({});
  });
});
