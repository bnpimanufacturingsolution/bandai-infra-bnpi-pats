# Benefit Payroll Schedule Design

## Goal

Make HR benefit payroll adjustments understandable by requiring an explicit schedule type instead of combining a date range with a hidden default of six installments.

## User experience

The create/edit benefit modal adds a required `Schedule type` selector with three choices:

- `Time-bound`: HR enters a start date, end date, and **total** amount. The system distributes the amount across payroll cycles in the selected range.
- `Fixed installments`: HR enters a start date, number of installments, and **total** amount. The system creates exactly that many payroll-cycle installments.
- `Recurring` (added 2026-07-14): HR enters a start date, **per-period** amount, and optional end date. The same amount applies every eligible payroll period while active until end date or cancel/deactivate. No bulk schedule at create.

Only fields relevant to the selected type are shown. The modal previews the calculated installment count and per-installment amount (finite modes) or open-ended/per-period copy (recurring) before submission. Payroll direction remains controlled by the selected benefit type.

## Data and API behavior

Add a persisted schedule mode with values `TIME_BOUND`, `FIXED_INSTALLMENTS`, and `RECURRING`, plus the installment count where required. Existing generated installment rows remain the payroll execution source for finite modes and for recurring after lazy ensure.

For `TIME_BOUND`, require valid start and end dates, derive the payroll cycles that overlap the range, and generate one scheduled installment per cycle. The final installment receives any rounding remainder.

For `FIXED_INSTALLMENTS`, require a valid start date and positive installment count, generate exactly that many installments at the configured payroll cycle cadence, and divide the total amount across them. The final installment receives any rounding remainder.

For `RECURRING`, require a valid start date and positive per-period amount; end date is optional. Persist `totalInstallments: 0` (do not apply the legacy six default). Do not bulk-create installments on create/update.

Reject ambiguous or invalid combinations at the API boundary. Do not silently default a new record to six installments. Existing records without the new mode must remain readable and continue using their existing generated installments during migration/compatibility handling.

## Payroll flow

Payroll continues to resolve only active/approved, active, non-deleted benefits whose scheduled installments fall inside the payroll period. For `RECURRING`, payroll **ensures** one installment for the current period when the benefit is in range (idempotent find-or-create) before resolve. Applied installments transition from `SCHEDULED` to `DEDUCTED`. Compensation/deduction direction and reconciliation behavior are unchanged.

## Tests

Backend tests cover mode validation, time-bound cycle generation, fixed-count generation, recurring open-ended/optional end, lazy ensure idempotency, rounding, date boundaries, inactive/pending exclusion, payroll-period selection, and installment state transitions. Frontend tests cover mode selection (including Recurring), conditional fields, validation, preview calculations, payload construction, and compatibility with edit/view flows. Each new or modified function must have at least five meaningful cases per WWG governance.

## Documentation

Update the benefits/payroll user documentation and testing strategy with the three schedule modes, their validation rules, amount semantics (total vs per-period), and the payroll execution lifecycle. Update relevant WWG truth/context only where the accepted behavior changes durable product terminology or scope; do not rewrite inferred truth silently.

## Scope boundaries

This change does not alter benefit-type direction, tax/reconciliation configuration, payroll statutory calculations, authorization, or employee self-service enrollment.
