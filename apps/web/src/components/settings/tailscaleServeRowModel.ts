import type { AdvertisedEndpoint, DesktopTailscaleServeStatus } from "@t3tools/contracts";

type TailscaleServeDaemon = DesktopTailscaleServeStatus["device"];

export interface TailscaleServeRowLine {
  readonly key: string;
  readonly text: string;
  readonly isError: boolean;
}

export interface TailscaleServeRowModel {
  /** Empty when Serve is disabled; the row then shows its setup hint instead. */
  readonly lines: ReadonlyArray<TailscaleServeRowLine>;
  readonly showRetry: boolean;
}

const DAEMON_LABEL: Record<TailscaleServeDaemon, string> = {
  wsl: "WSL",
  native: "Windows",
};

export function isTailscaleHttpsEndpoint(endpoint: AdvertisedEndpoint): boolean {
  return endpoint.id.startsWith("tailscale-magicdns:");
}

/**
 * Endpoints carry no daemon field, so the daemon is recovered the way the
 * desktop labels them: a lone status owns the lone unsuffixed endpoint,
 * otherwise "Tailscale HTTPS (WSL)" is the WSL daemon and any other suffix
 * is the host OS daemon.
 */
function daemonOfEndpoint(
  endpoint: AdvertisedEndpoint,
  statuses: ReadonlyArray<DesktopTailscaleServeStatus>,
): TailscaleServeDaemon | null {
  const [only] = statuses;
  if (statuses.length === 1 && only) return only.device;
  const suffix = endpointPrefix(endpoint);
  if (suffix === null) return null;
  return suffix === "WSL" ? "wsl" : "native";
}

function endpointPrefix(endpoint: AdvertisedEndpoint): string | null {
  return /\(([^)]+)\)$/u.exec(endpoint.label)?.[1] ?? null;
}

function withPrefix(prefix: string | null, text: string): string {
  return prefix ? `${prefix}: ${text}` : text;
}

/**
 * What the Tailscale HTTPS settings row shows while Serve is enabled: one
 * line per advertised HTTPS endpoint (its URL once reachable, else the
 * desktop's own progress/failure text), plus the failure message of any
 * daemon that failed before it had a MagicDNS name to advertise.
 */
export function buildTailscaleServeRowModel(input: {
  readonly enabled: boolean;
  readonly endpoints: ReadonlyArray<AdvertisedEndpoint>;
  readonly statuses: ReadonlyArray<DesktopTailscaleServeStatus>;
}): TailscaleServeRowModel {
  if (!input.enabled) return { lines: [], showRetry: false };

  const endpoints = input.endpoints.filter(isTailscaleHttpsEndpoint);
  const failedDaemons = new Set(
    input.statuses.filter((status) => status.outcome === "failed").map((status) => status.device),
  );
  const multiple = Math.max(endpoints.length, input.statuses.length) > 1;
  const coveredDaemons = new Set<TailscaleServeDaemon>();
  const lines: TailscaleServeRowLine[] = [];

  for (const endpoint of endpoints) {
    const daemon = daemonOfEndpoint(endpoint, input.statuses);
    if (daemon) coveredDaemons.add(daemon);
    const isAvailable = endpoint.status === "available";
    const text = isAvailable
      ? endpoint.httpBaseUrl
      : (endpoint.description ?? "Tailscale HTTPS is not reachable yet.");
    lines.push({
      key: endpoint.id,
      text: withPrefix(multiple ? endpointPrefix(endpoint) : null, text),
      isError: !isAvailable && daemon !== null && failedDaemons.has(daemon),
    });
  }

  for (const status of input.statuses) {
    if (status.outcome !== "failed" || coveredDaemons.has(status.device)) continue;
    lines.push({
      key: `status:${status.device}`,
      text: withPrefix(
        multiple ? DAEMON_LABEL[status.device] : null,
        status.message ?? "Tailscale Serve failed.",
      ),
      isError: true,
    });
  }

  // Nothing advertised and nothing failed: either a daemon is still applying,
  // or no Tailscale daemon answered at all (not running, not logged in).
  if (lines.length === 0) {
    const isApplying = input.statuses.some((status) => status.outcome === "applying");
    return {
      lines: [
        {
          key: "pending",
          text: isApplying
            ? "Setting up Tailscale Serve…"
            : "Waiting for Tailscale to report a MagicDNS address. Make sure Tailscale is running.",
          isError: false,
        },
      ],
      showRetry: !isApplying,
    };
  }

  return {
    lines,
    showRetry:
      failedDaemons.size > 0 || endpoints.some((endpoint) => endpoint.status !== "available"),
  };
}
