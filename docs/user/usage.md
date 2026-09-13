# Review usage

The Usage page combines Codex, Claude Code, and Grok Build activity from your connected
environments. It reads the providers' local session history and shows API-equivalent token cost,
processed tokens, cache savings, provider shares, and model breakdowns. Subscription billing is
separate from the raw token cost shown here.

Grok Build totals come from persisted session updates. Interactive turns that never wrote a
completed-turn record will not appear.

The project usage view uses the same kind of persisted transcript evidence. It attributes physical
records once, qualifies project identity by environment, and leaves records that cannot be matched
under **Unattributed**. These totals describe observed activity, not subscription headroom.

Agent Workbench Vitals is the account-quota view. It shows only provider-reported percentages and
reset timestamps, including unknown or stale values as reported. T3 Code does not derive quota from
the token-cost totals on this page and does not forecast when a quota window will be exhausted.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.
