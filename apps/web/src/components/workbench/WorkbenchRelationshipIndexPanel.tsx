import type {
  EnvironmentId,
  WorkbenchRelationshipReviewInput,
  WorkbenchResourceMutationReview,
  WorkbenchTopology,
} from "@t3tools/contracts";
import { useRef, useState } from "react";

import { randomUUID } from "../../lib/utils";
import { useWorkbenchRelationshipIndex } from "../../state/workbenchPlans";
import { useWorkbenchResourceActions } from "../../state/workbenchResources";
import { Button } from "../ui/button";
import { commandFailureMessage } from "./WorkbenchCommandFailure";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { resourceApplyInput } from "./WorkbenchResourceMutation";

export function WorkbenchRelationshipIndexPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly directLocal: boolean;
  readonly onOpenChanges: () => void;
}) {
  const { data, error, isPending, refresh, review } = useWorkbenchRelationshipIndex(
    props.environmentId,
  );
  const actions = useWorkbenchResourceActions(props.environmentId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mutationReview, setMutationReview] = useState<WorkbenchResourceMutationReview | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkpoint, setCheckpoint] = useState(false);

  if (error)
    return <WorkbenchEmptyState title="Relationship index unavailable" description={error} />;
  if (isPending && data === null)
    return (
      <WorkbenchEmptyState
        title="Loading relationship index…"
        description="Reading relationship evidence."
      />
    );
  if (data === null)
    return (
      <WorkbenchEmptyState
        title="Relationship index unavailable"
        description="No relationship index response was returned."
      />
    );
  if (!hasRelationshipEdges(data))
    return (
      <WorkbenchEmptyState
        title="No relationship index"
        description="Approved or proposed relationships appear from their resource or project context."
      />
    );

  const prepare = async (input: WorkbenchRelationshipReviewInput) => {
    setBusy(true);
    setNotice(null);
    const result = await review(input);
    setBusy(false);
    if (result._tag === "Success") {
      setMutationReview(result.value);
      setCheckpoint(false);
      return;
    }
    setNotice(commandFailureMessage(result, "The relationship operation failed."));
  };

  const apply = async () => {
    if (mutationReview === null) return;
    setBusy(true);
    setNotice(null);
    const result = await actions.apply(resourceApplyInput(mutationReview));
    setBusy(false);
    if (result._tag === "Success") {
      setMutationReview(null);
      setCheckpoint(false);
      setNotice("Relationship approved. Its rollback receipt is available in System → Changes.");
      refresh();
      return;
    }
    setNotice(commandFailureMessage(result, "The relationship operation failed."));
  };

  return (
    <RelationshipIndexCards
      relationshipIndex={data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onRefresh={refresh}
      directLocal={props.directLocal}
      busy={busy}
      mutationReview={mutationReview}
      checkpoint={checkpoint}
      notice={notice}
      onCheckpoint={setCheckpoint}
      onReview={(edge) =>
        void prepare({
          requestId: randomUUID(),
          relation: { kind: edge.kind, source: edge.source, target: edge.target },
          evidence: edge.evidence,
        })
      }
      onApply={() => void apply()}
      onOpenChanges={props.onOpenChanges}
    />
  );
}

/** Contextual relationship affordance for System resources; node-only inventories stay hidden. */
export function WorkbenchRelationshipSummary(props: {
  readonly environmentId: EnvironmentId;
  readonly directLocal: boolean;
  readonly subjectLabel: string;
  readonly candidateIds: readonly string[];
  readonly onOpenChanges: () => void;
}) {
  const { data, error, isPending } = useWorkbenchRelationshipIndex(props.environmentId);
  const [showIndex, setShowIndex] = useState(false);
  if (error || (isPending && data === null) || data === null || !hasRelationshipEdges(data))
    return null;

  const selected = findRelationshipNode(data, props.candidateIds);
  const relationships = selected
    ? allRelationshipEdges(data).filter(
        (edge) => edge.source === selected.id || edge.target === selected.id,
      )
    : [];
  if (!selected || relationships.length === 0) return null;

  return (
    <section
      className="mt-5 grid gap-2 border-t border-border/60 pt-4"
      aria-label="Relationship summary"
    >
      <div>
        <h4 className="font-semibold text-sm">Relationships</h4>
        <p className="text-muted-foreground text-xs">
          {props.subjectLabel} · {relationships.length} approved or proposed
        </p>
      </div>
      <RelationshipList title="Connected relationships" items={relationships} />
      <Button
        size="sm"
        variant="outline"
        aria-expanded={showIndex}
        onClick={() => setShowIndex((current) => !current)}
      >
        {showIndex ? "Close Relationship Index" : "Open Relationship Index"}
      </Button>
      {!props.directLocal ? (
        <p className="text-muted-foreground text-xs">
          Relationship review remains read-only for remote connections.
        </p>
      ) : null}
      {showIndex ? (
        <WorkbenchRelationshipIndexPanel
          environmentId={props.environmentId}
          directLocal={props.directLocal}
          onOpenChanges={props.onOpenChanges}
        />
      ) : null}
    </section>
  );
}

type ProposedEdge = WorkbenchTopology["proposed"][number];

