import {
  WorkbenchPlanPath,
  type AgentWorkbenchPlanList,
  type AgentWorkbenchVitals,
  type WorkbenchPlanAnnotationMutationInput,
  type WorkbenchPlanAnnotations,
  type WorkbenchPlanList,
  type WorkbenchPlanMutationInput,
  type WorkbenchPlanMutationResult,
  type WorkbenchPlanSaveInput,
  type WorkbenchPlanSaveResult,
  type WorkbenchPlanSourceDocument,
  type WorkbenchPlanSummary,
  type WorkbenchQuotaWindow,
  type WorkbenchQuotaBinding,
  type WorkbenchVitalsSnapshot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AgentWorkbench,
  type AgentWorkbenchAdapterError,
  type AgentWorkbenchShape,
} from "../agentWorkbenchAdapter/AgentWorkbench.ts";

export class WorkbenchPlansAdapterError extends Data.TaggedError("WorkbenchPlansAdapterError")<{
  readonly reason:
    | "request_failed"
    | "invalid_response"
    | "invalid_request"
    | "not_found"
    | "conflict";
}> {}

export interface WorkbenchPlansShape {
  readonly list: Effect.Effect<WorkbenchPlanList>;
  readonly vitals: Effect.Effect<WorkbenchVitalsSnapshot>;
  readonly read: (
    path: WorkbenchPlanPath,
  ) => Effect.Effect<WorkbenchPlanSourceDocument, WorkbenchPlansAdapterError>;
  readonly save: (
    input: WorkbenchPlanSaveInput,
  ) => Effect.Effect<WorkbenchPlanSaveResult, WorkbenchPlansAdapterError>;
  readonly mutate: (
    input: WorkbenchPlanMutationInput,
  ) => Effect.Effect<WorkbenchPlanMutationResult, WorkbenchPlansAdapterError>;
  readonly readAnnotations: (
    path: WorkbenchPlanPath,
  ) => Effect.Effect<WorkbenchPlanAnnotations, WorkbenchPlansAdapterError>;
  readonly mutateAnnotations: (
    input: WorkbenchPlanAnnotationMutationInput,
  ) => Effect.Effect<WorkbenchPlanAnnotations, WorkbenchPlansAdapterError>;
}

export class WorkbenchPlans extends Context.Service<WorkbenchPlans, WorkbenchPlansShape>()(
  "t3/workbenchPlans/WorkbenchPlans",
) {}

export function makeWorkbenchPlans(workbench: AgentWorkbenchShape): WorkbenchPlansShape {
  return WorkbenchPlans.of({
    list: workbench.listPlans.pipe(
      Effect.map(projectPlanList),
      Effect.orElseSucceed(() => unavailable("Agent Workbench plans are unavailable.")),
    ),
    vitals: Effect.gen(function* () {
      const [value, now] = yield* Effect.all([workbench.vitals, Clock.currentTimeMillis]);
      return projectVitals(value, now);
    }).pipe(
      Effect.orElseSucceed(() => ({
        capability: {
          status: "unavailable" as const,
          reason: "Agent Workbench vitals are unavailable.",
        },
        binding: null,
        windows: [],
      })),
    ),
    read: (path) =>
      workbench.readPlan(path).pipe(
        Effect.map((value) => ({
          path,
          text: value.text,
          mtimeMs: value.mtimeMs,
          size: value.size,
        })),
        Effect.mapError(mapAdapterError),
      ),
    save: (input) =>
      workbench.savePlan(input.path, { text: input.text, baseMtimeMs: input.baseMtimeMs }).pipe(
        Effect.mapError(mapAdapterError),
        Effect.flatMap((value) =>
          value.mtimeMs === undefined || value.size === undefined
            ? Effect.fail(new WorkbenchPlansAdapterError({ reason: "invalid_response" }))
            : Effect.succeed({ path: input.path, mtimeMs: value.mtimeMs, size: value.size }),
        ),
      ),
    mutate: (input) =>
      workbench.mutatePlan(input).pipe(
        Effect.map((value) => ({ path: WorkbenchPlanPath.make(value.path) })),
        Effect.mapError(mapAdapterError),
      ),
    readAnnotations: (path) =>
      workbench.readAnnotations(path).pipe(
        Effect.map((value) => ({ path, items: value.items, markdown: value.markdown })),
        Effect.mapError(mapAdapterError),
      ),
    mutateAnnotations: (input) =>
      workbench.mutateAnnotations(input.path, input).pipe(
        Effect.map((value) => ({ path: input.path, items: value.items, markdown: value.markdown })),
        Effect.mapError(mapAdapterError),
      ),
  });
}

