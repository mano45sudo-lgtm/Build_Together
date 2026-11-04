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
Accent:       #FAFAFA  hover #E4E4E7  foreground #090909            /* primary action = light */
Status:       success #4ADE80  warning #FBBF24   danger #F87171      info #A1A1AA /* neutral, no blue */
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
(primary light, secondary charcoal, ghost, **destructive** restrained-red), IconButton, Input,
Field, Badge, Avatar, Card, Dialog, Dropdown, Tooltip, Skeleton, Spinner, Alert, EmptyState,
Separator, NavItem. Lucide icons only, monochrome, consistent stroke/size. Every control defines
default / hover / focus-visible / active / disabled / loading / error; focus is always visible
(white ring, never colored); disabled uses `--color-disabled`.

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

Blue/purple/cyan accents; bright or glowing cards; gradients and gradient text; glassmorphism as
decoration; nested cards; kicker/eyebrow labels above headings; section numbers; same-size card
page templates; hard offset glow shadows; decorative motion; fake screens or mock data standing
in for real functionality.

## Architecture note

The visual system is presentation-only. It preserves every working feature and the security
boundary: the renderer talks to the API only through the preload `window.bt` bridge (main process
is the sole authenticated client; tokens never reach the renderer), workspace isolation is enforced
server-side, and the Nexconn integration is unchanged. Global search and quick-create remain honest
planned placeholders (disabled input + truthful copy), not mocked functionality.
