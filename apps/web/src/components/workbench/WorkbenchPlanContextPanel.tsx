import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ScopedThreadRef,
  WorkbenchPlanAssociationMutationInput,
  WorkbenchPlanAssociations,
  WorkbenchPlanPath,
  WorkbenchPlanSummary,
} from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  BookOpenTextIcon,
  HistoryIcon,
  Link2Icon,
  RefreshCwIcon,
  UnlinkIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import {
  useWorkbenchPlanActions,
  useWorkbenchPlanAssociations,
  useWorkbenchPlans,
  useWorkbenchPlanSource,
  useWorkbenchPlanSuggestions,
} from "../../state/workbenchPlans";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { toastManager } from "../ui/toast";
import { WorkbenchPlanMarkdown } from "./WorkbenchPlanMarkdown";

type PlanAssociation = WorkbenchPlanAssociations["references"][number];
type PlanLens = "chat" | "project" | "all";

function planMatchesProject(plan: WorkbenchPlanSummary, project: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, "");
  const target = normalize(project);
  if (!target) return true;
  return (
    (plan.project !== null && normalize(plan.project) === target) ||
    normalize(plan.path.split("/")[0] ?? "") === target
  );
}

export function projectContextPlans(input: {
  readonly items: ReadonlyArray<WorkbenchPlanSummary>;
  readonly project: string;
  readonly lens: PlanLens;
  readonly associations: WorkbenchPlanAssociations | null;
}): ReadonlyArray<WorkbenchPlanSummary> {
  if (input.lens === "all") return input.items;
  if (input.lens === "project") {
    return input.items.filter((plan) => planMatchesProject(plan, input.project));
  }
  const paths = new Set<WorkbenchPlanPath>();
  if (input.associations?.primary) paths.add(input.associations.primary.planPath);
  for (const association of input.associations?.references ?? []) paths.add(association.planPath);
  return input.items.filter((plan) => paths.has(plan.path));
}

function showMutationFailure(result: AtomCommandResult<unknown, unknown>) {
  if (result._tag === "Success") return;
  const error = squashAtomCommandFailure(result);
  toastManager.add({
    type: "error",
    title: "Plan association was not changed",
    description: error instanceof Error ? error.message : "The environment rejected the change.",
  });
}

