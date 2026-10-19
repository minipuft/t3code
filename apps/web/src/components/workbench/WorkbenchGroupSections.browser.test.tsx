import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useWorkbenchGroupOpenState, WorkbenchGroupSection } from "./WorkbenchGroupSections";

let root: Root;
let container: HTMLDivElement;
const environmentId = EnvironmentId.make("environment-1");
const preferenceKey = "t3code:workbench-groups:plans:environment-1";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.removeItem(preferenceKey);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  window.localStorage.removeItem(preferenceKey);
  vi.unstubAllGlobals();
});

const trigger = () =>
  container.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;

async function renderSection(open: boolean) {
  await act(() =>
    root.render(
      <WorkbenchGroupSection label="Plans" count={2} open={open} onOpenChange={() => {}}>
        <div>child-marker</div>
      </WorkbenchGroupSection>,
    ),
  );
}

describe("WorkbenchGroupSection", () => {
  it("renders its children when open", async () => {
    await renderSection(true);
    expect(container.textContent).toContain("child-marker");
    expect(trigger().textContent).toContain("Plans");
    expect(trigger().textContent).toContain("2");
  });

  it("omits its children when closed", async () => {
    await renderSection(false);
    expect(container.textContent).not.toContain("child-marker");
  });

  it("reflects open state on the trigger's aria-expanded", async () => {
    await renderSection(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    await renderSection(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});

function Probe(props: { readonly environmentId: EnvironmentId | null }) {
  const state = useWorkbenchGroupOpenState("plans", props.environmentId);
  return (
    <WorkbenchGroupSection
      label="Plans"
      count={2}
      open={state.isGroupOpen("project:alpha")}
      onOpenChange={(open) => state.setGroupOpen("project:alpha", open)}
    >
      <div>child-marker</div>
    </WorkbenchGroupSection>
  );
}

describe("useWorkbenchGroupOpenState", () => {
  beforeEach(async () => {
    await act(() => root.render(<Probe environmentId={environmentId} />));
  });

  it("defaults an unseen group to open", () => {
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("persists under a key scoped to the tab and environment", async () => {
    await act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(preferenceKey)).toBe(
      JSON.stringify({ "project:alpha": false }),
    );
  });

  it("round-trips a persisted closed state into a fresh mount", async () => {
    await act(() => trigger().click());
    await act(() => root.render(<Probe key="fresh" environmentId={environmentId} />));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("does not persist when no environment is selected", async () => {
    await act(() => root.render(<Probe key="no-environment" environmentId={null} />));
    await act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(preferenceKey)).toBeNull();
  });
});
