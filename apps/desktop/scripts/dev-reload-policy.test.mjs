import { assert, describe, it } from "vite-plus/test";

import { fullAppRestartWatchTargets } from "./dev-reload-policy.mjs";

describe("desktop development reload policy", () => {
  it("reserves full Electron relaunches for main and preload bundles", () => {
    assert.deepEqual(
      fullAppRestartWatchTargets.map(({ directory, files }) => [directory, [...files]]),
      [["dist-electron", ["main.cjs", "preload.cjs"]]],
    );
  });

  it("does not treat a server bundle publication as a full-app reload", () => {
    const watchesServerBundle = fullAppRestartWatchTargets.some(
      ({ directory, files }) => directory === "../server/dist" && files.has("bin.mjs"),
    );

    assert.isFalse(watchesServerBundle);
  });
});
