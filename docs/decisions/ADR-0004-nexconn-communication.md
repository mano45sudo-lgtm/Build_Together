# ADR-0004: Real-time communication & Nexconn integration architecture

- **Status:** Accepted
- **Date:** 2026-11-04
- **Deciders:** Principal Architect
- **Related:** [ADR-0001](./ADR-0001-technology-stack.md), [ADR-0002](./ADR-0002-desktop-framework.md), [ADR-0003](./ADR-0003-authentication.md), [nexconn-integration.md](../architecture/nexconn-integration.md), [security-guidelines.md](../engineering/security-guidelines.md)

## Context

Phase 3 adds real-time communication. The brief is explicit that this must be a genuine
integration with the **Nexconn Chat SDK**, not a mock chat UI, and that no SDK method, event,
token format, or capability may be invented — everything must come from official documentation.
It must also preserve every Phase 2 property: the Argon2id/opaque-session auth model (ADR-0003),
server-side workspace isolation, and the hardened Electron security posture.

### What the verification established (source of truth)

Nexconn is the 2026 rebrand of RongCloud (RC). The two SDKs we installed and inspected are real:

- **Server SDK** `@nexconn/server-sdk` (git-only: `github:NexconnAI-Dev/nexconn-server-sdk-node#v0.1.2`,
  OpenAPI-generated, axios-based). Verified surface:
  - `new Configuration()`, `setNexconnCredentials(appKey, appSecret)`, `setPrimaryBackupDomains(primary, secondary)`
    (**required** — the SDK embeds no default domain), optional `setNonceGenerator()`. Auto-signs every
    request with `App-Key` + `Nonce` + `Timestamp` + `Signature` and injects `X-Request-ID`.
  - `UserManagementApi.issueAccessToken({userId,name,avatarUrl?}) → {code, result?: {userId, token}}`,
    `expireAccessToken({userIds[], expiresAt: number(ms)})`, `getUserConnectionStatus({userId, code?})`.
  - `GroupChannelManagementApi.createGroupChannel({channelId,name,owner})`, `joinGroupChannel({channelId,userIds[]})`,
    `quitGroupChannel({channelId,userIds[],shouldDeleteMute?})`, `dismissGroupChannel`, `listGroupChannelMembers({channelId,...})`.
  - Typed `ApiException` subclasses keyed to HTTP status (400/401/403/404/409/429/5xx).
- **Client SDK** `@rongcloud/imlib-next@5.46.1` (+ `@rongcloud/engine`) — function-export Web IMLib that
  runs in a Chromium renderer. Verified surface: `init({appkey})`, `connect(token, reconnectKickEnable?) → RCResult<{userId}>`,
  `disconnect()`, `getCurrentUserId()`, `sendTextMessage(conversation, {content}, options?)`,
  `getConversationList(options?)`, `getHistoryMessages(conversation, options?) → {list, hasMore}`,
  `getUnreadCount(conversation)`, `clearUnreadCountByTimestamp(conversation, timestamp)`,
  `sendTypingStatusMessage(conversation, typingContentType)`, `addEventListener(Events.MESSAGES, ({messages}) => …)`,
  `createGroup/joinGroup/quitGroup/getGroupMembers`, `recallMessage`. Enums verified:
  `ConversationType { PRIVATE=1, GROUP=3 }`, `MessageDirection { SEND=1, RECEIVE=2 }`, `RCConnectionStatus`, `ErrorCode.SUCCESS=0`,
  `Events { CONNECTING, CONNECTED, DISCONNECT, SUSPEND, MESSAGES, … }`. `IConversationOption = {conversationType, targetId}`;
  `IAReceivedMessage = {messageUId, senderUserId, sentTime(ms), messageDirection, conversationType, targetId, content}`.
- **Server callback signature** (docs.rongcloud.io `server-rtc-api/auth-callback` + platform-chat `auth-callback`):
  the provider POSTs headers `nonce` (≤18 chars), `timestamp` (unix ms) and `signature`, where
  `signature = SHA1(AppSecret + nonce + timestamp)` (hex, concatenated in that order). `appKey` is carried in the
  request (header or body depending on callback type).

### The security conflict that drove the client choice

RongCloud's **native** `@rongcloud/electron` integration sample requires `contextIsolation: false` and
`nodeIntegration: true`. That is incompatible with our Electron hardening (ADR-0002/0003). The user chose
**Web IMLib in the sandboxed renderer**: `@rongcloud/imlib-next` runs as ordinary renderer JavaScript over the
network, so `contextIsolation`, `sandbox`, and CSP stay on. **This ADR records that trade-off as a decision.**

## Decision

### Ownership boundary (Nexconn vs BuildTogether)

| Concern                                                                                                                                                     | Owner                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Realtime transport, message persistence, fanout, delivery state, presence, typing, read receipts, history                                                   | **Nexconn**                  |
| User identity, workspace identity/membership, RBAC, conversation authorization, identity mapping, token minting, webhook verification, application metadata | **BuildTogether `apps/api`** |

PostgreSQL stores **no message bodies** and never mirrors the provider store (database-engineering rule 2). It
stores only application metadata required to enforce workspace isolation and map identities (see schema section).

