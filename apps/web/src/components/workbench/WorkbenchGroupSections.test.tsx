import { describe, expect, it } from "vite-plus/test";

import { groupWorkbenchItems } from "./WorkbenchGroupSections";

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
