import type {
  AgentWorkbenchPromptApplyInput,
  AgentWorkbenchPromptHistory,
  AgentWorkbenchPromptMutationResult,
  AgentWorkbenchPromptReview,
  AgentWorkbenchPromptReviewInput,
  AgentWorkbenchPromptRollbackInput,
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
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiClient,
  makeEnvironmentHttpApiUrlBuilder,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";
import {
  buildEnvironmentAuthHeaders,
  type EnvironmentHttpAuthHeaders,
  withEnvironmentCredentials,
} from "./environmentHttpAuth.ts";

const DEFAULT_WORKFLOW_CATALOG_TIMEOUT_MS = 6_000;

interface WorkflowCatalogRequestContext {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly timeoutMs?: number;
}

const queryUrl = (
  httpBaseUrl: string,
  pathname: string,
  query: Readonly<Record<string, string>>,
) => {
  const url = new URL(environmentEndpointUrl(httpBaseUrl, pathname));
  url.search = new URLSearchParams(query).toString();
  return url.toString();
};

const executeRequest = Effect.fn("clientRuntime.state.executeWorkflowCatalogRequest")(function* <
  A,
  E,
>(
  input: WorkflowCatalogRequestContext & {
    readonly method: "GET" | "POST";
    readonly requestUrl: string;
    readonly request: (
      headers: EnvironmentHttpAuthHeaders,
    ) => Effect.Effect<A, E, HttpClient.HttpClient>;
  },
) {
  const headers = yield* buildEnvironmentAuthHeaders(
    input.prepared.httpAuthorization,
    input.method,
    input.requestUrl,
    input.signer,
  );
  return yield* executeEnvironmentHttpRequest(
    input.requestUrl,
    input.timeoutMs ?? DEFAULT_WORKFLOW_CATALOG_TIMEOUT_MS,
    withEnvironmentCredentials(input.prepared.httpAuthorization, input.request(headers)),
  );
});

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
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workflowCatalog.list({ headers }),
  });
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
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) =>
      client.workflowCatalog.detail({ params: { itemId: input.itemId }, headers }),
  });
});

export const fetchEnvironmentWorkflowPromptHistory = Effect.fn(
  "clientRuntime.state.fetchWorkflowPromptHistory",
)(function* (
  input: WorkflowCatalogRequestContext & {
    readonly itemId: WorkflowCatalogItemId;
    readonly limit?: number;
  },
) {
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const payload = input.limit === undefined ? {} : { limit: input.limit };
  const requestUrl = queryUrl(
    input.prepared.httpBaseUrl,
    `/api/workflows/${encodeURIComponent(input.itemId)}/history`,
    input.limit === undefined ? {} : { limit: String(input.limit) },
  );
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) =>
      client.workflowCatalog.history({ params: { itemId: input.itemId }, payload, headers }),
  });
});

export const compareEnvironmentWorkflowPrompt = Effect.fn(
  "clientRuntime.state.compareWorkflowPrompt",
)(function* (
  input: WorkflowCatalogRequestContext & {
    readonly itemId: WorkflowCatalogItemId;
    readonly from: number;
    readonly to: number;
  },
) {
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const payload = { from: input.from, to: input.to };
  const requestUrl = queryUrl(
    input.prepared.httpBaseUrl,
    `/api/workflows/${encodeURIComponent(input.itemId)}/compare`,
    { from: String(input.from), to: String(input.to) },
  );
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) =>
      client.workflowCatalog.compare({ params: { itemId: input.itemId }, payload, headers }),
  });
});

export const reviewEnvironmentWorkflowPrompt = Effect.fn(
  "clientRuntime.state.reviewWorkflowPrompt",
)(function* (
  input: WorkflowCatalogRequestContext & {
    readonly itemId: WorkflowCatalogItemId;
    readonly value: AgentWorkbenchPromptReviewInput;
  },
) {
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const requestUrl = makeEnvironmentHttpApiUrlBuilder(
    input.prepared.httpBaseUrl,
  ).workflowCatalog.review({ params: { itemId: input.itemId } });
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) =>
      client.workflowCatalog.review({
        params: { itemId: input.itemId },
        payload: input.value,
        headers,
      }),
  });
});

