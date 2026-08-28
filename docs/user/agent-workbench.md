# Agent Workbench

Agent Workbench keeps plans, prompts, provider skills, and subscription vitals available in one
native T3 Code view. Open it from the sidebar, command palette, or the Workbench link in the composer
action menu.

- **Plans** lists every project, opens Markdown source, and supports save, create, rename, move, and
  annotations when the current connection can operate on the environment.
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
