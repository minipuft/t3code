import * as Context from "effect/Context";
import type * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware";
import * as OpenApi from "effect/unstable/httpapi/OpenApi";
import * as HttpServerRespondable from "effect/unstable/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import {
  AuthAccessTokenResult,
  AuthBrowserSessionRequest,
  AuthBrowserSessionResult,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthPairingCredentialResult,
  AuthPairingLink,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  AuthEnvironmentScope,
  AuthTokenExchangeRequest,
  AuthSessionState,
  AuthWebSocketTicketResult,
  ServerAuthSessionMethod,
} from "./auth.ts";
import {
  DpopFailureReason,
  AuthSessionId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ExecutionEnvironmentDescriptor } from "./environment.ts";
import {
  ClientOrchestrationCommand,
  DispatchResult,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationThreadDetailSnapshot,
} from "./orchestration.ts";
import {
  PullRequestDiffInput,
  PullRequestDiffResult,
  PullRequestOperationError,
  PullRequestUnavailableError,
} from "./pullRequest.ts";
import {
  RelayCloudEnvironmentHealthRequest,
  RelayCloudMintCredentialRequest,
  RelayEnvironmentConfigRequest,
  RelayEnvironmentHealthResponse,
  RelayEnvironmentLinkProof,
  RelayEnvironmentMintResponse,
  RelayLinkProofRequest,
} from "./relay.ts";
import {
  AgentWorkbenchPromptApplyInput,
  AgentWorkbenchPromptHistory,
  AgentWorkbenchPromptMutationResult,
  AgentWorkbenchPromptReview,
  AgentWorkbenchPromptReviewInput,
  AgentWorkbenchPromptRollbackInput,
} from "./agentWorkbench.ts";
import {
  WorkflowCatalogDetail,
  WorkflowCatalogItemId,
  WorkflowCatalogList,
} from "./workflowCatalog.ts";
import {
  WorkbenchPlanAnnotationMutationInput,
  WorkbenchPlanAnnotations,
  WorkbenchPlanList,
  WorkbenchPlanMutationInput,
  WorkbenchPlanMutationResult,
  WorkbenchPlanPath,
  WorkbenchPlanSaveInput,
  WorkbenchPlanSaveResult,
  WorkbenchPlanSourceDocument,
  WorkbenchVitalsSnapshot,
} from "./workbenchPlans.ts";

const OptionalBearerHeaders = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
  dpop: Schema.optionalKey(Schema.String),
});

const OptionalDpopProofHeaders = Schema.Struct({
  dpop: Schema.optionalKey(Schema.String),
});

export const EnvironmentRequestInvalidReason = Schema.Literals([
  "invalid_scope",
  "scope_not_granted",
  "invalid_command",
]);
export type EnvironmentRequestInvalidReason = typeof EnvironmentRequestInvalidReason.Type;

export const EnvironmentAuthInvalidReason = Schema.Literals([
  "missing_credential",
  "invalid_credential",
]);
export type EnvironmentAuthInvalidReason = typeof EnvironmentAuthInvalidReason.Type;

export const EnvironmentOperationForbiddenReason = Schema.Literals([
  "current_session_revoke_not_allowed",
]);
export type EnvironmentOperationForbiddenReason = typeof EnvironmentOperationForbiddenReason.Type;

export const EnvironmentInternalErrorReason = Schema.Literals([
  "bootstrap_validation_failed",
  "browser_session_issuance_failed",
  "browser_session_cookie_failed",
  "access_token_issuance_failed",
  "websocket_ticket_issuance_failed",
  "pairing_credential_issuance_failed",
  "pairing_links_load_failed",
  "pairing_link_revoke_failed",
  "client_sessions_load_failed",
  "client_session_revoke_failed",
  "orchestration_snapshot_failed",
  "orchestration_thread_snapshot_failed",
  "orchestration_dispatch_failed",
  "internal_error",
]);
export type EnvironmentInternalErrorReason = typeof EnvironmentInternalErrorReason.Type;

export class EnvironmentRequestInvalidError extends Schema.TaggedErrorClass<EnvironmentRequestInvalidError>()(
  "EnvironmentRequestInvalidError",
  {
    code: Schema.Literal("invalid_request"),
    reason: EnvironmentRequestInvalidReason,
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 400 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentRequestInvalidError)(this, { status: 400 });
  }

  override get message(): string {
    return `The environment rejected the request (${this.reason}).`;
  }
}

