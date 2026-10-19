import {
  EnvironmentId,
  ProjectId,
  UsageDay,
  USAGE_CONTRACT_VERSION,
  type UsageProviderKind,
} from "@t3tools/contracts";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  useUsage,
  type EnvironmentUsageStatus,
  type UsageView,
  type UsageProjectScope,
} from "./usage";

const testState = vi.hoisted(() => ({ environments: [] as EnvironmentUsageStatus[] }));
vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
  useAtomValue: () => testState.environments,
}));

const input = {
  sinceDay: UsageDay.make("2026-09-04"),
  untilDay: UsageDay.make("2026-09-04"),
  timeZone: "UTC",
};

function environment(
  id: string,
  cost: number | null,
  hostId = id,
  provider: UsageProviderKind = "codex",
): EnvironmentUsageStatus {
  return {
    environmentId: EnvironmentId.make(id),
    label: id,
    isPending: cost === null,
    canReadDiagnostics: true,
    isConnected: true,
    error: null,
    needsCursorKeychainAccess: false,
    summary:
      cost === null
        ? null
        : {
            ...input,
            contractVersion: USAGE_CONTRACT_VERSION,
            readAt: "2026-09-04T12:00:00Z",
            buckets: [
              {
                day: input.sinceDay,
                provider,
                model: id,
                projectId: null,
                attributionStatus: "missingEvidence",
                totals: {
                  uncachedInputTokens: 100,
                  cachedInputTokens: 0,
                  cacheCreationTokens: 0,
                  outputTokens: 50,
                  reasoningTokens: 0,
                },
                costUsd: cost,
                cacheSavingsUsd: 0,
                costSource: "modelPriced",
                records: 1,
                unpricedRecords: 0,
                sessions: 1,
              },
            ],
            sources: [
              {
                fingerprint: {
                  hostId,
                  provider,
                  resolvedHomePath: "/sessions",
                  volumeId: hostId,
                },
                status: "ok",
                scannedFiles: 1,
                skippedFiles: 0,
                malformedRecords: 0,
                distinctSessions: 1,
                message: null,
              },
            ],
            pricing: { status: "fresh", source: "test", fetchedAt: null, knownModels: 1 },
            scanDurationMs: 1,
          },
  };
}

let root: Root;
let latest: UsageView;

function Probe({
  selected,
  hidden,
  scope,
  window = input,
}: {
  selected: ReadonlySet<EnvironmentId> | null;
  scope?: UsageProjectScope;
  hidden?: ReadonlySet<UsageProviderKind>;
  window?: typeof input;
}) {
  const usage = useUsage(window, selected, scope ?? hidden);
  useLayoutEffect(() => {
    latest = usage;
  }, [usage]);
  return null;
}

