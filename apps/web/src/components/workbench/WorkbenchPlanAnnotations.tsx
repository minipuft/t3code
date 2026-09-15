import type { WorkbenchPlanAnnotation, WorkbenchPlanPath } from "@t3tools/contracts";
import { CheckIcon, CopyIcon, MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { type RefObject, useState } from "react";

import type { useWorkbenchPlanActions } from "../../state/workbenchPlans";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export function markdownHeadingBefore(text: string, offset: number): string {
  const lines = text.slice(0, Math.max(0, offset)).split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const heading = /^#{1,6}\s+(.+)$/.exec(lines[index] ?? "")?.[1]?.trim();
    if (heading) return heading;
  }
  return "";
}

/**
 * Annotation authoring and resolution for one plan. The editor owns the draft and the textarea, so
 * both arrive as props: a new note quotes the live selection, anchored to the heading above it.
 */
export function AnnotationsPanel(props: {
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
