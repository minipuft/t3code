import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import type { AdvertisedEndpoint, AdvertisedEndpointProvider } from "@t3tools/contracts";
import { buildTailscaleHttpsBaseUrl, probeTailscaleHttpsEndpoint } from "@t3tools/tailscale";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

export { parseTailscaleMagicDnsName } from "@t3tools/tailscale";

const TAILSCALE_ENDPOINT_PROVIDER: AdvertisedEndpointProvider = {
  id: "tailscale",
  label: "Tailscale",
  kind: "private-network",
  isAddon: true,
};

/**
 * One MagicDNS candidate endpoint, already resolved by the caller (which
 * daemon, what its Tailscale Serve status is, what label it should carry).
 * This module only formats and probes -- it never spawns the Tailscale CLI.
 */
export interface TailscaleServeMagicDnsEntry {
  // Null when the daemon's MagicDNS name isn't known yet -- the caller
  // drops the entry before it reaches here.
  readonly dnsName: string | null;
  readonly servePort: number;
  readonly label: string;
  readonly phase: "disabled" | "applying" | "active" | "failed";
  // Set only when phase is "failed".
  readonly failureMessage: string | null;
}

function resolveTailscaleIpAdvertisedEndpoints(input: {
  readonly port: number;
  readonly tailnetIpv4Addresses: readonly string[];
}): readonly AdvertisedEndpoint[] {
  return input.tailnetIpv4Addresses.map((address) =>
    createAdvertisedEndpoint({
      provider: TAILSCALE_ENDPOINT_PROVIDER,
      source: "desktop-addon",
      id: `tailscale-ip:http://${address}:${input.port}`,
      label: "Tailscale IP",
      httpBaseUrl: `http://${address}:${input.port}`,
      reachability: "private-network",
      status: "available",
      description: "Reachable from devices on the same Tailnet.",
    }),
  );
}

const resolveTailscaleMagicDnsAdvertisedEndpoint = Effect.fn(
  "resolveTailscaleMagicDnsAdvertisedEndpoint",
)(function* (
  entry: TailscaleServeMagicDnsEntry,
  probe: (baseUrl: string) => Effect.Effect<boolean, never, HttpClient.HttpClient>,
): Effect.fn.Return<Option.Option<AdvertisedEndpoint>, never, HttpClient.HttpClient> {
  if (!entry.dnsName) {
    return Option.none();
  }

  const httpBaseUrl = buildTailscaleHttpsBaseUrl({
    magicDnsName: entry.dnsName,
    servePort: entry.servePort,
  });

  const shared = {
    provider: TAILSCALE_ENDPOINT_PROVIDER,
    source: "desktop-addon" as const,
    id: `tailscale-magicdns:${httpBaseUrl}`,
    label: entry.label,
    httpBaseUrl,
    reachability: "private-network" as const,
  };

  switch (entry.phase) {
    case "disabled":
      return Option.some(
        createAdvertisedEndpoint({
          ...shared,
          hostedHttpsCompatibility: "requires-configuration",
          status: "unavailable",
          description: "MagicDNS hostname. Configure Tailscale Serve for HTTPS access.",
        }),
      );
    case "applying":
      return Option.some(
        createAdvertisedEndpoint({
          ...shared,
          hostedHttpsCompatibility: "requires-configuration",
          status: "unavailable",
          description: "Setting up Tailscale Serve…",
        }),
      );
    case "failed":
      return Option.some(
        createAdvertisedEndpoint({
          ...shared,
          hostedHttpsCompatibility: "requires-configuration",
          status: "unavailable",
          description: entry.failureMessage ?? "Tailscale Serve failed.",
        }),
      );
    case "active": {
      const isReachable = yield* probe(httpBaseUrl);
      return Option.some(
        createAdvertisedEndpoint({
          ...shared,
          hostedHttpsCompatibility: isReachable ? "compatible" : "requires-configuration",
          status: isReachable ? "available" : "unavailable",
          description: isReachable
            ? "HTTPS endpoint served by Tailscale Serve."
            : "Tailscale Serve is configured. Waiting for Tailscale to issue the HTTPS certificate — this can take up to a minute.",
        }),
      );
    }
  }
});

export const resolveTailscaleAdvertisedEndpoints = Effect.fn("resolveTailscaleAdvertisedEndpoints")(
  function* (input: {
    readonly port: number;
    readonly tailnetIpv4Addresses: readonly string[];
    readonly magicDnsEntries: readonly TailscaleServeMagicDnsEntry[];
    readonly probe?: (baseUrl: string) => Effect.Effect<boolean, never, HttpClient.HttpClient>;
  }): Effect.fn.Return<readonly AdvertisedEndpoint[], never, HttpClient.HttpClient> {
    const ipEndpoints = resolveTailscaleIpAdvertisedEndpoints({
      port: input.port,
      tailnetIpv4Addresses: input.tailnetIpv4Addresses,
    });
    const probe = input.probe ?? ((baseUrl: string) => probeTailscaleHttpsEndpoint({ baseUrl }));
    const magicDnsEndpoints = yield* Effect.forEach(input.magicDnsEntries, (entry) =>
      resolveTailscaleMagicDnsAdvertisedEndpoint(entry, probe),
    );

    return [
      ...ipEndpoints,
      ...magicDnsEndpoints.filter(Option.isSome).map((endpoint) => endpoint.value),
    ];
  },
);
