import { EnvironmentId, ThreadId, WorkbenchPlanPath } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { PrimaryConnectionTarget, type PreparedConnection } from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { remoteHttpClientLayer } from "../rpc/http.ts";
import {
  associateEnvironmentWorkbenchPlan,
  fetchEnvironmentWorkbenchPlanAssociations,
  fetchEnvironmentWorkbenchPlanAnnotations,
  fetchEnvironmentWorkbenchPlanSource,
  fetchEnvironmentWorkbenchPlans,
  fetchEnvironmentWorkbenchVitals,
  mutateEnvironmentWorkbenchPlan,
  saveEnvironmentWorkbenchPlan,
  suggestEnvironmentWorkbenchPlans,
} from "./workbenchPlansHttp.ts";

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

const PLAN_PATH = WorkbenchPlanPath.make("t3code/phase 4.md");

function requestBody(init: RequestInit): unknown {
  const body =
    typeof init.body === "string"
      ? init.body
      : init.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : "";
  return JSON.parse(body);
}

describe("Workbench plan environment HTTP", () => {
  it.effect("lists plans from the prepared environment with browser credentials", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({ capability: { status: "available", reason: null }, items: [] }),
        );
      }) satisfies typeof fetch;

      const result = yield* fetchEnvironmentWorkbenchPlans({
        prepared: PREPARED,
        signer: Option.none(),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect(result.items).toEqual([]);
      expect(String(calls[0]?.[0])).toBe("https://environment.example.test/api/workbench/plans");
      expect(calls[0]?.[1].method).toBe("GET");
      expect(calls[0]?.[1].credentials).toBe("include");
    }),
  );

  it.effect("reads quota through the authenticated environment instead of the browser source", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({
            capability: { status: "available", reason: null },
            binding: null,
            windows: [],
          }),
        );
      }) satisfies typeof fetch;

      const result = yield* fetchEnvironmentWorkbenchVitals({
        prepared: PREPARED,
        signer: Option.none(),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      expect(result.windows).toEqual([]);
      expect(String(calls[0]?.[0])).toBe("https://environment.example.test/api/workbench/vitals");
      expect(calls[0]?.[1].credentials).toBe("include");
    }),
  );

  it.effect("encodes plan paths and preserves typed save and lifecycle bodies", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        const url = String(request);
        if (url.includes("annotations")) {
          return Promise.resolve(Response.json({ path: PLAN_PATH, items: [], markdown: "" }));
        }
        if (url.endsWith("/save")) {
          return Promise.resolve(Response.json({ path: PLAN_PATH, mtimeMs: 11, size: 7 }));
        }
        return Promise.resolve(
          Response.json({ path: WorkbenchPlanPath.make("t3code/archive/phase 4.md") }),
        );
      }) satisfies typeof fetch;
      const layer = remoteHttpClientLayer(fetchFn);

      yield* fetchEnvironmentWorkbenchPlanAnnotations({
        prepared: PREPARED,
        path: PLAN_PATH,
        signer: Option.none(),
      }).pipe(Effect.provide(layer));
      yield* saveEnvironmentWorkbenchPlan({
        prepared: PREPARED,
        signer: Option.none(),
        value: { path: PLAN_PATH, text: "# Phase 4", baseMtimeMs: 10 },
      }).pipe(Effect.provide(layer));
      yield* mutateEnvironmentWorkbenchPlan({
        prepared: PREPARED,
        signer: Option.none(),
        value: { op: "move", path: PLAN_PATH, to: "archive" },
      }).pipe(Effect.provide(layer));

      expect(String(calls[0]?.[0])).toBe(
        "https://environment.example.test/api/workbench/plans/annotations?path=t3code%2Fphase+4.md",
      );
      expect(requestBody(calls[1]?.[1] ?? {})).toEqual({
        path: PLAN_PATH,
        text: "# Phase 4",
        baseMtimeMs: 10,
      });
      expect(requestBody(calls[2]?.[1] ?? {})).toEqual({
        op: "move",
        path: PLAN_PATH,
        to: "archive",
      });
    }),
  );

  it.effect("binds DPoP to the exact serialized plan-source query URL", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const proofInputs: Array<{ readonly method: string; readonly url: string }> = [];
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        return Promise.resolve(
          Response.json({ path: PLAN_PATH, text: "# Phase 4", mtimeMs: 10, size: 9 }),
        );
      }) satisfies typeof fetch;
      const signer = ManagedRelayDpopSigner.of({
        thumbprint: Effect.succeed("test-thumbprint"),
        createProof: (input) => {
          proofInputs.push({ method: input.method, url: input.url });
          return Effect.succeed("test-proof");
        },
      });

      yield* fetchEnvironmentWorkbenchPlanSource({
        prepared: {
          ...PREPARED,
          httpAuthorization: { _tag: "Dpop", accessToken: "test-token" },
        },
        path: PLAN_PATH,
        signer: Option.some(signer),
      }).pipe(Effect.provide(remoteHttpClientLayer(fetchFn)));

      const requestUrl = String(calls[0]?.[0]);
      expect(proofInputs).toEqual([{ method: "GET", url: requestUrl }]);
      const headers = new Headers(calls[0]?.[1].headers);
      expect(headers.get("authorization")).toBe("DPoP test-token");
      expect(headers.get("dpop")).toBe("test-proof");
    }),
  );

  it.effect("reads and mutates explicit-thread associations and bounds advisory suggestions", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [RequestInfo | URL, RequestInit]> = [];
      const threadId = ThreadId.make("thread-1");
      const associationSnapshot = {
        revision: 2,
        primary: null,
        references: [],
        history: [],
      };
      const suggestion = (index: number) => ({
        path: WorkbenchPlanPath.make(`t3code/phase-${index}.md`),
        title: `Phase ${index}`,
        project: "t3code",
        score: 1 - index / 10,
        reasons: ["title"],
      });
      const fetchFn = ((request, init) => {
        calls.push([request, init ?? {}]);
        if (String(request).endsWith("/suggestions")) {
          return Promise.resolve(
            Response.json({ query: "phase", items: [1, 2, 3, 4].map(suggestion) }),
          );
        }
        return Promise.resolve(Response.json(associationSnapshot));
      }) satisfies typeof fetch;
      const layer = remoteHttpClientLayer(fetchFn);

      yield* fetchEnvironmentWorkbenchPlanAssociations({
        prepared: PREPARED,
        signer: Option.none(),
        value: { threadId, project: "t3code" },
      }).pipe(Effect.provide(layer));
      yield* associateEnvironmentWorkbenchPlan({
        prepared: PREPARED,
        signer: Option.none(),
        value: {
          threadId,
          project: "t3code",
          op: "use",
          planPath: PLAN_PATH,
          expectedRevision: 2,
        },
      }).pipe(Effect.provide(layer));
      const suggestions = yield* suggestEnvironmentWorkbenchPlans({
        prepared: PREPARED,
        signer: Option.none(),
        value: { threadId, project: "t3code", message: "phase" },
      }).pipe(Effect.provide(layer));

      expect(String(calls[0]?.[0])).toBe(
        "https://environment.example.test/api/workbench/plans/associations?threadId=thread-1&project=t3code",
      );
      expect(calls[0]?.[1].method).toBe("GET");
      expect(requestBody(calls[1]?.[1] ?? {})).toEqual({
        threadId,
        project: "t3code",
        op: "use",
        planPath: PLAN_PATH,
        expectedRevision: 2,
      });
      expect(String(calls[2]?.[0])).toBe(
        "https://environment.example.test/api/workbench/plans/suggestions",
      );
      expect(requestBody(calls[2]?.[1] ?? {})).toEqual({
        threadId,
        project: "t3code",
        message: "phase",
      });
      expect(suggestions.items.map((item) => item.title)).toEqual([
        "Phase 1",
        "Phase 2",
        "Phase 3",
      ]);
    }),
  );
});
