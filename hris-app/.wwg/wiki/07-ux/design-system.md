# Design System

Status: ACCEPTED

## Overview

The HRIS app uses a token-first design system built on Tailwind CSS v4 and shadcn/ui. All visual decisions must trace back to a design token — no hardcoded color, radius, or spacing values are permitted in component or route files.

The brand is Bandai Namco Europe. The visual identity is minimal and authoritative: black, white, and Bandai Red as the dominant palette, with Metropolis as the sole typeface.

---

## Brand Tokens

Defined in `app/styles/tokens.css`. These are the source of truth. All other token layers reference these.

### Colors

| Token | Value | Usage |
|---|---|---|
| `--brand-color-primary` | `rgb(226, 6, 19)` (#E20613) | Primary actions, active states, brand emphasis |
| `--brand-color-accent` | `rgb(255, 173, 0)` (#FFAD00) | Submit buttons, secondary call-to-action |
| `--brand-color-subheading` | `rgb(30, 36, 77)` (#1E244D) | Section subheadings, supporting hierarchy |
| `--brand-color-text-primary` | `rgb(0, 0, 0)` | Body text |
| `--brand-color-text-on-primary` | `rgb(255, 255, 255)` | Text on colored backgrounds |
| `--brand-color-input-bg` | `rgb(255, 255, 255)` | Input field background |
| `--brand-color-input-border` | `rgb(0, 0, 0)` | Input field border |
| `--brand-color-select-border` | `rgb(204, 204, 204)` | Select/dropdown border |
| `--brand-color-select-text` | `rgb(85, 85, 85)` | Select/dropdown text |

**Orange is not a brand color.** Any use of Tailwind's `orange-*` palette is incorrect and should be replaced with `brand-primary` (red).

### Semantic Tokens (Tailwind / shadcn)

Defined in `app/app.css` via `:root {}`. These are consumed by shadcn components.

| Semantic token | Maps to | Notes |
|---|---|---|
| `--primary` | Bandai Red (`oklch(0.62 0.24 27)`) | Used for default buttons, active indicators, rings |
| `--primary-foreground` | White | Text on primary |
| `--background` | White | Page background |
| `--foreground` | Black | Body text |
| `--card` | White | Card backgrounds |
| `--card-foreground` | Black | Card text |
| `--muted` | `oklch(0.92 0 0)` | Subtle backgrounds |
| `--muted-foreground` | `oklch(0.4 0 0)` | Secondary/supporting text |
| `--border` | `oklch(0.9 0 0)` | Default borders |
| `--destructive` | Dark red (`oklch(0.55 0.22 27)`) | Delete/danger actions |
| `--ring` | Bandai Red | Focus ring |

**Known issue:** `--accent` is currently mapped to Bandai Red, not the gold `--brand-color-accent`. This means `ghost` button hover shows red. This may be corrected in a future token pass.

### Status Colors

Defined directly in `app/app.css` via `.status-badge[data-status="..."]` CSS attribute selectors. Do not define status colors inline or in component files.

Status categories covered: employee status, attendance, timesheet, payroll period, recruitment pipeline, checklist/task items, benefit category, priority levels.

---

## Typography

### Font

**Metropolis** is the sole typeface. Loaded via `@fontsource/metropolis` in weights 400, 500, 600, 700, 900. Fallback stack: Gotham, Helvetica Neue, Arial, sans-serif.

Applied globally to `html, body` via `font-family: var(--brand-font-family-base)`.

Token references:
- `--brand-font-family-base` / `--brand-font-family-heading` — both use Metropolis
- Tailwind alias: `font-brand-sans`, `font-brand-heading`

### Type Scale

| Token | Value | Usage |
|---|---|---|
| `--brand-font-size-h1` | 54px | Hero/login headings only |
| `--brand-font-weight-h1` | 900 | Hero headings |
| `--brand-letter-spacing-h1` | -0.48px | Hero headings |
| `--brand-font-size-button` | 14px | Button labels |
| `--brand-font-weight-button-primary` | 600 | Primary button label |
| `--brand-font-weight-button-submit` | 400 | Submit button label |
| `--brand-letter-spacing-button` | 1.12px | Button labels |
| `--brand-font-size-input` | 20px | Input and select text |
| `--brand-font-weight-input` | 500 | Input and select text |

**Gap in type scale:** H2–H6, body, small, caption, and label sizes are not yet defined as brand tokens. Components currently use raw Tailwind (`text-sm`, `text-base`, `text-lg`, `font-semibold`). A full type scale token set is a planned addition.

### Heading and Text Components

- `app/components/atoms/heading.tsx` — semantic h1–h6 component. Preferred for document-hierarchy headings.
- `app/components/atoms/Text.tsx` — CVA variant system for body, small, caption, label, and colored text variants.

Raw Tailwind heading classes (`text-xl font-bold text-gray-900`) are non-standard and should be replaced with these components.

---

## Geometry

| Token | Value | Usage |
|---|---|---|
| `--brand-radius-input` | 12px | Text inputs |
| `--brand-radius-button-primary` | 12px | Primary/brand buttons |
| `--brand-radius-button-submit` | 3px | Submit/compact buttons |
| `--brand-radius-select` | 4px | Select/dropdown |
| `--radius` (shadcn) | 0.625rem (~10px) | shadcn component base radius |

The shadcn base radius (10px) and brand input radius (12px) are slightly misaligned. When using shadcn components, `--radius` governs; when using brand utilities, `--brand-radius-*` governs.

---

## Component Canonical Sources

### Single Source of Truth

`app/components/ui/` is the canonical component library (shadcn/ui). All primitive components live here.

`app/components/atoms/` contains custom project-specific components. Where an `atoms/` file duplicates an `ui/` component, the `ui/` version is the authority.

**Known duplicates (atoms/ must defer to ui/):**

| Component | atoms/ path | ui/ path |
|---|---|---|
| Button | `atoms/Button.tsx` | `ui/button.tsx` |
| Input | `atoms/Input.tsx` | `ui/input.tsx` |
| Card | `atoms/Card.tsx` | `ui/card.tsx` |
| Label | `atoms/Label.tsx` | `ui/label.tsx` |
| Avatar | `atoms/Avatar.tsx` | `ui/avatar.tsx` |
| Checkbox | `atoms/Checkbox.tsx` | `ui/checkbox.tsx` |
| Select | `atoms/Select.tsx` | `ui/select.tsx` |

These duplicates exist due to historical parallel development. Consolidation is tracked as a known technical debt item.

### Component Hierarchy

```
ui/          → shadcn primitives (Button, Input, Card, Select, etc.)
atoms/       → project-specific atoms not in ui/ (Badge, DataTable, Avatar, heading, Text, etc.)
molecules/   → feature-specific composite components
organisms/   → domain-level complex components (forms, headers, sidebars)
templates/   → page-level layout components
```

---

## Button System

Two types of buttons exist with distinct visual purposes:

| Type | Class / Component | Radius | Padding | Weight | Color |
|---|---|---|---|---|---|
| Primary brand button | `brand-button-primary` utility | 12px | 26px 30px 25px | 600 | Bandai Red |
| Submit/compact button | `brand-button-submit` utility | 3px | 12px 15px | 400 | Gold (#FFAD00) |
| shadcn default | `Button` (variant="default") | ~10px | px-4 py-2 | medium | Bandai Red (via --primary) |
| shadcn ghost | `Button` (variant="ghost") | ~10px | px-4 py-2 | medium | Transparent + hover red |
| shadcn destructive | `Button` (variant="destructive") | ~10px | px-4 py-2 | medium | Dark red |

Use the shadcn `Button` component for in-app UI. Reserve `brand-button-primary` / `brand-button-submit` CSS utilities for the public-facing login and onboarding surfaces.

---

## Form Pattern

The canonical form pattern is **shadcn Form** (`app/components/ui/form.tsx`) composed with `Input`, `Label`, `Select`, and `Textarea` from `ui/`.

Non-standard form approaches (currently in use but being phased out):
- `atoms/form/form-input.tsx`, `form-select.tsx`, `form-textarea.tsx` — custom wrappers with hardcoded error styles
- `molecules/FormField.tsx` — custom wrapper, hardcodes `text-gray-700`, `text-gray-500`, `text-red-500`
- Direct HTML `<input>` / `<select>` elements with inline Tailwind

All error states must use `text-destructive` and `border-destructive`, not hardcoded red classes.

---

## Card / Container Pattern

The canonical card is `app/components/ui/card.tsx`:
- Background: `bg-card`
- Border: `border border-neutral-200`
- Radius: `rounded-xl`
- Padding: `py-6` (outer), `px-6` (header/content/footer)

Do not use raw `div` elements with ad-hoc `bg-white rounded-xl border border-gray-100 shadow-sm` classes. Use the `Card`, `CardHeader`, `CardContent`, `CardFooter` composition.

The `.premium-card` utility class is available for cards that need the softer, elevated appearance used in dashboard contexts.

---

## Status Badges

Use the `.status-badge` CSS class with a `data-status` attribute. All status color mappings are in `app/app.css`.

```tsx
<span className="status-badge" data-status="active">Active</span>
<span className="status-badge" data-status="rejected">Rejected</span>
```

Do not define status colors inline or in component-level classes.

---

## Color Usage Rules

1. **Use semantic tokens** — prefer `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, `text-primary`, `text-destructive` over raw Tailwind color classes.
2. **No hardcoded hex or rgb** in component or route files. Exceptions: `app/styles/tokens.css` and `app/app.css` only.
3. **No orange** — `orange-*` Tailwind classes are not brand colors. Use `text-primary` / `bg-primary` (Bandai Red) where orange is currently being used in error.
4. **No inline `style={{}}`** for color, typography, or spacing. Use Tailwind utilities and brand tokens.
5. **Gray hierarchy** — when in doubt: `text-foreground` for primary text, `text-muted-foreground` for secondary/supporting text, `text-secondary-foreground` for tertiary.

---

## Dark Mode

Dark mode is defined in `app/app.css` under `.dark {}`. All semantic tokens have dark variants. Component files should rely on semantic tokens so dark mode works automatically. Do not define dark mode color overrides inline.

---

## Scrollbar Utilities

Three scoped scrollbar utilities are available:
- `.sidebar-scroll` — thin sidebar scrollbar (slate-500 based)
- `.modern-scroll` — thin ring-colored scrollbar for content areas
- `.custom-scrollbar` — slate-300/200 scrollbar for request list contexts

---

## Known Technical Debt

| Issue | Scale | Priority |
|---|---|---|
| Hardcoded Tailwind color classes (`text-gray-900`, `bg-gray-50`, etc.) | ~2,000+ instances across 193 files | High |
| `atoms/` components duplicating `ui/` components | 7 components | High |
| `text-orange-*` / `bg-orange-*` used instead of brand red | ~385 instances | High |
| No unified form pattern (4+ approaches in use) | App-wide | High |
| Raw Tailwind heading classes instead of `Heading`/`Text` components | 25+ template files | Medium |
| 166 inline `style={{}}` occurrences across 39 files | 39 files | Medium |
| Skeleton component uses `bg-gray-200` instead of `bg-muted` | `ui/skeleton.tsx` | Low |
| `--accent` maps to red instead of gold `--brand-color-accent` | `app.css` | Low |
| Chart color palette is all red hue variations (accessibility) | `app.css` | Low |
| Type scale tokens only cover H1 and button/input (no H2–body scale) | `tokens.css` | Low |
