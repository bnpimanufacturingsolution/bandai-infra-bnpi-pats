# HRIS App Design System

Status: ACTIVE
Last reviewed: 2026-06-10

This document records app-side UI standards for the HRIS workforce management frontend. Treat these rules as active guidance for `hris-app` UI work unless a more specific component or route standard supersedes them.

## Categorical Fields

Use chips or badges for important status indicators when a single categorical field needs quick scanning.

When multiple categorical one-word fields such as status, type, or access status appear near each other in the same row, table, or card, do not reuse the same chip or badge treatment for each field. Reserve the chip or badge for the primary state, then use a distinct secondary treatment such as colored text, a semantic dot with label, a font or weight change, an icon with label, or subtle inline text styling, as long as it does not visually duplicate the badge or chip.
