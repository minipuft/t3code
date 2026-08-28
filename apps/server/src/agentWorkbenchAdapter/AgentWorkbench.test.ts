import type { AgentWorkbenchCatalog, ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { makeAgentWorkbench, type AgentWorkbenchConnectionShape } from "./AgentWorkbench.ts";
import { AgentWorkbenchConnectionError } from "./AgentWorkbenchConnection.ts";

const catalog: AgentWorkbenchCatalog = {
  protocolVersion: "1.0.0",
  revision: "sha256:catalog",
  state: "available",
  entries: [],
};

describe("Agent Workbench adapter", () => {
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
