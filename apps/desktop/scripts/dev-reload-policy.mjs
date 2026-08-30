export const fullAppRestartWatchTargets = [
  { directory: "dist-electron", files: new Set(["main.cjs", "preload.cjs"]) },
];
