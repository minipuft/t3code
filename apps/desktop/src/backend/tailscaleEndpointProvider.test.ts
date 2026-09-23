import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/unstable/http";

import {
  parseTailscaleMagicDnsName,
  resolveTailscaleAdvertisedEndpoints,
  type TailscaleServeMagicDnsEntry,
} from "./tailscaleEndpointProvider.ts";

const unusedProbeLayer = Effect.provide(
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("unexpected Tailscale HTTPS probe")),
  ),
);

const activeEntry: TailscaleServeMagicDnsEntry = {
  dnsName: "desktop.tail.ts.net",
  servePort: 443,
  label: "Tailscale HTTPS",
  phase: "active",
  failureMessage: null,
};

describe("tailscale endpoint provider", () => {
  it.effect("parses MagicDNS names from tailscale status", () =>
    Effect.gen(function* () {
      const dnsName = yield* parseTailscaleMagicDnsName(
        `{"Self":{"DNSName":"desktop.tail.ts.net."}}`,
      );
      assert.equal(dnsName, "desktop.tail.ts.net");
      assert.equal(yield* parseTailscaleMagicDnsName("{}"), null);
      const malformed = yield* Effect.result(parseTailscaleMagicDnsName("not-json"));
      assert.isTrue(malformed._tag === "Failure");
    }),
  );

  it.effect("resolves tailnet IP addresses as add-on advertised endpoints", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: ["100.100.100.100"],
        magicDnsEntries: [],
      });
      assert.deepEqual(endpoints, [
        {
          id: "tailscale-ip:http://100.100.100.100:3773",
          label: "Tailscale IP",
          provider: {
            id: "tailscale",
            label: "Tailscale",
            kind: "private-network",
            isAddon: true,
          },
          httpBaseUrl: "http://100.100.100.100:3773/",
          wsBaseUrl: "ws://100.100.100.100:3773/",
          reachability: "private-network",
          compatibility: {
            hostedHttpsApp: "mixed-content-blocked",
            desktopApp: "compatible",
          },
          source: "desktop-addon",
          status: "available",
          description: "Reachable from devices on the same Tailnet.",
        },
      ]);
    }).pipe(unusedProbeLayer),
  );

  it.effect("marks the Tailscale HTTPS endpoint available when active and reachable", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [activeEntry],
        probe: () => Effect.succeed(true),
      });
      assert.deepEqual(endpoints, [
        {
          id: "tailscale-magicdns:https://desktop.tail.ts.net/",
          label: "Tailscale HTTPS",
          provider: {
            id: "tailscale",
            label: "Tailscale",
            kind: "private-network",
            isAddon: true,
          },
          httpBaseUrl: "https://desktop.tail.ts.net/",
          wsBaseUrl: "wss://desktop.tail.ts.net/",
          reachability: "private-network",
          compatibility: {
            hostedHttpsApp: "compatible",
            desktopApp: "compatible",
          },
          source: "desktop-addon",
          status: "available",
          description: "HTTPS endpoint served by Tailscale Serve.",
        },
      ]);
    }).pipe(unusedProbeLayer),
  );

  it.effect("describes an active entry as waiting for the certificate when the probe fails", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [activeEntry],
        probe: () => Effect.succeed(false),
      });
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0]!.status, "unavailable");
      assert.equal(endpoints[0]!.compatibility.hostedHttpsApp, "requires-configuration");
      assert.equal(
        endpoints[0]!.description,
        "Tailscale Serve is configured. Waiting for Tailscale to issue the HTTPS certificate — this can take up to a minute.",
      );
    }).pipe(unusedProbeLayer),
  );

  it.effect("describes an applying entry without probing", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [{ ...activeEntry, phase: "applying" }],
      });
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0]!.status, "unavailable");
      assert.equal(endpoints[0]!.description, "Setting up Tailscale Serve…");
    }).pipe(unusedProbeLayer),
  );

  it.effect("passes a failed entry's message through as the description", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [
          {
            ...activeEntry,
            phase: "failed",
            failureMessage: "Tailscale on Windows didn't respond.",
          },
        ],
      });
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0]!.status, "unavailable");
      assert.equal(endpoints[0]!.description, "Tailscale on Windows didn't respond.");
    }).pipe(unusedProbeLayer),
  );

  it.effect("shows the disabled shape so the setup dialog can display the URL", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [{ ...activeEntry, phase: "disabled", failureMessage: null }],
      });
      assert.deepEqual(endpoints, [
        {
          id: "tailscale-magicdns:https://desktop.tail.ts.net/",
          label: "Tailscale HTTPS",
          provider: {
            id: "tailscale",
            label: "Tailscale",
            kind: "private-network",
            isAddon: true,
          },
          httpBaseUrl: "https://desktop.tail.ts.net/",
          wsBaseUrl: "wss://desktop.tail.ts.net/",
          reachability: "private-network",
          compatibility: {
            hostedHttpsApp: "requires-configuration",
            desktopApp: "compatible",
          },
          source: "desktop-addon",
          status: "unavailable",
          description: "MagicDNS hostname. Configure Tailscale Serve for HTTPS access.",
        },
      ]);
    }).pipe(unusedProbeLayer),
  );

  it.effect("carries the caller-supplied (WSL)/(Windows) labels through untouched", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [
          {
            dnsName: "desktop.tail.ts.net",
            servePort: 443,
            label: "Tailscale HTTPS (WSL)",
            phase: "active",
            failureMessage: null,
          },
          {
            dnsName: "windows-desktop.tail.ts.net",
            servePort: 443,
            label: "Tailscale HTTPS (Windows)",
            phase: "active",
            failureMessage: null,
          },
        ],
        probe: () => Effect.succeed(true),
      });
      assert.deepEqual(
        endpoints.map((endpoint) => endpoint.label),
        ["Tailscale HTTPS (WSL)", "Tailscale HTTPS (Windows)"],
      );
    }).pipe(unusedProbeLayer),
  );

  it.effect("skips an entry with no resolved MagicDNS name", () =>
    Effect.gen(function* () {
      const endpoints = yield* resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        tailnetIpv4Addresses: [],
        magicDnsEntries: [{ ...activeEntry, dnsName: null }],
      });
      assert.deepEqual(endpoints, []);
    }).pipe(unusedProbeLayer),
  );
});
