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

## Components

- Use existing Radix/shadcn accordion, select, switch, input, and button components.
- Use numeric badges for operational counts.
- Dropdowns/selects should keep the existing bordered white control vocabulary.

## Motion

Use only component-default state motion. Avoid decorative page-load animations in admin workflows.
