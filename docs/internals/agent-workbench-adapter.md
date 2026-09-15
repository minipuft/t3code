# Agent Workbench adapter

The environment server owns the Agent Workbench integration. Electron and the web client do not
connect to the loopback sidecar directly.

## Runtime boundary

`AgentWorkbenchConnection` reads the owner-only WSL configuration, attaches to a compatible dynamic
loopback endpoint or starts the pinned `~/.local/bin/agent-workbench` launcher, negotiates protocol
`1.x`, and acquires one environment-owned lease. The lease is renewed while the server runs and is
released by the server layer finalizer. Request or sidecar failure resets only this adapter; provider
sessions and chat remain available.

The sidecar projects portable plans, catalog entries, provider quota windows, project attribution,
bindings, topology, projection audits, and prompt governance. T3 maps those semantic contracts into
native environment HTTP contracts and components. No browser credential can reach the sidecar
token, seed filesystem routes, or Claude Prompts authority credentials.

Quota windows cross this boundary as provider observations: nullable used/remaining percentages,
an absolute reset timestamp, observation timestamp, source, provider-instance identity, and window
state. T3 may derive a display countdown from the absolute timestamp, but does not reconstruct reset
truth from response time or add exhaustion forecasts.

Project usage follows the opposite ownership direction. T3 scans provider-owned transcript state,
deduplicates physical records, assigns environment-qualified project identities, and publishes the
result to Agent Workbench under the active lease. Agent Workbench does not scan provider transcripts
or infer project usage from account quota. Releasing the lease removes that host projection;
missing or incompatible host data stays explicitly unavailable.

Workspace version 3 is the only runtime configuration accepted by this integration. It owns
registered resource sources, projects, categories, groups, and approved relationships. Relationship
discovery writes only evidence-backed Review Inbox proposals. The existing workspace mutation
owner validates and applies the exact reviewed diff; topology remains a read projection of approved
configuration plus separately labelled proposals.

Projection audit refresh reads canonical projection-health output and reconciles stable
Claude/Codex/OpenCode findings in the Review Inbox. Audit state can resolve or reopen as hashes
change. Dismiss and restore affect inbox lifecycle only. Generated projection repair still requires
review, exact diff digest, apply, and a rollback receipt. Cursor and Grok are declared unsupported
rather than presented through a fallback that cannot provide the contract.

Plan associations use `{environmentId, threadId}` as the stable T3 conversation. Provider resume
ids are projected from `ProviderSessionDirectory` only as aliases. A direct Codex or Claude
association can therefore be promoted when T3 later proves the same alias without creating a
second conversation. Every association and suggestion endpoint requires an explicit `threadId`;
the adapter never guesses from a project-wide or most-recent thread.

The web client consumes those contracts through `packages/client-runtime`; it does not call Agent
Workbench directly. The full Workbench and contextual right-panel surfaces reuse the same list,
source, association, suggestion, and catalog atoms. The contextual Plan surface scopes reads and
mutations to the routed `{environmentId, threadId}`. Actions and Skills insert text through the
active composer's existing imperative boundary rather than dispatching a turn.

Plan Markdown uses the chat renderer for GFM, sanitized HTML, links, and images. Mermaid 11.17.2 is
loaded only after a Mermaid fence appears, initializes with strict security, and leaves source plus
an error/retry state visible when rendering fails.

## Authorization

| Operation                                                     | Environment scope       |
| ------------------------------------------------------------- | ----------------------- |
| Plans, plan associations/suggestions, catalog, prompts        | `orchestration:read`    |
| Plan association changes, save/move/rename/create/annotations | `orchestration:operate` |
| Prompt review/apply/rollback                                  | `access:write`          |
| Resource library/source/authority/policy/ledger               | `orchestration:read`    |
| Resource unlock/relock/review/apply/rollback                  | `access:write`          |
| Topology, audit, projection health, project attribution       | `orchestration:read`    |
| Relationship review, audit lifecycle, projection apply/undo   | `access:write`          |

Prompt apply and rollback carry a browser-generated idempotency request id. Agent Workbench forwards
confirmed mutations to Claude Prompts MCP, which remains the sole writer and revision-history owner.

Canonical rule and hook mutation adds a second, independent authority boundary. The environment
server derives the authenticated T3 session id and Agent Workbench lease id; neither comes from the
browser payload. Unlock succeeds only when the HTTP peer is loopback, every address in any forwarded
chain is also loopback, the credential is not a relay DPoP token, and the principal has
`access:write`. The dev proxy preserves that chain, so a remote browser does not become local merely
because Vite connects to the server over loopback. Review, apply, and rollback repeat that
direct-local check instead of trusting the earlier unlock. The browser-facing
projection strips canonical absolute paths, repository roots, and provenance locators while keeping
relative targets, exact diffs, validator evidence, dirty-state requirements, and receipts.

Agent Workbench keeps the resulting session-and-lease authority only in memory for ten minutes and
revokes it when the lease closes. Target lookup and validator choice remain registry-owned, so an
HTTP request cannot nominate an arbitrary filesystem path or executable.

## Environment HTTP projection

The routes below require an authenticated environment session. Reads require
`orchestration:read`; their relationship, audit-lifecycle, and projection-repair writes also require
`access:write` and a direct-local administrative connection. Other Workbench mutation classes keep
the scopes listed in the Authorization table above.

| Method | Route                                            | Request                                    | Result                                     |
| ------ | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `GET`  | `/api/workbench/topology`                        | none                                       | approved and proposed relationship index   |
| `POST` | `/api/workbench/topology/review`                 | `WorkbenchRelationshipReviewInput`         | prepared exact workspace diff              |
| `GET`  | `/api/workbench/resources/review-inbox`          | none                                       | imports, relationships, and audit findings |
| `POST` | `/api/workbench/resources/review-inbox/commands` | `WorkbenchReviewInboxCommand`              | updated inbox revision                     |
| `GET`  | `/api/workbench/projections`                     | none                                       | per-family source/target health            |
| `POST` | `/api/workbench/projections/review`              | `{ requestId: string }`                    | projection diff and digest                 |
| `POST` | `/api/workbench/projections/apply`               | `{ reviewId: string, diffDigest: string }` | apply receipt                              |
| `POST` | `/api/workbench/projections/rollback`            | `{ requestId: string, receiptId: string }` | rollback receipt                           |

The standard environment HTTP error envelope reports authentication and authorization failures,
invalid requests, conflicts, unavailable sidecars, and incompatible payloads. The adapter does not
add a separate rate limiter; the environment server's authenticated request limits apply.

## Host conformance

`t3-capabilities.v1.json` declares every native surface, action, and provider decision. Claude,
Codex, and OpenCode are native; Cursor and Grok are unsupported. `t3-conformance.v1.json` covers
populated, read-only, and unavailable reverse states. Validate both with:

```bash
agent-workbench adapter check \
  --manifest apps/server/src/agentWorkbenchAdapter/t3-capabilities.v1.json \
  --fixtures apps/server/src/agentWorkbenchAdapter/t3-conformance.v1.json
```

The Windows dev launcher synchronizes this repository into its read-only Windows checkout, builds
the server bundle, and lets the WSL environment server attach to Agent Workbench. It does not embed a
loopback origin in the web bundle.
