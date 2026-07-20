# Pass 4 - Runtime Theme Constant Sync And Repaint Assessment

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

App UI / Route Behavior

## Pass Goal

Mirror the approved runtime token values in `app/lib/config/theme.ts` without breaking the existing API shape, and document the repaint impact across current consumers.

## Required Reads

- `docs/phase-1-design-token-prompts/pass-3.md`
- `app/lib/config/theme.ts`
- `docs/design-audits/bandai-design-parity-report.md`

## Likely Files

- `app/lib/config/theme.ts`
- Optional focused tests if added
- `output/reports/phase-1-theme-runtime-sync.md`

## Acceptance Criteria

- Preserve existing export names and public usage shape in `app/lib/config/theme.ts`.
- Update or add values using the file's current naming style.
- Explicitly treat the change as a visible repaint across current consumers, not hidden plumbing.
- If focused regression tests are practical, add them; otherwise document why build validation is the chosen evidence.
- Write the runtime sync report to `output/reports/phase-1-theme-runtime-sync.md`.

## Validation

- `npm run build`
- `npm run test:ci` if this pass adds or updates tests

## Stop Conditions

- Stop if the required value changes would break existing exports or force component rewrites in Phase 1.

## Handoff

Return the runtime sync result, repaint scope summary, and any consumers that must be handled in Phase 2.
