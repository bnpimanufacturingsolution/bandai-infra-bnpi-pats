# Design

## Visual System

Project Truth HRIS uses a restrained product UI system with Metropolis as the primary font, Bandai red/orange for active and primary states, white and neutral gray surfaces, and compact borders/dividers for dense admin workflows.

## Color

- Background: white or near-white neutral surfaces.
- Ink: black/near-black for primary text; gray for secondary metadata.
- Primary/action: Bandai red and existing orange action accents.
- State: amber for pending/needs target, red for blocking or below-current errors, green for completed or healthy states.

## Typography

- Use the existing Metropolis/system product scale.
- Prefer small, fixed UI sizes for settings, tables, labels, and counters.
- Keep headings compact inside admin panels; reserve larger display treatment for true page titles only.

## Layout

- Admin settings screens should favor compact grids, nested disclosure, and dense rows.
- Use cards only for real panels or repeated items. Avoid decorative card nesting; use dividers, indentation, and accordion hierarchy for structure.
- Tables should keep stable columns and compact row height for repeated policy controls.

### Full-height list tables (required standard)

Dense list/table pages (admin configuration lists, HR benefits management, employee directory-style lists) **must** fill the main content pane regardless of browser height. The table body scrolls inside the card; the page itself does not grow with row count and leave empty space below a short table.

**Always apply this three-part contract when creating or adjusting a list table:**

1. **Layout viewport-fill** — register the route in `isAdminViewportFillPath` (admin) or `isUnifiedViewportFillPath` (HR/unified) so main is height-locked.
2. **Page shell** — wrap with `AdminTablePageShell` (or the same classes: `flex h-full min-h-0 flex-col overflow-hidden`). Optional chrome above the table is `shrink-0`; the table region is `flex-1 min-h-0`.
3. **DataTable** — pass `containedScroll` so the body fills remaining height with internal scroll and pinned pagination.

Reference implementations: `/admin/configuration/agencies`, `/admin/devices/events`, `/hr/benefits-management`.

Do **not** ship a new list table with only `space-y-6` + default `DataTable` (content-height only).

### Count / aggregate columns (required performance standard)

When a table column is a **count, total, or aggregate** (e.g. Enrolled, Members, Device users):

1. **Fetch count-only** — use the list API with `document=false`, `pagination=false`, `count=true` (or a dedicated count/group endpoint). Response should be `{ count }` (or grouped totals), **not** a page of full records.
2. **Do not hydrate rows for math** — never download enrollments/users/events just to `array.length` on the client for a column chip.
3. **Scope the filter** — count with the same identity filter the UI means (e.g. `benefitTypeId:…`), not a global sample window.
4. **Keep list loads separate** — open/drawer/detail views may load documents; the table column must not.

Canonical example: Benefits Management **Enrolled** via `employeeBenefitService.countByBenefitTypeId` (`document=false&count=true`).

## Shrink, Hide, Embody (SHE)

Operator UI doctrine (John Maeda). Full brief: `.wwg/wiki/principles/shrink-hide-embody.md`.

- **Shrink** — make the surface feel smaller. Fewer boxes, narrower detail modals, one list instead of a card grid.
- **Hide** — keep complexity off first paint. Raw payload and debug fields go in a **closed** accordion.
- **Embody** — what remains must be complete enough to act (person, event, time, result, terminal, device status).

When the operator says “that clean design” or “Carpati UI”, pull this. The third word is **Hide**.

## Components

- Use existing Radix/shadcn accordion, select, switch, input, and button components.
- Use numeric badges for operational counts.
- Dropdowns/selects should keep the existing bordered white control vocabulary.
- **Icon + label together.** Action buttons show a lucide icon and the full words (`Device user`, `Employee record`). Detail rows show a small icon beside the label. Do not ship icon-only controls or strip icons when cleaning a screen.

## Motion

Use only component-default state motion. Avoid decorative page-load animations in admin workflows.

## Toasts

Success/error/warning/info toasts have **no close (X) button**. They auto-dismiss and are swipe-dismissible.

- Global sonner Toaster (pp/root.tsx): 
ichColors, position="top-right", **never closeButton**, swipe directions enabled.
- Custom toms/Toast (ToastProvider): auto-dismiss only; no manual close icon.
- **Scope: toasts only.** Modals/dialogs keep their X (`Modal`/`Dialog` `showCloseButton` defaults true) - do not apply this ban to modals.
- Rationale: the X re-appeared from the 2026-06-17 standalone-era import (4ce3712d) and read as clutter on every toast. Operator canon since 2026-08-24: toasts dismiss themselves; no X.
- Contract test: pp/lib/toast-ux-contract.test.ts pins the no-closeButton config so it cannot sneak back.
