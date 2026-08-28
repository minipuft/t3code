import { useAtomValue } from "@effect/atom-react";
import { createWorkflowCatalogEnvironmentAtoms } from "@t3tools/client-runtime/state/workflow-catalog";
import {
  type AgentWorkbenchPromptApplyInput,
  type AgentWorkbenchPromptHistory,
  type AgentWorkbenchPromptMutationResult,
  type AgentWorkbenchPromptReview,
  type AgentWorkbenchPromptReviewInput,
  type AgentWorkbenchPromptRollbackInput,
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

export function useWorkflowPromptHistory(
  environmentId: EnvironmentId,
  itemId: WorkflowCatalogItemId,
): {
  readonly data: AgentWorkbenchPromptHistory | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workflowCatalogEnvironment.history({ environmentId, input: { itemId, limit: 50 } });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkflowPromptComparison(
  environmentId: EnvironmentId,
  itemId: WorkflowCatalogItemId,
  from: number,
  to: number,
): {
  readonly data: AgentWorkbenchPromptReview | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workflowCatalogEnvironment.compare({ environmentId, input: { itemId, from, to } });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkflowPromptActions(environmentId: EnvironmentId) {
  const reviewCommand = useAtomCommand(workflowCatalogEnvironment.review, { reportFailure: false });
  const applyCommand = useAtomCommand(workflowCatalogEnvironment.apply, { reportFailure: false });
  const rollbackCommand = useAtomCommand(workflowCatalogEnvironment.rollback, {
    reportFailure: false,
  });
  return {
    review: useCallback(
      (itemId: WorkflowCatalogItemId, value: AgentWorkbenchPromptReviewInput) =>
        reviewCommand({ environmentId, input: { itemId, value } }),
      [environmentId, reviewCommand],
    ) as (
      itemId: WorkflowCatalogItemId,
      value: AgentWorkbenchPromptReviewInput,
    ) => Promise<
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        AgentWorkbenchPromptReview,
        unknown
      >
    >,
    apply: useCallback(
      (itemId: WorkflowCatalogItemId, value: AgentWorkbenchPromptApplyInput) =>
        applyCommand({ environmentId, input: { itemId, value } }),
      [applyCommand, environmentId],
    ) as (
      itemId: WorkflowCatalogItemId,
      value: AgentWorkbenchPromptApplyInput,
    ) => Promise<
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        AgentWorkbenchPromptMutationResult,
        unknown
      >
    >,
    rollback: useCallback(
      (itemId: WorkflowCatalogItemId, value: AgentWorkbenchPromptRollbackInput) =>
        rollbackCommand({ environmentId, input: { itemId, value } }),
      [environmentId, rollbackCommand],
    ) as (
      itemId: WorkflowCatalogItemId,
      value: AgentWorkbenchPromptRollbackInput,
    ) => Promise<
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        AgentWorkbenchPromptMutationResult,
        unknown
      >
    >,
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
