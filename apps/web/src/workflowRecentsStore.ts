import {
  parseScopedProjectKey,
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef, WorkflowCatalogItemId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { resolveStorage } from "./lib/storage";

export interface WorkflowRecentEntry {
  readonly itemId: WorkflowCatalogItemId;
  readonly usedAt: number;
}

export const WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE = 8;
export const WORKFLOW_RECENTS_MAX_PROJECT_SCOPES = 20;
export const WORKFLOW_RECENTS_MAX_THREAD_SCOPES = 40;
const WORKFLOW_CATALOG_ITEM_ID_MAX_LENGTH = 256;
const MAX_VALID_DATE_MS = 8_640_000_000_000_000;

type WorkflowRecentIndex = Record<string, ReadonlyArray<WorkflowRecentEntry>>;

export interface WorkflowRecentsState {
  readonly byProjectKey: WorkflowRecentIndex;
  readonly byThreadKey: WorkflowRecentIndex;
  readonly record: (input: {
    readonly projectRef: ScopedProjectRef;
    readonly threadRef: ScopedThreadRef | null;
    readonly itemId: WorkflowCatalogItemId;
    readonly usedAt?: number;
  }) => void;
}

function isValidEntry(candidate: unknown): candidate is WorkflowRecentEntry {
  if (!candidate || typeof candidate !== "object") return false;
  const { itemId, usedAt } = candidate as Record<string, unknown>;
  return (
    typeof itemId === "string" &&
    itemId.trim() === itemId &&
    itemId.length > 0 &&
    itemId.length <= WORKFLOW_CATALOG_ITEM_ID_MAX_LENGTH &&
    typeof usedAt === "number" &&
    Number.isFinite(usedAt) &&
    Math.abs(usedAt) <= MAX_VALID_DATE_MS
  );
}

export function upsertWorkflowRecent(
  entries: ReadonlyArray<WorkflowRecentEntry>,
  itemId: WorkflowCatalogItemId,
  usedAt: number,
): ReadonlyArray<WorkflowRecentEntry> {
  return [{ itemId, usedAt }, ...entries.filter((entry) => entry.itemId !== itemId)].slice(
    0,
    WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE,
  );
}

function evictExcessScopes(index: WorkflowRecentIndex, limit: number): WorkflowRecentIndex {
  const keys = Object.keys(index);
  if (keys.length <= limit) return index;
  return Object.fromEntries(
    keys
      .toSorted((left, right) => (index[right]?.[0]?.usedAt ?? 0) - (index[left]?.[0]?.usedAt ?? 0))
      .slice(0, limit)
      .map((key) => [key, index[key] ?? []]),
  );
}

function migrateIndex(
  raw: unknown,
  isValidKey: (key: string) => boolean,
  scopeLimit: number,
): WorkflowRecentIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const migrated: WorkflowRecentIndex = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidKey(key) || !Array.isArray(value)) continue;
    const seen = new Set<string>();
    const entries = value
      .filter(isValidEntry)
      .toSorted((left, right) => right.usedAt - left.usedAt)
      .filter((entry) => {
        if (seen.has(entry.itemId)) return false;
        seen.add(entry.itemId);
        return true;
      })
      .slice(0, WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE);
    if (entries.length > 0) migrated[key] = entries;
  }
  return evictExcessScopes(migrated, scopeLimit);
}

export function migratePersistedWorkflowRecentsState(
  persistedState: unknown,
): Pick<WorkflowRecentsState, "byProjectKey" | "byThreadKey"> {
  if (!persistedState || typeof persistedState !== "object") {
    return { byProjectKey: {}, byThreadKey: {} };
  }
  const state = persistedState as Record<string, unknown>;
  return {
    byProjectKey: migrateIndex(
      state.byProjectKey,
      (key) => parseScopedProjectKey(key) !== null,
      WORKFLOW_RECENTS_MAX_PROJECT_SCOPES,
    ),
    byThreadKey: migrateIndex(
      state.byThreadKey,
      (key) => parseScopedThreadKey(key) !== null,
      WORKFLOW_RECENTS_MAX_THREAD_SCOPES,
    ),
  };
}

