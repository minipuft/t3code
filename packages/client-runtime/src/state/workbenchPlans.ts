import type {
  WorkbenchConversationInput,
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanAssociationMutationInput,
  WorkbenchReviewInboxCommand,
  WorkbenchPlanMutationInput,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
  WorkbenchPlanSuggestionInput,
  WorkbenchResourceApplyInput,
  WorkbenchResourceReviewInput,
  WorkbenchResourceRollbackInput,
  WorkbenchResourceTarget,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { WorkbenchRelationshipReviewInput } from "@t3tools/contracts";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
} from "./runtime.ts";
import { WorkbenchPlansLoader } from "./workbenchPlansHttp.ts";

export { WorkbenchPlansLoader, workbenchPlansLoaderLayer } from "./workbenchPlansHttp.ts";

class WorkbenchPlansConnectionNotReadyError extends Data.TaggedError(
  "WorkbenchPlansConnectionNotReadyError",
)<{ readonly message: string }> {}

const withPreparedConnection = <A, E>(
  execute: (
    loader: WorkbenchPlansLoader["Service"],
    prepared: PreparedConnection,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const supervisor = yield* EnvironmentSupervisor;
    const loader = yield* WorkbenchPlansLoader;
    const prepared = yield* SubscriptionRef.get(supervisor.prepared);
    if (Option.isNone(prepared)) {
      return yield* new WorkbenchPlansConnectionNotReadyError({
        message: "The environment HTTP connection is not ready.",
      });
    }
    return yield* execute(loader, prepared.value);
  });

export function createWorkbenchPlansEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | WorkbenchPlansLoader | R, E>,
) {
  const mutationScheduler = createAtomCommandScheduler();
  return {
    list: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-plans:list",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.list(prepared)),
    }),
    vitals: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-vitals",
      staleTimeMs: 15_000,
      refreshIntervalMs: 60_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.vitals(prepared)),
    }),
    topology: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-topology",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.topology(prepared)),
    }),
    reviewRelationship: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-topology:review",
      execute: (input: WorkbenchRelationshipReviewInput) =>
        withPreparedConnection((loader, prepared) => loader.reviewRelationship(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    associations: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-plans:associations",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (input: WorkbenchConversationInput) =>
        withPreparedConnection((loader, prepared) => loader.associations(prepared, input)),
    }),
    suggestions: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-plans:suggestions",
      staleTimeMs: 30_000,
      execute: (input: WorkbenchPlanSuggestionInput) =>
        withPreparedConnection((loader, prepared) => loader.suggest(prepared, input)),
    }),
    source: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-plans:source",
      staleTimeMs: 3_000,
      execute: (path: WorkbenchPlanPath) =>
        withPreparedConnection((loader, prepared) => loader.read(prepared, path)),
    }),
    annotations: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-plans:annotations",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (path: WorkbenchPlanPath) =>
        withPreparedConnection((loader, prepared) => loader.annotations(prepared, path)),
    }),
    save: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-plans:save",
      execute: (input: WorkbenchPlanSaveInput) =>
        withPreparedConnection((loader, prepared) => loader.save(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.path]),
      },
    }),
    mutate: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-plans:mutate",
      execute: (input: WorkbenchPlanMutationInput) =>
        withPreparedConnection((loader, prepared) => loader.mutate(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.op === "create" ? input.project : input.path]),
      },
    }),
    annotate: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-plans:annotate",
      execute: (input: WorkbenchPlanAnnotationMutationInput) =>
        withPreparedConnection((loader, prepared) => loader.annotate(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.path]),
      },
    }),
    associate: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-plans:associate",
      execute: (input: WorkbenchPlanAssociationMutationInput) =>
        withPreparedConnection((loader, prepared) => loader.associate(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.threadId]),
      },
    }),
    resourceLibrary: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:library",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (input: { readonly lens: "global" | "effective"; readonly project?: string }) =>
        withPreparedConnection((loader, prepared) => loader.resourceLibrary(prepared, input)),
    }),
    reviewInbox: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:review-inbox",
      staleTimeMs: 3_000,
      refreshIntervalMs: 5_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.reviewInbox(prepared)),
    }),
    reviewInboxCommand: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench:review-inbox-command",
      execute: (input: WorkbenchReviewInboxCommand) =>
        withPreparedConnection((loader, prepared) => loader.reviewInboxCommand(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    projectionHealth: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench:projection-health",
      staleTimeMs: 3_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.projectionHealth(prepared)),
    }),
    reviewProjection: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench:projection-review",
      execute: (input: { requestId: string }) =>
        withPreparedConnection((loader, prepared) => loader.reviewProjection(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    applyProjection: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench:projection-apply",
      execute: (input: { reviewId: string; diffDigest: string }) =>
        withPreparedConnection((loader, prepared) => loader.applyProjection(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    rollbackProjection: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench:projection-rollback",
      execute: (input: { requestId: string; receiptId: string }) =>
        withPreparedConnection((loader, prepared) => loader.rollbackProjection(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    resourceAuthority: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:authority",
      staleTimeMs: 1_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.resourceAuthority(prepared)),
    }),
    resourcePolicy: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:policy",
      staleTimeMs: 1_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.resourcePolicy(prepared)),
    }),
    resourceMutations: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:mutations",
      staleTimeMs: 1_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.resourceMutations(prepared)),
    }),
    resourceSource: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workbench-resources:source",
      staleTimeMs: 1_000,
      execute: (target: WorkbenchResourceTarget) =>
        withPreparedConnection((loader, prepared) => loader.resourceSource(prepared, target)),
    }),
    unlockResources: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-resources:unlock",
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.unlockResources(prepared)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    relockResources: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-resources:relock",
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.relockResources(prepared)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    reviewResource: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-resources:review",
      execute: (input: WorkbenchResourceReviewInput) =>
        withPreparedConnection((loader, prepared) => loader.reviewResource(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.target]),
      },
    }),
    applyResource: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-resources:apply",
      execute: (input: WorkbenchResourceApplyInput) =>
        withPreparedConnection((loader, prepared) => loader.applyResource(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
    rollbackResource: createEnvironmentCommand(runtime, {
      label: "environment-data:workbench-resources:rollback",
      execute: (input: WorkbenchResourceRollbackInput) =>
        withPreparedConnection((loader, prepared) => loader.rollbackResource(prepared, input)),
      scheduler: mutationScheduler,
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
    }),
  };
}
