import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { AgentWorkbenchPromptDetail, AgentWorkbenchVitals } from "./agentWorkbench.ts";

describe("Agent Workbench contracts", () => {
  it("decodes provider vitals with used and remaining values plus thread binding", () => {
    const decoded = Schema.decodeUnknownSync(AgentWorkbenchVitals)({
      protocolVersion: "1.0.0",
      capturedAt: "2026-08-27T00:00:00.000Z",
      state: "available",
      binding: { threadId: "thread-1", windowId: "claude-weekly" },
      windows: [
        {
          id: "claude-weekly",
          label: "7-day",
          usedPercent: 35,
          remainingPercent: 65,
          resetsAt: null,
          state: "available",
        },
      ],
    });

    expect(decoded.binding).toEqual({ threadId: "thread-1", windowId: "claude-weekly" });
    expect(decoded.windows[0]?.remainingPercent).toBe(65);
  });

  it("preserves nullable prompt content from the authority", () => {
    const decoded = Schema.decodeUnknownSync(AgentWorkbenchPromptDetail)({
      state: "read-only",
      id: "strategicImplement",
      composerInputArgument: null,
      systemMessage: null,
      reason: "write credential unavailable",
    });

    expect(decoded).toMatchObject({ composerInputArgument: null, systemMessage: null });
  });
});
