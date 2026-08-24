import type {
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanMutationInput,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
} from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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

export class WorkbenchPlansConnectionNotReadyError extends Data.TaggedError(
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
  };
}
