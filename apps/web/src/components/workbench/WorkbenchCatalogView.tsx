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
import { WorkbenchPromptGovernance } from "./WorkbenchPromptGovernance";

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
  readonly onInsertInvocation?: (invocation: string) => void;
  readonly variant?: "page" | "compact";
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
  const groups = useMemo(() => groupCatalogItems(items), [items]);
  const capability = props.data?.capability ?? null;
  const capabilityMessage =
    props.error ??
    (capability?.status === "available"
      ? null
      : (capability?.reason ?? "The configured prompt catalog is not available."));
  const compact = props.variant === "compact";
  const title = props.module === "prompts" ? (compact ? "Actions" : "Prompts") : "Skills";

  return (
    <section
      className={cn("grid gap-5", compact ? "content-start" : "min-h-[28rem]")}
      aria-label={`${title} library`}
    >
      <div className={cn("flex flex-col gap-3", !compact && "sm:flex-row sm:items-end")}>
        <div className="min-w-0 flex-1">
          <h2 className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-xl")}>
            {title}
          </h2>
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
          className={compact ? "w-full" : "sm:w-72"}
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
        <div
          className={cn(
            "grid min-h-0 gap-5",
            compact
              ? "grid-rows-[minmax(8rem,auto)_auto]"
              : "lg:grid-cols-[minmax(15rem,0.8fr)_minmax(20rem,1.2fr)]",
          )}
        >
          <div
            className={cn("grid content-start gap-3", compact && "max-h-72 overflow-y-auto pr-1")}
          >
            {groups.map((group) => (
              <section key={group.label} className="grid gap-1" aria-label={group.label}>
                <h3 className="px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
                {group.items.map((item) => (
                  <CatalogRow
                    key={item.id}
                    item={item}
                    selected={item.id === usableSelectionId}
                    compact={compact}
                    onSelect={() => setSelectedItemId(item.id)}
                  />
                ))}
              </section>
            ))}
          </div>
          <div className="min-h-64">
            {selectedItem ? (
              <CatalogDetail
                item={selectedItem}
                {...(props.environmentId === undefined
                  ? {}
                  : { environmentId: props.environmentId })}
                {...(props.onInsertInvocation === undefined
                  ? {}
                  : { onInsertInvocation: props.onInsertInvocation })}
                compact={compact}
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

export function groupCatalogItems(
  items: ReadonlyArray<WorkflowCatalogItem>,
): ReadonlyArray<{ readonly label: string; readonly items: ReadonlyArray<WorkflowCatalogItem> }> {
  const groups = new Map<string, WorkflowCatalogItem[]>();
  for (const item of items) {
    const label = item.kind === "prompt" ? item.category : (item.scope ?? "Unscoped");
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return [...groups].map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

function CatalogRow(props: {
  readonly item: WorkflowCatalogItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={cn(
        "grid min-w-0 gap-1 border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        props.compact ? "rounded-lg px-3 py-2" : "rounded-xl px-4 py-3",
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
  readonly onInsertInvocation?: (invocation: string) => void;
  readonly compact?: boolean;
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
    <article
      className={cn(
        "grid border border-border/60 bg-card shadow-xs/5",
        props.compact ? "gap-4 rounded-xl p-4" : "gap-5 rounded-2xl p-5",
      )}
    >
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
        {props.onInsertInvocation ? (
          <Button size="xs" onClick={() => props.onInsertInvocation?.(invocation)}>
            Insert
          </Button>
        ) : null}
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
    <WorkbenchPromptGovernance
      key={detail.data.summary.revision}
      environmentId={props.environmentId}
      itemId={props.itemId}
      currentVersion={detail.data.currentVersion}
      userMessageTemplate={detail.data.userMessageTemplate}
      systemMessage={detail.data.systemMessage}
      onChanged={() => {
        detail.refresh();
      }}
    />
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
