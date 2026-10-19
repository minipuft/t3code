import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentHttpApi } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as AuthHttp from "../auth/http.ts";
import * as CloudLink from "./CloudLink.ts";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { hasForwardedAuthorityHeaders, isAllowedEndpointOrigin } from "./linkChecks.ts";
import * as ConnectHttp from "./http.ts";

class ConnectTestApi extends HttpApi.make("environment").add(EnvironmentHttpApi.groups.connect) {}

type HealthFailure = Effect.Error<
  ReturnType<CloudLink.CloudLink["Service"]["answerHealthRequest"]>
>;

const answerHealthWith = async (failure: HealthFailure) => {
  const layerRoutes = HttpApiBuilder.layer(ConnectTestApi).pipe(
    Layer.provide(ConnectHttp.layer),
    Layer.provide(
      Layer.mock(CloudLink.CloudLink)({
        answerHealthRequest: () => Effect.fail(failure),
      }),
    ),
    Layer.provide(AuthHttp.layerAuthenticatedAuth),
    Layer.provide(Layer.mock(EnvironmentAuth.EnvironmentAuth)({})),
    Layer.provideMerge(
      HttpPlatform.layer.pipe(
        Layer.provideMerge(NodeServices.layer),
        Layer.provideMerge(Etag.layerWeak),
      ),
    ),
  );
  const { handler, dispose } = HttpRouter.toWebHandler(layerRoutes, {
    disableLogger: true,
  });
  try {
    const response = await handler(
      new Request("http://127.0.0.1/api/t3-connect/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proof: "proof" }),
      }),
    );
    return { status: response.status, body: (await response.json()) as unknown };
  } finally {
    await dispose();
  }
};

describe("connect routes", () => {
  it.each([
    {
      failure: new CloudLink.CloudLinkProofRejectedError({ request: "health" }),
      status: 401,
      body: { _tag: "EnvironmentHttpUnauthorizedError", message: "Invalid cloud health request." },
    },
    {
      failure: new CloudLink.CloudLinkProofReplayedError({ request: "health" }),
      status: 409,
      body: {
        _tag: "EnvironmentHttpConflictError",
        message: "Cloud health request was already consumed.",
      },
    },
    {
      failure: new CloudLink.CloudLinkInternalError({
        operation: "answer-health",
        cause: new Error("disk full"),
      }),
      status: 500,
      body: {
        _tag: "EnvironmentHttpInternalServerError",
        message: "Could not answer cloud health request.",
      },
    },
    {
      failure: new EnvironmentAuth.ServerAuthCloudMintPublicKeyMissingError({}),
      status: 500,
      body: {
        _tag: "EnvironmentHttpInternalServerError",
        message: "Cloud mint public key is not installed for this environment.",
      },
    },
  ])("answers $failure._tag with HTTP $status", async ({ failure, status, body }) => {
    const response = await answerHealthWith(failure);
    expect(response).toEqual({ status, body });
  });
});

describe("isAllowedEndpointOrigin", () => {
  const loopbackOrigin = { localHttpHost: "127.0.0.1", localHttpPort: 13773 };

  it("issues a proof for a request addressed to the desktop's configured renderer host", () => {
    expect(
      isAllowedEndpointOrigin({
        origin: loopbackOrigin,
        requestUrl: "http://192.168.65.182:13773/api/t3-cloud/link-proof",
        allowedRendererHost: "192.168.65.182",
      }),
    ).toBe(true);
  });

  it("rejects a request addressed to a different non-loopback host", () => {
    expect(
      isAllowedEndpointOrigin({
        origin: loopbackOrigin,
        requestUrl: "http://10.0.0.9:13773/api/t3-cloud/link-proof",
        allowedRendererHost: "192.168.65.182",
      }),
    ).toBe(false);
  });

  it("rejects a request to the renderer host whose proof origin is not loopback", () => {
    expect(
      isAllowedEndpointOrigin({
        origin: { localHttpHost: "192.168.65.182", localHttpPort: 13773 },
        requestUrl: "http://192.168.65.182:13773/api/t3-cloud/link-proof",
        allowedRendererHost: "192.168.65.182",
      }),
    ).toBe(false);
  });

  it("rejects every non-loopback request when no renderer host is configured", () => {
    expect(
      isAllowedEndpointOrigin({
        origin: loopbackOrigin,
        requestUrl: "http://192.168.65.182:13773/api/t3-cloud/link-proof",
        allowedRendererHost: undefined,
      }),
    ).toBe(false);
  });

  it("still requires the port to match on the allowed renderer host", () => {
    expect(
      isAllowedEndpointOrigin({
        origin: loopbackOrigin,
        requestUrl: "http://192.168.65.182:9999/api/t3-cloud/link-proof",
        allowedRendererHost: "192.168.65.182",
      }),
    ).toBe(false);
  });
});

describe("hasForwardedAuthorityHeaders", () => {
  // The forwarded-header rejection in cloudLinkProofHandler runs before
  // isAllowedEndpointOrigin, so a request carrying X-Forwarded-Host is
  // rejected even when its hostname matches the configured renderer host.
  it("flags a request to the renderer host that also carries X-Forwarded-Host", () => {
    const request = HttpServerRequest.fromWeb(
      new Request("http://192.168.65.182:13773/api/t3-cloud/link-proof", {
        headers: { "x-forwarded-host": "attacker.example.test" },
      }),
    );

    expect(hasForwardedAuthorityHeaders(request)).toBe(true);
  });

  it("does not flag a plain request to the renderer host", () => {
    const request = HttpServerRequest.fromWeb(
      new Request("http://192.168.65.182:13773/api/t3-cloud/link-proof"),
    );

    expect(hasForwardedAuthorityHeaders(request)).toBe(false);
  });
});
