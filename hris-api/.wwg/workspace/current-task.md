# Current Task

## Status
done

## Summary
Benefit attendance eligibility configuration (mode + disqualify flags) independent of attendance-based amount; payroll evaluation; HR form + benefit-type defaults; PFA seed defaults; WWG/docs.

## Category
feature / data-model / mixed

## Packages
- hris-api
- hris-app
- Dual-app: **HR/emp-only (no counterpart)** — enrollment + benefit-type admin live in hris-app only

## Code changes
- API: eligibility fields on EmployeeBenefit + BenefitType defaults; helper; payroll order; create merge from type; seeder PFA; migration SQL; tests
- App: employee-benefit-form Attendance rules; benefit-types eligibility defaults; services/zod

## Truth synchronization
- New truth detected: YES
- Wiki updated: YES — project-truth, terminology, summaries, BENEFIT_SCHEDULE_MODES (api+app), CHANGELOGs
- Evidence labels: CONFIRMED_FROM_IMPLEMENTATION

## Drift
- Status: LOW — seed name Performance Bonus vs Perfect Attendance still CONFLICTING (pre-existing)

## Follow-ups
- Optional backfill script for existing PFA enrollments to ATTENDANCE_QUALIFIED (owner opt-in)
- bandai-infra standalone sync not in this task
- Apply postgres migration on deploy envs
