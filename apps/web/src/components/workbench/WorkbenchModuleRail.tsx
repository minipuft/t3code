import { BlocksIcon, BracesIcon, FileTextIcon, Settings2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import type { WorkbenchModule } from "../../workbenchCatalog";

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
