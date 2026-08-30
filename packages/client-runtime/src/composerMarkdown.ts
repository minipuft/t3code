export const COMPOSER_MARKDOWN_DECORATION_KINDS = [
  "marker",
  "heading",
  "quote",
  "list-marker",
  "bold",
  "italic",
  "strikethrough",
  "inline-code",
  "code-block",
  "link",
] as const;

export type ComposerMarkdownDecorationKind = (typeof COMPOSER_MARKDOWN_DECORATION_KINDS)[number];

export interface ComposerMarkdownDecoration {
  readonly kind: ComposerMarkdownDecorationKind;
  /** UTF-16 code-unit offset into the exact prompt source. */
  readonly start: number;
  /** Exclusive UTF-16 code-unit offset into the exact prompt source. */
  readonly end: number;
}

export interface ComposerMarkdownSegment {
  readonly start: number;
  readonly end: number;
  readonly kinds: ReadonlyArray<ComposerMarkdownDecorationKind>;
}

const MAX_LIVE_MARKDOWN_SEGMENTS = 750;

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

const KIND_ORDER = new Map(COMPOSER_MARKDOWN_DECORATION_KINDS.map((kind, index) => [kind, index]));

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function rangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function overlapsAny(range: SourceRange, ranges: ReadonlyArray<SourceRange>): boolean {
  return ranges.some((candidate) => rangesOverlap(range, candidate));
}

function indexIsExcluded(index: number, ranges: ReadonlyArray<SourceRange>): boolean {
  return ranges.some((range) => range.start <= index && index < range.end);
}

function pushDecoration(
  decorations: ComposerMarkdownDecoration[],
  kind: ComposerMarkdownDecorationKind,
  start: number,
  end: number,
): void {
  if (start < 0 || end <= start) return;
  decorations.push({ kind, start, end });
}

function findClosingDelimiter(
  source: string,
  delimiter: string,
  from: number,
  lineEnd: number,
  excluded: ReadonlyArray<SourceRange>,
): number {
  let cursor = source.indexOf(delimiter, from);
  while (cursor >= 0 && cursor < lineEnd) {
    let candidate = cursor;
    if (delimiter.length > 1) {
      let runEnd = cursor + delimiter.length;
      while (runEnd < lineEnd && source[runEnd] === delimiter[0]) runEnd += 1;
      candidate = runEnd - delimiter.length;
    }
    const range = { start: candidate, end: candidate + delimiter.length };
    const previous = source[candidate - 1] ?? "";
    const next = source[candidate + delimiter.length] ?? "";
    const adjacentDelimiterIsUnclaimed =
      delimiter.length === 1 &&
      ((next === delimiter && !indexIsExcluded(candidate + 1, excluded)) ||
        (previous === delimiter && !indexIsExcluded(candidate - 1, excluded)));
    if (
      range.end <= lineEnd &&
      !isEscaped(source, candidate) &&
      !overlapsAny(range, excluded) &&
      !/\s/.test(previous) &&
      !adjacentDelimiterIsUnclaimed
    ) {
      return candidate;
    }
    cursor = source.indexOf(delimiter, cursor + 1);
  }
  return -1;
}

function decorateDelimited(
  source: string,
  lineStart: number,
  lineEnd: number,
  delimiter: string,
  kind: ComposerMarkdownDecorationKind,
  decorations: ComposerMarkdownDecoration[],
  excluded: SourceRange[],
): void {
  let open = source.indexOf(delimiter, lineStart);
  while (open >= 0 && open < lineEnd) {
    const openRange = { start: open, end: open + delimiter.length };
    const before = source[open - 1] ?? "";
    const after = source[openRange.end] ?? "";
    const delimiterIsSingleAndAdjacent =
      delimiter.length === 1 && (before === delimiter || after === delimiter);
    if (
      openRange.end >= lineEnd ||
      isEscaped(source, open) ||
      /\s/.test(after) ||
      delimiterIsSingleAndAdjacent ||
      overlapsAny(openRange, excluded)
    ) {
      open = source.indexOf(delimiter, open + 1);
      continue;
    }

    const close = findClosingDelimiter(source, delimiter, openRange.end + 1, lineEnd, excluded);
    if (close < 0) {
      open = source.indexOf(delimiter, open + 1);
      continue;
    }

    pushDecoration(decorations, "marker", open, openRange.end);
    pushDecoration(decorations, kind, openRange.end, close);
    pushDecoration(decorations, "marker", close, close + delimiter.length);
    excluded.push(openRange, { start: close, end: close + delimiter.length });
    open = source.indexOf(delimiter, close + delimiter.length);
  }
}

