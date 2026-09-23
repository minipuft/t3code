import { assert, describe, it } from "@effect/vitest";
import type { DesktopTailscaleServeDevice } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import {
  ensureTailscaleServe,
  TailscaleCommandExitError,
  TailscaleCommandTimeoutError,
} from "@t3tools/tailscale";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopTailscaleServe from "./DesktopTailscaleServe.ts";

const encoder = new TextEncoder();

type Outcome = { readonly code: number; readonly stderr?: string } | "hang";

interface RecordedCall {
  readonly argv: string;
  readonly options: ChildProcess.CommandOptions;
}

const makeHandle = (outcome: Outcome) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode:
      outcome === "hang"
        ? Effect.never
        : Effect.succeed(ChildProcessSpawner.ExitCode(outcome.code)),
    isRunning: Effect.succeed(outcome === "hang"),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: outcome === "hang" ? Stream.empty : Stream.make(encoder.encode(outcome.stderr ?? "")),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });

// Records every spawn's argv; `script` picks the outcome from the argv and
// how many times that exact argv has been spawned (1-based).
const makeFakeSpawner = (
  script: (argv: string, occurrence: number) => Outcome = () => ({ code: 0 }),
) => {
  const calls: Array<RecordedCall> = [];
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.sync(() => {
      if (command._tag !== "StandardCommand") throw new Error("unexpected piped command");
      const argv = [command.command, ...command.args].join(" ");
      calls.push({ argv, options: command.options });
      const occurrence = calls.filter((call) => call.argv === argv).length;
      return makeHandle(script(argv, occurrence));
    }),
  );
  return { spawner, calls };
};

const WSL_TARGET: DesktopTailscaleServe.TailscaleServePrimaryTarget = {
  port: 13773,
  distro: "Ubuntu",
};
const NATIVE_TARGET: DesktopTailscaleServe.TailscaleServePrimaryTarget = {
  port: 13773,
  distro: null,
};

const wslServe = (servePort: number) =>
  `wsl.exe -d Ubuntu --exec tailscale serve --bg --https=${servePort} http://127.0.0.1:13773`;
const wslOff = (servePort: number) =>
  `wsl.exe -d Ubuntu --exec tailscale serve --https=${servePort} off`;
const nativeServe = (servePort: number) =>
  `tailscale serve --bg --https=${servePort} http://127.0.0.1:13773`;
const nativeOff = (servePort: number) => `tailscale serve --https=${servePort} off`;

const makeServeLayer = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  settings: { readonly enabled?: boolean; readonly device: DesktopTailscaleServeDevice },
) =>
  DesktopTailscaleServe.layer.pipe(
    Layer.provideMerge(
      DesktopAppSettings.layerTest({
        ...DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS,
        tailscaleServeEnabled: settings.enabled ?? true,
        tailscaleServePort: 443,
        tailscaleServeDevice: settings.device,
      }),
    ),
    Layer.provideMerge(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
    // The native executable name follows the host (`tailscale.exe` on
    // Windows); pin the posix spelling these assertions use.
    Layer.provideMerge(Layer.succeed(HostProcessPlatform, "linux")),
  );

// Background applies run on a forked fiber with no receipt of their own, so
// yield to the scheduler until the in-memory condition holds. No clock time
// passes; the bound only turns a missed condition into a failure.
const waitUntil = (label: string, condition: Effect.Effect<boolean>) =>
  Effect.gen(function* () {
    for (let i = 0; i < 500; i++) {
      if (yield* condition) return;
      yield* Effect.yieldNow;
    }
    return yield* Effect.die(new Error(`condition never held: ${label}`));
  });

const outcomes = (results: ReadonlyArray<DesktopTailscaleServe.TailscaleServeDaemonResult>) =>
  Object.fromEntries(
    results.map((result) => [result.daemon, `${result.outcome}:${result.servePort}`]),
  );

describe("makeWslTailscaleSpawner", () => {
  it.effect("runs tailscale inside the distro and passes other commands through", () =>
    Effect.gen(function* () {
      const { spawner, calls } = makeFakeSpawner();
      const wrapped = DesktopTailscaleServe.makeWslTailscaleSpawner(spawner, "Ubuntu");
      yield* ensureTailscaleServe({
        localPort: 13773,
        servePort: 443,
        localHost: "127.0.0.1",
      }).pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, wrapped),
        Effect.provideService(HostProcessPlatform, "linux"),
      );
      yield* Effect.scoped(wrapped.spawn(ChildProcess.make("git", ["status"])));

      assert.deepStrictEqual(
        calls.map((call) => call.argv),
        [wslServe(443), "git status"],
      );
      const wslCall = calls[0]!;
      assert.strictEqual(wslCall.options.stdin, "ignore");
      assert.strictEqual(wslCall.options.env?.WSL_UTF8, "1");
      // The original command inherited the environment; the wrapper must too.
      assert.strictEqual(wslCall.options.extendEnv, true);
      assert.strictEqual(calls[1]!.options.env, undefined);
    }),
  );
});

