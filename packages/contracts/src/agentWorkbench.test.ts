import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  AgentWorkbenchPromptDetail,
  AgentWorkbenchResourceMutationReview,
} from "./agentWorkbench.ts";

const decodePromptDetail = Schema.decodeUnknownSync(AgentWorkbenchPromptDetail);
const decodeResourceReview = Schema.decodeUnknownSync(AgentWorkbenchResourceMutationReview);

describe("Agent Workbench contracts", () => {
  it("preserves nullable prompt content from the authority", () => {
    const decoded = decodePromptDetail({
      state: "read-only",
      id: "strategicImplement",
      composerInputArgument: null,
      systemMessage: null,
      reason: "write credential unavailable",
    });

    expect(decoded).toMatchObject({ composerInputArgument: null, systemMessage: null });
  });

  it("decodes canonical review evidence without weakening the registered target", () => {
    const decoded = decodeResourceReview({
      protocolVersion: "1.0.0",
      revision: 2,
      proposal: {
        id: "proposal-1",
        requestId: "request-1",
        revision: 2,
        state: "prepared",
        operation: "upsert",
        mutationClass: "rule",
        target: { kind: "rule", sourceId: "claude-global", relativePath: "rules/testing.md" },
        path: "/authority/rules/testing.md",
        scope: "global",
        beforeDigest: "old",
        afterDigest: "new",
        diff: "+validated",
        diffDigest: "diff",
        validator: {
          id: "rules",
          valid: true,
          errors: [],
          checks: [{ id: "check-rules", state: "passed", detail: "isolated temp home" }],
        },
        git: {
          root: "/authority",
          head: "abc",
          clean: true,
          statusDigest: "clean",
          changedPaths: [],
          requiresCheckpoint: false,
        },
        dependencies: [],
        createdAt: "2026-09-07T00:00:00Z",
        updatedAt: "2026-09-07T00:00:00Z",
      },
    });
    expect(decoded.proposal.target.relativePath).toBe("rules/testing.md");
    expect(decoded.proposal.validator.checks?.[0]?.state).toBe("passed");
  });
});