function mergeWorkflowRecentsState(
  persistedState: unknown,
  currentState: WorkflowRecentsState,
): WorkflowRecentsState {
  return { ...currentState, ...migratePersistedWorkflowRecentsState(persistedState) };
}

export const useWorkflowRecentsStore = create<WorkflowRecentsState>()(
  persist(
    (set) => ({
      byProjectKey: {},
      byThreadKey: {},
      record: ({ projectRef, threadRef, itemId, usedAt = Date.now() }) => {
        set((state) => {
          const projectKey = scopedProjectKey(projectRef);
          const byProjectKey = evictExcessScopes(
            {
              ...state.byProjectKey,
              [projectKey]: upsertWorkflowRecent(
                state.byProjectKey[projectKey] ?? [],
                itemId,
                usedAt,
              ),
            },
            WORKFLOW_RECENTS_MAX_PROJECT_SCOPES,
          );
          if (threadRef === null || threadRef.environmentId !== projectRef.environmentId) {
            return { byProjectKey };
          }
          const threadKey = scopedThreadKey(threadRef);
          return {
            byProjectKey,
            byThreadKey: evictExcessScopes(
              {
                ...state.byThreadKey,
                [threadKey]: upsertWorkflowRecent(
                  state.byThreadKey[threadKey] ?? [],
                  itemId,
                  usedAt,
                ),
              },
              WORKFLOW_RECENTS_MAX_THREAD_SCOPES,
            ),
          };
        });
      },
    }),
    {
      name: "t3code:workflow-recents:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ byProjectKey, byThreadKey }) => ({ byProjectKey, byThreadKey }),
      migrate: migratePersistedWorkflowRecentsState,
      merge: mergeWorkflowRecentsState,
    },
  ),
);

function selectWorkflowRecents(
  state: Pick<WorkflowRecentsState, "byProjectKey" | "byThreadKey">,
  input: {
    readonly projectRef: ScopedProjectRef;
    readonly threadRef: ScopedThreadRef | null;
  },
): ReadonlyArray<WorkflowRecentEntry> {
  const projectEntries = state.byProjectKey[scopedProjectKey(input.projectRef)] ?? [];
  const threadEntries =
    input.threadRef?.environmentId === input.projectRef.environmentId
      ? (state.byThreadKey[scopedThreadKey(input.threadRef)] ?? [])
      : [];
  const seen = new Set<string>();
  return [...threadEntries, ...projectEntries]
    .filter((entry) => {
      if (seen.has(entry.itemId)) return false;
      seen.add(entry.itemId);
      return true;
    })
    .slice(0, WORKFLOW_RECENTS_MAX_ENTRIES_PER_SCOPE);
}

export function getWorkflowRecents(input: {
  readonly projectRef: ScopedProjectRef;
  readonly threadRef: ScopedThreadRef | null;
}): ReadonlyArray<WorkflowRecentEntry> {
  return selectWorkflowRecents(useWorkflowRecentsStore.getState(), input);
}

const EMPTY_WORKFLOW_RECENTS: ReadonlyArray<WorkflowRecentEntry> = [];

export function useWorkflowRecents(input: {
  readonly projectRef: ScopedProjectRef | null;
  readonly threadRef: ScopedThreadRef | null;
}): ReadonlyArray<WorkflowRecentEntry> {
  return useWorkflowRecentsStore(
    useShallow((state) =>
      input.projectRef === null
        ? EMPTY_WORKFLOW_RECENTS
        : selectWorkflowRecents(state, {
            projectRef: input.projectRef,
            threadRef: input.threadRef,
          }),
    ),
  );
}

export function resetWorkflowRecentsForTests(): void {
  useWorkflowRecentsStore.setState({ byProjectKey: {}, byThreadKey: {} });
  useWorkflowRecentsStore.persist.clearStorage();
}