export class EnvironmentAuthInvalidError extends Schema.TaggedErrorClass<EnvironmentAuthInvalidError>()(
  "EnvironmentAuthInvalidError",
  {
    code: Schema.Literal("auth_invalid"),
    reason: EnvironmentAuthInvalidReason,
    // Older servers do not send a DPoP failure category.
    dpopFailureReason: Schema.optionalKey(DpopFailureReason),
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 401 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentAuthInvalidError)(this, { status: 401 });
  }

  override get message(): string {
    return `The environment rejected this client's credentials (${this.reason}).`;
  }
}

export class EnvironmentScopeRequiredError extends Schema.TaggedErrorClass<EnvironmentScopeRequiredError>()(
  "EnvironmentScopeRequiredError",
  {
    code: Schema.Literal("insufficient_scope"),
    requiredScope: AuthEnvironmentScope,
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 403 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentScopeRequiredError)(this, { status: 403 });
  }

  override get message(): string {
    return `This request needs the ${this.requiredScope} scope, which this client does not have.`;
  }
}

export class EnvironmentOperationForbiddenError extends Schema.TaggedErrorClass<EnvironmentOperationForbiddenError>()(
  "EnvironmentOperationForbiddenError",
  {
    code: Schema.Literal("operation_forbidden"),
    reason: EnvironmentOperationForbiddenReason,
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 403 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentOperationForbiddenError)(this, { status: 403 });
  }

  override get message(): string {
    return `The environment refused this operation (${this.reason}).`;
  }
}

export class EnvironmentInternalError extends Schema.TaggedErrorClass<EnvironmentInternalError>()(
  "EnvironmentInternalError",
  {
    code: Schema.Literal("internal_error"),
    reason: EnvironmentInternalErrorReason,
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 500 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentInternalError)(this, { status: 500 });
  }

  override get message(): string {
    return `The environment failed to answer this request (${this.reason}).`;
  }
}

export const EnvironmentResourceNotFoundReason = Schema.Literals([
  "thread_not_found",
  "workflow_catalog_item_not_found",
  "workbench_plan_not_found",
]);
export type EnvironmentResourceNotFoundReason = typeof EnvironmentResourceNotFoundReason.Type;

export class EnvironmentResourceNotFoundError extends Schema.TaggedErrorClass<EnvironmentResourceNotFoundError>()(
  "EnvironmentResourceNotFoundError",
  {
    code: Schema.Literal("not_found"),
    reason: EnvironmentResourceNotFoundReason,
    traceId: TrimmedNonEmptyString,
  },
  { httpApiStatus: 404 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentResourceNotFoundError)(this, { status: 404 });
  }

  override get message(): string {
    return `The environment could not find what this request named (${this.reason}).`;
  }
}

export const EnvironmentHttpCommonError = Schema.Union([
  EnvironmentRequestInvalidError,
  EnvironmentAuthInvalidError,
  EnvironmentScopeRequiredError,
  EnvironmentOperationForbiddenError,
  EnvironmentResourceNotFoundError,
  EnvironmentInternalError,
]);
export type EnvironmentHttpCommonError = typeof EnvironmentHttpCommonError.Type;

const EnvironmentAuthenticationErrors = [
  EnvironmentAuthInvalidError,
  EnvironmentInternalError,
] as const;

export class EnvironmentHttpBadRequestError extends Schema.TaggedErrorClass<EnvironmentHttpBadRequestError>()(
  "EnvironmentHttpBadRequestError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentHttpBadRequestError)(this, { status: 400 });
  }
}

export class EnvironmentHttpUnauthorizedError extends Schema.TaggedErrorClass<EnvironmentHttpUnauthorizedError>()(
  "EnvironmentHttpUnauthorizedError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 401 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentHttpUnauthorizedError)(this, { status: 401 });
  }
}

export class EnvironmentHttpForbiddenError extends Schema.TaggedErrorClass<EnvironmentHttpForbiddenError>()(
  "EnvironmentHttpForbiddenError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentHttpForbiddenError)(this, { status: 403 });
  }
}

