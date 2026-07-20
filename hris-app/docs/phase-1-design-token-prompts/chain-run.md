# Phase 1 Chain Run Prompt

## Phase

Phase 1 - Bandai Europe B2B Design Token Foundation

## Source Prompt

`docs/phase-1-design-token-prompts/source-plan.md`

## Coordinator Instructions

Create the implementation-ready Phase 1 execution chain for the HRIS frontend using the repo's actual Tailwind v4 and WWG workflow. Keep the work focused on CSS token foundation, Tailwind bridge updates in `app/app.css`, verified font loading, runtime theme mirroring, validation, and Phase 2 handoff.

Do not expand into component rewrites, Tailwind v3 config work, or invented font/CDN assumptions.

The chain should also make the post-Phase 1 operating rule explicit: new UI work becomes token-first, while legacy non-token styling is tracked as design debt or drift until intentionally aligned.

## Required Inputs

- Tier 0 read order from `AGENTS.md`
- `.wwg/governance/development-operating-model.md`
- `.wwg/workspace/context/task-context-index.md`
- `.wwg/workspace/context/ux-context.md`
- `docs/design-system.md`
- `docs/design-audits/bandai-design-parity-report.md`
- `docs/design-audits/bandai-design-report.md`
- `app/app.css`
- `app/root.tsx`
- `app/lib/config/theme.ts`
- `README.md`

## Chain

1. Pass 1 - Repo reality check and risk log.
2. Pass 2 - CSS token namespace and foundation file.
3. Pass 3 - Tailwind v4 bridge and font-source decision.
4. Pass 4 - Runtime theme constant sync and repaint assessment.
5. Pass 5 - WWG doc sync and validation.
6. Pass 6 - Phase 2 component handoff and unresolved risks.

## Boundaries

- No `tailwind.config.*` changes.
- No component, route, layout, or template rewrites in Phase 1.
- No claim that `tokens.css` and `theme.ts` are one literal source of truth unless a generator is added.
- No unverified Bunny Fonts `metropolis` import.
- Preserve existing dark-mode behavior unless the pass explicitly documents and approves a replacement strategy.
- Use curated reports under `output/reports/` for evidence summaries.
- Do not treat untouched legacy styling as approved new baseline behavior after Phase 1.

## Expected Deliverables

- `app/styles/tokens.css`
- Safe updates to `app/app.css`
- Optional safe update to `app/root.tsx` only if the font source is verified
- Safe value sync in `app/lib/config/theme.ts`
- Updated active docs if the token strategy becomes accepted guidance
- Curated implementation and validation reports

## Handoff

Each pass should return a compact state packet, the changed files, validation summary by command and result, and any stop condition or Phase 2 dependency that surfaced.
