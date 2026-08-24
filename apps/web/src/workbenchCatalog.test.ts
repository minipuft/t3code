import {
  EnvironmentId,
  WorkflowCatalogItemId,
  WorkflowRevision,
  type WorkflowCatalogItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  parseWorkbenchModule,
  projectWorkbenchCatalog,
  retainWorkbenchSelection,
  selectWorkbenchEnvironment,
} from "./workbenchCatalog";
import type { EnvironmentPresentation } from "./state/environments";

const prompt: WorkflowCatalogItem = {
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
};

const skill: WorkflowCatalogItem = {
  kind: "skill",
  id: WorkflowCatalogItemId.make("skill:review"),
  name: "review-follow-up",
  description: null,
  scope: "personal",
  sourcePath: null,
  providers: [],
};

const environment = (id: string): EnvironmentPresentation =>
  ({ environmentId: EnvironmentId.make(id), label: id }) as EnvironmentPresentation;

describe("workbench catalog projection", () => {
  it("normalizes unknown modules without hiding the default Plans surface", () => {
    expect(parseWorkbenchModule("skills")).toBe("skills");
    expect(parseWorkbenchModule("unknown")).toBe("plans");
    expect(parseWorkbenchModule(undefined)).toBe("plans");
  });

  it("keeps a selected environment while it exists and otherwise falls back", () => {
    const primary = EnvironmentId.make("primary");
    const secondary = EnvironmentId.make("secondary");
    const environments = [environment(primary), environment(secondary)];

    expect(
      selectWorkbenchEnvironment({
        selectedEnvironmentId: secondary,
        primaryEnvironmentId: primary,
        environments,
      }),
    ).toBe(secondary);
    expect(
      selectWorkbenchEnvironment({
        selectedEnvironmentId: EnvironmentId.make("removed"),
        primaryEnvironmentId: primary,
        environments,
      }),
    ).toBe(primary);
  });

  it("filters by kind before searching and retains only usable selections", () => {
    expect(
      projectWorkbenchCatalog({ items: [prompt, skill], module: "skills", query: "review" }),
    ).toEqual([skill]);
    expect(
      projectWorkbenchCatalog({ items: [prompt, skill], module: "prompts", query: "review" }),
    ).toEqual([]);
    expect(retainWorkbenchSelection(skill.id, [skill])).toBe(skill.id);
    expect(retainWorkbenchSelection(prompt.id, [skill])).toBeNull();
  });
});
