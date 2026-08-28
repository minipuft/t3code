import type { AgentWorkbenchCatalog } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectCatalog } from "./WorkflowCatalog.ts";

describe("Agent Workbench workflow catalog projection", () => {
  it("projects prompts and provider skills into native composer items", () => {
    const input: AgentWorkbenchCatalog = {
      protocolVersion: "1.0.0",
      revision: "sha256:catalog",
      state: "available",
      entries: [
        {
          kind: "prompt",
          id: "strategicImplement",
          name: "Strategic Implementation",
          description: "Execute a plan",
          category: "implementation",
          source: "claude-prompts-mcp",
          revision: `sha256:${"a".repeat(64)}`,
          available: true,
          arguments: [{ name: "task", description: null, required: true, type: "string" }],
          composerInputArgument: "task",
          executionType: "single",
          providers: ["claudeAgent", "codex"],
        },
        {
          kind: "skill",
          id: "skill:refactoring",
          name: "Refactoring",
          description: "Validate boundaries",
          category: "process",
          source: "t3-provider",
          available: true,
          providers: ["claudeAgent"],
          scope: "user",
          sourcePath: "/skills/refactoring/SKILL.md",
        },
      ],
    };

    const projected = projectCatalog(input);
    expect(projected.capability).toEqual({ status: "available", sourceKind: "http", reason: null });
    expect(projected.items).toHaveLength(2);
    expect(projected.items[0]).toMatchObject({
      kind: "prompt",
      id: "strategicImplement",
      composerInputArgument: "task",
      providers: ["claudeAgent", "codex"],
    });
    expect(projected.items[1]).toMatchObject({
      kind: "skill",
      id: "skill:refactoring",
      sourcePath: "/skills/refactoring/SKILL.md",
    });
  });

  it("does not silently claim availability when the portable catalog is down", () => {
    expect(
      projectCatalog({
        protocolVersion: "1.0.0",
        revision: "none",
        state: "unavailable",
        reason: "sidecar down",
        entries: [],
      }).capability,
    ).toEqual({
      status: "unavailable",
      sourceKind: "http",
      reason: "sidecar down",
    });
  });
});