export function WorkbenchPlanContextPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly project: string;
  readonly cwd?: string;
  readonly firstUserMessage?: string;
}) {
  const conversation = useMemo(
    () => ({
      threadId: props.threadRef.threadId,
      ...(props.project.trim() ? { project: props.project.trim() } : {}),
    }),
    [props.project, props.threadRef.threadId],
  );
  const plans = useWorkbenchPlans(props.environmentId);
  const associations = useWorkbenchPlanAssociations(props.environmentId, conversation);
  const actions = useWorkbenchPlanActions(props.environmentId);
  const [lens, setLens] = useState<PlanLens>("chat");
  const visiblePlans = useMemo(
    () =>
      projectContextPlans({
        items: plans.data?.items ?? [],
        project: props.project,
        lens,
        associations: associations.data,
      }),
    [associations.data, lens, plans.data?.items, props.project],
  );
  const [selectedPath, setSelectedPath] = useState<WorkbenchPlanPath | null>(null);

  useEffect(() => {
    if (selectedPath && visiblePlans.some((plan) => plan.path === selectedPath)) return;
    const next =
      (lens === "chat" ? associations.data?.primary?.planPath : null) ??
      visiblePlans[0]?.path ??
      null;
    setSelectedPath(next);
  }, [associations.data?.primary?.planPath, lens, selectedPath, visiblePlans]);

  const mutate = async (
    input: Pick<WorkbenchPlanAssociationMutationInput, "op"> &
      Partial<Pick<WorkbenchPlanAssociationMutationInput, "planPath" | "associationId">>,
  ) => {
    const result = await actions.associate({
      ...conversation,
      ...input,
      ...(associations.data === null ? {} : { expectedRevision: associations.data.revision }),
    });
    if (result._tag === "Success") {
      associations.refresh();
      plans.refresh();
      toastManager.add({ type: "success", title: "Plan context updated" });
      return;
    }
    showMutationFailure(result);
    associations.refresh();
  };

  const capabilityMessage =
    plans.error ??
    (plans.data?.capability.status === "available"
      ? null
      : (plans.data?.capability.reason ?? "Agent Workbench plans are unavailable."));

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Contextual plans">
      <header className="grid gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-medium text-sm">
              <BookOpenTextIcon className="size-4 text-primary" /> Plan context
            </h2>
            <p className="mt-1 truncate text-muted-foreground text-xs">{props.project}</p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh plan context"
            onClick={() => {
              plans.refresh();
              associations.refresh();
            }}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        <div
          className="grid grid-cols-3 rounded-lg border border-border/70 p-0.5"
          role="group"
          aria-label="Plan scope"
        >
          {(["chat", "project", "all"] as const).map((value) => (
            <Button
              key={value}
              size="xs"
              variant={lens === value ? "secondary" : "ghost"}
              aria-pressed={lens === value}
              onClick={() => setLens(value)}
            >
              {value === "chat" ? "This Chat" : value === "project" ? "This Project" : "All Plans"}
            </Button>
          ))}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {capabilityMessage ? (
            <ContextNotice message={capabilityMessage} onRetry={plans.refresh} />
          ) : null}
          {associations.error ? (
            <ContextNotice message={associations.error} onRetry={associations.refresh} />
          ) : null}

          <ChatAssociations
            data={associations.data}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onRemove={(association) =>
              void mutate({
                op: association.role === "reference" ? "reference.remove" : "unlink",
                associationId: association.id,
              })
            }
            onRepair={(association) =>
              selectedPath
                ? void mutate({
                    op: "repair",
                    associationId: association.id,
                    planPath: selectedPath,
                  })
                : undefined
            }
          />

          {lens === "chat" && !associations.data?.primary && props.firstUserMessage?.trim() ? (
            <PlanSuggestions
              environmentId={props.environmentId}
              conversation={conversation}
              message={props.firstUserMessage}
              onSelect={setSelectedPath}
              onUse={(path) => void mutate({ op: "use", planPath: path })}
            />
          ) : null}

          {plans.isPending && plans.data === null ? (
            <p className="text-muted-foreground text-sm">Loading plans…</p>
          ) : visiblePlans.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 p-4 text-muted-foreground text-sm">
              {lens === "chat"
                ? "No plan is associated with this chat. Choose This Project or All Plans to add one."
                : "No plans match this scope."}
            </p>
          ) : (
            <section className="grid gap-2" aria-label="Plans in scope">
              <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                {lens === "chat"
                  ? "Associated"
                  : lens === "project"
                    ? "Project plans"
                    : "All plans"}
              </h3>
              <div className="grid max-h-56 gap-1 overflow-y-auto pr-1">
                {visiblePlans.map((plan) => (
                  <button
                    key={plan.path}
                    type="button"
                    aria-pressed={selectedPath === plan.path}
                    className={cn(
                      "grid gap-0.5 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selectedPath === plan.path
                        ? "border-primary/35 bg-primary/8"
                        : "border-transparent hover:border-border/60 hover:bg-muted/36",
                    )}
                    onClick={() => setSelectedPath(plan.path)}
                  >
                    <span className="truncate font-medium text-sm">{plan.name}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {plan.project ?? plan.directory}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {selectedPath ? (
            <div className="flex flex-wrap gap-2">
              <Button size="xs" onClick={() => void mutate({ op: "use", planPath: selectedPath })}>
                <Link2Icon /> {associations.data?.primary ? "Change primary" : "Use as primary"}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={associations.data?.references.some(
                  (item) => item.planPath === selectedPath,
                )}
                onClick={() => void mutate({ op: "reference.add", planPath: selectedPath })}
              >
                Add reference
              </Button>
            </div>
          ) : null}

          {selectedPath ? (
            <ContextPlanReader
              key={selectedPath}
              environmentId={props.environmentId}
              path={selectedPath}
              {...(props.cwd === undefined ? {} : { cwd: props.cwd })}
              threadRef={props.threadRef}
            />
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}

function ContextNotice(props: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/24 p-3 text-muted-foreground text-xs">
      <span className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" /> {props.message}
      </span>
      <Button size="xs" variant="ghost" onClick={props.onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ChatAssociations(props: {
  readonly data: WorkbenchPlanAssociations | null;
  readonly selectedPath: WorkbenchPlanPath | null;
  readonly onSelect: (path: WorkbenchPlanPath) => void;
  readonly onRemove: (association: PlanAssociation) => void;
  readonly onRepair: (association: PlanAssociation) => void;
}) {
  const current = [
    ...(props.data?.primary ? [props.data.primary] : []),
    ...(props.data?.references ?? []),
  ];
  if (current.length === 0 && (props.data?.history.length ?? 0) === 0) return null;
  return (
    <section className="grid gap-2" aria-label="Chat plan associations">
      {current.map((association) => (
        <AssociationRow key={association.id} association={association} {...props} />
      ))}
      {(props.data?.history.length ?? 0) > 0 ? (
        <details className="rounded-lg border border-border/60 px-3 py-2">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            <HistoryIcon className="mr-1 inline size-3.5" /> History {props.data?.history.length}
          </summary>
          <div className="mt-2 grid gap-1">
            {props.data?.history.map((association) => (
              <AssociationRow key={association.id} association={association} {...props} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function AssociationRow(props: {
  readonly association: PlanAssociation;
  readonly selectedPath: WorkbenchPlanPath | null;
  readonly onSelect: (path: WorkbenchPlanPath) => void;
  readonly onRemove: (association: PlanAssociation) => void;
  readonly onRepair: (association: PlanAssociation) => void;
}) {
  const { association } = props;
  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/18 p-2.5">
      <button
        type="button"
        className="min-w-0 text-left"
        onClick={() => props.onSelect(association.planPath)}
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-xs">{association.planPath}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {association.role}
          </span>
        </span>
        <span
          className={cn(
            "mt-1 block text-[11px]",
            association.state === "current"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          {association.state} · {association.source}
        </span>
      </button>
      <div className="flex flex-wrap gap-1">
        {(association.state === "broken" || association.state === "unverified") &&
        props.selectedPath ? (
          <Button size="xs" variant="outline" onClick={() => props.onRepair(association)}>
            <WrenchIcon /> Repair with selected
          </Button>
        ) : null}
        {association.state !== "historical" ? (
          <Button size="xs" variant="ghost" onClick={() => props.onRemove(association)}>
            <UnlinkIcon /> {association.role === "reference" ? "Remove" : "Unlink"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PlanSuggestions(props: {
  readonly environmentId: EnvironmentId;
  readonly conversation: {
    readonly threadId: ScopedThreadRef["threadId"];
    readonly project?: string;
  };
  readonly message: string;
  readonly onSelect: (path: WorkbenchPlanPath) => void;
  readonly onUse: (path: WorkbenchPlanPath) => void;
}) {
  const input = useMemo(
    () => ({ ...props.conversation, message: props.message }),
    [props.conversation, props.message],
  );
  const suggestions = useWorkbenchPlanSuggestions(props.environmentId, input);
  if (suggestions.isPending && suggestions.data === null) {
    return <p className="text-muted-foreground text-xs">Looking for related plans…</p>;
  }
  if (suggestions.error || !suggestions.data?.items.length) return null;
  return (
    <section className="grid gap-2" aria-label="Suggested plans">
      <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
        Suggested
      </h3>
      {suggestions.data.items.slice(0, 3).map((item) => (
        <div
          key={item.path}
          className="flex items-start justify-between gap-2 rounded-lg border border-border/60 p-2.5"
        >
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => props.onSelect(item.path)}
          >
            <span className="block truncate font-medium text-xs">{item.title}</span>
            <span className="mt-0.5 block truncate text-muted-foreground text-[11px]">
              {item.project}
            </span>
          </button>
          <Button size="xs" variant="outline" onClick={() => props.onUse(item.path)}>
            Use
          </Button>
        </div>
      ))}
    </section>
  );
}

function ContextPlanReader(props: {
  readonly environmentId: EnvironmentId;
  readonly path: WorkbenchPlanPath;
  readonly cwd?: string;
  readonly threadRef: ScopedThreadRef;
}) {
  const source = useWorkbenchPlanSource(props.environmentId, props.path);
  if (source.isPending && source.data === null) {
    return <p className="text-muted-foreground text-sm">Loading plan…</p>;
  }
  if (source.error || source.data === null) {
    return (
      <ContextNotice
        message={source.error ?? "This plan source is unavailable."}
        onRetry={source.refresh}
      />
    );
  }
  return (
    <article
      className="rounded-lg border border-border/60 bg-background/64 p-4"
      aria-label="Selected plan"
    >
      <WorkbenchPlanMarkdown
        text={source.data.text}
        {...(props.cwd === undefined ? {} : { cwd: props.cwd })}
        environmentId={props.environmentId}
        threadRef={props.threadRef}
      />
    </article>
  );
}
