# Design — BuildTogether

> The documented, reusable visual language for BuildTogether, written from the **built**
> renderer (not aspiration). **Impeccable is the authority for frontend design**; this file is
> the durable contract the `impeccable` flow maintains and validates against rendered output.
> It describes the system actually shipped in `apps/desktop` (Electron renderer), so any future
> surface is built from one coherent, already-realized system.

## Visual direction

A **Vercel-inspired monochrome dark UI**, with Linear's information hierarchy and Raycast's
desktop-native interactions. Deep-black backgrounds, layered charcoal/graphite surfaces, white
primary type, muted-grey secondary type, thin grey borders, minimal decoration, compact
navigation, and controlled spacing. Depth comes from **surface contrast and hairlines**, not
shadows or color. Color is not used for identity — the only hues are functional status, small
and rare.

Quality references (aspirational bar, **never** copied): Vercel, Linear, Raycast.

The accent is **not** a brand hue. `--color-accent` is near-white: the primary action is a light
surface with near-black text (the Vercel button). Anything that previously keyed off a blue
accent now resolves to white/grey automatically, because the renderer is entirely token-driven.

## Color strategy (implemented tokens)

Dark-first monochrome. Foundational tokens live in the Tailwind v4 `@theme` block in
`apps/desktop/src/styles/index.css`. Utilities (`bg-canvas`, `text-primary`, `border-border-subtle`,
`bg-accent`, `elevation-1`, …) are generated directly from them, so re-pointing a token re-skins
every surface.

```
Backgrounds:  canvas #0A0A0A   sidebar #090909   surface-1 #111111   surface-2 #171717   surface-3 #1C1C1C
Borders:      subtle #1D1D1D   default #262626   strong #3A3A3A
Text:         primary #FAFAFA  secondary #A1A1AA muted #71717A       disabled #52525B
Accent:       #FAFAFA  hover #E4E4E7  active #D4D4D8  foreground #090909  /* primary action = light surface */
Status:       success #4ADE80  warning #FBBF24   danger #F87171      info #A1A1AA /* neutral, no blue */
Button fills: success #16A34A/#15803D  danger #DC2626/#B91C1C  warning #F59E0B/#D97706 (fg #171717) /* solid semantic actions */
```

Rules: white + greys for all interaction (hover/focus/active/selection); status colors reserved
for meaning only (task/project state, destructive actions, presence) and never dominant or the
sole signal (always paired with a label/icon); no blue/purple/cyan anywhere; no bright cards.

## Typography

One highly-legible UI sans, system-first (`--font-sans`: Inter when available, else system-ui /
Segoe UI). No font binary is bundled, so the desktop falls back to the platform UI font — no
unnecessary dependency. Medium-weight (600) headings, regular (400) body, restrained sizes.
Display is capped at 24px / 600 with -0.02em tracking (`--text-display`); body defaults to
Tailwind `text-sm` (14px); metadata `text-2xs` (11px) with `tabular-nums` for times/counts.
Message text uses generous line-height for scanability. Line length in reader contexts is capped.

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

4px base rhythm. `--radius-md` (6px) for controls, `--radius-lg` (8px) for panels,
`--radius-xl` (12px) for overlays — restrained and consistent. Elevation is declared once per
surface (a border **or** `elevation-1..3`, never stacked); elevation pairs a real offset+blur
shadow with a hairline ring.

## Component principles

A small, consistent `components/ui` primitive set built once and reused by features: Button
(7 intent variants × 3 densities — full matrix under **Button system** below), IconButton, Input,
Field, Badge, Avatar, Card, Dialog, Dropdown, Tooltip, Skeleton, Spinner, Alert, EmptyState,
Separator, NavItem. Lucide icons only, monochrome, consistent stroke/size. Every control defines
default / hover / focus-visible / active / disabled / loading / error; focus is always visible
(white ring, never colored); disabled uses `--color-disabled`.

## Button system (Monochrome Precision)

One token-driven control — `components/ui/Button.tsx` — is the source of truth for **every** action
in the renderer. Variants encode _intent_, sizes encode _density_, and each state is defined once
there so no screen re-implements a button. Composite controls (`ButtonGroup`, `SplitButton`) and the
`buttonClassNames(variant, size)` helper reuse the exact same recipe rather than re-declaring colour.

**Variants (intent):**

| Variant       | Surface                                 | Use for                                                         |
| ------------- | --------------------------------------- | --------------------------------------------------------------- |
| `primary`     | light fill (`accent`), near-black label | The single most prominent action on a surface (Create, Confirm) |
| `secondary`   | graphite fill (`surface-2`) + hairline  | A supporting action beside primary                              |
| `outline`     | transparent + hairline border           | Low-emphasis boundary action — **Cancel / Dismiss** in dialogs  |
| `ghost`       | transparent, muted until hover          | Inline / contextual / toolbar actions                           |
| `destructive` | solid red fill (`danger-fill`)          | Irreversible / risky (Delete, Remove member, Reject)            |
| `success`     | solid green fill (`success-fill`)       | Positive confirmation (Approve, Complete)                       |
| `warning`     | solid amber fill, dark label            | Caution-requiring confirmation                                  |

**Sizes (density):** `lg` = 44px (`h-11`) · `md` = 40px (`h-10`, default) · `sm` = 32px (`h-8`).
`IconButton` is square (`size-11`/`size-9`/`size-8`) and always carries an `aria-label`.

**States (all defined once):** default → hover (fill/token shift) → active (deeper fill or
`translate-y-px` press) → `focus-visible` (offset white ring, readable even on the near-white
primary) → disabled (`opacity-50`, `pointer-events-none`, label stays legible) → loading.
Loading is a `loading` **prop**, never a hand-injected spinner: it renders the shared `Spinner`,
blocks repeat activation, sets `aria-busy`, and keeps the label visible. Leading icons are
suppressed while `loading` so the spinner is the only motion.

**Icons:** Lucide, 16px (`size-4`) on `md`/`lg`, 14px (`size-3.5`) on `sm`; the `gap-2` (8px) layout
is on the base class; icon-only controls get a ≥32px hit area plus an `aria-label`.

**Usage rules:** every dialog footer is Outline `Cancel` + Primary `Confirm`; a semantic action uses
`destructive`/`success`/`warning` only when the action truly destroys, confirms, or warns — never for
ordinary navigation. Colour stays reserved: primary is a light surface, and the only fills are the
semantic states.

**Accessibility & known limitation:** full keyboard operation, always-visible focus ring, `aria-busy`
while loading, labeled icon controls. The pinned brief hexes for the solid semantic fills
(`#16A34A`, `#DC2626`) sit at ~3.2–4.4:1 against a white label — under AA for small text. This is
honoured because the brief pins those exact hues, and is mitigated by pairing each fill with a
label/icon (never colour alone); moving those fills to their 700-shades (`#15803D`, `#B91C1C`) as the
_resting_ fill would restore AA if the concept is ever loosened.

## Background graphics (Monochrome Precision)

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

WCAG 2.1 AA minimum on dark surfaces (body ≥4.5:1, large ≥3:1). Full keyboard operation with a
visible focus ring; landmark regions and logical reading order; icons labeled when they carry
meaning; status never conveyed by color alone; focus managed on route/dialog change.

## Visual anti-patterns (explicitly avoided)

Blue/purple/cyan accents; bright or glowing cards; loud or coloured gradients and gradient text (the
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
