# Product Requirements

What BuildTogether must do, expressed as outcomes. Sequenced by phase (see
`docs/development/phase-roadmap.md`). This is requirements, not implementation.

## Problem

Teams lose work-context by scattering conversation (chat), execution (PM tool) and decisions
(docs) across separate products. Turning a chat decision into tracked work is manual and
loses provenance.

## Value proposition

A chat-first workspace where conversations become actionable work with their context intact —
messaging, project channels, task creation from messages, a Kanban, a Decision Vault, Team
Pulse, and AI summaries, unified.

## Functional requirements (by capability)

| #   | Capability               | Requirement (outcome)                                                             | Phase |
| --- | ------------------------ | --------------------------------------------------------------------------------- | ----- |
| R1  | Workspaces & teams       | Create/join workspaces; manage members and roles; everything is workspace-scoped. | 1     |
| R2  | Direct & group messaging | 1:1 and group conversations, real-time via Nexconn.                               | 2     |
| R3  | Project channels         | Channels bound to a project; project context visible alongside chat.              | 2–3   |
| R4  | Conversation → task      | Select a message (or text) and create a task that keeps a link to its source.     | 3     |
| R5  | Task assignment & Kanban | Assign, prioritize, and move tasks across board columns.                          | 3     |
| R6  | Decision Vault           | Capture important decisions with context and retrieve them later.                 | 4     |
| R7  | Team Pulse               | Surface activity/progress signals for a team/project.                             | 4     |
| R8  | AI summaries & actions   | Summarize conversations and extract candidate actions (server-side AI).           | 5     |

## Cross-cutting requirements

- **Isolation & authorization:** no user sees another workspace's private data (hard). (All)
- **Real-time ownership:** Nexconn owns messaging transport/state; BuildTogether stores only
  metadata + provenance references. (All)
- **Accessibility:** WCAG 2.1 AA across the collaboration UI. (UI phases)
- **Responsive:** usable on desktop (three-pane) down to mobile. (UI phases)
- **Security:** secrets server-side; validated inputs; protected network surface. (All)

## Non-goals (for now)

Not a general email/calendar suite; not rebuilding chat infrastructure; no feature without a
clear product reason; no AI features before the AI phase.

## Open product decisions (do not assume)

Exact role permission matrix, presence/typing requirements, notification policy, integration
details pending Nexconn docs, AI provider/model. Each is resolved with the user at its phase.
