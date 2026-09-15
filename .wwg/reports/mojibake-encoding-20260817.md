# User-facing encoding (mojibake) repair — 2026-08-17

## Status

`IMPLEMENTED_DOCUMENTED` — operator asked to document and push `develop`.

## What the operator saw

Notification title: `Onboarding Completed! ðŸŽ‰` instead of a party-popper or a clean title.

That string is UTF-8 `🎉` (`F0 9F 8E 89`) stored as Latin-1 characters `ðŸŽ‰`. The source file already contained the broken bytes. Prisma and the UI passed the title through unchanged.

## Product rule

User-facing notification titles and API/UI copy must be ASCII (or verified UTF-8). Do not put emoji in `checklistItem.controller.ts` boarding titles. Other notification writers already use ASCII (`Approval required`, `Document completed`).

## What was fixed

| Surface | Before | After |
|---|---|---|
| Boarding complete title | `Onboarding Completed! ðŸŽ‰` | `Onboarding Completed!` |
| Exit clearance title | same junk emoji | `Exit Clearance Completed!` |
| Live DEV row `cmswtgafn0cn3lp01zmus0q06` | stored mojibake | patched to ASCII (data, not this commit) |
| Documents modal default icon | compared to `"ðŸ“„"` so FileText never ran | `DEFAULT_DOCUMENT_ICON = "\\u{1F4C4}"` |
| Device enroll visible copy | `â€¦` / `â€¢` | `...` / `•` |
| Grafana Tempo link | double/triple-encoded title | `Open in Tempo` |
| Default level descriptions | `Level N â€“ …` | `Level N - …` |
| `set-active` schedule | wrote `embeddedSchedule` only | also `recomputeAttendanceObligationsForRange` (`ScheduleChanged`) |

## Left on purpose

| Item | Why |
|---|---|
| Giant `employee.controller.ts` comment banners | Comments only |
| `PAYROLL_PESO_MARKERS` `"â‚±"` / `"Ã¢â€šÂ±"` | Detect already-broken import files |
| Contract tests that mention `ðŸ` | They forbid that junk |

## Tests

- `bnpi-pats-api/tests/boarding-notification-title.contract.spec.ts`
- `bnpi-pats-api/tests/checklist-item-boarding-notification-titles.contract.spec.ts`
- `bnpi-pats-api/tests/user-facing-mojibake.contract.spec.ts`
- `bnpi-pats-api/tests/set-active-schedule-recompute.contract.spec.ts`

## Evidence

- `.runtime/zen-andrei-notification-20260817/`
- `.runtime/zen-andrei-activate-20260817/16-metrics-before-recompute.json`
- `.runtime/zen-andrei-activate-20260817/18-metrics-after-recompute.json`
