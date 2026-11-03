# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop (Electron; desktop-first with a React renderer)

## Stack

Electron (main/preload/renderer) + React + Vite + TypeScript + Tailwind CSS + Motion
(`motion`) + Lucide (renderer, `apps/desktop`); Node.js + Express + TypeScript (backend,
`apps/api`); PostgreSQL + Prisma;
Nexconn Chat SDK for real-time messaging; provider-independent server-side AI abstraction
(later phase). pnpm monorepo, ESLint/Prettier, Vitest + Playwright. See
`docs/decisions/ADR-0001-technology-stack.md` and
`docs/decisions/ADR-0002-desktop-framework.md`.

## Users

Product and project teams that collaborate over chat and manage work — the primary user is
a team member mid-conversation who needs to turn a decision or request in chat into
tracked, assigned work without leaving the conversation. Secondary audiences: team/project
leads who monitor progress and preserve decisions, and workspace administrators who manage
teams and membership.

## Product Purpose

BuildTogether is a chat-first team collaboration platform where conversations become
actionable work. Teams communicate, collaborate on projects, create tasks directly from
messages, preserve important decisions, and monitor progress — in one place. It exists to
remove the fragmentation of messaging apps, project-management tools and documentation
platforms that today force context to be reassembled by hand. Success = less tool-hopping
and a visible, traceable line from a conversation to completed work.

## Positioning

The mechanism a neighboring product could not copy verbatim: **provenance from chat to
work.** Every task and decision carries a live link back to the conversation and context
that produced it (conversation-to-task conversion + a Decision Vault), while real-time
messaging is provided by the Nexconn Chat SDK rather than a bolted-on PM tool. Communication
leads to execution by default, not as an afterthought.

## Operating Context

Day-to-day team work: direct and group messaging, project-specific channels, deciding
what happens next, converting messages into assigned tasks on a Kanban board, recording
decisions, and reading summaries of what happened. Collaboration is text/chat-centric and
spans the working day; progress and "team pulse" are checked alongside the conversation,
not in a separate product.

## Capabilities and Constraints

Planned core capabilities (introduced phase by phase — **not all built yet**): workspace
and team management; direct + group messaging; project-specific channels; real-time
communication via Nexconn Chat SDK; conversation-to-task conversion; task assignment and
Kanban; Decision Vault; Team Pulse; AI-powered conversation summaries and action
extraction.

Durable constraints:

- Real-time messaging is **Nexconn's** responsibility; BuildTogether stores only
  application-level metadata and never duplicates Nexconn's message infrastructure.
- SDK methods/APIs/capabilities must come from official Nexconn documentation; do not
  invent them. App Secrets and AI credentials stay server-side.
- AI functionality arrives in a later phase behind a provider-independent abstraction.
- Work is delivered in explicit, gated phases (Phase 0 = engineering environment; no
  product features yet).

Undecided (do not fabricate): AI provider choice and exact model; pricing, target
customers, logos, testimonials and any market claims; final feature scoping per phase.

## Brand Commitments

Name: **BuildTogether**. Tagline: **"From Conversation to Completion."** Category:
Workplace & Collaboration. Product personality (from philosophy): focused, purposeful,
frictionless, execution-oriented; communication that reliably turns into done work.
Quality references (aspirational bar, **not** interfaces to copy): Linear, Notion, Slack.

## Evidence on Hand

Only the Phase 0 product brief and this repository. There is **no** real usage data,
customer list, benchmark, testimonial, or pricing yet — future design/build work must not
invent any. No app UI or content exists yet (Phase 0 is engineering readiness only).

## Product Principles

1. Communication should lead to execution; the conversation-to-work link is the core loop.
2. Preserve the context behind every important task; nothing should lose its provenance.
3. Keep collaboration intuitive and frictionless; minimize tool-hopping and ceremony.
4. Build modular, maintainable software; avoid unnecessary complexity.
5. Never introduce a feature without a clear product reason; polish the experience that
   earns its place.

## Accessibility & Inclusion

Target **WCAG 2.1 AA** as the default bar for the collaboration UI (keyboard-operable
interactions, visible focus, sufficient contrast on the premium dark theme, screen-reader
meaningful labels). No product-specific accessibility mandate beyond this has been stated
yet; confirm if a customer or regulation requires more.
