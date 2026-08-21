# CI quality gates

> For maintainers. Using T3 Code? See [docs/user](../user/).

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs four jobs on pull requests and
pushes to `main`:

- **Check**: `vp check` (format and lint; this repo sets `typeCheck: false` in its lint options),
  then `vpr typecheck` for the workspace type check. The same job
  builds the desktop pipeline (`vp run build:desktop`) and verifies the preload bundle exists and
  still exports its expected symbols.
- **Test**: `vp run test` across the workspace.
- **Mobile Native Static Analysis**: `vp run lint:mobile` on macOS, wrapping
  `scripts/mobile-native-static-check.ts`.
- **Release Smoke**: exercises release-only workflow steps through `scripts/release-smoke.ts`, so
  release breakage surfaces on PRs rather than at tag time.

`.github/workflows/release.yml` builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`)
desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release. It auto-enables
signing only when platform credentials are present. macOS passkey builds additionally require
`APPLE_TEAM_ID` and the `MACOS_PROVISIONING_PROFILE` secret; Windows uses Azure Trusted Signing.
Without the core signing credentials, it still releases unsigned artifacts.

Forks may override the CI runner labels with the repository variables `CI_LINUX_RUNNER` and
`CI_MACOS_RUNNER`; the official Blacksmith labels remain the defaults. `CI_TIMEOUT_MINUTES` may
raise the job timeout on smaller hosted runners.

The maintained `minipuft/t3code` fork also runs
[Upstream Intake](../operations/upstream-intake.md). It validates a complete upstream merge before
publishing a candidate PR and creates blocker evidence instead of publishing conflicted or failing
intakes.

See [Release Checklist](../operations/release.md) for the full release/signing setup checklist.
