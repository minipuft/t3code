import type { EnvironmentId } from "@t3tools/contracts";
import {
  ActivityIcon,
  BlocksIcon,
  BracesIcon,
  CloudIcon,
  FileTextIcon,
  MonitorIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
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
import { WorkbenchVitalsPanel } from "./WorkbenchVitalsPanel";
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
  { id: "vitals", label: "Vitals", icon: <ActivityIcon /> },
];

export function WorkbenchPage(props: {
  readonly activeModule: WorkbenchModule;
  readonly onModuleChange: (module: WorkbenchModule) => void;
}) {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
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
            {props.activeModule === "vitals" ? (
              effectiveEnvironmentId === null ? (
                <WorkbenchEmptyState
                  title="No environment is connected"
                  description="Connect an environment before reading usage and quota."
                />
              ) : (
                <WorkbenchVitalsPanel environmentId={effectiveEnvironmentId} />
              )
            ) : null}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
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
