import type { TailscaleStatus } from "@t3tools/tailscale";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as DesktopNetworkInterfaces from "./DesktopNetworkInterfaces.ts";
import * as DesktopServerExposure from "./DesktopServerExposure.ts";
import * as DesktopTailscaleServe from "./DesktopTailscaleServe.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";

const encoder = new TextEncoder();

const emptyNetworkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces = {};
const lanNetworkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces = {
  en0: [
    {
      address: "192.168.1.20",
      family: "IPv4",
      internal: false,
    },
  ],
};

const tailnetNetworkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces = {
  tailscale0: [
    {
      address: "100.90.1.2",
      family: "IPv4",
      internal: false,
    },
  ],
};

function layerMockSpawner(statusJson: string | (() => string) = "{}", onSpawn?: () => void) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.sync(() => {
        onSpawn?.();
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          unref: Effect.succeed(Effect.void),
          stdin: Sink.drain,
          stdout: Stream.make(
            encoder.encode(typeof statusJson === "string" ? statusJson : statusJson()),
          ),
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        });
      }),
    ),
  );
}

function layerDieOnSpawn() {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("unexpected tailscale spawn")),
  );
}

// No primary registered yet -- getAdvertisedEndpoints treats this like a
// native primary (today's behaviour) and getState reports nothing to show.
function nativeTailscaleServeLayer(
  status?: Omit<TailscaleStatus, "httpsServeEnabled">,
): Layer.Layer<DesktopTailscaleServe.DesktopTailscaleServe> {
  return Layer.succeed(DesktopTailscaleServe.DesktopTailscaleServe, {
    primaryReady: () => Effect.void,
    primaryStopped: Effect.void,
    reconcile: Effect.void,
    results: Effect.succeed([]),
    primaryTarget: Effect.succeedNone,
    readStatus: () =>
      Effect.succeed(
        status === undefined
          ? Option.none()
          : Option.some({ ...status, httpsServeEnabled: null } satisfies TailscaleStatus),
      ),
  } satisfies DesktopTailscaleServe.DesktopTailscaleServe["Service"]);
}

// A WSL primary, with a stubbed per-daemon status/results table the test
// supplies directly instead of driving the real apply/retry machinery.
function wslTailscaleServeLayer(input: {
  readonly results?: ReadonlyArray<DesktopTailscaleServe.TailscaleServeDaemonResult>;
  readonly statuses?: Partial<
    Record<DesktopTailscaleServe.TailscaleServeDaemon, Omit<TailscaleStatus, "httpsServeEnabled">>
  >;
}): Layer.Layer<DesktopTailscaleServe.DesktopTailscaleServe> {
  const results = input.results ?? [];
  const statuses = input.statuses ?? {};
  return Layer.succeed(DesktopTailscaleServe.DesktopTailscaleServe, {
    primaryReady: () => Effect.void,
    primaryStopped: Effect.void,
    reconcile: Effect.void,
    results: Effect.succeed(results),
    primaryTarget: Effect.succeedSome({ port: 13773, distro: "Ubuntu" }),
    readStatus: (daemon) => {
      const status = statuses[daemon];
      return Effect.succeed(
        status === undefined
          ? Option.none()
          : Option.some({ ...status, httpsServeEnabled: null } satisfies TailscaleStatus),
      );
    },
  } satisfies DesktopTailscaleServe.DesktopTailscaleServe["Service"]);
}

function layerEnvironmentFor(baseDir: string, env: Record<string, string | undefined> = {}) {
  return DesktopEnvironment.layer({
    dirname: "/repo/apps/desktop/src",
    homeDirectory: baseDir,
    platform: "darwin",
    processArch: "x64",
    appVersion: "1.2.3",
    appPath: "/repo",
    isPackaged: true,
    resourcesPath: "/missing/resources",
    runningUnderArm64Translation: false,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        NodeServices.layer,
        NodeCrypto.layer,
        DesktopConfig.layerTest({ T3CODE_HOME: baseDir, ...env }),
      ),
    ),
  );
}

