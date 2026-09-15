import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { isElectron } from "../../env";
import { useProjects } from "../../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { selectWorkbenchEnvironment, type WorkbenchModule } from "../../workbenchCatalog";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { WorkbenchCatalogPanel } from "./WorkbenchCatalogView";
import { WorkbenchEmptyState } from "./WorkbenchEmptyState";
import { WorkbenchEnvironmentSelector } from "./WorkbenchEnvironmentSelector";
import { WorkbenchModuleRail } from "./WorkbenchModuleRail";
import { WorkbenchPlansPanel } from "./WorkbenchPlansPanel";
import {
  resolveWorkbenchProjectSelection,
  useWorkbenchProjectLens,
  WorkbenchProjectLensSelector,
} from "./WorkbenchProjectLens";
import { WorkbenchSystemPanel } from "./WorkbenchSystemPanel";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";

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
  const { selectedProjectId, pinnedProjectIds, selectProject, togglePin } = useWorkbenchProjectLens(
    {
      environmentId: effectiveEnvironmentId,
      highlightedProjectId: props.highlightedProjectId,
    },
  );

  const effectiveProjectId = resolveWorkbenchProjectSelection({
    ...(props.highlightedProjectId === undefined
      ? {}
      : { highlightedProjectId: props.highlightedProjectId }),
    ...(selectedProjectId === undefined ? {} : { selectedProjectId }),
    availableProjectIds: environmentProjects.map((project) => project.id),
  });

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
            <WorkbenchEnvironmentSelector
              environments={environments}
              primaryEnvironmentId={primaryEnvironmentId}
              selectedEnvironment={selectedEnvironment}
              onChange={setSelectedEnvironmentId}
            />
            {effectiveEnvironmentId !== null ? (
              <WorkbenchProjectLensSelector
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
