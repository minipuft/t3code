import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { act, render, type Screen } from "../../../test/render";
import { useWorkbenchGroupOpenState, WorkbenchGroupSection } from "./WorkbenchGroupSections";

const environmentId = EnvironmentId.make("environment-1");
const preferenceKey = "t3code:workbench-groups:plans:environment-1";

function cleanPreference(): Disposable {
  window.localStorage.removeItem(preferenceKey);
  return { [Symbol.dispose]: () => window.localStorage.removeItem(preferenceKey) };
}

const trigger = (screen: Screen) =>
  screen.container.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!;

const section = (open: boolean) => (
  <WorkbenchGroupSection label="Plans" count={2} open={open} onOpenChange={() => {}}>
    <div>child-marker</div>
  </WorkbenchGroupSection>
);

describe("WorkbenchGroupSection", () => {
  it("renders its children when open", async () => {
    await using screen = await render(section(true), { router: false });
    expect(screen.container.textContent).toContain("child-marker");
    expect(trigger(screen).textContent).toContain("Plans");
    expect(trigger(screen).textContent).toContain("2");
  });

  it("omits its children when closed", async () => {
    await using screen = await render(section(false), { router: false });
    expect(screen.container.textContent).not.toContain("child-marker");
  });

  it("reflects open state on the trigger's aria-expanded", async () => {
    await using screen = await render(section(true), { router: false });
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("true");
    await screen.rerender(section(false));
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("false");
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
  const renderProbe = (id: EnvironmentId | null, key?: string) =>
    render(<Probe key={key} environmentId={id} />, { router: false });

  it("defaults an unseen group to open", async () => {
    using _preference = cleanPreference();
    await using screen = await renderProbe(environmentId);
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("true");
  });

  it("persists under a key scoped to the tab and environment", async () => {
    using _preference = cleanPreference();
    await using screen = await renderProbe(environmentId);
    await act(() => trigger(screen).click());
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(preferenceKey)).toBe(
      JSON.stringify({ "project:alpha": false }),
    );
  });

  it("round-trips a persisted closed state into a fresh mount", async () => {
    using _preference = cleanPreference();
    await using screen = await renderProbe(environmentId);
    await act(() => trigger(screen).click());
    await screen.rerender(<Probe key="fresh" environmentId={environmentId} />);
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("false");
    await act(() => trigger(screen).click());
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("true");
  });

  it("does not persist when no environment is selected", async () => {
    using _preference = cleanPreference();
    await using screen = await renderProbe(null, "no-environment");
    await act(() => trigger(screen).click());
    expect(trigger(screen).getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(preferenceKey)).toBeNull();
  });
});
