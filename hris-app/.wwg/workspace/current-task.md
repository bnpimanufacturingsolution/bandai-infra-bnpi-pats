# Current Task

## Status
done

## Summary
Operator request 2026-09-10: the quick-adjust **Payroll period must be fixed to the period HR entered from** — the dropdown sat on an empty `Select period` even though the entry period was known.

## Category
bug fix (prefill race) + small UX (period lock) / AI-agent delivery.

## Packages
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)**.

## Changes
- `quick-payroll-adjustment-modal.tsx` — new `defaultPayrollPeriodLabel` prop; period renders as locked text (`Fixed to this payroll period`) whenever the entry id is provided and resolvable (caller label, periods-list match, or list still loading); dropdown stays only for context-free entry (header bulk) or unresolvable ids. Reset effect seeds the id directly from the prop (fixes the old list-gated prefill race); a second effect keeps the latest-period fallback for the no-id flow. Footnote now says `for this period` when locked.
- `employee-benefit.service.ts` — additive `isQuickAdjustPeriodLocked` helper (unit-tested); validation/submit/result contract untouched.
- Callers pass labels: run-payroll (preview Adjust → `selectedPeriodCard` name/range) and register (`quickAdjustState.periodLabel` from the row's `payrollPeriod`).
- Backend untouched.

## Truth delta
YES — quick-adjust period is entry-fixed, not chosen, on row-level entry. One-cutoff/carrier semantics unchanged.

## Drift
LOW — modal + 2 call-site props + additive helper + tests + docs.

## Verification
- vitest: 22/22 (10 quick-adjust incl. 5 new lock cases + 5 row cases, 7 preview-modal, 5 single-row legacy).
- `tsc --noEmit` filtered to all touched files (modal, both templates, service, tests): zero diagnostics.
- Byte-level checks: no BOM, LF intact, no mojibake markers, exact tab structure on edited regions (console decoding artifacts disregarded after byte proof).
- Browser proof NEEDS_CONFIRMATION.

## Risks
- A stale entry id that matches neither caller label nor the fetched list falls back to the editable dropdown (honest, unchanged behavior).
