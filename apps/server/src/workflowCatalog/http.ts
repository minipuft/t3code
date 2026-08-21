import {
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
  type WorkflowCatalogItemId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import {
  annotateEnvironmentRequest,
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
  const item = yield* catalog.find(itemId);
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

export const workflowCatalogHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "workflowCatalog",
  Effect.fnUntraced(function* (handlers) {
    const catalog = yield* WorkflowCatalog;
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
      );
  }),
);
