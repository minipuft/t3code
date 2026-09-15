import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useProjects } from "../../state/entities";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

/**
 * Every localStorage key the workbench project lens owns is derived here, so the
 * selection and its pins cannot drift apart when either key changes.
 */
const PROJECT_LENS_KEY_PREFIX = "t3code:workbench-project:";
const projectLensKey = (environmentId: EnvironmentId) =>
  `${PROJECT_LENS_KEY_PREFIX}${environmentId}`;
const projectLensPinsKey = (preferenceKey: string) => `${preferenceKey}:pins`;

/**
 * Holds the lens selection and its pins for one environment, restoring both from
 * local preferences unless an explicit highlighted project overrides them.
 */
export function useWorkbenchProjectLens(input: {
  readonly environmentId: EnvironmentId | null;
  readonly highlightedProjectId: ProjectId | undefined;
}) {
  const preferenceKey = input.environmentId === null ? null : projectLensKey(input.environmentId);
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null | undefined>(
    input.highlightedProjectId,
  );
  const [pinnedProjectIds, setPinnedProjectIds] = useState<readonly ProjectId[]>([]);
  const highlightedProjectId = input.highlightedProjectId;

  useEffect(() => {
    if (preferenceKey === null || highlightedProjectId !== undefined) return;
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      setSelectedProjectId(
        saved === null || saved === "all"
          ? undefined
          : saved === "unattributed"
            ? null
            : ProjectId.make(saved),
      );
      const pins = JSON.parse(
        window.localStorage.getItem(projectLensPinsKey(preferenceKey)) ?? "[]",
      );
      setPinnedProjectIds(
        Array.isArray(pins)
          ? pins
              .filter((value): value is ProjectId => typeof value === "string")
              .map((value) => ProjectId.make(value))
          : [],
      );
    } catch {
      setSelectedProjectId(undefined);
      setPinnedProjectIds([]);
    }
  }, [preferenceKey, highlightedProjectId]);

  const selectProject = (projectId: ProjectId | null | undefined) => {
    setSelectedProjectId(projectId);
    if (preferenceKey === null) return;
    try {
      window.localStorage.setItem(
        preferenceKey,
        projectId === undefined ? "all" : projectId === null ? "unattributed" : projectId,
      );
    } catch {
      // Local preferences remain usable for this session when storage is blocked.
    }
  };

  const togglePin = (projectId: ProjectId) => {
    const next = pinnedProjectIds.includes(projectId)
      ? pinnedProjectIds.filter((id) => id !== projectId)
      : [...pinnedProjectIds, projectId];
    setPinnedProjectIds(next);
    if (preferenceKey !== null) {
      try {
        window.localStorage.setItem(projectLensPinsKey(preferenceKey), JSON.stringify(next));
      } catch {}
    }
  };

  return { selectedProjectId, pinnedProjectIds, selectProject, togglePin };
}

export function resolveWorkbenchProjectSelection(input: {
  readonly highlightedProjectId?: ProjectId;
  readonly selectedProjectId?: ProjectId | null;
  readonly availableProjectIds: readonly ProjectId[];
}): ProjectId | null | undefined {
  if (
    input.highlightedProjectId !== undefined &&
    input.availableProjectIds.includes(input.highlightedProjectId)
  )
    return input.highlightedProjectId;
  if (input.selectedProjectId === null) return null;
  if (
    input.selectedProjectId !== undefined &&
    input.availableProjectIds.includes(input.selectedProjectId)
  )
    return input.selectedProjectId;
  return undefined;
}

export function WorkbenchProjectLensSelector(props: {
  readonly projects: ReturnType<typeof useProjects>;
  readonly selectedProjectId: ProjectId | null | undefined;
  readonly pinnedProjectIds: readonly ProjectId[];
  readonly onChange: (projectId: ProjectId | null | undefined) => void;
  readonly onTogglePin: (projectId: ProjectId) => void;
}) {
  const ordered = [...props.projects].sort(
    (a, b) =>
      Number(props.pinnedProjectIds.includes(b.id)) -
        Number(props.pinnedProjectIds.includes(a.id)) || a.title.localeCompare(b.title),
  );
  const value =
    props.selectedProjectId === undefined
      ? "all"
      : props.selectedProjectId === null
        ? "unattributed"
        : props.selectedProjectId;
  return (
    <div className="flex items-center gap-1">
      <Select
        value={value}
        onValueChange={(next) =>
          props.onChange(
            next === null || next === "all"
              ? undefined
              : next === "unattributed"
                ? null
                : ProjectId.make(next),
          )
        }
      >
        <SelectTrigger
          aria-label="Workbench project lens"
          className="min-w-0 max-w-56"
          size="compact"
          variant="ghost"
        >
          <SelectValue>
            {value === "all"
              ? "All Projects"
              : value === "unattributed"
                ? "Unattributed"
                : (props.projects.find((project) => project.id === value)?.title ?? "All Projects")}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup align="end">
          <SelectGroup>
            <SelectGroupLabel>Project lens</SelectGroupLabel>
            <SelectItem value="all">All Projects</SelectItem>
            <SelectItem value="unattributed">Unattributed</SelectItem>
            {ordered.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {props.pinnedProjectIds.includes(project.id) ? "★ " : ""}
                {project.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectPopup>
      </Select>
      {props.selectedProjectId !== undefined && props.selectedProjectId !== null ? (
        <button
          type="button"
          className="rounded px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => props.onTogglePin(props.selectedProjectId!)}
        >
          {props.pinnedProjectIds.includes(props.selectedProjectId) ? "Unpin" : "Pin"}
        </button>
      ) : null}
    </div>
  );
}
