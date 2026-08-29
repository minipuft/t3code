import {
  $getRoot,
  $isElementNode,
  $isTextNode,
  TextNode,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import {
  decorateComposerMarkdownForDisplay,
  segmentComposerMarkdown,
  type ComposerMarkdownDecorationKind,
  type ComposerMarkdownSegment,
} from "@t3tools/client-runtime/composer-markdown";

const PROJECTED_FORMATS = ["bold", "italic", "strikethrough", "code", "underline"] as const;

type ProjectedFormat = (typeof PROJECTED_FORMATS)[number];

function projectedFormats(
  kinds: ReadonlyArray<ComposerMarkdownDecorationKind>,
): Set<ProjectedFormat> {
  const formats = new Set<ProjectedFormat>();
  if (kinds.includes("heading") || kinds.includes("list-marker") || kinds.includes("bold")) {
    formats.add("bold");
  }
  if (kinds.includes("quote") || kinds.includes("italic")) formats.add("italic");
  if (kinds.includes("strikethrough")) formats.add("strikethrough");
  if (kinds.includes("inline-code") || kinds.includes("code-block")) formats.add("code");
  if (kinds.includes("link")) formats.add("underline");
  return formats;
}

function projectionKey(kinds: ReadonlyArray<ComposerMarkdownDecorationKind>): string {
  return `${[...projectedFormats(kinds)].join(",")}|${composerMarkdownTextStyle(kinds)}`;
}

function mergeEquivalentSegments(
  segments: ReadonlyArray<ComposerMarkdownSegment>,
): ComposerMarkdownSegment[] {
  const merged: ComposerMarkdownSegment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.end === segment.start &&
      projectionKey(previous.kinds) === projectionKey(segment.kinds)
    ) {
      merged[merged.length - 1] = { ...previous, end: segment.end };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

function segmentsForRange(
  segments: ReadonlyArray<ComposerMarkdownSegment>,
  start: number,
  end: number,
): ComposerMarkdownSegment[] {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((segments[middle]?.end ?? 0) <= start) low = middle + 1;
    else high = middle;
  }

  const matching: ComposerMarkdownSegment[] = [];
  for (let index = low; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || segment.start >= end) break;
    matching.push({
      start: Math.max(start, segment.start),
      end: Math.min(end, segment.end),
      kinds: segment.kinds,
    });
  }
  return matching;
}

export function composerMarkdownTextStyle(
  kinds: ReadonlyArray<ComposerMarkdownDecorationKind>,
): string {
  const declarations: string[] = [];
  if (kinds.includes("marker")) declarations.push("color: var(--color-muted-foreground)");
  if (kinds.includes("quote")) declarations.push("color: var(--color-muted-foreground)");
  if (kinds.includes("list-marker") || kinds.includes("link")) {
    declarations.push("color: var(--color-info)");
  }
  if (kinds.includes("inline-code") || kinds.includes("code-block")) {
    declarations.push("font-family: var(--font-mono)");
    declarations.push("color: var(--color-secondary-foreground)");
  }
  return declarations.join("; ");
}

function applyProjection(
  node: TextNode,
  kinds: ReadonlyArray<ComposerMarkdownDecorationKind>,
): void {
  const desiredFormats = projectedFormats(kinds);
  for (const format of PROJECTED_FORMATS) {
    if (node.hasFormat(format) !== desiredFormats.has(format)) {
      node.toggleFormat(format as TextFormatType);
    }
  }

  const style = composerMarkdownTextStyle(kinds);
  if (node.getStyle() !== style) node.setStyle(style);
}

export function registerComposerMarkdownProjection(editor: LexicalEditor): () => void {
  let cachedSource = "";
  let cachedSegments = mergeEquivalentSegments(
    segmentComposerMarkdown(cachedSource, decorateComposerMarkdownForDisplay(cachedSource)),
  );
  const sourceOffsets = new Map<string, number>();

  const indexSourceOffsets = (node: LexicalNode, start: number): number => {
    if ($isTextNode(node)) {
      sourceOffsets.set(node.getKey(), start);
      return start + node.getTextContentSize();
    }
    if ($isElementNode(node)) {
      let nextStart = start;
      for (const child of node.getChildren()) {
        nextStart = indexSourceOffsets(child, nextStart);
      }
      return nextStart;
    }
    return start + node.getTextContent().length;
  };

  const rebuildSourceOffsets = (): void => {
    sourceOffsets.clear();
    indexSourceOffsets($getRoot(), 0);
  };

  return editor.registerNodeTransform(TextNode, (node) => {
    const source = $getRoot().getTextContent();
    if (source !== cachedSource) {
      cachedSource = source;
      cachedSegments = mergeEquivalentSegments(
        segmentComposerMarkdown(source, decorateComposerMarkdownForDisplay(source)),
      );
      rebuildSourceOffsets();
    }

    let start = sourceOffsets.get(node.getKey());
    if (start === undefined) {
      rebuildSourceOffsets();
      start = sourceOffsets.get(node.getKey());
    }
    if (start === undefined) return;
    const end = start + node.getTextContentSize();
    const segments = segmentsForRange(cachedSegments, start, end);
    if (segments.length > 1) {
      const splitNodes = node.splitText(
        ...segments.slice(1).map((segment) => segment.start - start),
      );
      let splitStart = start;
      for (const [index, splitNode] of splitNodes.entries()) {
        sourceOffsets.set(splitNode.getKey(), splitStart);
        applyProjection(splitNode, segments[index]?.kinds ?? []);
        splitStart += splitNode.getTextContentSize();
      }
      return;
    }

    applyProjection(node, segments[0]?.kinds ?? []);
  });
}
