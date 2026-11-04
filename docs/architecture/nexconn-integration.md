# Nexconn Integration

BuildTogether delegates all real-time communication to the **Nexconn Chat SDK**. This
document records the integration contract and boundaries. Governed by the
`nexconn-integration` skill.

> **Source-of-truth rule:** concrete SDK method names, event signatures, auth-token API and
> capabilities must be taken from the **official Nexconn documentation** during the
> integration phase, before any implementation. **No Nexconn method is to be invented or
> assumed here.** Where this doc describes behavior, it describes the _contract between
> BuildTogether and Nexconn_, not specific SDK calls.

## Ownership boundary

| Responsibility                                                           | Owner                             |
| ------------------------------------------------------------------------ | --------------------------------- |
| Real-time transport, message storage & delivery, presence, read receipts | **Nexconn**                       |
| Chat UI wiring, event subscription, optimistic rendering                 | `apps/desktop` renderer (via SDK) |
| Identity mapping, token minting, privileged ops, webhooks                | `apps/api`                        |
| Task/decision/channel associations, project metadata                     | `apps/api` → PostgreSQL           |

BuildTogether **never** rebuilds or mirrors Nexconn's messaging infrastructure in Postgres.

## Identity & token flow (contract)

```
1. Client authenticates to apps/api (BuildTogether session).
2. apps/api ensures a Nexconn identity for that user (server credentials, App Secret).
3. apps/api mints a short-lived, user-scoped Nexconn auth token.
4. apps/api returns { token, expiresIn, identity } to the client.
5. The `apps/desktop` renderer initializes the Nexconn SDK with the token and
   connects/subscribes.
6. On token expiry, client requests a fresh token from apps/api (never holds the App Secret).
```

The App Secret lives **only** in `apps/api` environment. The frontend bundle must contain
no secret — verified every phase (see `security-review`).

## Application metadata model

Postgres stores pointers only:

- project/channel ↔ Nexconn channel/group id,
- message → task and message → decision provenance (Nexconn message id + BT entity id),
- display/organization metadata Nexconn doesn't own.

## Capabilities to confirm from official docs (integration phase)

Direct messaging, group channels, community channels, message events, read receipts,
presence, attachments, notification integration, and error/reconnection handling are listed
as **product requirements**; each maps to a specific documented SDK capability that must be
verified in Nexconn's docs before implementation. Any required capability that the docs do
not clearly provide is logged as an **open blocker**, not guessed.

## Resilience

Use Nexconn's documented reconnection strategy (do not hand-roll sockets). Reconcile
optimistic UI against server events; avoid duplicate rendering of replayed messages after
reconnect. Attachments: enforce size/type policy server-side before handing off to the
documented upload API.

## Phase 0 state

No Nexconn code is integrated in Phase 0. This document, plus the `nexconn-integration`
skill, defines the boundary so the integration phase starts from an agreed contract and an
explicit list of documentation to consult.

## Phase 4 state (projects — integration boundary unchanged)

Phase 4 shipped the **Projects foundation** but **no new Nexconn surface**: there is no
`project/channel ↔ Nexconn channel/group id` link yet, because Phase 3 integrated only workspace
**GROUP** and **DIRECT** conversations. Rather than invent a project-channel SDK method (§10/§11), the
desktop project **Conversations** tab is an honest bridge to workspace Messages. Binding a project to a
real Nexconn channel remains deferred to a later, authorized phase once the docs confirm the capability;
throughout, the App Secret stays server-side and only a short-lived, user-scoped token reaches the
client.
