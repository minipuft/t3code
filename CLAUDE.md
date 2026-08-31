@AGENTS.md

## Live desktop development

**Stage before activation; backend-only reload over full client relaunch.**

- Keep the active Windows checkout running while staging server changes with `vp run dev:desktop:stage-server` in the WSL source checkout.
- Activation restarts the environment backend, disconnects every client, and terminates active agent turns. Never invoke it from an agent turn or while any environment session is working.
- Activate only from an external terminal after all turns finish, using `apps/server/scripts/dev-server-bundle.mjs activate --acknowledge-session-interruption --target-server-dir <path>`; use an isolated T3 home and ports for validation during ongoing work.
- Electron `main` or `preload`, dependency, Git synchronization, and generated desktop-bundle changes still require the idle-checkout gate and a deliberate full relaunch.
- Do not use `build:bundle` against an active desktop checkout. It bypasses staging and cannot prove that the artifact set is complete before activation.
