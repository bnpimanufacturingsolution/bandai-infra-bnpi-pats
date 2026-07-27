# Phase 1 Design Token Foundation Plan

Status: DRAFT
Last reviewed: 2026-06-16
Source label: Local rewrite of the Claude Phase 1 prompt against repo reality
Task mode: docs-only / planning / medium-risk UI foundation
Delivery mode: AI-agent prompt chain

## Objective

Create an implementation-ready Phase 1 plan for the HRIS frontend that establishes a clean brand-token foundation for Bandai Europe B2B parity without pretending the repo uses Tailwind v3 or a shared code/CSS token generator.

This plan should give the next implementation pass a safe sequence for token setup, Tailwind v4 bridging, font-source verification, runtime theme mirroring, WWG sync, and Phase 2 handoff.

## Repo Reality Anchors

- The app is Tailwind v4 and uses CSS `@theme` / `@theme inline` in `app/app.css`.
- There is no `tailwind.config.ts` or `tailwind.config.js` in the repo root.
- `app/app.css` is the active theme bridge and already defines `:root`, `.dark`, and Tailwind-facing theme aliases.
- `app/root.tsx` currently loads `Inter` and `Outfit` from Google Fonts through the `links()` export.
- `app/lib/config/theme.ts` is not isolated plumbing; it is imported by live app surfaces, so value changes there are visible repaint changes.
- `app/styles/` does not exist yet and can be introduced through `app/app.css`.
- `docs/design-audits/bandai-design-parity-report.md` is the best local parity audit for token drift and affected files.
- `docs/design-audits/bandai-design-report.md` is the best local evidence file for reference values and observed Bandai portal variants.
- The Bunny Fonts `metropolis` CSS path must not be assumed valid without direct verification.

## Approved Phase 1 Scope

- Create a dedicated CSS token source file under `app/styles/`.
- Extend the existing Tailwind v4 bridge in `app/app.css`.
- Update `app/root.tsx` only if the font source is verified and safe.
- Mirror approved runtime colors or font constants in `app/lib/config/theme.ts`.
- Update relevant active docs when the token strategy becomes accepted implementation guidance.
- Produce a Phase 2 dependency map for component-level alignment.

## Post-Phase 1 Adoption Policy

Phase 1 is not only a file-creation pass. It establishes the visual foundation that future UI work should follow.

- After Phase 1 lands, the token system becomes the default for new UI work.
- New components must use the approved token layer rather than introducing new hardcoded visual values.
- Meaningful edits to existing UI should move the touched surface toward tokens when practical.
- Untouched legacy UI is accepted as existing design debt until it is intentionally aligned in a later phase.
- New hardcoded colors, spacing, radius, shadows, or font decisions outside the token system should be treated as drift unless explicitly justified and documented.
- Legacy visual mismatches should be tracked as debt or drift, not silently normalized as acceptable baseline behavior.

## Out Of Scope For Phase 1

- Creating or editing `tailwind.config.*`.
- Rewriting components, routes, layouts, atoms, molecules, or templates to consume the new tokens.
- Claiming CSS and TypeScript share a literal single source of truth unless a generator is introduced.
- Silently removing dark-mode behavior.
- Shipping an unverified Metropolis import path.

## Relevant Actions We Need To Do

1. Confirm the current theme architecture, Tailwind version, font loading path, and `theme.ts` consumer reach using local repo evidence.
2. Create a new CSS token source with a non-colliding namespace such as `--hris-*` or `--brand-*`, then import it into `app/app.css`.
3. Bridge the new token namespace into Tailwind v4 through the existing `@theme inline` block instead of inventing a root Tailwind config file.
4. Verify the font source before changing `app/root.tsx`; if Metropolis cannot be loaded safely, keep the current font wiring and record the block.
5. Mirror the approved runtime token values in `app/lib/config/theme.ts` while explicitly treating that step as a visible repaint across current consumers.
6. Add the adoption rule to the Phase 1 outcome so new UI work is token-first and legacy mismatch is treated as debt or drift.
7. Update active docs and run focused validation so the foundation work is governed, reproducible, and ready for a Phase 2 component pass.

## Acceptance Criteria

- `app/styles/tokens.css` exists and contains the Phase 1 token set under a stable source namespace.
- `app/app.css` imports the token file and bridges utilities through Tailwind v4 without breaking the existing build.
- `app/root.tsx` only changes if the chosen font source is verified and documented.
- `app/lib/config/theme.ts` stays API-compatible while mirroring approved values where appropriate.
- The implementation explicitly documents any visible repaint risk, dark-mode watch item, or blocked font dependency.
- The Phase 1 closeout clearly states that new UI work is token-first and that legacy non-token styling is debt or drift rather than the new standard.
- `docs/design-system.md` and `DOCUMENTATION_INDEX.md` are updated if the token strategy becomes active app guidance.
- Validation results are summarized in curated reports rather than raw logs.

## Stop Conditions

- Stop if a requested change depends on `tailwind.config.*` creation instead of the repo's actual Tailwind v4 CSS theme bridge.
- Stop if the font source cannot be verified and the only path would be an invented or unlicensed dependency.
- Stop if the work expands into component rewrites; move that work into Phase 2.
- Stop if Project Truth or active design guidance conflicts with the chosen implementation path.

## Recommended Reports

- `output/reports/phase-1-design-token-reality-check.md`
- `output/reports/phase-1-design-token-foundation.md`
- `output/reports/phase-1-tailwind-font-bridge.md`
- `output/reports/phase-1-theme-runtime-sync.md`
- `output/reports/phase-1-validation.md`
- `output/reports/phase-2-design-token-handoff.md`

## Key Inputs

- `docs/design-system.md`
- `docs/design-audits/bandai-design-parity-report.md`
- `docs/design-audits/bandai-design-report.md`
- `app/app.css`
- `app/root.tsx`
- `app/lib/config/theme.ts`
- `.wwg/workspace/context/task-context-index.md`
- `.wwg/workspace/context/ux-context.md`
- `.wwg/governance/development-operating-model.md`
