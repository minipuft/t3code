import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  WorkbenchPlanAnnotation,
  WorkbenchPlanList,
  WorkbenchPlanMoveState,
  WorkbenchPlanPath,
  WorkbenchPlanSummary,
} from "@t3tools/contracts";
import {
  CheckIcon,
  CopyIcon,
  FilePlus2Icon,
  MessageSquareIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import {
  useWorkbenchPlanActions,
  useWorkbenchPlanAnnotations,
  useWorkbenchPlans,
  useWorkbenchPlanSource,
} from "../../state/workbenchPlans";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";

type PlanMoveState = typeof WorkbenchPlanMoveState.Type;

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

export function markdownHeadingBefore(text: string, offset: number): string {
  const lines = text.slice(0, Math.max(0, offset)).split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const heading = /^#{1,6}\s+(.+)$/.exec(lines[index] ?? "")?.[1]?.trim();
    if (heading) return heading;
  }
  return "";
}

export function WorkbenchPlansPanel(props: { readonly environmentId: EnvironmentId }) {
  const plans = useWorkbenchPlans(props.environmentId);
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
    <section className="grid min-h-[34rem] gap-5" aria-label="Plans library">
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
        <div className="grid min-h-0 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
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

function PlanEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly summary: WorkbenchPlanSummary;
  readonly onPathChanged: (path: WorkbenchPlanPath) => void;
  readonly onListRefresh: () => void;
  readonly onDirtyChange: (path: WorkbenchPlanPath | null) => void;
}) {
  const source = useWorkbenchPlanSource(props.environmentId, props.summary.path);
  const annotations = useWorkbenchPlanAnnotations(props.environmentId, props.summary.path);
  const actions = useWorkbenchPlanActions(props.environmentId);
  const [draft, setDraft] = useState("");
  const [baseText, setBaseText] = useState("");
  const [baseMtimeMs, setBaseMtimeMs] = useState(0);
  const [externalChange, setExternalChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rename, setRename] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = draft !== baseText;

  useEffect(() => {
    props.onDirtyChange(dirty ? props.summary.path : null);
    return () => props.onDirtyChange(null);
  }, [dirty, props.onDirtyChange, props.summary.path]);

  useEffect(() => {
    if (source.data === null) return;
    if (dirty && source.data.mtimeMs !== baseMtimeMs) {
      setExternalChange(true);
      return;
    }
    setDraft(source.data.text);
    setBaseText(source.data.text);
    setBaseMtimeMs(source.data.mtimeMs);
    setExternalChange(false);
  }, [baseMtimeMs, dirty, source.data]);

  useEffect(() => {
    if (props.summary.mtimeMs === baseMtimeMs) return;
    if (dirty) setExternalChange(true);
    else source.refresh();
  }, [baseMtimeMs, dirty, props.summary.mtimeMs, source.refresh]);

  const save = async () => {
    setSaving(true);
    const result = await actions.save({ path: props.summary.path, text: draft, baseMtimeMs });
    setSaving(false);
    if (result._tag === "Success") {
      setBaseText(draft);
      setBaseMtimeMs(result.value.mtimeMs);
      setExternalChange(false);
      source.refresh();
      props.onListRefresh();
      toastManager.add({ type: "success", title: "Plan saved" });
      return;
    }
    showActionFailure("Could not save plan", result);
    source.refresh();
  };

  const move = async (to: PlanMoveState) => {
    const result = await actions.mutate({ op: "move", path: props.summary.path, to });
    if (result._tag === "Success") {
      props.onPathChanged(result.value.path);
      props.onListRefresh();
      toastManager.add({ type: "success", title: "Plan moved" });
      return;
    }
    showActionFailure("Could not move plan", result);
  };

  const renamePlan = async () => {
    const name = rename.trim();
    if (!name) return;
    const result = await actions.mutate({ op: "rename", path: props.summary.path, name });
    if (result._tag === "Success") {
      setRename("");
      props.onPathChanged(result.value.path);
      props.onListRefresh();
      toastManager.add({ type: "success", title: "Plan renamed" });
      return;
    }
    showActionFailure("Could not rename plan", result);
  };

  const discardDraft = () => {
    setDraft(baseText);
    setExternalChange(false);
  };

  if (source.isPending && source.data === null) {
    return <WorkbenchEmptyState title="Loading plan" description={props.summary.path} />;
  }
  if (source.error || source.data === null) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-border/60 py-12">
        <WorkbenchEmptyState
          title="Plan unavailable"
          description={source.error ?? "The environment did not return this plan."}
        />
        <Button onClick={source.refresh}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{props.summary.name}</h3>
          <p className="truncate text-muted-foreground text-xs">{props.summary.path}</p>
          {props.summary.binding ? (
            <p className="mt-1 text-emerald-600 text-xs dark:text-emerald-400">
              Bound to {props.summary.binding.title ?? "an active thread"}
              {props.summary.binding.confirmed ? " · confirmed" : ""}
              {props.summary.binding.deviations
                ? ` · ${props.summary.binding.deviations} deviations`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={dirty}
            value={stateForSummary(props.summary)}
            onValueChange={(value) => void move(value as PlanMoveState)}
          >
            <SelectTrigger aria-label="Move plan" size="compact">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end">
              {(["active", "backlog", "archive", "reference"] as const).map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Button
            size="sm"
            disabled={!dirty || saving || externalChange}
            onClick={() => void save()}
          >
            {saving ? <RefreshCwIcon className="animate-spin" /> : <SaveIcon />}
            {saving ? "Saving" : "Save"}
          </Button>
          {dirty ? (
            <Button size="sm" variant="ghost" disabled={saving} onClick={discardDraft}>
              Discard
            </Button>
          ) : null}
        </div>
      </div>

      {externalChange ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-sm">
          <span>
            This plan changed outside this editor. Refresh before saving to avoid overwrite.
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              discardDraft();
              source.refresh();
            }}
          >
            <RefreshCwIcon /> Reload external
          </Button>
        </div>
      ) : null}

      <Textarea
        ref={textareaRef}
        aria-label="Plan Markdown"
        className="font-mono"
        style={{ minHeight: "28rem" }}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          nativeInput
          aria-label="Rename plan"
          placeholder="New filename"
          value={rename}
          onChange={(event) => setRename(event.currentTarget.value)}
        />
        <Button
          variant="outline"
          disabled={!rename.trim() || dirty}
          onClick={() => void renamePlan()}
        >
          Rename
        </Button>
      </div>

      <AnnotationsPanel
        annotations={annotations.data?.items ?? []}
        annotationsMarkdown={annotations.data?.markdown ?? ""}
        error={annotations.error}
        loading={annotations.isPending && annotations.data === null}
        planPath={props.summary.path}
        textareaRef={textareaRef}
        draft={draft}
        onRefresh={annotations.refresh}
        onMutate={async (input) => {
          const result = await actions.annotate(input);
          if (result._tag === "Success") {
            annotations.refresh();
            return true;
          }
          showActionFailure("Could not update annotation", result);
          return false;
        }}
      />
    </div>
  );
}

