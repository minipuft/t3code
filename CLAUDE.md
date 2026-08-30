@AGENTS.md

## Live desktop development

**Stage before activation; backend-only reload over full client relaunch.**

- Keep the active Windows checkout running while staging server changes with `vp run dev:desktop:stage-server` in the WSL source checkout.
- Activate in the same checkout with `vp run dev:desktop:activate-server`; for the Windows adapter, pass its server directory to `apps/server/scripts/dev-server-bundle.mjs activate --target-server-dir <path>`.
- Activation promotes only verified server artifacts and restarts the backend process; the renderer window stays open and reconnects.
- Electron `main` or `preload`, dependency, Git synchronization, and generated desktop-bundle changes still require the idle-checkout gate and a deliberate full relaunch.
- Do not use `build:bundle` against an active desktop checkout. It bypasses staging and cannot prove that the artifact set is complete before activation.
