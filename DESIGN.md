# Design — BuildTogether

> The documented, reusable visual language for BuildTogether, written from the **built**
> renderer (not aspiration). **Impeccable is the authority for frontend design**; this file is
> the durable contract the `impeccable` flow maintains and validates against rendered output.
> It describes the system actually shipped in `apps/desktop` (Electron renderer), so any future
> surface is built from one coherent, already-realized system.

## Visual direction

**Calm Light** — a clean, minimal, macOS-style SaaS look (the polish bar of Linear, Things and
Notion on the Mac). White canvas, a soft grey source-list sidebar, near-black type, hairline
borders, gentle shadows, and **one calm indigo accent** for the primary action, selection and
focus. A matching **dark appearance follows the OS** (`prefers-color-scheme`), like a native Mac
app — there is no in-app toggle. Depth comes from hairlines plus soft, low-alpha shadows. The only
other hues are functional status, small and rare.

Quality references (aspirational bar, **never** copied): Linear, Things, Notion, macOS itself.

## Color strategy (implemented tokens)

Foundational tokens live in the Tailwind v4 `@theme` block in `apps/desktop/src/styles/index.css`.
Utilities (`bg-canvas`, `text-primary`, `border-border-subtle`, `bg-accent`, `elevation-1`, …) are
generated from them. The dark appearance is a single `@media (prefers-color-scheme: dark)` block
that re-points the **same** variables on `:root`, so every utility re-skins with the OS and no
component needs `dark:` variants (the dialog scrim is the one exception). The Electron window's
`backgroundColor` follows `nativeTheme` so there is no flash before first paint.

```
                 Light (default)                       Dark (OS dark appearance)
Backgrounds:  canvas #FFFFFF  sidebar #F7F7F8       canvas #0F0F11  sidebar #0B0B0D
              surface-1 #FFFFFF  -2 #F4F4F5  -3 #ECECEE   surface-1 #151517  -2 #1C1C1F  -3 #242428
Borders:      subtle #EDEDEF  default #E2E2E5  strong #CFCFD4    #1F1F23 / #2A2A2F / #3F3F46
Text:         primary #18181B  secondary #52525B  muted #6B6B74  disabled #A1A1AA
                                                    #F4F4F5 / #A1A1AA / #8B8B94 / #52525B
Accent:       #5B5BD6  hover #4E4EC7  active #4343B3  fg #FFFFFF
                                                    #8584F0 / #9594F4 / #A5A4F7  fg #0B0B12
Status:       success #15803D  warning #B45309  danger #DC2626  info = accent
                                                    #4ADE80 / #FBBF24 / #F87171
Button fills: success #15803D/#166534  danger #DC2626/#B91C1C  warning #F59E0B/#D97706 (fg #18181B)
Shadow:       --color-shadow rgb(16 16 24 / .08)   rgb(0 0 0 / .5)
```

Rules: the accent is the only interactive hue (primary button, selected/active indicators, focus
ring, selection); greys carry hover/active surfaces; status colours are reserved for meaning and
never the sole signal (always paired with a label/icon); no bright cards, no second accent.

## Typography

**Inter Variable** for all UI text, bundled locally via `@fontsource-variable/inter` (imported in
`main.tsx`; woff2 served from the app, allowed by CSP `font-src 'self'`) — never a CDN. Fallbacks:
`-apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, …`. Inter's `cv11` (single-storey
a) is enabled globally for calmer UI text. Monospace is the platform UI mono (`ui-monospace, SF Mono,
Menlo, Cascadia Code, Consolas`) — not bundled, since it is only used for a few IDs/codes.
Semibold (600) headings, regular (400) body. Display is capped at 24px / 600 with -0.02em tracking
(`--text-display`); body defaults to `text-sm` (14px); metadata `text-2xs` (11px) with
`tabular-nums` for times/counts.

## Layout & shell

Desktop-first (target 1280×800, 1440×900, 1600×900, 1920×1080); no mobile-first compression.

- **Sidebar** (`w-60` / 240px, `bg-sidebar`): brand + workspace switcher at top; primary nav
  (Home, Projects, Conversations) and a separated **Workspace** group (Members, Settings) with a
  hairline divider; the **account** block (avatar, name, profile menu, sign out) is anchored at
  the bottom.