describe("resolveServeDaemons", () => {
  it("serves a native primary from the native daemon whatever the device", () => {
    for (const device of ["auto", "wsl", "native", "both"] as const) {
      for (const hasMagicDns of [true, false]) {
        assert.deepStrictEqual(
          DesktopTailscaleServe.resolveServeDaemons(device, NATIVE_TARGET, hasMagicDns),
          ["native"],
        );
      }
    }
  });

  it("follows the device choice for a WSL primary", () => {
    const resolve = (device: DesktopTailscaleServeDevice, hasMagicDns: boolean) =>
      DesktopTailscaleServe.resolveServeDaemons(device, WSL_TARGET, hasMagicDns);
    assert.deepStrictEqual(resolve("auto", true), ["wsl"]);
    assert.deepStrictEqual(resolve("auto", false), ["native"]);
    assert.deepStrictEqual(resolve("wsl", false), ["wsl"]);
    assert.deepStrictEqual(resolve("native", true), ["native"]);
    assert.deepStrictEqual(resolve("both", false), ["wsl", "native"]);
  });
});

describe("DesktopTailscaleServe", () => {
  it.effect("serves a WSL primary from both daemons", () => {
    const { spawner, calls } = makeFakeSpawner();
    return Effect.gen(function* () {
      const serve = yield* DesktopTailscaleServe.DesktopTailscaleServe;
      yield* serve.primaryReady(WSL_TARGET);
      yield* waitUntil(
        "both active",
        serve.results.pipe(
          Effect.map((results) => results.filter((r) => r.outcome === "active").length === 2),
        ),
      );
      assert.deepStrictEqual(outcomes(yield* serve.results), {
        wsl: "active:443",
        native: "active:443",
      });
      assert.sameMembers(
        calls.map((call) => call.argv),
        [wslServe(443), nativeServe(443)],
      );
    }).pipe(Effect.provide(makeServeLayer(spawner, { device: "both" })));
  });

  it.effect("retries a failed apply after the backoff", () => {
    const { spawner, calls } = makeFakeSpawner((_argv, occurrence) =>
      occurrence === 1 ? { code: 1, stderr: "boom" } : { code: 0 },
    );
    return Effect.gen(function* () {
      const serve = yield* DesktopTailscaleServe.DesktopTailscaleServe;
      yield* serve.primaryReady(NATIVE_TARGET);
      yield* waitUntil(
        "first attempt",
        Effect.sync(() => calls.length === 1),
      );
      // Let the failed attempt reach its backoff sleep.
      for (let i = 0; i < 50; i++) yield* Effect.yieldNow;
      assert.strictEqual(calls.length, 1);

      yield* TestClock.adjust(Duration.millis(2_100));
      yield* waitUntil(
        "active after retry",
        serve.results.pipe(Effect.map((results) => results[0]?.outcome === "active")),
      );
      assert.deepStrictEqual(
        calls.map((call) => call.argv),
        [nativeServe(443), nativeServe(443)],
      );
    }).pipe(Effect.provide(makeServeLayer(spawner, { device: "native" })));
  });

  it.effect("removes an in-flight apply on stop, bounded to three seconds", () => {
    let offOutcome: Outcome = { code: 0 };
    const { spawner, calls } = makeFakeSpawner((argv) =>
      argv.endsWith(" off") ? offOutcome : "hang",
    );
    return Effect.gen(function* () {
      const serve = yield* DesktopTailscaleServe.DesktopTailscaleServe;

      // The serve never returns, so the daemon stays `applying`.
      yield* serve.primaryReady(WSL_TARGET);
      yield* waitUntil(
        "serve spawned",
        Effect.sync(() => calls.length === 1),
      );
      yield* serve.primaryStopped;
      assert.deepStrictEqual(
        calls.map((call) => call.argv),
        [wslServe(443), wslOff(443)],
      );
      assert.deepStrictEqual(yield* serve.results, []);
      assert.isTrue(Option.isNone(yield* serve.primaryTarget));

      // Same again with a hung `off`: stop must still return at the cap.
      offOutcome = "hang";
      yield* serve.primaryReady(WSL_TARGET);
      yield* waitUntil(
        "second serve spawned",
        Effect.sync(() => calls.length === 3),
      );
      const stopFiber = yield* Effect.forkChild(serve.primaryStopped);
      yield* waitUntil(
        "second off spawned",
        Effect.sync(() => calls.length === 4),
      );
      assert.isUndefined(stopFiber.pollUnsafe());
      yield* TestClock.adjust(Duration.seconds(3));
      yield* Fiber.join(stopFiber);
      assert.strictEqual(calls[3]!.argv, wslOff(443));
    }).pipe(Effect.provide(makeServeLayer(spawner, { device: "wsl" })));
  });

  it.effect("moves the mapping when the serve port changes", () => {
    const { spawner, calls } = makeFakeSpawner();
    return Effect.gen(function* () {
      const serve = yield* DesktopTailscaleServe.DesktopTailscaleServe;
      const settings = yield* DesktopAppSettings.DesktopAppSettings;
      yield* serve.primaryReady(NATIVE_TARGET);
      yield* waitUntil(
        "active on 443",
        serve.results.pipe(Effect.map((results) => results[0]?.outcome === "active")),
      );

      yield* settings.setTailscaleServe({
        enabled: true,
        port: Option.some(8443),
        device: Option.none(),
      });
      yield* serve.reconcile;

      const argv = calls.map((call) => call.argv);
      assert.deepStrictEqual(argv, [nativeServe(443), nativeOff(443), nativeServe(8443)]);
      assert.deepStrictEqual(outcomes(yield* serve.results), { native: "active:8443" });
    }).pipe(Effect.provide(makeServeLayer(spawner, { device: "native" })));
  });

  it.effect("disabling removes from every daemon, treating a missing handler as done", () => {
    const { spawner, calls } = makeFakeSpawner((argv) =>
      argv.endsWith(" off") ? { code: 1, stderr: "error: handler does not exist" } : { code: 0 },
    );
    return Effect.gen(function* () {
      const serve = yield* DesktopTailscaleServe.DesktopTailscaleServe;
      const settings = yield* DesktopAppSettings.DesktopAppSettings;
      yield* serve.primaryReady(WSL_TARGET);
      yield* waitUntil(
        "both active",
        serve.results.pipe(
          Effect.map((results) => results.filter((r) => r.outcome === "active").length === 2),
        ),
      );

      yield* settings.setTailscaleServe({
        enabled: false,
        port: Option.none(),
        device: Option.none(),
      });
      yield* serve.reconcile;

      const offCalls = calls.map((call) => call.argv).filter((argv) => argv.endsWith(" off"));
      assert.sameMembers(offCalls, [wslOff(443), nativeOff(443)]);
      assert.deepStrictEqual(yield* serve.results, []);
      assert.isTrue(Option.isSome(yield* serve.primaryTarget));
    }).pipe(Effect.provide(makeServeLayer(spawner, { device: "both" })));
  });
});

