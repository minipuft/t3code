import { useAtomValue } from "@effect/atom-react";
import { createWorkbenchPlansEnvironmentAtoms } from "@t3tools/client-runtime/state/workbench-plans";
import type {
  EnvironmentId,
  WorkbenchConversationInput,
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanAnnotations,
  WorkbenchPlanAssociationMutationInput,
  WorkbenchPlanAssociations,
  WorkbenchPlanList,
  WorkbenchPlanMutationInput,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
  WorkbenchPlanSourceDocument,
  WorkbenchPlanSuggestionInput,
  WorkbenchPlanSuggestions,
  WorkbenchTopology,
  WorkbenchRelationshipReviewInput,
  WorkbenchResourceMutationReview,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";

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
  const refresh = () => appAtomRegistry.refresh(atom);
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchRelationshipIndex(environmentId: EnvironmentId): {
  readonly data: WorkbenchTopology | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
  readonly review: (
    input: WorkbenchRelationshipReviewInput,
  ) => Promise<
    import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
      WorkbenchResourceMutationReview,
      unknown
    >
  >;
} {
  const atom = workbenchPlansEnvironment.topology({ environmentId, input: null });
  const result = useAtomValue(atom);
  const refresh = () => appAtomRegistry.refresh(atom);
  const reviewCommand = useAtomCommand(workbenchPlansEnvironment.reviewRelationship, {
    reportFailure: false,
  });
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
    review: ((input: WorkbenchRelationshipReviewInput) =>
      reviewCommand({ environmentId, input })) as (
      input: WorkbenchRelationshipReviewInput,
    ) => Promise<
      import("@t3tools/client-runtime/state/runtime").AtomCommandResult<
        WorkbenchResourceMutationReview,
        unknown
      >
    >,
  };
}

export function useWorkbenchPlanAssociations(
  environmentId: EnvironmentId,
  input: WorkbenchConversationInput,
): {
  readonly data: WorkbenchPlanAssociations | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workbenchPlansEnvironment.associations({ environmentId, input });
  const result = useAtomValue(atom);
  const refresh = () => appAtomRegistry.refresh(atom);
  return {
    data: queryValue(result),
    error: result._tag === "Failure" ? formatEnvironmentQueryError(result.cause) : null,
    isPending: result.waiting,
    refresh,
  };
}

export function useWorkbenchPlanSuggestions(
  environmentId: EnvironmentId,
  input: WorkbenchPlanSuggestionInput,
): {
  readonly data: WorkbenchPlanSuggestions | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
} {
  const atom = workbenchPlansEnvironment.suggestions({ environmentId, input });
  const result = useAtomValue(atom);
  const refresh = () => appAtomRegistry.refresh(atom);
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
  const refresh = () => appAtomRegistry.refresh(atom);
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
  const refresh = () => appAtomRegistry.refresh(atom);
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
  const associateCommand = useAtomCommand(workbenchPlansEnvironment.associate, {
    reportFailure: false,
  });
  return {
    save: (input: WorkbenchPlanSaveInput) => saveCommand({ environmentId, input }),
    mutate: (input: WorkbenchPlanMutationInput) => mutateCommand({ environmentId, input }),
    annotate: (input: WorkbenchPlanAnnotationMutationInput) =>
      annotateCommand({ environmentId, input }),
    associate: (input: WorkbenchPlanAssociationMutationInput) =>
      associateCommand({ environmentId, input }),
  };
}