- **Top bar**: intentionally minimal — section context label + global search (`⌘K`), quick-create,
  and the API status indicator. Tasks/decisions live inside project context, not the chrome.
- Prefer whitespace, alignment, and thin separators over "a card for every section." Project lists
  are **horizontal rows** in a single divided surface, not tiles.

## Spacing & radius

4px base rhythm. `--radius-md` (6px) for controls, `--radius-lg` (10px) for panels/cards,
`--radius-xl` (14px) for overlays. Elevation is declared once per surface (a border **or**
`elevation-1..3`, never stacked); each level pairs a soft `--color-shadow` blur with a hairline ring.

## Component principles

A small, consistent `components/ui` primitive set built once and reused by features: Button
(7 intent variants × 3 densities — full matrix under **Button system** below), IconButton, Input,
Field, Badge, Avatar, Card, Dialog, Dropdown, Tooltip, Skeleton, Spinner, Alert, EmptyState,
Separator, NavItem. Lucide icons only, monochrome, consistent stroke/size. Every control defines
default / hover / focus-visible / active / disabled / loading / error; focus is always visible
(accent ring); disabled uses `--color-disabled`.

## Button system

One token-driven control — `components/ui/Button.tsx` — is the source of truth for **every** action
in the renderer. Variants encode _intent_, sizes encode _density_, and each state is defined once
there so no screen re-implements a button. Composite controls (`ButtonGroup`, `SplitButton`) and the
`buttonClassNames(variant, size)` helper reuse the exact same recipe rather than re-declaring colour.

**Variants (intent):**

| Variant       | Surface                             | Use for                                                         |
| ------------- | ----------------------------------- | --------------------------------------------------------------- |
| `primary`     | indigo fill (`accent`), white label | The single most prominent action on a surface (Create, Confirm) |
| `secondary`   | soft fill (`surface-2`) + hairline  | A supporting action beside primary                              |
| `outline`     | transparent + hairline border       | Low-emphasis boundary action — **Cancel / Dismiss** in dialogs  |
| `ghost`       | transparent, muted until hover      | Inline / contextual / toolbar actions                           |
| `destructive` | solid red fill (`danger-fill`)      | Irreversible / risky (Delete, Remove member, Reject)            |
| `success`     | solid green fill (`success-fill`)   | Positive confirmation (Approve, Complete)                       |
| `warning`     | solid amber fill, dark label        | Caution-requiring confirmation                                  |

**Sizes (density):** `lg` = 44px (`h-11`) · `md` = 40px (`h-10`, default) · `sm` = 32px (`h-8`).
`IconButton` is square (`size-11`/`size-9`/`size-8`) and always carries an `aria-label`.

**States (all defined once):** default → hover (fill/token shift) → active (deeper fill or
`translate-y-px` press) → `focus-visible` (offset accent ring on a canvas gap) → disabled (`opacity-50`, `pointer-events-none`, label stays legible) → loading.
Loading is a `loading` **prop**, never a hand-injected spinner: it renders the shared `Spinner`,
blocks repeat activation, sets `aria-busy`, and keeps the label visible. Leading icons are
suppressed while `loading` so the spinner is the only motion.

**Icons:** Lucide, 16px (`size-4`) on `md`/`lg`, 14px (`size-3.5`) on `sm`; the `gap-2` (8px) layout
is on the base class; icon-only controls get a ≥32px hit area plus an `aria-label`.

**Usage rules:** every dialog footer is Outline `Cancel` + Primary `Confirm`; a semantic action uses
`destructive`/`success`/`warning` only when the action truly destroys, confirms, or warns — never for
ordinary navigation. Colour stays reserved: primary is the one accent, and the only other fills are
the semantic states.

**Accessibility:** full keyboard operation, always-visible focus ring, `aria-busy` while loading,
labeled icon controls. Every fill carries an AA label: white on accent 5.4:1, on success 5.0:1, on
danger 4.8:1; dark label on amber and on the dark-appearance accent.

## Background graphics

