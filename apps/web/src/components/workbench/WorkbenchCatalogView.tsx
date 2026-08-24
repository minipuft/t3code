import type {
  EnvironmentId,
  WorkflowCatalogItem,
  WorkflowCatalogList,
  WorkflowCatalogItemId,
  WorkflowPromptSummary,
  WorkflowSkillSummary,
} from "@t3tools/contracts";
import { CheckIcon, CopyIcon, RefreshCwIcon, BlocksIcon, BracesIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { useWorkflowCatalog, useWorkflowCatalogDetail } from "../../state/workflowCatalog";
import { projectWorkbenchCatalog, retainWorkbenchSelection } from "../../workbenchCatalog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";

export function WorkbenchCatalogPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly module: "prompts" | "skills";
}) {
  const catalog = useWorkflowCatalog(props.environmentId);
  return (
    <WorkbenchCatalogView
      data={catalog.data}
      error={catalog.error}
      isPending={catalog.isPending}
      module={props.module}
      onRefresh={catalog.refresh}
      environmentId={props.environmentId}
    />
  );
}

export function WorkbenchCatalogView(props: {
  readonly data: WorkflowCatalogList | null;
  readonly error: string | null;
  readonly environmentId?: EnvironmentId;
  readonly initialSelectedItemId?: string;
  readonly isPending: boolean;
  readonly module: "prompts" | "skills";
  readonly onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    props.initialSelectedItemId ?? null,
  );
  const items = useMemo(
    () =>
      projectWorkbenchCatalog({
        items: props.data?.items ?? [],
        module: props.module,
        query,
      }),
    [props.data?.items, props.module, query],
  );
  const usableSelectionId = retainWorkbenchSelection(selectedItemId, items);
  const selectedItem = items.find((item) => item.id === usableSelectionId) ?? null;
  const capability = props.data?.capability ?? null;
  const capabilityMessage =
    props.error ??
    (capability?.status === "available"
      ? null
      : (capability?.reason ?? "The configured prompt catalog is not available."));
  const title = props.module === "prompts" ? "Prompts" : "Skills";

  return (
    <section className="grid min-h-[28rem] gap-5" aria-label={`${title} library`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {props.module === "prompts"
              ? "Inspect workflow inputs before inserting an action from the composer."
              : "Discover provider skills and copy their $ invocation when needed."}
          </p>
        </div>
        <Input
          nativeInput
          type="search"
          value={query}
          className="sm:w-72"
          aria-label={`Search ${title}`}
          placeholder={`Search ${title.toLowerCase()}`}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {capabilityMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/24 px-4 py-3 text-muted-foreground text-sm">
          <span>{capabilityMessage}</span>
          <Button size="xs" variant="ghost" onClick={props.onRefresh}>
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      ) : null}

      {props.isPending && props.data === null ? (
        <WorkbenchEmptyState title={`Loading ${title}`} description="Reading this environment…" />
      ) : items.length === 0 ? (
        <WorkbenchEmptyState
          title={
            query.trim() ? `No matching ${title.toLowerCase()}` : `No ${title.toLowerCase()} found`
          }
          description={
            query.trim()
              ? "Try a name, description, provider, category, or scope."
              : capabilityMessage
                ? "Other catalog item types may remain available."
                : `This environment did not report any ${title.toLowerCase()}.`
          }
        />
      ) : (
        <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(20rem,1.2fr)]">
          <div className="grid content-start gap-1">
            {items.map((item) => (
              <CatalogRow
                key={item.id}
                item={item}
                selected={item.id === usableSelectionId}
                onSelect={() => setSelectedItemId(item.id)}
              />
            ))}
          </div>
          <div className="min-h-64">
            {selectedItem ? (
              <CatalogDetail
                item={selectedItem}
                {...(props.environmentId === undefined
                  ? {}
                  : { environmentId: props.environmentId })}
              />
            ) : (
              <WorkbenchEmptyState
                title={`Select a ${props.module === "prompts" ? "prompt" : "skill"}`}
                description="Details and a copyable invocation appear here."
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CatalogRow(props: {
  readonly item: WorkflowCatalogItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={cn(
        "grid min-w-0 gap-1 rounded-xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        props.selected
          ? "border-primary/35 bg-primary/8"
          : "border-transparent hover:border-border/60 hover:bg-muted/32",
      )}
      onClick={props.onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        {props.item.kind === "prompt" ? (
          <BracesIcon className="size-4 shrink-0 text-primary" />
        ) : (
          <BlocksIcon className="size-4 shrink-0 text-primary" />
        )}
        <span className="truncate font-medium text-sm">{props.item.name}</span>
      </span>
      <span className="line-clamp-2 text-muted-foreground text-xs leading-5">
        {props.item.description ?? "No description"}
      </span>
    </button>
  );
}

function CatalogDetail(props: {
  readonly item: WorkflowCatalogItem;
  readonly environmentId?: EnvironmentId;
}) {
  const { item } = props;
  const invocation = item.kind === "prompt" ? `>>${item.id}` : `$${item.name}`;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyInvocation = async () => {
    try {
      await navigator.clipboard.writeText(invocation);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1_500);
  };

  return (
    <article className="grid gap-5 rounded-2xl border border-border/60 bg-card p-5 shadow-xs/5">
      <div className="grid gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {item.kind}
        </span>
        <h3 className="font-semibold text-lg">{item.name}</h3>
        <p className="text-muted-foreground text-sm leading-6">
          {item.description ?? "No description provided."}
        </p>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-muted/24 p-2 pl-3">
        <code className="min-w-0 flex-1 truncate text-xs">{invocation}</code>
        <Button size="xs" variant="ghost" onClick={() => void copyInvocation()}>
          {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
        </Button>
      </div>

      {item.kind === "prompt" ? (
        <div className="grid gap-4">
          <PromptMetadata prompt={item} />
          {props.environmentId === undefined ? (
            <p className="rounded-lg bg-muted/32 px-3 py-2 text-muted-foreground text-xs">
              Connect this view to an environment to load protected prompt template content.
            </p>
          ) : (
            <PromptTemplateDetail environmentId={props.environmentId} itemId={item.id} />
          )}
        </div>
      ) : (
        <SkillMetadata skill={item} />
      )}
    </article>
  );
}

function PromptMetadata({ prompt }: { readonly prompt: WorkflowPromptSummary }) {
  return (
    <div className="grid gap-4">
      <MetadataGrid
        rows={[
          ["Category", prompt.category],
          ["Execution", prompt.executionType],
          ["Composer mapping", prompt.composerInputArgument ?? "None"],
          ["Providers", prompt.providers.length > 0 ? prompt.providers.join(", ") : "Any"],
          ["Revision", prompt.revision],
        ]}
      />
      <section className="grid gap-2">
        <h4 className="font-medium text-xs">Arguments</h4>
        {prompt.arguments.length === 0 ? (
          <p className="text-muted-foreground text-xs">No declared arguments.</p>
        ) : (
          <div className="grid gap-2">
            {prompt.arguments.map((argument) => (
              <div key={argument.name} className="rounded-lg border border-border/50 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="text-xs">{argument.name}</code>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {argument.type} · {argument.required ? "required" : "optional"}
                  </span>
                </div>
                {argument.description ? (
                  <p className="mt-1 text-muted-foreground text-xs">{argument.description}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PromptTemplateDetail(props: {
  readonly environmentId: EnvironmentId;
  readonly itemId: WorkflowCatalogItemId;
}) {
  const detail = useWorkflowCatalogDetail(props.environmentId, props.itemId);

  if (detail.isPending && detail.data === null) {
    return (
      <p className="rounded-lg bg-muted/32 px-3 py-2 text-muted-foreground text-xs">
        Loading protected prompt content…
      </p>
    );
  }
  if (detail.error !== null) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/32 px-3 py-2 text-muted-foreground text-xs">
        <span>{detail.error}</span>
        <Button size="xs" variant="ghost" onClick={detail.refresh}>
          <RefreshCwIcon />
          Retry
        </Button>
      </div>
    );
  }
  if (detail.data === null || !("summary" in detail.data)) return null;

  return (
    <div className="grid gap-4">
      <PromptContentSection
        label="User message template"
        content={detail.data.userMessageTemplate}
      />
      <PromptContentSection
        label="System message"
        content={detail.data.systemMessage ?? "No system message."}
      />
    </div>
  );
}

function PromptContentSection(props: { readonly label: string; readonly content: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1_500);
  };

  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-xs">{props.label}</h4>
        <Button size="xs" variant="ghost" onClick={() => void copy()}>
          {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/24 p-3 font-mono text-xs leading-5">
        {props.content}
      </pre>
    </section>
  );
}

function SkillMetadata({ skill }: { readonly skill: WorkflowSkillSummary }) {
  return (
    <MetadataGrid
      rows={[
        ["Scope", skill.scope ?? "Not reported"],
        ["Source", skill.sourcePath ?? "Not reported"],
        ["Providers", skill.providers.length > 0 ? skill.providers.join(", ") : "Not reported"],
      ]}
    />
  );
}

function MetadataGrid({ rows }: { readonly rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
