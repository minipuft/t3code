import type {
  EnvironmentId,
  WorkbenchResourceApplyInput,
  WorkbenchResourceLibrary,
  WorkbenchResourceMutationReview,
  WorkbenchResourceTarget,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  CheckCircle2Icon,
  FileCogIcon,
  LockIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  UnlockIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { randomUUID } from "../../lib/utils";

import {
  useWorkbenchResourceActions,
  useWorkbenchResourceAuthority,
  useWorkbenchResourceLibrary,
  useWorkbenchResourceMutations,
  useWorkbenchResourcePolicy,
  useWorkbenchResourceSource,
  useWorkbenchReviewInbox,
} from "../../state/workbenchResources";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";

type ResourceEntry = WorkbenchResourceLibrary["entries"][number];
type View = "library" | "review" | "changes";

export function WorkbenchResourceLibraryPanel(props: { readonly environmentId: EnvironmentId }) {
  const [lens, setLens] = useState<"global" | "effective">("global");
  const [project, setProject] = useState<string | undefined>();
  const [view, setView] = useState<View>("library");
  const [selected, setSelected] = useState<ResourceEntry | null>(null);
  const [authorityNotice, setAuthorityNotice] = useState<string | null>(null);
  const library = useWorkbenchResourceLibrary(
    props.environmentId,
    lens === "effective" && project ? { lens, project } : { lens: "global" },
  );
  const authority = useWorkbenchResourceAuthority(props.environmentId);
  const policy = useWorkbenchResourcePolicy(props.environmentId);
  const inbox = useWorkbenchReviewInbox(props.environmentId);
  const ledger = useWorkbenchResourceMutations(props.environmentId);
  const actions = useWorkbenchResourceActions(props.environmentId);
  const editable = selected?.kind === "rule" || selected?.kind === "hook";
  const target = editable && selected.relativePath ? resourceTarget(selected) : null;

  useEffect(() => {
    const firstProject = library.data?.projects[0];
    if (project === undefined && firstProject !== undefined) setProject(firstProject);
  }, [library.data?.projects, project]);

  const groups = useMemo(
    () => groupResources(library.data?.entries ?? []),
    [library.data?.entries],
  );
  const refreshAll = () => {
    library.refresh();
    authority.refresh();
    policy.refresh();
    inbox.refresh();
    ledger.refresh();
  };

  return (
    <section className="grid gap-5" aria-label="Governed resource library">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">Resource library</h2>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            Inspect every layer here. Canonical rule and hook edits stay locked until this direct
            local session is explicitly unlocked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={authority.data?.state === "unlocked" ? "success" : "outline"}>
            {authority.data?.state === "unlocked" ? <UnlockIcon /> : <LockIcon />}
            {authority.data?.state ?? "locked"}
          </Badge>
          {authority.data?.state === "unlocked" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await actions.relock();
                setAuthorityNotice(
                  result._tag === "Failure" ? commandFailureMessage(result) : null,
                );
                refreshAll();
              }}
            >
              Relock
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                const result = await actions.unlock();
                setAuthorityNotice(
                  result._tag === "Failure"
                    ? commandFailureMessage(result)
                    : result.value.state === "locked"
                      ? authorityReason(result.value.reason)
                      : null,
                );
                refreshAll();
              }}
            >
              <UnlockIcon />
              Unlock local session
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh resource library"
            onClick={refreshAll}
          >
            <RefreshCwIcon />
          </Button>
        </div>
      </div>

      {authorityNotice ? (
        <p
          role="status"
          className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
        >
          {authorityNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        {(["library", "review", "changes"] as const).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={view === id ? "secondary" : "ghost"}
            onClick={() => setView(id)}
          >
            {id === "library"
              ? "Library"
              : id === "review"
                ? `Review inbox${inbox.data?.items.length ? ` (${inbox.data.items.length})` : ""}`
                : `Changes${ledger.data?.receipts.length ? ` (${ledger.data.receipts.length})` : ""}`}
          </Button>
        ))}
        {view === "library" ? (
          <div className="ms-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={lens === "global" ? "secondary" : "ghost"}
              onClick={() => setLens("global")}
            >
              Global
            </Button>
            <Button
              size="sm"
              variant={lens === "effective" ? "secondary" : "ghost"}
              disabled={!project}
              onClick={() => setLens("effective")}
            >
              Effective project
            </Button>
            {library.data && library.data.projects.length > 0 ? (
              <select
                aria-label="Effective project"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={project}
                onChange={(event) => setProject(event.currentTarget.value)}
              >
                {library.data.projects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>

      {view === "library" ? (
        library.error ? (
          <WorkbenchEmptyState title="Resource library unavailable" description={library.error} />
        ) : library.isPending && library.data === null ? (
          <WorkbenchEmptyState
            title="Loading resources"
            description="Reading the selected environment…"
          />
        ) : groups.length === 0 ? (
          <WorkbenchEmptyState
            title="No resources found"
            description="The selected lens did not expose any governed resources."
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(24rem,1.2fr)]">
            <div className="grid content-start gap-4">
              {groups.map((group) => (
                <section key={group.label} className="grid gap-1">
                  <h3 className="px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  {group.items.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`grid gap-1 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === entry.id ? "border-primary/35 bg-primary/8" : "border-transparent hover:border-border/60 hover:bg-muted/32"}`}
                      onClick={() => setSelected(entry)}
                    >
                      <span className="flex items-center gap-2">
                        <FileCogIcon className="size-3.5 text-primary" />
                        <span className="font-medium text-sm">{entry.name}</span>
                        <Badge className="ms-auto" size="sm" variant="outline">
                          {entry.kind}
                        </Badge>
                      </span>
                      <span className="line-clamp-2 text-muted-foreground text-xs">
                        {entry.description || entry.relativePath || "No description"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {entry.scope} · {entry.effective} · {entry.provenance.sourceType}
                      </span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
            {target ? (
              <ResourceEditor
                key={`${target.sourceId}:${target.relativePath}`}
                environmentId={props.environmentId}
                entry={selected!}
                target={target}
                authorityState={authority.data?.state ?? "locked"}
                onChanged={refreshAll}
              />
            ) : selected ? (
              <div className="rounded-xl border border-border/60 bg-card p-5">
                <h3 className="font-semibold">{selected.name}</h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  {selected.description || "No description"}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {selected.relativePath ??
                    "This entry is projected from its owning catalog and is read-only here."}
                </p>
                <Badge className="mt-3" variant="outline">
                  Read-only in this surface
                </Badge>
              </div>
            ) : (
              <WorkbenchEmptyState
                title="Select a resource"
                description="Canonical source, provenance, and editing controls appear here."
              />
            )}
          </div>
        )
      ) : null}

      {view === "review" ? (
        inbox.error ? (
          <WorkbenchEmptyState title="Review inbox unavailable" description={inbox.error} />
        ) : inbox.isPending && inbox.data === null ? (
          <WorkbenchEmptyState
            title="Loading review inbox"
            description="Reading staged imports from the selected environment…"
          />
        ) : inbox.data?.items.length ? (
          <div className="grid gap-3">
            {inbox.data.items.map((item) => (
              <article key={item.id} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center gap-2">
                  <strong>{item.proposedKind}</strong>
                  <Badge variant="outline">{item.state}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground text-sm">
                  {item.source.type} · {item.source.locator}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.files.length} files · staged content remains inert until reviewed through
                  its canonical writer.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <WorkbenchEmptyState
            title="Review inbox is empty"
            description="Imported GitHub, ZIP, and Markdown candidates appear here before activation."
          />
        )
      ) : null}

      {view === "changes" ? (
        ledger.error ? (
          <WorkbenchEmptyState title="Change ledger unavailable" description={ledger.error} />
        ) : ledger.isPending && ledger.data === null ? (
          <WorkbenchEmptyState
            title="Loading canonical changes"
            description="Reading mutation receipts from the selected environment…"
          />
        ) : ledger.data?.receipts.length ? (
          <div className="grid gap-3">
            {ledger.data.receipts.toReversed().map((receipt) => (
              <article
                key={receipt.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card p-4"
              >
                <CheckCircle2Icon className="size-4 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{receipt.target.relativePath}</strong>
                  <p className="text-muted-foreground text-xs">
                    {receipt.status} · {receipt.mutationClass} · {receipt.appliedAt}
                  </p>
                </div>
                {receipt.undoAvailable && authority.data?.state === "unlocked" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const result = await actions.rollback({
                        requestId: randomUUID(),
                        receiptId: receipt.id,
                        expectedDigest: receipt.afterDigest,
                      });
                      setAuthorityNotice(
                        result._tag === "Failure" ? commandFailureMessage(result) : null,
                      );
                      refreshAll();
                    }}
                  >
                    <RotateCcwIcon />
                    Rollback
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <WorkbenchEmptyState
            title="No canonical changes"
            description="Applied changes and rollback receipts appear here."
          />
        )
      ) : null}

      <p className="text-muted-foreground text-xs">
        Mutation policy: {policy.data?.enabledThrough ?? "projection"}. Unlocks expire and are never
        persisted across sessions.
      </p>
    </section>
  );
}

function ResourceEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly entry: ResourceEntry;
  readonly target: WorkbenchResourceTarget;
  readonly authorityState: "locked" | "unlocked";
  readonly onChanged: () => void;
}) {
  const source = useWorkbenchResourceSource(props.environmentId, props.target);
  const actions = useWorkbenchResourceActions(props.environmentId);
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState<WorkbenchResourceMutationReview | null>(null);
  const [checkpoint, setCheckpoint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    if (source.data) setDraft(source.data.content);
  }, [source.data]);
  if (source.error)
    return <WorkbenchEmptyState title="Source unavailable" description={source.error} />;
  if (!source.data)
    return (
      <WorkbenchEmptyState
        title="Loading canonical source"
        description={props.target.relativePath}
      />
    );
  const prepare = async () => {
    setBusy(true);
    setActionError(null);
    const result = await actions.review({
      requestId: randomUUID(),
      operation: "upsert",
      target: props.target,
      content: draft,
    });
    setBusy(false);
    if (result._tag === "Success") setReview(result.value);
    else setActionError(commandFailureMessage(result));
  };
  const apply = async () => {
    if (!review) return;
    setBusy(true);
    setActionError(null);
    const result = await actions.apply(resourceApplyInput(review));
    setBusy(false);
    if (result._tag === "Success") {
      setReview(null);
      setCheckpoint(false);
      source.refresh();
      props.onChanged();
    } else setActionError(commandFailureMessage(result));
  };
  return (
    <div className="grid content-start gap-4 rounded-xl border border-border/60 bg-card p-4">
      <div>
        <h3 className="font-semibold">{props.entry.name}</h3>
        <p className="text-muted-foreground text-xs">{props.target.relativePath}</p>
      </div>
      <Textarea
        aria-label={`Edit ${props.entry.name}`}
        className="font-mono"
        rows={18}
        value={draft}
        disabled={props.authorityState !== "unlocked" || busy}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setReview(null);
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          disabled={busy || props.authorityState !== "unlocked" || draft === source.data.content}
          onClick={prepare}
        >
          Review exact diff
        </Button>
        {props.authorityState !== "unlocked" ? (
          <span className="text-muted-foreground text-xs">Unlock this local session to edit.</span>
        ) : null}
      </div>
      {actionError ? (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      ) : null}
      {review ? (
        <section className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <Badge variant={review.proposal.validator.valid ? "success" : "error"}>
              {review.proposal.validator.valid ? "Valid" : "Failed"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {review.proposal.validator.checks
                ?.map((check) => `${check.id}: ${check.state}`)
                .join(" · ")}
            </span>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
            {review.proposal.diff || "No changes"}
          </pre>
          {review.proposal.git.requiresCheckpoint ? (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={checkpoint}
                onChange={(event) => setCheckpoint(event.currentTarget.checked)}
              />
              <span>
                The canonical repository is dirty. I reviewed the preimage and want a guarded
                checkpoint before apply.
              </span>
            </label>
          ) : null}
          <Button
            disabled={
              busy ||
              !review.proposal.validator.valid ||
              (review.proposal.git.requiresCheckpoint && !checkpoint)
            }
            onClick={apply}
          >
            Apply reviewed change
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export function resourceApplyInput(
  review: WorkbenchResourceMutationReview,
): WorkbenchResourceApplyInput {
  return {
    proposalId: review.proposal.id,
    expectedRevision: review.proposal.revision,
    diffDigest: review.proposal.diffDigest,
    ...(review.proposal.git.requiresCheckpoint
      ? { checkpoint: review.proposal.git.statusDigest }
      : {}),
  };
}

export function authorityReason(reason: string | null): string {
  switch (reason) {
    case "remote_session":
      return "Canonical writes stay read-only for remote, relay, and tunnel connections.";
    case "administrative_scope_required":
      return "This session does not have administrative write access.";
    case "unlock_expired":
      return "The local write unlock expired. Unlock this session again to continue.";
    case "session_required":
      return "A current authenticated session is required to unlock canonical writes.";
    default:
      return "Canonical writes remain locked until a direct local administrative session unlocks them.";
  }
}

function commandFailureMessage(result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message
    : "The resource operation failed.";
}

function resourceTarget(entry: ResourceEntry): WorkbenchResourceTarget {
  return {
    kind: entry.kind as "rule" | "hook",
    sourceId: entry.provenance.sourceId,
    relativePath: entry.relativePath!,
    ...(entry.project === null ? {} : { project: entry.project }),
  };
}

function groupResources(entries: ReadonlyArray<ResourceEntry>) {
  const groups = new Map<string, ResourceEntry[]>();
  for (const entry of entries) {
    const label = `${entry.category || "Resources"} / ${entry.group || entry.kind}`;
    const items = groups.get(label) ?? [];
    items.push(entry);
    groups.set(label, items);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