A small, reusable, **decorative-only** layer set lives in `components/visuals/` — kept separate from
functional `components/ui` primitives. It exists to make the product feel art-directed and premium
without becoming the UI. Everything is **neutral** (samples `--color-primary`), **static** (no
animation, so `prefers-reduced-motion` is trivially satisfied), `aria-hidden`, `pointer-events-none`,
bounded to its parent box (no overflow/scrollbars), and drawn from one token restraint budget:
`--graphic-ghost` 0.035 · `--graphic-plate` 0.05 · `--graphic-line` 0.07 · `--graphic-light` 0.06 ·
`--graphic-grid` 32px. Content that overlaps a layer is lifted with `relative z-10`; the graphic never
sits above text or controls.

**Components & intended use:**

| Component             | What it is                                                                         | Approved placement                                          |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `SoftLighting`        | Near-invisible radial graphite illumination                                        | Heroes, empty states (paired with a motif)                  |
| `DiagonalLayers`      | Two skewed "build plates" echoing the brand geometry                               | Dashboard hero, workspace/board empty states                |
| `SubtleGrid`          | Fine grid that fades toward content                                                | Section intros, onboarding — never behind dense tables/text |
| `ArcAccent`           | One large hairline arc + short highlight                                           | Empty states, focus areas                                   |
| `BrandMarkBackground` | Oversized, very-low-opacity **actual** mark (Lucide Hammer)                        | Auth/onboarding brand moment only                           |
| `EmptyStateVisual`    | Purpose-built compositions (`workspace`/`board`/`decision`/`connection`/`generic`) | Meaningful first-run empty states                           |

**Placement rules (restraint over quantity):** one major composition per visual region; graphics go
behind _introductory/negative space_, never behind functional cards, rows, lists or metrics; every
empty state uses the same motif family so they read as siblings, not four illustrations. The actual
brand mark is the Lucide `Hammer` (there is no separate logo asset) — `BrandMarkBackground` reuses it
rather than approximating it.

**Screens enhanced:** HomeScreen greeting (plates + lighting),
ProjectsScreen header (fading grid + lighting whisper), and the first-run empty states for projects,
archived projects, tasks and decisions. **Deliberately plain:** the auth screens (a single centred column under the wordmark), My Work, the Decision Vault list and
detail, Team lists, Settings, chat panes, all search/error empties, and the sidebar/top-bar chrome —
these are information-dense or functional and gain nothing from decoration. ("Connected Apps" is a
future phase and has no screen to enhance yet.)

**Performance:** pure CSS + tiny inline SVG; no raster images, canvas, WebGL, blur over large areas,
or animation libraries. Cost is negligible and does not affect responsiveness.

**Anti-pattern exception:** this system is the _only_ permitted use of a gradient — an extremely
subtle, neutral, token-budgeted lighting. Loud/coloured gradients, glows and glassmorphism remain
banned below.

## Interaction & motion

Consistent hover/focus, keyboard-first (⌘K search, Esc closes, Enter submits), tooltips,
confirmations for consequential actions, skeletons for loading, honest empty and error states.
Motion (Motion library) is subtle and meaningful: opacity/hover/menu/dialog transitions only,
120–180ms standard easing, transform/opacity, honoring `prefers-reduced-motion`. No page
transitions, background motion, or decorative scaling on operational surfaces.

## Accessibility

WCAG 2.1 AA minimum in both appearances (body ≥4.5:1, large ≥3:1; muted text ≥4.8:1 on
surface-2). Full keyboard operation with a
visible focus ring; landmark regions and logical reading order; icons labeled when they carry
meaning; status never conveyed by color alone; focus managed on route/dialog change.

## Visual anti-patterns (explicitly avoided)

A second accent hue; bright or glowing cards; loud or coloured gradients and gradient text (the
near-invisible neutral `SoftLighting` above is the sole permitted exception); glassmorphism as
decoration; nested cards; kicker/eyebrow labels above headings; section numbers; same-size card
page templates; hard offset glow shadows; decorative motion; fake screens or mock data standing
in for real functionality.

## Architecture note

The visual system is presentation-only. It preserves every working feature and the security
boundary: the renderer talks to the API only through the preload `window.bt` bridge (main process
is the sole authenticated client; tokens never reach the renderer), workspace isolation is enforced
server-side, and the Nexconn integration is unchanged. Global search and quick-create remain honest
planned placeholders (disabled input + truthful copy), not mocked functionality.
