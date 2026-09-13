import type { AgentWorkbenchCatalog, ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import {
  makeAgentWorkbench,
  projectHarnessAlias,
  type AgentWorkbenchConnectionShape,
} from "./AgentWorkbench.ts";
import { AgentWorkbenchConnectionError } from "./AgentWorkbenchConnection.ts";

const catalog: AgentWorkbenchCatalog = {
  protocolVersion: "1.0.0",
  revision: "sha256:catalog",
  state: "available",
  entries: [],
};

describe("Agent Workbench adapter", () => {
  it("extracts Codex and Claude resume aliases without treating runtime payload as identity", () => {
    expect(
      Option.getOrNull(
        projectHarnessAlias({ provider: "codex", resumeCursor: { threadId: "codex-1" } }),
      ),
    ).toEqual({ provider: "codex", sessionId: "codex-1" });
    expect(
      Option.getOrNull(
        projectHarnessAlias({ provider: "claudeAgent", resumeCursor: { resume: "claude-1" } }),
      ),
    ).toEqual({ provider: "claude", sessionId: "claude-1" });
    expect(
      Option.isNone(projectHarnessAlias({ provider: "codex", resumeCursor: { cwd: "/tmp" } })),
    ).toBe(true);
  });

  it.effect(
    "uses stable T3 thread identity and projects rotating provider aliases on mutation",
    () =>
      Effect.gen(function* () {
        const requests: Array<{ pathname: string; options: any }> = [];
        const association = {
          protocolVersion: "1.0.0" as const,
          revision: 1,
          conversation: {
            host: "t3",
            environmentId: "environment-1",
            conversationId: "thread-1",
            project: "demo",
          },
          primary: null,
          references: [],
          history: [],
          aliases: [],
        };
        const service = makeAgentWorkbench(
          {
            leaseId: async () => "lease-1",
            request: async (pathname, options) => {
              requests.push({ pathname, options });
              return association;
            },
          },
          {
            getEnvironmentId: Effect.succeed("environment-1"),
            getProviders: Effect.succeed([]),
            getHarnessAliases: () =>
              Effect.succeed([{ provider: "codex", sessionId: "provider-thread-2" }]),
          },
        );

        yield* service.mutatePlanAssociation({
          threadId: "thread-1",
          project: "demo",
          op: "use",
          planPath: "demo/phase.md",
        });

        expect(requests[0]).toMatchObject({
          pathname: "/v1/plan-associations/commands",
          options: {
            method: "POST",
            admin: true,
            body: {
              op: "use",
              conversation: {
                host: "t3",
                environmentId: "environment-1",
                conversationId: "thread-1",
                project: "demo",
              },
              aliases: [{ provider: "codex", sessionId: "provider-thread-2" }],
            },
          },
        });
      }),
  );

  it.effect("queries each explicit thread independently and suggestions remain read-scoped", () =>
    Effect.gen(function* () {
      const requests: Array<{ pathname: string; options: any }> = [];
      const connection: AgentWorkbenchConnectionShape = {
        leaseId: async () => "lease-1",
        request: async (pathname, options) => {
          requests.push({ pathname, options });
          if (pathname === "/v1/plan-suggestions") {
            return { protocolVersion: "1.0.0", query: "phase", suggestions: [] };
          }
          const url = new URL(pathname, "http://workbench.test");
          return {
            protocolVersion: "1.0.0",
            revision: 0,
            conversation: {
              host: "t3",
              environmentId: url.searchParams.get("environmentId"),
              conversationId: url.searchParams.get("conversationId"),
            },
            primary: null,
            references: [],
            history: [],
            aliases: [],
          };
        },
      };
      const service = makeAgentWorkbench(connection, {
        getEnvironmentId: Effect.succeed("environment-1"),
        getProviders: Effect.succeed([]),
      });

      yield* service.planAssociations({ threadId: "thread-1" });
      yield* service.planAssociations({ threadId: "thread-2" });
      yield* service.suggestPlans({ threadId: "thread-2", project: "demo", message: "phase plan" });

      expect(requests[0]?.pathname).toContain("conversationId=thread-1");
      expect(requests[1]?.pathname).toContain("conversationId=thread-2");
      expect(requests[2]).toMatchObject({
        pathname: "/v1/plan-suggestions",
        options: { method: "POST", body: { query: "phase plan", limit: 3 } },
      });
      expect(requests[2]?.options.admin).toBeUndefined();
    }),
  );

  it.effect("publishes environment provider skills before reading the lease catalog", () =>
    Effect.gen(function* () {
      const requests: Array<{ pathname: string; options: unknown }> = [];
      const connection: AgentWorkbenchConnectionShape = {
        leaseId: async () => "lease-1",
        request: async (pathname, options) => {
          requests.push({ pathname, options });
          return pathname.startsWith("/v1/catalog") ? catalog : {};
        },
      };
      const providers = [
        {
          driver: "codex",
          skills: [
            {
              name: "Refactoring",
              description: "Validate boundaries",
              path: "/skills/refactoring/SKILL.md",
              scope: "user",
            },
          ],
        },
      ] as unknown as ReadonlyArray<ServerProvider>;
      const service = makeAgentWorkbench(connection, {
        getEnvironmentId: Effect.succeed("environment-1"),
        getProviders: Effect.succeed(providers),
      });

      yield* service.catalog;

      expect(requests[0]).toMatchObject({
        pathname: "/v1/context",
        options: {
          method: "PUT",
          admin: true,
          body: {
            protocolVersion: "1.0.0",
            leaseId: "lease-1",
            environmentId: "environment-1",
            skills: [{ name: "Refactoring", providers: ["codex"] }],
          },
        },
      });
      expect(requests[1]?.pathname).toBe("/v1/catalog?leaseId=lease-1");
    }),
  );

  it.effect("publishes transcript-derived project attribution before reading vitals", () =>
    Effect.gen(function* () {
      const requests: Array<{ pathname: string; options: any }> = [];
      const service = makeAgentWorkbench(
        {
          leaseId: async () => "lease-usage",
          request: async (pathname, options) => {
            requests.push({ pathname, options });
            return pathname === "/v1/vitals"
              ? {
                  protocolVersion: "1.0.0",
                  capturedAt: "2026-09-10T12:00:00.000Z",
                  state: "available",
                  windows: [],
                }
              : {};
          },
        },
        {
          getEnvironmentId: Effect.succeed("environment-1"),
          getProviders: Effect.succeed([]),
          getUsageAttribution: Effect.succeed({
            environmentId: "environment-1",
            label: "environment-1",
            capturedAt: "2026-09-10T12:00:00.000Z",
            usageContractVersion: 6,
            source: "host-transcript-usage" as const,
            state: "available" as const,
            totals: { costUsd: 2, totalTokens: 200, records: 2 },
            projects: [
              {
                environmentId: "environment-1",
                projectId: "project-1",
                costUsd: 1,
                totalTokens: 100,
                records: 1,
              },
            ],
            unattributed: [
              {
                environmentId: "environment-1",
                status: "missingEvidence",
                costUsd: 1,
                totalTokens: 100,
                records: 1,
              },
            ],
          }),
        },
      );

      yield* service.vitals;

      expect(requests.map((request) => request.pathname)).toEqual([
        "/v1/usage-attribution",
        "/v1/vitals",
      ]);
      expect(requests[0]?.options.body).toMatchObject({
        protocolVersion: "1.0.0",
        leaseId: "lease-usage",
        usage: { environmentId: "environment-1", totals: { totalTokens: 200 } },
      });
    }),
  );

  it.effect("binds canonical mutations to the authenticated T3 session and current lease", () =>
    Effect.gen(function* () {
      const requests: Array<{ pathname: string; options: any }> = [];
      const authority = {
        state: "unlocked" as const,
        reason: null,
        expiresAt: "2026-09-07T12:10:00.000Z",
        capabilities: { review: true, apply: true, rollback: true },
      };
      const service = makeAgentWorkbench(
        {
          leaseId: async () => "lease-current",
          request: async (pathname, options) => {
            requests.push({ pathname, options });
            return authority;
          },
        },
        { getEnvironmentId: Effect.succeed("environment-1"), getProviders: Effect.succeed([]) },
      );

      yield* service.unlockResources("t3-session", true);
      yield* service.resourceAuthority("t3-session");

      expect(requests[0]).toMatchObject({
        pathname: "/v1/resource-mutations/authority/unlock",
        options: {
          method: "POST",
          admin: true,
          body: {
            sessionId: "t3-session",
            leaseId: "lease-current",
            directLocal: true,
            administrative: true,
          },
        },
      });
      expect(requests[1]?.pathname).toContain("sessionId=t3-session");
      expect(requests[1]?.pathname).toContain("leaseId=lease-current");
    }),
  );

  it.effect("maps connection failures without making Workbench a provider dependency", () =>
    Effect.gen(function* () {
      const service = makeAgentWorkbench(
        {
          leaseId: async () => "lease-1",
          request: async () => {
            throw new AgentWorkbenchConnectionError("request_failed");
          },
        },
        {
          getEnvironmentId: Effect.succeed("environment-1"),
          getProviders: Effect.succeed([]),
        },
      );

      const failure = yield* Effect.flip(service.listPlans);
      expect(failure).toMatchObject({
        _tag: "AgentWorkbenchAdapterError",
        reason: "request_failed",
      });
    }),
  );

  it.effect("rejects malformed service payloads as invalid responses", () =>
    Effect.gen(function* () {
      const service = makeAgentWorkbench(
        {
          leaseId: async () => "lease-1",
          request: async () => ({ protocolVersion: "0.0.0", plans: [] }),
        },
        {
          getEnvironmentId: Effect.succeed("environment-1"),
          getProviders: Effect.succeed([]),
        },
      );

      const failure = yield* Effect.flip(service.listPlans);
      expect(failure).toMatchObject({
        reason: "invalid_response",
      });
    }),
  );
});
