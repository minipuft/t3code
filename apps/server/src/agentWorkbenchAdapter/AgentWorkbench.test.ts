import type { AgentWorkbenchCatalog, ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

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

  it("uses stable T3 thread identity and projects rotating provider aliases on mutation", async () => {
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

    await Effect.runPromise(
      service.mutatePlanAssociation({
        threadId: "thread-1",
        project: "demo",
        op: "use",
        planPath: "demo/phase.md",
      }),
    );

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
  });

  it("queries each explicit thread independently and suggestions remain read-scoped", async () => {
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

    await Effect.runPromise(service.planAssociations({ threadId: "thread-1" }));
    await Effect.runPromise(service.planAssociations({ threadId: "thread-2" }));
    await Effect.runPromise(
      service.suggestPlans({ threadId: "thread-2", project: "demo", message: "phase plan" }),
    );

    expect(requests[0]?.pathname).toContain("conversationId=thread-1");
    expect(requests[1]?.pathname).toContain("conversationId=thread-2");
    expect(requests[2]).toMatchObject({
      pathname: "/v1/plan-suggestions",
      options: { method: "POST", body: { query: "phase plan", limit: 3 } },
    });
    expect(requests[2]?.options.admin).toBeUndefined();
  });

  it("publishes environment provider skills before reading the lease catalog", async () => {
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

    await Effect.runPromise(service.catalog);

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
  });

  it("maps connection failures without making Workbench a provider dependency", async () => {
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

    await expect(Effect.runPromise(service.listPlans)).rejects.toMatchObject({
      _tag: "AgentWorkbenchAdapterError",
      reason: "request_failed",
    });
  });

  it("rejects malformed service payloads as invalid responses", async () => {
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

    await expect(Effect.runPromise(service.listPlans)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
