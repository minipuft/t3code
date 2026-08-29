import { describe, expect, it } from "vite-plus/test";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";

import {
  composerMarkdownTextStyle,
  registerComposerMarkdownProjection,
} from "./composerMarkdownProjection";

describe("registerComposerMarkdownProjection", () => {
  it("projects Markdown without changing the source text", () => {
    const editor = createEditor();
    const unregister = registerComposerMarkdownProjection(editor);
    const source = "# **bold** and `code`";

    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode(source)));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(source);
      const textNodes = $getRoot().getAllTextNodes();
      expect(textNodes.map((node) => node.getTextContent()).join("")).toBe(source);
      expect(
        textNodes.some((node) => node.getTextContent() === "bold" && node.hasFormat("bold")),
      ).toBe(true);
      expect(
        textNodes.some(
          (node) =>
            node.getTextContent() === "code" &&
            node.hasFormat("code") &&
            node.getStyle().includes("var(--font-mono)"),
        ),
      ).toBe(true);
      expect(
        textNodes
          .filter((node) => node.getTextContent().includes("*"))
          .every((node) => node.getStyle().includes("var(--color-muted-foreground)")),
      ).toBe(true);
    });
    unregister();
  });

  it("removes projected formatting when syntax becomes incomplete", () => {
    const editor = createEditor();
    const unregister = registerComposerMarkdownProjection(editor);

    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode("**bold**")));
      },
      { discrete: true },
    );
    editor.update(
      () => {
        const textNodes = $getRoot().getAllTextNodes();
        const firstNode = textNodes[0];
        firstNode?.setTextContent("**bold");
        for (const node of textNodes.slice(1)) node.remove();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const textNodes = $getRoot().getAllTextNodes();
      expect($getRoot().getTextContent()).toBe("**bold");
      expect(textNodes.every((node) => !node.hasFormat("bold") && node.getStyle() === "")).toBe(
        true,
      );
    });
    unregister();
  });

  it("falls back to plain source for syntax-dense drafts", () => {
    const editor = createEditor();
    const unregister = registerComposerMarkdownProjection(editor);
    const source = "**bold** and `code`\n".repeat(200);

    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode(source)));
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(source);
      const textNodes = $getRoot().getAllTextNodes();
      expect(textNodes).toHaveLength(1);
      expect(textNodes[0]?.getFormat()).toBe(0);
      expect(textNodes[0]?.getStyle()).toBe("");
    });
    unregister();
  });

  it("reprojects replacement nodes when the source string is unchanged", () => {
    const editor = createEditor();
    const unregister = registerComposerMarkdownProjection(editor);

    for (let iteration = 0; iteration < 2; iteration += 1) {
      editor.update(
        () => {
          $getRoot()
            .clear()
            .append($createParagraphNode().append($createTextNode("**bold**")));
        },
        { discrete: true },
      );
    }

    editor.getEditorState().read(() => {
      expect(
        $getRoot()
          .getAllTextNodes()
          .some((node) => node.getTextContent() === "bold" && node.hasFormat("bold")),
      ).toBe(true);
    });
    unregister();
  });
});

describe("composerMarkdownTextStyle", () => {
  it("uses existing theme tokens for marker-forward styling", () => {
    expect(composerMarkdownTextStyle(["marker"])).toBe("color: var(--color-muted-foreground)");
    expect(composerMarkdownTextStyle(["inline-code"])).toContain("var(--font-mono)");
  });
});