function layer(input: {
  readonly baseDir: string;
  readonly networkInterfaces?: DesktopNetworkInterfaces.NetworkInterfaces;
  readonly env?: Record<string, string | undefined>;
  readonly spawnerLayer?: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>;
  readonly desktopSettingsLayer?: Layer.Layer<DesktopAppSettings.DesktopAppSettings>;
  readonly tailscaleServeLayer?: Layer.Layer<DesktopTailscaleServe.DesktopTailscaleServe>;
  readonly managedPolicyLayer?: Layer.Layer<DesktopManagedPolicy.DesktopManagedPolicy>;
}) {
  const env = { T3CODE_HOME: input.baseDir, ...input.env };
  const layerEnvironment = layerEnvironmentFor(input.baseDir, env);
  const layerNetwork = Layer.succeed(DesktopNetworkInterfaces.DesktopNetworkInterfaces, {
    read: Effect.succeed(input.networkInterfaces ?? emptyNetworkInterfaces),
  });

  return DesktopServerExposure.layer.pipe(
    Layer.provideMerge(input.tailscaleServeLayer ?? nativeTailscaleServeLayer()),
    Layer.provideMerge(input.desktopSettingsLayer ?? DesktopAppSettings.layer),
    Layer.provideMerge(input.managedPolicyLayer ?? DesktopManagedPolicy.layerTest()),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(NodeHttpClient.layerUndici),
    Layer.provideMerge(input.spawnerLayer ?? layerMockSpawner()),
    Layer.provideMerge(layerNetwork),
    Layer.provideMerge(DesktopConfig.layerTest(env)),
    Layer.provideMerge(layerEnvironment),
  );
}

const withHarness = <A, E, R>(
  networkInterfaces: DesktopNetworkInterfaces.NetworkInterfaces,
  effect: Effect.Effect<
    A,
    E,
    | R
    | DesktopEnvironment.DesktopEnvironment
    | FileSystem.FileSystem
    | DesktopServerExposure.DesktopServerExposure
    | DesktopAppSettings.DesktopAppSettings
  >,
  env: Record<string, string | undefined> = {},
  spawnerLayer?: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>,
  desktopSettingsLayer?: Layer.Layer<DesktopAppSettings.DesktopAppSettings>,
  tailscaleServeLayer?: Layer.Layer<DesktopTailscaleServe.DesktopTailscaleServe>,
  managedPolicyLayer?: Layer.Layer<DesktopManagedPolicy.DesktopManagedPolicy>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const baseDir = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3-desktop-server-exposure-test-",
    });
    return yield* effect.pipe(
      Effect.provide(
        layer({
          baseDir,
          networkInterfaces,
          env,
          ...(spawnerLayer ? { spawnerLayer } : {}),
          ...(desktopSettingsLayer ? { desktopSettingsLayer } : {}),
          ...(tailscaleServeLayer ? { tailscaleServeLayer } : {}),
          ...(managedPolicyLayer ? { managedPolicyLayer } : {}),
        }),
      ),
    );
  }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)), Effect.scoped);

