import type { EnvironmentId } from "@t3tools/contracts";
import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from "react";

import { type ComposerTrigger, filterDismissedWorkflowTrigger } from "../../composer-logic";
import { useWorkflowCatalog } from "../../state/workflowCatalog";
import { shouldShowWorkflowActions } from "../../workflowInvocation";

export function useComposerWorkflowPicker(input: {
  readonly environmentId: EnvironmentId;
  readonly prompt: string;
  readonly trigger: ComposerTrigger | null;
  readonly setTrigger: Dispatch<SetStateAction<ComposerTrigger | null>>;
  readonly scheduleComposerFocus: () => void;
}) {
  const catalog = useWorkflowCatalog(input.environmentId);
  const [openedFromAction, setOpenedFromAction] = useState(false);
  const dismissedTriggerStartRef = useRef<number | null>(null);
  const triggerIsOpen = input.trigger?.kind === "workflow";

  const filterTrigger = useCallback((trigger: ComposerTrigger | null) => {
    const filtered = filterDismissedWorkflowTrigger(trigger, dismissedTriggerStartRef.current);
    dismissedTriggerStartRef.current = filtered.dismissedRangeStart;
    return filtered.trigger;
  }, []);

  const close = useCallback(() => {
    setOpenedFromAction(false);
    input.setTrigger((current) => {
      if (current?.kind !== "workflow") return current;
      dismissedTriggerStartRef.current = current.rangeStart;
      return null;
    });
    input.scheduleComposerFocus();
  }, [input.scheduleComposerFocus, input.setTrigger]);

  const toggleFromAction = useCallback(() => {
    dismissedTriggerStartRef.current = null;
    input.setTrigger(null);
    setOpenedFromAction((open) => !open);
  }, [input.setTrigger]);

  const closeAfterInsert = useCallback(() => {
    dismissedTriggerStartRef.current = null;
    setOpenedFromAction(false);
    input.scheduleComposerFocus();
  }, [input.scheduleComposerFocus]);

  return {
    catalog,
    filterTrigger,
    close,
    toggleFromAction,
    closeAfterInsert,
    isOpen: openedFromAction || triggerIsOpen,
    openedFromTrigger: triggerIsOpen,
    draftText:
      triggerIsOpen && input.trigger
        ? `${input.prompt.slice(0, input.trigger.rangeStart)}${input.prompt.slice(
            input.trigger.rangeEnd,
          )}`
        : input.prompt,
    actionsVisible: shouldShowWorkflowActions(catalog.data),
  } as const;
}
