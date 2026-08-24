import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentAuthenticatedPrincipal,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowCatalog } from "./WorkflowCatalog.ts";
import { findWorkflowCatalogItem, listWorkflowCatalog } from "./http.ts";

const prompt = {
  kind: "prompt" as const,
  id: WorkflowCatalogItemId.make("strategicImplement"),
  name: "Strategic Implementation",
  category: "development",
  description: "Implement an approved plan",
  arguments: [],
  composerInputArgument: null,
  executionType: "single" as const,
  providers: [],
  revision: WorkflowRevision.make(`sha256:${"a".repeat(64)}`),
};

const list: WorkflowCatalogList = {
  capability: { status: "available", sourceKind: "http", reason: null },
  items: [prompt],
};

const catalog = WorkflowCatalog.of({
  list: Effect.succeed(list),
  findDetail: (itemId) =>
    Effect.succeed(
      itemId === prompt.id
        ? Option.some({
            summary: prompt,
            userMessageTemplate: "Implement {{ task }}",
            systemMessage: null,
          })
        : Option.none(),
    ),
});

const principal = (scopes: ReadonlySet<typeof AuthOrchestrationReadScope>) =>
  EnvironmentAuthenticatedPrincipal.of({
    sessionId: AuthSessionId.make("session-workflow-test"),
    subject: "test-client",
    method: "browser-session-cookie",
    scopes,
  });

const provideCatalogRequest = <A, E, R>(effect: Effect.Effect<A, E, R>, canRead = true) =>
  effect.pipe(
    Effect.provideService(WorkflowCatalog, catalog),
    Effect.provideService(
      EnvironmentAuthenticatedPrincipal,
      principal(canRead ? new Set([AuthOrchestrationReadScope]) : new Set()),
    ),
  );

describe("workflow catalog HTTP handlers", () => {
  it.effect("returns the catalog for a standard read principal", () =>
    Effect.gen(function* () {
      const result = yield* provideCatalogRequest(listWorkflowCatalog());
      assert.deepEqual(result, list);
    }),
  );

  it.effect("returns one item by id", () =>
    Effect.gen(function* () {
      const result = yield* provideCatalogRequest(findWorkflowCatalogItem(prompt.id));
      assert.isTrue("summary" in result);
      if ("summary" in result) assert.strictEqual(result.summary.id, prompt.id);
    }),
  );

  it.effect("rejects principals without orchestration read scope", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(provideCatalogRequest(listWorkflowCatalog(), false));
      assert.strictEqual(error._tag, "EnvironmentScopeRequiredError");
      assert.strictEqual(error.requiredScope, AuthOrchestrationReadScope);
    }),
  );

  it.effect("returns typed not-found for an absent item", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        provideCatalogRequest(findWorkflowCatalogItem(WorkflowCatalogItemId.make("missing"))),
      );
      assert.strictEqual(error._tag, "EnvironmentResourceNotFoundError");
      if (error._tag === "EnvironmentResourceNotFoundError") {
        assert.strictEqual(error.reason, "workflow_catalog_item_not_found");
      }
    }),
  );
});