export const applyEnvironmentWorkflowPrompt = Effect.fn("clientRuntime.state.applyWorkflowPrompt")(
  function* (
    input: WorkflowCatalogRequestContext & {
      readonly itemId: WorkflowCatalogItemId;
      readonly value: AgentWorkbenchPromptApplyInput;
    },
  ) {
    const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
    const requestUrl = makeEnvironmentHttpApiUrlBuilder(
      input.prepared.httpBaseUrl,
    ).workflowCatalog.apply({ params: { itemId: input.itemId } });
    return yield* executeRequest({
      ...input,
      method: "POST",
      requestUrl,
      request: (headers) =>
        client.workflowCatalog.apply({
          params: { itemId: input.itemId },
          payload: input.value,
          headers,
        }),
    });
  },
);

export const rollbackEnvironmentWorkflowPrompt = Effect.fn(
  "clientRuntime.state.rollbackWorkflowPrompt",
)(function* (
  input: WorkflowCatalogRequestContext & {
    readonly itemId: WorkflowCatalogItemId;
    readonly value: AgentWorkbenchPromptRollbackInput;
  },
) {
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const requestUrl = makeEnvironmentHttpApiUrlBuilder(
    input.prepared.httpBaseUrl,
  ).workflowCatalog.rollback({ params: { itemId: input.itemId } });
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) =>
      client.workflowCatalog.rollback({
        params: { itemId: input.itemId },
        payload: input.value,
        headers,
      }),
  });
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
    readonly history: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
      limit?: number,
    ) => Effect.Effect<AgentWorkbenchPromptHistory, RemoteEnvironmentRequestError>;
    readonly compare: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
      from: number,
      to: number,
    ) => Effect.Effect<AgentWorkbenchPromptReview, RemoteEnvironmentRequestError>;
    readonly review: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
      input: AgentWorkbenchPromptReviewInput,
    ) => Effect.Effect<AgentWorkbenchPromptReview, RemoteEnvironmentRequestError>;
    readonly apply: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
      input: AgentWorkbenchPromptApplyInput,
    ) => Effect.Effect<AgentWorkbenchPromptMutationResult, RemoteEnvironmentRequestError>;
    readonly rollback: (
      prepared: PreparedConnection,
      itemId: WorkflowCatalogItemId,
      input: AgentWorkbenchPromptRollbackInput,
    ) => Effect.Effect<AgentWorkbenchPromptMutationResult, RemoteEnvironmentRequestError>;
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
    const provideHttp = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, httpClient));
    return WorkflowCatalogLoader.of({
      load: (prepared) => provideHttp(fetchEnvironmentWorkflowCatalog({ prepared, signer })),
      detail: (prepared, itemId) =>
        provideHttp(fetchEnvironmentWorkflowCatalogDetail({ prepared, signer, itemId })),
      history: (prepared, itemId, limit) =>
        provideHttp(
          fetchEnvironmentWorkflowPromptHistory({
            prepared,
            signer,
            itemId,
            ...(limit === undefined ? {} : { limit }),
          }),
        ),
      compare: (prepared, itemId, from, to) =>
        provideHttp(compareEnvironmentWorkflowPrompt({ prepared, signer, itemId, from, to })),
      review: (prepared, itemId, value) =>
        provideHttp(reviewEnvironmentWorkflowPrompt({ prepared, signer, itemId, value })),
      apply: (prepared, itemId, value) =>
        provideHttp(applyEnvironmentWorkflowPrompt({ prepared, signer, itemId, value })),
      rollback: (prepared, itemId, value) =>
        provideHttp(rollbackEnvironmentWorkflowPrompt({ prepared, signer, itemId, value })),
    });
  }),
);
