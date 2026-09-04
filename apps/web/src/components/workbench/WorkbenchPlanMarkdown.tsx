import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { AlertTriangleIcon, Code2Icon, EyeIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export type WorkbenchMarkdownSegment =
  | { readonly kind: "markdown"; readonly offset: number; readonly text: string }
  | { readonly kind: "mermaid"; readonly offset: number; readonly text: string };

const MERMAID_FENCE = /^```mermaid(?:[^\S\r\n]+[^\r\n]*)?\r?\n([\s\S]*?)^```[^\S\r\n]*$/gim;

export function splitWorkbenchMarkdown(text: string): ReadonlyArray<WorkbenchMarkdownSegment> {
  const segments: WorkbenchMarkdownSegment[] = [];
  let offset = 0;
  for (const match of text.matchAll(MERMAID_FENCE)) {
    const index = match.index;
    if (index > offset) {
      segments.push({ kind: "markdown", offset, text: text.slice(offset, index) });
    }
    segments.push({ kind: "mermaid", offset: index, text: match[1]?.trim() ?? "" });
    offset = index + match[0].length;
  }
  if (offset < text.length) segments.push({ kind: "markdown", offset, text: text.slice(offset) });
  return segments.length > 0 ? segments : [{ kind: "markdown", offset: 0, text }];
}

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidLoader ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidLoader;
}

type MermaidRenderState =
  | { readonly tag: "loading" }
  | { readonly tag: "ready"; readonly svg: string }
  | { readonly tag: "error" };

function MermaidDiagram(props: { readonly source: string }) {
  const reactId = useId();
  const [attempt, setAttempt] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [state, setState] = useState<MermaidRenderState>({ tag: "loading" });

  useEffect(() => {
    let active = true;
    setState({ tag: "loading" });
    const renderId = `workbench-mermaid-${reactId.replaceAll(":", "")}-${attempt}`;
    void loadMermaid()
      .then((mermaid) => mermaid.render(renderId, props.source))
      .then(({ svg }) => {
        if (active) setState({ tag: "ready", svg });
      })
      .catch(() => {
        if (!active) return;
        setState({ tag: "error" });
      });
    return () => {
      active = false;
    };
  }, [attempt, props.source, reactId]);

  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-border/70 bg-muted/18">
      <figcaption className="flex min-h-9 items-center justify-between gap-2 border-b border-border/60 px-3 text-muted-foreground text-xs">
        <span>Mermaid diagram</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-pressed={showSource}
          onClick={() => setShowSource((current) => !current)}
        >
          {showSource ? <EyeIcon /> : <Code2Icon />}
          {showSource ? "Show diagram" : "Show source"}
        </Button>
      </figcaption>
      {showSource ? (
        <pre className="m-0 overflow-x-auto p-4 text-xs leading-relaxed">
          <code>{props.source}</code>
        </pre>
      ) : state.tag === "loading" ? (
        <div className="flex min-h-40 items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
          <RefreshCwIcon className="size-4 animate-spin" /> Rendering diagram…
        </div>
      ) : state.tag === "error" ? (
        <div className="grid gap-3 p-4">
          <p className="flex items-start gap-2 text-destructive text-sm" role="alert">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>This diagram could not be rendered. Its source is shown below.</span>
          </p>
          <pre className="m-0 overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
            <code>{props.source}</code>
          </pre>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCwIcon /> Retry diagram
          </Button>
        </div>
      ) : (
        <div
          className="flex min-h-40 justify-center overflow-x-auto p-4 [&_svg]:h-auto [&_svg]:max-w-full"
          role="img"
          aria-label="Mermaid diagram"
          // Mermaid's strict security mode sanitizes labels and disables executable links.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
    </figure>
  );
}

export function WorkbenchPlanMarkdown(props: {
  readonly text: string;
  readonly cwd?: string;
  readonly environmentId?: EnvironmentId;
  readonly threadRef?: ScopedThreadRef;
  readonly className?: string;
}) {
  const segments = splitWorkbenchMarkdown(props.text);
  return (
    <div className={cn("min-w-0", props.className)} data-workbench-plan-markdown>
      {segments.map((segment) =>
        segment.kind === "mermaid" ? (
          <MermaidDiagram key={`mermaid:${segment.offset}`} source={segment.text} />
        ) : (
          <ChatMarkdown
            key={`markdown:${segment.offset}`}
            text={segment.text}
            cwd={props.cwd}
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            parseRawHtml
          />
        ),
      )}
    </div>
  );
}
