import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import type {
  DesktopBackendInstance,
  DesktopBackendSnapshot,
  DesktopBackendStartConfig,
} from "./DesktopBackendManager.ts";
import {
  isDevelopmentBackendActivationEvent,
  restartDevelopmentBackend,
} from "./DesktopDevelopmentBackendActivation.ts";

const snapshot: DesktopBackendSnapshot = {
  desiredRunning: true,
  ready: true,
  activePid: Option.some(123),
  restartAttempt: 0,
  restartScheduled: false,
};

describe("development backend activation", () => {
  it("recognizes only the explicit activation receipt", () => {
    assert.isTrue(isDevelopmentBackendActivationEvent(".t3-dev-backend-activation.json"));
    assert.isTrue(
      isDevelopmentBackendActivationEvent("C:\\dev\\t3code\\dist\\.t3-dev-backend-activation.json"),
    );
    assert.isFalse(isDevelopmentBackendActivationEvent("bin.mjs"));
    assert.isFalse(isDevelopmentBackendActivationEvent("manifest.json"));
  });

  it.effect("stops the current backend before starting the staged bundle", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<readonly string[]>([]);
      const backend: DesktopBackendInstance = {
        id: "primary" as DesktopBackendInstance["id"],
        label: Effect.succeed("Primary"),
        start: Ref.update(calls, (current) => [...current, "start"]),
        stop: () => Ref.update(calls, (current) => [...current, "stop"]),
        currentConfig: Effect.succeed(Option.none<DesktopBackendStartConfig>()),
        snapshot: Effect.succeed(snapshot),
        waitForReady: (_timeout: Duration.Duration) => Effect.succeed(true),
      };

      yield* restartDevelopmentBackend(backend);

      assert.deepEqual(yield* Ref.get(calls), ["stop", "start"]);
    }),
  );
});
