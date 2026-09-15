import { WorkbenchPlanPath, type AgentWorkbenchPlanList } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectAssociations,
  projectPlanList,
  projectSuggestions,
  projectResourceLibrary,
  projectResourceLedger,
  projectReviewInbox,
  projectTopology,
} from "./WorkbenchPlans.ts";

describe("Agent Workbench plan projection", () => {
  it("redacts filesystem roots from browser topology while preserving semantic provenance", () => {
    const projected = projectTopology({
      protocolVersion: "1.0.0",
      nodes: [
        { id: "posix", kind: "project", label: "POSIX", provenance: "/home/user/project" },
        { id: "drive", kind: "project", label: "Drive", provenance: "C:\\Users\\user" },
        { id: "unc", kind: "repository", label: "UNC", provenance: "\\\\server\\share" },
        { id: "file", kind: "repository", label: "File", provenance: "file:///work/repo" },
        { id: "home", kind: "resource_source", label: "Home", provenance: "~/.claude" },
        { id: "semantic", kind: "resource_source", label: "Semantic", provenance: "global-skills" },
        { id: "unknown", kind: "projection_target", label: "Unknown", provenance: null },
      ],
      approved: [],
      proposed: [
        {
          id: "proposal",
          kind: "project_uses_repository",
          source: "posix",
          target: "semantic",
          state: "proposed",
          evidence: {
            type: "git",
            locator: "/home/user/project",
            token: "secret-value",
            note: "bounded discovery",
          },
        },
      ],
    });

    expect(projected.nodes.map(({ id, provenance }) => [id, provenance])).toEqual([
      ["posix", null],
      ["drive", null],
      ["unc", null],
      ["file", null],
      ["home", null],
      ["semantic", "global-skills"],
      ["unknown", null],
    ]);
    expect(projected.proposed[0]?.evidence).toEqual({
      type: "git",
      locator: "[path redacted]",
      token: "[redacted]",
      note: "bounded discovery",
    });
  });

  it("allowlists audit findings and redacts host paths and credentials before browser delivery", () => {
    const projected = projectReviewInbox({
      protocolVersion: "1.0.0",
      revision: 1,
      items: [
        {
          id: "audit-1",
          kind: "audit",
          source: { type: "markdown", locator: "agent-workbench" },
          proposedKind: "rule",
          files: [],
          digest: "digest",
          state: "staged",
          activatable: false,
          createdAt: "2026-09-13T00:00:00.000Z",
          updatedAt: "2026-09-13T00:00:00.000Z",
          warnings: [],
          audit: {
            identity: "agents",
            family: "claude",
            state: "stale",
            sourceHash: "before",
            targetHash: "after",
            reason:
              "Repository policy at /home/theo/project differs; Authorization: Bearer private-token",
            evidence: [
              {
                kind: "file:///work/AGENTS.md",
                locator: "C:\\Users\\theo\\AGENTS.md",
                detail: "policy differs",
              },
              {
                kind: "\\\\host\\share\\AGENTS.md",
                locator: "~/.claude/AGENTS.md",
                detail: "token=secret-value",
              },
            ],
            updatedAt: "2026-09-13T00:00:00.000Z",
          },
        },
        {
          id: "relationship-1",
          kind: "relationship",
          source: {
            type: "markdown",
            locator: "file:///home/theo/relationship-evidence.md",
            revision: "C:\\Users\\theo\\evidence.md",
          },
          proposedKind: "rule",
          files: [
            {
              path: "\\\\host\\share\\relationship.md",
              content:
                "Repository relationship observed at ~/.claude/AGENTS.md; api_key=private-value",
              executable: false,
            },
          ],
          digest: "relationship-digest",
          state: "staged",
          activatable: false,
          createdAt: "2026-09-13T00:00:00.000Z",
          updatedAt: "2026-09-13T00:00:00.000Z",
          warnings: ["Review /home/theo/.claude/AGENTS.md before applying token=secret-value"],
        },
      ],
    });

    const audit = projected.items[0]?.audit;
    expect(audit).toEqual({
      identity: "agents",
      family: "claude",
      state: "stale",
      sourceHash: "before",
      targetHash: "after",
      reason: "Repository policy at [path redacted] differs; [redacted]",
      evidence: [
        { kind: "[path redacted]", locator: "[path redacted]", detail: "policy differs" },
        { kind: "[path redacted]", locator: "[path redacted]", detail: "[redacted]" },
      ],
      updatedAt: "2026-09-13T00:00:00.000Z",
    });
    expect(projected.items[1]).toMatchObject({
      id: "relationship-1",
      kind: "relationship",
      source: { type: "markdown", locator: "[path redacted]", revision: "[path redacted]" },
      proposedKind: "rule",
      files: [
        {
          path: "[path redacted]",
          content: "Repository relationship observed at [path redacted]; [redacted]",
          executable: false,
        },
      ],
      warnings: ["Review [path redacted] before applying [redacted]"],
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /home\/theo|C:\\Users|host\\share|private-token|private-value|secret-value/i,
    );
  });

  it("projects conversation associations and suggestions without exposing harness aliases", () => {
    const conversation = {
      host: "t3",
      environmentId: "environment-1",
      conversationId: "thread-1",
    };
    expect(
      projectAssociations({
        protocolVersion: "1.0.0",
        revision: 2,
        conversation,
        primary: {
          id: "association-1",
          conversation,
          planId: "demo/phase.md",
          planPath: "demo/phase.md",
          role: "primary",
          state: "current",
          source: "explicit",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
        references: [],
        history: [],
        aliases: [
          {
            provider: "codex",
            sessionId: "provider-thread",
            conversation,
            observedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
      }).primary,
    ).toMatchObject({ planPath: "demo/phase.md", role: "primary", state: "current" });
    expect(
      projectSuggestions({
        protocolVersion: "1.0.0",
        query: "phase",
        suggestions: [
          {
            planId: "demo/phase.md",
            planPath: "demo/phase.md",
            title: "Phase",
            project: "demo",
            score: 10,
            reasons: ["same project"],
          },
        ],
      }).items[0],
    ).toMatchObject({ path: "demo/phase.md", title: "Phase" });
  });

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

    const duplicatePath = projectPlanList({
      ...input,
      plans: [...input.plans, { ...input.plans[0]!, id: "inventory-copy" }],
    });
    expect(duplicatePath.items).toHaveLength(1);
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

  it("redacts canonical host paths while preserving review evidence", () => {
    const target = {
      kind: "rule" as const,
      sourceId: "claude-global",
      relativePath: "rules/testing.md",
    };
    const common = {
      id: "proposal-1",
      requestId: "request-1",
      revision: 1,
      state: "prepared" as const,
      operation: "upsert" as const,
      mutationClass: "rule" as const,
      target,
      path: "/home/minipuft/.claude/rules/testing.md",
      scope: "global" as const,
      beforeDigest: "old",
      afterDigest: "new",
      diff: "+proof",
      diffDigest: "diff",
      validator: {
        id: "rule-validator",
        valid: true,
        errors: [],
        checks: [{ id: "rules", state: "passed" as const, detail: "ok" }],
      },
      git: {
        root: "/home/minipuft/.claude",
        head: "abc",
        clean: true,
        statusDigest: "clean",
        changedPaths: [],
        requiresCheckpoint: false,
      },
      dependencies: ["/home/minipuft/.claude/CLAUDE.md"],
      createdAt: "2026-09-07T00:00:00Z",
      updatedAt: "2026-09-07T00:00:00Z",
    };
    const library = projectResourceLibrary({
      protocolVersion: "1.0.0",
      revision: "rev",
      lens: "global",
      project: null,
      projects: [],
      entries: [
        {
          id: "rule:testing",
          kind: "rule",
          name: "Testing",
          description: "tests",
          category: "rules",
          group: "global",
          scope: "global",
          project: null,
          provenance: {
            sourceId: "claude-global",
            sourceType: "authority",
            locator: "/home/minipuft/.claude/rules/testing.md",
            canonical: true,
          },
          effective: "enabled",
          relativePath: "rules/testing.md",
        },
      ],
    });
    const ledger = projectResourceLedger({
      protocolVersion: "1.0.0",
      revision: 1,
      proposals: [common],
      receipts: [],
    });

    expect(library.entries[0]?.provenance).not.toHaveProperty("locator");
    expect(ledger.proposals[0]).not.toHaveProperty("path");
    expect(ledger.proposals[0]?.git).not.toHaveProperty("root");
    expect(ledger.proposals[0]?.dependencies).toEqual(["CLAUDE.md"]);
    expect(ledger.proposals[0]?.validator.checks?.[0]?.state).toBe("passed");
  });
});
