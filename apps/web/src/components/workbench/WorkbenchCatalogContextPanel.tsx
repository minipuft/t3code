import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";

import { useWorkflowCatalog } from "../../state/workflowCatalog";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { WorkbenchCatalogView } from "./WorkbenchCatalogView";

export function WorkbenchCatalogContextPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly module: "prompts" | "skills";
  readonly onInsertInvocation: (invocation: string) => void;
}) {
  const catalog = useWorkflowCatalog(props.environmentId);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
          <span className="text-muted-foreground text-xs">
            Rules, hooks, imports, and reviewed changes
          </span>
          <Button
            size="xs"
            variant="outline"
            render={<Link to="/workbench" search={{ module: "library" }} />}
          >
            Open library
          </Button>
        </div>
        <WorkbenchCatalogView
          data={catalog.data}
          error={catalog.error}
          environmentId={props.environmentId}
          isPending={catalog.isPending}
          module={props.module}
          onRefresh={catalog.refresh}
          onInsertInvocation={props.onInsertInvocation}
          variant="compact"
        />
      </div>
    </ScrollArea>
  );
}
