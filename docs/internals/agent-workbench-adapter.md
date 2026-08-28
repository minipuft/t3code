# Agent Workbench adapter

The environment server owns the Agent Workbench integration. Electron and the web client do not
connect to the loopback sidecar directly.

## Runtime boundary

`AgentWorkbenchConnection` reads the owner-only WSL configuration, attaches to a compatible dynamic
loopback endpoint or starts the pinned `~/.local/bin/agent-workbench` launcher, negotiates protocol
`1.x`, and acquires one environment-owned lease. The lease is renewed while the server runs and is
released by the server layer finalizer. Request or sidecar failure resets only this adapter; provider
sessions and chat remain available.

The sidecar projects portable plans, catalog entries, provider quota windows, bindings, and prompt
governance. T3 maps those semantic contracts into native environment HTTP contracts and components.
No browser credential can reach the sidecar token, seed filesystem routes, or Claude Prompts
authority credentials.

## Authorization

| Operation                                             | Environment scope       |
| ----------------------------------------------------- | ----------------------- |
| Plans, vitals, catalog, prompt detail/history/compare | `orchestration:read`    |
| Plan save/move/rename/create/annotations              | `orchestration:operate` |
| Prompt review/apply/rollback                          | `access:write`          |

Prompt apply and rollback carry a browser-generated idempotency request id. Agent Workbench forwards
confirmed mutations to Claude Prompts MCP, which remains the sole writer and revision-history owner.

## Host conformance

`t3-capabilities.v1.json` declares every native surface and action. `t3-conformance.v1.json` covers
populated, read-only, and unavailable reverse states. Validate both with:

```bash
agent-workbench adapter check \
  --manifest apps/server/src/agentWorkbenchAdapter/t3-capabilities.v1.json \
  --fixtures apps/server/src/agentWorkbenchAdapter/t3-conformance.v1.json
```

The Windows dev launcher synchronizes this repository into its read-only Windows checkout, builds
the server bundle, and lets the WSL environment server attach to Agent Workbench. It does not embed a
loopback origin in the web bundle.
