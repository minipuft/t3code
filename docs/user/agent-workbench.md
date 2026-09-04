# Agent Workbench

Agent Workbench keeps plans, prompts, provider skills, and subscription vitals available in one
native T3 Code view. Open it from the sidebar, command palette, or the Workbench link in the composer
action menu.

- **Plans** lists every project, opens rendered Markdown or editable source, and supports save,
  create, rename, move, and annotations when the current connection can operate on the environment.
  Tables, callouts, task lists, and Mermaid diagrams render in the reader; diagram source stays
  available when a diagram cannot render.
- **Prompts** shows declared workflow arguments and protected template content. The History view
  compares canonical revisions. Administrative sessions can review a diff before applying an edit
  or confirming a rollback.
- **Skills** groups the skills reported by the environment's providers and keeps the `$name`
  invocation copyable.
- **Vitals** shows both used and remaining percentages, expected pace when reported, reset time, and
  exhaustion warnings. T3 Code does not estimate missing provider limits from token counts.

Remote sessions with normal scopes can inspect the library but cannot edit governed prompts. A
sidecar outage appears as an unavailable Workbench capability and does not interrupt chat or agent
sessions.

## Keep Workbench beside a chat

Open the chat's right panel and use its add-surface menu to add **Plan**, **Actions**, or **Skills**.
These are normal T3 Code tabs, so they can sit beside Files, Diff, Browser, Terminal, pull requests,
and Agents.

- **Plan** starts at This Chat and uses the chat's explicit environment and thread identity. Switch
  to This Project or All Plans to choose a primary plan, add a reference, or repair a broken link.
  Suggestions are advisory and never attach a plan on their own.
- **Actions** and **Skills** provide compact versions of the shared workflow library. **Insert** adds
  an invocation to the current composer without sending it; **Copy** leaves the composer unchanged.

Vitals remains in the full Workbench because it is account-level information rather than chat
context.
