import { EnvironmentId, WorkflowCatalogItemId, WorkflowRevision } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { PrimaryConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import { fetchEnvironmentWorkflowCatalog } from "./workflowCatalogHttp.ts";

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
});
