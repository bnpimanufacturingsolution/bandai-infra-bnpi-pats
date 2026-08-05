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

## Components

- Use existing Radix/shadcn accordion, select, switch, input, and button components.
- Use numeric badges for operational counts.
- Dropdowns/selects should keep the existing bordered white control vocabulary.

## Motion

Use only component-default state motion. Avoid decorative page-load animations in admin workflows.
