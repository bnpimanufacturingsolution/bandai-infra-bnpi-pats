# Design System Audit Report

Date: 2026-06-30
Status: COMPLETE
Auditor: Claude Code (via automated codebase scan)
Scope: `app/components/`, `app/routes/`, `app/styles/`

---

## Summary

The design system token infrastructure is correctly established in `app/styles/tokens.css` and `app/app.css`. The Bandai brand (Red #E20613, Gold #FFAD00, Metropolis typeface) is properly defined. However, these tokens are largely not being consumed — the majority of the codebase uses hardcoded Tailwind colors and raw utility classes instead of semantic tokens, resulting in widespread visual inconsistency.

---

## Finding 1 — Hardcoded Colors (Critical)

**Scale:** ~2,000+ instances across 193 files

The semantic token system (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, etc.) is ignored throughout the app. Raw Tailwind color classes are used everywhere instead.

| Hardcoded class | Approx. count | Correct replacement |
|---|---|---|
| `text-gray-900` | ~690 | `text-foreground` |
| `text-gray-500` | ~660 | `text-muted-foreground` |
| `text-gray-700` | ~546 | `text-foreground` |
| `border-gray-200` | ~402 | `border-border` |
| `bg-gray-50` | ~310 | `bg-muted` or `bg-card` |
| `text-gray-600` | ~391 | `text-secondary-foreground` |
| `text-red-600` / `bg-red-50` | ~450 | `text-destructive` / `bg-destructive/5` |
| `bg-orange-500` / `text-orange-600` | ~385 | `bg-primary` / `text-primary` |

**Files with most offenses:**
- `app/components/templates/common/payroll-management-template.tsx` (~100+ instances)
- `app/components/templates/common/attendance-management-template.tsx` (~75+ instances)
- `app/components/templates/common/attendance-template.tsx` (~50+ instances)

**Impact:** Dark mode breaks, rebranding requires touching 193 files, no single source of color truth.

---

## Finding 2 — Orange Used Instead of Brand Red (Critical)

**Scale:** ~385 instances

Orange (`orange-500`, `orange-600`, `orange-50`) is not a Bandai brand color. It is being used in place of Bandai Red throughout the top navigation and notification UI.

**Examples in `app/components/molecules/shared/TopNavbar.tsx`:**
```
Line 139:  border-b border-orange-200         ← should be border-border or border-primary/20
Line 176:  bg-orange-500                       ← should be bg-primary
Line 215:  bg-orange-50                        ← should be bg-primary/5
Line 190:  text-orange-600                     ← should be text-primary
Line 261:  text-orange-600                     ← should be text-primary
```

**Impact:** The most visible brand inconsistency in the live UI. The notification badge dot, unread states, and call-to-action text all show orange instead of Bandai Red.

---

## Finding 3 — Component Duplication: atoms/ vs ui/ (Critical)

**Scale:** 7 major components duplicated

Two parallel component hierarchies exist. `ui/` is the shadcn/canonical source; `atoms/` reimplements many of the same components with minor style differences.

| Component | `atoms/` file | `ui/` file | Status |
|---|---|---|---|
| Button | `atoms/Button.tsx` | `ui/button.tsx` | Duplicate — both define `buttonVariants` |
| Input | `atoms/Input.tsx` | `ui/input.tsx` | Duplicate — `bg-background` vs `bg-transparent` |
| Card | `atoms/Card.tsx` | `ui/card.tsx` | Duplicate — different border colors |
| Label | `atoms/Label.tsx` | `ui/label.tsx` | Duplicate |
| Avatar | `atoms/Avatar.tsx` | `ui/avatar.tsx` | Custom vs Radix-based |
| Checkbox | `atoms/Checkbox.tsx` | `ui/checkbox.tsx` | Near-identical |
| Select | `atoms/Select.tsx` | `ui/select.tsx` | Custom vs Radix-based |

Developers import whichever they find first. This causes inconsistent focus rings, border styles, and animation behavior on visually identical elements across different pages.

**Recommendation:** `ui/` is the authority. `atoms/` duplicates should be removed and all imports redirected to `ui/`.

---

## Finding 4 — No Unified Form Pattern (High)

**Scale:** 4+ competing approaches across the app

| Approach | Location | Usage |
|---|---|---|
| shadcn `Form` | `ui/form.tsx` | 1 file only (`EligibilityRequestModal.tsx`) |
| Custom atom wrappers | `atoms/form/form-input.tsx`, etc. | Several files |
| `molecules/FormField.tsx` | Molecule wrapper | Many files — hardcodes `text-gray-700`, `text-red-500` |
| Raw HTML `<input>` with Tailwind | Inline in templates | Scattered throughout |

Error states use `border-red-500`, `text-red-500` instead of `border-destructive`, `text-destructive`.

**Recommendation:** Standardize on shadcn `Form` with `ui/input.tsx`, `ui/label.tsx`, `ui/select.tsx`, `ui/textarea.tsx`. Migrate all form instances.

---

## Finding 5 — Typography Not Using Components (High)

**Scale:** 25+ template files

The project has two heading/text components (`atoms/heading.tsx`, `atoms/Text.tsx`). They are not being used in the majority of the codebase. Instead, raw Tailwind is used:

```
text-xl font-bold text-gray-900       ← 50+ instances
text-lg font-semibold text-gray-700   ← 30+ instances
text-2xl font-bold                    ← 20+ instances
text-sm text-gray-500                 ← hundreds of instances
```

The brand utility `brand-h1` (54px, weight 900) is only used in login/auth surfaces and ignored elsewhere.

**Recommendation:** Enforce `Heading` and `Text` atom components for all heading and body text. Define H2–H6 and body/caption tokens in `tokens.css`.

---

## Finding 6 — Inline Styles (High)

**Scale:** 166 occurrences across 39 files

`style={{...}}` is used for colors, dimensions, and z-index values throughout the app.

| File | Occurrences |
|---|---|
| `app/components/PdfFieldMapper.tsx` | ~80 |
| `app/components/PdfGeneratorDemo.tsx` | ~16 |
| `app/components/templates/common/attendance-management-template.tsx` | ~9 |
| `app/components/organisms/timesheet-modal-approval.tsx` | ~7 |
| `app/components/molecules/ScannerInterface.tsx` | ~6 |

`LoadingScreen` uses hex values directly (`#e60012`, `#ff7200`, `#ffbf7f`) instead of CSS variables.

**Recommendation:** Convert to Tailwind utilities and CSS custom properties. PDF-specific files may have justified exceptions where exact pixel control is required for PDF output.

---

## Finding 7 — Card/Container Inconsistency (Medium)

**Scale:** 10+ visual patterns in use

No page uses the same card style. Found patterns include:

```
"bg-white rounded-xl border border-gray-100 shadow-sm p-5"
"rounded-xl p-6 border border-gray-100 shadow-sm"
"border-gray-200 bg-gray-50 rounded-lg"
"rounded-2xl border border-neutral-200"
"bg-white rounded-xl shadow-md p-6 border border-gray-200"
```

Even the two Card components disagree: `atoms/Card.tsx` uses `border-neutral-300`, `ui/card.tsx` uses `border-neutral-200`.

**Recommendation:** Use `ui/card.tsx` (`Card`, `CardHeader`, `CardContent`, `CardFooter`) exclusively.

---

## Finding 8 — Loading / Empty / Skeleton States Fragmented (Medium)

**Scale:** Multiple bespoke implementations per feature

- `ui/skeleton.tsx` uses `bg-gray-200` (should be `bg-muted`)
- Each feature area implements its own loading spinner
- No shared empty state component — each invents its own illustration/copy pattern

---

## Finding 9 — Chart Color Palette (Low)

**Scale:** `app.css` `:root` block

All five chart tokens (`--chart-1` through `--chart-5`) are the same red hue (okLCH hue 27) at varying lightness values. Multi-series charts will be visually indistinguishable.

**Recommendation:** Introduce distinct hues for chart tokens while keeping Bandai Red as the primary data series color.

---

## Finding 10 — Semantic Token Mapping Issues (Low)

Two token mapping issues in `app.css`:

1. `--accent` maps to Bandai Red (`oklch(0.62 0.24 27)`) instead of gold (`--brand-color-accent: rgb(255, 173, 0)`). Ghost button hover and shadcn's "accent" UI show red, not gold.
2. `--primary` comment says `#E60000` but `--brand-color-primary` is `rgb(226, 6, 19)` = `#E20613`. Small numerical drift.

---

## Prioritized Remediation

| Priority | Action | Effort |
|---|---|---|
| 1 | Fix orange → red in `TopNavbar.tsx` and `LoadingScreen.tsx` | Small (1 file) |
| 2 | Remove `atoms/` duplicates; redirect imports to `ui/` | Medium (7 components + import sweep) |
| 3 | Standardize form pattern to shadcn `Form` | Large |
| 4 | Replace hardcoded gray classes with semantic tokens | Large (can be partially scripted) |
| 5 | Enforce `Heading`/`Text` components; remove raw heading classes | Medium |
| 6 | Migrate inline styles to Tailwind utilities | Medium |
| 7 | Standardize card pattern to `ui/card.tsx` | Medium |
| 8 | Fix `ui/skeleton.tsx` `bg-gray-200` → `bg-muted` | Trivial |
| 9 | Fix `--accent` to map to gold, not red | Small |
| 10 | Define diverse chart color palette | Small |

---

## Reference

Canonical design system documentation: `.wwg/wiki/07-ux/design-system.md`
