import type {
  WorkbenchConversationInput,
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanAnnotations,
  WorkbenchPlanAssociationMutationInput,
  WorkbenchPlanAssociations,
  WorkbenchPlanList,
  WorkbenchPlanMutationInput,
  WorkbenchPlanMutationResult,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
  WorkbenchPlanSaveResult,
  WorkbenchPlanSourceDocument,
  WorkbenchPlanSuggestionInput,
  WorkbenchPlanSuggestions,
  WorkbenchVitalsSnapshot,
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

const DEFAULT_WORKBENCH_PLANS_TIMEOUT_MS = 8_000;

interface WorkbenchPlansRequestContext {
  readonly prepared: PreparedConnection;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly timeoutMs?: number;
}

const environmentQueryUrl = (
  httpBaseUrl: string,
  pathname: string,
  query: Readonly<Record<string, string>>,
): string => {
  const url = new URL(environmentEndpointUrl(httpBaseUrl, pathname));
  url.search = new URLSearchParams(query).toString();
  return url.toString();
};

const executeRequest = Effect.fn("clientRuntime.state.executeWorkbenchPlansRequest")(function* <
  A,
  E,
>(
  input: WorkbenchPlansRequestContext & {
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
    input.timeoutMs ?? DEFAULT_WORKBENCH_PLANS_TIMEOUT_MS,
    withEnvironmentCredentials(input.prepared.httpAuthorization, input.request(headers)),
  );
});

export const fetchEnvironmentWorkbenchPlans = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkbenchPlans",
)(function* (input: WorkbenchPlansRequestContext) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.list();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workbenchPlans.list({ headers }),
  });
});

export const fetchEnvironmentWorkbenchPlanAssociations = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkbenchPlanAssociations",
)(function* (input: WorkbenchPlansRequestContext & { readonly value: WorkbenchConversationInput }) {
  const requestUrl = environmentQueryUrl(
    input.prepared.httpBaseUrl,
    "/api/workbench/plans/associations",
    input.value.project === undefined
      ? { threadId: input.value.threadId }
      : { threadId: input.value.threadId, project: input.value.project },
  );
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workbenchPlans.associations({ payload: input.value, headers }),
  });
});

export const associateEnvironmentWorkbenchPlan = Effect.fn(
  "clientRuntime.state.associateEnvironmentWorkbenchPlan",
)(function* (
  input: WorkbenchPlansRequestContext & {
    readonly value: WorkbenchPlanAssociationMutationInput;
  },
) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.associate();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) => client.workbenchPlans.associate({ payload: input.value, headers }),
  });
});

export const suggestEnvironmentWorkbenchPlans = Effect.fn(
  "clientRuntime.state.suggestEnvironmentWorkbenchPlans",
)(function* (
  input: WorkbenchPlansRequestContext & { readonly value: WorkbenchPlanSuggestionInput },
) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.suggest();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const suggestions = yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) => client.workbenchPlans.suggest({ payload: input.value, headers }),
  });
  return { ...suggestions, items: suggestions.items.slice(0, 3) };
});

export const fetchEnvironmentWorkbenchVitals = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkbenchVitals",
)(function* (input: WorkbenchPlansRequestContext) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.vitals();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workbenchPlans.vitals({ headers }),
  });
});

export const fetchEnvironmentWorkbenchPlanSource = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkbenchPlanSource",
)(function* (input: WorkbenchPlansRequestContext & { readonly path: WorkbenchPlanPath }) {
  const payload = { path: input.path };
  const requestUrl = environmentQueryUrl(
    input.prepared.httpBaseUrl,
    "/api/workbench/plans/source",
    payload,
  );
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workbenchPlans.source({ payload, headers }),
  });
});

export const saveEnvironmentWorkbenchPlan = Effect.fn(
  "clientRuntime.state.saveEnvironmentWorkbenchPlan",
)(function* (input: WorkbenchPlansRequestContext & { readonly value: WorkbenchPlanSaveInput }) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.save();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) => client.workbenchPlans.save({ payload: input.value, headers }),
  });
});

export const mutateEnvironmentWorkbenchPlan = Effect.fn(
  "clientRuntime.state.mutateEnvironmentWorkbenchPlan",
)(function* (input: WorkbenchPlansRequestContext & { readonly value: WorkbenchPlanMutationInput }) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.mutate();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) => {
      switch (input.value.op) {
        case "move":
          return client.workbenchPlans.mutate({ payload: input.value, headers });
        case "rename":
          return client.workbenchPlans.mutate({ payload: input.value, headers });
        case "create":
          return client.workbenchPlans.mutate({ payload: input.value, headers });
      }
    },
  });
});

export const fetchEnvironmentWorkbenchPlanAnnotations = Effect.fn(
  "clientRuntime.state.fetchEnvironmentWorkbenchPlanAnnotations",
)(function* (input: WorkbenchPlansRequestContext & { readonly path: WorkbenchPlanPath }) {
  const payload = { path: input.path };
  const requestUrl = environmentQueryUrl(
    input.prepared.httpBaseUrl,
    "/api/workbench/plans/annotations",
    payload,
  );
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "GET",
    requestUrl,
    request: (headers) => client.workbenchPlans.annotations({ payload, headers }),
  });
});

