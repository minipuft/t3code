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

ADRs live in `docs/adr`; manage them with `node scripts/adr.mjs`.
