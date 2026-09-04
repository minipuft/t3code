import type { EnvironmentId } from "@t3tools/contracts";

import { useWorkflowCatalog } from "../../state/workflowCatalog";
import { ScrollArea } from "../ui/scroll-area";
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