describe("DesktopServerExposure", () => {
  it.effect("uses cached Tailscale identity to exclude another VPN's pairing address", () => {
    let statusReads = 0;
    const spawnerLayer = layerMockSpawner(`{"Self":{"TailscaleIPs":["100.74.126.34"]}}`, () => {
      statusReads += 1;
    });
    return withHarness(
      {
        ...lanNetworkInterfaces,
        pvpnksintrf1: [{ address: "100.85.0.1", family: "IPv4", internal: false }],
        vpn0: [{ address: "100.74.126.34", family: "IPv4", internal: false }],
      },
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        yield* serverExposure.setMode("network-accessible");

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints.map((endpoint) => endpoint.httpBaseUrl),
          ["http://127.0.0.1:4173/", "http://192.168.1.20:4173/", "http://100.74.126.34:4173/"],
        );
        assert.deepEqual(yield* serverExposure.getAdvertisedEndpoints, endpoints);
        assert.equal(statusReads, 1);
      }),
      {},
      spawnerLayer,
      undefined,
      DesktopTailscaleServe.layer.pipe(
        Layer.provide(DesktopAppSettings.layerTest()),
        Layer.provide(DesktopManagedPolicy.layerTest()),
        Layer.provide(spawnerLayer),
      ),
    );
  });

  it.effect("falls back to local-only without losing the requested network preference", () =>
    withHarness(
      emptyNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;

        yield* settings.setServerExposureMode("network-accessible");

        const state = yield* serverExposure.configureFromSettings({ port: 4173 });
        assert.equal(state.mode, "local-only");
        assert.equal(state.endpointUrl, null);
        assert.equal((yield* settings.get).serverExposureMode, "network-accessible");

        const backendConfig = yield* serverExposure.backendConfig;
        assert.equal(backendConfig.bindHost, "127.0.0.1");
        assert.equal(backendConfig.httpBaseUrl.href, "http://127.0.0.1:4173/");
      }),
    ),
  );

  it.effect("starts local-only, Serve off, when a managed policy keeps clients local", () =>
    withHarness(
      lanNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;
        yield* settings.setServerExposureMode("network-accessible");
        yield* settings.setTailscaleServe({
          enabled: true,
          port: Option.none(),
          device: Option.none(),
        });

        const state = yield* serverExposure.configureFromSettings({ port: 4173 });
        assert.equal(state.mode, "local-only");
        assert.isFalse(state.tailscaleServeEnabled);
        const backendConfig = yield* serverExposure.backendConfig;
        assert.equal(backendConfig.bindHost, "127.0.0.1");
        // Choosing them again while the policy applies does not widen the backend either.
        yield* serverExposure.setMode("network-accessible");
        const served = yield* serverExposure.setTailscaleServeEnabled({ enabled: true });
        assert.equal((yield* serverExposure.backendConfig).bindHost, "127.0.0.1");
        assert.isFalse(served.tailscaleServeEnabled);
        assert.isFalse((yield* serverExposure.getState).tailscaleServeEnabled);
        // The saved choice returns once the policy allows it.
        const saved = yield* settings.get;
        assert.equal(saved.serverExposureMode, "network-accessible");
        assert.isTrue(saved.tailscaleServeEnabled);
      }),
      {},
      undefined,
      undefined,
      undefined,
      DesktopManagedPolicy.layerTest({
        schemaVersion: 1,
        organization: "Example Corp",
        limits: { clients: ["desktop"] },
      }),
    ),
  );

  it.effect("persists network-accessible mode and updates backend binding state", () =>
    withHarness(
      lanNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;

        yield* settings.load;
        yield* serverExposure.configureFromSettings({ port: 4173 });

        const change = yield* serverExposure.setMode("network-accessible");
        assert.equal(change.requiresRelaunch, true);
        assert.deepEqual(change.state, {
          mode: "network-accessible",
          endpointUrl: "http://192.168.1.20:4173",
          advertisedHost: "192.168.1.20",
          tailscaleServeEnabled: false,
          tailscaleServePort: 443,
          tailscaleServeDevice: "auto",
          tailscaleServeStatuses: [],
          tailscaleServeDeviceSelectable: false,
        });

        const backendConfig = yield* serverExposure.backendConfig;
        assert.equal(backendConfig.bindHost, "0.0.0.0");
        assert.equal(backendConfig.httpBaseUrl.href, "http://127.0.0.1:4173/");

        const persisted = yield* settings.get;
        assert.equal(persisted.serverExposureMode, "network-accessible");
      }),
    ),
  );

  it.effect("advertises the Wi-Fi or Ethernet address ahead of bridges and tunnels", () =>
    withHarness(
      {
        bridge0: [{ address: "192.168.2.1", family: "IPv4", internal: false }],
        utun4: [{ address: "10.8.0.2", family: "IPv4", internal: false }],
        en0: [{ address: "192.168.1.20", family: "IPv4", internal: false }],
      },
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });

        const change = yield* serverExposure.setMode("network-accessible");
        assert.equal(change.state.advertisedHost, "192.168.1.20");
      }),
    ),
  );

  it.effect("advertises the current LAN address after the network changes", () => {
    const networkInterfaces: Record<
      string,
      readonly DesktopNetworkInterfaces.DesktopNetworkInterfaceInfo[] | undefined
    > = { ...lanNetworkInterfaces };

    return withHarness(
      networkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        yield* serverExposure.setMode("network-accessible");

        networkInterfaces.en0 = [{ address: "10.0.0.5", family: "IPv4", internal: false }];

        const state = yield* serverExposure.getState;
        assert.equal(state.advertisedHost, "10.0.0.5");
        assert.equal(state.endpointUrl, "http://10.0.0.5:4173");
        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints.map((endpoint) => endpoint.httpBaseUrl),
          ["http://127.0.0.1:4173/", "http://10.0.0.5:4173/"],
        );
        assert.equal((yield* serverExposure.backendConfig).bindHost, "0.0.0.0");
      }),
    );
  });

  it.effect("persists tailscale serve preferences atomically", () =>
    withHarness(
      emptyNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;

        yield* settings.load;
        yield* serverExposure.configureFromSettings({ port: 4173 });

        const state = yield* serverExposure.setTailscaleServeEnabled({
          enabled: true,
          port: 8443,
        });
        assert.equal(state.tailscaleServeEnabled, true);
        assert.equal(state.tailscaleServePort, 8443);
        assert.deepEqual(yield* serverExposure.getState, state);

        const persisted = yield* settings.get;
        assert.equal(persisted.tailscaleServeEnabled, true);
        assert.equal(persisted.tailscaleServePort, 8443);
      }),
    ),
  );

  it.effect("keeps a Tailscale Serve change made while a mode change is saving", () =>
    Effect.gen(function* () {
      const modeWriteStarted = yield* Deferred.make<void>();
      const releaseModeWrite = yield* Deferred.make<void>();
      const settingsLayer = Layer.effect(
        DesktopAppSettings.DesktopAppSettings,
        Effect.gen(function* () {
          const settings = yield* DesktopAppSettings.DesktopAppSettings;
          return DesktopAppSettings.DesktopAppSettings.of({
            ...settings,
            setServerExposureMode: (mode) =>
              Deferred.succeed(modeWriteStarted, undefined).pipe(
                Effect.andThen(Deferred.await(releaseModeWrite)),
                Effect.andThen(settings.setServerExposureMode(mode)),
              ),
          });
        }),
      ).pipe(Layer.provide(DesktopAppSettings.layerTest()));

      return yield* withHarness(
        lanNetworkInterfaces,
        Effect.gen(function* () {
          const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
          yield* serverExposure.configureFromSettings({ port: 4173 });

          const modeChange = yield* serverExposure
            .setMode("network-accessible")
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(modeWriteStarted);
          const tailscaleChange = yield* serverExposure
            .setTailscaleServeEnabled({ enabled: true, port: 8443 })
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.succeed(releaseModeWrite, undefined);
          yield* Fiber.join(modeChange);
          yield* Fiber.join(tailscaleChange);

          const state = yield* serverExposure.getState;
          assert.equal(state.mode, "network-accessible");
          assert.equal(state.tailscaleServeEnabled, true);
          assert.equal(state.tailscaleServePort, 8443);
        }),
        {},
        undefined,
        settingsLayer,
      );
    }),
  );

  it.effect("keeps LAN and Tailscale endpoints distinct when Tailscale is enumerated first", () =>
    withHarness(
      { ...tailnetNetworkInterfaces, ...lanNetworkInterfaces },
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        yield* serverExposure.setMode("network-accessible");

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints.map((endpoint) => endpoint.httpBaseUrl),
          ["http://127.0.0.1:4173/", "http://192.168.1.20:4173/", "http://100.90.1.2:4173/"],
        );
      }),
    ),
  );

  it.effect.each([
    {
      name: "excludes unrelated VPN addresses even when Tailscale is present",
      interfaces: {
        pvpnksintrf1: [{ address: "100.85.0.1", family: "IPv4", internal: false }],
        tailscale0: [{ address: "100.74.126.34", family: "IPv4", internal: false }],
      },
      assigned: ["100.74.126.34"],
      expected: ["http://100.74.126.34:4173/"],
    },
    {
      name: "excludes CGNAT VPN addresses when Tailscale has no assigned addresses",
      interfaces: {
        pvpnksintrf1: [{ address: "100.85.0.1", family: "IPv4", internal: false }],
      },
      assigned: [],
      expected: [],
    },
    {
      name: "keeps a named Tailscale interface when its status is unavailable",
      interfaces: {
        tailscale0: [{ address: "100.74.126.34", family: "IPv4", internal: false }],
      },
      assigned: null,
      expected: ["http://100.74.126.34:4173/"],
    },
    {
      name: "keeps a Windows Tailscale interface with stale status",
      interfaces: {
        Tailscale: [{ address: "100.74.126.34", family: "IPv4", internal: false }],
      },
      assigned: [],
      expected: ["http://100.74.126.34:4173/"],
    },
    {
      name: "identifies a macOS Tailscale tunnel by its IPv6 address without status",
      interfaces: {
        utun3: [{ address: "100.85.0.1", family: "IPv4", internal: false }],
        utun4: [
          { address: "100.74.126.34", family: "IPv4", internal: false },
          { address: "fd7a:115c:a1e0::1234", family: "IPv6", internal: false },
        ],
      },
      assigned: null,
      expected: ["http://100.74.126.34:4173/"],
    },
    {
      name: "recognizes an assigned address on a renamed adapter without IPv6",
      interfaces: {
        vpn0: [{ address: "100.74.126.34", family: "IPv4", internal: false }],
      },
      assigned: ["100.74.126.34"],
      expected: ["http://100.74.126.34:4173/"],
    },
    {
      name: "does not advertise cached Tailscale addresses absent from native interfaces",
      interfaces: {
        pvpnksintrf1: [{ address: "100.85.0.1", family: "IPv4", internal: false }],
      },
      assigned: ["100.74.126.35"],
      expected: [],
    },
  ])("$name", (scenario) =>
    withHarness(
      scenario.interfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;
        yield* settings.setServerExposureMode("network-accessible");
        yield* serverExposure.configureFromSettings({ port: 4173 });

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints
            .filter((endpoint) => endpoint.id.startsWith("tailscale-ip:"))
            .map((endpoint) => endpoint.httpBaseUrl),
          scenario.expected,
        );
      }),
      {},
      layerDieOnSpawn(),
      undefined,
      nativeTailscaleServeLayer(
        scenario.assigned === null
          ? undefined
          : { magicDnsName: null, tailnetIpv4Addresses: scenario.assigned },
      ),
    ),
  );

  it.effect("keeps Tailscale-only hosts network-accessible", () =>
    withHarness(
      tailnetNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        const settings = yield* DesktopAppSettings.DesktopAppSettings;
        yield* settings.setServerExposureMode("network-accessible");

        const state = yield* serverExposure.configureFromSettings({ port: 4173 });
        assert.equal(state.mode, "network-accessible");
        assert.equal(state.advertisedHost, null);
        assert.equal(state.endpointUrl, null);
        assert.equal((yield* serverExposure.backendConfig).bindHost, "0.0.0.0");

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints.map((endpoint) => [endpoint.reachability, endpoint.httpBaseUrl]),
          [
            ["loopback", "http://127.0.0.1:4173/"],
            ["private-network", "http://100.90.1.2:4173/"],
          ],
        );
      }),
    ),
  );

  it.effect("preserves explicit Tailscale exposure overrides", () =>
    withHarness(
      lanNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        const change = yield* serverExposure.setMode("network-accessible");

        assert.equal(change.state.advertisedHost, "100.90.1.2");
        assert.equal(change.state.endpointUrl, "http://100.90.1.2:4173");

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        assert.deepEqual(
          endpoints.map((endpoint) => endpoint.httpBaseUrl),
          ["http://127.0.0.1:4173/", "http://100.90.1.2:4173/", "https://public.example.test/"],
        );
      }),
      {
        T3CODE_DESKTOP_LAN_HOST: "100.90.1.2",
        T3CODE_DESKTOP_HTTPS_ENDPOINTS: "https://public.example.test",
      },
    ),
  );

  it.effect("advertises the WSL tailnet IP for a WSL primary, never the native interface's", () =>
    withHarness(
      tailnetNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        yield* serverExposure.setMode("network-accessible");

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        const tailscaleIpUrls = endpoints
          .filter((endpoint) => endpoint.id.startsWith("tailscale-ip:"))
          .map((endpoint) => endpoint.httpBaseUrl);

        assert.deepEqual(tailscaleIpUrls, ["http://100.100.50.50:4173/"]);
      }),
      {},
      undefined,
      undefined,
      wslTailscaleServeLayer({
        statuses: { wsl: { magicDnsName: null, tailnetIpv4Addresses: ["100.100.50.50"] } },
      }),
    ),
  );

  it.effect("advertises no tailnet IP endpoint for a local-only WSL primary", () =>
    withHarness(
      tailnetNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        // Mode stays local-only; Serve enabled so the gate that skips
        // Tailscale entirely doesn't short-circuit this assertion.
        yield* serverExposure.setTailscaleServeEnabled({ enabled: true });

        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        const tailscaleIpUrls = endpoints.filter((endpoint) =>
          endpoint.id.startsWith("tailscale-ip:"),
        );

        assert.deepEqual(tailscaleIpUrls, []);
      }),
      {},
      undefined,
      undefined,
      wslTailscaleServeLayer({
        statuses: { wsl: { magicDnsName: null, tailnetIpv4Addresses: ["100.100.50.50"] } },
      }),
    ),
  );

  it.effect("getState carries per-daemon statuses and device selectability", () =>
    withHarness(
      emptyNetworkInterfaces,
      Effect.gen(function* () {
        const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
        yield* serverExposure.configureFromSettings({ port: 4173 });
        // Enabled (not "active", to avoid the "active" case's live HTTPS
        // probe) so getAdvertisedEndpoints also builds the wsl MagicDNS
        // endpoint this test compares against.
        yield* serverExposure.setTailscaleServeEnabled({ enabled: true });

        const state = yield* serverExposure.getState;
        const endpoints = yield* serverExposure.getAdvertisedEndpoints;
        const wslEndpoint = endpoints.find((endpoint) =>
          endpoint.id.startsWith("tailscale-magicdns:"),
        );
        assert.ok(wslEndpoint, "expected a WSL MagicDNS endpoint to be advertised");

        assert.deepEqual(state.tailscaleServeStatuses, [
          {
            device: "wsl",
            outcome: "applying",
            message: null,
            httpBaseUrl: wslEndpoint?.httpBaseUrl ?? null,
          },
          { device: "native", outcome: "failed", message: "boom", httpBaseUrl: null },
        ]);
        assert.ok(state.tailscaleServeStatuses[0]?.httpBaseUrl);
        assert.equal(state.tailscaleServeDeviceSelectable, true);
      }),
      {},
      undefined,
      undefined,
      wslTailscaleServeLayer({
        results: [
          { daemon: "wsl", servePort: 443, outcome: "applying", message: null },
          { daemon: "native", servePort: 443, outcome: "failed", message: "boom" },
        ],
        statuses: { wsl: { magicDnsName: "desktop.example.ts.net", tailnetIpv4Addresses: [] } },
      }),
    ),
  );
});
