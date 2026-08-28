import { AuthAccessWriteScope, EnvironmentId, WorkflowCatalogItemId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ scopes: [] as string[] }));

vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { scopes: state.scopes },
    hasError: false,
    isPending: false,
  }),
}));

vi.mock("../../state/workflowCatalog", () => ({
  useWorkflowPromptHistory: () => ({
    data: {
      state: "available",
      current_version: 2,
      versions: [
        { version: 2, date: "2026-08-28", description: "Current", diff_summary: "Current" },
        { version: 1, date: "2026-08-27", description: "Initial", diff_summary: "Initial" },
      ],
    },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkflowPromptComparison: () => ({
    data: { state: "available", diff: "+ change" },
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
  useWorkflowPromptActions: () => ({
    review: vi.fn(),
    apply: vi.fn(),
    rollback: vi.fn(),
  }),
}));

import { WorkbenchPromptGovernance } from "./WorkbenchPromptGovernance";

const render = () =>
  renderToStaticMarkup(
    <WorkbenchPromptGovernance
      environmentId={EnvironmentId.make("environment-1")}
      itemId={WorkflowCatalogItemId.make("strategicImplement")}
      currentVersion={2}
      userMessageTemplate="Implement {{ task }}"
      systemMessage={null}
      onChanged={() => {}}
    />,
  );

describe("WorkbenchPromptGovernance", () => {
  beforeEach(() => {
    state.scopes = [];
  });

  it("keeps history visible but removes mutations from read-only sessions", () => {
    const markup = render();
    expect(markup).toContain("History");
    expect(markup).toContain("Read-only session");
    expect(markup).not.toContain(" Edit</button>");
    expect(markup).not.toContain("Apply reviewed change");
  });

  it("exposes the native edit tab to administrative sessions", () => {
    state.scopes = [AuthAccessWriteScope];
    const markup = render();
    expect(markup).toContain(" Edit</button>");
    expect(markup).not.toContain("Read-only session");
  });
});
