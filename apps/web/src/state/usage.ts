import { useAtomValue } from "@effect/atom-react";
import {
  AuthDiagnosticsReadScope,
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageBucket,
  type UsageSummary,
  type UsageProviderKind,
  type UsageSummaryInput,
  type ProjectId,
} from "@t3tools/contracts";
import { needsCursorKeychainAccess, refreshUsage } from "@t3tools/client-runtime/state/usage";
import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useState } from "react";

import { mergeUsage, type EnvironmentUsage, type MergedUsage } from "@t3tools/shared/usageMerge";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentPresentations } from "./presentation";
import { serverEnvironment } from "./server";
import { environmentSession, readEnvironmentScope } from "./session";

export interface EnvironmentUsageStatus {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly isPending: boolean;
  readonly canReadDiagnostics: boolean;
  readonly isConnected: boolean;
  readonly error: string | null;
  readonly summary: UsageSummary | null;
  readonly needsCursorKeychainAccess: boolean;
}

const usageByWindowAtom = Atom.family((windowKey: string) =>
  Atom.make((get): readonly EnvironmentUsageStatus[] => {
    const input = JSON.parse(windowKey) as UsageSummaryInput;
    const presentations = get(environmentPresentations.presentationsAtom);

    const statuses: EnvironmentUsageStatus[] = [];
    for (const [environmentId, presentation] of presentations) {
      const isConnected = presentation.connection.phase === "connected";
      const sessionResult = get(environmentSession.sessionStateAtom(environmentId));
      const access = resolveUsageAccess({
        connectionPhase: presentation.connection.phase,
        session: Option.getOrNull(AsyncResult.value(sessionResult)),
        hasSessionError: sessionResult._tag === "Failure",
      });
      if (!access.canReadDiagnostics) {
        statuses.push({
          environmentId,
          label: presentation.entry.target.label,
          isConnected,
          ...access,
          summary: null,
          needsCursorKeychainAccess: false,
        });
        continue;
      }
      const result = get(serverEnvironment.usageSummary({ environmentId, input }));
      const summary = Option.getOrNull(AsyncResult.value(result));
      statuses.push({
        environmentId,
        label: presentation.entry.target.label,
        isPending: result.waiting,
        canReadDiagnostics: true,
        isConnected,
        error: result._tag === "Failure" ? "This environment could not report usage." : null,
        summary,
        needsCursorKeychainAccess: needsCursorKeychainAccess(
          summary,
          get(serverEnvironment.providersValueAtom(environmentId)),
        ),
      });
    }
    return statuses;
  }).pipe(Atom.withLabel(`web-usage:window:${windowKey}`)),
);

export interface UsageView {
  readonly merged: MergedUsage;
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly isPending: boolean;
  readonly shown: { readonly window: UsageSummaryInput; readonly merged: MergedUsage } | null;
  readonly isPartial: boolean;
  readonly refresh: (input?: UsageSummaryInput) => Promise<void>;
}

export interface UsageProjectScope {
  readonly environmentId: EnvironmentId;
  /** `undefined` means all projects; `null` means the explicit unattributed bucket. */
  readonly projectId?: ProjectId | null;
}

export function mergeAnsweredUsage(
  environments: readonly EnvironmentUsageStatus[],
  keepBucket?: (bucket: UsageBucket) => boolean,
  scope?: UsageProjectScope,
): MergedUsage {
  const answered: EnvironmentUsage[] = environments.flatMap(({ environmentId, label, summary }) =>
    summary === null
      ? []
      : [
          {
            environmentId,
            label,
            summary:
              keepBucket === undefined
                ? summary
                : { ...summary, buckets: summary.buckets.filter(keepBucket) },
          },
        ],
  );
  return mergeUsage(
    answered,
    USAGE_CONTRACT_VERSION,
    scope?.projectId === undefined
      ? undefined
      : { environmentId: scope.environmentId, projectId: scope.projectId },
  );
}

const NO_HIDDEN_PROVIDERS: ReadonlySet<UsageProviderKind> = new Set();

function withoutProviders(
  environments: readonly EnvironmentUsageStatus[],
  hiddenProviders: ReadonlySet<UsageProviderKind>,
): readonly EnvironmentUsageStatus[] {
  if (hiddenProviders.size === 0) return environments;
  return environments.map((environment) =>
    environment.summary === null
      ? environment
      : {
          ...environment,
          summary: {
            ...environment.summary,
            buckets: environment.summary.buckets.filter(
              (bucket) => !hiddenProviders.has(bucket.provider),
            ),
            sources: environment.summary.sources.filter(
              (source) => !hiddenProviders.has(source.fingerprint.provider),
            ),
          },
        },
  );
}

