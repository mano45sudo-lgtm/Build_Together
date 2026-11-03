# Design — BuildTogether

> The documented, reusable visual language for BuildTogether. It captures the intended
> design direction from the product brief so every surface is built from one coherent
> system. **Impeccable is the authority for frontend design**; this file is the durable
> contract Impeccable's `new-work` flow will formalize, extend and validate when the first
> UI is built in a later phase. No product UI exists yet (Phase 0 = engineering readiness).

## Visual direction

A **premium, minimal, dark collaboration product**. Sophisticated and calm, with excellent
typography and spacing, strong information hierarchy, and restrained accent color. The
interface should feel focused and execution-oriented — quiet chrome, confident content.
Aspirational bar (quality references, **never** to be copied): Linear, Notion, Slack.

The one job of the visual system: make three kinds of thing instantly distinguishable —
**conversations**, **tasks**, and **project/decision information** — while keeping them
clearly connected (chat → work provenance).

## Color strategy

Dark-first. A near-black/blue-black base with layered surfaces, a single restrained accent,
and a semantic color set used only for meaning (never decoration).

Foundational tokens (Tailwind v4 `@theme` in `apps/desktop/src/styles/index.css` — added
in Phase 1):

```
--bg-canvas:    #0B0D10   /* app background */
--bg-surface-1: #121519   /* panels / sidebars */
--bg-surface-2: #191D23   /* raised cards, menus */
--border-subtle:#262B33   /* hairline dividers, outlines */
--text-primary: #E7EAF0
--text-secondary:#9AA3B2
--text-muted:   #6B7383
--accent:       #4C8DFF   /* single primary action accent (restrained) */
--accent-hover: #3D7BF0
--success:#2FB37C  --warning:#E0A64B  --danger:#E5484D  --info:#3E9AD1
```

Rules: one accent color for primary actions; semantic colors reserved for status
(task state, destructive actions, presence). Text/hairlines chosen to meet contrast on
dark surfaces. Do not paint meaning onto unrelated elements; do not use color as the only
signal (pair with icon/label).

## Typography strategy

A single highly-legible UI sans (system-first stack, e.g. Inter when self-hosted) with a
clear modular scale. Hierarchy carries meaning, not decoration.

```
Display  30/36 · 600   (page titles, rarely)
H1       22/28 · 600   (channel / project headers)
H2       18/24 · 600   (section headers)
Body     15/22 · 400   (messages, descriptions)   ← default
Small    13/18 · 400   (metadata, timestamps)
Caption  12/16 · 500   (labels, badges) — use tabular-nums for times/counts
```

One family for UI. Message body ~15px with generous line-height for scanability. Weights
400/500/600 only; avoid heavy display weights inside dense work surfaces. Line length in
reader contexts is capped for comfort.

## Spacing system

4px base scale (4/8/12/16/24/32/48). Consistent gutters and rhythm: message density uses
8–12px vertical; panels 16–24px padding; page/section separation 24–48px. Radii:
`rounded-md` (6px) for controls, `rounded-lg` (8–10px) for panels — used sparingly, not
globally. Prefer spacing and hairline borders over stacking shadows to build depth.

## Component principles

- A small, consistent `components/ui` primitive set (Button, Input, Select, Badge, Avatar,
  Tooltip, Menu, Dialog, Card) built once and reused; feature components compose them.
- Clear affordance hierarchy: one primary action per context (accent), secondary as
  outline/ghost, destructive isolated and confirmed.
- Density appropriate to work tools: readable, not cramped; whitespace signals grouping.
- Every component has defined default / hover / focus-visible / active / disabled / loading
  / error states. Focus is always visible.
- Distinct, repeatable treatments for the three core objects:
  - **Conversation** — message stream rhythm, sender grouping, timestamps, reactions.
  - **Task** — compact card with status, assignee, and a link back to its source message.
  - **Decision / project info** — calm "record" styling, clearly separate from chat.

## Interaction patterns

Chat-first: select text/message → "Create task" / "Save as decision" with a visible, one-step
conversion that preserves provenance. Kanban drag-and-drop with keyboard-accessible
alternative. Optimistic UI for messaging and task moves, reconciled against Nexconn events.
Inline editing where low-risk; dialogs for consequential actions. Undo/toast for
destructive-but-reversible actions. Command palette (⌘K) for fast navigation as the surface
grows.

## Motion principles

Motion is subtle and meaningful, never decorative. Short durations (120–200ms) with ease-out
for entrances and ease-in-out for state changes; transform/opacity only. Animate to explain
change (a converted task flying to its column, message arrival, panel reveal), and keep
persistent work surfaces still. Honor `prefers-reduced-motion` (reduce to fade / none). No
looping, attention-grabbing animation on operational screens.

## Responsive behavior

Three-pane desktop workspace (nav · conversation · context) collapses gracefully: below
tablet, panes become stacked/overlaid navigation with the conversation as the focus; mobile
prioritizes the active channel/thread and a reachable composer. Targets ≥44px. Layout is
fluid with sensible max-widths for reading columns. Real estate on smaller screens hides
secondary context, never core actions.

## Accessibility standards

WCAG 2.1 AA minimum: text/UI contrast on dark surfaces; full keyboard operation with
visible focus ring; logical reading order and landmark regions; meaningful labels for icons
(Lucide decorative unless it conveys meaning); ARIA only where native semantics fall short;
status never conveyed by color alone; reduced-motion respected; focus managed on route/
dialog changes.

## Visual anti-patterns (explicitly avoided)

Generic AI-generated SaaS layouts; excessive gradients; unnecessary glassmorphism; over-
rounded corners everywhere; nested cards; decorative elements without function; generic
dashboard templates; excessive or attention-grabbing animation; inconsistent spacing and
typography; accent/semantic color used as decoration; copying Linear/Notion/Slack interfaces
rather than meeting their quality bar.

> Open items for the first UI phase (via `/impeccable` new-work): confirm the exact accent
> hue and font self-hosting, and formalize tokens into `@theme` CSS with real component
> samples. This document sets direction and constraints; Impeccable validates them against
> rendered output before the system is locked.
