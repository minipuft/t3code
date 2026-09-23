import type { DesktopTailscaleServeDevice } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import {
  disableTailscaleServe,
  ensureTailscaleServe,
  makeReadTailscaleStatus,
  readTailscaleStatus,
  type TailscaleCommandError,
  type TailscaleStatus,
} from "@t3tools/tailscale";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";

// Owns Tailscale Serve for the primary backend. A WSL primary can be served by
// the tailscaled inside the distro (its own tailnet node and MagicDNS name),
// by the Windows daemon, or both. Both daemons always target 127.0.0.1: WSL
// forwards Windows localhost into the distro, while the distro IP times out
// from the Windows tailscaled service.

export type TailscaleServeDaemon = "wsl" | "native";

export interface TailscaleServePrimaryTarget {
  readonly port: number;
  // Non-null exactly when the primary backend runs inside that WSL distro.
  readonly distro: string | null;
}

export interface TailscaleServeDaemonResult {
  readonly daemon: TailscaleServeDaemon;
  readonly servePort: number;
  readonly outcome: "applying" | "active" | "failed";
  // User-facing text, set only when failed. Never carries CLI output.
  readonly message: string | null;
}

export class DesktopTailscaleServe extends Context.Service<
  DesktopTailscaleServe,
  {
    // Stores the target and, when Serve is enabled, applies it in the
    // background with retries. Returns without waiting for tailscale.
    readonly primaryReady: (target: TailscaleServePrimaryTarget) => Effect.Effect<void>;
    // Cancels any in-flight apply, then removes every mapping that may have
    // landed. Bounded so backend shutdown never waits on a hung daemon.
    readonly primaryStopped: Effect.Effect<void>;
    // Re-applies current settings after a change; also serves as "Retry".
    // Waits for one attempt per daemon so the caller can read `results`.
    readonly reconcile: Effect.Effect<void>;
    readonly results: Effect.Effect<ReadonlyArray<TailscaleServeDaemonResult>>;
    readonly primaryTarget: Effect.Effect<Option.Option<TailscaleServePrimaryTarget>>;
    readonly readStatus: (
      daemon: TailscaleServeDaemon,
    ) => Effect.Effect<Option.Option<TailscaleStatus>>;
  }
>()("@t3tools/desktop/backend/DesktopTailscaleServe") {}

const SERVE_LOCAL_HOST = "127.0.0.1";
const STATUS_CACHE_TTL = Duration.seconds(60);
const WSL_STATUS_TIMEOUT = Duration.seconds(5);
const STOP_TIMEOUT = Duration.seconds(3);
const RETRY_BASE_DELAY = Duration.seconds(2);
const APPLY_RETRY = { schedule: Schedule.exponential(RETRY_BASE_DELAY), times: 3 } as const;

/** Which daemons should serve the primary, given the user's device choice. */
export const resolveServeDaemons = (
  device: DesktopTailscaleServeDevice,
  target: TailscaleServePrimaryTarget,
  wslHasMagicDns: boolean,
): ReadonlyArray<TailscaleServeDaemon> => {
  if (target.distro === null) return ["native"];
  switch (device) {
    case "auto":
      return wslHasMagicDns ? ["wsl"] : ["native"];
    case "wsl":
      return ["wsl"];
    case "native":
      return ["native"];
    case "both":
      return ["wsl", "native"];
  }
};

/** Every daemon that could hold a mapping for this primary. */
const reachableDaemons = (
  target: TailscaleServePrimaryTarget,
): ReadonlyArray<TailscaleServeDaemon> => (target.distro === null ? ["native"] : ["wsl", "native"]);

/**
 * Wraps a bare `tailscale` invocation so it runs inside the distro through
 * `wsl.exe --exec`, skipping the login shell. Other commands pass through.
 */
export const wrapWslTailscaleCommand = (
  command: ChildProcess.Command,
  distro: string,
): ChildProcess.Command => {
  if (command._tag !== "StandardCommand" || command.command !== "tailscale") return command;
  const { options } = command;
  return ChildProcess.make("wsl.exe", ["-d", distro, "--exec", "tailscale", ...command.args], {
    ...options,
    stdin: "ignore",
    env: { ...options.env, WSL_UTF8: "1" },
    // No env on the original means "inherit"; providing one without
    // extendEnv would replace the inherited environment, PATH included.
    extendEnv: options.env === undefined ? true : options.extendEnv,
  });
};