function deriveSelection(
  environments: readonly EnvironmentUsageStatus[],
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null,
  hiddenProviders: ReadonlySet<UsageProviderKind>,
  scope?: UsageProjectScope,
) {
  const selectedEnvironments =
    selectedEnvironmentIds === null
      ? environments
      : environments.filter((environment) => selectedEnvironmentIds.has(environment.environmentId));
  return {
    environments,
    selectedEnvironmentIds,
    hiddenProviders,
    scope,
    selectedEnvironments,
    merged: mergeAnsweredUsage(
      withoutProviders(selectedEnvironments, hiddenProviders),
      undefined,
      scope,
    ),
  };
}

export function useUsage(
  input: UsageSummaryInput,
  selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null = null,
  hiddenProvidersOrScope: ReadonlySet<UsageProviderKind> | UsageProjectScope = NO_HIDDEN_PROVIDERS,
): UsageView {
  const scope = "environmentId" in hiddenProvidersOrScope ? hiddenProvidersOrScope : undefined;
  const hiddenProviders =
    "environmentId" in hiddenProvidersOrScope ? NO_HIDDEN_PROVIDERS : hiddenProvidersOrScope;
  const windowKey = JSON.stringify({
    sinceDay: input.sinceDay,
    untilDay: input.untilDay,
    timeZone: input.timeZone,
    resolution: input.resolution,
    sinceTime: input.sinceTime,
    untilTime: input.untilTime,
  });
  const atom = usageByWindowAtom(windowKey);
  const environments = useAtomValue(atom);
  // The render-time sync below compares merged by identity, so the derivation is
  // held in state keyed on its inputs rather than rebuilt every render.
  const [derived, setDerived] = useState(() =>
    deriveSelection(environments, selectedEnvironmentIds, hiddenProviders, scope),
  );
  let current = derived;
  if (
    derived.environments !== environments ||
    derived.selectedEnvironmentIds !== selectedEnvironmentIds ||
    derived.hiddenProviders !== hiddenProviders ||
    derived.scope?.environmentId !== scope?.environmentId ||
    derived.scope?.projectId !== scope?.projectId
  ) {
    current = deriveSelection(environments, selectedEnvironmentIds, hiddenProviders, scope);
    setDerived(current);
  }
  const { selectedEnvironments, merged } = current;

  const refresh = (nextInput?: UsageSummaryInput) =>
    refreshUsage({
      registry: appAtomRegistry,
      server: serverEnvironment,
      presentations: environmentPresentations,
      environmentIds: selectedEnvironments
        .filter(
          (environment) =>
            environment.canReadDiagnostics &&
            readEnvironmentScope(environment.environmentId, AuthDiagnosticsReadScope),
        )
        .map(({ environmentId }) => environmentId),
      input: nextInput ?? (JSON.parse(windowKey) as UsageSummaryInput),
    });

  const answeredCount = selectedEnvironments.filter(
    (environment) => environment.summary !== null,
  ).length;
  const stillReporting = selectedEnvironments.filter(
    (environment) => environment.summary === null && environment.error === null,
  ).length;
  const isPending = answeredCount === 0 && stillReporting > 0;

  const [lastAnswered, setLastAnswered] = useState<
    | (NonNullable<UsageView["shown"]> & {
        readonly selection: typeof selectedEnvironmentIds;
        readonly hidden: typeof hiddenProviders;
        readonly scope: typeof scope;
      })
    | null
  >(null);
  if (
    answeredCount > 0 &&
    (lastAnswered?.merged !== merged ||
      lastAnswered.window !== input ||
      lastAnswered.selection !== selectedEnvironmentIds ||
      lastAnswered.hidden !== hiddenProviders ||
      lastAnswered.scope?.environmentId !== scope?.environmentId ||
      lastAnswered.scope?.projectId !== scope?.projectId)
  ) {
    setLastAnswered({
      window: input,
      merged,
      selection: selectedEnvironmentIds,
      hidden: hiddenProviders,
      scope,
    });
  }
  const kept =
    lastAnswered?.selection === selectedEnvironmentIds &&
    lastAnswered.hidden === hiddenProviders &&
    lastAnswered.scope?.environmentId === scope?.environmentId &&
    lastAnswered.scope?.projectId === scope?.projectId
      ? lastAnswered
      : null;
  const shown =
    answeredCount > 0
      ? { window: input, merged }
      : (kept ?? (isPending ? null : { window: input, merged }));

  return {
    merged,
    environments,
    selectedEnvironments,
    isPending,
    shown,
    isPartial: answeredCount > 0 && stillReporting > 0,
    refresh,
  };
}