export class EnvironmentHttpInternalServerError extends Schema.TaggedErrorClass<EnvironmentHttpInternalServerError>()(
  "EnvironmentHttpInternalServerError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentHttpInternalServerError)(this, { status: 500 });
  }
}

export class EnvironmentHttpConflictError extends Schema.TaggedErrorClass<EnvironmentHttpConflictError>()(
  "EnvironmentHttpConflictError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentHttpConflictError)(this, { status: 409 });
  }
}

export class EnvironmentCloudEndpointUnavailableError extends Schema.TaggedErrorClass<EnvironmentCloudEndpointUnavailableError>()(
  "EnvironmentCloudEndpointUnavailableError",
  {
    message: Schema.String,
    endpointRuntimeStatus: Schema.Unknown,
  },
  { httpApiStatus: 503 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(EnvironmentCloudEndpointUnavailableError)(this, {
      status: 503,
    });
  }
}
const EnvironmentSessionCreationErrors = [
  EnvironmentAuthInvalidError,
  EnvironmentInternalError,
] as const;
const EnvironmentTokenExchangeErrors = [
  EnvironmentRequestInvalidError,
  EnvironmentAuthInvalidError,
  EnvironmentInternalError,
] as const;
const EnvironmentScopedOperationErrors = [
  EnvironmentScopeRequiredError,
  EnvironmentInternalError,
] as const;
const EnvironmentPairingCredentialErrors = [
  EnvironmentRequestInvalidError,
  ...EnvironmentScopedOperationErrors,
] as const;
const EnvironmentSessionRevokeErrors = [
  EnvironmentScopeRequiredError,
  EnvironmentOperationForbiddenError,
  EnvironmentInternalError,
] as const;
const EnvironmentOrchestrationSnapshotErrors = [
  EnvironmentScopeRequiredError,
  EnvironmentInternalError,
] as const;
const EnvironmentOrchestrationThreadSnapshotErrors = [
  EnvironmentScopeRequiredError,
  EnvironmentResourceNotFoundError,
  EnvironmentInternalError,
] as const;
const EnvironmentOrchestrationDispatchErrors = [
  EnvironmentRequestInvalidError,
  EnvironmentScopeRequiredError,
  EnvironmentInternalError,
] as const;

export interface EnvironmentSessionPrincipalShape {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: ReadonlySet<AuthEnvironmentScope>;
  readonly proofKeyThumbprint?: string;
  readonly expiresAt?: DateTime.DateTime;
}

export class EnvironmentAuthenticatedPrincipal extends Context.Service<
  EnvironmentAuthenticatedPrincipal,
  EnvironmentSessionPrincipalShape
>()("@t3tools/contracts/environmentHttp/EnvironmentAuthenticatedPrincipal") {}

export class EnvironmentAuthenticatedAuth extends HttpApiMiddleware.Service<
  EnvironmentAuthenticatedAuth,
  { provides: EnvironmentAuthenticatedPrincipal }
>()("EnvironmentAuthenticatedAuth", {
  error: EnvironmentAuthenticationErrors,
}) {}

const EnvironmentHttpCloudErrors = [
  EnvironmentHttpBadRequestError,
  EnvironmentHttpUnauthorizedError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpConflictError,
  EnvironmentHttpInternalServerError,
  EnvironmentScopeRequiredError,
] as const;

export const EnvironmentCloudRelayConfigResult = Schema.Struct({
  ok: Schema.Boolean,
  endpointRuntimeStatus: Schema.Unknown,
});
export type EnvironmentCloudRelayConfigResult = typeof EnvironmentCloudRelayConfigResult.Type;

export const EnvironmentCloudLinkStateResult = Schema.Struct({
  linked: Schema.Boolean,
  cloudUserId: Schema.NullOr(Schema.String),
  relayUrl: Schema.NullOr(Schema.String),
  relayIssuer: Schema.NullOr(Schema.String),
  // A managed Cloudflare tunnel is provisioned for this link. False for a
  // publish-only link (activity publishing without a relay-managed tunnel), so
  // clients can present the two capabilities as independent settings.
  // Optional so newer clients tolerate older environment servers.
  managedTunnelActive: Schema.optional(Schema.Boolean),
  publishAgentActivity: Schema.Boolean,
});
export type EnvironmentCloudLinkStateResult = typeof EnvironmentCloudLinkStateResult.Type;