function decorateInlineCode(
  source: string,
  lineStart: number,
  lineEnd: number,
  decorations: ComposerMarkdownDecoration[],
  excluded: SourceRange[],
): void {
  let cursor = lineStart;
  while (cursor < lineEnd) {
    if (source[cursor] !== "`" || isEscaped(source, cursor)) {
      cursor += 1;
      continue;
    }
    let runEnd = cursor + 1;
    while (runEnd < lineEnd && source[runEnd] === "`") runEnd += 1;
    const delimiter = source.slice(cursor, runEnd);
    const close = source.indexOf(delimiter, runEnd);
    if (close < 0 || close >= lineEnd || close === runEnd) {
      cursor = runEnd;
      continue;
    }
    pushDecoration(decorations, "marker", cursor, runEnd);
    pushDecoration(decorations, "inline-code", runEnd, close);
    pushDecoration(decorations, "marker", close, close + delimiter.length);
    excluded.push({ start: cursor, end: close + delimiter.length });
    cursor = close + delimiter.length;
  }
}

function decorateLinks(
  source: string,
  lineStart: number,
  lineEnd: number,
  decorations: ComposerMarkdownDecoration[],
  excluded: SourceRange[],
): void {
  const line = source.slice(lineStart, lineEnd);
  const pattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  for (const match of line.matchAll(pattern)) {
    const relativeStart = match.index;
    const start = lineStart + relativeStart;
    const end = start + match[0].length;
    if (isEscaped(source, start) || overlapsAny({ start, end }, excluded)) continue;
    const labelStart = start + 1;
    const labelEnd = labelStart + (match[1]?.length ?? 0);
    pushDecoration(decorations, "marker", start, labelStart);
    pushDecoration(decorations, "link", labelStart, labelEnd);
    pushDecoration(decorations, "marker", labelEnd, end);
    excluded.push({ start, end: labelStart }, { start: labelEnd, end });
  }
}

function decorateInline(
  source: string,
  lineStart: number,
  lineEnd: number,
  decorations: ComposerMarkdownDecoration[],
): void {
  const excluded: SourceRange[] = [];
  decorateInlineCode(source, lineStart, lineEnd, decorations, excluded);
  decorateLinks(source, lineStart, lineEnd, decorations, excluded);
  decorateDelimited(source, lineStart, lineEnd, "**", "bold", decorations, excluded);
  decorateDelimited(source, lineStart, lineEnd, "__", "bold", decorations, excluded);
  decorateDelimited(source, lineStart, lineEnd, "~~", "strikethrough", decorations, excluded);
  decorateDelimited(source, lineStart, lineEnd, "*", "italic", decorations, excluded);
  decorateDelimited(source, lineStart, lineEnd, "_", "italic", decorations, excluded);
}

function decorateLine(
  source: string,
  lineStart: number,
  lineEnd: number,
  decorations: ComposerMarkdownDecoration[],
): void {
  const line = source.slice(lineStart, lineEnd);
  const heading = /^( {0,3})(#{1,6})([ \t]+)/.exec(line);
  if (heading) {
    const markerEnd = lineStart + heading[0].length;
    pushDecoration(decorations, "marker", lineStart + (heading[1]?.length ?? 0), markerEnd);
    pushDecoration(decorations, "heading", markerEnd, lineEnd);
  }

  const quote = /^( {0,3}>[ \t]?)/.exec(line);
  if (quote) {
    const markerEnd = lineStart + quote[0].length;
    pushDecoration(decorations, "marker", lineStart, markerEnd);
    pushDecoration(decorations, "quote", markerEnd, lineEnd);
  }

  const list = /^(\s*)(?:[-+*]|\d+[.)])([ \t]+)/.exec(line);
  if (list) {
    const markerStart = lineStart + (list[1]?.length ?? 0);
    pushDecoration(decorations, "list-marker", markerStart, lineStart + list[0].length);
  }

  decorateInline(source, lineStart, lineEnd, decorations);
}

