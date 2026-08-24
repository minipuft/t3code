import type {
  WorkflowCatalogItem,
  WorkflowCatalogItemId,
  WorkflowCatalogList,
} from "@t3tools/contracts";
import { BlocksIcon, BracesIcon, PinIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import {
  searchWorkflowCatalog,
  type WorkflowLibraryProjection,
  type WorkflowPresetAction,
} from "../../workflowInvocation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type WorkflowListKeyAction =
  | { readonly type: "highlight"; readonly itemId: WorkflowCatalogItemId }
  | { readonly type: "open"; readonly itemId: WorkflowCatalogItemId }
  | { readonly type: "submit"; readonly itemId: WorkflowCatalogItemId }
  | { readonly type: "close" }
  | { readonly type: "consume" }
  | null;

export function resolveWorkflowListKey(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly itemIds: ReadonlyArray<WorkflowCatalogItemId>;
  readonly highlightedItemId: WorkflowCatalogItemId | null;
}): WorkflowListKeyAction {
  if (input.key === "Escape") return { type: "close" };
  const selectedId =
    input.highlightedItemId !== null && input.itemIds.includes(input.highlightedItemId)
      ? input.highlightedItemId
      : (input.itemIds[0] ?? null);
  if (input.key === "Enter") {
    if (selectedId === null) return { type: "consume" };
    return input.shiftKey
      ? { type: "submit", itemId: selectedId }
      : { type: "open", itemId: selectedId };
  }
  if (input.key !== "ArrowDown" && input.key !== "ArrowUp") return null;
  if (input.itemIds.length === 0) return { type: "consume" };
  const currentIndex = selectedId === null ? -1 : input.itemIds.indexOf(selectedId);
  const direction = input.key === "ArrowDown" ? 1 : -1;
  const fallbackIndex = direction === 1 ? -1 : 0;
  const nextIndex =
    ((currentIndex >= 0 ? currentIndex : fallbackIndex) + direction + input.itemIds.length) %
    input.itemIds.length;
  return { type: "highlight", itemId: input.itemIds[nextIndex]! };
}

export function projectWorkflowKind(
  library: WorkflowLibraryProjection,
  kind: WorkflowCatalogItem["kind"],
): WorkflowLibraryProjection {
  const matches = (item: WorkflowCatalogItem) => item.kind === kind;
  return {
    pinned: library.pinned.filter(matches),
    presets: kind === "prompt" ? library.presets : [],
    recent: library.recent.filter(matches),
    all: library.all.filter(matches),
    staleReferenceCount: library.staleReferenceCount,
  };
}

