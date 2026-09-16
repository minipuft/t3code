import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  WorkbenchPlanMoveState,
  WorkbenchPlanPath,
  WorkbenchPlanSummary,
} from "@t3tools/contracts";
import { Code2Icon, EyeIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  useWorkbenchPlanActions,
  useWorkbenchPlanAnnotations,
  useWorkbenchPlanSource,
} from "../../state/workbenchPlans";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { AnnotationsPanel } from "./WorkbenchPlanAnnotations";
import { WorkbenchPlanMarkdown } from "./WorkbenchPlanMarkdown";

type PlanMoveState = typeof WorkbenchPlanMoveState.Type;

/**
 * Editing surface for the selected plan: draft against a known mtime, save, move, rename, and
 * annotate. The draft is reported upward as dirty so the list cannot navigate away from it, and a
 * newer mtime arriving while dirty is surfaced instead of overwriting either side.
 */
export function PlanEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly summary: WorkbenchPlanSummary;
  readonly cwd?: string;
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
  const [view, setView] = useState<"rendered" | "source">("rendered");
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
          <div
            className="flex items-center rounded-md border border-border/70 p-0.5"
            role="group"
            aria-label="Plan view"
          >
            <Button
              size="xs"
              variant={view === "rendered" ? "secondary" : "ghost"}
              aria-pressed={view === "rendered"}
              onClick={() => setView("rendered")}
            >
              <EyeIcon /> Rendered
            </Button>
            <Button
              size="xs"
              variant={view === "source" ? "secondary" : "ghost"}
              aria-pressed={view === "source"}
              onClick={() => setView("source")}
            >
              <Code2Icon /> Source
            </Button>
          </div>
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

      {view === "source" ? (
        <Textarea
          ref={textareaRef}
          aria-label="Plan Markdown"
          className="font-mono"
          style={{ minHeight: "28rem" }}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      ) : (
        // A grid item's automatic minimum keeps an auto track from shrinking below the item's
        // min-content, so without this the bordered pane grows past the detail column and is
        // clipped at the page (#root is overflow-x: clip) instead of scrolling.
        <div
          className="min-h-[28rem] w-full min-w-0 overflow-x-clip rounded-lg border border-border/60 bg-background/48 p-5"
          aria-label="Rendered plan"
        >
          <WorkbenchPlanMarkdown
            text={draft}
            planPath={props.summary.path}
            environmentId={props.environmentId}
            {...(props.cwd === undefined ? {} : { cwd: props.cwd })}
          />
        </div>
      )}

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

function stateForSummary(summary: WorkbenchPlanSummary): PlanMoveState {
  if (summary.status === "backlog") return "backlog";
  if (summary.status === "done") return "archive";
  if (summary.status === "reference") return "reference";
  return "active";
}

/** Shared by every plan mutation in this module and by plan creation in the panel. */
export function showActionFailure(title: string, result: AtomCommandResult<unknown, unknown>) {
  if (result._tag === "Success") return;
  const error = squashAtomCommandFailure(result);
  toastManager.add({
    type: "error",
    title,
    description: error instanceof Error ? error.message : "The environment rejected this change.",
  });
}
