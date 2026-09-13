import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { UsageBucket } from "./usage.ts";

const decodeBucket = Schema.decodeUnknownSync(UsageBucket);

describe("UsageBucket attribution", () => {
  it("requires an explicit attributed or unattributed dimension", () => {
    const common = {
      day: "2026-09-10",
      provider: "claude",
      model: "claude-fable-5",
      totals: {
        uncachedInputTokens: 1,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 1,
        reasoningTokens: 0,
      },
      costUsd: 0.01,
      cacheSavingsUsd: 0,
      costSource: "modelPriced",
      records: 1,
      unpricedRecords: 0,
      sessions: 1,
    };

    expect(
      decodeBucket({ ...common, projectId: "project-a", attributionStatus: "attributed" }),
    ).toMatchObject({ projectId: "project-a", attributionStatus: "attributed" });
    expect(() => decodeBucket(common)).toThrow();
  });
});
