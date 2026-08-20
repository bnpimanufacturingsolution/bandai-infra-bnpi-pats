# Employee Management audit

**Date:** 2026-08-18  
**Sheet:** Employee Management (section 1) — claimed Core 100%, Customization 100%, Testing 96%  
**Kind:** live Playwright feature audit (does the screen exist, and does it open)  
**Not** a UAT sign-off and **not** a 100% coverage claim.

| | |
|---|---|
| Actor | `hr-manager@seed.local` / `hris-hr-manager` (Maria Santos) |
| App | `http://localhost:5175` |
| API | `http://localhost:3001` |
| Spec | `hris-app/tests/smoke/hr-employee-management-audit.spec.ts` |
| Screenshots | `.runtime/employee-mgmt-audit-20260818/` |

---

## Verdict vs the sheet

The sheet marks Core and Customization **100%**. The live app has **most of the screens**. It does **not** have every named product, and several lists are empty on this clone.

| Claim on sheet | Live |
|---|---|
| 1.1 Core 100% | Screens exist. TIN library and dedicated PAN page do not. Several lists empty. |
| 1.2 Customization 100% | Avatar and Perfect Attendance report exist. **Birthday Allowance does not.** |
| 1.3 Testing 96% | Unit/e2e files exist in the repo. There is no UAT screen. Not re-scored as a coverage %. |

---

## 1.1 Core

| ID | Sheet row | Route | Feature in app? | Live result | What Playwright saw |
|---|---|---|---|---|---|
| 1.1.1 | Employee Masterdata | `/hr/employees` | Yes | **Working** | Employee Directory, **2,226** people, Add / Import / Filters, name / position / department / workforce / hire date / status. **Roles + route map:** [employee-masterdata-1.1.1-roles-routes-2026-08-20.md](./employee-masterdata-1.1.1-roles-routes-2026-08-20.md) |
| 1.1.2 | Employee Requests | `/hr/approvals/requests` | Yes | **Working (empty queue)** | **My Approvals** table (Requester, Type, Requested On, Current Step). Rows skeleton / empty |
| 1.1.3 | Org Chart | `/hr/employees?view=organization` | Yes | **Working** | Organization Structure. 2,226 employees, 144 with direct reports, **1,428 without supervisor**. Chart cards render |
| 1.1.4 | Monthly birthday celebrants (employees and kids) | `/celebrations/birthdays` | Yes | **Working (0 this month)** | Monthly Celebrants, August 2026, search “employees or kids”, View **All (0)** |
| 1.1.5 | PAN, regularization, exit clearance | `/hr/employee-status-changes` | Yes, split | **Partial** | Cards: For Promotion / Regularization / Transfer / Termination — all **0**. Exit clearance lives on employee profile / PAN modal, not this list |
| 1.1.5b | Dedicated PAN route | `/hr/requests/personnel-action` | Redirect stub | **Partial** | Source redirects to tickets. Browser hop stayed blank |
| 1.1.6 | 201 filing | `/hr/employee-documents` | Yes | **Working (0 rows)** | Employee Document Compliance: Non-Compliant / Compliant / Pending Approval / Warnings |
| 1.1.6b | TIN library | no standalone route | **No library page** | **Partial** | TIN is a document type (`TIN ID`) on the employee documents tab. There is no TIN library screen |

### 1.1 notes

- Masterdata first paint can be a skeleton; the later directory shot is the truth (2,226 rows).
- Org Chart is a real feature. The 1,428 “without immediate supervisor” count is data quality, not a missing screen.
- Birthdays support employees **and** kids in the search/view chrome. August 2026 had **0** celebrants on this clone.
- “PAN / regularization / exit” is not one page. Eligibility is `/hr/employee-status-changes`. PAN create is a modal. Exit clearance is on the employee onboarding/offboarding tab.

---

## 1.2 Customization

| ID | Sheet row | Route | Feature in app? | Live result | What Playwright saw |
|---|---|---|---|---|---|
| 1.2.1 | Employee Avatar | `/hr/employees` | Yes | **Working** | Avatar on each directory row (and HR sidebar) |
| 1.2 | Birthday Allowance | `/hr/benefits-management` | **No catalog item** | **Missing** | Benefits page did not paint in 45s. Benefit-type API returned **21** codes; **none** is Birthday Allowance |
| 1.2 | Perfect Attendance | `/hr/reports/attendance?tab=perfect` | Yes | **Working (data still loading)** | Perfect Attendance Report, month/year/department filters, Export. Shot still said “Loading metrics…” |

Benefit types present on this clone (no Birthday Allowance):

`INC`, `UNIDED`, `NEGADJ`, `MTX`, `ABS`, `ARP`, `MHDMF2`, `OAD`, `AON`, `NDA`, `NPA`, `LVP`, `UFD`, `TSA`, `OTM`, `PFA` (Perfect Attendance), `OBA`, `MLA`, `LLA`, `HYS`, `DMA`.

`PFA` is a payroll/benefit code. The report at `/hr/reports/attendance?tab=perfect` is a metrics screen. It does **not** by itself award Perfect Attendance pay.

---

## 1.3 Testing (not a UI section)

| ID | Sheet | Claimed | What exists |
|---|---|---|---|
| 1.3.1 | Unit | 100% | Vitest around employee list, import preview, employee-detail tabs, hard-delete contract |
| 1.3.2 | Function | 100% | Service/hook tests. Not a function-test pack per sheet row |
| 1.3.3 | E2E | 92% | Mocked `employee-detail.spec.ts` plus this live audit. Not full-sheet e2e |
| 1.3.4 | UAT | 90% | No UAT product surface in the app |

---

## Gaps (do not treat as 100%)

| Gap | Class | Detail |
|---|---|---|
| Birthday Allowance | missing product | Not in benefit catalog. Benefits Management UI did not render in the live hop |
| TIN library | missing page | TIN exists only as a 201 / identity document type |
| Dedicated PAN route | stub | `personnel-action.tsx` navigates to tickets; hop was blank |
| Empty operational lists | data, not missing UI | Birthdays 0, eligibility 0, 201 0, approvals empty |
| Org reporting lines | data quality | 1,428 of 2,226 have no immediate supervisor |
| Perfect Attendance pay | do not confuse | Report ≠ automatic payroll award (`PFA` enrollment is separate) |

---

## How to re-run

```powershell
cd hris-app
npx playwright test tests/smoke/hr-employee-management-audit.spec.ts --reporter=list
```

Screenshots and raw JSON land in `.runtime/employee-mgmt-audit-20260818/`. This file in `audits/` is the human write-up.
