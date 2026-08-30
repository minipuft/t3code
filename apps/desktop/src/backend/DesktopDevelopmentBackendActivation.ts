import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";

import type * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";
import type { DesktopBackendInstance } from "./DesktopBackendManager.ts";

export const ACTIVATION_MARKER_FILE_NAME = ".t3-dev-backend-activation.json";

const { logInfo, logWarning } = DesktopObservability.makeComponentLogger(
  "desktop-development-backend-activation",
);

export function isDevelopmentBackendActivationEvent(eventPath: string): boolean {
  return eventPath.replaceAll("\\", "/").split("/").at(-1) === ACTIVATION_MARKER_FILE_NAME;
}

export const restartDevelopmentBackend = Effect.fn("desktop.developmentBackend.restart")(function* (
  backend: DesktopBackendInstance,
) {
  yield* logInfo("activating staged development backend bundle");
  yield* backend.stop();
  yield* backend.start;
});

export const startDevelopmentBackendActivationWatcher = Effect.fn(
  "desktop.developmentBackend.watchActivations",
)(function* (input: {
  readonly environment: DesktopEnvironment.DesktopEnvironment["Service"];
  readonly backend: DesktopBackendInstance;
}) {
  if (!input.environment.isDevelopment) return;

  const fileSystem = yield* FileSystem.FileSystem;
  const bundleDirectory = input.environment.path.dirname(input.environment.backendEntryPath);
  const activationEvents = fileSystem.watch(bundleDirectory).pipe(
    Stream.filter((event) => isDevelopmentBackendActivationEvent(event.path)),
    Stream.debounce(Duration.millis(120)),
  );

  yield* Stream.runForEach(activationEvents, () => restartDevelopmentBackend(input.backend)).pipe(
    Effect.catchCause((cause) =>
      logWarning("development backend activation watcher stopped", {
        cause: cause.toString(),
      }),
    ),
    Effect.forkScoped,
    Effect.asVoid,
  );
});
