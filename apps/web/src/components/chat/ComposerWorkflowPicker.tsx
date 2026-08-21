import type {
  WorkflowCatalogItem,
  WorkflowCatalogItemId,
  WorkflowCatalogList,
  WorkflowPresetId,
  WorkflowPromptSummary,
} from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  BlocksIcon,
  BracesIcon,
  PinIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { memo, type ChangeEvent, useEffect, useMemo, useState } from "react";

import {
  buildWorkflowInvocation,
  searchWorkflowCatalog,
  type WorkflowLibraryProjection,
  type WorkflowPresetAction,
} from "../../workflowInvocation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export interface ComposerWorkflowPickerProps {
  readonly catalog: WorkflowCatalogList | null;
  readonly library: WorkflowLibraryProjection;
  readonly canMutatePreferences: boolean;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly initialQuery?: string;
  readonly initialSelectedItemId?: string;
  readonly draftText: string;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
  readonly onTogglePin: (itemId: WorkflowCatalogItemId) => void;
  readonly onSavePreset: (input: {
    readonly id?: WorkflowPresetId;
    readonly item: WorkflowPromptSummary;
    readonly label: string;
    readonly values: Readonly<Record<string, string>>;
  }) => WorkflowPresetId | null;
  readonly onRemovePreset: (presetId: WorkflowPresetId) => void;
  readonly onInsert: (input: { readonly item: WorkflowCatalogItem; readonly text: string }) => void;
}

export const ComposerWorkflowPicker = memo(function ComposerWorkflowPicker(
  props: ComposerWorkflowPickerProps,
) {
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    props.initialSelectedItemId ?? null,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<WorkflowPresetId | null>(null);
  const [presetLabel, setPresetLabel] = useState("");
  const [argumentValues, setArgumentValues] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    setQuery(props.initialQuery ?? "");
  }, [props.initialQuery]);

  const selectedItem = useMemo(
    () => props.catalog?.items.find((item) => item.id === selectedItemId) ?? null,
    [props.catalog?.items, selectedItemId],
  );
  const invocation = useMemo(
    () =>
      selectedItem === null
        ? null
        : buildWorkflowInvocation({
            item: selectedItem,
            draftText: props.draftText,
            values: argumentValues,
          }),
    [argumentValues, props.draftText, selectedItem],
  );

  const resetSelection = () => {
    setSelectedItemId(null);
    setSelectedPresetId(null);
    setPresetLabel("");
    setArgumentValues({});
  };
  const selectItem = (itemId: WorkflowCatalogItemId) => {
    setSelectedItemId(itemId);
    setSelectedPresetId(null);
    setPresetLabel("");
    setArgumentValues({});
  };
  const selectPreset = (entry: WorkflowPresetAction) => {
    setSelectedItemId(entry.item.id);
    setSelectedPresetId(entry.preset.id);
    setPresetLabel(entry.preset.label);
    setArgumentValues(entry.preset.values);
  };

  return (
    <section
      aria-label="Agent Actions"
      className="chat-composer-drawer-surface chat-composer-drawer-attached overflow-hidden"
      data-composer-workflow-picker="true"
    >
      <header className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
        {selectedItem ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Back to Agent Actions"
            onClick={resetSelection}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-medium text-sm">Agent Actions</h2>
          <p className="truncate text-secondary-label text-xs">
            {selectedItem ? selectedItem.name : "Prompts and skills from this environment"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close Agent Actions"
          onClick={props.onClose}
        >
          <XIcon />
        </Button>
      </header>

      {selectedItem ? (
        <WorkflowDetail
          item={selectedItem}
          hasSelectedPreset={selectedPresetId !== null}
          invocation={invocation!}
          argumentValues={argumentValues}
          presetLabel={presetLabel}
          isPinned={props.library.pinned.some((item) => item.id === selectedItem.id)}
          canMutatePreferences={props.canMutatePreferences}
          onPresetLabelChange={setPresetLabel}
          onArgumentChange={(name, value) =>
            setArgumentValues((current) => ({ ...current, [name]: value }))
          }
          onTogglePin={() => props.onTogglePin(selectedItem.id)}
          onSavePreset={() => {
            if (selectedItem.kind !== "prompt" || presetLabel.trim().length === 0) return;
            const savedPresetId = props.onSavePreset({
              ...(selectedPresetId ? { id: selectedPresetId } : {}),
              item: selectedItem,
              label: presetLabel,
              values: argumentValues,
            });
            if (savedPresetId) setSelectedPresetId(savedPresetId);
          }}
          onRemovePreset={() => {
            if (!selectedPresetId) return;
            props.onRemovePreset(selectedPresetId);
            resetSelection();
          }}
          onInsert={() => props.onInsert({ item: selectedItem, text: invocation!.text })}
        />
      ) : (
        <WorkflowList
          catalog={props.catalog}
          library={props.library}
          canMutatePreferences={props.canMutatePreferences}
          error={props.error}
          isPending={props.isPending}
          query={query}
          onQueryChange={setQuery}
          onRefresh={props.onRefresh}
          onSelect={selectItem}
          onSelectPreset={selectPreset}
          onTogglePin={props.onTogglePin}
          onClose={props.onClose}
        />
      )}
    </section>
  );
});

