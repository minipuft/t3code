// @effect-diagnostics nodeBuiltinImport:off - real transcript resume across a persisted cache boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

import {
  decodeScanCache,
  makeScanCacheWriter,
  type CachedFile,
  type ScanCache,
} from "./usageScanCache.ts";
import type { UsageRecord } from "@t3tools/provider-core/server/usage";

import { readTranscriptRecords } from "./usageTranscriptReader.ts";
import { codexUsageFormat } from "../provider/Drivers/codexUsage.ts";
import { TEST_FORMAT_MAP } from "./usageTestFormats.ts";
import { initialCodexScanState, parseCodexLine } from "../provider/Drivers/codexUsage.ts";

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    provider: "claude",
    timestampMs: 1_786_000_000_000,
    model: "claude-fable-5",
    sessionId: "session-a",
    workspacePath: "/workspace/a",
    workspaceSource: "claudeCwd",
    totals: {
      uncachedInputTokens: 2,
      cachedInputTokens: 1000,
      cacheCreationTokens: 10,
      outputTokens: 50,
      reasoningTokens: 0,
    },
    reportedCostUsd: null,
    speed: "standard",
    dedupeKey: "msg_1:",
    ...overrides,
  };
}

function position(overrides: Partial<CachedFile["position"]> = {}): CachedFile["position"] {
  return {
    resumeOffset: 120,
    guardLength: 64,
    guardHash: 0xdeadbeef,
    state: null,
    ...overrides,
  };
}

function cacheWith(entries: readonly [string, number, readonly UsageRecord[]][]): ScanCache {
  const cache: ScanCache = new Map();
  for (const [path, mtimeMs, records] of entries) {
    cache.set(path, {
      size: records.length * 10,
      mtimeMs,
      provider: "claude",
      records,
      tailRecords: [],
      malformedRecords: 0,
      position: position(),
    });
  }
  return cache;
}

interface EncodedScanCache {
  readonly version: number;
  readonly files: Record<string, { readonly r: unknown[][]; readonly [key: string]: unknown }>;
  readonly [key: string]: unknown;
}

const encodeScanCache = (cache: ScanCache): EncodedScanCache =>
  JSON.parse(makeScanCacheWriter()(cache, {}));

