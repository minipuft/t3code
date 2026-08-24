import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPage } from "../components/workbench/WorkbenchPage";
import { parseWorkbenchModule } from "../workbenchCatalog";

function WorkbenchRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorkbenchPage
      activeModule={search.module}
      onModuleChange={(module) => void navigate({ search: { module }, replace: true })}
    />
  );
}

export const Route = createFileRoute("/workbench")({
  validateSearch: (search: Record<string, unknown>) => ({
    module: parseWorkbenchModule(search.module),
  }),
  component: WorkbenchRoute,
});
