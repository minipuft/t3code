import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import {
  BlocksIcon,
  BracesIcon,
  CloudIcon,
  FileTextIcon,
  MonitorIcon,
  Settings2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { useProjects } from "../../state/entities";
import {
  useEnvironments,
  usePrimaryEnvironmentId,
  type EnvironmentPresentation,
} from "../../state/environments";
import { selectWorkbenchEnvironment, type WorkbenchModule } from "../../workbenchCatalog";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkbenchCatalogPanel } from "./WorkbenchCatalogView";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { WorkbenchPlansPanel } from "./WorkbenchPlansPanel";
import { WorkbenchSystemPanel } from "./WorkbenchSystemPanel";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SidebarInset } from "../ui/sidebar";

const MODULES: ReadonlyArray<{
  readonly id: WorkbenchModule;
  readonly label: string;
  readonly icon: ReactNode;
}> = [
  { id: "plans", label: "Plans", icon: <FileTextIcon /> },
  { id: "prompts", label: "Prompts", icon: <BracesIcon /> },
  { id: "skills", label: "Skills", icon: <BlocksIcon /> },
  { id: "system", label: "System", icon: <Settings2Icon /> },
];

export function WorkbenchPage(props: {
  readonly activeModule: WorkbenchModule;
  readonly onModuleChange: (module: WorkbenchModule) => void;
  readonly highlightedEnvironmentId?: EnvironmentId | undefined;
  readonly highlightedProjectId?: ProjectId | undefined;
}) {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(
    props.highlightedEnvironmentId ?? null,
  );
  const effectiveEnvironmentId = selectWorkbenchEnvironment({
    selectedEnvironmentId,
    primaryEnvironmentId,
    environments,
  });

  useEffect(() => {
    if (selectedEnvironmentId !== effectiveEnvironmentId) {
      setSelectedEnvironmentId(effectiveEnvironmentId);
    }
  }, [effectiveEnvironmentId, selectedEnvironmentId]);

  const selectedEnvironment =
    environments.find((environment) => environment.environmentId === effectiveEnvironmentId) ??
    null;
  const environmentProjects = useMemo(
    () => projects.filter((project) => project.environmentId === effectiveEnvironmentId),
    [effectiveEnvironmentId, projects],
  );
  const preferenceKey =
    effectiveEnvironmentId === null ? null : `t3code:workbench-project:${effectiveEnvironmentId}`;
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null | undefined>(
    props.highlightedProjectId,
  );
  const [pinnedProjectIds, setPinnedProjectIds] = useState<readonly ProjectId[]>([]);

  useEffect(() => {
    if (preferenceKey === null || props.highlightedProjectId !== undefined) return;
    try {
      const saved = window.localStorage.getItem(preferenceKey);
      setSelectedProjectId(
        saved === null || saved === "all"
          ? undefined
          : saved === "unattributed"
            ? null
            : ProjectId.make(saved),
      );
      const pins = JSON.parse(window.localStorage.getItem(`${preferenceKey}:pins`) ?? "[]");
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
  }, [preferenceKey, props.highlightedProjectId]);

  const effectiveProjectId = resolveWorkbenchProjectSelection({
    ...(props.highlightedProjectId === undefined
      ? {}
      : { highlightedProjectId: props.highlightedProjectId }),
    ...(selectedProjectId === undefined ? {} : { selectedProjectId }),
    availableProjectIds: environmentProjects.map((project) => project.id),
  });

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
        window.localStorage.setItem(`${preferenceKey}:pins`, JSON.stringify(next));
      } catch {}
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron}>
          <div className="flex w-full min-w-0 items-center gap-3">
            <WorkspaceBreadcrumb ariaLabel="Agent Workbench breadcrumb" className="min-w-0">
              <WorkspaceBreadcrumbItem current>
                <h1>Agent Workbench</h1>
              </WorkspaceBreadcrumbItem>
            </WorkspaceBreadcrumb>
            <EnvironmentSelector
              environments={environments}
              primaryEnvironmentId={primaryEnvironmentId}
              selectedEnvironment={selectedEnvironment}
              onChange={setSelectedEnvironmentId}
            />
            {effectiveEnvironmentId !== null ? (
              <ProjectLensSelector
                projects={environmentProjects}
                selectedProjectId={effectiveProjectId}
                pinnedProjectIds={pinnedProjectIds}
                onChange={selectProject}
                onTogglePin={togglePin}
              />
            ) : null}
          </div>
        </WorkspacePageHeader>

        <WorkbenchModuleRail activeModule={props.activeModule} onChange={props.onModuleChange} />

        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="expanded" className="pt-5">
            {props.activeModule === "plans" ? (
              effectiveEnvironmentId === null ? (
                <WorkbenchEmptyState
                  title="No environment is connected"
                  description="Connect an environment before browsing plans."
                />
              ) : (
                <WorkbenchPlansPanel
                  key={`${effectiveEnvironmentId}:plans`}
                  environmentId={effectiveEnvironmentId}
                />
              )
            ) : null}
            {props.activeModule === "prompts" || props.activeModule === "skills" ? (
              effectiveEnvironmentId === null ? (
                <WorkbenchEmptyState
                  title="No environment is connected"
                  description="Connect an environment before browsing prompts and skills."
                />
              ) : (
                <WorkbenchCatalogPanel
                  key={`${effectiveEnvironmentId}:${props.activeModule}`}
                  environmentId={effectiveEnvironmentId}
                  module={props.activeModule}
                />
              )
            ) : null}
            {props.activeModule === "system" ? (
              effectiveEnvironmentId === null ? (
                <WorkbenchEmptyState
                  title="No environment is connected"
                  description="Connect an environment before browsing system resources."
                />
              ) : (
                <WorkbenchSystemPanel
                  key={`${effectiveEnvironmentId}:system`}
                  environmentId={effectiveEnvironmentId}
                  directLocal={selectedEnvironment?.entry.target._tag === "PrimaryConnectionTarget"}
                />
              )
            ) : null}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
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

