import type {
  WorkflowArgument,
  WorkflowCatalogItem,
  WorkflowCatalogList,
  WorkflowPromptSummary,
} from "@t3tools/contracts";

export interface WorkflowInvocationResult {
  readonly text: string;
  readonly errors: Readonly<Record<string, string>>;
  readonly omittedArguments: ReadonlyArray<string>;
}

export interface WorkflowInsertionPlan {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly replacement: string;
  readonly expectedText: string;
}

const normalizedSearchText = (item: WorkflowCatalogItem): string =>
  [
    item.name,
    item.description ?? "",
    item.kind === "prompt" ? item.category : (item.scope ?? ""),
    ...item.providers,
  ]
    .join(" ")
    .toLowerCase();

/** Keep the entry point when loading can explain itself or provider skills remain usable. */
export function shouldShowWorkflowActions(catalog: WorkflowCatalogList | null): boolean {
  return (
    catalog === null || catalog.capability.status !== "unavailable" || catalog.items.length > 0
  );
}

/** Search the provider-neutral catalog without manufacturing provider-specific copies. */
export function searchWorkflowCatalog(
  items: ReadonlyArray<WorkflowCatalogItem>,
  query: string,
): ReadonlyArray<WorkflowCatalogItem> {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => {
    const searchText = normalizedSearchText(item);
    return terms.every((term) => searchText.includes(term));
  });
}

function quoteWorkflowString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

function serializeArgument(
  argument: WorkflowArgument,
  rawValue: string,
): { readonly value: string } | { readonly error: string } {
  const value = rawValue.trim();
  switch (argument.type) {
    case "string":
      return { value: quoteWorkflowString(rawValue) };
    case "number": {
      const parsed = Number(value);
      return value.length > 0 && Number.isFinite(parsed)
        ? { value: String(parsed) }
        : { error: "Enter a finite number." };
    }
    case "boolean":
      return value === "true" || value === "false"
        ? { value }
        : { error: 'Enter "true" or "false".' };
    case "array":
    case "object": {
      try {
        const parsed: unknown = JSON.parse(value);
        const valid =
          argument.type === "array"
            ? Array.isArray(parsed)
            : typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
        return valid
          ? { value: JSON.stringify(parsed) }
          : { error: `Enter a JSON ${argument.type}.` };
      } catch {
        return { error: `Enter a valid JSON ${argument.type}.` };
      }
    }
  }
}

function workflowArgumentValues(
  prompt: WorkflowPromptSummary,
  draftText: string,
  rawValues: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const mappedArgument = prompt.composerInputArgument;
  if (
    mappedArgument === null ||
    draftText.trim().length === 0 ||
    (rawValues[mappedArgument]?.trim().length ?? 0) > 0
  ) {
    return rawValues;
  }
  return { ...rawValues, [mappedArgument]: draftText };
}

/** Build editable composer text. Omitted values stay explicit rather than being fabricated. */
export function buildWorkflowInvocation(input: {
  readonly item: WorkflowCatalogItem;
  readonly draftText: string;
  readonly values: Readonly<Record<string, string>>;
}): WorkflowInvocationResult {
  if (input.item.kind === "skill") {
    return { text: `$${input.item.name}`, errors: {}, omittedArguments: [] };
  }

  const values = workflowArgumentValues(input.item, input.draftText, input.values);
  const errors: Record<string, string> = {};
  const serialized: string[] = [];
  const omittedArguments: string[] = [];

  for (const argument of input.item.arguments) {
    const rawValue = values[argument.name] ?? "";
    if (rawValue.trim().length === 0) {
      omittedArguments.push(argument.name);
      continue;
    }
    const result = serializeArgument(argument, rawValue);
    if ("error" in result) {
      errors[argument.name] = result.error;
      continue;
    }
    serialized.push(`${argument.name}:${result.value}`);
  }

  const command = [`>>${input.item.id}`, ...serialized].join(" ");
  const inferenceInstruction =
    omittedArguments.length === 0
      ? ""
      : `\n\nInfer omitted workflow arguments (${omittedArguments.join(", ")}) from the draft and thread context; ask only when inference fails.`;
  return {
    text: `${command}${inferenceInstruction}`,
    errors,
    omittedArguments,
  };
}

/** Decide the editor replacement without coupling invocation rules to the React composer. */
export function planWorkflowInsertion(input: {
  readonly item: WorkflowCatalogItem;
  readonly invocation: string;
  readonly draftText: string;
  readonly cursor: number;
  readonly triggerRange: { readonly start: number; readonly end: number } | null;
}): WorkflowInsertionPlan {
  const draftWithoutTrigger = input.triggerRange
    ? `${input.draftText.slice(0, input.triggerRange.start)}${input.draftText.slice(
        input.triggerRange.end,
      )}`
    : input.draftText;
  const mapsDraft =
    input.item.kind === "prompt" &&
    input.item.composerInputArgument !== null &&
    draftWithoutTrigger.trim().length > 0;
  const rangeStart = mapsDraft ? 0 : (input.triggerRange?.start ?? input.cursor);
  const rangeEnd = mapsDraft ? input.draftText.length : (input.triggerRange?.end ?? input.cursor);
  const needsLeadingSpace = rangeStart > 0 && !/\s/u.test(input.draftText[rangeStart - 1] ?? "");
  const needsTrailingSpace =
    rangeEnd < input.draftText.length && !/\s/u.test(input.draftText[rangeEnd] ?? "");
  return {
    rangeStart,
    rangeEnd,
    replacement: mapsDraft
      ? input.invocation
      : `${needsLeadingSpace ? " " : ""}${input.invocation}${needsTrailingSpace ? " " : ""}`,
    expectedText: input.draftText.slice(rangeStart, rangeEnd),
  };
}
