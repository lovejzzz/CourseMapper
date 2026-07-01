# CourseMapper Design System

_v1 — July 2026. Enforced by `tests/design-system.test.js`; token sources are
`src/index.css` (CSS variables) and `tailwind.config.js` (semantic Tailwind theme)._

The 2026-07-01 styling audit found 131 raw hex colors, 16 ad-hoc font sizes
(112 uses at 8–9px), ~15 hand-rolled button styles, and 4 parallel
status-badge systems. This document is the contract that stops that drift:
**new UI uses tokens and primitives; raw values need a reason.**

## 1. Color

All semantic colors are CSS variables defined for `:root` and `.dark`, mapped
into Tailwind. Using them means dark mode is automatic — no `dark:` prefix, no
`!important` override in `index.css`.

| Tailwind class                                                           | Meaning                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `bg-surface` / `bg-surface-alt` / `bg-surface-alt2` / `bg-surface-body`  | Card / inset / deeper inset / page background                      |
| `text-ink` / `-secondary` / `-tertiary` / `-muted` / `-faint`            | Text hierarchy, strongest → weakest (all AA on `surface`)          |
| `border-line` / `border-line-strong`                                     | Hairline and emphasized borders                                    |
| `bg-accent` / `-strong` / `-soft`, `text-accent-text`                    | Brand indigo family: fills, hovers, chip backgrounds, on-soft text |
| `text-status-{success,warning,danger,info,neutral}` + `bg-status-*-soft` | Status pairs — base color is AA on its matching `-soft`            |
| `text-gbrand-{docs,sheets,slides}` + `-accent` / `-soft` / `-hover`      | Google Workspace brand, single source for every export surface     |

Rules:

- **No new hex in `className`.** If a color has no token, add the token first.
- SVG brand _icons_ (Google logos, etc.) may keep literal brand hex in
  `fill`/`stroke` attributes — buttons and chips around them may not.
- Slate-scale utilities (`text-slate-500` …) are legacy; prefer `ink-*`
  equivalents in new/edited code so dark mode stops needing overrides.

## 2. Typography

One family (Inter stack). Semantic scale (Tailwind `fontSize`):

| Class           | Size/leading | Use                                                    |
| --------------- | ------------ | ------------------------------------------------------ |
| `text-2xs`      | 10/14        | The floor. Dense chrome only (dev panels, ribbon meta) |
| `text-caption`  | 11/16        | Timestamps, helper text, chip labels                   |
| `text-label`    | 12/16        | Buttons, form labels, table headers                    |
| `text-body`     | 13/20        | Default UI prose                                       |
| `text-body-lg`  | 14/22        | Reading-weight prose, dialogs                          |
| `text-title`    | 16/24        | Card/section titles                                    |
| `text-headline` | 20/28        | Page sections                                          |
| `text-display`  | 26/34        | Hero/landing statements                                |

Rules:

- **Nothing below 10px.** `text-[8px]`/`text-[9px]` are banned by the gate
  (exception: miniature slide thumbnails in `SlideDecksView`, which render
  scaled-down slides, not readable UI).
- Prefer the semantic names over `text-xs`/`text-sm`/arbitrary px so a scale
  change stays a one-line edit.

## 3. Shape & elevation

| Class           | Value   | Use                                      |
| --------------- | ------- | ---------------------------------------- |
| `rounded-ctl`   | 8px     | Controls: buttons, inputs, selects       |
| `rounded-card`  | 12px    | Cards, table containers, popovers        |
| `rounded-panel` | 16px    | Modals, side panels, large sheets        |
| `rounded-pill`  | pill    | Chips, badges, the header's pill buttons |
| `squircle*`     | 12–28px | Marketing/landing surfaces only          |

Elevation: `shadow-glass` for resting cards, `shadow-glass-lg` for overlays,
`shadow-btn` for the primary CTA. Don't invent inline `shadow-[…]` values.

## 4. Primitives — `src/components/ui`

```jsx
import { Button, Card, StatusBadge } from './ui';

<Button>Continue</Button>
<Button variant="secondary" size="sm" icon={<GearIcon />}>Settings</Button>
<Button variant="ghost" aria-label="Close" icon={<XIcon />} />

<Card padding="lg" elevated>…</Card>

<StatusBadge status="done">Ready</StatusBadge>
<StatusBadge status="error" size="sm">Failed</StatusBadge>
```

- `Button` variants: `primary` (accent fill), `secondary` (surface + hairline),
  `accent` (soft accent — the header "IDE" style), `ghost`, `danger`.
  Sizes `sm | md | lg`. Focus-visible ring and disabled styling built in —
  never re-add `focus:outline-none` without a visible replacement.
- `StatusBadge` statuses: `done/success`, `streaming`, `info`, `warning/stale`,
  `error/danger`, `neutral/pending`. One status → one look; don't add a fifth
  local status-style map (ProgressPanel's maps now delegate to the same
  tokens).
- `Card` paddings: `none | sm (p-3) | md (p-4) | lg (px-6 py-5)`.

## 5. Accessibility floor

- Type ≥ 10px, and 10–11px only for dense chrome, never body content.
- Status/base text colors are chosen AA against their `-soft` backgrounds.
- Every interactive element keeps a visible `:focus-visible` ring (global rule
  in `index.css` + built into `Button`).
- Icon-only buttons need `aria-label`.

## 6. Migration state & how to extend

Migrated so far: Header buttons → `Button`; ProgressPanel status maps → status
tokens; ExportBar/ExportSidePanel Google combos → `gbrand`; the 112 sub-10px
labels → `text-2xs`.

Still legacy (migrate opportunistically when touching them): raw slate
utilities across components, `DependencyMap` SVG palette, the changelog page's
violet page theme, per-file card paddings.

To extend: add the CSS variable to BOTH `:root` and `.dark`, map it in
`tailwind.config.js`, then use the class. The gate test pins the token layer —
update it deliberately, never delete it to make a red run green.
