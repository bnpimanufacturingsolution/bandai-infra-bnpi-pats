# Pass 2 - CSS Token Namespace And Foundation File

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

App UI / Route Behavior

## Pass Goal

Create the Phase 1 token source file and import path without colliding with Tailwind v4 theme variable names. Keep the token file CSS-only and foundation-focused.

## Required Reads

- `docs/phase-1-design-token-prompts/pass-1.md`
- `docs/design-audits/bandai-design-parity-report.md`
- `docs/design-audits/bandai-design-report.md`
- `app/app.css`

## Likely Files

- `app/styles/tokens.css`
- `app/app.css`

## Acceptance Criteria

- Create `app/styles/tokens.css`.
- Use a non-colliding source namespace such as `--hris-*` or `--brand-*`.
- Put the approved Phase 1 color, typography, radius, spacing, and shadow values in that file.
- Import the new token file into `app/app.css`.
- Do not remove existing `.dark` behavior in this pass.
- Write a concise implementation note to `output/reports/phase-1-design-token-foundation.md`.

## Validation

- `npm run build`

## Stop Conditions

- Stop if the only workable token shape reuses Tailwind-facing `--color-*` names in a way that causes self-reference or theme collision.
- Stop if this pass begins to alter component classes or route markup.

## Handoff

Return the created token namespace, import path, build result, and any open questions for the Tailwind bridge.
