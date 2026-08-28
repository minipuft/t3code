import { EnvironmentId, WorkflowCatalogItemId, WorkflowRevision } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { PrimaryConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import {
  applyEnvironmentWorkflowPrompt,
  fetchEnvironmentWorkflowCatalog,
  fetchEnvironmentWorkflowCatalogDetail,
  fetchEnvironmentWorkflowPromptHistory,
} from "./workflowCatalogHttp.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test/base",
  wsBaseUrl: "wss://environment.example.test",
});

const PREPARED: PreparedConnection = {
  environmentId: TARGET.environmentId,
  label: TARGET.label,
  httpBaseUrl: TARGET.httpBaseUrl,
  socketUrl: "wss://environment.example.test/ws",
  httpAuthorization: null,
  target: TARGET,
};

describe("fetchEnvironmentWorkflowCatalog", () => {
  it.effect("gets the catalog from the prepared environment with browser credentials", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({
            capability: { status: "available", sourceKind: "http", reason: null },
            items: [
              {
                kind: "prompt",
                id: WorkflowCatalogItemId.make("strategicImplement"),
                name: "Strategic implementation",
                category: "development",
                description: "Implement an approved plan",
                arguments: [],
                composerInputArgument: null,
                executionType: "single",
                providers: [],
                revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
              },
            ],
          }),
        );
      }) satisfies typeof fetch;

      const result = yield* fetchEnvironmentWorkflowCatalog({
        prepared: PREPARED,
        signer: Option.none(),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe("strategicImplement");
      expect(calls).toHaveLength(1);
      const [request, init] = calls[0]!;
      expect(String(request)).toBe("https://environment.example.test/api/workflows");
      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("include");
    }),
  );

  it.effect("uses the prepared bearer credential without browser cookies", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({
            capability: { status: "available", sourceKind: "http", reason: null },
            items: [],
          }),
        );
      }) satisfies typeof fetch;

      yield* fetchEnvironmentWorkflowCatalog({
        prepared: {
          ...PREPARED,
          httpAuthorization: { _tag: "Bearer", token: "test-environment-token" },
        },
        signer: Option.none(),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      const [, init] = calls[0]!;
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-environment-token");
      expect(init.credentials).toBeUndefined();
    }),
  );

  it.effect("loads protected prompt detail through the authenticated environment endpoint", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const itemId = WorkflowCatalogItemId.make("strategicImplement");
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({
            summary: {
              kind: "prompt",
              id: itemId,
              name: "Strategic implementation",
              category: "development",
              description: "Implement an approved plan",
              arguments: [],
              composerInputArgument: null,
              executionType: "single",
              providers: [],
              revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
            },
            currentVersion: 2,
            userMessageTemplate: "Implement {{ task }}",
            systemMessage: null,
          }),
        );
      }) satisfies typeof fetch;

      const detail = yield* fetchEnvironmentWorkflowCatalogDetail({
        prepared: {
          ...PREPARED,
          httpAuthorization: { _tag: "Bearer", token: "test-environment-token" },
        },
        signer: Option.none(),
        itemId,
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect("summary" in detail ? detail.userMessageTemplate : null).toBe("Implement {{ task }}");
      const [request, init] = calls[0]!;
      expect(String(request)).toBe(
        "https://environment.example.test/api/workflows/strategicImplement",
      );
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-environment-token");
    }),
  );

  it.effect("binds a DPoP proof to the prepared environment request", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const proofInputs: Array<{ readonly method: string; readonly url: string }> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({
            capability: { status: "available", sourceKind: "http", reason: null },
            items: [],
          }),
        );
      }) satisfies typeof fetch;
      const signer = ManagedRelayDpopSigner.of({
        thumbprint: Effect.succeed("test-thumbprint"),
        createProof: (input) => {
          proofInputs.push({ method: input.method, url: input.url });
          return Effect.succeed("test-dpop-proof");
        },
      });

      yield* fetchEnvironmentWorkflowCatalog({
        prepared: {
          ...PREPARED,
          httpAuthorization: { _tag: "Dpop", accessToken: "test-access-token" },
        },
        signer: Option.some(signer),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect(proofInputs).toEqual([
        { method: "GET", url: "https://environment.example.test/api/workflows" },
      ]);
      const [, init] = calls[0]!;
      const headers = new Headers(init.headers);
      expect(headers.get("authorization")).toBe("DPoP test-access-token");
      expect(headers.get("dpop")).toBe("test-dpop-proof");
      expect(init.credentials).toBeUndefined();
    }),
  );

  it.effect(
    "routes prompt history reads and administrative mutations through the environment",
    () =>
      Effect.gen(function* () {
        const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
        const itemId = WorkflowCatalogItemId.make("strategicImplement");
        const fetchFn = ((request, init) => {
          calls.push([request, init ?? {}]);
          const pathname = new URL(String(request)).pathname;
          return Promise.resolve(
            pathname.endsWith("/history")
              ? Response.json({ state: "available", current_version: 2, versions: [] })
              : Response.json({ state: "available" }),
          );
        }) satisfies typeof fetch;
        const prepared = {
          ...PREPARED,
          httpAuthorization: { _tag: "Bearer" as const, token: "test-environment-token" },
        };
        const layer = remoteHttpClientLayer(fetchFn);

        yield* fetchEnvironmentWorkflowPromptHistory({
          prepared,
          signer: Option.none(),
          itemId,
          limit: 50,
        }).pipe(Effect.provide(layer));
        yield* applyEnvironmentWorkflowPrompt({
          prepared,
          signer: Option.none(),
          itemId,
          value: {
            expected_version: 2,
            user_message_template: "Version three",
            requestId: "request-12345678",
          },
        }).pipe(Effect.provide(layer));

        expect(String(calls[0]?.[0])).toBe(
          "https://environment.example.test/api/workflows/strategicImplement/history?limit=50",
        );
        expect(calls[0]?.[1].method).toBe("GET");
        expect(String(calls[1]?.[0])).toBe(
          "https://environment.example.test/api/workflows/strategicImplement/apply",
        );
        expect(calls[1]?.[1].method).toBe("POST");
        const requestBody = calls[1]?.[1].body;
        if (typeof requestBody !== "string" && !(requestBody instanceof Uint8Array)) {
          throw new Error("expected an encoded JSON request body");
        }
        const requestText =
          typeof requestBody === "string" ? requestBody : new TextDecoder().decode(requestBody);
        expect(requestText).toContain('"expected_version":2');
        expect(requestText).toContain('"requestId":"request-12345678"');
      }),
  );
});
