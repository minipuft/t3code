import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  WorkflowCatalogHttpBaseUrl,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type ServerProvider,
  type WorkflowPromptDetail,
  type WorkflowPromptSummary,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  WorkflowCatalogSourceError,
  WorkflowCatalogDependencyError,
  makeWorkflowCatalog,
  mergeProviderSkills,
} from "./WorkflowCatalog.ts";

const revision = WorkflowRevision.make(`sha256:${"a".repeat(64)}`);
const source = {
  kind: "http" as const,
  baseUrl: WorkflowCatalogHttpBaseUrl.make("http://127.0.0.1:4317"),
};

const prompt: WorkflowPromptSummary = {
  kind: "prompt",
  id: WorkflowCatalogItemId.make("strategicImplement"),
  name: "Strategic Implementation",
  category: "development",
  description: "Implement an approved plan",
  arguments: [],
  composerInputArgument: null,
  executionType: "single",
  providers: [],
  revision,
};

function provider(driver: string, skills: ServerProvider["skills"]): ServerProvider {
  const driverKind = ProviderDriverKind.make(driver);
  return {
    instanceId: ProviderInstanceId.make(driver),
    driver: driverKind,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-20T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills,
  };
}

function catalog(overrides?: {
  readonly source?: typeof source | null;
  readonly providers?: ReadonlyArray<ServerProvider>;
  readonly loadPrompts?: () => Effect.Effect<
    ReadonlyArray<WorkflowPromptSummary>,
    WorkflowCatalogSourceError
  >;
  readonly loadPromptDetail?: () => Effect.Effect<WorkflowPromptDetail, WorkflowCatalogSourceError>;
}) {
  return makeWorkflowCatalog({
    getSettings: Effect.succeed({
      ...DEFAULT_SERVER_SETTINGS,
      workflowCatalogSource: overrides?.source === undefined ? source : overrides.source,
    }),
    getProviders: Effect.succeed(overrides?.providers ?? []),
    loadPrompts: overrides?.loadPrompts ?? (() => Effect.succeed([prompt])),
    loadPromptDetail:
      overrides?.loadPromptDetail ??
      (() =>
        Effect.succeed({
          summary: prompt,
          userMessageTemplate: "Implement {{ task }}",
          systemMessage: null,
        })),
  });
}

describe("WorkflowCatalog", () => {
  it.effect("reports missing source as misconfigured while retaining provider skills", () =>
    Effect.gen(function* () {
      const service = catalog({
        source: null,
        providers: [
          provider("codex", [{ name: "review", path: "/skills/review/SKILL.md", enabled: true }]),
        ],
      });

      const result = yield* service.list;

      assert.strictEqual(result.capability.status, "misconfigured");
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0]?.kind, "skill");
    }),
  );

  it.effect("returns an available empty prompt source without treating emptiness as an error", () =>
    Effect.gen(function* () {
      const result = yield* catalog({ loadPrompts: () => Effect.succeed([]) }).list;

      assert.strictEqual(result.capability.status, "available");
      assert.deepEqual(result.items, []);
    }),
  );

  it.effect("returns prompts and finds them by catalog id", () =>
    Effect.gen(function* () {
      const service = catalog();
      const result = yield* service.list;
      const found = yield* service.findDetail(prompt.id);

      assert.strictEqual(result.items[0]?.kind, "prompt");
      assert.isTrue(found._tag === "Some");
      assert.strictEqual(
        found._tag === "Some" && "summary" in found.value ? found.value.summary.id : "",
        prompt.id,
      );
    }),
  );

  it.effect("retains the first prompt when a source repeats an invocation id", () =>
    Effect.gen(function* () {
      const duplicate = { ...prompt, name: "Duplicate action" };

      const result = yield* catalog({
        loadPrompts: () => Effect.succeed([prompt, duplicate]),
      }).list;

      assert.deepEqual(result.items, [prompt]);
    }),
  );

  it.effect("rejects prompt detail whose identity does not match the selected catalog item", () =>
    Effect.gen(function* () {
      const service = catalog({
        loadPromptDetail: () =>
          Effect.succeed({
            summary: { ...prompt, id: WorkflowCatalogItemId.make("different") },
            userMessageTemplate: "Implement {{ task }}",
            systemMessage: null,
          }),
      });

      const error = yield* Effect.flip(service.findDetail(prompt.id));

      assert.strictEqual(error.reason, "invalid_response");
    }),
  );

  it.effect("turns malformed upstream data into a non-sensitive unavailable capability", () =>
    Effect.gen(function* () {
      const result = yield* catalog({
        loadPrompts: () =>
          Effect.fail(new WorkflowCatalogSourceError({ reason: "invalid_response" })),
      }).list;

      assert.strictEqual(result.capability.status, "unavailable");
      assert.strictEqual(
        result.capability.reason,
        "The configured prompt catalog returned an invalid response.",
      );
      assert.notInclude(result.capability.reason ?? "", source.baseUrl);
    }),
  );

  it.effect("contains settings/provider failures as an unavailable catalog", () =>
    Effect.gen(function* () {
      const service = makeWorkflowCatalog({
        getSettings: Effect.fail(new WorkflowCatalogDependencyError({ dependency: "settings" })),
        getProviders: Effect.succeed([]),
        loadPrompts: () => Effect.succeed([]),
        loadPromptDetail: () =>
          Effect.succeed({
            summary: prompt,
            userMessageTemplate: "Implement {{ task }}",
            systemMessage: null,
          }),
      });

      const result = yield* service.list;

      assert.strictEqual(result.capability.status, "unavailable");
      assert.notInclude(result.capability.reason ?? "", "settings secret");
    }),
  );
});

describe("mergeProviderSkills", () => {
  it("deduplicates the same source and unions provider kinds", () => {
    const skills = mergeProviderSkills([
      provider("codex", [
        {
          name: "review",
          description: "Review changes",
          path: "/skills/review/SKILL.md",
          scope: "user",
          enabled: true,
        },
      ]),
      provider("claudeAgent", [
        {
          name: "review",
          description: "Review changes",
          path: "/skills/review/SKILL.md",
          scope: "user",
          enabled: true,
        },
      ]),
    ]);

    assert.strictEqual(skills.length, 1);
    assert.deepEqual(skills[0]?.providers.map(String), ["claudeAgent", "codex"]);
  });

  it("retains same-name skills from distinct roots", () => {
    const skills = mergeProviderSkills([
      provider("codex", [
        { name: "review", path: "/personal/review/SKILL.md", enabled: true },
        { name: "review", path: "/project/review/SKILL.md", enabled: true },
      ]),
    ]);

    assert.strictEqual(skills.length, 2);
    assert.notStrictEqual(skills[0]?.id, skills[1]?.id);
  });
});
