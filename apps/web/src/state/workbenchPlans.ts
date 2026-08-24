import { useAtomValue } from "@effect/atom-react";
import { createWorkbenchPlansEnvironmentAtoms } from "@t3tools/client-runtime/state/workbench-plans";
import type {
  EnvironmentId,
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanAnnotations,
  WorkbenchPlanList,
  WorkbenchPlanMutationInput,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
  WorkbenchPlanSourceDocument,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { formatEnvironmentQueryError } from "./query";
import { useAtomCommand } from "./use-atom-command";

export const workbenchPlansEnvironment =
  createWorkbenchPlansEnvironmentAtoms(connectionAtomRuntime);

function queryValue<A>(result: AsyncResult.AsyncResult<A, unknown>): A | null {
  return Option.getOrNull(AsyncResult.value(result));
}

export function useWorkbenchPlans(environmentId: EnvironmentId): {
  readonly data: WorkbenchPlanList | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workbenchPlansEnvironment.list({ environmentId, input: null });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchPlanSource(
  environmentId: EnvironmentId,
  path: WorkbenchPlanPath,
): {
  readonly data: WorkbenchPlanSourceDocument | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workbenchPlansEnvironment.source({ environmentId, input: path });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchPlanAnnotations(
  environmentId: EnvironmentId,
  path: WorkbenchPlanPath,
): {
  readonly data: WorkbenchPlanAnnotations | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workbenchPlansEnvironment.annotations({ environmentId, input: path });
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchPlanActions(environmentId: EnvironmentId) {
  const saveCommand = useAtomCommand(workbenchPlansEnvironment.save, { reportFailure: false });
  const mutateCommand = useAtomCommand(workbenchPlansEnvironment.mutate, {
    reportFailure: false,
  });
  const annotateCommand = useAtomCommand(workbenchPlansEnvironment.annotate, {
    reportFailure: false,
  });
  return {
    save: useCallback(
      (input: WorkbenchPlanSaveInput) => saveCommand({ environmentId, input }),
      [environmentId, saveCommand],
    ),
    mutate: useCallback(
      (input: WorkbenchPlanMutationInput) => mutateCommand({ environmentId, input }),
      [environmentId, mutateCommand],
    ),
    annotate: useCallback(
      (input: WorkbenchPlanAnnotationMutationInput) => annotateCommand({ environmentId, input }),
      [annotateCommand, environmentId],
    ),
  };
}
