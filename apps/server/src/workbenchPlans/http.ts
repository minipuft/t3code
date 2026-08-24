import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpConflictError,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
  failEnvironmentInvalidRequest,
  failEnvironmentInternal,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { WorkbenchPlans, type WorkbenchPlansAdapterError } from "./WorkbenchPlans.ts";

const handleAdapterError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        if (error.reason === "invalid_request") {
          return yield* failEnvironmentInvalidRequest("invalid_command");
        }
        if (error.reason === "not_found") {
          return yield* failEnvironmentNotFound("workbench_plan_not_found");
        }
        if (error.reason === "conflict") {
          return yield* new EnvironmentHttpConflictError({
            message: "The plan changed after it was opened. Refresh before saving again.",
          });
        }
        return yield* failEnvironmentInternal("internal_error", error);
      }),
    ),
  );

const handleReadAdapterError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        if (error.reason === "not_found") {
          return yield* failEnvironmentNotFound("workbench_plan_not_found");
        }
        return yield* failEnvironmentInternal("internal_error", error);
      }),
    ),
  );

export const workbenchPlansHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "workbenchPlans",
  Effect.fnUntraced(function* (handlers) {
    const plans = yield* WorkbenchPlans;
    return handlers
      .handle("list", ({ endpoint }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(plans.list),
        ),
      )
      .handle("source", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(handleReadAdapterError(plans.read(payload.path))),
        ),
      )
      .handle("save", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationOperateScope)),
          Effect.andThen(handleAdapterError(plans.save(payload))),
        ),
      )
      .handle("mutate", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationOperateScope)),
          Effect.andThen(handleAdapterError(plans.mutate(payload))),
        ),
      )
      .handle("annotations", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(handleReadAdapterError(plans.readAnnotations(payload.path))),
        ),
      )
      .handle("annotate", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationOperateScope)),
          Effect.andThen(handleAdapterError(plans.mutateAnnotations(payload))),
        ),
      );
  }),
);
