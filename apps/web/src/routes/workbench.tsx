import { createFileRoute } from "@tanstack/react-router";

import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { WorkbenchPage } from "../components/workbench/WorkbenchPage";
import { parseWorkbenchModule } from "../workbenchCatalog";

function WorkbenchRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorkbenchPage
      activeModule={search.module}
      {...(search.environmentId === undefined
        ? {}
        : { highlightedEnvironmentId: search.environmentId })}
      {...(search.projectId === undefined ? {} : { highlightedProjectId: search.projectId })}
      onModuleChange={(module) =>
        void navigate({ search: (previous) => ({ ...previous, module }), replace: true })
      }
    />
  );
}

export const Route = createFileRoute("/workbench")({
  validateSearch: (search: Record<string, unknown>) => ({
    module: parseWorkbenchModule(search.module),
    ...(typeof search.environmentId === "string"
      ? { environmentId: EnvironmentId.make(search.environmentId) }
      : {}),
    ...(typeof search.projectId === "string"
      ? { projectId: ProjectId.make(search.projectId) }
      : {}),
  }),
  component: WorkbenchRoute,
});