describe("scan cache round trip", () => {
  it("restores cached history unchanged except for Claude local placeholders", () => {
    const original = cacheWith([
      [
        "/a.jsonl",
        100,
        [record(), record({ dedupeKey: "msg_2:", model: "claude-opus-5-5", speed: "fast" })],
      ],
      [
        "/b.jsonl",
        200,
        [
          record({
            sessionId: "session-b",
            reportedCostUsd: 1.5,
            totals: {
              uncachedInputTokens: 0,
              cachedInputTokens: 0,
              cacheCreationTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
            },
          }),
        ],
      ],
    ]);
    original.set("/grok.jsonl", {
      size: 40,
      malformedRecords: 2,
      mtimeMs: 300,
      provider: "grok",
      records: [
        record({ provider: "grok", model: "grok-4.5-build", dedupeKey: "s:p:grok-4.5-build" }),
        record({ provider: "grok", model: "<synthetic>", dedupeKey: "s:p:<synthetic>" }),
      ],
      tailRecords: [record({ provider: "grok", model: "<synthetic>", dedupeKey: null })],
      position: position({ resumeOffset: 30, guardLength: 30, guardHash: 123 }),
    });
    const state = initialCodexScanState();
    for (const line of [
      {
        type: "session_meta",
        payload: { id: "session-c", model_provider: "openai", cwd: "/workspace/c" },
      },
      { type: "turn_context", payload: { model: "gpt-6-astra", turn_id: "native-turn" } },
      {
        type: "event_msg",
        timestamp: "2026-08-01T10:00:00Z",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 1, output_tokens: 2 } },
        },
      },
    ])
      parseCodexLine(JSON.stringify(line), state);
    const pending = {
      ...record({
        provider: "codex",
        model: "gpt-6-astra",
        sessionId: "session-c",
        dedupeKey: null,
      }),
      unresolvedServiceTierTurnId: "native-turn",
    };
    const pendingTail = { ...pending, unresolvedServiceTierTurnId: "native-tail" };
    original.set("/codex.jsonl", {
      size: 80,
      malformedRecords: 3,
      mtimeMs: 400,
      provider: "codex",
      records: [
        record({
          provider: "codex",
          model: "gpt-6-astra",
          rateModel: "gpt-6",
          dedupeKey: null,
          speed: "ultrafast",
        }),
        pending,
      ],
      tailRecords: [pendingTail],
      position: position({ state }),
    });

    original.set("/a.jsonl", {
      ...original.get("/a.jsonl")!,
      tailRecords: [record({ dedupeKey: "msg_tail:" })],
    });
    const claude = original.get("/a.jsonl")!;
    const cached = new Map(original);
    cached.set("/a.jsonl", {
      ...claude,
      records: [...claude.records, record({ model: "<synthetic>" })],
      tailRecords: [
        ...claude.tailRecords,
        record({ model: "<synthetic>", dedupeKey: "msg_tail:" }),
      ],
    });
    const restored = decodeScanCache(
      JSON.parse(makeScanCacheWriter()(cached, {})),
      TEST_FORMAT_MAP,
    );

    expect(restored.size).toBe(4);
    expect(restored).toEqual(original);
  });

  it("rewrites only changed entries and still restores the whole cache", () => {
    const write = makeScanCacheWriter();
    const cache = cacheWith([
      ["/a.jsonl", 100, [record()]],
      ["/b.jsonl", 200, [record({ sessionId: "session-b" })]],
    ]);
    cache.set("/b.jsonl", { ...cache.get("/b.jsonl")!, malformedRecords: 2 });
    const sources = { "claude\u0000/projects": { dir: "/projects", volumeId: "1:2" } };
    expect(decodeScanCache(JSON.parse(write(cache, { sources })), TEST_FORMAT_MAP)).toEqual(cache);

    cache.set("/b.jsonl", {
      ...cache.get("/b.jsonl")!,
      size: 30,
      malformedRecords: 4,
      records: [record({ sessionId: "session-c", model: "claude-opus-5-5", dedupeKey: "msg_3:" })],
    });
    const document = JSON.parse(write(cache, { sources }));
    expect(decodeScanCache(document, TEST_FORMAT_MAP)).toEqual(cache);
    expect(document.sources).toEqual(sources);
  });

  it("treats a corrupt or foreign document as an empty cache", () => {
    expect(decodeScanCache(null, TEST_FORMAT_MAP).size).toBe(0);
    expect(decodeScanCache("nonsense", TEST_FORMAT_MAP).size).toBe(0);
    expect(
      decodeScanCache({ version: 999, models: [], sessions: [], files: {} }, TEST_FORMAT_MAP).size,
    ).toBe(0);
  });

  it("skips malformed file entries but keeps good ones", () => {
    const encoded = JSON.parse(
      makeScanCacheWriter()(cacheWith([["/good.jsonl", 100, [record()]]]), {}),
    );
    const withJunk = {
      ...encoded,
      files: { ...encoded.files, "/bad.jsonl": { s: "nope", m: 1, p: "claude", r: [] } },
    };

    const restored = decodeScanCache(JSON.parse(JSON.stringify(withJunk)), TEST_FORMAT_MAP);
    expect([...restored.keys()]).toEqual(["/good.jsonl"]);
  });

  it("drops the whole entry when any row is corrupt, forcing a cold re-parse", () => {
    const encoded = JSON.parse(
      makeScanCacheWriter()(
        cacheWith([["/a.jsonl", 100, [record(), record({ dedupeKey: "msg_2:" })]]]),
        {},
      ),
    );
    const rows = encoded.files["/a.jsonl"]!.r;
    const poisoned = {
      ...encoded,
      files: {
        "/a.jsonl": {
          ...encoded.files["/a.jsonl"]!,
          r: [rows[0]!, [...rows[1]!.slice(0, 3), "not-a-number", ...rows[1]!.slice(4)]],
        },
      },
    };

    const restored = decodeScanCache(JSON.parse(JSON.stringify(poisoned)), TEST_FORMAT_MAP);
    expect(restored.has("/a.jsonl")).toBe(false);
  });
});

