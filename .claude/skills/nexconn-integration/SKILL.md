---
name: nexconn-integration
description: "Integration of the Nexconn Chat SDK into BuildTogether for real-time communication. Use for any work touching Nexconn: SDK setup, user identity mapping, secure token generation, direct messaging, group/community channels, message events, read receipts, presence, attachments, notifications, and error/reconnection handling. Enforces consulting official docs and forbids hallucinating SDK methods or leaking App Secrets."
---

# Nexconn Chat SDK Integration

BuildTogether delegates real-time messaging to Nexconn. This skill defines the boundary
between what Nexconn owns and what BuildTogether stores.

## Non-negotiable rules

1. **Consult official documentation first.** Do not invent Nexconn SDK methods, event
   names, payload shapes, or capabilities. If docs are unavailable for a needed feature,
   record it as an open blocker and do not ship a guessed implementation.
2. **Never expose App Secrets in frontend code.** The App Secret / server credentials
   live only in `apps/api` environment. The browser receives a short-lived,
   user-scoped **auth token** minted by the backend — nothing more.
3. **Nexconn owns the messaging.** Do not rebuild chat transport, message storage, fanout
   or delivery state inside PostgreSQL. BuildTogether stores only application metadata.
4. **Privileged operations go through the backend**: identity registration/mapping, token
   generation, webhook verification, moderation, attachment policy.

## Responsibility split

| Concern | Owner |
| --- | --- |
| Message transport, real-time fanout, presence, read receipts | **Nexconn** |
| Chat UI wiring to SDK, subscribing to events | Frontend (`apps/web`) via SDK + backend-minted token |
| User identity ↔ BuildTogether user mapping, token minting | Backend (`apps/api`) |
| Channel/task/decision *associations*, project metadata | Backend → PostgreSQL (application-level only) |

## Identity & token flow

```
client -> api: authenticate (BuildTogether session)
api: resolve/ensure Nexconn user identity for this BT user  (server creds)
api: generate scoped Nexconn auth token (server-side)
api -> client: { nexconToken, expiresIn, userIdentity }
client -> Nexconn SDK: init with token, connect, subscribe events
```

- Tokens are short-lived, scoped to the authenticated user's memberships, and never
  carry the App Secret.
- Map Nexconn identity deterministically to BuildTogether `userId` (single source of
  truth) so workspace membership changes reflect in access.

## Application metadata model

Store only what BuildTogether needs to link chat to product concepts:
- reference of a project/channel to a Nexconn channel/group identifier,
- message→task and message→decision provenance pointers (Nexconn message id + BT entity),
- display/organization metadata that Nexconn doesn't own.

Never store full message bodies or replicate Nexconn's store. Keep Nexconn ids opaque
and indexed for lookups.

## Events, resilience & attachments

- Subscribe to message/presence/read-receipt events through the SDK's documented event
  API; render optimistic UI and reconcile on server events.
- Implement the SDK's documented **reconnection** strategy; do not hand-roll a socket
  layer. Handle auth-token expiry by requesting a fresh one from the backend.
- Attachments: enforce size/type policy in the backend before handing off to Nexconn's
  documented upload/attachment API.

## Verification before claiming integration works

1. Cite the exact official doc section used for every SDK call introduced.
2. Confirm no App Secret appears anywhere in `apps/web` source or bundle.
3. Confirm token is minted server-side and short-lived.
4. Confirm no chat messages/presence are stored in PostgreSQL.
5. If any capability was assumed but not documented, list it as an explicit assumption
   and blocker — do not present it as working.

> This skill currently documents the integration contract. Concrete SDK method names,
> event signatures and auth-token API must be filled in from official Nexconn docs
> during the integration phase, before implementation.