function WorkflowList(props: {
  readonly catalog: WorkflowCatalogList | null;
  readonly library: WorkflowLibraryProjection;
  readonly canMutatePreferences: boolean;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onRefresh: () => void;
  readonly onSelect: (itemId: WorkflowCatalogItemId) => void;
  readonly onSelectPreset: (entry: WorkflowPresetAction) => void;
  readonly onTogglePin: (itemId: WorkflowCatalogItemId) => void;
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
  const searchItems = useMemo(
    () => searchWorkflowCatalog(props.catalog?.items ?? [], props.query),
    [props.catalog?.items, props.query],
  );
  const pinnedIds = useMemo(
    () => new Set(props.library.pinned.map((item) => item.id)),
    [props.library.pinned],
  );
  const showSearchResults = props.query.trim().length > 0;
  const hasItems = (props.catalog?.items.length ?? 0) > 0;

  return (
    <div className="grid gap-2 p-3">
      <Input
        nativeInput
        autoFocus
        type="search"
        value={props.query}
        placeholder="Search prompts and skills"
        aria-label="Search Agent Actions"
        onChange={(event) => props.onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.onClose();
            return;
          }
          if (event.key === "Enter" && searchItems[0]) {
            event.preventDefault();
            props.onSelect(searchItems[0].id);
          }
        }}
      />
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
      {props.library.staleReferenceCount > 0 ? (
        <p className="px-2 text-secondary-label text-xs">
          {props.library.staleReferenceCount} saved action
          {props.library.staleReferenceCount === 1 ? " is" : "s are"} currently unavailable.
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
        <div className="max-h-72 overflow-y-auto" aria-label="Agent Actions library">
          {showSearchResults ? (
            <WorkflowItemSection
              title="Results"
              items={searchItems}
              pinnedIds={pinnedIds}
              canMutatePreferences={props.canMutatePreferences}
              onSelect={props.onSelect}
              onTogglePin={props.onTogglePin}
            />
          ) : (
            <>
              <WorkflowItemSection
                title="Pinned"
                items={props.library.pinned}
                pinnedIds={pinnedIds}
                canMutatePreferences={props.canMutatePreferences}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
              />
              {props.library.presets.length > 0 ? (
                <WorkflowPresetSection
                  entries={props.library.presets}
                  onSelect={props.onSelectPreset}
                />
              ) : null}
              <WorkflowItemSection
                title="Recent"
                items={props.library.recent}
                pinnedIds={pinnedIds}
                canMutatePreferences={props.canMutatePreferences}
                onSelect={props.onSelect}
                onTogglePin={props.onTogglePin}
              />
              <WorkflowItemSection
                title="All"
                items={props.library.all}
                pinnedIds={pinnedIds}
                canMutatePreferences={props.canMutatePreferences}
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
  readonly canMutatePreferences: boolean;
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
          canMutatePreferences={props.canMutatePreferences}
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
  readonly canMutatePreferences: boolean;
  readonly onSelect: () => void;
  readonly onTogglePin: () => void;
}) {
  return (
    <div className="group flex items-center rounded-lg hover:bg-accent focus-within:bg-accent">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left focus-visible:outline-none"
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

function WorkflowDetail(props: {
  readonly item: WorkflowCatalogItem;
  readonly hasSelectedPreset: boolean;
  readonly invocation: ReturnType<typeof buildWorkflowInvocation>;
  readonly argumentValues: Readonly<Record<string, string>>;
  readonly presetLabel: string;
  readonly isPinned: boolean;
  readonly canMutatePreferences: boolean;
  readonly onPresetLabelChange: (label: string) => void;
  readonly onArgumentChange: (name: string, value: string) => void;
  readonly onTogglePin: () => void;
  readonly onSavePreset: () => void;
  readonly onRemovePreset: () => void;
  readonly onInsert: () => void;
}) {
  const prompt = props.item.kind === "prompt" ? props.item : null;
  const hasErrors = Object.keys(props.invocation.errors).length > 0;
  return (
    <div className="grid max-h-[28rem] gap-4 overflow-y-auto p-4">
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wide text-secondary-label">
            {props.item.kind}
          </span>
          {props.canMutatePreferences ? (
            <Button type="button" variant="ghost" size="xs" onClick={props.onTogglePin}>
              <PinIcon className={props.isPinned ? "fill-current" : undefined} />
              {props.isPinned ? "Unpin" : "Pin"}
            </Button>
          ) : null}
        </div>
        <p className="text-sm leading-5">{props.item.description ?? "No description"}</p>
        {props.item.providers.length > 0 ? (
          <p className="text-secondary-label text-xs">
            Available in {props.item.providers.join(", ")}
          </p>
        ) : null}
      </div>

      {prompt ? (
        <PromptArguments
          prompt={prompt}
          values={props.argumentValues}
          errors={props.invocation.errors}
          onChange={props.onArgumentChange}
        />
      ) : null}

      {prompt && props.canMutatePreferences ? (
        <fieldset className="grid gap-2 rounded-lg border border-border/50 p-3">
          <legend className="px-1 font-medium text-xs">Named preset</legend>
          <Input
            nativeInput
            value={props.presetLabel}
            aria-label="Preset name"
            placeholder="Preset name"
            onChange={(event) => props.onPresetLabelChange(event.currentTarget.value)}
          />
          <div className="flex justify-end gap-2">
            {props.hasSelectedPreset ? (
              <Button type="button" variant="ghost" size="sm" onClick={props.onRemovePreset}>
                <Trash2Icon />
                Remove
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={props.presetLabel.trim().length === 0 || hasErrors}
              onClick={props.onSavePreset}
            >
              {props.hasSelectedPreset ? "Update preset" : "Save preset"}
            </Button>
          </div>
        </fieldset>
      ) : null}

      {props.invocation.omittedArguments.length > 0 ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-secondary-label text-xs">
          Blank arguments will be inferred from the draft and thread. The agent asks only when it
          cannot infer them.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={hasErrors} onClick={props.onInsert}>
          Insert
        </Button>
      </div>
    </div>
  );
}

function PromptArguments(props: {
  readonly prompt: WorkflowPromptSummary;
  readonly values: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (name: string, value: string) => void;
}) {
  if (props.prompt.arguments.length === 0) return null;
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 font-medium text-xs">Arguments</legend>
      {props.prompt.arguments.map((argument) => {
        const mappedDraft = argument.name === props.prompt.composerInputArgument;
        const label = `${argument.name}${argument.required ? " · required" : " · optional"}`;
        const common = {
          value: props.values[argument.name] ?? "",
          placeholder: mappedDraft
            ? "Uses the current draft when blank"
            : (argument.description ?? ""),
          "aria-invalid": Boolean(props.errors[argument.name]),
          onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            props.onChange(argument.name, event.currentTarget.value),
        } as const;
        return (
          <label key={argument.name} className="grid gap-1.5 text-xs">
            <span className="font-medium">{label}</span>
            {argument.type === "object" || argument.type === "array" ? (
              <Textarea {...common} aria-label={label} />
            ) : (
              <Input nativeInput {...common} aria-label={label} />
            )}
            {props.errors[argument.name] ? (
              <span className="text-destructive">{props.errors[argument.name]}</span>
            ) : argument.description ? (
              <span className="text-secondary-label">{argument.description}</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}