export function ComposerWorkflowList(props: {
  readonly catalog: WorkflowCatalogList | null;
  readonly library: WorkflowLibraryProjection;
  readonly canMutatePreferences: boolean;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly kind: WorkflowCatalogItem["kind"];
  readonly query: string;
  readonly onKindChange: (kind: WorkflowCatalogItem["kind"]) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onRefresh: () => void;
  readonly onSelect: (itemId: WorkflowCatalogItemId) => void;
  readonly onSelectPreset: (entry: WorkflowPresetAction) => void;
  readonly onTogglePin: (itemId: WorkflowCatalogItemId) => void;
  readonly onSubmit: (item: WorkflowCatalogItem) => void;
  readonly onClose: () => void;
}) {
  const capability = props.catalog?.capability ?? null;
  const unavailable = capability !== null && capability.status !== "available";
  const capabilityMessage =
    capability?.status === "misconfigured"
      ? (capability.reason ?? "Configure an Agent Actions source for this environment.")
      : capability?.status === "unavailable"
        ? (capability.reason ?? "Agent Actions are unavailable in this environment.")
        : null;
  const message =
    props.error ?? capabilityMessage ?? (props.isPending ? "Loading Agent Actions…" : null);
  const kindItems = useMemo(
    () => (props.catalog?.items ?? []).filter((item) => item.kind === props.kind),
    [props.catalog?.items, props.kind],
  );
  const searchItems = useMemo(
    () => searchWorkflowCatalog(kindItems, props.query),
    [kindItems, props.query],
  );
  const projectedLibrary = useMemo(
    () => projectWorkflowKind(props.library, props.kind),
    [props.kind, props.library],
  );
  const pinnedIds = useMemo(
    () => new Set(projectedLibrary.pinned.map((item) => item.id)),
    [projectedLibrary.pinned],
  );
  const showSearchResults = props.query.trim().length > 0;
  const hasItems = kindItems.length > 0;
  const navigableItems = useMemo(
    () =>
      showSearchResults
        ? searchItems
        : [...projectedLibrary.pinned, ...projectedLibrary.recent, ...projectedLibrary.all],
    [projectedLibrary, searchItems, showSearchResults],
  );
  const [highlightedItemId, setHighlightedItemId] = useState<WorkflowCatalogItemId | null>(null);

  useEffect(() => {
    if (navigableItems.some((item) => item.id === highlightedItemId)) return;
    setHighlightedItemId(navigableItems[0]?.id ?? null);
  }, [highlightedItemId, navigableItems]);

  useEffect(() => {
    if (highlightedItemId === null) return;
    document.getElementById(`workflow-action-${highlightedItemId}`)?.scrollIntoView?.({
      block: "nearest",
    });
  }, [highlightedItemId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const action = resolveWorkflowListKey({
        key: event.key,
        shiftKey: event.shiftKey,
        itemIds: navigableItems.map((item) => item.id),
        highlightedItemId,
      });
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (action.type === "highlight") {
        setHighlightedItemId(action.itemId);
        return;
      }
      if (action.type === "open") {
        props.onSelect(action.itemId);
        return;
      }
      if (action.type === "submit") {
        const item = navigableItems.find((candidate) => candidate.id === action.itemId);
        if (item) props.onSubmit(item);
        return;
      }
      if (action.type === "close") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [highlightedItemId, navigableItems, props.onClose, props.onSelect, props.onSubmit]);

  return (
    <div className="grid gap-2 p-3">
      <div
        className="flex w-fit items-center gap-1 rounded-full border border-border/50 bg-muted/30 p-1"
        role="tablist"
        aria-label="Agent Action kind"
      >
        {(["prompt", "skill"] as const).map((itemKind) => (
          <button
            key={itemKind}
            type="button"
            role="tab"
            aria-selected={props.kind === itemKind}
            className={cn(
              "rounded-full px-3 py-1 font-medium text-xs capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              props.kind === itemKind
                ? "bg-background text-foreground shadow-sm"
                : "text-secondary-label hover:text-foreground",
            )}
            onClick={() => props.onKindChange(itemKind)}
          >
            {itemKind === "prompt" ? "Prompts" : "Skills"}
          </button>
        ))}
      </div>
      <Input
        nativeInput
        type="search"
        value={props.query}
        placeholder={`Search ${props.kind === "prompt" ? "prompts" : "skills"}`}
        aria-label="Search Agent Actions"
        role="combobox"
        aria-controls="agent-actions-library"
        aria-expanded="true"
        aria-activedescendant={
          highlightedItemId === null ? undefined : `workflow-action-${highlightedItemId}`
        }
        onChange={(event) => props.onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.onClose();
          }
        }}
      />
      <p className="px-1 text-[10px] text-secondary-label">
        ↑↓ navigate · Enter details · Shift+Enter run with inferred defaults
      </p>
      {message ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-3 text-secondary-label text-xs">
          <span>{message}</span>
          {props.error || unavailable ? (
            <Button type="button" variant="ghost" size="xs" onClick={props.onRefresh}>
              <RefreshCwIcon className="size-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {projectedLibrary.staleReferenceCount > 0 ? (
        <p className="px-2 text-secondary-label text-xs">
          {projectedLibrary.staleReferenceCount} saved action
          {projectedLibrary.staleReferenceCount === 1 ? " is" : "s are"} currently unavailable.
        </p>
      ) : null}
      {showSearchResults && searchItems.length === 0 && !props.isPending ? (
        <p className="px-2 py-5 text-center text-secondary-label text-xs">
          No matching Agent Actions.
        </p>
      ) : !showSearchResults && !hasItems && !props.isPending ? (
        <p className="px-2 py-5 text-center text-secondary-label text-xs">
          No Agent Actions are available yet.
        </p>
      ) : (
        <div
          id="agent-actions-library"
          className="max-h-72 overflow-y-auto"
          role="listbox"
          aria-label={`${props.kind === "prompt" ? "Prompt" : "Skill"} Agent Actions`}
        >
          {showSearchResults ? (
            <WorkflowItemSection
              title="Results"
              items={searchItems}
              pinnedIds={pinnedIds}
              highlightedItemId={highlightedItemId}
              canMutatePreferences={props.canMutatePreferences}
              onHighlight={setHighlightedItemId}
              onSelect={props.onSelect}
              onTogglePin={props.onTogglePin}
            />
          ) : (
            <>
              <WorkflowItemSection
                title="Pinned"
                items={projectedLibrary.pinned}
                pinnedIds={pinnedIds}
                highlightedItemId={highlightedItemId}
                canMutatePreferences={props.canMutatePreferences}
                onHighlight={setHighlightedItemId}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
              />
              {projectedLibrary.presets.length > 0 ? (
                <WorkflowPresetSection
                  entries={projectedLibrary.presets}
                  onSelect={props.onSelectPreset}
                />
              ) : null}
              <WorkflowItemSection
                title="Recent"
                items={projectedLibrary.recent}
                pinnedIds={pinnedIds}
                highlightedItemId={highlightedItemId}
                canMutatePreferences={props.canMutatePreferences}
                onHighlight={setHighlightedItemId}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
              />
              <WorkflowItemSection
                title="All"
                items={projectedLibrary.all}
                pinnedIds={pinnedIds}
                highlightedItemId={highlightedItemId}
                canMutatePreferences={props.canMutatePreferences}
                onHighlight={setHighlightedItemId}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowItemSection(props: {
  readonly title: string;
  readonly items: ReadonlyArray<WorkflowCatalogItem>;
  readonly pinnedIds: ReadonlySet<WorkflowCatalogItemId>;
  readonly highlightedItemId: WorkflowCatalogItemId | null;
  readonly canMutatePreferences: boolean;
  readonly onHighlight: (itemId: WorkflowCatalogItemId) => void;
  readonly onSelect: (itemId: WorkflowCatalogItemId) => void;
  readonly onTogglePin: (itemId: WorkflowCatalogItemId) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <section aria-label={props.title} className="mb-2 last:mb-0">
      <h3 className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-secondary-label">
        {props.title}
      </h3>
      {props.items.map((item) => (
        <WorkflowItemRow
          key={item.id}
          item={item}
          isPinned={props.pinnedIds.has(item.id)}
          isHighlighted={props.highlightedItemId === item.id}
          canMutatePreferences={props.canMutatePreferences}
          onHighlight={() => props.onHighlight(item.id)}
          onSelect={() => props.onSelect(item.id)}
          onTogglePin={() => props.onTogglePin(item.id)}
        />
      ))}
    </section>
  );
}

function WorkflowPresetSection(props: {
  readonly entries: ReadonlyArray<WorkflowPresetAction>;
  readonly onSelect: (entry: WorkflowPresetAction) => void;
}) {
  return (
    <section aria-label="Presets" className="mb-2">
      <h3 className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-secondary-label">
        Presets
      </h3>
      {props.entries.map((entry) => (
        <button
          key={entry.preset.id}
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          onClick={() => props.onSelect(entry)}
        >
          <BracesIcon className="size-4 shrink-0 text-icon-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium text-xs">{entry.preset.label}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-secondary-label">
                preset
              </span>
            </span>
            <span className="block truncate text-secondary-label text-xs">{entry.item.name}</span>
          </span>
        </button>
      ))}
    </section>
  );
}

function WorkflowItemRow(props: {
  readonly item: WorkflowCatalogItem;
  readonly isPinned: boolean;
  readonly isHighlighted: boolean;
  readonly canMutatePreferences: boolean;
  readonly onHighlight: () => void;
  readonly onSelect: () => void;
  readonly onTogglePin: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg hover:bg-accent focus-within:bg-accent",
        props.isHighlighted && "bg-accent",
      )}
      onPointerMove={props.onHighlight}
    >
      <button
        id={`workflow-action-${props.item.id}`}
        type="button"
        role="option"
        aria-selected={props.isHighlighted}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left focus-visible:outline-none"
        onFocus={props.onHighlight}
        onClick={props.onSelect}
      >
        {props.item.kind === "prompt" ? (
          <BracesIcon className="size-4 shrink-0 text-icon-muted" aria-hidden="true" />
        ) : (
          <BlocksIcon className="size-4 shrink-0 text-icon-muted" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium text-xs">{props.item.name}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-secondary-label">
              {props.item.kind}
            </span>
          </span>
          <span className="block truncate text-secondary-label text-xs">
            {props.item.description ?? "No description"}
          </span>
        </span>
      </button>
      {props.canMutatePreferences ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mr-1 shrink-0"
          aria-label={`${props.isPinned ? "Unpin" : "Pin"} ${props.item.name}`}
          onClick={props.onTogglePin}
        >
          <PinIcon className={props.isPinned ? "fill-current" : undefined} />
        </Button>
      ) : null}
    </div>
  );
}
