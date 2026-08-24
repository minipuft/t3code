import { formatTokens, formatUsd, makeCurrentWeekWindow } from "@t3tools/shared/usageFormat";
import type { EnvironmentId, WorkbenchQuotaWindow } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useUsage } from "../../state/usage";
import { useWorkbenchVitals } from "../../state/workbenchPlans";
import { Button } from "../ui/button";

export function WorkbenchVitalsPanel(props: { readonly environmentId: EnvironmentId }) {
  const [window, setWindow] = useState(() => makeCurrentWeekWindow());
  const usage = useUsage(window);
  const quota = useWorkbenchVitals(props.environmentId);
  const unavailable = usage.environments.filter((environment) => environment.error !== null).length;
  const claudeModels = useMemo(
    () => usage.merged.models.filter((model) => model.provider === "claude"),
    [usage.merged.models],
  );
  const splitClaude = (fable: boolean) =>
    claudeModels
      .filter((model) => model.model.toLowerCase().includes("fable") === fable)
      .reduce(
        (totals, model) => ({
          costUsd: totals.costUsd + model.costUsd,
          tokens: totals.tokens + model.totalTokens,
        }),
        { costUsd: 0, tokens: 0 },
      );
  const fable = splitClaude(true);
  const otherClaude = splitClaude(false);
  const inputTokens =
    usage.merged.uncachedInputTokens +
    usage.merged.cachedInputTokens +
    usage.merged.cacheCreationTokens;
  const uncachedPct =
    inputTokens === 0 ? null : (usage.merged.uncachedInputTokens / inputTokens) * 100;
  const settling = usage.isPending || usage.isPartial;
  const refresh = () => {
    setWindow(makeCurrentWeekWindow());
    usage.refresh();
    quota.refresh();
  };

  return (
    <section className="grid gap-6" aria-label="Vitals">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">Vitals</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Week to date across connected environments, with provider-owned quota from the selected
            environment.
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
        <VitalCard
          label="API-equivalent cost"
          value={settling ? "—" : formatUsd(usage.merged.costUsd)}
          detail="Token-priced; subscription billing is separate"
        />
        <VitalCard
          label="Tokens"
          value={settling ? "—" : formatTokens(usage.merged.totalTokens)}
          detail={`${window.sinceDay} → ${window.untilDay}`}
        />
        <VitalCard
          label="Uncached input"
          value={settling || uncachedPct === null ? "—" : `${Math.round(uncachedPct)}%`}
          detail="Fresh + cache-write share of input"
        />
        <VitalCard
          label="Coverage"
          value={
            usage.isPending || usage.isPartial
              ? "Reporting…"
              : unavailable > 0
                ? `${unavailable} unavailable`
                : `${usage.environments.length} environment${usage.environments.length === 1 ? "" : "s"}`
          }
          detail="Duplicate transcript sources are counted once"
        />
      </div>

      <section className="grid gap-3" aria-label="Subscription quota">
        <div>
          <h3 className="font-medium text-sm">Subscription quota</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Provider-reported limits only; token usage is not converted into guessed quota.
          </p>
        </div>
        {quota.isPending && quota.data === null ? (
          <Notice>Reading quota windows…</Notice>
        ) : quota.error !== null ? (
          <Notice>{quota.error}</Notice>
        ) : (quota.data?.windows.length ?? 0) === 0 ? (
          <Notice>
            {quota.data?.capability.reason ?? "No provider quota is currently reported."}
          </Notice>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {quota.data?.windows.map((item) => (
              <QuotaCard key={`${item.provider}:${item.label}`} window={item} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-label="Claude model split">
        <div>
          <h3 className="font-medium text-sm">Claude model split</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Week-to-date transcript usage split between Fable and other Claude models.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <VitalCard
            label="Fable"
            value={settling ? "—" : formatTokens(fable.tokens)}
            detail={`${formatUsd(fable.costUsd)} API-equivalent`}
          />
          <VitalCard
            label="Other Claude"
            value={settling ? "—" : formatTokens(otherClaude.tokens)}
            detail={`${formatUsd(otherClaude.costUsd)} API-equivalent`}
          />
        </div>
      </section>
    </section>
  );
}

function QuotaCard({ window }: { readonly window: WorkbenchQuotaWindow }) {
  const remainingPct = Math.max(0, 100 - window.usedPct);
  const resetAt = new Date(Date.now() + Math.max(0, window.secondsToReset) * 1_000);
  const resetLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(resetAt);
  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {window.providerLabel}
          </p>
          <p className="mt-1 font-medium text-sm">{window.label}</p>
        </div>
        <p className="font-semibold text-xl tabular-nums">{Math.round(remainingPct)}% left</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, window.usedPct))}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Resets in {formatDuration(window.secondsToReset)} · {resetLabel}
        {window.exhaustsBeforeReset && window.secondsToExhaustion !== null
          ? ` · projected empty in ${formatDuration(window.secondsToExhaustion)}`
          : ""}
      </p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${remainingMinutes}m`;
}

function Notice({ children }: { readonly children: string }) {
  return (
    <p className="rounded-xl border border-border/60 bg-card p-4 text-muted-foreground text-sm">
      {children}
    </p>
  );
}

function VitalCard({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-semibold text-2xl tabular-nums">{value}</p>
      <p className="mt-2 text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}
