import { EnvironmentId } from "@t3tools/contracts";
import { useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  groupWorkbenchItems,
  useWorkbenchGroupOpenState,
  WorkbenchGroupSection,
} from "./WorkbenchGroupSections";

describe("groupWorkbenchItems", () => {
  const items = ["b1", "a1", "b2", "c1"];
  const keyOf = (item: string) => item.slice(0, 1);

  it("preserves first-seen order without an explicit order", () => {
    const groups = groupWorkbenchItems(items, keyOf);
    expect(groups.map((group) => group.id)).toEqual(["b", "a", "c"]);
    expect(groups[0]?.items).toEqual(["b1", "b2"]);
  });

  it("sequences named groups first, then appends unnamed groups in first-seen order", () => {
    const groups = groupWorkbenchItems(items, keyOf, ["c", "a"]);
    expect(groups.map((group) => group.id)).toEqual(["c", "a", "b"]);
  });

  it("drops an ordered group name with no items instead of emitting an empty group", () => {
    const groups = groupWorkbenchItems(items, keyOf, ["z", "a"]);
    expect(groups.map((group) => group.id)).toEqual(["a", "b", "c"]);
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
  });

  it("returns no groups for an empty item list", () => {
    expect(groupWorkbenchItems([], keyOf, ["a", "b"])).toEqual([]);
  });
});

describe("WorkbenchGroupSection", () => {
  function render(open: boolean) {
    return renderToStaticMarkup(
      <WorkbenchGroupSection label="Plans" count={2} open={open} onOpenChange={() => {}}>
        <div>child-marker</div>
      </WorkbenchGroupSection>,
    );
  }

  it("renders its children when open", () => {
    const markup = render(true);
    expect(markup).toContain("child-marker");
    expect(markup).toContain("Plans");
    expect(markup).toContain("2");
  });

  it("omits its children when closed", () => {
    const markup = render(false);
    expect(markup).not.toContain("child-marker");
  });

  it("reflects open state on the trigger's aria-expanded", () => {
    expect(render(true)).toContain('aria-expanded="true"');
    expect(render(false)).toContain('aria-expanded="false"');
  });
});

describe("useWorkbenchGroupOpenState", () => {
  let renderer: ReactTestRenderer;
  let result: ReturnType<typeof useWorkbenchGroupOpenState>;
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  const environmentId = EnvironmentId.make("environment-1");

  function Probe(props: { readonly tabKey: string; readonly environmentId: EnvironmentId | null }) {
    const state = useWorkbenchGroupOpenState(props.tabKey, props.environmentId);
    useLayoutEffect(() => {
      result = state;
    });
    return null;
  }

  beforeEach(async () => {
    store.clear();
    globalThis.window = { localStorage } as unknown as Window & typeof globalThis;
    await act(() => {
      renderer = create(<Probe tabKey="plans" environmentId={environmentId} />);
    });
  });

  afterEach(async () => {
    await act(() => renderer.unmount());
  });

  it("defaults an unseen group to open", () => {
    expect(result.isGroupOpen("project:alpha")).toBe(true);
  });

  it("persists under a key scoped to the tab and environment", async () => {
    await act(() => result.setGroupOpen("project:alpha", false));
    expect(store.has("t3code:workbench-groups:plans:environment-1")).toBe(true);
    expect(store.get("t3code:workbench-groups:plans:environment-1")).toBe(
      JSON.stringify({ "project:alpha": false }),
    );
  });

  it("round-trips a persisted closed state into a fresh mount", async () => {
    await act(() => result.setGroupOpen("project:alpha", false));
    await act(() => renderer.unmount());
    await act(() => {
      renderer = create(<Probe tabKey="plans" environmentId={environmentId} />);
    });
    expect(result.isGroupOpen("project:alpha")).toBe(false);
    expect(result.isGroupOpen("project:beta")).toBe(true);
  });

  it("does not persist when no environment is selected", async () => {
    await act(() => renderer.unmount());
    await act(() => {
      renderer = create(<Probe tabKey="plans" environmentId={null} />);
    });
    await act(() => result.setGroupOpen("project:alpha", false));
    expect(result.isGroupOpen("project:alpha")).toBe(false);
    expect(store.size).toBe(0);
  });
});
