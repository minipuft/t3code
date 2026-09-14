import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  WorkbenchProjectionReceipt,
  WorkbenchProjectionReview,
  WorkbenchReviewInboxCommand,
} from "@t3tools/contracts";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { useWorkbenchAuditActions, useWorkbenchReviewInbox } from "../../state/workbenchResources";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";

type ReviewState = WorkbenchProjectionReview & {
  readonly receipt?: WorkbenchProjectionReceipt;
};

export function WorkbenchAuditPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly directLocal: boolean;
  readonly embedded?: boolean;
  readonly onOpenChanges?: () => void;
}) {
  const inbox = useWorkbenchReviewInbox(props.environmentId);
  const actions = useWorkbenchAuditActions(props.environmentId);
  const [message, setMessage] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const [filter, setFilter] = useState<"attention" | "current" | "all">("attention");
  const findings = (inbox.data?.items ?? []).filter((item) => item.audit !== undefined);
  const filteredFindings = findings.filter((item) => {
    const state = item.audit!.state;
    if (filter === "all") return true;
    const current = state === "current" || state === "resolved";
    return filter === "current" ? current : !current;
  });

  const settle = async (effect: Promise<AtomCommandResult<unknown, unknown>>) => {
    const result = await effect;
    if (result._tag === "Failure") {
      setMessage(commandFailureMessage(result));
      return false;
    }
    inbox.refresh();
    setMessage(null);
    return true;
  };

  const reviewRepair = async (identity: string) => {
    if (!props.directLocal) {
      setMessage("Projection repair is unavailable for remote, relay, or tunnel connections.");
      return;
    }
    const result = await actions.review({
      requestId: `t3-audit-${identity}-${Date.now()}`,
    });
    if (result._tag === "Failure") {
      setMessage(commandFailureMessage(result));
      return;
    }
    setReviews((current) => ({ ...current, [identity]: result.value }));
    setMessage(null);
  };

  const applyRepair = async (identity: string, review: ReviewState) => {
    const result = await actions.apply({
      reviewId: review.id,
      diffDigest: review.diffDigest,
    });
    if (result._tag === "Failure") {
      setMessage(commandFailureMessage(result));
      return;
    }
    setReviews((current) => ({
      ...current,
      [identity]: { ...review, receipt: result.value },
    }));
    setMessage("Projection repair applied. A rollback receipt is available below.");
    inbox.refresh();
  };

  const rollbackRepair = async (identity: string, review: ReviewState) => {
    if (review.receipt === undefined) return;
    const result = await actions.rollback({
      requestId: `rollback-${review.receipt.id}`,
      receiptId: review.receipt.id,
    });
    if (result._tag === "Failure") {
      setMessage(commandFailureMessage(result));
      return;
    }
    setReviews((current) => ({ ...current, [identity]: { ...review, receipt: result.value } }));
    setMessage("Projection repair rolled back.");
    inbox.refresh();
  };

  return (
    <section className="grid gap-4" aria-label="Projection health">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={props.embedded ? "font-semibold" : "font-semibold text-xl"}>
            Projection health
          </h2>
          <p className="text-muted-foreground text-sm">
            Per-environment source and target health. Repairs require review.
          </p>
          {!props.directLocal ? (
            <p className="text-amber-600 text-sm">
              Remote read-only: mutations require a direct local administrative connection.
            </p>
          ) : null}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh projection health"
          onClick={inbox.refresh}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {message ? (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Projection health filter">
        {(["attention", "current", "all"] as const).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={filter === id ? "secondary" : "ghost"}
            onClick={() => setFilter(id)}
          >
            {id === "attention" ? "Needs attention" : id === "current" ? "Current" : "All"}
          </Button>
        ))}
      </div>

      {inbox.error !== null ? (
        <WorkbenchEmptyState title="Provider audit unavailable" description={inbox.error} />
      ) : inbox.isPending && inbox.data === null ? (
        <p className="text-muted-foreground">Reading provider audit state…</p>
      ) : filteredFindings.length === 0 ? (
        <p className="text-muted-foreground">No projection health findings for this filter.</p>
      ) : (
        <div className="grid gap-2">
          {filteredFindings.map((item) => {
            const audit = item.audit!;
            const review = reviews[audit.identity];
            const repairable = audit.state === "stale" || audit.state === "reopened";
            const lifecycleOperation: WorkbenchReviewInboxCommand["op"] =
              audit.state === "dismissed" ? "restore" : "dismiss";

            return (
              <article key={audit.identity} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <strong>{audit.family}</strong>
                  <Badge
                    variant={
                      audit.state === "current" || audit.state === "resolved"
                        ? "success"
                        : "outline"
                    }
                  >
                    {audit.state}
                  </Badge>
                </div>
                <p className="text-sm">{audit.reason}</p>
                <ul className="text-muted-foreground text-xs">
                  {audit.evidence.map((evidence) => (
                    <li key={`${evidence.kind}:${evidence.locator}`}>
                      {evidence.kind}: {evidence.locator} · {evidence.detail}
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex flex-wrap gap-2">
                  {repairable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!props.directLocal}
                      onClick={() => void reviewRepair(audit.identity)}
                    >
                      Review repair
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      No repair available for {audit.state} findings.
                    </span>
                  )}
                  {audit.state !== "current" && audit.state !== "resolved" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!props.directLocal}
                      onClick={() =>
                        void settle(
                          actions.command({
                            id: item.id,
                            op: lifecycleOperation,
                            ...(inbox.data?.revision === undefined
                              ? {}
                              : { expectedRevision: inbox.data.revision }),
                          }),
                        )
                      }
                    >
                      {audit.state === "dismissed" ? "Restore" : "Dismiss"}
                    </Button>
                  ) : null}
                </div>

                {review ? (
                  <section className="mt-3 grid gap-2" aria-label={`Review ${audit.family} repair`}>
                    <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                      {review.diff || "Projection is already current."}
                    </pre>
                    {review.state === "prepared" && review.receipt === undefined ? (
                      <Button
                        size="sm"
                        disabled={!props.directLocal}
                        onClick={() => void applyRepair(audit.identity, review)}
                      >
                        Apply reviewed repair
                      </Button>
                    ) : null}
                    {review.receipt?.undoAvailable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!props.directLocal || review.receipt.status === "rolled-back"}
                        onClick={() => void rollbackRepair(audit.identity, review)}
                      >
                        {review.receipt.status === "rolled-back"
                          ? "Repair rolled back"
                          : "Rollback receipt"}
                      </Button>
                    ) : null}
                    {review.receipt?.undoAvailable && props.onOpenChanges ? (
                      <Button size="sm" variant="outline" onClick={props.onOpenChanges}>
                        Open changes &amp; rollback
                      </Button>
                    ) : null}
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function commandFailureMessage(result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message
    : "The audit operation failed.";
}
