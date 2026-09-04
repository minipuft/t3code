import { WorkbenchPlanPath, type WorkbenchPlanSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectContextPlans } from "./WorkbenchPlanContextPanel";

const plan = (path: string, project: string | null): WorkbenchPlanSummary => ({
  path: WorkbenchPlanPath.make(path),
  name: path,
  directory: path.split("/")[0] ?? "",
  project,
  status: "active",
  date: null,
  tags: [],
  mtimeMs: 1,
  binding: null,
});

const plans = [
  plan("t3code/phase-6.md", "T3 Code"),
  plan("agent-workbench/phase-3.md", "Agent Workbench"),
  plan("T3 Code/reference.md", null),
];

describe("projectContextPlans", () => {
  it("uses explicit associations for This Chat rather than recent-plan fallback", () => {
    expect(
      projectContextPlans({
        items: plans,
        project: "T3 Code",
        lens: "chat",
        associations: {
          revision: 1,
          primary: {
            id: "association-1",
            planPath: WorkbenchPlanPath.make("agent-workbench/phase-3.md"),
            role: "primary",
            state: "current",
            source: "explicit",
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
          references: [],
          history: [],
        },
      }).map((item) => item.path),
    ).toEqual([WorkbenchPlanPath.make("agent-workbench/phase-3.md")]);
  });

  it("falls back to the path parent for project grouping and keeps All Plans complete", () => {
    expect(
      projectContextPlans({
        items: plans,
        project: "T3 Code",
        lens: "project",
        associations: null,
      }).map((item) => item.path),
    ).toEqual([
      WorkbenchPlanPath.make("t3code/phase-6.md"),
      WorkbenchPlanPath.make("T3 Code/reference.md"),
    ]);
    expect(
      projectContextPlans({ items: plans, project: "wrong", lens: "all", associations: null }),
    ).toHaveLength(3);
  });
});
