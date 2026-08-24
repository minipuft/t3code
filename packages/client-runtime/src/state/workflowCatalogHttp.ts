import type {
  WorkflowCatalogDetail,
  WorkflowCatalogItemId,
  WorkflowCatalogList,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient } from "effect/unstable/http";

import type { PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiClient,
  makeEnvironmentHttpApiUrlBuilder,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";
import { buildEnvironmentAuthHeaders, withEnvironmentCredentials } from "./environmentHttpAuth.ts";

const DEFAULT_WORKFLOW_CATALOG_TIMEOUT_MS = 6_000;

/** Load the authenticated workflow catalog from one prepared environment connection. */
export const fetchEnvironmentWorkflowCatalog = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkflowCatalog",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly timeoutMs?: number;
}) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workflowCatalog.list();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const headers = yield* buildEnvironmentAuthHeaders(
    input.prepared.httpAuthorization,
    "GET",
    requestUrl,
    input.signer,
  );
  return yield* executeEnvironmentHttpRequest(
    requestUrl,
    input.timeoutMs ?? DEFAULT_WORKFLOW_CATALOG_TIMEOUT_MS,
    withEnvironmentCredentials(
      input.prepared.httpAuthorization,
      client.workflowCatalog.list({ headers }),
    ),
  );
});

/** Load authenticated detail for one workflow catalog item. */
export const fetchEnvironmentWorkflowCatalogDetail = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkflowCatalogDetail",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly itemId: WorkflowCatalogItemId;
  readonly timeoutMs?: number;
}) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workflowCatalog.detail({ params: { itemId: input.itemId } });
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const headers = yield* buildEnvironmentAuthHeaders(
    input.prepared.httpAuthorization,
    "GET",
    requestUrl,
    input.signer,
  );
  return yield* executeEnvironmentHttpRequest(
    requestUrl,
    input.timeoutMs ?? DEFAULT_WORKFLOW_CATALOG_TIMEOUT_MS,
    withEnvironmentCredentials(
      input.prepared.httpAuthorization,
      client.workflowCatalog.detail({ params: { itemId: input.itemId }, headers }),
    ),
  );
});

export class WorkflowCatalogLoader extends Context.Service<
  WorkflowCatalogLoader,
  {
    readonly load: (
      prepared: PreparedConnection,
    ) => Effect.Effect<WorkflowCatalogList, RemoteEnvironmentRequestError>;
    readonly detail: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
    ) => Effect.Effect<WorkflowCatalogDetail, RemoteEnvironmentRequestError>;
  }
>()("@t3tools/client-runtime/state/workflowCatalogHttp/WorkflowCatalogLoader") {}

export const workflowCatalogLoaderLayer: Layer.Layer<
  WorkflowCatalogLoader,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  WorkflowCatalogLoader,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    return WorkflowCatalogLoader.of({
      load: (prepared) =>
        fetchEnvironmentWorkflowCatalog({ prepared, signer }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
        ),
      detail: (prepared, itemId) =>
        fetchEnvironmentWorkflowCatalogDetail({ prepared, signer, itemId }).pipe(
          Effect.provideService(HttpClient.HttpClient, httpClient),
        ),
    });
  }),
);
