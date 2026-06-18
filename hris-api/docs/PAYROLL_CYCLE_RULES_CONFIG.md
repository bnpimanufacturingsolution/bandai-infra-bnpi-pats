# Payroll Cycle Rules Configuration (Template-Based)

This project uses a single `cycleRules` JSON object on `PayrollCycleConfig` to control period boundaries by frequency.

## Sample `cycleRules`

```json
{
  "SEMI_MONTHLY": {
    "rangeA": { "startDay": 5, "endDay": 20 },
    "rangeB": { "startDay": 21, "endDay": 4 }
  },
  "WEEKLY": { "anchorWeekday": 1 },
  "BIWEEKLY": { "anchorWeekday": 1 },
  "MONTHLY": { "startDay": 1, "endDay": "LAST_DAY" },
  "QUARTERLY": { "startMonth": 1 },
  "ANNUALLY": { "startMonth": 1 }
}
```

## Behavior by Frequency

- `SEMI_MONTHLY.rangeA` and `SEMI_MONTHLY.rangeB`
  - Two explicit ranges define each semi-monthly period.
  - If `startDay > endDay`, the range crosses into next month.
  - Example:
    - `rangeA: 5-20`
    - `rangeB: 21-4` (cross-month)
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

For explicit semi-monthly ranges, day values are still clamped by real month length during date resolution.

## Pay Date Rule

Pay date is computed separately from `cycleRules`:

- `payDate = periodEnd + payDateOffsetDays`
- If `businessDayRule = NEXT_BUSINESS_DAY`, move to the next non-weekend day
- If `includeHolidaysInBusinessDayCheck = true`, holidays are also skipped

## Full Config Example

```json
{
  "defaultPayFrequency": "SEMI_MONTHLY",
  "payDateOffsetDays": 5,
  "businessDayRule": "NEXT_BUSINESS_DAY",
  "includeHolidaysInBusinessDayCheck": true,
  "cycleRules": {
    "SEMI_MONTHLY": {
      "rangeA": { "startDay": 5, "endDay": 20 },
      "rangeB": { "startDay": 21, "endDay": 4 }
    },
    "WEEKLY": { "anchorWeekday": 1 },
    "BIWEEKLY": { "anchorWeekday": 1 },
    "MONTHLY": { "startDay": 1, "endDay": "LAST_DAY" },
    "QUARTERLY": { "startMonth": 1 },
    "ANNUALLY": { "startMonth": 1 }
  }
}
```
