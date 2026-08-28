// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off - process lifecycle is the Node adapter boundary owned by this module.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROTOCOL_VERSION = "1.0.0";
const ATTACH_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 6_000;
const HEARTBEAT_MS = 10_000;

export class AgentWorkbenchConnectionError extends Error {
  readonly reason:
    | "not_installed"
    | "configuration_invalid"
    | "start_failed"
    | "request_failed"
    | "unsupported_version"
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "invalid_response";

  constructor(
    reason:
      | "not_installed"
      | "configuration_invalid"
      | "start_failed"
      | "request_failed"
      | "unsupported_version"
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "invalid_response",
    options?: ErrorOptions,
  ) {
    super(reason, options);
    this.reason = reason;
    this.name = "AgentWorkbenchConnectionError";
  }
}

interface WorkbenchConfig {
  readonly promptSourceId: string;
  readonly readToken: string;
  readonly adminToken: string;
}

interface RuntimeDescriptor {
  readonly endpoint: string;
  readonly promptSourceId: string;
}

interface AttachedRuntime extends RuntimeDescriptor, WorkbenchConfig {
  readonly leaseId: string;
}

export interface AgentWorkbenchConnectionDependencies {
  readonly homeDir: string;
  readonly readFile: (target: string) => Promise<string>;
  readonly removeFile: (target: string) => Promise<void>;
  readonly startRuntime: (launcher: string) => Promise<void>;
  readonly fetch: typeof fetch;
  readonly setInterval: typeof globalThis.setInterval;
  readonly clearInterval: typeof globalThis.clearInterval;
}

export class AgentWorkbenchConnection {
  private attached: Promise<AttachedRuntime> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  private readonly dependencies: AgentWorkbenchConnectionDependencies;

  constructor(dependencies: AgentWorkbenchConnectionDependencies) {
    this.dependencies = dependencies;
  }

  async request(
    pathname: string,
    options: {
      readonly method?: string;
      readonly admin?: boolean;
      readonly body?: unknown;
      readonly requestId?: string;
    } = {},
  ) {
    const runtime = await this.attach();
    try {
      return await requestJson(this.dependencies.fetch, runtime, pathname, options);
    } catch (cause) {
      if (
        cause instanceof AgentWorkbenchConnectionError &&
        cause.reason !== "conflict" &&
        cause.reason !== "not_found"
      ) {
        this.reset();
      }
      throw cause;
    }
  }

  async leaseId() {
    return (await this.attach()).leaseId;
  }

  async close() {
    const runtime = await this.attached?.catch(() => null);
    this.reset();
    if (runtime === null || runtime === undefined) return;
    await requestJson(
      this.dependencies.fetch,
      runtime,
      `/v1/leases/${encodeURIComponent(runtime.leaseId)}`,
      { method: "DELETE", admin: true },
    ).catch(() => undefined);
  }

  private async attach() {
    if (this.attached === null) {
      this.attached = this.attachFresh().catch((cause) => {
        this.reset();
        throw cause;
      });
    }
    return this.attached;
  }

  private async attachFresh() {
    const config = await readConfig(this.dependencies);
    let descriptor = await readDescriptor(this.dependencies).catch(() => null);
    if (descriptor !== null) {
      let compatible: boolean | null = null;
      try {
        compatible = await handshake(this.dependencies.fetch, descriptor, config);
      } catch (cause) {
        if (
          !(cause instanceof AgentWorkbenchConnectionError) ||
          cause.reason !== "request_failed"
        ) {
          throw cause;
        }
        await this.dependencies
          .removeFile(runtimePath(this.dependencies.homeDir))
          .catch(() => undefined);
        descriptor = null;
      }
      if (compatible === false) throw new AgentWorkbenchConnectionError("unsupported_version");
    }
    if (descriptor === null) {
      const launcher = path.join(this.dependencies.homeDir, ".local", "bin", "agent-workbench");
      await this.dependencies.startRuntime(launcher);
      descriptor = await waitForDescriptor(this.dependencies);
      if (!(await handshake(this.dependencies.fetch, descriptor, config))) {
        throw new AgentWorkbenchConnectionError("unsupported_version");
      }
    }
    if (descriptor.promptSourceId !== config.promptSourceId) {
      throw new AgentWorkbenchConnectionError("configuration_invalid");
    }
    const lease = await requestJson(
      this.dependencies.fetch,
      { ...descriptor, ...config, leaseId: "" },
      "/v1/leases",
      { method: "POST", body: { adapter: "t3code" } },
    );
    if (!isRecord(lease) || typeof lease["leaseId"] !== "string") {
      throw new AgentWorkbenchConnectionError("invalid_response");
    }
    const runtime = { ...descriptor, ...config, leaseId: lease["leaseId"] };
    this.startHeartbeat(runtime);
    return runtime;
  }

  private startHeartbeat(runtime: AttachedRuntime) {
    this.heartbeat = this.dependencies.setInterval(() => {
      void requestJson(
        this.dependencies.fetch,
        runtime,
        `/v1/leases/${encodeURIComponent(runtime.leaseId)}`,
        { method: "PATCH", admin: true },
      ).catch(() => this.reset());
    }, HEARTBEAT_MS);
  }

