import { useAtomValue } from "@effect/atom-react";
import { createWorkflowCatalogEnvironmentAtoms } from "@t3tools/client-runtime/state/workflow-catalog";
import {
  EMPTY_WORKFLOW_LIBRARY_PREFERENCES,
  type EnvironmentId,
  type WorkflowCatalogList,
  type WorkflowCatalogDetail,
  type WorkflowCatalogItemId,
  type WorkflowLibraryPreferenceMutation,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { formatEnvironmentQueryError } from "./query";
import { serverEnvironment } from "./server";
import { useAtomCommand } from "./use-atom-command";

export const workflowCatalogEnvironment =
  createWorkflowCatalogEnvironmentAtoms(connectionAtomRuntime);

export function useWorkflowCatalog(environmentId: EnvironmentId): {
  readonly data: WorkflowCatalogList | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workflowCatalogEnvironment.list({ environmentId, input: null });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkflowCatalogDetail(
  environmentId: EnvironmentId,
  itemId: WorkflowCatalogItemId,
): {
  readonly data: WorkflowCatalogDetail | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workflowCatalogEnvironment.detail({ environmentId, input: itemId });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkflowLibraryPreferences(environmentId: EnvironmentId) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const runMutation = useAtomCommand(
    serverEnvironment.mutateWorkflowPreferences,
    "workflow preferences update",
  );
  const mutate = useCallback(
    (mutation: WorkflowLibraryPreferenceMutation) =>
      runMutation({ environmentId, input: { mutation } }),
    [environmentId, runMutation],
  );
  return {
    preferences: config?.settings.workflowLibraryPreferences ?? EMPTY_WORKFLOW_LIBRARY_PREFERENCES,
    canMutate: config?.environment.capabilities.workflowPreferences === true,
    mutate,
  };
}
