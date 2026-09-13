import { formatTokens, formatUsd, makeCurrentWeekWindow } from "@t3tools/shared/usageFormat";
import type { EnvironmentId, ProjectId, WorkbenchQuotaWindow } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useUsage } from "../../state/usage";
import { useWorkbenchVitals } from "../../state/workbenchPlans";
import { Button } from "../ui/button";

export function WorkbenchVitalsPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId?: ProjectId | null | undefined;
}) {
  const [window, setWindow] = useState(() => makeCurrentWeekWindow());
  const usage = useUsage(window, {
    environmentId: props.environmentId,
    ...(props.projectId === undefined ? {} : { projectId: props.projectId }),
  });
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
  const unattributedTokens = (usage.merged.unattributed ?? []).reduce(
    (total, item) => total + item.totalTokens,
    0,
  );
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
          detail={
            props.projectId === null
              ? "Usage with missing, unknown, or ambiguous project evidence"
              : props.projectId === undefined
                ? `${formatTokens(unattributedTokens)} unattributed · duplicate sources counted once`
                : "Transcript-derived project usage; account quota remains account-scoped"
          }
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
              <QuotaCard key={item.id} window={item} />
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
  const resetMs = window.resetsAt === null ? null : Date.parse(window.resetsAt);
  const secondsToReset =
    resetMs === null || !Number.isFinite(resetMs)
      ? null
      : Math.max(0, (resetMs - Date.now()) / 1_000);
  const resetLabel =
    resetMs === null || !Number.isFinite(resetMs)
      ? null
      : new Intl.DateTimeFormat(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(resetMs));
  const used = window.usedPercent === null ? null : Math.max(0, Math.min(100, window.usedPercent));
  const remaining =
    window.remainingPercent === null
      ? used === null
        ? null
        : 100 - used
      : Math.max(0, Math.min(100, window.remainingPercent));
  const source = sourceLabel(window.source);
  const observed = window.observedAt === null ? null : new Date(window.observedAt);
  const observedLabel =
    observed === null || !Number.isFinite(observed.getTime())
      ? null
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(observed);
  return (
    <div
      className="grid gap-3 rounded-2xl border border-border/60 bg-card p-5"
      data-state={window.state}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {window.providerLabel}
          </p>
          <p className="mt-1 font-medium text-sm">{window.label}</p>
        </div>
        <p className="font-semibold text-xl tabular-nums">
          {formatPercent(used)} used · {formatPercent(remaining)} left
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${window.providerLabel} ${window.label} quota used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={used ?? undefined}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${used ?? 0}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">
        {secondsToReset === null || resetLabel === null
          ? "Reset time unavailable"
          : `Resets in ${formatDuration(secondsToReset)} · ${resetLabel}`}
        {` · ${source}`}
        {observedLabel === null ? "" : ` · observed ${observedLabel}`}
        {window.state === "stale"
          ? " · stale"
          : window.state === "unavailable"
            ? " · unavailable"
            : ""}
      </p>
    </div>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function sourceLabel(source: WorkbenchQuotaWindow["source"]): string {
  if (source === "claude-oauth") return "Claude OAuth";
  if (source === "codex-app-server") return "Codex app-server";
  return "statusline capture";
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
