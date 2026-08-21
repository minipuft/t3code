import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Option from "effect/Option";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { createEnvironmentQueryAtomFamily } from "./runtime.ts";
import { WorkflowCatalogLoader } from "./workflowCatalogHttp.ts";

export { WorkflowCatalogLoader, workflowCatalogLoaderLayer } from "./workflowCatalogHttp.ts";

export class WorkflowCatalogConnectionNotReadyError extends Data.TaggedError(
  "WorkflowCatalogConnectionNotReadyError",
)<{ readonly message: string }> {}

export function createWorkflowCatalogEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | WorkflowCatalogLoader | R, E>,
) {
  return {
    list: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:workflow-catalog:list",
      staleTimeMs: 30_000,
      execute: (_input: null) =>
        Effect.gen(function* () {
          const supervisor = yield* EnvironmentSupervisor;
          const loader = yield* WorkflowCatalogLoader;
          const prepared = yield* SubscriptionRef.get(supervisor.prepared);
          if (Option.isNone(prepared)) {
            return yield* new WorkflowCatalogConnectionNotReadyError({
              message: "The environment HTTP connection is not ready.",
            });
          }
          return yield* loader.load(prepared.value);
        }),
    }),
  };
}
