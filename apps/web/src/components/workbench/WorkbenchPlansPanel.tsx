import type {
  EnvironmentId,
  WorkbenchPlanList,
  WorkbenchPlanPath,
  WorkbenchPlanSummary,
} from "@t3tools/contracts";
import { FilePlus2Icon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { useProjects } from "../../state/entities";
import { useWorkbenchPlanActions, useWorkbenchPlans } from "../../state/workbenchPlans";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { PlanEditor, showActionFailure } from "./WorkbenchPlanEditor";

export function filterWorkbenchPlans(
  items: WorkbenchPlanList["items"],
  query: string,
): ReadonlyArray<WorkbenchPlanSummary> {
  const normalized = query.trim().toLocaleLowerCase();
  return [...items]
    .filter((item) => {
      if (normalized.length === 0) return true;
      return [item.name, item.path, item.project ?? "", item.status ?? "", ...item.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    })
    .sort((left, right) => {
      if ((left.binding !== null) !== (right.binding !== null)) return left.binding ? -1 : 1;
      return right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path);
    });
}

/**
 * A plan's relative image links resolve against its own directory (WorkbenchPlanMarkdown), but
 * that still needs an absolute anchor for the plan's environment. Plans aren't scoped to a single
 * project, so this takes the environment's first project as a representative cwd — the same
 * first-project convention WorkbenchSystemPanel already uses for this environment.
 */
export function resolveEnvironmentCwd(
  projects: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly workspaceRoot: string;
  }>,
  environmentId: EnvironmentId,
): string | undefined {
  return projects.find((project) => project.environmentId === environmentId)?.workspaceRoot;
}

export function WorkbenchPlansPanel(props: { readonly environmentId: EnvironmentId }) {
  const plans = useWorkbenchPlans(props.environmentId);
  const projects = useProjects();
  const cwd = useMemo(
    () => resolveEnvironmentCwd(projects, props.environmentId),
    [projects, props.environmentId],
  );
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<WorkbenchPlanPath | null>(null);
  const [dirtyPath, setDirtyPath] = useState<WorkbenchPlanPath | null>(null);
  const items = useMemo(
    () => filterWorkbenchPlans(plans.data?.items ?? [], query),
    [plans.data?.items, query],
  );

  useEffect(() => {
    if (dirtyPath !== null) return;
    if (selectedPath !== null && items.some((item) => item.path === selectedPath)) return;
    setSelectedPath(items[0]?.path ?? null);
  }, [dirtyPath, items, selectedPath]);

  const selectedSummary =
    plans.data?.items.find((item) => item.path === selectedPath) ?? items[0] ?? null;

  const capability = plans.data?.capability ?? null;
  const message =
    plans.error ??
    (capability?.status === "available"
      ? null
      : (capability?.reason ?? "The external plan library is not available."));

  return (
    <section className="grid min-h-[34rem] min-w-0 gap-5" aria-label="Plans library">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-xl tracking-tight">Plans</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Search, review, edit, and move plans through this environment&apos;s authenticated
            workspace adapter.
          </p>
        </div>
        <Input
          nativeInput
          type="search"
          disabled={dirtyPath !== null}
          value={query}
          className="sm:w-72"
          aria-label="Search Plans"
          placeholder="Search plans"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {message ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/24 px-4 py-3 text-muted-foreground text-sm">
          <span>{message}</span>
          <Button size="xs" variant="ghost" onClick={plans.refresh}>
            <RefreshCwIcon /> Retry
          </Button>
        </div>
      ) : null}

      {plans.isPending && plans.data === null ? (
        <WorkbenchEmptyState title="Loading Plans" description="Reading this environment…" />
      ) : items.length === 0 ? (
        <WorkbenchEmptyState
          title={query ? "No plans found" : "No plans available"}
          description={
            query
              ? "Try a different search."
              : "Configure a plan source or create the first plan in the external workspace."
          }
        />
      ) : (
        <div className="grid min-h-0 min-w-0 gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <PlanList
            items={items}
            selectedPath={selectedPath}
            lockedPath={dirtyPath}
            onSelect={setSelectedPath}
          />
          {selectedPath === null || selectedSummary === null ? null : (
            <PlanEditor
              key={`${props.environmentId}:${selectedPath}`}
              environmentId={props.environmentId}
              summary={selectedSummary}
              {...(cwd === undefined ? {} : { cwd })}
              onPathChanged={setSelectedPath}
              onListRefresh={plans.refresh}
              onDirtyChange={setDirtyPath}
            />
          )}
        </div>
      )}

      <CreatePlan
        disabled={dirtyPath !== null}
        environmentId={props.environmentId}
        onCreated={setSelectedPath}
        onRefresh={plans.refresh}
      />
    </section>
  );
}

export function PlanList(props: {
  readonly items: ReadonlyArray<WorkbenchPlanSummary>;
  readonly selectedPath: WorkbenchPlanPath | null;
  readonly lockedPath?: WorkbenchPlanPath | null;
  readonly onSelect: (path: WorkbenchPlanPath) => void;
}) {
  return (
    <div className="max-h-[68vh] overflow-y-auto rounded-xl border border-border/60 bg-card/60 p-1.5">
      {props.items.map((item) => (
        <button
          key={item.path}
          type="button"
          disabled={props.lockedPath != null && props.lockedPath !== item.path}
          aria-current={props.selectedPath === item.path ? "true" : undefined}
          className={cn(
            "grid w-full gap-1 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
            props.selectedPath === item.path ? "bg-primary/10" : "hover:bg-muted/56",
            "disabled:cursor-not-allowed disabled:opacity-45",
          )}
          onClick={() => props.onSelect(item.path)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {item.binding ? (
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="Bound" />
            ) : null}
            <span className="truncate font-medium text-sm">{item.name}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
            <span className="truncate">{item.project ?? (item.directory || "Workspace")}</span>
            {item.status ? (
              <span className="rounded bg-muted px-1.5 py-0.5">{item.status}</span>
            ) : null}
          </span>
          {item.binding ? (
            <span className="truncate text-emerald-600 text-xs dark:text-emerald-400">
              {item.binding.title ?? "Active thread"}
              {item.binding.threads > 1 ? ` · ${item.binding.threads} threads` : ""}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function CreatePlan(props: {
  readonly disabled: boolean;
  readonly environmentId: EnvironmentId;
  readonly onCreated: (path: WorkbenchPlanPath) => void;
  readonly onRefresh: () => void;
}) {
  const actions = useWorkbenchPlanActions(props.environmentId);
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState("");
  const [title, setTitle] = useState("");
  const create = async () => {
    if (props.disabled) return;
    const result = await actions.mutate({
      op: "create",
      project: project.trim(),
      title: title.trim(),
      state: "active",
    });
    if (result._tag === "Success") {
      props.onRefresh();
      props.onCreated(result.value.path);
      setTitle("");
      setOpen(false);
      toastManager.add({ type: "success", title: "Plan created" });
      return;
    }
    showActionFailure("Could not create plan", result);
  };
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-3">
      {open ? (
        <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto_auto]">
          <Input
            nativeInput
            aria-label="Plan project"
            placeholder="Project"
            value={project}
            onChange={(event) => setProject(event.currentTarget.value)}
          />
          <Input
            nativeInput
            aria-label="Plan title"
            placeholder="Plan title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Button
            disabled={props.disabled || !project.trim() || !title.trim()}
            onClick={() => void create()}
          >
            Create
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button disabled={props.disabled} variant="ghost" onClick={() => setOpen(true)}>
          <FilePlus2Icon /> New plan
        </Button>
      )}
    </div>
  );
}
