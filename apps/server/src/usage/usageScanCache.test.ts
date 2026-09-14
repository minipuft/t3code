// @effect-diagnostics nodeBuiltinImport:off - real transcript resume across a persisted cache boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

import {
  decodeScanCache,
  dedupeWithinFile,
  encodeScanCache,
  pruneScanCache,
  type CachedFile,
  type ScanCache,
} from "./usageScanCache.ts";
import { readTranscriptRecords } from "./usageTranscriptReader.ts";
import type { UsageRecord } from "./usageTranscripts.ts";

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
    dedupeKey: "msg_1:",
    ...overrides,
  };
}

function position(overrides: Partial<CachedFile["position"]> = {}): CachedFile["position"] {
  return {
    resumeOffset: 120,
    guardLength: 64,
    guardHash: 0xdeadbeef,
    codexState: null,
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
      position: position(),
    });
  }
  return cache;
}

describe("scan cache round trip", () => {
  it("restores records unchanged", () => {
    const original = cacheWith([
      ["/a.jsonl", 100, [record(), record({ dedupeKey: "msg_2:", model: "claude-opus-5" })]],
      ["/b.jsonl", 200, [record({ sessionId: "session-b", reportedCostUsd: 1.5 })]],
    ]);
    original.set("/grok.jsonl", {
      size: 40,
      mtimeMs: 300,
      provider: "grok",
      records: [
        record({ provider: "grok", model: "grok-4.5-build", dedupeKey: "s:p:grok-4.5-build" }),
      ],
      tailRecords: [record({ provider: "grok", model: "grok-4.5-build", dedupeKey: null })],
      position: position({ resumeOffset: 30, guardLength: 30, guardHash: 123 }),
    });
    original.set("/codex.jsonl", {
      size: 80,
      mtimeMs: 400,
      provider: "codex",
      records: [record({ provider: "codex", model: "gpt-5.2-codex", dedupeKey: null })],
      tailRecords: [],
      position: position({
        codexState: {
          model: "gpt-5.2-codex",
          sessionId: "session-c",
          workspacePath: "/workspace/c",
          lastUsageSignature: '{"input_tokens":1}',
          sawSessionMeta: true,
          suppressingForkCopies: false,
          forkCopyAnchorMs: 0,
        },
      }),
    });

    const restored = decodeScanCache(JSON.parse(JSON.stringify(encodeScanCache(original))));

    expect(restored.size).toBe(4);
    expect(restored.get("/a.jsonl")).toEqual(original.get("/a.jsonl"));
    expect(restored.get("/b.jsonl")).toEqual(original.get("/b.jsonl"));
    expect(restored.get("/grok.jsonl")).toEqual(original.get("/grok.jsonl"));
    expect(restored.get("/codex.jsonl")).toEqual(original.get("/codex.jsonl"));
  });

  it("drops an entry whose persisted parse state is corrupt", () => {
    // Resuming with a bad reducer state would attach appended usage to the
    // wrong model or replay fork-copied history; that entry must cold parse.
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const poisoned = {
      ...encoded,
      files: {
        "/a.jsonl": { ...encoded.files["/a.jsonl"]!, cs: { model: 42 } },
      },
    };

    expect(decodeScanCache(JSON.parse(JSON.stringify(poisoned))).has("/a.jsonl")).toBe(false);
  });

  it("drops an entry whose guard length is outside the supported range", () => {
    // The guard length sizes a Buffer in the reader; a bogus value would make
    // every parse of that file fail and silently drop its usage.
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const poisoned = {
      ...encoded,
      files: { "/a.jsonl": { ...encoded.files["/a.jsonl"]!, gl: 1e20 } },
    };

    expect(decodeScanCache(JSON.parse(JSON.stringify(poisoned))).has("/a.jsonl")).toBe(false);
  });

  it("rejects a document from the previous cache version", () => {
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const previous = { ...encoded, version: 2 };

    expect(decodeScanCache(JSON.parse(JSON.stringify(previous))).size).toBe(0);
  });

  it("interns repeated model and session strings", () => {
    const encoded = encodeScanCache(
      cacheWith([["/a.jsonl", 100, [record(), record({ dedupeKey: "msg_2:" }), record()]]]),
    );

    expect(encoded.models).toEqual(["claude-fable-5"]);
    expect(encoded.sessions).toEqual(["session-a"]);
  });

  it("treats a corrupt or foreign document as an empty cache", () => {
    // A bad cache should cost one cold scan, never a broken page.
    expect(decodeScanCache(null).size).toBe(0);
    expect(decodeScanCache("nonsense").size).toBe(0);
    expect(decodeScanCache({ version: 999, models: [], sessions: [], files: {} }).size).toBe(0);
    expect(decodeScanCache({ version: 2, models: [], sessions: [], files: {} }).size).toBe(0);
  });

  it("skips malformed file entries but keeps good ones", () => {
    const encoded = encodeScanCache(cacheWith([["/good.jsonl", 100, [record()]]]));
    const withJunk = {
      ...encoded,
      files: { ...encoded.files, "/bad.jsonl": { s: "nope", m: 1, p: "claude", r: [] } },
    };

    const restored = decodeScanCache(JSON.parse(JSON.stringify(withJunk)));
    expect([...restored.keys()]).toEqual(["/good.jsonl"]);
  });

  it("rejects the whole cache when an intern table holds a non-string", () => {
    // models: [1] would pass the undefined guard, put a number in a record's
    // model, and crash lookupRate at aggregate time.
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const poisoned = { ...encoded, models: [1] };

    expect(decodeScanCache(JSON.parse(JSON.stringify(poisoned))).size).toBe(0);
  });

  it("drops the whole entry when any row is corrupt, forcing a cold re-parse", () => {
    // Keeping the surviving rows under the original (size, mtime) would read
    // as a valid warm hit and the file would never be re-parsed.
    const encoded = encodeScanCache(
      cacheWith([["/a.jsonl", 100, [record(), record({ dedupeKey: "msg_2:" })]]]),
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

    const restored = decodeScanCache(JSON.parse(JSON.stringify(poisoned)));
    expect(restored.has("/a.jsonl")).toBe(false);
  });
});

describe("pruneScanCache", () => {
  const retentionCutoffMs = 1000;

  it("drops entries older than retention", () => {
    const cache = cacheWith([["/old.jsonl", 500, [record()]]]);

    const removed = pruneScanCache(cache, {
      livePaths: new Set(),
      walkedRoots: ["/"],
      windowStartMs: 400,
      retentionCutoffMs,
    });

    expect(removed).toBe(1);
    expect(cache.size).toBe(0);
  });

  it("drops in-window entries whose file has disappeared", () => {
    const cache = cacheWith([["/gone.jsonl", 5000, [record()]]]);

    pruneScanCache(cache, {
      livePaths: new Set(),
      walkedRoots: ["/"],
      windowStartMs: 4000,
      retentionCutoffMs,
    });

    expect(cache.size).toBe(0);
  });

  it("keeps entries outside the walked window that are still within retention", () => {
    // Viewing 7 days must not evict the 30-day entries, which that walk never
    // looked for and so cannot prove are gone.
    const cache = cacheWith([["/older-but-valid.jsonl", 2000, [record()]]]);

    const removed = pruneScanCache(cache, {
      livePaths: new Set(),
      walkedRoots: ["/"],
      windowStartMs: 4000,
      retentionCutoffMs,
    });

    expect(removed).toBe(0);
    expect(cache.size).toBe(1);
  });

  it("keeps entries the walk saw", () => {
    const cache = cacheWith([["/live.jsonl", 5000, [record()]]]);

    pruneScanCache(cache, {
      livePaths: new Set(["/live.jsonl"]),
      walkedRoots: ["/"],
      windowStartMs: 4000,
      retentionCutoffMs,
    });

    expect(cache.size).toBe(1);
  });
});

describe("pruneScanCache with an unwalked root", () => {
  it("keeps in-window entries for a provider whose directory was not walked", () => {
    // A missing provider root or failed settings read leaves livePaths without
    // that provider's files. Its warm entries must survive the pass.
    const cache = cacheWith([["/codex/sessions/a.jsonl", 5000, [record()]]]);

    const removed = pruneScanCache(cache, {
      livePaths: new Set(),
      walkedRoots: ["/claude/projects"],
      windowStartMs: 4000,
      retentionCutoffMs: 1000,
    });

    expect(removed).toBe(0);
    expect(cache.size).toBe(1);
  });

  it("keeps entries under a sibling path that only shares the walked root prefix", () => {
    const cache = cacheWith([["/claude/projects-copy/a.jsonl", 5000, [record()]]]);

    const removed = pruneScanCache(cache, {
      livePaths: new Set(),
      walkedRoots: ["/claude/projects"],
      windowStartMs: 4000,
      retentionCutoffMs: 1000,
    });

    expect(removed).toBe(0);
    expect(cache.size).toBe(1);
  });
});

describe("dedupeWithinFile", () => {
  it("keeps the first record per dedupe key", () => {
    const kept = dedupeWithinFile([
      record({ totals: { ...record().totals, outputTokens: 1 } }),
      record({ totals: { ...record().totals, outputTokens: 999 } }),
      record({ dedupeKey: "msg_2:" }),
    ]);

    expect(kept).toHaveLength(2);
    expect(kept[0]?.totals.outputTokens).toBe(1);
  });

  it("keeps every record that has no dedupe key", () => {
    expect(
      dedupeWithinFile([record({ dedupeKey: null }), record({ dedupeKey: null })]),
    ).toHaveLength(2);
  });
});

describe("combined cache v4", () => {
  it.each(["workspace", "incremental"])("rejects the incompatible %s v3 dialect", (dialect) => {
    const encoded = encodeScanCache(cacheWith([["/a.jsonl", 100, [record()]]]));
    const file = encoded.files["/a.jsonl"]!;
    const legacyFile =
      dialect === "workspace"
        ? { s: file.s, m: file.m, p: file.p, r: file.r }
        : { ...file, r: file.r.map((row) => row.slice(0, 10)) };
    expect(encoded.version).toBe(4);
    expect(
      decodeScanCache({ ...encoded, version: 3, files: { "/a.jsonl": legacyFile } }).size,
    ).toBe(0);
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
      const first = await readTranscriptRecords(path, "codex");
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
            position: first.position,
          },
        ],
      ]);
      const restored = decodeScanCache(JSON.parse(JSON.stringify(encodeScanCache(original))));
      expect(restored.get(path)?.position.codexState?.workspacePath).toBe("/workspace/c");
      const usage = JSON.stringify({
        type: "event_msg",
        timestamp: "2026-08-01T10:00:05Z",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: 100, output_tokens: 9 } },
        },
      });
      await NodeFSP.appendFile(path, `${usage}\n`);
      const second = await readTranscriptRecords(path, "codex", restored.get(path)?.position);
      expect(second?.resumed).toBe(true);
      expect(second?.records).toHaveLength(1);
      expect(second?.records[0]).toMatchObject({
        model: "test-model",
        sessionId: "session-c",
        workspacePath: "/workspace/c",
        workspaceSource: "codexSessionMeta",
      });
      const full = await readTranscriptRecords(path, "codex");
      expect(second?.records).toEqual(full?.records);
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
});