describe("describeTailscaleServeFailure", () => {
  const context = {
    distro: "Ubuntu",
    platform: "win32",
    servePort: 443,
    localPort: 13773,
  } as const;
  const exitError = (
    exitCode: number,
    stderrDiagnostic?: "permission-denied" | "serve-not-enabled",
  ) =>
    new TailscaleCommandExitError({
      executable: "tailscale",
      subcommand: "serve",
      argumentCount: 4,
      exitCode,
      stderrLength: 10,
      ...(stderrDiagnostic === undefined ? {} : { stderrDiagnostic }),
    });

  it("names the fix for each classified failure", () => {
    const describeFailure = DesktopTailscaleServe.describeTailscaleServeFailure;
    assert.strictEqual(
      describeFailure(exitError(1, "permission-denied"), "wsl", context),
      "Tailscale in WSL refused the change. Run `sudo tailscale set --operator=$USER` in WSL, then retry.",
    );
    assert.strictEqual(
      describeFailure(exitError(1, "serve-not-enabled"), "native", context),
      "Tailscale Serve isn't enabled on your tailnet. Run `tailscale serve` once in a terminal and approve it, then retry.",
    );
    assert.strictEqual(
      describeFailure(
        new TailscaleCommandTimeoutError({
          executable: "tailscale.exe",
          subcommand: "serve",
          argumentCount: 4,
          timeoutMs: 10_000,
          cause: new Error("timeout"),
        }),
        "native",
        context,
      ),
      "Tailscale on Windows didn't respond. If Serve isn't enabled on your tailnet yet, run `tailscale serve` once in a terminal to approve it, then retry.",
    );
    assert.strictEqual(
      describeFailure(exitError(127), "wsl", context),
      "Tailscale isn't installed in WSL (Ubuntu).",
    );
    assert.strictEqual(
      describeFailure(exitError(2), "native", { ...context, platform: "darwin" }),
      "Tailscale Serve failed on macOS (exit 2). Run `tailscale serve --bg --https=443 http://127.0.0.1:13773` there to see why.",
    );
  });
});