export const makeWslTailscaleSpawner = (
  base: ChildProcessSpawner.ChildProcessSpawner["Service"],
  distro: string,
): ChildProcessSpawner.ChildProcessSpawner["Service"] =>
  ChildProcessSpawner.make((command) => base.spawn(wrapWslTailscaleCommand(command, distro)));

export interface TailscaleServeFailureContext {
  readonly distro: string | null;
  readonly platform: NodeJS.Platform;
  readonly servePort: number;
  readonly localPort: number;
}

const deviceLabel = (daemon: TailscaleServeDaemon, context: TailscaleServeFailureContext) => {
  if (daemon === "wsl") return `WSL (${context.distro ?? "default"})`;
  if (context.platform === "win32") return "Windows";
  if (context.platform === "darwin") return "macOS";
  return "this computer";
};

const genericFailure = (
  label: string,
  exitCode: number | null,
  context: TailscaleServeFailureContext,
): string =>
  `Tailscale Serve failed on ${label}${exitCode === null ? "" : ` (exit ${exitCode})`}. ` +
  `Run \`tailscale serve --bg --https=${context.servePort} http://${SERVE_LOCAL_HOST}:${context.localPort}\` there to see why.`;

const describeExitFailure = (
  error: Extract<TailscaleCommandError, { readonly _tag: "TailscaleCommandExitError" }>,
  daemon: TailscaleServeDaemon,
  label: string,
  context: TailscaleServeFailureContext,
): string => {
  if (daemon === "wsl" && error.exitCode === 127) {
    return `Tailscale isn't installed in WSL (${context.distro ?? "default"}).`;
  }
  switch (error.stderrDiagnostic) {
    case "not-logged-in":
      return `Tailscale on ${label} isn't logged in. Run \`tailscale up\`, then retry.`;
    case "permission-denied":
      return daemon === "wsl"
        ? "Tailscale in WSL refused the change. Run `sudo tailscale set --operator=$USER` in WSL, then retry."
        : `Tailscale on ${label} refused the change (permission denied).`;
    case "serve-not-enabled":
      return "Tailscale Serve isn't enabled on your tailnet. Run `tailscale serve` once in a terminal and approve it, then retry.";
    default:
      return genericFailure(label, error.exitCode, context);
  }
};

/** User-facing text for a failed serve. Built from classified fields only. */
export const describeTailscaleServeFailure = (
  error: TailscaleCommandError,
  daemon: TailscaleServeDaemon,
  context: TailscaleServeFailureContext,
): string => {
  const label = deviceLabel(daemon, context);
  switch (error._tag) {
    case "TailscaleCommandSpawnError":
      return `Tailscale isn't installed on ${label}.`;
    case "TailscaleCommandTimeoutError":
      return `Tailscale on ${label} didn't respond. If Serve isn't enabled on your tailnet yet, run \`tailscale serve\` once in a terminal to approve it, then retry.`;
    case "TailscaleCommandExitError":
      return describeExitFailure(error, daemon, label, context);
    case "TailscaleCommandOutputError":
      return genericFailure(label, null, context);
  }
};

interface ServePlacement {
  readonly daemon: TailscaleServeDaemon;
  readonly servePort: number;
}

// An `applying` daemon may already hold the mapping (the CLI can finish on the
// daemon side after we stop waiting), so only `failed` is known to be absent.
const mayHoldMapping = (result: TailscaleServeDaemonResult): boolean => result.outcome !== "failed";

const placementKey = (placement: ServePlacement) => `${placement.daemon}:${placement.servePort}`;

const uniquePlacements = (
  placements: ReadonlyArray<ServePlacement>,
): ReadonlyArray<ServePlacement> => [
  ...new Map(placements.map((placement) => [placementKey(placement), placement])).values(),
];

