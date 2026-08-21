import { useAtomValue } from "@effect/atom-react";
import { createWorkflowCatalogEnvironmentAtoms } from "@t3tools/client-runtime/state/workflow-catalog";
import type { EnvironmentId, WorkflowCatalogList } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { formatEnvironmentQueryError } from "./query";

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
