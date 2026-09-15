# Agent Workbench

Agent Workbench keeps plans, prompts, and provider skills available in one native T3 Code view.
Open it from the sidebar, command palette, or the Workbench link in the composer action menu.

- **Plans** lists every project, opens rendered Markdown or editable source, and supports save,
  create, rename, move, and annotations when the current connection can operate on the environment.
  Tables, callouts, task lists, and Mermaid diagrams render in the reader; diagram source stays
  available when a diagram cannot render.
- **Prompts** shows declared workflow arguments and protected template content. The History view
  compares canonical revisions. Administrative sessions can review a diff before applying an edit
  or confirming a rollback.
- **Skills** groups the skills reported by the environment's providers and keeps the `$name`
  invocation copyable.
- **Library** groups prompts, skills, rules, hooks, and plans by category and source. Switch between
  the global inventory and a project's effective view, inspect inert imports, and review previous
  change receipts. Canonical rule and hook source is editable only after an explicit local-session
  unlock; review shows the exact diff and validator evidence before Apply becomes available.
- **Topology** shows projects, repositories, resource sources, and projection targets as a grouped
  relationship index. Approved relationships and proposed discoveries remain separate. A discovery
  can become workspace configuration only after you review and apply its exact diff.
- **Audit** compares the configured Claude, Codex, and OpenCode projections with their sources.
  Findings state whether each family is current, stale, missing, or unsupported and include the
  evidence used for that result. You can dismiss and restore a finding without changing its source.
  Repair remains a separate review, apply, and rollback workflow.

Account limits and project usage live on the Usage page, not in the Workbench. See
[Usage and limits](usage.md).

Remote sessions with normal scopes can inspect the library but cannot unlock or edit canonical
rules and hooks. An unlock expires after ten minutes and is cleared when its host lease ends. A
sidecar outage appears as an unavailable Workbench capability and does not interrupt chat or agent
sessions.

## Provider support

| Provider    | Workbench projection and audit |
| ----------- | ------------------------------ |
| Claude Code | Native                         |
| Codex       | Native                         |
| OpenCode    | Native                         |
| Cursor      | Unsupported                    |
| Grok        | Unsupported                    |

Unsupported means the Workbench does not claim a projection or repair path for that provider. It
does not prevent T3 Code from running the provider for chat when the provider itself is configured.

## Keep Workbench beside a chat

Open the chat's right panel and use its add-surface menu to add **Plan**, **Actions**, or **Skills**.
These are normal T3 Code tabs, so they can sit beside Files, Diff, Browser, Terminal, pull requests,
and Agents.

- **Plan** starts at This Chat and uses the chat's explicit environment and thread identity. Switch
  to This Project or All Plans to choose a primary plan, add a reference, or repair a broken link.
  Suggestions are advisory and never attach a plan on their own.
- **Actions** and **Skills** provide compact versions of the shared workflow library. **Insert** adds
  an invocation to the current composer without sending it; **Copy** leaves the composer unchanged.
  Their **Open library** handoff leads to the full provenance, imports, and change-review surface.
