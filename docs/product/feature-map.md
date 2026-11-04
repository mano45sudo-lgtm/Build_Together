# Feature Map

The product's core loop and how features relate. The spine of BuildTogether is
**conversation → work → decision → insight**, all inside a workspace and its project
channels.

```
Workspace
├── Members & Roles  (isolation boundary)
├── Projects
│   ├── Project Channels ──(real-time via Nexconn)──┐
│   │                                               │
│   ├── Messages ──(select)──▶ Create Task ──▶ Kanban Board
│   │        │                       (keeps source link = provenance)
│   │        └──────(select)──────▶ Save to Decision Vault
│   └── Team Pulse  (progress/activity signals)
│
└── AI Layer (later) ──▶ Conversation Summaries + Action Extraction
                                  │
                                  └──▶ proposed tasks/decisions (user confirms)
```

## Feature inventory

| Feature                    | Surface               | Depends on                        | Owns data                         | Phase | State |
| -------------------------- | --------------------- | --------------------------------- | --------------------------------- | ----- | ----- |
| Identity / authn & session | Desktop (main) + API  | —                                 | User, Session (Postgres)          | 2     | Built |
| Workspace & team mgmt      | Desktop + API         | auth                              | Workspace, Membership, Invitation | 2     | Built |
| Direct & group messaging   | Desktop (Nexconn SDK) | Nexconn token                     | metadata/pointers only            | 3     | Built |
| Project channels           | Desktop + API         | messaging, projects               | Project↔Nexconn channel link      | 4     | —     |
| Conversation → task        | Desktop action + API  | messaging                         | Task + sourceRef                  | 4     | —     |
| Task assignment & Kanban   | Desktop + API         | workspaces, projects              | Task status/assignee              | 4     | —     |
| Decision Vault             | Desktop + API         | messaging                         | Decision + sourceRef              | 5     | —     |
| Team Pulse                 | Desktop + API         | tasks, activity                   | derived/aggregates                | 5     | —     |
| AI summaries & actions     | API (server-side)     | messaging content, AI abstraction | summary/action artifacts          | 6     | —     |

## Key relationships (product invariants)

- A **Task** created from chat always retains a **provenance pointer** to the originating
  message — this is the product's differentiator and must never be dropped.
- **Nexconn owns** message transport/presence/receipts; every feature above stores only
  BuildTogether metadata and references, never a message mirror.
- Every feature is **workspace-scoped**; cross-workspace access is denied by design.
- **AI** proposes; the user confirms any task/decision it creates (no silent writes).

## Deliberately not in the map (yet)

Video calls, file versioning UI, external integrations, billing UI, mobile apps. They stay
out until there is a clear product reason (product philosophy: no feature without reason).

Phase 0–1 built none of the data features above; **Phase 2 delivers the first two rows**
(identity/auth and workspace/team management) — the isolation base every later row depends on.
**Phase 3 delivers direct & group messaging** — workspace-level conversations over Nexconn, with
BuildTogether owning identity mapping + authorization and Nexconn owning the realtime stream. Project
channels, conversation→task, Kanban, Decision Vault, Team Pulse and AI remain later phases.
This map guides sequencing for the remaining phases.