export function RelationshipIndexCards(props: {
  readonly relationshipIndex: WorkbenchTopology;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onRefresh: () => void;
  readonly directLocal: boolean;
  readonly busy: boolean;
  readonly mutationReview: WorkbenchResourceMutationReview | null;
  readonly checkpoint: boolean;
  readonly notice: string | null;
  readonly onCheckpoint: (checked: boolean) => void;
  readonly onReview: (edge: ProposedEdge) => void;
  readonly onApply: () => void;
  readonly onOpenChanges: () => void;
}) {
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected =
    props.relationshipIndex.nodes.find((node) => node.id === props.selectedId) ??
    props.relationshipIndex.nodes[0];
  const proposed = selected
    ? props.relationshipIndex.proposed.filter(
        (edge) => edge.source === selected.id || edge.target === selected.id,
      )
    : [];

  const moveFocus = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = nextRelationshipNodeIndex(
      currentIndex,
      direction,
      props.relationshipIndex.nodes.length,
    );
    const node = props.relationshipIndex.nodes[nextIndex];
    if (node === undefined) return;
    props.onSelect(node.id);
    nodeRefs.current[nextIndex]?.focus();
  };

  return (
    <section aria-labelledby="workbench-topology-heading" className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="workbench-topology-heading" className="text-sm font-semibold">
              Relationship Index
            </h2>
            <Button size="sm" variant="ghost" onClick={props.onRefresh}>
              Refresh
            </Button>
          </div>
          <ul aria-label="Relationship index nodes" className="space-y-1">
            {props.relationshipIndex.nodes.map((node, index) => (
              <li key={node.id}>
                <button
                  ref={(element) => {
                    nodeRefs.current[index] = element;
                  }}
                  type="button"
                  tabIndex={selected?.id === node.id ? 0 : -1}
                  className={`w-full rounded px-2 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === node.id ? "bg-primary/12" : "hover:bg-accent"}`}
                  aria-current={selected?.id === node.id ? "true" : undefined}
                  onClick={() => props.onSelect(node.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    moveFocus(index, event.key === "ArrowDown" ? 1 : -1);
                  }}
                >
                  {node.label}
                  <span className="ml-2 text-xs text-muted-foreground">{node.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          {!props.directLocal ? (
            <p className="rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Read-only: relationship approval and rollback require a direct local administrative
              session.
            </p>
          ) : null}
          {selected ? (
            <>
              <div>
                <h3 className="font-semibold">{selected.label}</h3>
                <p className="text-xs text-muted-foreground">
                  {selected.kind} · {selected.provenance ?? "provenance unavailable"}
                </p>
              </div>
              <RelationshipList
                title="Approved relationships"
                items={props.relationshipIndex.approved.filter(
                  (edge) => edge.source === selected.id || edge.target === selected.id,
                )}
              />
              <RelationshipList title="Proposed relationships" items={proposed} />
              {proposed.map((edge) => (
                <Button
                  key={edge.id}
                  size="sm"
                  disabled={!props.directLocal || props.busy}
                  onClick={() => props.onReview(edge)}
                >
                  Review relationship
                </Button>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No nodes reported.</p>
          )}
        </div>
      </div>

      {props.notice ? (
        <p
          role="status"
          className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
        >
          {props.notice}
        </p>
      ) : null}

      {props.mutationReview ? (
        <section
          aria-label="Relationship mutation review"
          className="grid gap-3 rounded-lg border border-border/60 bg-card p-4"
        >
          <h3 className="font-semibold">Review exact workspace diff</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
            {props.mutationReview.proposal.diff || "No changes"}
          </pre>
          {props.mutationReview.proposal.git.requiresCheckpoint ? (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={props.checkpoint}
                onChange={(event) => props.onCheckpoint(event.currentTarget.checked)}
              />
              <span>I reviewed the preimage and want a guarded checkpoint before apply.</span>
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                props.busy ||
                !props.mutationReview.proposal.validator.valid ||
                (props.mutationReview.proposal.git.requiresCheckpoint && !props.checkpoint)
              }
              onClick={props.onApply}
            >
              Apply reviewed relationship
            </Button>
            <Button variant="outline" onClick={props.onOpenChanges}>
              Open changes &amp; rollback
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function hasRelationshipEdges(topology: WorkbenchTopology) {
  return topology.approved.length > 0 || topology.proposed.length > 0;
}

function allRelationshipEdges(topology: WorkbenchTopology) {
  return [...topology.approved, ...topology.proposed];
}

function findRelationshipNode(topology: WorkbenchTopology, candidateIds: readonly string[]) {
  return topology.nodes.find(
    (node) =>
      candidateIds.includes(node.id) ||
      candidateIds.includes(node.label) ||
      (node.provenance !== null && candidateIds.includes(node.provenance)),
  );
}

export function nextRelationshipNodeIndex(current: number, direction: -1 | 1, count: number) {
  if (count <= 0) return -1;
  return (current + direction + count) % count;
}

function RelationshipList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly source: string;
    readonly target: string;
  }>;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded bg-muted/40 px-2 py-1">
              {item.source} → {item.target}{" "}
              <span className="text-xs text-muted-foreground">({item.kind})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
