# Maintained-fork upstream intake

This runbook applies to the `minipuft/t3code` fork. Its maintained client line is `custom/main`;
the official source is `pingdotgg/t3code:main`.

## Routine operation

The **Upstream Intake** workflow runs weekly and can be dispatched manually. It attempts one atomic
merge of the complete official `main` history into `custom/main`.

The intake checkout fetches complete Git objects rather than using the repository's normal sparse
CI checkout. Cross-remote merges cannot rely on a partial clone's origin as the only promisor.

| Outcome                       | Automation behavior                                                                   | Maintained-line behavior                               |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| No upstream changes           | Writes a run summary                                                                  | No change                                              |
| Textually clean and validated | Publishes or refreshes `automation/upstream-main` and opens a PR                      | No change until the PR is merged                       |
| Merge conflict                | Uploads conflict paths, status, and combined diff; creates or updates a blocker issue | No change                                              |
| Validation failure            | Creates or updates a blocker issue with the failed run                                | No candidate publication and no maintained-line change |

Scheduled runs and normal manual runs stop at the candidate PR. A manual dispatch with
`auto_land=true` may merge only after the workflow's check, typecheck, focused Agent Workbench
tests, and desktop build have passed.

## Review a candidate

1. Confirm the PR base is `custom/main` and its head is `automation/upstream-main`.
2. Review changes in the custom overlap paths, especially contracts, server settings, WebSocket
   routing, `ChatView`, and `ChatComposer`.
3. Check the linked workflow run and its validation commands.
4. Merge the PR, or leave it open while more verification is performed.
5. Close T3 Code (Dev) and use the Windows desktop shortcut to fast-forward the downstream clone.

## Resolve a held conflict

Use one integration worktree and one actor for the Git index. Other agents may inspect separate
conflict groups or produce test evidence, but they must not mutate that worktree concurrently.

```bash
git fetch upstream main
git switch custom/main
git worktree add ../t3code-upstream-intake -b integration/upstream-main
git -C ../t3code-upstream-intake merge --no-ff upstream/main
```

Resolve the paths listed in the blocker issue, run the same validation commands as the workflow,
commit the merge, and publish it as a PR to `custom/main`. Do not rebase the published maintained
line; the Windows downstream sync relies on ancestry and fast-forward checks.

Git `rerere` is enabled in the canonical WSL checkout so recurring resolutions can be suggested on
later intakes. Reused resolutions still require diff and test review.

## Disable or roll back automation

Disable **Upstream Intake** in GitHub Actions or remove its schedule. The workflow owns only
`automation/upstream-main`, its candidate PR, and its two stable blocker issues. Removing those
objects does not alter `custom/main`.