describe("combined cache v12", () => {
  it.each(["workspace", "incremental"])("rejects the incompatible %s v3 dialect", (dialect) => {
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const file = encoded.files["/a.jsonl"]!;
    const legacyFile =
      dialect === "workspace"
        ? { s: file.s, m: file.m, p: file.p, r: file.r }
        : { ...file, r: file.r.map((row) => row.slice(0, 10)) };
    expect(encoded.version).toBe(12);
    expect(
      decodeScanCache(
        { ...encoded, version: 3, files: { "/a.jsonl": legacyFile } },
        TEST_FORMAT_MAP,
      ).size,
    ).toBe(0);
  });

  it.each(["fork", "upstream"])("retains %s v5 history and forces a full reparse", (dialect) => {
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record({ speed: "fast" })]]]));
    const file = encoded.files["/a.jsonl"]!;
    const rows = file.r.map((row) =>
      dialect === "fork" ? [...row.slice(0, 10), "/workspace/a", "claudeCwd", 1] : row.slice(0, 12),
    );
    const restored = decodeScanCache(
      { ...encoded, version: 5, files: { "/a.jsonl": { ...file, r: rows } } },
      TEST_FORMAT_MAP,
    );
    expect(restored.get("/a.jsonl")?.size).toBe(-1);
    expect(restored.get("/a.jsonl")?.position.resumeOffset).toBe(0);
    expect(restored.get("/a.jsonl")?.records[0]).toMatchObject({
      speed: "fast",
      workspacePath: dialect === "fork" ? "/workspace/a" : null,
      workspaceSource: dialect === "fork" ? "claudeCwd" : "none",
    });
  });

  it.each([
    { dialect: "fork", version: 6 },
    ...[7, 8, 9, 10, 11].map((version) => ({ dialect: "upstream", version })),
  ])("retains $dialect v$version history and forces a full reparse", ({ dialect, version }) => {
    const turn = "turn-1";
    const encoded = encodeScanCache(
      cacheWith([
        [
          "/a.jsonl",
          100,
          [
            record({
              provider: "codex",
              dedupeKey: null,
              rateModel: "gpt-6",
              unresolvedServiceTierTurnId: turn,
            }),
          ],
        ],
      ]),
    );
    const file = encoded.files["/a.jsonl"]!;
    const rows = file.r.map((row) =>
      dialect === "fork" ? row.slice(0, 14) : [...row.slice(0, 12), row[14]],
    );
    const restored = decodeScanCache(
      { ...encoded, version, files: { "/a.jsonl": { ...file, r: rows, cs: null } } },
      TEST_FORMAT_MAP,
    );

    expect(restored.get("/a.jsonl")).toMatchObject({
      size: -1,
      position: { resumeOffset: 0, guardLength: 0, guardHash: 0, state: null },
    });
    expect(restored.get("/a.jsonl")?.records[0]).toMatchObject({
      rateModel: "gpt-6",
      workspacePath: dialect === "fork" ? "/workspace/a" : null,
      workspaceSource: dialect === "fork" ? "claudeCwd" : "none",
    });
    expect(restored.get("/a.jsonl")?.records[0]?.unresolvedServiceTierTurnId).toBe(
      dialect === "fork" ? undefined : turn,
    );
  });

  it("keeps workspace evidence when resuming a Codex transcript through a persisted cache", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "usage-cache-resume-"));
    try {
      const path = NodePath.join(directory, "rollout.jsonl");
      const meta = JSON.stringify({
        type: "session_meta",
        timestamp: "2026-08-01T10:00:00Z",
        payload: { type: "session_meta", id: "session-c", cwd: "/workspace/c" },
      });
      const model = JSON.stringify({
        type: "turn_context",
        timestamp: "2026-08-01T10:00:01Z",
        payload: { type: "turn_context", model: "test-model" },
      });
      await NodeFSP.writeFile(path, `${meta}\n${model}\n`);
      const first = await readTranscriptRecords(path, codexUsageFormat);
      expect(first).not.toBeNull();
      if (first === null) throw new Error("Initial transcript read failed");
      const stat = await NodeFSP.stat(path);
      const original: ScanCache = new Map([
        [
          path,
          {
            provider: "codex",
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            records: first.records,
            tailRecords: first.tailRecords,
            malformedRecords: first.malformedRecords,
            position: first.position,
          },
        ],
      ]);
      const restored = decodeScanCache(
        JSON.parse(JSON.stringify(encodeScanCache(original))),
        TEST_FORMAT_MAP,
      );
      expect(restored.get(path)?.position.state).toMatchObject({ workspacePath: "/workspace/c" });
      const usage = JSON.stringify({
        type: "event_msg",
        timestamp: "2026-08-01T10:00:05Z",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 100, output_tokens: 9 } },
        },
      });
      await NodeFSP.appendFile(path, `${usage}\n`);
      const second = await readTranscriptRecords(
        path,
        codexUsageFormat,
        restored.get(path)?.position,
      );
      expect(second?.resumed).toBe(true);
      expect(second?.records).toHaveLength(1);
      expect(second?.records[0]).toMatchObject({
        model: "test-model",
        sessionId: "session-c",
        workspacePath: "/workspace/c",
        workspaceSource: "codexSessionMeta",
      });
      const full = await readTranscriptRecords(path, codexUsageFormat);
      expect(second?.records).toEqual(full?.records);
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
});
