# Current Task

## Status
done

## Summary
Operator request 2026-09-10: rename user-facing **Preview Payroll** to **Payroll Management** on `/hr/run-payroll` — the surface previews dry-run amounts but also manages manual additions/deductions (2026-09-08 quick-adjust: per-row `Adjust` + auto re-run, OAD/NEGADJ enrollments pinned to the OPEN period).

## Category
copy-only + docs-only (AI-agent delivery). No money logic, API, auth, or persistence change.

## Packages
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)** — Run Payroll has no employee-app surface.

## Changes
- `app/components/templates/common/run-payroll-template.tsx` — Quick Actions button + results H1 now `Payroll Management`; `Managed rows` count labels; `Run Management` / `Retry management` buttons; `Computing payroll management…` / `Could not compute payroll management` states; `Payroll management employees` tooltip; journey comments updated. `Preview only` badge and dry-run explanatory copy kept (still truthful: the run itself creates no payslips/period-status writes).
- `app/lib/utils/payroll-preview-modal.ts` — `previewPayrollModalTitle` now returns `Start Payroll Management` / `Payroll Management running` / `Payroll Management failed` / `Payroll Management`. Technical URL action (`preview-payroll`), testIDs, and helper/function names unchanged by design (deep-link stability).
- `app/lib/utils/payroll-preview-modal.test.ts` — title expectations + test names updated.
- `tests/smoke/hr-payroll-management-audit.spec.ts` — needles/matcher accept `Payroll Management` (keeps `Preview Payroll` as fallback).
- `CHANGELOG.md` — Unreleased entry for the rename.
- Root `.wwg/wiki/terminology.md` — `Payroll Preview` term row renamed to `Payroll Management` with former-name note; technical contract documented as unchanged.

## Truth delta
YES — user-facing name of the Run Payroll dry-run + adjustment journey is now **Payroll Management** (root terminology synced). Engine semantics (dry-run, estimate-only non-APPROVED rows, APPROVED-only Start Payroll) unchanged.

## Drift
LOW — labels/comments/tests/docs only. Untouched: payroll engine, API routes, URL `action` values, `data-testid`s, function/variable names, `special-payroll-modal.tsx` ("Preview failed" there is a different surface), device-events `Retry preview` (different surface), emp-app (no counterpart).

## Verification
- vitest `app/lib/utils/payroll-preview-modal.test.ts`: 7/7 passing.
- `tsc --noEmit` filtered to touched files: only pre-existing `run-payroll-template.tsx(2231,5)` name-type error (matches prior handoff note) + stock vitest-global `describe/it/expect` noise on `.test.ts` under plain `tsc` (repo uses `tsconfig.test.json` for those); zero diagnostics from this change.
- Browser proof NEEDS_CONFIRMATION (no live dev server run this pass).

## Risks
- None known. If HR bookmarks/search reference the old `Preview Payroll` wording, the URL contract is unchanged so links keep working; only visible copy changed.
