import type {
  WorkflowCatalogItem,
  WorkflowCatalogList,
  WorkflowPromptSummary,
} from "@t3tools/contracts";
import { ArrowLeftIcon, BlocksIcon, BracesIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { memo, type ChangeEvent, useEffect, useMemo, useState } from "react";

import { searchWorkflowCatalog, buildWorkflowInvocation } from "../../workflowInvocation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export interface ComposerWorkflowPickerProps {
  readonly catalog: WorkflowCatalogList | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly initialQuery?: string;
  readonly initialSelectedItemId?: string;
  readonly draftText: string;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
  readonly onInsert: (input: { readonly item: WorkflowCatalogItem; readonly text: string }) => void;
}

export const ComposerWorkflowPicker = memo(function ComposerWorkflowPicker(
  props: ComposerWorkflowPickerProps,
) {
  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    props.initialSelectedItemId ?? null,
  );
  const [argumentValues, setArgumentValues] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    setQuery(props.initialQuery ?? "");
  }, [props.initialQuery]);

  const items = useMemo(
    () => searchWorkflowCatalog(props.catalog?.items ?? [], query),
    [props.catalog?.items, query],
  );
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
    setArgumentValues({});
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
          invocation={invocation!}
          argumentValues={argumentValues}
          onArgumentChange={(name, value) =>
            setArgumentValues((current) => ({ ...current, [name]: value }))
          }
          onInsert={() => props.onInsert({ item: selectedItem, text: invocation!.text })}
        />
      ) : (
        <WorkflowList
          catalog={props.catalog}
          error={props.error}
          isPending={props.isPending}
          items={items}
          query={query}
          onQueryChange={setQuery}
          onRefresh={props.onRefresh}
          onSelect={setSelectedItemId}
          onClose={props.onClose}
        />
      )}
    </section>
  );
});

function WorkflowList(props: {
  readonly catalog: WorkflowCatalogList | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly items: ReadonlyArray<WorkflowCatalogItem>;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly onRefresh: () => void;
  readonly onSelect: (itemId: string) => void;
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
          if (event.key === "Enter" && props.items[0]) {
            event.preventDefault();
            props.onSelect(props.items[0].id);
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
      {props.items.length === 0 && !props.isPending ? (
        <p className="px-2 py-5 text-center text-secondary-label text-xs">
          {props.query ? "No matching Agent Actions." : "No Agent Actions are available yet."}
        </p>
      ) : props.items.length > 0 ? (
        <div className="max-h-72 overflow-y-auto" role="listbox" aria-label="Agent Actions">
          {props.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onClick={() => props.onSelect(item.id)}
            >
              {item.kind === "prompt" ? (
                <BracesIcon className="size-4 shrink-0 text-icon-muted" aria-hidden="true" />
              ) : (
                <BlocksIcon className="size-4 shrink-0 text-icon-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-xs">{item.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-secondary-label">
                    {item.kind}
                  </span>
                </span>
                <span className="block truncate text-secondary-label text-xs">
                  {item.description ?? "No description"}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkflowDetail(props: {
  readonly item: WorkflowCatalogItem;
  readonly invocation: ReturnType<typeof buildWorkflowInvocation>;
  readonly argumentValues: Readonly<Record<string, string>>;
  readonly onArgumentChange: (name: string, value: string) => void;
  readonly onInsert: () => void;
}) {
  const prompt = props.item.kind === "prompt" ? props.item : null;
  const hasErrors = Object.keys(props.invocation.errors).length > 0;
  return (
    <div className="grid max-h-[28rem] gap-4 overflow-y-auto p-4">
      <div className="grid gap-1">
        <span className="text-[10px] uppercase tracking-wide text-secondary-label">
          {props.item.kind}
        </span>
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
