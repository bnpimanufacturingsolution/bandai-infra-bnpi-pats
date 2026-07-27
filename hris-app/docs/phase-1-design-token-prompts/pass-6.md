# Pass 6 - Phase 2 Component Handoff And Unresolved Risks

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

App UI / Route Behavior plus Docs / Governance / WWG Behavior

## Pass Goal

Close Phase 1 by mapping which component surfaces must adopt the new tokens in Phase 2 and by separating completed foundation work from blocked or deferred items. The handoff should restate that new UI work is token-first while untouched legacy styling remains debt or drift.

## Required Reads

- `docs/phase-1-design-token-prompts/pass-5.md`
- `docs/design-audits/bandai-design-parity-report.md`
- `output/reports/phase-1-design-token-reality-check.md`
- `output/reports/phase-1-validation.md`

## Likely Files

- `output/reports/phase-2-design-token-handoff.md`

## Acceptance Criteria

- Summarize what Phase 1 completed.
- List the component, route, and layout surfaces that still require Phase 2 token adoption.
- Separate expected visible repaint from true regressions or unresolved blockers.
- Restate the operating rule for follow-up work: new UI must use tokens, and legacy non-token styling remains tracked debt or drift until aligned.
- Call out any blocked font dependency, dark-mode concern, or utility gap that remains.
- Keep the handoff specific enough that the next pass can start from local evidence without rereading the external Claude prompt.

## Validation

- No new validation is required if this pass is report-only.
- If the pass changes code or docs, rerun the relevant focused validation from Pass 5.

## Stop Conditions

- Stop if this handoff starts implementing component alignment instead of documenting it for Phase 2.

## Handoff

Return the Phase 2 dependency map, final risk list, and recommended starting files for the next implementation pass.
