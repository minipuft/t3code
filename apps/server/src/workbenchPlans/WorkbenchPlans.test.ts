import {
  WorkbenchPlanPath,
  type AgentWorkbenchPlanList,
  type AgentWorkbenchVitals,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectPlanList, projectVitals } from "./WorkbenchPlans.ts";

describe("Agent Workbench plan projection", () => {
  it("projects portable plans into the existing native read model", () => {
    const input: AgentWorkbenchPlanList = {
      protocolVersion: "1.0.0",
      revision: "sha256:plans",
      state: "available",
      plans: [
        {
          id: "demo/phase.md",
          path: "demo/phase.md",
          name: "phase.md",
          directory: "demo",
          project: "demo",
          title: "Phase",
          status: "active",
          revision: "mtime:1",
          stale: false,
          readOnly: false,
          updatedAt: "2026-08-27T00:00:00.000Z",
          date: "2026-08-27",
          tags: ["demo"],
          binding: {
            planTitle: "Phase",
            threads: 2,
            confirmed: true,
            bound_at: "2026-08-27T00:00:00.000Z",
            deviations: 1,
          },
        },
      ],
    };

    const projected = projectPlanList(input);
    expect(projected.capability.status).toBe("available");
    expect(projected.items[0]).toMatchObject({
      path: WorkbenchPlanPath.make("demo/phase.md"),
      project: "demo",
      status: "active",
      tags: ["demo"],
      binding: { title: "Phase", threads: 2, confirmed: true, deviations: 1 },
    });
  });

  it("keeps used, expected, and reset data when projecting portable vitals", () => {
    const input: AgentWorkbenchVitals = {
      protocolVersion: "1.0.0",
      capturedAt: "2026-08-27T00:00:00.000Z",
      state: "available",
      binding: {
        provider: "claude",
        providerLabel: "Claude",
        label: "5-hour",
        remainingPct: 65,
        usedPct: 35,
        secondsToReset: 3_600,
        exhaustsBeforeReset: false,
        secondsToExhaustion: null,
      },
      windows: [
        {
          id: "claude-weekly",
          label: "7-day",
          provider: "claude",
          providerLabel: "Claude",
          usedPercent: 35,
          remainingPercent: 65,
          expectedPercent: 40,
          resetsAt: "2026-08-27T01:00:00.000Z",
          exhaustsBeforeReset: false,
          secondsToExhaustion: null,
          state: "available",
        },
      ],
    };

    const projected = projectVitals(input, Date.parse("2026-08-27T00:00:00.000Z"));
    expect(projected.binding).toMatchObject({ label: "5-hour", usedPct: 35, remainingPct: 65 });
    expect(projected.windows[0]).toEqual({
      provider: "claude",
      providerLabel: "Claude",
      label: "7-day",
      usedPct: 35,
      expectedPct: 40,
      secondsToReset: 3_600,
      exhaustsBeforeReset: false,
      secondsToExhaustion: null,
    });
  });

  it("degrades unsupported portable state without affecting other server capabilities", () => {
    const projected = projectPlanList({
      protocolVersion: "1.0.0",
      revision: "none",
      state: "unsupported",
      reason: "version mismatch",
      plans: [],
    });
    expect(projected).toEqual({
      capability: { status: "unavailable", reason: "version mismatch" },
      items: [],
    });
  });
});