function AnnotationsPanel(props: {
  readonly annotations: ReadonlyArray<WorkbenchPlanAnnotation>;
  readonly annotationsMarkdown: string;
  readonly error: string | null;
  readonly loading: boolean;
  readonly planPath: WorkbenchPlanPath;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly draft: string;
  readonly onRefresh: () => void;
  readonly onMutate: (
    input: Parameters<ReturnType<typeof useWorkbenchPlanActions>["annotate"]>[0],
  ) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"comment" | "delete">("comment");
  const [copied, setCopied] = useState(false);

  const add = async () => {
    const start = props.textareaRef.current?.selectionStart ?? 0;
    const end = props.textareaRef.current?.selectionEnd ?? start;
    const ok = await props.onMutate({
      op: "add",
      path: props.planPath,
      kind,
      body: body.trim(),
      quote: props.draft.slice(start, end).trim(),
      heading: markdownHeadingBefore(props.draft, start),
    });
    if (ok) setBody("");
  };

  return (
    <section className="grid gap-3 border-t border-border/60 pt-4" aria-label="Plan annotations">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <MessageSquareIcon className="size-4" /> Annotations{" "}
          <span className="text-muted-foreground">{props.annotations.length}</span>
        </h4>
        <div className="flex gap-1">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh annotations"
            onClick={props.onRefresh}
          >
            <RefreshCwIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Copy annotations as Markdown"
            disabled={!props.annotationsMarkdown}
            onClick={() =>
              void navigator.clipboard.writeText(props.annotationsMarkdown).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_500);
              })
            }
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </Button>
        </div>
      </div>
      {props.error ? <p className="text-destructive text-sm">{props.error}</p> : null}
      {props.loading ? <p className="text-muted-foreground text-sm">Loading annotations…</p> : null}
      {props.annotations.map((annotation) => (
        <div
          key={annotation.id}
          className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {annotation.kind === "delete" ? "Remove" : "Comment"}
              {annotation.heading ? ` · ${annotation.heading}` : ""}
            </span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                void props.onMutate({
                  op: "resolve",
                  path: props.planPath,
                  annotationId: annotation.id,
                })
              }
            >
              Resolve
            </Button>
          </div>
          {annotation.quote ? (
            <blockquote className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">
              {annotation.quote}
            </blockquote>
          ) : null}
          {annotation.body ? <p className="mt-2 whitespace-pre-wrap">{annotation.body}</p> : null}
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
        <Select value={kind} onValueChange={(value) => setKind(value as "comment" | "delete")}>
          <SelectTrigger aria-label="Annotation kind">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="comment">comment</SelectItem>
            <SelectItem value="delete">remove</SelectItem>
          </SelectPopup>
        </Select>
        <Input
          nativeInput
          aria-label="Annotation"
          placeholder="Add a note; selected editor text becomes its quote"
          value={body}
          onChange={(event) => setBody(event.currentTarget.value)}
        />
        <Button
          variant="outline"
          disabled={
            !body.trim() &&
            !(
              props.textareaRef.current &&
              props.textareaRef.current.selectionStart !== props.textareaRef.current.selectionEnd
            )
          }
          onClick={() => void add()}
        >
          Add note
        </Button>
      </div>
    </section>
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

function stateForSummary(summary: WorkbenchPlanSummary): PlanMoveState {
  if (summary.status === "backlog") return "backlog";
  if (summary.status === "done") return "archive";
  if (summary.status === "reference") return "reference";
  return "active";
}

function showActionFailure(title: string, result: AtomCommandResult<unknown, unknown>) {
  if (result._tag === "Success") return;
  const error = squashAtomCommandFailure(result);
  toastManager.add({
    type: "error",
    title,
    description: error instanceof Error ? error.message : "The environment rejected this change.",
  });
}
