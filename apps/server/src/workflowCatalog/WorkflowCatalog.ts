import * as NodeCrypto from "node:crypto";

import {
  ProviderDriverKind,
  WorkflowArgument,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type AgentWorkbenchCatalog,
  type WorkflowCatalogDetail,
  type WorkflowCatalogList,
  type WorkflowPromptDetail,
  type WorkflowPromptSummary,
  type WorkflowSkillSummary,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  AgentWorkbench,
  type AgentWorkbenchAdapterError,
  type AgentWorkbenchShape,
} from "../agentWorkbenchAdapter/AgentWorkbench.ts";

export class WorkflowCatalogSourceError extends Schema.TaggedErrorClass<WorkflowCatalogSourceError>()(
  "WorkflowCatalogSourceError",
  {
    reason: Schema.Literals(["request_failed", "invalid_response"]),
  },
) {}

export interface WorkflowCatalogShape {
  readonly list: Effect.Effect<WorkflowCatalogList>;
  readonly findDetail: (
    itemId: WorkflowCatalogItemId,
  ) => Effect.Effect<Option.Option<WorkflowCatalogDetail>, WorkflowCatalogSourceError>;
}

export class WorkflowCatalog extends Context.Service<WorkflowCatalog, WorkflowCatalogShape>()(
  "t3/workflowCatalog/WorkflowCatalog",
) {}

export function makeWorkflowCatalog(workbench: AgentWorkbenchShape): WorkflowCatalogShape {
  const list = workbench.catalog.pipe(
    Effect.map(projectCatalog),
    Effect.orElseSucceed(() => ({
      capability: {
        status: "unavailable" as const,
        sourceKind: "http" as const,
        reason: "Agent Workbench workflow catalog is unavailable.",
      },
      items: [],
    })),
  );

  return WorkflowCatalog.of({
    list,
    findDetail: (itemId) =>
      Effect.gen(function* () {
        const catalog = yield* list;
        const item = catalog.items.find((candidate) => candidate.id === itemId);
        if (item === undefined) return Option.none();
        if (item.kind === "skill") return Option.some(item);
        const detail = yield* workbench.promptDetail(itemId).pipe(Effect.mapError(mapAdapterError));
        if (detail.state !== "available" || detail.id !== itemId) return Option.none();
        return Option.some({
          summary: item,
          currentVersion: detail.currentVersion ?? 0,
          userMessageTemplate: detail.userMessageTemplate ?? "",
          systemMessage: detail.systemMessage ?? null,
        } satisfies WorkflowPromptDetail);
      }),
  });
}

export function projectCatalog(value: AgentWorkbenchCatalog): WorkflowCatalogList {
  const items = value.entries.flatMap(
    (entry): ReadonlyArray<WorkflowPromptSummary | WorkflowSkillSummary> => {
      try {
        const id = WorkflowCatalogItemId.make(entry.id);
        const providers = (entry.providers ?? []).flatMap((provider) => {
          const decoded = Schema.decodeUnknownOption(ProviderDriverKind)(provider);
          return Option.isSome(decoded) ? [decoded.value] : [];
        });
        if (entry.kind === "prompt") {
          const arguments_ = (entry.arguments ?? []).flatMap((argument) => {
            const decoded = Schema.decodeUnknownOption(WorkflowArgument)(argument);
            return Option.isSome(decoded) ? [decoded.value] : [];
          });
          return [
            {
              kind: "prompt",
              id,
              name: entry.name,
              category: entry.category,
              description: entry.description,
              arguments: arguments_,
              composerInputArgument: entry.composerInputArgument ?? null,
              executionType: entry.executionType === "chain" ? "chain" : "single",
              providers,
              revision: workflowRevision(entry),
            },
          ];
        }
        if (entry.kind === "skill") {
          return [
            {
              kind: "skill",
              id,
              name: entry.name,
              description: entry.description || null,
              scope: entry.scope ?? null,
              sourcePath: entry.sourcePath ?? null,
              providers,
            },
          ];
        }
        return [];
      } catch {
        return [];
      }
    },
  );
  return {
    capability: {
      status:
        value.state === "unavailable" || value.state === "unsupported"
          ? "unavailable"
          : "available",
      sourceKind: "http",
      reason: value.reason ?? null,
    },
    items,
  };
}

export const layer = Layer.effect(
  WorkflowCatalog,
  Effect.gen(function* () {
    return makeWorkflowCatalog(yield* AgentWorkbench);
  }),
);

function workflowRevision(entry: AgentWorkbenchCatalog["entries"][number]) {
  try {
    return WorkflowRevision.make(entry.revision ?? "");
  } catch {
    const digest = NodeCrypto.createHash("sha256").update(JSON.stringify(entry)).digest("hex");
    return WorkflowRevision.make(`sha256:${digest}`);
  }
}

function mapAdapterError(error: AgentWorkbenchAdapterError) {
  return new WorkflowCatalogSourceError({
    reason: error.reason === "invalid_response" ? "invalid_response" : "request_failed",
  });
}
