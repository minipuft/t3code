// @effect-diagnostics cryptoRandomUUID:off - the browser supplies idempotency keys for HTTP mutations.
import {
  AuthAccessWriteScope,
  type AgentWorkbenchPromptReview,
  type EnvironmentId,
  type WorkflowCatalogItemId,
} from "@t3tools/contracts";
import { CheckIcon, CopyIcon, HistoryIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  useWorkflowPromptActions,
  useWorkflowPromptComparison,
  useWorkflowPromptHistory,
} from "../../state/workflowCatalog";
import { useEnvironmentSessionState } from "../../state/session";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface WorkbenchPromptGovernanceProps {
  readonly environmentId: EnvironmentId;
  readonly itemId: WorkflowCatalogItemId;
  readonly currentVersion: number;
  readonly userMessageTemplate: string;
  readonly systemMessage: string | null;
  readonly onChanged: () => void;
}

export function WorkbenchPromptGovernance(props: WorkbenchPromptGovernanceProps) {
  const session = useEnvironmentSessionState(props.environmentId);
  const history = useWorkflowPromptHistory(props.environmentId, props.itemId);
  const actions = useWorkflowPromptActions(props.environmentId);
  const [mode, setMode] = useState<"content" | "edit" | "history">("content");
  const [userMessageTemplate, setUserMessageTemplate] = useState(props.userMessageTemplate);
  const [systemMessage, setSystemMessage] = useState(props.systemMessage ?? "");
  const [review, setReview] = useState<AgentWorkbenchPromptReview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRollback, setPendingRollback] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = session.data?.scopes?.includes(AuthAccessWriteScope) === true;
  const versions = history.data?.versions ?? [];
  const priorVersion = useMemo(
    () => versions.find((version) => version.version !== props.currentVersion)?.version ?? null,
    [props.currentVersion, versions],
  );

  const reviewInput = {
    expected_version: props.currentVersion,
    user_message_template: userMessageTemplate,
    system_message: systemMessage,
  } as const;

  const runReview = async () => {
    setBusy(true);
    setNotice(null);
    const result = await actions.review(props.itemId, reviewInput).finally(() => setBusy(false));
    if (result._tag === "Success") {
      setReview(result.value);
      if (result.value.state !== "available") setNotice(result.value.reason ?? result.value.state);
      return;
    }
    setNotice("Administrative access is required to review prompt changes.");
  };

  const apply = async () => {
    setBusy(true);
    setNotice(null);
    const result = await actions
      .apply(props.itemId, {
        ...reviewInput,
        requestId: crypto.randomUUID(),
      })
      .finally(() => setBusy(false));
    if (result._tag !== "Success") {
      setNotice("The prompt change could not be applied.");
      return;
    }
    const state = result.value.prompt?.state ?? result.value.state ?? "available";
    if (state !== "available") {
      setNotice(result.value.reason ?? result.value.prompt?.reason ?? state);
      return;
    }
    setReview(null);
    setNotice("Prompt updated. The catalog and history are refreshing.");
    history.refresh();
    props.onChanged();
  };

  const rollback = async (version: number) => {
    setBusy(true);
    setNotice(null);
    const result = await actions
      .rollback(props.itemId, {
        version,
        expected_version: props.currentVersion,
        requestId: crypto.randomUUID(),
      })
      .finally(() => setBusy(false));
    setPendingRollback(null);
    if (result._tag !== "Success") {
      setNotice("The rollback could not be applied.");
      return;
    }
    const state = result.value.prompt?.state ?? result.value.state ?? "available";
    if (state !== "available") {
      setNotice(result.value.reason ?? result.value.prompt?.reason ?? state);
      return;
    }
    setNotice(`Version ${version} restored. The catalog and history are refreshing.`);
    history.refresh();
    props.onChanged();
  };

  return (
    <section className="grid gap-4 border-border/50 border-t pt-4" aria-label="Prompt governance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex rounded-lg bg-muted/36 p-1"
          role="tablist"
          aria-label="Prompt detail view"
        >
          <ModeButton active={mode === "content"} onClick={() => setMode("content")}>
            Content
          </ModeButton>
          <ModeButton active={mode === "history"} onClick={() => setMode("history")}>
            <HistoryIcon /> History
          </ModeButton>
          {canWrite ? (
            <ModeButton active={mode === "edit"} onClick={() => setMode("edit")}>
              <PencilIcon /> Edit
            </ModeButton>
          ) : null}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          version {props.currentVersion}
        </span>
      </div>

      {!canWrite && !session.isPending ? (
        <p className="rounded-lg border border-border/50 bg-muted/24 px-3 py-2 text-muted-foreground text-xs">
          Read-only session. Prompt mutations require administrative access.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-muted/32 px-3 py-2 text-xs">
          {notice}
        </p>
      ) : null}

      {mode === "content" ? (
        <div className="grid gap-4">
          <PromptContent label="User message template" content={props.userMessageTemplate} />
          <PromptContent
            label="System message"
            content={props.systemMessage ?? "No system message."}
          />
        </div>
      ) : mode === "edit" && canWrite ? (
        <div className="grid gap-4">
          <label className="grid gap-2 text-xs">
            <span className="font-medium">User message template</span>
            <Textarea
              value={userMessageTemplate}
              onChange={(event) => {
                setUserMessageTemplate(event.currentTarget.value);
                setReview(null);
              }}
              className="font-mono"
            />
          </label>
          <label className="grid gap-2 text-xs">
            <span className="font-medium">System message</span>
            <Textarea
              value={systemMessage}
              onChange={(event) => {
                setSystemMessage(event.currentTarget.value);
                setReview(null);
              }}
              className="font-mono"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void runReview()}>
              Review change
            </Button>
            <Button
              size="sm"
              disabled={busy || review?.state !== "available" || review.valid !== true}
              onClick={() => void apply()}
            >
              <CheckIcon /> Apply reviewed change
            </Button>
          </div>
          {review?.diff ? <DiffBlock label="Proposed diff" diff={review.diff} /> : null}
        </div>
      ) : (
        <div className="grid gap-3">
          {history.error ? <p className="text-destructive text-xs">{history.error}</p> : null}
          {history.isPending && history.data === null ? (
            <p className="text-muted-foreground text-xs">Loading canonical history…</p>
          ) : null}
          {priorVersion === null ? (
            <p className="text-muted-foreground text-xs">No earlier revisions were reported.</p>
          ) : (
            <PromptRevisionDiff
              environmentId={props.environmentId}
              itemId={props.itemId}
              from={priorVersion}
              to={props.currentVersion}
            />
          )}
          <div className="grid gap-2">
            {versions.map((version) => (
              <div
                key={version.version}
                className="grid gap-2 rounded-lg border border-border/50 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-xs">Version {version.version}</span>
                    <span className="text-[10px] text-muted-foreground">{version.date}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {version.diff_summary || version.description}
                  </p>
                </div>
                {canWrite && version.version !== props.currentVersion ? (
                  pendingRollback === version.version ? (
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setPendingRollback(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void rollback(version.version)}
                      >
                        Confirm restore
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPendingRollback(version.version)}
                    >
                      <RotateCcwIcon /> Restore
                    </Button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ModeButton(props: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={
        props.active
          ? "flex items-center gap-1 rounded-md bg-background px-2.5 py-1.5 text-xs shadow-xs"
          : "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-muted-foreground text-xs hover:text-foreground"
      }
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function PromptContent(props: { readonly label: string; readonly content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(props.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-xs">{props.label}</h4>
        <Button size="xs" variant="ghost" onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/24 p-3 font-mono text-xs leading-5">
        {props.content}
      </pre>
    </section>
  );
}

function PromptRevisionDiff(props: {
  readonly environmentId: EnvironmentId;
  readonly itemId: WorkflowCatalogItemId;
  readonly from: number;
  readonly to: number;
}) {
  const comparison = useWorkflowPromptComparison(
    props.environmentId,
    props.itemId,
    props.from,
    props.to,
  );
  if (comparison.error) return <p className="text-destructive text-xs">{comparison.error}</p>;
  if (comparison.data?.diff)
    return <DiffBlock label={`Version ${props.from} → ${props.to}`} diff={comparison.data.diff} />;
  return comparison.isPending ? (
    <p className="text-muted-foreground text-xs">Loading revision diff…</p>
  ) : null;
}

function DiffBlock(props: { readonly label: string; readonly diff: string }) {
  return (
    <section className="grid gap-2">
      <h4 className="font-medium text-xs">{props.label}</h4>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/24 p-3 font-mono text-xs leading-5">
        {props.diff}
      </pre>
    </section>
  );
}
