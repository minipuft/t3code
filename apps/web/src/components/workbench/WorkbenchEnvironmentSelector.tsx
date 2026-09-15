import type { EnvironmentId } from "@t3tools/contracts";
import { CloudIcon, MonitorIcon } from "lucide-react";

import type { EnvironmentPresentation } from "../../state/environments";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export function WorkbenchEnvironmentSelector(props: {
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
