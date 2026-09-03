# HRIS App Design System

Status: ACTIVE
Last reviewed: 2026-06-16

This document records app-side UI standards for the HRIS workforce management frontend. Treat these rules as active guidance for `hris-app` UI work unless a more specific component or route standard supersedes them.

## Design Token Foundation

Phase 1 design-token foundation lives in `app/styles/tokens.css`, with the Tailwind v4 bridge and composite brand utilities in `app/app.css`.

Use the token foundation for new UI work by default:

- New components should use the `brand-*` token surface instead of introducing new hardcoded colors, spacing, radius, shadows, or font values.
- Meaningful edits to existing UI should move the touched surface toward tokens when practical.
- Untouched legacy styling is accepted design debt until it is intentionally aligned.
- New hardcoded visual values outside the token system count as drift unless explicitly justified and documented.

## Categorical Fields

Use chips or badges for important status indicators when a single categorical field needs quick scanning.

When multiple categorical one-word fields such as status, type, or access status appear near each other in the same row, table, or card, do not reuse the same chip or badge treatment for each field. Reserve the chip or badge for the primary state, then use a distinct secondary treatment such as colored text, a semantic dot with label, a font or weight change, an icon with label, or subtle inline text styling, as long as it does not visually duplicate the badge or chip.

## Dashboard Summary Tiles

Dashboard summary tiles and queue cards should use neutral tile surfaces by default, including HR queue cards such as `Attendance Exceptions / HR Queue` and `Workforce / Compliance Queue`.

- Keep the tile background white or otherwise neutral.
- Reserve semantic color for borders, text, or icons when the meaning matters.
- Do not use colored background fills on the tile surface unless a route- or component-specific standard explicitly requires it.
