import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  chatMarkdownClipboardPayload,
  serializeRenderedMarkdownFragment,
} from "./markdown-clipboard";

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

class FakeText {
  readonly nodeType = TEXT_NODE;
  readonly childNodes: ReadonlyArray<never> = [];
  parentElement: FakeElement | null = null;

  constructor(readonly textContent: string) {}
}

class FakeElement {
  readonly nodeType = ELEMENT_NODE;
  readonly childNodes: Array<FakeElement | FakeText> = [];
  readonly classList = {
    contains: (name: string) => this.classNames.includes(name),
  };
  parentElement: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    private readonly classNames: ReadonlyArray<string> = [],
  ) {}

  get localName(): string {
    return this.tagName.toLowerCase();
  }

  get className(): string {
    return this.classNames.join(" ");
  }

  get innerHTML(): string {
    return this.textContent;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  append(...children: Array<FakeElement | FakeText>): this {
    for (const child of children) child.parentElement = this;
    this.childNodes.push(...children);
    return this;
  }

  appendChild(child: FakeElement): FakeElement {
    this.append(child);
    return child;
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-language]") return null;
    if (selector === "pre" && this.tagName === "PRE") return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      if (selector === "code" && child.tagName === "CODE") return child;
      const match = child.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  getAttribute(): string | null {
    return null;
  }

  hasAttribute(): boolean {
    return false;
  }
}

function asNode(element: FakeElement): Node {
  return element as unknown as Node;
}

function shikiCodeLine(text: string): FakeElement {
  const token = new FakeElement("SPAN").append(new FakeText(text));
  return new FakeElement("SPAN", ["line"]).append(token);
}

describe("serializeRenderedMarkdownFragment", () => {
  beforeEach(() => {
    vi.stubGlobal("Node", { TEXT_NODE, ELEMENT_NODE });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps inline code in backticks", () => {
    const paragraph = new FakeElement("P").append(
      new FakeText("run "),
      new FakeElement("CODE").append(new FakeText("git status")),
      new FakeText(" first"),
    );
    const container = new FakeElement("DIV").append(paragraph);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("run `git status` first");
  });

  it("keeps a highlighted block code selection plain when its pre wrapper is outside the range", () => {
    const code = new FakeElement("CODE").append(
      shikiCodeLine("git show-ref --verify refs/remotes/origin/opt/deploy/dev"),
    );
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe(
      "git show-ref --verify refs/remotes/origin/opt/deploy/dev",
    );
  });

  it("keeps a multi-line code selection plain instead of inline-wrapping it", () => {
    const code = new FakeElement("CODE").append(new FakeText("first line\nsecond line"));
    const container = new FakeElement("DIV").append(code);

    expect(serializeRenderedMarkdownFragment(asNode(container))).toBe("first line\nsecond line");
  });

  it("keeps the final line plain when the selection endpoint lands outside the code block", () => {
    const selectedText = new FakeText("echo second");
    const root = new FakeElement("DIV").append(
      new FakeElement("PRE").append(new FakeElement("CODE").append(selectedText)),
    );
    const clonedSelection = new FakeElement("PRE").append(
      new FakeElement("CODE").append(shikiCodeLine("echo second")),
    );
    const range = {
      collapsed: false,
      commonAncestorContainer: asNode(root),
      startContainer: selectedText as unknown as Node,
      endContainer: asNode(root),
      cloneContents: () => asNode(clonedSelection),
      toString: () => "echo second",
    } as unknown as Range;
    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
    } as unknown as Selection;
    vi.stubGlobal("document", {
      createElement: () => new FakeElement("DIV"),
    });

    expect(chatMarkdownClipboardPayload(selection)?.text).toBe("echo second");
  });
});
