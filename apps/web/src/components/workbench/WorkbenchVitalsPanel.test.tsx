import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children: React.ReactNode }) => <a href="/usage">{children}</a>,
}));

vi.mock("../../state/usage", () => ({
  useUsage: () => ({
    environments: [],
    isPending: false,
    isPartial: false,
    merged: {
      models: [],
      costUsd: 0,
      totalTokens: 0,
      uncachedInputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
    },
    refresh: vi.fn(),
  }),
}));

vi.mock("../../state/workbenchPlans", () => ({
  useWorkbenchVitals: () => ({
    data: {
      capturedAt: "2026-09-09T12:00:00.000Z",
      capability: { status: "partial", reason: "One window is stale." },
      windows: [
        {
          id: "claude:weekly",
          provider: "claude",
          providerInstanceId: "claude",
          providerLabel: "Claude",
          label: "7-day",
          usedPercent: 35,
          remainingPercent: 65,
          resetsAt: "2026-09-12T12:00:00.000Z",
          observedAt: "2026-09-09T11:58:00.000Z",
          source: "claude-oauth",
          state: "stale",
        },
        {
          id: "codex:weekly",
          provider: "codex",
          providerInstanceId: "codex",
          providerLabel: "Codex",
          label: "Weekly",
          usedPercent: null,
          remainingPercent: null,
          resetsAt: null,
          observedAt: null,
          source: "codex-app-server",
          state: "unavailable",
        },
      ],
    },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));

import { WorkbenchVitalsPanel } from "./WorkbenchVitalsPanel";

describe("WorkbenchVitalsPanel", () => {
  it("renders provider facts, provenance, and explicit unknowns without forecasts", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchVitalsPanel environmentId={EnvironmentId.make("environment-1")} />,
    );

    expect(markup).toContain("35% used · 65% left");
    expect(markup).toContain("Claude OAuth");
    expect(markup).toContain("stale");
    expect(markup).toContain("— used · — left");
    expect(markup).toContain("Reset time unavailable");
    expect(markup).toContain("Codex app-server");
    expect(markup).toContain("unavailable");
    expect(markup.replace(/<[^>]+>/g, " ")).not.toMatch(/forecast|exhaust|burn rate|pace/i);
  });
});
