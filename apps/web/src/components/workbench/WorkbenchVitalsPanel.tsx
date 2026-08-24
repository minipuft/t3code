import { formatTokens, formatUsd, makeWindow } from "@t3tools/shared/usageFormat";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";

import { useUsage } from "../../state/usage";
import { Button } from "../ui/button";

export function WorkbenchVitalsPanel() {
  const window = useMemo(() => makeWindow(30), []);
  const { merged, environments, isPending, isPartial, refresh } = useUsage(window);
  const unavailable = environments.filter((environment) => environment.error !== null).length;
  return (
    <section className="grid gap-5" aria-label="Vitals">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">Vitals</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            A 30-day glance across connected environments. Usage remains the detailed view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button size="sm" variant="secondary" render={<Link to="/usage" />}>
            Full usage
            <ExternalLinkIcon />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <VitalCard label="Cost" value={isPending ? "—" : formatUsd(merged.costUsd)} />
        <VitalCard label="Tokens" value={isPending ? "—" : formatTokens(merged.totalTokens)} />
        <VitalCard label="Environments" value={String(environments.length)} />
        <VitalCard
          label="Coverage"
          value={
            isPending || isPartial
              ? "Reporting…"
              : unavailable > 0
                ? `${unavailable} unavailable`
                : "Current"
          }
        />
      </div>
    </section>
  );
}

function VitalCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-semibold text-2xl tabular-nums">{value}</p>
    </div>
  );
}
