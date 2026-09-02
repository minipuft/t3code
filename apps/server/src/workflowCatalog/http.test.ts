import {
  AuthAccessWriteScope,
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentAuthenticatedPrincipal,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogList,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowCatalog } from "./WorkflowCatalog.ts";
import type { AgentWorkbenchShape } from "../agentWorkbenchAdapter/AgentWorkbench.ts";
import {
  findWorkflowCatalogItem,
  listWorkflowCatalog,
  readWorkflowPromptHistory,
  reviewWorkflowPrompt,
} from "./http.ts";

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
            currentVersion: 2,
            userMessageTemplate: "Implement {{ task }}",
            systemMessage: null,
          })
        : Option.none(),
    ),
});

const principal = (scopes: ReadonlySet<AuthEnvironmentScope>) =>
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

const workbench = {
  listPlans: Effect.die(new Error("unused")),
  vitals: Effect.die(new Error("unused")),
  planAssociations: () => Effect.die(new Error("unused")),
  mutatePlanAssociation: () => Effect.die(new Error("unused")),
  suggestPlans: () => Effect.die(new Error("unused")),
  readPlan: () => Effect.die(new Error("unused")),
  savePlan: () => Effect.die(new Error("unused")),
  mutatePlan: () => Effect.die(new Error("unused")),
  readAnnotations: () => Effect.die(new Error("unused")),
  mutateAnnotations: () => Effect.die(new Error("unused")),
  catalog: Effect.die(new Error("unused")),
  promptDetail: () => Effect.die(new Error("unused")),
  promptHistory: (id: string) =>
    Effect.succeed({
      state: "available" as const,
      action: "history",
      id,
      current_version: 2,
      versions: [],
    }),
  comparePrompt: () => Effect.die(new Error("unused")),
  reviewPrompt: () =>
    Effect.succeed({
      state: "available" as const,
      reviewId: "review-1",
      action: "update",
      dry_run: true,
      valid: true,
      mutated: false,
      has_changes: true,
      diff: "+ changed",
    }),
  applyPrompt: () => Effect.die(new Error("unused")),
  rollbackPrompt: () => Effect.die(new Error("unused")),
} satisfies AgentWorkbenchShape;

const providePrincipal = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  scopes: ReadonlySet<AuthEnvironmentScope>,
) => effect.pipe(Effect.provideService(EnvironmentAuthenticatedPrincipal, principal(scopes)));

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

  it.effect("allows standard clients to read canonical prompt history", () =>
    Effect.gen(function* () {
      const result = yield* providePrincipal(
        readWorkflowPromptHistory(workbench, prompt.id, 20),
        new Set([AuthOrchestrationReadScope]),
      );
      assert.strictEqual(result.current_version, 2);
    }),
  );

  it.effect("requires administrative access for prompt review", () =>
    Effect.gen(function* () {
      const denied = yield* Effect.flip(
        providePrincipal(
          reviewWorkflowPrompt(workbench, prompt.id, { expected_version: 2 }),
          new Set([AuthOrchestrationReadScope]),
        ),
      );
      assert.strictEqual(denied._tag, "EnvironmentScopeRequiredError");
      if (denied._tag === "EnvironmentScopeRequiredError") {
        assert.strictEqual(denied.requiredScope, AuthAccessWriteScope);
      }

      const allowed = yield* providePrincipal(
        reviewWorkflowPrompt(workbench, prompt.id, { expected_version: 2 }),
        new Set([AuthAccessWriteScope]),
      );
      assert.isTrue(allowed.valid === true);
    }),
  );
});
