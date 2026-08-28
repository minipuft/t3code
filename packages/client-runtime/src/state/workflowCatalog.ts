import type {
  AgentWorkbenchPromptApplyInput,
  AgentWorkbenchPromptReviewInput,
  AgentWorkbenchPromptRollbackInput,
  WorkflowCatalogItemId,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom } from "effect/unstable/reactivity";

import type { PreparedConnection } from "../connection/model.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
} from "./runtime.ts";
import { WorkflowCatalogLoader } from "./workflowCatalogHttp.ts";

export { WorkflowCatalogLoader, workflowCatalogLoaderLayer } from "./workflowCatalogHttp.ts";

export class WorkflowCatalogConnectionNotReadyError extends Data.TaggedError(
  "WorkflowCatalogConnectionNotReadyError",
)<{ readonly message: string }> {}

const withPreparedConnection = <A, E>(
  execute: (
    loader: WorkflowCatalogLoader["Service"],
    prepared: PreparedConnection,
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const supervisor = yield* EnvironmentSupervisor;
    const loader = yield* WorkflowCatalogLoader;
    const prepared = yield* SubscriptionRef.get(supervisor.prepared);
    if (Option.isNone(prepared)) {
      return yield* new WorkflowCatalogConnectionNotReadyError({
        message: "The environment HTTP connection is not ready.",
      });
    }
    return yield* execute(loader, prepared.value);
  });

export function createWorkflowCatalogEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | WorkflowCatalogLoader | R, E>,
) {
  const mutationScheduler = createAtomCommandScheduler();
  return {
    list: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workflow-catalog:list",
      staleTimeMs: 30_000,
      execute: (_input: null) =>
        withPreparedConnection((loader, prepared) => loader.load(prepared)),
    }),
    detail: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workflow-catalog:detail",
      staleTimeMs: 30_000,
      execute: (itemId: WorkflowCatalogItemId) =>
        withPreparedConnection((loader, prepared) => loader.detail(prepared, itemId)),
    }),
    history: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workflow-catalog:history",
      staleTimeMs: 5_000,
      execute: (input: { readonly itemId: WorkflowCatalogItemId; readonly limit?: number }) =>
        withPreparedConnection((loader, prepared) =>
          loader.history(prepared, input.itemId, input.limit),
        ),
    }),
    compare: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workflow-catalog:compare",
      staleTimeMs: 5_000,
      execute: (input: {
        readonly itemId: WorkflowCatalogItemId;
        readonly from: number;
        readonly to: number;
      }) =>
        withPreparedConnection((loader, prepared) =>
          loader.compare(prepared, input.itemId, input.from, input.to),
        ),
    }),
    review: createEnvironmentCommand(runtime, {
      label: "environment-data:workflow-catalog:review",
      execute: (input: {
        readonly itemId: WorkflowCatalogItemId;
        readonly value: AgentWorkbenchPromptReviewInput;
      }) =>
        withPreparedConnection((loader, prepared) =>
          loader.review(prepared, input.itemId, input.value),
        ),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.itemId]),
      },
    }),
    apply: createEnvironmentCommand(runtime, {
      label: "environment-data:workflow-catalog:apply",
      execute: (input: {
        readonly itemId: WorkflowCatalogItemId;
        readonly value: AgentWorkbenchPromptApplyInput;
      }) =>
        withPreparedConnection((loader, prepared) =>
          loader.apply(prepared, input.itemId, input.value),
        ),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.itemId]),
      },
    }),
    rollback: createEnvironmentCommand(runtime, {
      label: "environment-data:workflow-catalog:rollback",
      execute: (input: {
        readonly itemId: WorkflowCatalogItemId;
        readonly value: AgentWorkbenchPromptRollbackInput;
      }) =>
        withPreparedConnection((loader, prepared) =>
          loader.rollback(prepared, input.itemId, input.value),
        ),
      scheduler: mutationScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.itemId]),
      },
    }),
  };
}
