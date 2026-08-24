import {
  DEFAULT_SERVER_SETTINGS,
  WorkbenchPlanPath,
  WorkbenchPlansHttpBaseUrl,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { makeWorkbenchPlans, WorkbenchPlansAdapterError } from "./WorkbenchPlans.ts";

const source = {
  kind: "http" as const,
  baseUrl: WorkbenchPlansHttpBaseUrl.make("http://127.0.0.1:4317"),
};

describe("WorkbenchPlans", () => {
  it.effect("reports a missing adapter without assuming localhost", () =>
    Effect.gen(function* () {
      const plans = makeWorkbenchPlans(Effect.succeed(DEFAULT_SERVER_SETTINGS), () =>
        Effect.fail(new WorkbenchPlansAdapterError({ reason: "request_failed" })),
      );
      const result = yield* plans.list;
      expect(result.capability.status).toBe("misconfigured");
      expect(result.items).toEqual([]);
    }),
  );

  it.effect("projects only bounded plan metadata", () =>
    Effect.gen(function* () {
      const plans = makeWorkbenchPlans(
        Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, workbenchPlansSource: source }),
        () =>
          Effect.succeed({
            groups: [
              {
                files: [
                  {
                    rel: "t3code/plan.md",
                    name: "plan.md",
                    dir: "t3code",
                    project: "t3code",
                    status: "active",
                    date: "2026-08-23",
                    tags: ["t3"],
                    mtimeMs: 10,
                    source: "plans",
                    abs: "/secret/path",
                  },
                  { rel: "_docs/README.md", name: "README.md", mtimeMs: 11, source: "docs" },
                ],
              },
            ],
            bindings: [
              {
                rel: "t3code/plan.md",
                title: "Agent Workbench",
                threads: 2,
                confirmed: true,
                bound_at: "2026-08-23T10:00:00.000Z",
                notesRel: "t3code/plan-implementation-notes.md",
                notesStale: false,
                deviations: 1,
                plan: "/secret/bound-plan.md",
              },
            ],
          }),
      );
      const result = yield* plans.list;
      expect(result.capability.status).toBe("available");
      expect(result.items).toEqual([
        {
          path: "t3code/plan.md",
          name: "plan.md",
          directory: "t3code",
          project: "t3code",
          status: "active",
          date: "2026-08-23",
          tags: ["t3"],
          mtimeMs: 10,
          binding: {
            title: "Agent Workbench",
            threads: 2,
            confirmed: true,
            boundAt: "2026-08-23T10:00:00.000Z",
            notesPath: "t3code/plan-implementation-notes.md",
            notesStale: false,
            deviations: 1,
          },
        },
      ]);
      expect(result.items[0]).not.toHaveProperty("abs");
    }),
  );

  it.effect("projects provider quota without estimating missing windows", () =>
    Effect.gen(function* () {
      const plans = makeWorkbenchPlans(
        Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, workbenchPlansSource: source }),
        (_source, path) =>
          path.includes("vitals")
            ? Effect.succeed({
                ok: true,
                binding: {
                  provider: "claude",
                  providerLabel: "Claude",
                  label: "5-hour",
                  remainingPct: 62,
                  usedPct: 38,
                  secondsToReset: 3_600,
                  exhaustsBeforeReset: false,
                  secondsToExhaustion: null,
                },
                windows: [
                  {
                    provider: "claude",
                    providerLabel: "Claude",
                    label: "5-hour",
                    usedPct: 38,
                    expectedPct: 50,
                    secondsToReset: 3_600,
                    exhaustsBeforeReset: false,
                    secondsToExhaustion: null,
                  },
                ],
              })
            : Effect.succeed({ groups: [] }),
      );

      const result = yield* plans.vitals;
      expect(result.capability).toEqual({ status: "available", reason: null });
      expect(result.binding?.remainingPct).toBe(62);
      expect(result.windows[0]).toMatchObject({ provider: "claude", label: "5-hour" });
    }),
  );

  it.effect("keeps unavailable quota explicit", () =>
    Effect.gen(function* () {
      const plans = makeWorkbenchPlans(
        Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, workbenchPlansSource: source }),
        () => Effect.succeed({ ok: false, reason: "no captured sessions" }),
      );

      const result = yield* plans.vitals;
      expect(result.capability).toEqual({
        status: "available",
        reason: "no captured sessions",
      });
      expect(result.windows).toEqual([]);
    }),
  );

  it.effect("maps read, optimistic save, and move calls", () =>
    Effect.gen(function* () {
      const calls: Array<{ path: string; body: unknown }> = [];
      const planPath = WorkbenchPlanPath.make("t3code/plan.md");
      const plans = makeWorkbenchPlans(
        Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, workbenchPlansSource: source }),
        (_source, path, body) => {
          calls.push({ path, body });
          if (path.includes("source"))
            return Effect.succeed({ text: "# Plan", mtimeMs: 10, size: 6 });
          if (path.includes("save")) return Effect.succeed({ mtimeMs: 11, size: 7 });
          return Effect.succeed({ rel: "t3code/archive/plan.md" });
        },
      );
      expect((yield* plans.read(planPath)).text).toBe("# Plan");
      expect(
        (yield* plans.save({ path: planPath, text: "# Plan!", baseMtimeMs: 10 })).mtimeMs,
      ).toBe(11);
      expect((yield* plans.mutate({ op: "move", path: planPath, to: "archive" })).path).toBe(
        "t3code/archive/plan.md",
      );
      expect(calls[2]?.body).toMatchObject({ op: "move", rel: planPath, to: "archive" });
    }),
  );

  it.effect("maps annotation reads and mutations without exposing store paths", () =>
    Effect.gen(function* () {
      const calls: Array<{ path: string; body: unknown }> = [];
      const planPath = WorkbenchPlanPath.make("t3code/plan.md");
      const annotations = {
        items: [
          {
            id: "note-1",
            kind: "comment",
            body: "Clarify this decision.",
            quote: "Native transport",
            heading: "Boundary",
            created_at: "2026-08-23T10:00:00.000Z",
            store: "/secret/annotation-store.json",
          },
        ],
        markdown: "# Review notes",
      };
      const plans = makeWorkbenchPlans(
        Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, workbenchPlansSource: source }),
        (_source, path, body) => {
          calls.push({ path, body });
          return Effect.succeed(annotations);
        },
      );

      const read = yield* plans.readAnnotations(planPath);
      expect(read.items[0]).toEqual({
        id: "note-1",
        kind: "comment",
        body: "Clarify this decision.",
        quote: "Native transport",
        heading: "Boundary",
        createdAt: "2026-08-23T10:00:00.000Z",
      });
      const changed = yield* plans.mutateAnnotations({
        op: "resolve",
        path: planPath,
        annotationId: "note-1",
      });
      expect(changed.markdown).toBe("# Review notes");
      expect(calls[1]?.body).toEqual({ rel: planPath, resolve: "note-1" });
      expect(calls[2]?.path).toContain("api/annotations");
    }),
  );

  it.effect("rejects absolute, backslash, and parent-traversal plan paths", () =>
    Effect.sync(() => {
      const decode = Schema.decodeUnknownExit(WorkbenchPlanPath);
      expect(Exit.isFailure(decode("/absolute.md"))).toBe(true);
      expect(Exit.isFailure(decode("C:\\absolute.md"))).toBe(true);
      expect(Exit.isFailure(decode("project/../escape.md"))).toBe(true);
      expect(Exit.isSuccess(decode("project/active/plan.md"))).toBe(true);
    }),
  );
});
