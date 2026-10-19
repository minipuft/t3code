import {
  WorkflowPresetId,
  type EnvironmentId,
  type ScopedProjectRef,
  type ScopedThreadRef,
  type WorkflowCatalogItemId,
  type WorkflowPresetId as WorkflowPresetIdType,
  type WorkflowPromptSummary,
} from "@t3tools/contracts";
import { useRef, useState } from "react";

import { type ComposerTrigger, filterDismissedWorkflowTrigger } from "../../composer-logic";
import { useWorkflowCatalog, useWorkflowLibraryPreferences } from "../../state/workflowCatalog";
import { projectWorkflowLibrary, shouldShowWorkflowActions } from "../../workflowInvocation";
import { randomUUID } from "../../lib/utils";
import { useWorkflowRecents, useWorkflowRecentsStore } from "../../workflowRecentsStore";

export function useComposerWorkflowPicker(input: {
  readonly environmentId: EnvironmentId;
  readonly projectRef: ScopedProjectRef | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly prompt: string;
  readonly trigger: ComposerTrigger | null;
  readonly setTrigger: (trigger: ComposerTrigger | null) => void;
  readonly scheduleComposerFocus: () => void;
}) {
  const catalog = useWorkflowCatalog(input.environmentId);
  const {
    preferences,
    canMutate: canMutatePreferences,
    mutate: mutatePreferences,
  } = useWorkflowLibraryPreferences(input.environmentId);
  const recents = useWorkflowRecents({
    projectRef: input.projectRef,
    threadRef: input.threadRef,
  });
  const [openedFromAction, setOpenedFromAction] = useState(false);
  const dismissedTriggerStartRef = useRef<number | null>(null);
  const triggerIsOpen = input.trigger?.kind === "workflow";
  const library = projectWorkflowLibrary({
    items: catalog.data?.items ?? [],
    preferences,
    recentItemIds: recents.map((entry) => entry.itemId),
  });

  const togglePin = (itemId: WorkflowCatalogItemId) => {
    if (!canMutatePreferences) return;
    const pinned = preferences.pinnedItemIds.includes(itemId);
    void mutatePreferences({
      type: pinned ? "workflow.unpin" : "workflow.pin",
      itemId,
    });
  };

  const savePreset = (preset: {
    readonly id?: WorkflowPresetIdType;
    readonly item: WorkflowPromptSummary;
    readonly label: string;
    readonly values: Readonly<Record<string, string>>;
  }) => {
    if (!canMutatePreferences) return null;
    const values = Object.fromEntries(
      Object.entries(preset.values).filter(([, value]) => value.trim().length > 0),
    );
    const presetId = preset.id ?? WorkflowPresetId.make(randomUUID());
    void mutatePreferences({
      type: "workflow.preset.upsert",
      preset: {
        id: presetId,
        label: preset.label.trim(),
        itemId: preset.item.id,
        itemRevision: preset.item.revision,
        values,
      },
    });
    return presetId;
  };

  const removePreset = (presetId: WorkflowPresetIdType) => {
    if (!canMutatePreferences) return;
    void mutatePreferences({ type: "workflow.preset.remove", presetId });
  };

  const recordRecent = (itemId: WorkflowCatalogItemId) => {
    if (input.projectRef === null) return;
    useWorkflowRecentsStore.getState().record({
      projectRef: input.projectRef,
      threadRef: input.threadRef,
      itemId,
    });
  };

  const filterTrigger = (trigger: ComposerTrigger | null) => {
    const filtered = filterDismissedWorkflowTrigger(trigger, dismissedTriggerStartRef.current);
    dismissedTriggerStartRef.current = filtered.dismissedRangeStart;
    return filtered.trigger;
  };

  const close = () => {
    setOpenedFromAction(false);
    if (input.trigger?.kind === "workflow") {
      dismissedTriggerStartRef.current = input.trigger.rangeStart;
      input.setTrigger(null);
    }
    input.scheduleComposerFocus();
  };

  const toggleFromAction = () => {
    dismissedTriggerStartRef.current = null;
    input.setTrigger(null);
    setOpenedFromAction((open) => !open);
    input.scheduleComposerFocus();
  };

  const closeAfterInsert = (focusComposer = true) => {
    dismissedTriggerStartRef.current = null;
    setOpenedFromAction(false);
    if (focusComposer) input.scheduleComposerFocus();
  };

  return {
    catalog,
    library,
    canMutatePreferences,
    togglePin,
    savePreset,
    removePreset,
    recordRecent,
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
