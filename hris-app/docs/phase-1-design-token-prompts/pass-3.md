# Pass 3 - Tailwind V4 Bridge And Font-Source Decision

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

App UI / Route Behavior plus Docs / Governance / WWG Behavior

## Pass Goal

Bridge the new CSS token namespace into Tailwind v4 through `app/app.css` and make a verified font-loading decision for `app/root.tsx`.

## Required Reads

- `docs/phase-1-design-token-prompts/pass-2.md`
- `app/app.css`
- `app/root.tsx`
- `docs/design-system.md`

## Likely Files

- `app/app.css`
- `app/root.tsx`
- `output/reports/phase-1-tailwind-font-bridge.md`

## Acceptance Criteria

- Extend the existing `@theme inline` bridge in `app/app.css` instead of creating `tailwind.config.*`.
- Map Tailwind-facing utilities such as `--color-primary`, `--color-accent`, `--font-sans`, radius tokens, spacing tokens, and shadow tokens to the new source namespace.
- Decide whether `--font-heading` stays separate or moves with the new base stack.
- Update `app/root.tsx` only if the selected font source is verified and safe.
- If the font source is blocked, preserve the current font wiring and document the block instead of faking completion.
- Write the decision report to `output/reports/phase-1-tailwind-font-bridge.md`.

## Validation

- `npm run build`

## Stop Conditions

- Stop if the only font option is an unverified CDN path or an unlicensed asset.
- Stop if bridging the tokens requires removing existing dark-mode variables without an approved replacement.

## Handoff

Return the Tailwind bridge result, the font decision, and any blocked dependency that affects runtime sync.

