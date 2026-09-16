import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";

/**
 * Every localStorage key a workbench tab's group open state owns is derived here,
 * so the record cannot drift between the tab and environment it was recorded under.
 */
const GROUP_OPEN_STATE_KEY_PREFIX = "t3code:workbench-groups:";
const groupOpenStateKey = (tabKey: string, environmentId: EnvironmentId) =>
  `${GROUP_OPEN_STATE_KEY_PREFIX}${tabKey}:${environmentId}`;

/**
 * Buckets `items` by `keyOf`, preserving first-seen order. When `order` is given,
 * groups it names come first in that sequence (skipping names with no items);
 * any remaining groups keep their first-seen order after it. Nesting is
 * compositional: call this again on a group's items for a second level rather
 * than adding a nesting mode.
 */
export function groupWorkbenchItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  order?: readonly string[],
): ReadonlyArray<{ readonly id: string; readonly items: readonly T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const id = keyOf(item);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(item);
    else buckets.set(id, [item]);
  }
  const orderedIds = order
    ? [
        ...order.filter((id) => buckets.has(id)),
        ...[...buckets.keys()].filter((id) => !order.includes(id)),
      ]
    : [...buckets.keys()];
  return orderedIds.map((id) => ({ id, items: buckets.get(id) ?? [] }));
}

/**
 * Persists which group ids a tab has collapsed, scoped per environment; a group id
 * with no recorded state defaults open. Nested levels share one record for the
 * tab, so give ids from different levels distinct prefixes (e.g. a project id vs.
 * a status id) to avoid collisions.
 */
export function useWorkbenchGroupOpenState(tabKey: string, environmentId: EnvironmentId | null) {
  const preferenceKey = environmentId === null ? null : groupOpenStateKey(tabKey, environmentId);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (preferenceKey === null) return;
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(preferenceKey) ?? "{}");
      setOpenState(
        saved !== null && typeof saved === "object" && !Array.isArray(saved)
          ? (saved as Record<string, boolean>)
          : {},
      );
    } catch {
      setOpenState({});
    }
  }, [preferenceKey]);

  const setGroupOpen = (groupId: string, open: boolean) => {
    const next = { ...openState, [groupId]: open };
    setOpenState(next);
    if (preferenceKey === null) return;
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      // Local preferences remain usable for this session when storage is blocked.
    }
  };

  const isGroupOpen = (groupId: string) => openState[groupId] ?? true;

  return { isGroupOpen, setGroupOpen };
}

/**
 * One collapsible group heading plus its children — an item list, or nested
 * `WorkbenchGroupSection`s for a second grouping level. Open state is owned by
 * the caller (typically `useWorkbenchGroupOpenState`), so this stays a pure shell.
 */
export function WorkbenchGroupSection(props: {
  readonly label: string;
  readonly count: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange} className="grid gap-1">
      <CollapsibleTrigger className="flex min-w-0 items-center gap-1.5 rounded-md px-3 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            props.open && "rotate-90",
          )}
        />
        <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {props.label}
        </span>
        <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">{props.count}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="grid gap-1 pt-1">{props.children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
