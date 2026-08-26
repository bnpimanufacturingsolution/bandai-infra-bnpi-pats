# Pass 1 - Repo Reality Check And Risk Log

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

App UI / Route Behavior plus Docs / Governance / WWG Behavior

## Pass Goal

Confirm the current theme architecture, Tailwind version, font loading path, token collision risks, and `theme.ts` consumer reach before any file edits. Produce a compact risk log rooted in local repo evidence.

## Required Reads

- `.wwg/workspace/context/task-context-index.md`
- `.wwg/workspace/context/ux-context.md`
- `docs/design-system.md`
- `docs/design-audits/bandai-design-parity-report.md`
- `docs/design-audits/bandai-design-report.md`
- `app/app.css`
- `app/root.tsx`
- `app/lib/config/theme.ts`

## Likely Files

- `app/app.css`
- `app/root.tsx`
- `app/lib/config/theme.ts`
- `package.json`

## Acceptance Criteria

- Confirm the repo is Tailwind v4 and does not use `tailwind.config.*`.
- Confirm whether `app/styles/` exists and whether it can be introduced through `app/app.css`.
- Confirm the current font-loading mechanism in `app/root.tsx`.
- Confirm the current `theme.ts` import reach and list visible repaint surfaces.
- Record dark-mode, `oklch` to `rgb`, and font-source risks.
- Write a compact inspection report to `output/reports/phase-1-design-token-reality-check.md`.

## Validation

- Focused inspection only if no files change.
- If this pass also introduces documentation, run `npx @homedesk/wwg validate`.

## Stop Conditions

- Stop if local repo evidence conflicts with the parity report or source plan.
- Stop if the font path is assumed rather than verified.

## Handoff

Return the confirmed repo facts, the risk log, and the recommended token namespace for Pass 2.