  private reset() {
    this.attached = null;
    if (this.heartbeat !== null) this.dependencies.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export function makeAgentWorkbenchConnectionDependencies(): AgentWorkbenchConnectionDependencies {
  return {
    homeDir: os.homedir(),
    readFile: (target) => fs.readFile(target, "utf8"),
    removeFile: (target) => fs.rm(target, { force: true }),
    startRuntime: startRuntimeProcess,
    fetch,
    setInterval,
    clearInterval,
  };
}

async function startRuntimeProcess(launcher: string) {
  await fs.access(launcher).catch((cause) => {
    throw new AgentWorkbenchConnectionError("not_installed", { cause });
  });
  const child = spawn(launcher, ["serve"], { stdio: ["ignore", "pipe", "pipe"], detached: false });
  await waitForListening(child);
}

function waitForListening(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new AgentWorkbenchConnectionError("start_failed")),
      ATTACH_TIMEOUT_MS,
    );
    let output = "";
    const finish = (cause?: Error) => {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
      if (cause) reject(cause);
      else resolve();
    };
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes("Agent Workbench listening on ")) finish();
    };
    const onError = (cause: Error) =>
      finish(new AgentWorkbenchConnectionError("start_failed", { cause }));
    const onExit = () => finish(new AgentWorkbenchConnectionError("start_failed"));
    child.stdout?.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function handshake(
  fetchImpl: typeof fetch,
  descriptor: RuntimeDescriptor,
  config: WorkbenchConfig,
) {
  const value = await requestJson(
    fetchImpl,
    { ...descriptor, ...config, leaseId: "" },
    "/v1/handshake",
    {
      method: "POST",
      body: {
        protocolVersion: PROTOCOL_VERSION,
        adapter: "t3code",
        clientVersion: "custom",
        promptSourceId: config.promptSourceId,
      },
    },
  );
  if (!isRecord(value) || typeof value["compatible"] !== "boolean") {
    throw new AgentWorkbenchConnectionError("invalid_response");
  }
  return value["compatible"];
}

async function requestJson(
  fetchImpl: typeof fetch,
  runtime: AttachedRuntime,
  pathname: string,
  options: {
    readonly method?: string;
    readonly admin?: boolean;
    readonly body?: unknown;
    readonly requestId?: string;
  },
) {
  let response: Response;
  try {
    response = await fetchImpl(new URL(pathname, runtime.endpoint), {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${options.admin ? runtime.adminToken : runtime.readToken}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.requestId === undefined ? {} : { "x-request-id": options.requestId }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new AgentWorkbenchConnectionError("request_failed", { cause });
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload;
  if (response.status === 401) throw new AgentWorkbenchConnectionError("unauthorized");
  if (response.status === 403) throw new AgentWorkbenchConnectionError("forbidden");
  if (response.status === 404) throw new AgentWorkbenchConnectionError("not_found");
  if (response.status === 409) throw new AgentWorkbenchConnectionError("conflict");
  throw new AgentWorkbenchConnectionError("request_failed");
}

async function readConfig(
  dependencies: AgentWorkbenchConnectionDependencies,
): Promise<WorkbenchConfig> {
  const root = path.join(dependencies.homeDir, ".config", "agent-workbench");
  const [workspaceText, secretsText] = await Promise.all([
    dependencies.readFile(path.join(root, "workspace.yaml")),
    dependencies.readFile(path.join(root, "secrets.yaml")),
  ]).catch((cause) => {
    throw new AgentWorkbenchConnectionError("configuration_invalid", { cause });
  });
  const workspace = decodeConfig(workspaceText);
  const secrets = decodeConfig(secretsText);
  const promptSourceId = workspace["prompt_source_id"];
  const readToken = secrets["service_read_token"];
  const adminToken = secrets["service_admin_token"];
  if (
    typeof promptSourceId !== "string" ||
    typeof readToken !== "string" ||
    typeof adminToken !== "string" ||
    readToken === adminToken
  ) {
    throw new AgentWorkbenchConnectionError("configuration_invalid");
  }
  return { promptSourceId, readToken, adminToken };
}

async function readDescriptor(
  dependencies: AgentWorkbenchConnectionDependencies,
): Promise<RuntimeDescriptor> {
  const value: unknown = JSON.parse(await dependencies.readFile(runtimePath(dependencies.homeDir)));
  if (
    !isRecord(value) ||
    typeof value["endpoint"] !== "string" ||
    typeof value["promptSourceId"] !== "string"
  ) {
    throw new AgentWorkbenchConnectionError("invalid_response");
  }
  return { endpoint: value["endpoint"], promptSourceId: value["promptSourceId"] };
}

async function waitForDescriptor(dependencies: AgentWorkbenchConnectionDependencies) {
  const deadline = Date.now() + ATTACH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const descriptor = await readDescriptor(dependencies).catch(() => null);
    if (descriptor !== null) return descriptor;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new AgentWorkbenchConnectionError("start_failed");
}

function runtimePath(homeDir: string) {
  return path.join(homeDir, ".local", "state", "agent-workbench", "runtime.json");
}

function decodeConfig(text: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([a-z][a-z0-9_]*):\s*(.+)$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined || /[&*!]|<<\s*:/.test(line)) {
      throw new AgentWorkbenchConnectionError("configuration_invalid");
    }
    try {
      output[match[1]] = JSON.parse(match[2]);
    } catch (cause) {
      throw new AgentWorkbenchConnectionError("configuration_invalid", { cause });
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
