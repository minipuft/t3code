import type { EnvironmentId, WorkflowCatalogItem } from "@t3tools/contracts";

import type { EnvironmentPresentation } from "./state/environments";
import { searchWorkflowCatalog } from "./workflowInvocation";

export const WORKBENCH_MODULES = ["plans", "prompts", "skills", "vitals"] as const;
export type WorkbenchModule = (typeof WORKBENCH_MODULES)[number];

export function parseWorkbenchModule(value: unknown): WorkbenchModule {
  return typeof value === "string" && WORKBENCH_MODULES.includes(value as WorkbenchModule)
    ? (value as WorkbenchModule)
    : "plans";
}

export function selectWorkbenchEnvironment(input: {
  readonly selectedEnvironmentId: EnvironmentId | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
}): EnvironmentId | null {
  const availableIds = new Set(input.environments.map((environment) => environment.environmentId));
  if (input.selectedEnvironmentId !== null && availableIds.has(input.selectedEnvironmentId)) {
    return input.selectedEnvironmentId;
  }
  if (input.primaryEnvironmentId !== null && availableIds.has(input.primaryEnvironmentId)) {
    return input.primaryEnvironmentId;
  }
  return input.environments[0]?.environmentId ?? null;
}

export function projectWorkbenchCatalog(input: {
  readonly items: ReadonlyArray<WorkflowCatalogItem>;
  readonly module: "prompts" | "skills";
  readonly query: string;
}): ReadonlyArray<WorkflowCatalogItem> {
  const kind = input.module === "prompts" ? "prompt" : "skill";
  return searchWorkflowCatalog(
    input.items.filter((item) => item.kind === kind),
    input.query,
  );
}

export function retainWorkbenchSelection(
  selectedItemId: string | null,
  items: ReadonlyArray<WorkflowCatalogItem>,
): string | null {
  return selectedItemId !== null && items.some((item) => item.id === selectedItemId)
    ? selectedItemId
    : null;
}
