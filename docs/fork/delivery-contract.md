# Delivery contract (fork)

This fork carries the shared delivery contract from `repository-standards`.

After clone: `pnpm install` — the root `prepare` script wires `.vite-hooks/_` as
`core.hooksPath` (vite-plus owns git hooks here; there is no husky).

Commit messages are linted by `.vite-hooks/commit-msg` (conventional commits via
commitlint, after stripping AI-assistant trailers).

Update or check the contract:

```
node "$REPOSITORY_STANDARDS_DIR/bin/delivery-contract.cjs" update
node "$REPOSITORY_STANDARDS_DIR/bin/delivery-contract.cjs" check
```

Contract-managed files:

- `commitlint.rules.mjs`, `commitlint.config.mjs`
- `.vite-hooks/commit-msg` (fork-owned; installer wrote `.husky/commit-msg`, deleted here)
- `.github/workflows/pr-conventions.yml`
- `scripts/pr-check.mjs`, `scripts/pr-body.mjs`, `scripts/validate-pr-body.mjs`, `scripts/adr.mjs`
- `.delivery-contract.json`

`.github/pull_request_template.md` and `CONTRIBUTING.md` are upstream-owned and untouched.

`.husky/` is intentionally absent — this fork uses vite-plus hooks, not husky.

Managed files are exempt from `vp fmt`/`vp lint` via `vite.config.ts`'s `fmt.ignorePatterns` and
`lint.ignorePatterns` — the fork's only edit to that upstream-owned config — so the vite-plus
pre-commit hook cannot reformat a managed file out of sync with its template.

`.delivery-contract.json` omits `.husky/commit-msg` from the managed set: `.vite-hooks/commit-msg`
carries that responsibility here, so the contract never writes a file this fork intentionally
deleted.

ADRs live in `docs/adr`; manage them with `node scripts/adr.mjs`.

`knip.jsonc`'s `scripts` workspace `entry` list is the fork's second upstream-owned config edit — additive, covering the four managed scripts knip cannot otherwise see as entry points.
