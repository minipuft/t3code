import {
  AuthAccessWriteScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentAuthenticatedPrincipal,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpConflictError,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { HttpServerRequest } from "effect/unstable/http";

import {
  annotateEnvironmentRequest,
  failEnvironmentInvalidRequest,
  failEnvironmentInternal,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { deriveAuthClientMetadata } from "../auth/utils.ts";
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
        if (error.reason === "unsupported_version") {
          return yield* failEnvironmentInternal("incompatible_workbench_version", error);
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
          return yield* failEnvironmentNotFound("workbench_resource_not_found");
        }
        return yield* failEnvironmentInternal("internal_error", error);
      }),
    ),
  );

const handleResourceAdapterError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
  effect.pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        if (error.reason === "not_found") {
          return yield* failEnvironmentNotFound("workbench_resource_not_found");
        }
        if (error.reason === "conflict") {
          return yield* new EnvironmentHttpConflictError({
            message: "The resource changed after review. Refresh and review it again.",
          });
        }
        if (error.reason === "invalid_request") {
          return yield* failEnvironmentInvalidRequest("invalid_command");
        }
        return yield* failEnvironmentInternal("internal_error", error);
      }),
    ),
  );

const handleResourceSnapshotError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
  effect.pipe(Effect.catch((error) => failEnvironmentInternal("internal_error", error)));

const handleTopologyError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
  effect.pipe(
    Effect.catch((error) =>
      failEnvironmentInternal(
        error.reason === "unsupported_version" || error.reason === "invalid_response"
          ? "incompatible_workbench_version"
          : "internal_error",
        error,
      ),
    ),
  );

const handleResourceSourceError = <A>(effect: Effect.Effect<A, WorkbenchPlansAdapterError>) =>
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

export const directLocalAdministrativeRequest = Effect.fn("workbench.resources.directLocal")(
  function* () {
    const principal = yield* EnvironmentAuthenticatedPrincipal;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const ipAddress = deriveAuthClientMetadata({ request }).ipAddress;
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedAddresses = forwardedFor
      ?.split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    const forwardedRequest =
      request.headers["x-forwarded-host"] !== undefined ||
      request.headers["x-forwarded-proto"] !== undefined;
    return (
      principal.method !== "dpop-access-token" &&
      isLoopbackAddress(ipAddress) &&
      (!forwardedRequest || forwardedAddresses !== undefined) &&
      (forwardedAddresses === undefined ||
        (forwardedAddresses.length > 0 && forwardedAddresses.every(isLoopbackAddress)))
    );
  },
);

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

const requireDirectLocalAdministrativeRequest = Effect.gen(function* () {
  const principal = yield* requireEnvironmentScope(AuthAccessWriteScope);
  if (!(yield* directLocalAdministrativeRequest())) {
    return yield* new EnvironmentHttpForbiddenError({
      message: "Canonical resource changes require a direct local administrative session.",
    });
  }
  return principal;
});

export const workbenchPlansHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "workbenchPlans",
  Effect.fnUntraced(function* (handlers) {
    const plans = yield* WorkbenchPlans;
    return handlers
      .handle("associations", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(handleReadAdapterError(plans.associations(payload))),
        ),
      )
      .handle("associate", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationOperateScope)),
          Effect.andThen(handleAdapterError(plans.associate(payload))),
        ),
      )
      .handle("suggest", ({ endpoint, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(handleReadAdapterError(plans.suggest(payload))),
        ),
      )
      .handle("vitals", ({ endpoint }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(plans.vitals),
        ),
      )
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
      )
      .handle("topology", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleTopologyError(plans.topology);
        }),
      )
      .handle("reviewRelationship", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(plans.reviewRelationship(payload));
        }),
      )
      .handle("resourceLibrary", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.resourceLibrary(payload));
        }),
      )
      .handle("reviewInbox", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.reviewInbox);
        }),
      )
      .handle("reviewInboxCommand", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(plans.reviewInboxCommand(payload));
        }),
      )
      .handle("projectionHealth", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.projectionHealth);
        }),
      )
      .handle("reviewProjection", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(plans.reviewProjection(payload));
        }),
      )
      .handle("applyProjection", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(plans.applyProjection(payload));
        }),
      )
      .handle("rollbackProjection", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(plans.rollbackProjection(payload));
        }),
      )
      .handle("resourceAuthority", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.resourceAuthority(principal.sessionId));
        }),
      )
      .handle("unlockResources", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthAccessWriteScope);
          const directLocal = yield* directLocalAdministrativeRequest();
          return yield* handleResourceAdapterError(
            plans.unlockResources(principal.sessionId, directLocal),
          );
        }),
      )
      .handle("relockResources", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthAccessWriteScope);
          return yield* handleResourceAdapterError(plans.relockResources(principal.sessionId));
        }),
      )
      .handle("resourcePolicy", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.resourcePolicy(principal.sessionId));
        }),
      )
      .handle("resourceMutations", ({ endpoint }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSnapshotError(plans.resourceMutations);
        }),
      )
      .handle("resourceSource", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleResourceSourceError(plans.resourceSource(payload));
        }),
      )
      .handle("reviewResource", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(
            plans.reviewResource(principal.sessionId, payload),
          );
        }),
      )
      .handle("applyResource", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(
            plans.applyResource(principal.sessionId, payload),
          );
        }),
      )
      .handle("rollbackResource", ({ endpoint, payload }) =>
        Effect.gen(function* () {
          yield* annotateEnvironmentRequest(endpoint.name);
          const principal = yield* requireDirectLocalAdministrativeRequest;
          return yield* handleResourceAdapterError(
            plans.rollbackResource(principal.sessionId, payload),
          );
        }),
      );
  }),
);
