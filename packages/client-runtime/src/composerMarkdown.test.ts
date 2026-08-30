import { describe, expect, it } from "vite-plus/test";

import {
  decorateComposerMarkdown,
  decorateComposerMarkdownForDisplay,
  segmentComposerMarkdown,
} from "./composerMarkdown.js";

function slicesFor(source: string, kind: Parameters<typeof slicesForKind>[1]): string[] {
  return slicesForKind(source, kind);
}

function slicesForKind(
  source: string,
  kind: ReturnType<typeof decorateComposerMarkdown>[number]["kind"],
): string[] {
  return decorateComposerMarkdown(source)
    .filter((decoration) => decoration.kind === kind)
    .map((decoration) => source.slice(decoration.start, decoration.end));
}

describe("decorateComposerMarkdown", () => {
  it("decorates block and inline source without removing its markers", () => {
    const source =
      "## Plan\n> Use **bold**, *italic*, ~~old~~, `code`, and [docs](https://t3.codes).\n- item";

    expect(slicesFor(source, "heading")).toEqual(["Plan"]);
    expect(slicesFor(source, "quote")).toEqual([
      "Use **bold**, *italic*, ~~old~~, `code`, and [docs](https://t3.codes).",
    ]);
    expect(slicesFor(source, "bold")).toEqual(["bold"]);
    expect(slicesFor(source, "italic")).toEqual(["italic"]);
    expect(slicesFor(source, "strikethrough")).toEqual(["old"]);
    expect(slicesFor(source, "inline-code")).toEqual(["code"]);
    expect(slicesFor(source, "link")).toEqual(["docs"]);
    expect(slicesFor(source, "list-marker")).toEqual(["- "]);
  });

  it("leaves escaped and incomplete syntax undecorated", () => {
    const source = String.raw`\*literal* and **unfinished and \`literal\``;

    expect(decorateComposerMarkdown(source)).toEqual([]);
  });

  it("does not parse inline syntax inside fenced code", () => {
    const source = "```bash\necho **literal**\n```";

    expect(slicesFor(source, "code-block")).toEqual(["echo **literal**"]);
    expect(slicesFor(source, "bold")).toEqual([]);
    expect(slicesFor(source, "marker")).toEqual(["```bash", "```"]);
  });

  it("composes nested emphasis as overlapping semantic segments", () => {
    const source = "**bold and *italic***";
    const decorations = decorateComposerMarkdown(source);
    const nested = segmentComposerMarkdown(source, decorations).find(
      (segment) => source.slice(segment.start, segment.end) === "italic",
    );

    expect(nested?.kinds).toEqual(["bold", "italic"]);
  });

  it("uses UTF-16 offsets shared by JavaScript and native editors", () => {
    const source = "🙂 **bold**";
    const bold = decorateComposerMarkdown(source).find((decoration) => decoration.kind === "bold");

    expect(bold).toEqual({ kind: "bold", start: 5, end: 9 });
    expect(source.slice(bold?.start, bold?.end)).toBe("bold");
  });

  it("uses plain source presentation for syntax-dense drafts", () => {
    const source = "**bold** and `code`\n".repeat(200);

    expect(decorateComposerMarkdownForDisplay(source)).toEqual([]);
    expect(decorateComposerMarkdown(source).length).toBeGreaterThan(750);
  });
});