export const EnvironmentCloudPreferencesRequest = Schema.Struct({
  publishAgentActivity: Schema.Boolean,
});
export type EnvironmentCloudPreferencesRequest = typeof EnvironmentCloudPreferencesRequest.Type;

export const AuthPairingLinkRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});
export type AuthPairingLinkRevokeResult = typeof AuthPairingLinkRevokeResult.Type;

export const AuthClientSessionRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});
export type AuthClientSessionRevokeResult = typeof AuthClientSessionRevokeResult.Type;

export const AuthOtherClientSessionsRevokeResult = Schema.Struct({
  revokedCount: Schema.Number,
});
export type AuthOtherClientSessionsRevokeResult = typeof AuthOtherClientSessionsRevokeResult.Type;

export class EnvironmentMetadataHttpApi extends HttpApiGroup.make("metadata").add(
  HttpApiEndpoint.get("descriptor", "/.well-known/t3/environment", {
    success: ExecutionEnvironmentDescriptor,
  }),
) {}

export class EnvironmentAuthHttpApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("session", "/api/auth/session", {
      headers: OptionalBearerHeaders,
      success: AuthSessionState,
      error: [EnvironmentInternalError],
    }),
  )
  .add(
    HttpApiEndpoint.post("browserSession", "/api/auth/browser-session", {
      payload: AuthBrowserSessionRequest,
      success: AuthBrowserSessionResult,
      error: EnvironmentSessionCreationErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("token", "/oauth/token", {
      headers: OptionalDpopProofHeaders,
      payload: AuthTokenExchangeRequest,
      success: AuthAccessTokenResult,
      error: EnvironmentTokenExchangeErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("webSocketTicket", "/api/auth/websocket-ticket", {
      headers: OptionalBearerHeaders,
      success: AuthWebSocketTicketResult,
      error: [EnvironmentInternalError],
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("pairingCredential", "/api/auth/pairing-token", {
      headers: OptionalBearerHeaders,
      payload: AuthCreatePairingCredentialInput,
      success: AuthPairingCredentialResult,
      error: EnvironmentPairingCredentialErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("pairingLinks", "/api/auth/pairing-links", {
      headers: OptionalBearerHeaders,
      success: Schema.Array(AuthPairingLink),
      error: EnvironmentScopedOperationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokePairingLink", "/api/auth/pairing-links/revoke", {
      headers: OptionalBearerHeaders,
      payload: AuthRevokePairingLinkInput,
      success: AuthPairingLinkRevokeResult,
      error: EnvironmentScopedOperationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("clients", "/api/auth/clients", {
      headers: OptionalBearerHeaders,
      success: Schema.Array(AuthClientSession),
      error: EnvironmentScopedOperationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokeClient", "/api/auth/clients/revoke", {
      headers: OptionalBearerHeaders,
      payload: AuthRevokeClientSessionInput,
      success: AuthClientSessionRevokeResult,
      error: EnvironmentSessionRevokeErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("revokeOtherClients", "/api/auth/clients/revoke-others", {
      headers: OptionalBearerHeaders,
      success: AuthOtherClientSessionsRevokeResult,
      error: EnvironmentScopedOperationErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  ) {}

const EnvironmentOrchestrationThreadSnapshotParams = Schema.Struct({
  threadId: ThreadId,
});

// Query-string window for windowed thread snapshots (GET payloads must encode
// to strings). Both fields optional: omitting them keeps the full-snapshot
// behavior, so pagination stays opt-in per request.
const EnvironmentOrchestrationThreadSnapshotQuery = {
  turnLimit: Schema.optional(
    Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  ),
  beforeCursor: Schema.optional(TrimmedNonEmptyString),
};

export class EnvironmentOrchestrationHttpApi extends HttpApiGroup.make("orchestration")
  .add(
    HttpApiEndpoint.get("snapshot", "/api/orchestration/snapshot", {
      headers: OptionalBearerHeaders,
      success: OrchestrationReadModel,
      error: EnvironmentOrchestrationSnapshotErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("shellSnapshot", "/api/orchestration/shell", {
      headers: OptionalBearerHeaders,
      success: OrchestrationShellSnapshot,
      error: EnvironmentOrchestrationSnapshotErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("threadSnapshot", "/api/orchestration/threads/:threadId", {
      headers: OptionalBearerHeaders,
      params: EnvironmentOrchestrationThreadSnapshotParams,
      payload: EnvironmentOrchestrationThreadSnapshotQuery,
      success: OrchestrationThreadDetailSnapshot,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("dispatch", "/api/orchestration/dispatch", {
      headers: OptionalBearerHeaders,
      payload: ClientOrchestrationCommand,
      success: DispatchResult,
      error: EnvironmentOrchestrationDispatchErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  ) {}

/** Large, compressible pull-request payloads travel over HTTP rather than the RPC socket. */
export class EnvironmentPullRequestsHttpApi extends HttpApiGroup.make("pullRequests").add(
  HttpApiEndpoint.post("diff", "/api/pull-requests/diff", {
    headers: OptionalBearerHeaders,
    payload: PullRequestDiffInput,
    success: PullRequestDiffResult,
    error: [
      PullRequestUnavailableError,
      PullRequestOperationError,
      EnvironmentAuthInvalidError,
      EnvironmentScopeRequiredError,
      EnvironmentInternalError,
    ],
  }).middleware(EnvironmentAuthenticatedAuth),
) {}

const EnvironmentWorkflowCatalogDetailParams = Schema.Struct({
  itemId: WorkflowCatalogItemId,
});

const EnvironmentWorkflowPromptHistoryQuery = {
  limit: Schema.optionalKey(Schema.NumberFromString),
};

const EnvironmentWorkflowPromptCompareQuery = {
  from: Schema.NumberFromString,
  to: Schema.NumberFromString,
};

export class EnvironmentWorkflowCatalogHttpApi extends HttpApiGroup.make("workflowCatalog")
  .add(
    HttpApiEndpoint.get("list", "/api/workflows", {
      headers: OptionalBearerHeaders,
      success: WorkflowCatalogList,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "List workflow prompts and provider skills")
      .annotate(
        OpenApi.Description,
        "Returns metadata from the environment-configured prompt catalog plus current provider skills. Requires orchestration:read. An unavailable source is represented by the response capability rather than an HTTP failure.",
      ),
  )
  .add(
    HttpApiEndpoint.get("detail", "/api/workflows/:itemId", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      success: WorkflowCatalogDetail,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Read workflow detail")
      .annotate(
        OpenApi.Description,
        "Returns executable template content for a prompt or metadata for a skill. Requires orchestration:read and returns workflow_catalog_item_not_found when the id is absent.",
      ),
  )
  .add(
    HttpApiEndpoint.get("history", "/api/workflows/:itemId/history", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      payload: EnvironmentWorkflowPromptHistoryQuery,
      success: AgentWorkbenchPromptHistory,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Read prompt revision history")
      .annotate(
        OpenApi.Description,
        "Returns canonical prompt revisions through Agent Workbench. Requires orchestration:read.",
      ),
  )
  .add(
    HttpApiEndpoint.get("compare", "/api/workflows/:itemId/compare", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      payload: EnvironmentWorkflowPromptCompareQuery,
      success: AgentWorkbenchPromptReview,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Compare prompt revisions")
      .annotate(
        OpenApi.Description,
        "Returns the authority-owned diff between two prompt versions. Requires orchestration:read.",
      ),
  )
  .add(
    HttpApiEndpoint.post("review", "/api/workflows/:itemId/review", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      payload: AgentWorkbenchPromptReviewInput,
      success: AgentWorkbenchPromptReview,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Review a prompt change")
      .annotate(
        OpenApi.Description,
        "Validates and diffs a proposed prompt edit without writing it. Requires access:write.",
      ),
  )
  .add(
    HttpApiEndpoint.post("apply", "/api/workflows/:itemId/apply", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      payload: AgentWorkbenchPromptApplyInput,
      success: AgentWorkbenchPromptMutationResult,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Apply a reviewed prompt change")
      .annotate(
        OpenApi.Description,
        "Writes a confirmed prompt change through the canonical authority. Requires access:write and an idempotency request id.",
      ),
  )
  .add(
    HttpApiEndpoint.post("rollback", "/api/workflows/:itemId/rollback", {
      headers: OptionalBearerHeaders,
      params: EnvironmentWorkflowCatalogDetailParams,
      payload: AgentWorkbenchPromptRollbackInput,
      success: AgentWorkbenchPromptMutationResult,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Roll back a prompt revision")
      .annotate(
        OpenApi.Description,
        "Restores an authority-owned prompt revision after optimistic concurrency validation. Requires access:write.",
      ),
  ) {}

const EnvironmentWorkbenchPlanParams = { path: WorkbenchPlanPath };
const EnvironmentWorkbenchPlanMutationErrors = [
  EnvironmentRequestInvalidError,
  EnvironmentScopeRequiredError,
  EnvironmentResourceNotFoundError,
  EnvironmentHttpConflictError,
  EnvironmentInternalError,
] as const;

export class EnvironmentWorkbenchPlansHttpApi extends HttpApiGroup.make("workbenchPlans")
  .add(
    HttpApiEndpoint.get("vitals", "/api/workbench/vitals", {
      headers: OptionalBearerHeaders,
      success: WorkbenchVitalsSnapshot,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Read provider-owned Workbench quota windows")
      .annotate(
        OpenApi.Description,
        "Returns provider-reported subscription quota windows through the configured Workbench adapter. Requires orchestration:read. Missing windows are returned as an empty array and are never estimated from token usage.",
      ),
  )
  .add(
    HttpApiEndpoint.get("list", "/api/workbench/plans", {
      headers: OptionalBearerHeaders,
      success: WorkbenchPlanList,
      error: EnvironmentOrchestrationSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "List external Workbench plans")
      .annotate(
        OpenApi.Description,
        'GET. Returns bounded plan metadata and active bindings from the configured environment adapter. Requires orchestration:read. Example response: {"capability":{"status":"available","reason":null},"items":[{"path":"t3code/phase.md","name":"phase.md","directory":"t3code","project":"t3code","status":"active","date":"2026-08-23","tags":[],"mtimeMs":1787520000000,"binding":null}]}. Missing or unavailable configuration is represented by the capability object; authentication/scope failures return 401/403. No endpoint-specific rate limit is applied.',
      ),
  )
  .add(
    HttpApiEndpoint.get("source", "/api/workbench/plans/source", {
      headers: OptionalBearerHeaders,
      payload: EnvironmentWorkbenchPlanParams,
      success: WorkbenchPlanSourceDocument,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Read an external Workbench plan")
      .annotate(
        OpenApi.Description,
        'GET. Reads the Markdown source for the required path query parameter, for example ?path=t3code%2Fphase.md. Requires orchestration:read. The path is a POSIX workspace-relative .md, .markdown, or .mdx value; absolute, backslash, and parent-traversal paths are rejected. Example response: {"path":"t3code/phase.md","text":"# Phase","mtimeMs":1787520000000,"size":7}. Missing plans return 404; authentication/scope failures return 401/403; adapter failures return 500. No endpoint-specific rate limit is applied.',
      ),
  )
  .add(
    HttpApiEndpoint.post("save", "/api/workbench/plans/save", {
      headers: OptionalBearerHeaders,
      payload: WorkbenchPlanSaveInput,
      success: WorkbenchPlanSaveResult,
      error: EnvironmentWorkbenchPlanMutationErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Save an external Workbench plan")
      .annotate(
        OpenApi.Description,
        'POST. Replaces one plan\'s Markdown text when baseMtimeMs still matches the source. Requires orchestration:operate. Example request: {"path":"t3code/phase.md","text":"# Phase","baseMtimeMs":1787520000000}. Example response: {"path":"t3code/phase.md","mtimeMs":1787520001000,"size":7}. Missing plans return 404; a concurrent edit returns 409; invalid input returns 400; authentication/scope failures return 401/403; adapter failures return 500. No endpoint-specific rate limit is applied.',
      ),
  )
  .add(
    HttpApiEndpoint.post("mutate", "/api/workbench/plans/mutate", {
      headers: OptionalBearerHeaders,
      payload: WorkbenchPlanMutationInput,
      success: WorkbenchPlanMutationResult,
      error: EnvironmentWorkbenchPlanMutationErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Change an external Workbench plan lifecycle")
      .annotate(
        OpenApi.Description,
        'POST. Creates, renames, or moves one plan through the external plan authority. Requires orchestration:operate. Example move request: {"op":"move","path":"t3code/phase.md","to":"archive"}. Example response: {"path":"t3code/archive/phase.md"}. Missing plans return 404; existing destinations return 409; invalid operations return 400; authentication/scope failures return 401/403; adapter failures return 500. No endpoint-specific rate limit is applied.',
      ),
  )
  .add(
    HttpApiEndpoint.get("annotations", "/api/workbench/plans/annotations", {
      headers: OptionalBearerHeaders,
      payload: EnvironmentWorkbenchPlanParams,
      success: WorkbenchPlanAnnotations,
      error: EnvironmentOrchestrationThreadSnapshotErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "List external Workbench plan annotations")
      .annotate(
        OpenApi.Description,
        'GET. Lists unresolved annotations and their Markdown projection for the required workspace-relative plan path, for example ?path=t3code%2Fphase.md. Requires orchestration:read. Example response: {"path":"t3code/phase.md","items":[],"markdown":""}. Missing plans return 404; authentication/scope failures return 401/403; adapter failures return 500. No endpoint-specific rate limit is applied.',
      ),
  )
  .add(
    HttpApiEndpoint.post("annotate", "/api/workbench/plans/annotations", {
      headers: OptionalBearerHeaders,
      payload: WorkbenchPlanAnnotationMutationInput,
      success: WorkbenchPlanAnnotations,
      error: EnvironmentWorkbenchPlanMutationErrors,
    })
      .middleware(EnvironmentAuthenticatedAuth)
      .annotate(OpenApi.Summary, "Change external Workbench plan annotations")
      .annotate(
        OpenApi.Description,
        'POST. Adds a comment/removal note or resolves an annotation for one plan. Requires orchestration:operate. Example add request: {"op":"add","path":"t3code/phase.md","kind":"comment","body":"Clarify this","quote":"selected text","heading":"Boundary"}. The response is the same annotation list shape as GET. Missing plans return 404; invalid annotations return 400; authentication/scope failures return 401/403; adapter failures return 500. No endpoint-specific rate limit is applied.',
      ),
  ) {}

export class EnvironmentConnectHttpApi extends HttpApiGroup.make("connect")
  .add(
    HttpApiEndpoint.post("linkProof", "/api/connect/link-proof", {
      headers: OptionalBearerHeaders,
      payload: RelayLinkProofRequest,
      success: RelayEnvironmentLinkProof,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("relayConfig", "/api/connect/relay-config", {
      headers: OptionalBearerHeaders,
      payload: RelayEnvironmentConfigRequest,
      success: EnvironmentCloudRelayConfigResult,
      error: [...EnvironmentHttpCloudErrors, EnvironmentCloudEndpointUnavailableError],
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.get("linkState", "/api/connect/link-state", {
      headers: OptionalBearerHeaders,
      success: EnvironmentCloudLinkStateResult,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("unlink", "/api/connect/unlink", {
      headers: OptionalBearerHeaders,
      success: EnvironmentCloudRelayConfigResult,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("preferences", "/api/connect/preferences", {
      headers: OptionalBearerHeaders,
      payload: EnvironmentCloudPreferencesRequest,
      success: EnvironmentCloudLinkStateResult,
      error: EnvironmentHttpCloudErrors,
    }).middleware(EnvironmentAuthenticatedAuth),
  )
  .add(
    HttpApiEndpoint.post("health", "/api/t3-connect/health", {
      payload: RelayCloudEnvironmentHealthRequest,
      success: RelayEnvironmentHealthResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("mintCredential", "/api/connect/mint-credential", {
      payload: RelayCloudMintCredentialRequest,
      success: RelayEnvironmentMintResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  )
  .add(
    HttpApiEndpoint.post("t3MintCredential", "/api/t3-connect/mint-credential", {
      payload: RelayCloudMintCredentialRequest,
      success: RelayEnvironmentMintResponse,
      error: EnvironmentHttpCloudErrors,
    }),
  ) {}

export class EnvironmentHttpApi extends HttpApi.make("environment")
  .add(EnvironmentMetadataHttpApi)
  .add(EnvironmentAuthHttpApi)
  .add(EnvironmentOrchestrationHttpApi)
  .add(EnvironmentPullRequestsHttpApi)
  .add(EnvironmentWorkflowCatalogHttpApi)
  .add(EnvironmentWorkbenchPlansHttpApi)
  .add(EnvironmentConnectHttpApi) {}