async function select(...ids: string[]) {
  await act(() =>
    root.render(<Probe selected={new Set(ids.map((id) => EnvironmentId.make(id)))} />),
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  testState.environments = [environment("a", 10), environment("b", 20), environment("slow", null)];
  root = createRoot(document.createElement("div"));
  await act(() => root.render(<Probe selected={null} />));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("usage environment selection", () => {
  it("starts with all environments and adds results as they arrive", async () => {
    expect(latest.merged.costUsd).toBe(30);
    expect(latest.isPending).toBe(false);
    expect(latest.isPartial).toBe(true);

    testState.environments = [...testState.environments.slice(0, 2), environment("slow", 40)];
    await act(() => root.render(<Probe selected={null} />));
    expect(latest.merged.costUsd).toBe(70);
    expect(latest.isPartial).toBe(false);
  });

  it("excludes unselected usage and pending environments, then restores all", async () => {
    await select("b");
    expect(latest.merged.costUsd).toBe(20);
    expect(latest.merged.models.map((model) => model.model)).toEqual(["b"]);
    expect(latest.isPending).toBe(false);
    expect(latest.isPartial).toBe(false);
    expect(latest.environments).toHaveLength(3);

    await act(() => root.render(<Probe selected={null} />));
    expect(latest.merged.costUsd).toBe(30);
    expect(latest.isPartial).toBe(true);
  });

  it("distinguishes a pending selection from an empty or failed selection", async () => {
    await select("slow");
    expect(latest.isPending).toBe(true);
    expect(latest.merged.costUsd).toBe(0);

    await select();
    expect(latest.selectedEnvironments).toHaveLength(0);
    expect(latest.isPending).toBe(false);
    expect(latest.isPartial).toBe(false);

    testState.environments = [{ ...environment("slow", null), isPending: false, error: "Offline" }];
    await select("slow");
    expect(latest.isPending).toBe(false);
    expect(latest.isPartial).toBe(false);
  });

  it("deduplicates within the selection so an excluded owner cannot hide usage", async () => {
    testState.environments = [environment("a", 10, "shared"), environment("b", 20, "shared")];
    await act(() => root.render(<Probe selected={null} />));
    expect(latest.merged.costUsd).toBe(10);

    await select("b");
    expect(latest.merged.costUsd).toBe(20);
    expect(latest.merged.duplicateSources).toEqual([]);
  });

  it("keeps selected cached results visible during a refresh", async () => {
    testState.environments = [
      { ...environment("a", 10), isPending: true },
      environment("slow", null),
    ];
    await select("a");
    expect(latest.merged.costUsd).toBe(10);
    expect(latest.isPending).toBe(false);
    expect(latest.isPartial).toBe(false);
  });

  it("shows the last answered usage until the next window answers, for the same selection", async () => {
    const selected = new Set([EnvironmentId.make("a")]);
    await act(() => root.render(<Probe selected={selected} />));
    expect(latest.shown?.merged.costUsd).toBe(10);

    const nextWindow = { ...input, sinceDay: UsageDay.make("2026-08-28") };
    testState.environments = [environment("a", null)];
    await act(() => root.render(<Probe selected={selected} window={nextWindow} />));
    expect(latest.isPending).toBe(true);
    expect(latest.shown?.window).toBe(input);
    expect(latest.shown?.merged.costUsd).toBe(10);

    testState.environments = [{ ...environment("a", null), isPending: false, error: "Offline" }];
    await act(() => root.render(<Probe selected={selected} window={nextWindow} />));
    expect(latest.isPending).toBe(false);
    expect(latest.shown?.window).toBe(input);
    expect(latest.shown?.merged.costUsd).toBe(10);

    testState.environments = [environment("a", 30)];
    await act(() => root.render(<Probe selected={selected} window={nextWindow} />));
    expect(latest.shown?.window).toBe(nextWindow);
    expect(latest.shown?.merged.costUsd).toBe(30);

    testState.environments = [environment("a", null)];
    await act(() =>
      root.render(<Probe selected={selected} hidden={new Set(["claude"])} window={input} />),
    );
    expect(latest.shown).toBeNull();

    testState.environments = [environment("a", null)];
    await select("a");
    expect(latest.shown).toBeNull();
  });
});

describe("usage provider filter", () => {
  it("drops hidden providers from totals and sessions, then restores them", async () => {
    testState.environments = [environment("a", 10), environment("c", 5, "c", "claude")];
    await act(() => root.render(<Probe selected={null} hidden={new Set(["codex"])} />));
    expect(latest.merged.costUsd).toBe(5);
    expect(latest.merged.sessions).toBe(1);
    expect(latest.merged.providers.map((entry) => entry.provider)).toEqual(["claude"]);

    await act(() => root.render(<Probe selected={null} />));
    expect(latest.merged.costUsd).toBe(15);
    expect(latest.merged.sessions).toBe(2);
  });
});

describe("usage selection and project scope", () => {
  it("intersects project attribution with selected environments without changing selection state", async () => {
    const projectId = ProjectId.make("shared-project-id");
    const a = environment("a", 10);
    const b = environment("b", 20);
    testState.environments = [a, b].map((entry) => ({
      ...entry,
      summary:
        entry.summary === null
          ? null
          : {
              ...entry.summary,
              buckets: entry.summary.buckets.map((bucket) => ({
                ...bucket,
                projectId,
                attributionStatus: "attributed" as const,
              })),
            },
    }));
    const scope = { environmentId: EnvironmentId.make("a"), projectId };
    await act(() =>
      root.render(
        <Probe
          selected={new Set([EnvironmentId.make("a"), EnvironmentId.make("b")])}
          scope={scope}
        />,
      ),
    );
    expect(latest.merged.costUsd).toBe(10);
    expect(latest.selectedEnvironments).toHaveLength(2);
    await act(() =>
      root.render(<Probe selected={new Set([EnvironmentId.make("b")])} scope={scope} />),
    );
    expect(latest.merged.costUsd).toBe(0);
    expect(latest.selectedEnvironments.map((entry) => entry.environmentId)).toEqual(["b"]);
    expect(latest.isPending).toBe(false);
    await act(() => root.render(<Probe selected={new Set([EnvironmentId.make("b")])} />));
    expect(latest.merged.costUsd).toBe(20);
  });

  it("keeps the explicit unattributed bucket distinct from all projects", async () => {
    const a = environment("a", 10);
    if (a.summary === null) throw new Error("Missing fixture summary");
    testState.environments = [
      {
        ...a,
        summary: {
          ...a.summary,
          buckets: [
            ...a.summary.buckets,
            {
              ...a.summary.buckets[0]!,
              projectId: ProjectId.make("project"),
              attributionStatus: "attributed",
              costUsd: 30,
            },
          ],
        },
      },
    ];
    await act(() =>
      root.render(
        <Probe selected={null} scope={{ environmentId: a.environmentId, projectId: null }} />,
      ),
    );
    expect(latest.merged.costUsd).toBe(10);
    await act(() => root.render(<Probe selected={null} />));
    expect(latest.merged.costUsd).toBe(40);
  });
});
