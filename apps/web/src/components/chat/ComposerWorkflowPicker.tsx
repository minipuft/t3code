import type {
  WorkflowCatalogItem,
  WorkflowCatalogItemId,
  WorkflowCatalogList,
  WorkflowPresetId,
  WorkflowPromptSummary,
} from "@t3tools/contracts";
import { ArrowLeftIcon, BlocksIcon, PinIcon, Trash2Icon, XIcon } from "lucide-react";
import { memo, type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  buildWorkflowInvocation,
  type WorkflowLibraryProjection,
  type WorkflowPresetAction,
} from "../../workflowInvocation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ComposerWorkflowList } from "./ComposerWorkflowList";

export interface ComposerWorkflowPickerProps {
  readonly catalog: WorkflowCatalogList | null;
  readonly library: WorkflowLibraryProjection;
  readonly canMutatePreferences: boolean;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly initialQuery?: string;
  readonly initialSelectedItemId?: string;
  readonly initialKind?: WorkflowCatalogItem["kind"];
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
  readonly onSubmit: (input: { readonly item: WorkflowCatalogItem; readonly text: string }) => void;
}

export const ComposerWorkflowPicker = memo(function ComposerWorkflowPicker(
  props: ComposerWorkflowPickerProps,
) {
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    props.initialSelectedItemId ?? null,
  );
  const [kind, setKind] = useState<WorkflowCatalogItem["kind"]>(props.initialKind ?? "prompt");
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
  useEffect(() => {
    if (selectedItem !== null) setKind(selectedItem.kind);
  }, [selectedItem]);
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
  const selectItem = useCallback((itemId: WorkflowCatalogItemId) => {
    setSelectedItemId(itemId);
    setSelectedPresetId(null);
    setPresetLabel("");
    setArgumentValues({});
  }, []);
  const submitItem = useCallback(
    (item: WorkflowCatalogItem) => {
      const directInvocation = buildWorkflowInvocation({
        item,
        draftText: props.draftText,
        values: {},
      });
      if (Object.keys(directInvocation.errors).length > 0) return;
      props.onSubmit({ item, text: directInvocation.text });
    },
    [props.draftText, props.onSubmit],
  );
  const selectPreset = useCallback((entry: WorkflowPresetAction) => {
    setSelectedItemId(entry.item.id);
    setSelectedPresetId(entry.preset.id);
    setPresetLabel(entry.preset.label);
    setArgumentValues(entry.preset.values);
  }, []);

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
          render={
            <a
              href={`/workbench?module=${selectedItem?.kind === "skill" ? "skills" : "prompts"}`}
              aria-label="Open Agent Workbench"
            />
          }
          variant="ghost"
          size="icon-xs"
          onClick={props.onClose}
        >
          <BlocksIcon />
        </Button>
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
        <ComposerWorkflowList
          catalog={props.catalog}
          library={props.library}
          canMutatePreferences={props.canMutatePreferences}
          error={props.error}
          isPending={props.isPending}
          kind={kind}
          query={query}
          onKindChange={setKind}
          onQueryChange={setQuery}
          onRefresh={props.onRefresh}
          onSelect={selectItem}
          onSelectPreset={selectPreset}
          onTogglePin={props.onTogglePin}
          onSubmit={submitItem}
          onClose={props.onClose}
        />
      )}
    </section>
  );
});

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
    <div
      className="grid max-h-[28rem] gap-4 overflow-y-auto p-4"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        if (event.target instanceof HTMLTextAreaElement) {
          event.stopPropagation();
          return;
        }
        if (event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
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
