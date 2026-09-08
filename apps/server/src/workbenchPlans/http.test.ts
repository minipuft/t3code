import {
  AuthAccessWriteScope,
  AuthSessionId,
  EnvironmentAuthenticatedPrincipal,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http";

import { directLocalAdministrativeRequest } from "./http.ts";

function check(input: {
  readonly address: string;
  readonly method?: "browser-session-cookie" | "dpop-access-token";
  readonly forwardedFor?: string;
  readonly forwardedMetadata?: boolean;
}) {
  const request = {
    headers: {
      ...(input.forwardedFor ? { "x-forwarded-for": input.forwardedFor } : {}),
      ...(input.forwardedMetadata ? { "x-forwarded-host": "relay.example.test" } : {}),
    },
    source: { remoteAddress: input.address },
  } as never;
  const principal = EnvironmentAuthenticatedPrincipal.of({
    sessionId: AuthSessionId.make("session-1"),
    subject: "browser",
    method: input.method ?? "browser-session-cookie",
    scopes: new Set([AuthAccessWriteScope]),
  });
  return directLocalAdministrativeRequest().pipe(
    Effect.provideService(EnvironmentAuthenticatedPrincipal, principal),
    Effect.provideService(HttpServerRequest.HttpServerRequest, request),
  );
}

describe("Workbench resource locality", () => {
  it.effect("accepts a direct loopback browser session", () =>
    Effect.gen(function* () {
      expect(yield* check({ address: "::ffff:127.0.0.1" })).toBe(true);
      expect(yield* check({ address: "::1" })).toBe(true);
      expect(
        yield* check({
          address: "127.0.0.1",
          forwardedFor: "127.0.0.1, ::1",
          forwardedMetadata: true,
        }),
      ).toBe(true);
    }),
  );

  it.effect("refuses remote, forwarded, and relay-authenticated sessions", () =>
    Effect.gen(function* () {
      expect(yield* check({ address: "192.168.65.2" })).toBe(false);
      expect(
        yield* check({
          address: "127.0.0.1",
          forwardedFor: "192.168.65.2, 127.0.0.1",
          forwardedMetadata: true,
        }),
      ).toBe(false);
      expect(yield* check({ address: "127.0.0.1", forwardedMetadata: true })).toBe(false);
      expect(yield* check({ address: "127.0.0.1", method: "dpop-access-token" })).toBe(false);
    }),
  );
});