export function decorateComposerMarkdown(source: string): ComposerMarkdownDecoration[] {
  const decorations: ComposerMarkdownDecoration[] = [];
  let cursor = 0;
  let fence: { readonly character: string; readonly length: number } | null = null;

  while (cursor <= source.length) {
    const newline = source.indexOf("\n", cursor);
    const lineEnd = newline < 0 ? source.length : newline;
    const line = source.slice(cursor, lineEnd);
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})/.exec(line);

    if (fence) {
      const closesFence =
        fenceMatch?.[2]?.[0] === fence.character && (fenceMatch[2]?.length ?? 0) >= fence.length;
      if (closesFence) {
        pushDecoration(decorations, "marker", cursor, lineEnd);
        fence = null;
      } else {
        pushDecoration(decorations, "code-block", cursor, lineEnd);
      }
    } else if (fenceMatch?.[2]) {
      pushDecoration(decorations, "marker", cursor, lineEnd);
      fence = { character: fenceMatch[2][0] ?? "`", length: fenceMatch[2].length };
    } else {
      decorateLine(source, cursor, lineEnd, decorations);
    }

    if (newline < 0) break;
    cursor = newline + 1;
  }

  const unique = new Map<string, ComposerMarkdownDecoration>();
  for (const decoration of decorations) {
    unique.set(`${decoration.kind}:${decoration.start}:${decoration.end}`, decoration);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      (KIND_ORDER.get(left.kind) ?? 0) - (KIND_ORDER.get(right.kind) ?? 0),
  );
}

export function segmentComposerMarkdown(
  source: string,
  decorations: ReadonlyArray<ComposerMarkdownDecoration> = decorateComposerMarkdown(source),
  from = 0,
  to = source.length,
): ComposerMarkdownSegment[] {
  const start = Math.max(0, Math.min(from, source.length));
  const end = Math.max(start, Math.min(to, source.length));
  if (start === end) return [];

  const boundaries = new Set([start, end]);
  const startingKinds = new Map<number, ComposerMarkdownDecorationKind[]>();
  const endingKinds = new Map<number, ComposerMarkdownDecorationKind[]>();
  for (const decoration of decorations) {
    if (decoration.end <= start || decoration.start >= end) continue;
    const decorationStart = Math.max(start, decoration.start);
    const decorationEnd = Math.min(end, decoration.end);
    boundaries.add(decorationStart);
    boundaries.add(decorationEnd);
    startingKinds.set(decorationStart, [
      ...(startingKinds.get(decorationStart) ?? []),
      decoration.kind,
    ]);
    endingKinds.set(decorationEnd, [...(endingKinds.get(decorationEnd) ?? []), decoration.kind]);
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  const segments: ComposerMarkdownSegment[] = [];
  const activeKindCounts = new Map<ComposerMarkdownDecorationKind, number>();
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const segmentStart = ordered[index];
    const segmentEnd = ordered[index + 1];
    if (segmentStart === undefined || segmentEnd === undefined || segmentEnd <= segmentStart)
      continue;
    for (const kind of endingKinds.get(segmentStart) ?? []) {
      const count = activeKindCounts.get(kind) ?? 0;
      if (count <= 1) activeKindCounts.delete(kind);
      else activeKindCounts.set(kind, count - 1);
    }
    for (const kind of startingKinds.get(segmentStart) ?? []) {
      activeKindCounts.set(kind, (activeKindCounts.get(kind) ?? 0) + 1);
    }
    const kinds = [...activeKindCounts.keys()].sort(
      (left, right) => (KIND_ORDER.get(left) ?? 0) - (KIND_ORDER.get(right) ?? 0),
    );
    segments.push({ start: segmentStart, end: segmentEnd, kinds });
  }
  return segments;
}

export function decorateComposerMarkdownForDisplay(source: string): ComposerMarkdownDecoration[] {
  const decorations = decorateComposerMarkdown(source);
  return segmentComposerMarkdown(source, decorations).length <= MAX_LIVE_MARKDOWN_SEGMENTS
    ? decorations
    : [];
}
