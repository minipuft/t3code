// @effect-diagnostics nodeBuiltinImport:off - lifecycle adapter tests exercise its Node filesystem boundary.
import path from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  AgentWorkbenchConnection,
  AgentWorkbenchConnectionError,
  type AgentWorkbenchConnectionDependencies,
} from "./AgentWorkbenchConnection.ts";

const homeDir = "/home/test";
const runtimeFile = path.join(homeDir, ".local/state/agent-workbench/runtime.json");
const workspaceFile = path.join(homeDir, ".config/agent-workbench/workspace.yaml");
const secretsFile = path.join(homeDir, ".config/agent-workbench/secrets.yaml");

function makeFixture() {
  const files = new Map<string, string>([
    [workspaceFile, 'prompt_source_id: "claude-prompts"\n'],
    [secretsFile, 'service_read_token: "read-token"\nservice_admin_token: "admin-token"\n'],
    [
      runtimeFile,
      JSON.stringify({ endpoint: "http://127.0.0.1:41000", promptSourceId: "claude-prompts" }),
    ],
  ]);
  const requests: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const responses: Array<Response | Error> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), init });
    const queued = responses.shift();
    if (queued instanceof Error) throw queued;
    if (queued !== undefined) return queued;
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/v1/handshake") return Response.json({ compatible: true });
    if (pathname === "/v1/leases") return Response.json({ leaseId: "lease-1" }, { status: 201 });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  const startRuntime = vi.fn(async () => {
    files.set(
      runtimeFile,
      JSON.stringify({ endpoint: "http://127.0.0.1:42000", promptSourceId: "claude-prompts" }),
    );
  });
  const dependencies: AgentWorkbenchConnectionDependencies = {
    homeDir,
    readFile: async (target) => {
      const value = files.get(target);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    removeFile: async (target) => {
      files.delete(target);
    },
    startRuntime,
    fetch: fetchImpl,
    setInterval: vi.fn(() => 1) as unknown as typeof setInterval,
    clearInterval: vi.fn() as unknown as typeof clearInterval,
  };
  return { dependencies, files, requests, responses, startRuntime };
}

describe("Agent Workbench connection lifecycle", () => {
  it("reuses a compatible runtime, acquires a lease, and releases it on close", async () => {
    const fixture = makeFixture();
    const connection = new AgentWorkbenchConnection(fixture.dependencies);

    expect(await connection.leaseId()).toBe("lease-1");
    await connection.close();

    expect(fixture.startRuntime).not.toHaveBeenCalled();
    expect(fixture.requests.map(({ url }) => url.pathname)).toEqual([
      "/v1/handshake",
      "/v1/leases",
      "/v1/leases/lease-1",
    ]);
    expect(fixture.requests[2]?.init?.method).toBe("DELETE");
  });

  it("spawns the configured launcher when no descriptor exists", async () => {
    const fixture = makeFixture();
    fixture.files.delete(runtimeFile);
    const connection = new AgentWorkbenchConnection(fixture.dependencies);

    await connection.leaseId();

    expect(fixture.startRuntime).toHaveBeenCalledWith(
      path.join(homeDir, ".local/bin/agent-workbench"),
    );
    expect(fixture.requests[0]?.url.origin).toBe("http://127.0.0.1:42000");
  });

  it("reports an explicit version mismatch", async () => {
    const fixture = makeFixture();
    fixture.responses.push(Response.json({ compatible: false }));
    const connection = new AgentWorkbenchConnection(fixture.dependencies);

    await expect(connection.leaseId()).rejects.toMatchObject({ reason: "unsupported_version" });
  });

  it("reattaches after a sidecar request failure", async () => {
    const fixture = makeFixture();
    const connection = new AgentWorkbenchConnection(fixture.dependencies);
    await connection.leaseId();
    fixture.responses.push(new Error("sidecar exited"));

    await expect(connection.request("/v1/plans")).rejects.toBeInstanceOf(
      AgentWorkbenchConnectionError,
    );
    await connection.request("/v1/plans");

    expect(fixture.requests.filter(({ url }) => url.pathname === "/v1/handshake")).toHaveLength(2);
    expect(fixture.requests.filter(({ url }) => url.pathname === "/v1/leases")).toHaveLength(2);
  });
});