export function projectPlanList(value: AgentWorkbenchPlanList): WorkbenchPlanList {
  const items = value.plans.flatMap((plan): ReadonlyArray<WorkbenchPlanSummary> => {
    try {
      return [
        {
          path: WorkbenchPlanPath.make(plan.path),
          name: plan.name,
          directory: plan.directory,
          project: plan.project,
          status: plan.status === "untriaged" ? null : plan.status,
          date: plan.date,
          tags: [...plan.tags],
          mtimeMs: Date.parse(plan.updatedAt),
          binding: projectBinding(plan.binding),
        },
      ];
    } catch {
      return [];
    }
  });
  return {
    capability: {
      status:
        value.state === "unavailable" || value.state === "unsupported"
          ? "unavailable"
          : "available",
      reason: value.reason ?? null,
    },
    items,
  };
}

export function projectVitals(value: AgentWorkbenchVitals, now: number): WorkbenchVitalsSnapshot {
  const windows = value.windows.flatMap((window): ReadonlyArray<WorkbenchQuotaWindow> => {
    if (window.provider !== "claude" && window.provider !== "codex") return [];
    return [
      {
        provider: window.provider,
        providerLabel: window.providerLabel ?? window.provider,
        label: window.label,
        usedPct: window.usedPercent ?? 0,
        expectedPct: window.expectedPercent ?? window.usedPercent ?? 0,
        secondsToReset:
          window.resetsAt === null ? 0 : Math.max(0, (Date.parse(window.resetsAt) - now) / 1_000),
        exhaustsBeforeReset: window.exhaustsBeforeReset ?? false,
        secondsToExhaustion: window.secondsToExhaustion ?? null,
      },
    ];
  });
  return {
    capability: {
      status:
        value.state === "unavailable" || value.state === "unsupported"
          ? "unavailable"
          : "available",
      reason:
        value.reason ?? (windows.length === 0 ? "No provider quota is currently reported." : null),
    },
    binding: projectQuotaBinding(value.binding),
    windows,
  };
}

export const layer = Layer.effect(
  WorkbenchPlans,
  Effect.gen(function* () {
    return makeWorkbenchPlans(yield* AgentWorkbench);
  }),
);

function unavailable(reason: string): WorkbenchPlanList {
  return { capability: { status: "unavailable", reason }, items: [] };
}

function projectBinding(value: unknown): WorkbenchPlanSummary["binding"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  try {
    return {
      title: typeof binding["planTitle"] === "string" ? binding["planTitle"] : null,
      threads: typeof binding["threads"] === "number" ? binding["threads"] : 1,
      confirmed: binding["confirmed"] === true,
      boundAt: typeof binding["bound_at"] === "string" ? binding["bound_at"] : null,
      notesPath:
        typeof binding["notesRel"] === "string"
          ? WorkbenchPlanPath.make(binding["notesRel"])
          : null,
      notesStale: binding["notesStale"] === true,
      deviations: typeof binding["deviations"] === "number" ? binding["deviations"] : 0,
    };
  } catch {
    return null;
  }
}

function mapAdapterError(error: AgentWorkbenchAdapterError) {
  switch (error.reason) {
    case "not_found":
      return new WorkbenchPlansAdapterError({ reason: "not_found" });
    case "conflict":
      return new WorkbenchPlansAdapterError({ reason: "conflict" });
    case "invalid_response":
      return new WorkbenchPlansAdapterError({ reason: "invalid_response" });
    case "forbidden":
    case "unauthorized":
      return new WorkbenchPlansAdapterError({ reason: "invalid_request" });
    default:
      return new WorkbenchPlansAdapterError({ reason: "request_failed" });
  }
}

function projectQuotaBinding(value: unknown): WorkbenchQuotaBinding | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  const provider = binding["provider"];
  if (provider !== "claude" && provider !== "codex") return null;
  if (
    typeof binding["providerLabel"] !== "string" ||
    typeof binding["label"] !== "string" ||
    typeof binding["remainingPct"] !== "number" ||
    typeof binding["usedPct"] !== "number" ||
    typeof binding["secondsToReset"] !== "number"
  ) {
    return null;
  }
  return {
    provider,
    providerLabel: binding["providerLabel"],
    label: binding["label"],
    remainingPct: binding["remainingPct"],
    usedPct: binding["usedPct"],
    secondsToReset: binding["secondsToReset"],
    exhaustsBeforeReset: binding["exhaustsBeforeReset"] === true,
    secondsToExhaustion:
      typeof binding["secondsToExhaustion"] === "number" ? binding["secondsToExhaustion"] : null,
  };
}