const upsertResult = (
  results: ReadonlyArray<TailscaleServeDaemonResult>,
  next: TailscaleServeDaemonResult,
): ReadonlyArray<TailscaleServeDaemonResult> =>
  results.some((result) => result.daemon === next.daemon)
    ? results.map((result) => (result.daemon === next.daemon ? next : result))
    : [...results, next];

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const desktopSettings = yield* DesktopAppSettings.DesktopAppSettings;
  const baseSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = yield* HostProcessPlatform;
  const scope = yield* Effect.scope;
  // Held around each tailscale mutation so removals never interleave with an
  // attempt. Never held across a retry backoff.
  const commandLock = yield* Semaphore.make(1);
  // Held while a lifecycle call swaps the apply fiber or the target.
  const lifecycleLock = yield* Semaphore.make(1);
  const targetRef = yield* Ref.make(Option.none<TailscaleServePrimaryTarget>());
  const resultsRef = yield* Ref.make<ReadonlyArray<TailscaleServeDaemonResult>>([]);
  const applyFiberRef = yield* Ref.make(Option.none<Fiber.Fiber<unknown>>());

  const onDaemon = <A, E>(
    daemon: TailscaleServeDaemon,
    target: TailscaleServePrimaryTarget,
    effect: Effect.Effect<A, E, ChildProcessSpawner.ChildProcessSpawner>,
  ): Effect.Effect<A, E> => {
    if (daemon === "native") {
      return effect.pipe(
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, baseSpawner),
      );
    }
    if (target.distro === null) {
      return Effect.die(new Error("WSL Tailscale daemon requested for a native primary backend."));
    }
    return effect.pipe(
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        makeWslTailscaleSpawner(baseSpawner, target.distro),
      ),
      Effect.provideService(HostProcessPlatform, "linux"),
    );
  };

  const [cachedNativeStatus, invalidateNativeStatus] = yield* Effect.cachedInvalidateWithTTL(
    readTailscaleStatus.pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, baseSpawner),
      Effect.option,
    ),
    STATUS_CACHE_TTL,
  );
  const [cachedWslStatus, invalidateWslStatus] = yield* Effect.cachedInvalidateWithTTL(
    Ref.get(targetRef).pipe(
      Effect.flatMap((target) =>
        Option.isSome(target) && target.value.distro !== null
          ? onDaemon(
              "wsl",
              target.value,
              makeReadTailscaleStatus({ timeout: WSL_STATUS_TIMEOUT }),
            ).pipe(Effect.option)
          : Effect.succeed(Option.none<TailscaleStatus>()),
      ),
    ),
    STATUS_CACHE_TTL,
  );
  const invalidateStatusCaches = Effect.andThen(invalidateNativeStatus, invalidateWslStatus);

  const readStatus = Effect.fn("desktop.tailscaleServe.readStatus")(function* (
    daemon: TailscaleServeDaemon,
  ) {
    if (daemon === "native") return yield* cachedNativeStatus;
    // Checked outside the cache so a read before the primary starts is never
    // remembered as "no WSL daemon".
    const target = yield* Ref.get(targetRef);
    if (Option.isNone(target) || target.value.distro === null) return Option.none();
    return yield* cachedWslStatus;
  });

  const resolveDesiredDaemons = Effect.fn("desktop.tailscaleServe.resolveDaemons")(function* (
    device: DesktopTailscaleServeDevice,
    target: TailscaleServePrimaryTarget,
  ) {
    const wslHasMagicDns =
      device === "auto" && target.distro !== null
        ? Option.exists(yield* readStatus("wsl"), (status) => status.magicDnsName !== null)
        : false;
    return resolveServeDaemons(device, target, wslHasMagicDns);
  });

  const setResult = (result: TailscaleServeDaemonResult) =>
    Ref.update(resultsRef, (results) => upsertResult(results, result));

  const attemptApply = Effect.fn("desktop.tailscaleServe.attempt")(function* (
    daemon: TailscaleServeDaemon,
    target: TailscaleServePrimaryTarget,
    servePort: number,
  ) {
    yield* setResult({ daemon, servePort, outcome: "applying", message: null });
    yield* onDaemon(
      daemon,
      target,
      ensureTailscaleServe({ localPort: target.port, servePort, localHost: SERVE_LOCAL_HOST }),
    );
    yield* setResult({ daemon, servePort, outcome: "active", message: null });
    yield* Effect.logInfo("Tailscale Serve active").pipe(
      Effect.annotateLogs({ daemon, servePort, localPort: target.port, outcome: "active" }),
    );
  }, Semaphore.withPermit(commandLock));

  const recordFailure = (
    daemon: TailscaleServeDaemon,
    target: TailscaleServePrimaryTarget,
    servePort: number,
    error: TailscaleCommandError,
  ) => {
    const message = describeTailscaleServeFailure(error, daemon, {
      distro: target.distro,
      platform,
      servePort,
      localPort: target.port,
    });
    return setResult({ daemon, servePort, outcome: "failed", message }).pipe(
      Effect.andThen(
        Effect.logWarning("Tailscale Serve failed").pipe(
          Effect.annotateLogs({
            daemon,
            servePort,
            localPort: target.port,
            outcome: "failed",
            error: error._tag,
            ...(error._tag === "TailscaleCommandExitError"
              ? { exitCode: error.exitCode, stderrDiagnostic: error.stderrDiagnostic ?? "none" }
              : {}),
          }),
        ),
      ),
    );
  };

  const applyWithRetry = (
    daemon: TailscaleServeDaemon,
    target: TailscaleServePrimaryTarget,
    servePort: number,
  ) =>
    attemptApply(daemon, target, servePort).pipe(
      Effect.retry(APPLY_RETRY),
      Effect.catch((error) => recordFailure(daemon, target, servePort, error)),
    );

  // One attempt; true when the daemon now serves the primary.
  const applyOnce = (
    daemon: TailscaleServeDaemon,
    target: TailscaleServePrimaryTarget,
    servePort: number,
  ) =>
    attemptApply(daemon, target, servePort).pipe(
      Effect.as(true),
      Effect.catch((error) =>
        recordFailure(daemon, target, servePort, error).pipe(Effect.as(false)),
      ),
    );

  const removePlacement = (placement: ServePlacement, target: TailscaleServePrimaryTarget) =>
    onDaemon(
      placement.daemon,
      target,
      disableTailscaleServe({ servePort: placement.servePort }),
    ).pipe(
      // Nothing mapped on that port is the state we wanted.
      Effect.catchTag("TailscaleCommandExitError", (error) =>
        error.stderrDiagnostic === "no-existing-handler" ? Effect.void : Effect.fail(error),
      ),
      Effect.andThen(Effect.logInfo("Tailscale Serve removed")),
      Effect.catch((error) =>
        Effect.logWarning("Tailscale Serve removal failed").pipe(
          Effect.annotateLogs({ error: error._tag }),
        ),
      ),
      Effect.annotateLogs({
        daemon: placement.daemon,
        servePort: placement.servePort,
        localPort: target.port,
      }),
    );

  // One lock hold for the batch: daemons are independent, so removals run
  // concurrently, but nothing may apply while they do.
  const removePlacements = (
    placements: ReadonlyArray<ServePlacement>,
    target: TailscaleServePrimaryTarget,
  ) =>
    Effect.forEach(
      uniquePlacements(placements),
      (placement) => removePlacement(placement, target),
      {
        concurrency: "unbounded",
        discard: true,
      },
    ).pipe(Semaphore.withPermit(commandLock));

  const appliedPlacements = Ref.get(resultsRef).pipe(
    Effect.map((results) =>
      results
        .filter(mayHoldMapping)
        .map(({ daemon, servePort }): ServePlacement => ({ daemon, servePort })),
    ),
  );

  // Caller holds lifecycleLock for both of these.
  const interruptApplyFiber = Ref.getAndSet(applyFiberRef, Option.none()).pipe(
    Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: Fiber.interrupt })),
  );
  const startApplyFiber = <A>(work: Effect.Effect<A>) =>
    Effect.forkIn(work, scope).pipe(
      Effect.tap((fiber) => Ref.set(applyFiberRef, Option.some(fiber))),
    );

  const applyDesired = (
    target: TailscaleServePrimaryTarget,
    daemons: ReadonlyArray<TailscaleServeDaemon>,
    servePort: number,
  ) =>
    Effect.forEach(daemons, (daemon) => applyWithRetry(daemon, target, servePort), {
      concurrency: "unbounded",
      discard: true,
    });

  const primaryReady = Effect.fn("desktop.tailscaleServe.primaryReady")(function* (
    target: TailscaleServePrimaryTarget,
  ) {
    yield* Effect.annotateCurrentSpan({ port: target.port, distro: target.distro ?? "none" });
    yield* Effect.gen(function* () {
      yield* interruptApplyFiber;
      yield* Ref.set(targetRef, Option.some(target));
      yield* Ref.set(resultsRef, []);
      yield* invalidateStatusCaches;
      const settings = yield* desktopSettings.get;
      if (!settings.tailscaleServeEnabled) return;
      yield* startApplyFiber(
        resolveDesiredDaemons(settings.tailscaleServeDevice, target).pipe(
          Effect.flatMap((daemons) => applyDesired(target, daemons, settings.tailscaleServePort)),
        ),
      );
    }).pipe(Semaphore.withPermit(lifecycleLock));
  });

  const clearPrimary = Effect.andThen(Ref.set(targetRef, Option.none()), Ref.set(resultsRef, []));

  const primaryStopped = Effect.gen(function* () {
    // The interrupt comes first: an attempt holding commandLock would
    // otherwise block the removal, and its `applying` result must be read
    // only after it can no longer change.
    yield* interruptApplyFiber;
    const target = yield* Ref.get(targetRef);
    const placements = yield* appliedPlacements;
    yield* clearPrimary;
    yield* invalidateStatusCaches;
    if (Option.isNone(target)) return;
    yield* removePlacements(placements, target.value);
  }).pipe(
    Effect.ensuring(clearPrimary),
    Semaphore.withPermit(lifecycleLock),
    Effect.timeoutOption(STOP_TIMEOUT),
    Effect.asVoid,
    Effect.withSpan("desktop.tailscaleServe.primaryStopped"),
  );

  const disableWork = (target: TailscaleServePrimaryTarget, servePort: number) =>
    Effect.gen(function* () {
      const previous = yield* appliedPlacements;
      const current = reachableDaemons(target).map((daemon): ServePlacement => ({
        daemon,
        servePort,
      }));
      yield* removePlacements([...current, ...previous], target);
      yield* Ref.set(resultsRef, []);
      return [] as ReadonlyArray<TailscaleServeDaemon>;
    });

  const enableWork = (
    target: TailscaleServePrimaryTarget,
    device: DesktopTailscaleServeDevice,
    servePort: number,
  ) =>
    Effect.gen(function* () {
      const desired = yield* resolveDesiredDaemons(device, target);
      const previous = yield* appliedPlacements;
      yield* removePlacements(
        previous.filter(
          (placement) => !desired.includes(placement.daemon) || placement.servePort !== servePort,
        ),
        target,
      );
      yield* Ref.update(resultsRef, (results) =>
        results.filter((result) => desired.includes(result.daemon)),
      );
      const failed: Array<TailscaleServeDaemon> = [];
      for (const daemon of desired) {
        if (!(yield* applyOnce(daemon, target, servePort))) failed.push(daemon);
      }
      return failed as ReadonlyArray<TailscaleServeDaemon>;
    });

  const reconcile = Effect.gen(function* () {
    const started = yield* Effect.gen(function* () {
      const target = yield* Ref.get(targetRef);
      if (Option.isNone(target)) return Option.none();
      yield* interruptApplyFiber;
      yield* invalidateStatusCaches;
      const settings = yield* desktopSettings.get;
      const work = settings.tailscaleServeEnabled
        ? enableWork(target.value, settings.tailscaleServeDevice, settings.tailscaleServePort)
        : disableWork(target.value, settings.tailscaleServePort);
      const fiber = yield* startApplyFiber(work);
      return Option.some({ fiber, target: target.value, servePort: settings.tailscaleServePort });
    }).pipe(Semaphore.withPermit(lifecycleLock));
    if (Option.isNone(started)) return;

    // Running the awaited attempt as the apply fiber lets primaryStopped
    // cancel it like any background apply.
    const { fiber, target, servePort } = started.value;
    const exit = yield* Fiber.await(fiber);
    if (!Exit.isSuccess(exit) || exit.value.length === 0) return;
    const failed = exit.value;

    yield* Effect.gen(function* () {
      const current = yield* Ref.get(applyFiberRef);
      // Superseded or stopped while we waited.
      if (!Option.exists(current, (slot) => slot === fiber)) return;
      yield* startApplyFiber(
        Effect.sleep(RETRY_BASE_DELAY).pipe(
          Effect.andThen(applyDesired(target, failed, servePort)),
        ),
      );
    }).pipe(Semaphore.withPermit(lifecycleLock));
  }).pipe(Effect.withSpan("desktop.tailscaleServe.reconcile"));

  return DesktopTailscaleServe.of({
    primaryReady,
    primaryStopped,
    reconcile,
    results: Ref.get(resultsRef),
    primaryTarget: Ref.get(targetRef),
    readStatus,
  });
});

export const layer = Layer.effect(DesktopTailscaleServe, make);
