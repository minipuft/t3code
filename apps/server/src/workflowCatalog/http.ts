import {
  AuthAccessWriteScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
  type WorkflowCatalogItemId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  AgentWorkbench,
  type AgentWorkbenchAdapterError,
  type AgentWorkbenchShape,
} from "../agentWorkbenchAdapter/AgentWorkbench.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { WorkflowCatalog, type WorkflowCatalogShape } from "./WorkflowCatalog.ts";

const listFromCatalog = Effect.fn("workflowCatalog.http.list")(function* (
  catalog: WorkflowCatalogShape,
) {
  yield* requireEnvironmentScope(AuthOrchestrationReadScope);
  return yield* catalog.list;
});

const findFromCatalog = Effect.fn("workflowCatalog.http.find")(function* (
  catalog: WorkflowCatalogShape,
  itemId: WorkflowCatalogItemId,
) {
  yield* requireEnvironmentScope(AuthOrchestrationReadScope);
  const item = yield* catalog
    .findDetail(itemId)
    .pipe(Effect.catch((error) => failEnvironmentInternal("internal_error", error)));
  if (Option.isNone(item)) {
    return yield* failEnvironmentNotFound("workflow_catalog_item_not_found");
  }
  return item.value;
});

export const listWorkflowCatalog = Effect.fn("workflowCatalog.http.listFromContext")(function* () {
  return yield* listFromCatalog(yield* WorkflowCatalog);
});

export const findWorkflowCatalogItem = Effect.fn("workflowCatalog.http.findFromContext")(function* (
  itemId: WorkflowCatalogItemId,
) {
  return yield* findFromCatalog(yield* WorkflowCatalog, itemId);
});

const throughWorkbench = <A>(effect: Effect.Effect<A, AgentWorkbenchAdapterError>) =>
  effect.pipe(Effect.catch((error) => failEnvironmentInternal("internal_error", error)));

export const readWorkflowPromptHistory = Effect.fn("workflowCatalog.http.promptHistory")(function* (
  workbench: AgentWorkbenchShape,
  itemId: WorkflowCatalogItemId,
  limit?: number,
) {
  yield* requireEnvironmentScope(AuthOrchestrationReadScope);
  return yield* throughWorkbench(workbench.promptHistory(itemId, limit));
});

export const reviewWorkflowPrompt = Effect.fn("workflowCatalog.http.promptReview")(function* (
  workbench: AgentWorkbenchShape,
  itemId: WorkflowCatalogItemId,
  input: unknown,
) {
  yield* requireEnvironmentScope(AuthAccessWriteScope);
  return yield* throughWorkbench(workbench.reviewPrompt(itemId, input));
});

export const workflowCatalogHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "workflowCatalog",
  Effect.fnUntraced(function* (handlers) {
    const catalog = yield* WorkflowCatalog;
    const workbench = yield* AgentWorkbench;
    return handlers
      .handle(
        "list",
        Effect.fn("environment.workflowCatalog.list")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          return yield* listFromCatalog(catalog);
        }),
      )
      .handle(
        "detail",
        Effect.fn("environment.workflowCatalog.detail")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          return yield* findFromCatalog(catalog, args.params.itemId);
        }),
      )
      .handle("history", ({ endpoint, params, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(readWorkflowPromptHistory(workbench, params.itemId, payload.limit)),
        ),
      )
      .handle("compare", ({ endpoint, params, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthOrchestrationReadScope)),
          Effect.andThen(
            throughWorkbench(workbench.comparePrompt(params.itemId, payload.from, payload.to)),
          ),
        ),
      )
      .handle("review", ({ endpoint, params, payload }) =>
        annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(reviewWorkflowPrompt(workbench, params.itemId, payload)),
        ),
      )
      .handle("apply", ({ endpoint, params, payload }) => {
        const { requestId, ...input } = payload;
        return annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthAccessWriteScope)),
          Effect.andThen(throughWorkbench(workbench.applyPrompt(params.itemId, requestId, input))),
        );
      })
      .handle("rollback", ({ endpoint, params, payload }) => {
        const { requestId, ...input } = payload;
        return annotateEnvironmentRequest(endpoint.name).pipe(
          Effect.andThen(requireEnvironmentScope(AuthAccessWriteScope)),
          Effect.andThen(
            throughWorkbench(workbench.rollbackPrompt(params.itemId, requestId, input)),
          ),
        );
      });
  }),
);
