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

| Feature                  | Surface           | Depends on                        | Owns data                        | Phase |
| ------------------------ | ----------------- | --------------------------------- | -------------------------------- | ----- |
| Workspace & team mgmt    | Web + API         | auth                              | Workspace, Membership (Postgres) | 1     |
| Direct & group messaging | Web (Nexconn SDK) | Nexconn token                     | metadata/pointers only           | 2     |
| Project channels         | Web + API         | messaging, projects               | Project↔Nexconn channel link     | 2–3   |
| Conversation → task      | Web action + API  | messaging                         | Task + sourceRef                 | 3     |
| Task assignment & Kanban | Web + API         | workspaces, projects              | Task status/assignee             | 3     |
| Decision Vault           | Web + API         | messaging                         | Decision + sourceRef             | 4     |
| Team Pulse               | Web + API         | tasks, activity                   | derived/aggregates               | 4     |
| AI summaries & actions   | API (server-side) | messaging content, AI abstraction | summary/action artifacts         | 5     |

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

Phase 0 builds none of the above — this map guides sequencing in later phases.
