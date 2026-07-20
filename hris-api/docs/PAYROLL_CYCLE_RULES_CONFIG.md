# Payroll Cycle Rules Configuration (Template-Based)

This project uses a single `cycleRules` JSON object on `PayrollCycleConfig` to control period boundaries by frequency. The authoritative implementation is `app/payrollperiod/payroll-cycle.helper.ts` (`getMergedCycleRules`, `buildPeriodsFromRange`).

## Sample `cycleRules`

```json
{
  "SEMI_MONTHLY": { "firstStartDay": 1, "secondStartDay": 16, "secondEndDay": "LAST_DAY" },
  "WEEKLY": { "anchorWeekday": 1 },
  "BIWEEKLY": { "anchorWeekday": 1 },
  "MONTHLY": { "startDay": 1, "endDay": "LAST_DAY" },
  "QUARTERLY": { "startMonth": 1 },
  "ANNUALLY": { "startMonth": 1 }
}
```

## Behavior by Frequency

- `SEMI_MONTHLY.firstStartDay`, `secondStartDay`, `secondEndDay`
  - Period 1 runs `firstStartDay` to `secondStartDay - 1`.
  - Period 2 runs `secondStartDay` to `secondEndDay` (or the real last day of the month when `secondEndDay` is `"LAST_DAY"`).
  - If `secondEndDay` (as a number) is less than `secondStartDay`, period 2 wraps into the next month — e.g. `secondStartDay: 20, secondEndDay: 4` produces a period ending on day 4 of the following month.
  - The rule is only accepted if it leaves no gap between periods: `secondStartDay > firstStartDay`, and either `secondEndDay === "LAST_DAY"` with `firstStartDay === 1`, or `firstStartDay === secondEndDay + 1`. An invalid combination silently falls back to the default `1-15/16-end` rule.
  - The 4 supported app-side presets are: `1-15/16-End`, `1-14/15-End`, `5-19/20-4`, `10-24/25-9`.
  - A legacy `SEMI_MONTHLY.splitDay` shape (a single cutoff day) is auto-migrated on read into `firstStartDay: 1, secondStartDay: splitDay + 1, secondEndDay: "LAST_DAY"` — see `getOrCreatePayrollCycleConfig` in `payrollperiod.controller.ts`.
- `WEEKLY.anchorWeekday`
  - Week starts on `anchorWeekday` (`0=Sun` ... `6=Sat`).
- `BIWEEKLY.anchorWeekday`
  - Same anchor rule as weekly, but 14-day windows.
- `MONTHLY.startDay` and `MONTHLY.endDay`
  - `endDay` supports either a number or `"LAST_DAY"`.
- `QUARTERLY.startMonth`
  - First fiscal quarter starts at month `1..12`.
- `ANNUALLY.startMonth`
  - Fiscal year starts at month `1..12`.

## Day Clamping Rule

Numeric day values are clamped to the real calendar month length:

- `31` in February becomes Feb `28` or `29`.
- `31` in April becomes Apr `30`.

So `SEMI_MONTHLY.secondEndDay = "LAST_DAY"` always lands on the real last day of the month, regardless of month length.

## Pay Date Rule

Pay date is computed separately from `cycleRules`:

- `payDate = periodEnd + payDateOffsetDays`
- If `businessDayRule = NEXT_BUSINESS_DAY`, move to the next non-weekend day
- If `includeHolidaysInBusinessDayCheck = true`, holidays are also skipped

## Bulk Generate / Bulk Adjust

- `POST /api/payrollperiod/bulk-generate` takes `frequency + rangeStart + rangeEnd (+ namingMode, customNamePrefix, dryRun, calculatorId)`, builds periods from `cycleRules` via `buildPeriodsFromRange`, rejects the request if the generated periods would have a gap, and skips periods whose existing record is `COMPLETED`/`CLOSED`.
- `POST /api/payrollperiod/bulk-adjust` takes `frequency` and/or `periodIds` (+ `forceRetroactive`, `dryRun`), recomputes each matched period's boundaries against the current cycle rule, skips `COMPLETED`/`CLOSED` periods unless `forceRetroactive` is set, and skips any recomputed boundary that would conflict with another existing period.
- Both endpoints require an HR/admin policy-manager role (`isPayrollPolicyManager`).
- Controller-level test coverage: `tests/payrollperiod-bulk-cycle.controller.spec.ts`. Pure boundary-math coverage: `tests/payroll-cycle.helper.spec.ts`.

## Full Config Example

```json
{
  "defaultPayFrequency": "SEMI_MONTHLY",
  "payDateOffsetDays": 5,
  "businessDayRule": "NEXT_BUSINESS_DAY",
  "includeHolidaysInBusinessDayCheck": true,
  "cycleRules": {
    "SEMI_MONTHLY": { "firstStartDay": 1, "secondStartDay": 16, "secondEndDay": "LAST_DAY" },
    "WEEKLY": { "anchorWeekday": 1 },
    "BIWEEKLY": { "anchorWeekday": 1 },
    "MONTHLY": { "startDay": 1, "endDay": "LAST_DAY" },
    "QUARTERLY": { "startMonth": 1 },
    "ANNUALLY": { "startMonth": 1 }
  }
}
```
