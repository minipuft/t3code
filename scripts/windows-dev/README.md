# Windows dev checkout safety

The Windows desktop launcher uses `C:\dev\t3code` as both a Git checkout and the working directory
of its WSL environment server. Changing source, dependencies, or generated output in that checkout
can activate its watchers and restart the client even when a wrapper is labelled "preflight."

`assert-checkout-idle.sh` fails with exit code `73` when the process listening on the T3 server port
has a working directory inside the proposed checkout. Windows synchronization and build wrappers
must call it before their first mutation and again between synchronization and build. The guard
reports the observed PID and working directory; it never stops a process.

Use this boundary before operations that mutate a live checkout:

- Git synchronization, branch switching, merge, reset, or cleanup
- dependency installation or lockfile repair
- server/desktop bundle generation and code generation
- migrations that rewrite files watched by the running client

Read-only inspection and work in a separate WSL checkout or worktree do not require the gate.

Server-only development has a narrower safe path while the client is open:

```bash
# Build and verify without touching the running Windows checkout.
vp run dev:desktop:stage-server

# Promote only the verified server artifacts and emit a backend activation receipt.
node apps/server/scripts/dev-server-bundle.mjs activate \
  --acknowledge-session-interruption \
  --target-server-dir /mnt/c/dev/t3code/apps/server
```

Staging is safe while sessions are active. Activation is not: the desktop main process keeps
Electron open, but it stops the environment backend that owns every provider subprocess. All
clients disconnect briefly and active agent turns terminate. Run activation only from an external
terminal after every turn finishes. To validate a staged artifact during ongoing work, launch it
with a separate T3 home and ports instead of activating the environment in use.

Old hashed chunks stay in place until the next cold build so the running backend remains valid
before activation. This exception does not permit Git sync, dependency installation, desktop
bundle generation, or Electron main/preload changes in the active checkout; those still require
`assert-checkout-idle.sh` and a deliberate relaunch.

Run the isolated positive/negative control with:

```bash
vp run test:windows-dev-guard
```
