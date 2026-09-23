import type { AdvertisedEndpoint, DesktopTailscaleServeStatus } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { buildTailscaleServeRowModel } from "./tailscaleServeRowModel";

function tailscaleEndpoint(input: {
  readonly host: string;
  readonly label?: string;
  readonly status: AdvertisedEndpoint["status"];
  readonly description?: string;
}): AdvertisedEndpoint {
  const httpBaseUrl = `https://${input.host}`;
  return {
    id: `tailscale-magicdns:${httpBaseUrl}`,
    label: input.label ?? "Tailscale HTTPS",
    provider: { id: "tailscale", label: "Tailscale", kind: "private-network", isAddon: true },
    httpBaseUrl,
    wsBaseUrl: `wss://${input.host}`,
    reachability: "private-network",
    compatibility: { hostedHttpsApp: "compatible", desktopApp: "compatible" },
    source: "desktop-addon",
    status: input.status,
    ...(input.description ? { description: input.description } : {}),
  };
}

const lanEndpoint = {
  ...tailscaleEndpoint({ host: "192.168.1.2:3773", status: "available" }),
  id: "desktop-lan:http://192.168.1.2:3773",
  label: "Local network",
} satisfies AdvertisedEndpoint;

function status(
  device: DesktopTailscaleServeStatus["device"],
  outcome: DesktopTailscaleServeStatus["outcome"],
  message: string | null = null,
): DesktopTailscaleServeStatus {
  return { device, outcome, message };
}

describe("buildTailscaleServeRowModel", () => {
  it("shows nothing and no Retry while Serve is disabled", () => {
    expect(
      buildTailscaleServeRowModel({
        enabled: false,
        endpoints: [tailscaleEndpoint({ host: "box.ts.net", status: "unavailable" })],
        statuses: [status("native", "failed", "boom")],
      }),
    ).toEqual({ lines: [], showRetry: false });
  });

  it("shows the URL of a reachable endpoint without Retry", () => {
    const model = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [lanEndpoint, tailscaleEndpoint({ host: "box.ts.net", status: "available" })],
      statuses: [status("native", "active")],
    });
    expect(model.lines.map((line) => [line.text, line.isError])).toEqual([
      ["https://box.ts.net", false],
    ]);
    expect(model.showRetry).toBe(false);
  });

  it("shows an unreachable endpoint's description, flagging it as an error only when its daemon failed", () => {
    const waiting = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [
        tailscaleEndpoint({
          host: "box.ts.net",
          status: "unavailable",
          description: "Waiting for the certificate.",
        }),
      ],
      statuses: [status("native", "active")],
    });
    expect(waiting.lines).toEqual([
      {
        key: "tailscale-magicdns:https://box.ts.net",
        text: "Waiting for the certificate.",
        isError: false,
      },
    ]);
    expect(waiting.showRetry).toBe(true);

    const failed = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [
        tailscaleEndpoint({ host: "box.ts.net", status: "unavailable", description: "denied" }),
      ],
      statuses: [status("native", "failed", "denied")],
    });
    expect(failed.lines.map((line) => [line.text, line.isError])).toEqual([["denied", true]]);
    expect(failed.showRetry).toBe(true);
  });

  it("prefixes each device when two endpoints are advertised and reports the failed one", () => {
    const model = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [
        tailscaleEndpoint({
          host: "wsl.ts.net",
          label: "Tailscale HTTPS (WSL)",
          status: "available",
        }),
        tailscaleEndpoint({
          host: "win.ts.net",
          label: "Tailscale HTTPS (Windows)",
          status: "unavailable",
          description: "Serve is not enabled on your tailnet.",
        }),
      ],
      statuses: [
        status("wsl", "active"),
        status("native", "failed", "Serve is not enabled on your tailnet."),
      ],
    });
    expect(model.lines.map((line) => [line.text, line.isError])).toEqual([
      ["WSL: https://wsl.ts.net", false],
      ["Windows: Serve is not enabled on your tailnet.", true],
    ]);
    expect(model.showRetry).toBe(true);
  });

  it("surfaces a failed daemon that has no MagicDNS endpoint", () => {
    const model = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [
        tailscaleEndpoint({
          host: "wsl.ts.net",
          label: "Tailscale HTTPS (WSL)",
          status: "available",
        }),
      ],
      statuses: [status("wsl", "active"), status("native", "failed", "tailscaled is not running")],
    });
    expect(model.lines.map((line) => [line.text, line.isError])).toEqual([
      ["WSL: https://wsl.ts.net", false],
      ["Windows: tailscaled is not running", true],
    ]);
    expect(model.showRetry).toBe(true);
  });

  it("reports a lone failure with no endpoint at all, falling back when it has no message", () => {
    const model = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [],
      statuses: [status("native", "failed")],
    });
    expect(model).toEqual({
      lines: [{ key: "status:native", text: "Tailscale Serve failed.", isError: true }],
      showRetry: true,
    });
  });

  it("says Serve is setting up while a daemon applies before it has an address", () => {
    const model = buildTailscaleServeRowModel({
      enabled: true,
      endpoints: [],
      statuses: [status("wsl", "applying")],
    });
    expect(model.lines.map((line) => line.text)).toEqual(["Setting up Tailscale Serve…"]);
    expect(model.showRetry).toBe(false);
  });

  it("offers Retry when enabled but no Tailscale device answered", () => {
    const model = buildTailscaleServeRowModel({ enabled: true, endpoints: [], statuses: [] });
    expect(model.lines).toHaveLength(1);
    expect(model.lines[0]?.isError).toBe(false);
    expect(model.showRetry).toBe(true);
  });
});