function ProjectLensSelector(props: {
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

export function WorkbenchModuleRail(props: {
  readonly activeModule: WorkbenchModule;
  readonly onChange: (module: WorkbenchModule) => void;
}) {
  return (
    <nav
      aria-label="Workbench modules"
      className="shrink-0 overflow-x-auto border-y border-border/50 bg-muted/16 px-3 sm:px-5"
    >
      <div className="mx-auto flex min-w-max max-w-6xl items-center gap-1 py-1.5">
        {MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            aria-current={props.activeModule === module.id ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-3 font-medium text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              props.activeModule === module.id
                ? "bg-primary/12 text-foreground [&_svg]:text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => props.onChange(module.id)}
          >
            <span className="[&_svg]:size-3.5" aria-hidden="true">
              {module.icon}
            </span>
            {module.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function EnvironmentSelector(props: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly selectedEnvironment: EnvironmentPresentation | null;
  readonly onChange: (environmentId: EnvironmentId) => void;
}) {
  if (props.selectedEnvironment === null) {
    return <span className="ms-auto text-muted-foreground text-xs">No environment</span>;
  }
  if (props.environments.length === 1) {
    return (
      <span className="ms-auto flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
        <MonitorIcon className="size-3.5 shrink-0" />
        <span className="truncate">{props.selectedEnvironment.label}</span>
      </span>
    );
  }
  return (
    <Select
      value={props.selectedEnvironment.environmentId}
      onValueChange={(value) => props.onChange(value as EnvironmentId)}
    >
      <SelectTrigger
        aria-label="Workbench environment"
        className="ms-auto min-w-0 max-w-56"
        size="compact"
        variant="ghost"
      >
        {props.selectedEnvironment.environmentId === props.primaryEnvironmentId ? (
          <MonitorIcon className="size-3.5 shrink-0" />
        ) : (
          <CloudIcon className="size-3.5 shrink-0" />
        )}
        <SelectValue>{props.selectedEnvironment.label}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end">
        <SelectGroup>
          <SelectGroupLabel>Environment</SelectGroupLabel>
          {props.environments.map((environment) => (
            <SelectItem key={environment.environmentId} value={environment.environmentId}>
              {environment.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
}
