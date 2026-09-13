import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  WorkbenchResourceApplyInput,
  WorkbenchResourceAuthority,
  WorkbenchResourceLibrary,
  WorkbenchResourceMutationLedger,
  WorkbenchResourcePolicy,
  WorkbenchResourceReviewInput,
  WorkbenchResourceRollbackInput,
  WorkbenchResourceSource,
  WorkbenchResourceTarget,
  WorkbenchReviewInbox,
  WorkbenchReviewInboxCommand,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { workbenchPlansEnvironment } from "./workbenchPlans";
import { formatEnvironmentQueryError } from "./query";
import { useAtomCommand } from "./use-atom-command";

function view<A>(result: AsyncResult.AsyncResult<A, unknown>, refresh: () => void) {
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchResourceLibrary(
  environmentId: EnvironmentId,
  input: { readonly lens: "global" | "effective"; readonly project?: string },
): ReturnType<typeof view<WorkbenchResourceLibrary>> {
  const atom = workbenchPlansEnvironment.resourceLibrary({ environmentId, input });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchReviewInbox(
  environmentId: EnvironmentId,
): ReturnType<typeof view<WorkbenchReviewInbox>> {
  const atom = workbenchPlansEnvironment.reviewInbox({ environmentId, input: null });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchProjectionHealth(environmentId: EnvironmentId) {
  const atom = workbenchPlansEnvironment.projectionHealth({ environmentId, input: null });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchAuditActions(environmentId: EnvironmentId) {
  const command = useAtomCommand(workbenchPlansEnvironment.reviewInboxCommand, {
    reportFailure: false,
  });
  const review = useAtomCommand(workbenchPlansEnvironment.reviewProjection, {
    reportFailure: false,
  });
  const apply = useAtomCommand(workbenchPlansEnvironment.applyProjection, { reportFailure: false });
  const rollback = useAtomCommand(workbenchPlansEnvironment.rollbackProjection, {
    reportFailure: false,
  });
  return {
    command: useCallback(
      (input: WorkbenchReviewInboxCommand) => command({ environmentId, input }),
      [command, environmentId],
    ),
    review: useCallback(
      (input: { requestId: string }) => review({ environmentId, input }),
      [review, environmentId],
    ),
    apply: useCallback(
      (input: { reviewId: string; diffDigest: string }) => apply({ environmentId, input }),
      [apply, environmentId],
    ),
    rollback: useCallback(
      (input: { requestId: string; receiptId: string }) => rollback({ environmentId, input }),
      [rollback, environmentId],
    ),
  };
}

export function useWorkbenchResourceAuthority(
  environmentId: EnvironmentId,
): ReturnType<typeof view<WorkbenchResourceAuthority>> {
  const atom = workbenchPlansEnvironment.resourceAuthority({ environmentId, input: null });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchResourcePolicy(
  environmentId: EnvironmentId,
): ReturnType<typeof view<WorkbenchResourcePolicy>> {
  const atom = workbenchPlansEnvironment.resourcePolicy({ environmentId, input: null });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchResourceMutations(
  environmentId: EnvironmentId,
): ReturnType<typeof view<WorkbenchResourceMutationLedger>> {
  const atom = workbenchPlansEnvironment.resourceMutations({ environmentId, input: null });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchResourceSource(
  environmentId: EnvironmentId,
  target: WorkbenchResourceTarget,
): ReturnType<typeof view<WorkbenchResourceSource>> {
  const atom = workbenchPlansEnvironment.resourceSource({ environmentId, input: target });
  const result = useAtomValue(atom);
  return view(
    result,
    useCallback(() => appAtomRegistry.refresh(atom), [atom]),
  );
}

export function useWorkbenchResourceActions(environmentId: EnvironmentId) {
  const unlock = useAtomCommand(workbenchPlansEnvironment.unlockResources, {
    reportFailure: false,
  });
  const relock = useAtomCommand(workbenchPlansEnvironment.relockResources, {
    reportFailure: false,
  });
  const review = useAtomCommand(workbenchPlansEnvironment.reviewResource, { reportFailure: false });
  const apply = useAtomCommand(workbenchPlansEnvironment.applyResource, { reportFailure: false });
  const rollback = useAtomCommand(workbenchPlansEnvironment.rollbackResource, {
    reportFailure: false,
  });
  return {
    unlock: useCallback(() => unlock({ environmentId, input: null }), [environmentId, unlock]),
    relock: useCallback(() => relock({ environmentId, input: null }), [environmentId, relock]),
    review: useCallback(
      (input: WorkbenchResourceReviewInput) => review({ environmentId, input }),
      [environmentId, review],
    ),
    apply: useCallback(
      (input: WorkbenchResourceApplyInput) => apply({ environmentId, input }),
      [apply, environmentId],
    ),
    rollback: useCallback(
      (input: WorkbenchResourceRollbackInput) => rollback({ environmentId, input }),
      [environmentId, rollback],
    ),
  };
}