export const mutateEnvironmentWorkbenchPlanAnnotations = Effect.fn(
  "clientRuntime.state.mutateEnvironmentWorkbenchPlanAnnotations",
)(function* (
  input: WorkbenchPlansRequestContext & { readonly value: WorkbenchPlanAnnotationMutationInput },
) {
  const urlBuilder = makeEnvironmentHttpApiUrlBuilder(input.prepared.httpBaseUrl);
  const requestUrl = urlBuilder.workbenchPlans.annotate();
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  return yield* executeRequest({
    ...input,
    method: "POST",
    requestUrl,
    request: (headers) =>
      input.value.op === "add"
        ? client.workbenchPlans.annotate({ payload: input.value, headers })
        : client.workbenchPlans.annotate({ payload: input.value, headers }),
  });
});

export class WorkbenchPlansLoader extends Context.Service<
  WorkbenchPlansLoader,
  {
    readonly list: (
      prepared: PreparedConnection,
    ) => Effect.Effect<WorkbenchPlanList, RemoteEnvironmentRequestError>;
    readonly vitals: (
      prepared: PreparedConnection,
    ) => Effect.Effect<WorkbenchVitalsSnapshot, RemoteEnvironmentRequestError>;
    readonly associations: (
      prepared: PreparedConnection,
      input: WorkbenchConversationInput,
    ) => Effect.Effect<WorkbenchPlanAssociations, RemoteEnvironmentRequestError>;
    readonly associate: (
      prepared: PreparedConnection,
      input: WorkbenchPlanAssociationMutationInput,
    ) => Effect.Effect<WorkbenchPlanAssociations, RemoteEnvironmentRequestError>;
    readonly suggest: (
      prepared: PreparedConnection,
      input: WorkbenchPlanSuggestionInput,
    ) => Effect.Effect<WorkbenchPlanSuggestions, RemoteEnvironmentRequestError>;
    readonly read: (
      prepared: PreparedConnection,
      path: WorkbenchPlanPath,
    ) => Effect.Effect<WorkbenchPlanSourceDocument, RemoteEnvironmentRequestError>;
    readonly save: (
      prepared: PreparedConnection,
      input: WorkbenchPlanSaveInput,
    ) => Effect.Effect<WorkbenchPlanSaveResult, RemoteEnvironmentRequestError>;
    readonly mutate: (
      prepared: PreparedConnection,
      input: WorkbenchPlanMutationInput,
    ) => Effect.Effect<WorkbenchPlanMutationResult, RemoteEnvironmentRequestError>;
    readonly annotations: (
      prepared: PreparedConnection,
      path: WorkbenchPlanPath,
    ) => Effect.Effect<WorkbenchPlanAnnotations, RemoteEnvironmentRequestError>;
    readonly annotate: (
      prepared: PreparedConnection,
      input: WorkbenchPlanAnnotationMutationInput,
    ) => Effect.Effect<WorkbenchPlanAnnotations, RemoteEnvironmentRequestError>;
  }
>()("@t3tools/client-runtime/state/workbenchPlansHttp/WorkbenchPlansLoader") {}

export const workbenchPlansLoaderLayer: Layer.Layer<
  WorkbenchPlansLoader,
  never,
  HttpClient.HttpClient
> = Layer.effect(
  WorkbenchPlansLoader,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const provideHttp = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, httpClient));
    return WorkbenchPlansLoader.of({
      list: (prepared) => provideHttp(fetchEnvironmentWorkbenchPlans({ prepared, signer })),
      vitals: (prepared) => provideHttp(fetchEnvironmentWorkbenchVitals({ prepared, signer })),
      associations: (prepared, value) =>
        provideHttp(fetchEnvironmentWorkbenchPlanAssociations({ prepared, value, signer })),
      associate: (prepared, value) =>
        provideHttp(associateEnvironmentWorkbenchPlan({ prepared, value, signer })),
      suggest: (prepared, value) =>
        provideHttp(suggestEnvironmentWorkbenchPlans({ prepared, value, signer })),
      read: (prepared, path) =>
        provideHttp(fetchEnvironmentWorkbenchPlanSource({ prepared, path, signer })),
      save: (prepared, value) =>
        provideHttp(saveEnvironmentWorkbenchPlan({ prepared, value, signer })),
      mutate: (prepared, value) =>
        provideHttp(mutateEnvironmentWorkbenchPlan({ prepared, value, signer })),
      annotations: (prepared, path) =>
        provideHttp(fetchEnvironmentWorkbenchPlanAnnotations({ prepared, path, signer })),
      annotate: (prepared, value) =>
        provideHttp(mutateEnvironmentWorkbenchPlanAnnotations({ prepared, value, signer })),
    });
  }),
);