### Provider abstraction (dependency + future migration)

All provider access is hidden behind a framework-agnostic `ChatProvider` interface
(`token`, `expireToken`, `ensureGroup`, `joinGroup`, `leaveGroup`, `listMembers`, `connectionStatus`). The only
implementation is `NexconnChatProvider` (a thin adapter over `@nexconn/server-sdk`). Services depend on the
interface, so swapping providers — or self-hosting — touches one adapter, and unit tests inject a fake.
Nexconn ids are treated as opaque strings and never leak into the domain contract as BuildTogether ids.

### Identity mapping

`NexconnUserMapping` links a BuildTogether `userId` (the single source of truth) to a deterministic Nexconn
`externalId`. The external id is derived from the BT user id (never the email, never user-chosen) so a
user can never impersonate another Nexconn identity, and the mapping is unique per BT user. Name/avatar are
pushed to Nexconn at token-mint time (via `issueAccessToken`) so provider profiles stay current.

### Token & authentication flow

```
renderer                main (trusted)         apps/api (authority)          Nexconn
  │ chat.getToken(wsId)  │                        │                             │
  ├─────────────────────►│ GET /v1/chat/token     │                             │
  │                      ├─ Bearer <BT access> ──►│ verify session + workspace  │
  │                      │                        │ membership (fresh from DB)  │
  │                      │                        ├ issueAccessToken(userId…) ─►│
  │                      │                        │◄─ {token} ──────────────────┤
  │◄─ {token,appKey,ttl}─┤◄─ {token,appKey,ttl} ──┤  (AppSecret NEVER leaves api)│
  │ init({appkey}); connect(token) ───────────────────────────────────────────► │
```

- The **App Secret** lives only in `apps/api` env and is never returned to main or renderer.
- The **App Key** is a public client identifier (required by `init`) and is returned alongside the token.
- The Nexconn token is a short-lived, **user-scoped** client credential — it is the minimum client credential
  the SDK needs. It is delivered to the renderer only on explicit request over the typed IPC bridge; main does
  not cache or persist it to disk (unlike the BT session), because it is ephemeral and the renderer needs it to
  connect. Token expiry → renderer requests a fresh one; membership loss → backend refuses to mint.
- Token issuance is gated on **workspace membership**: a removed member stops receiving tokens, which — combined
  with the DB being the authoritative membership gate and `expireAccessToken` on removal — enforces access loss
  even beyond the group-quit API.

### Workspace isolation

Conversations are workspace-scoped entities (`WorkspaceConversation` carries `workspaceId`; unique/index leading
with it). Every conversation read/mutation resolves the conversation, verifies its workspace, then checks the
caller's **fresh** membership server-side (reusing `requireWorkspaceRole`). A client-supplied conversation id is
never trusted (security-review: no IDOR). Group conversations map 1:1 to a Nexconn group channel whose `channelId`
is a BuildTogether-generated id (≤20 chars, no underscore) stored opaquely.

### Webhooks

`POST /api/v1/webhooks/nexconn` verifies `signature = SHA1(AppSecret + nonce + timestamp)` against configured
credentials, rejects stale timestamps (replay window), and records the event **idempotently** in
`NexconnWebhookEvent` (unique provider event id) for lifecycle/audit + membership reconciliation. Webhook processing
is idempotent (duplicate deliveries are de-duplicated) and never trusts unsigned payloads. The raw body is retained
only as a bounded audit reference; message bodies are not persisted.

### Failure handling & resilience

- The app **fails closed**: missing `NEXCONN_APP_ID`/`NEXCONN_APP_SECRET`/API domains in production aborts boot
  for the chat module; `/chat/token` returns a typed 503 when the provider is unconfigured or unreachable.
- Server SDK `ApiException` is mapped to the `{data,error}` envelope (`code`, safe message) without leaking secrets.
- Client reconnect is delegated to the SDK's documented reconnection (`connect(token, reconnectKickEnable)`);
  the renderer never hand-rolls a socket. On `Events.DISCONNECT`/`SUSPEND` the UI shows honest connection state;
  on token invalidation it re-mints.

### Electron integration

Main stays the trusted boundary: it performs `/v1/chat/token` with the BT session, validates IPC sender origin and
arguments, and returns a safe `IpcOutcome`. The renderer imports `@rongcloud/imlib-next` directly (it is
network-only) but obtains the token and `appKey` through the bridge — no Node APIs, no raw `ipcRenderer`, no App
Secret, no BT refresh token crosses into the renderer.

## Consequences

- **Positive:** realtime chat without weakening Electron isolation; clean provider seam for migration; workspace
  isolation enforced server-side; message storage delegated (no schema bloat); honest failure/credential gating.
- **Negative / accepted:** two SDK dependency trees (`@nexconn/server-sdk` from git — its install reported an
  internal npm "1 high severity" advisory that must be surfaced and tracked; `@rongcloud/*` on npm). Web IMLib
  places the short-lived user token in renderer memory (unavoidable for the SDK; App Secret never does). Native
  `@rongcloud/electron` is intentionally **not** used (security conflict). Realtime end-to-end is only provable
  against live Nexconn credentials; mocked tests prove our logic, not the provider.
