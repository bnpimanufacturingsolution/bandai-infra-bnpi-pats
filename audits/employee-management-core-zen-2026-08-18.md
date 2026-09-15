# Employee Management core test — Zen Andrei sample

**Date:** 2026-08-18 (updated after role fix, mock IDs, onboarding complete, and schedule/update role matrix)  
**Authority:** operator authorized edit of employee **Zen Andrei `00010`**  
**Question:** is Core (1.1) actually working — view, edit, **set/change schedule**, password, approval — across HR / admin / other roles?  
**Short answer:** core **works**. It is **not** fully locked by role.

| Surface | What is true |
|---|---|
| Employee GET / PATCH (`workLocation`, `isTour`) | **Every logged-in role can do it**, including a peer employee and Zen himself |
| Schedule **view** | HR manager, HR user, admin, and **Zen (self)** = 200. Seed manager and peer employee = **403** |
| Schedule **set / change** (`POST …/schedules/set-active`) | HR manager, HR user, admin = **201**. Manager (not Zen’s dept head), peer employee, Zen self = **403** |
| Password | Works. Immediate reset, **not** an approval request. Any role can reset via API |
| Approval | DOCUMENT_REQUEST works only if the assigned supervisor decides (CEO fallback) |
| Authorization | **Not 100% correctly gated.** GET/PATCH employee is open. Schedule write **is** gated |

| | |
|---|---|
| Employee | Zen Andrei `00010` / device 10 |
| Employee id | `cmspnnxot02s5qw01yk7yy2er` |
| User | `zen-andrei` / `zensample@gmail.com` / `cmspnny1c02s7qw01uramwasc` |
| **Now** | role **`bnpi-pats-employee`** · workforce **DIRECT** · status **ACTIVE** · onboarding **COMPLETED** |
| **Was** (before today’s fix) | role `bnpi-pats-hr-user` · status ONBOARDING · that is why he could open Attendance Overview |
| App / API | `http://localhost:5175` · `http://localhost:3001` |
| Raw evidence | `.runtime/employee-mgmt-core-20260818/` · `.runtime/zen-role-fix-20260818/` |

**Password (Zen can log in):** `ZenAndrei00010!Audit`  
Temp reset used in between: `andrei00010!2026` (lastName + employeeId + `!` + year).

---

## Current-state (live GET after restore)

| Field | Before this audit day | After role + mock IDs + schedule matrix |
|---|---|---|
| `Employee.role` / `User.role` | `bnpi-pats-hr-user` | **`bnpi-pats-employee`** |
| `workforceSource` | already DIRECT in later snapshots | **DIRECT** |
| `employmentStatus` | ONBOARDING | **ACTIVE** |
| Boarding process `cmspnny6t02sfqw01yxfdlxum` | NOT_STARTED / reopened for missing docs | **COMPLETED** 100% (`actualCompleteDate` 2026-08-18T07:18:12Z) |
| `workLocation` | ONSITE | **ONSITE** (restored) |
| `isTour` | false | **false** (restored) |
| `firstName` | Zen | **Zen** (name PATCH never applied — 400) |
| Active schedule | manual `employee_form_manual` / `WS_0800_1700` + `MANUAL_DAY_8_5` | **same restored** (`templateCode` null) |

---

## What we ran (not a page-open check)

1. Login as HR manager, admin, HR user, employee-manager, employee seed, **and Zen**.
2. **GET** Zen’s employee record as each role.
3. **PATCH** `workLocation` ONSITE → HYBRID as each role, then restore **ONSITE**.
4. **PATCH** `isTour=true` as each role, then restore **false**.
5. **PATCH** person `firstName` as each role (all **400** — schema requires `lastName` in the composite body).
6. **GET** `/api/employee/:zen/schedules` as each role.
7. **POST** `/api/employee/:zen/schedules/set-active` with `REGULAR_14DAY_ROTATION` as each role, then restore original embedded schedule.
8. **Reset password** as each role (earlier pass), then login as Zen, then **change password**.
9. Zen filed a **DOCUMENT_REQUEST** (COE). CEO fallback **approved**. HR **completed** the review task.
10. Removed Zen’s accidental HR role, set DIRECT, uploaded **mock** TIN/SSS/PhilHealth/Pag-IBIG using the provided card image so onboarding could finish.

Playwright opened HR directory / profile / dashboard (second-role UI login stuck on the same session).

---

## Role matrix — employee update (live API)

All calls targeted Zen Andrei only. Evidence: `.runtime/employee-mgmt-core-20260818/schedule-update-matrix.jsonl` and earlier `matrix.jsonl`.

| Action | HR manager | Admin | HR user | Employee manager | Employee seed | Zen (self) |
|---|---|---|---|---|---|---|
| GET `/api/employee/:zen` | 200 | 200 | 200 | 200 | 200 | 200 |
| PATCH `workLocation=HYBRID` | 200 | 200 | 200 | 200 | **200** | **200** |
| PATCH `isTour=true` | 200 | 200 | 200 | 200 | **200** | **200** |
| PATCH `person.personalInfo.firstName` only | 400 | 400 | 400 | 400 | 400 | 400 |
| PATCH `/api/auth/users/:zen/reset-password` | 200 | 200 | 200 | 200 | **200** | — (earlier pass) |

GET as every role is expected if the API is open-directory.  
**PATCH succeeding for a peer employee and for Zen himself is not a correct authority model.** There is no “give HR authority to edit Zen” gate — the write is open.

`firstName` 400 is **validation**, not authz: `"person.personalInfo.lastName": "Required"`. We did **not** retry with a full person payload, so name-edit-by-role is **not proven**.

Restored after the edit pass: `workLocation=ONSITE`, `isTour=false`.

### Residual: employee PATCH open to all roles = 6 actors

| Bucket | Count | What it is | Blocker class | Next step |
|---|---:|---|---|---|
| GET any employee | 6/6 | Directory read is open | `optional_product` unless PII must be hidden | Confirm product intent |
| PATCH `workLocation` / `isTour` | 6/6 | Any token can change Zen | `code_defect` (authz) | Gate PATCH to HR/admin (and maybe manager of that person) |
| Reset password | 5/5 (earlier) | Any token can reset Zen | `code_defect` (authz) | Gate reset to admin (or HR) |
| Name composite | 6/6 × 400 | Incomplete person body | `apply_path` (test) | Re-test with `firstName` + `lastName` if name edit is in scope |

---

## Role matrix — set / change schedule (live API, this pass)

This is the check that was **missing** from the first write of this file.

Code gate (`assertCanManageSchedule` in `bnpi-pats-api/app/employee/employee.controller.ts`):

- Allowed roles: `bnpi-pats-hr-manager`, `bnpi-pats-hr-user`, `admin`, `bnpi-pats-admin`, and `bnpi-pats-employee-manager` **only for owned departments**.
- GET timeline: self **or** those HR/admin roles **or** the employee’s **direct** manager (`reportToId`). Seed manager is **not** Zen’s supervisor (`reportToId` is null).

Template used for the change: **`REGULAR_14DAY_ROTATION`**.  
Original schedule restored via `PATCH { embeddedSchedule }` (manual `employee_form_manual`).

| Action | HR manager | Admin | HR user | Employee manager | Employee seed | Zen (self) |
|---|---|---|---|---|---|---|
| GET `/api/employee/:zen/schedules` | **200** | **200** | **200** | **403** | **403** | **200** (self) |
| POST `…/schedules/set-active` `REGULAR_14DAY_ROTATION` | **201** | **201** | **201** | **403** | **403** | **403** |

Exact 403 bodies (re-probed):

| Actor | Action | Message |
|---|---|---|
| Employee manager | GET schedules | `You are not allowed to view schedule timeline` |
| Employee seed | GET schedules | `You are not allowed to view schedule timeline` |
| Employee manager | set-active | `Department head can only assign schedules within owned departments` |
| Employee seed | set-active | `You are not allowed to assign schedules` |
| Zen self | set-active | `You are not allowed to assign schedules` |

**So we can set and change schedule — but only as HR / HR user / admin.**  
We are **sure** a normal employee and Zen himself **cannot** assign a new template.  
We are **sure** the seed employee-manager **cannot** assign Zen (GA/HR is not in that manager’s owned departments). We did **not** re-test a real GA/HR department head, because Zen has no `reportToId` and the GA/HR `managerId` is null.

HR PATCH of `embeddedSchedule` (the restore) also returned **200**. That is another write path besides `set-active`.

Deactivate (`PATCH …/schedules/:entryId/deactivate`) was **not** called (it unsets the schedule).

---

## Why Zen could open Attendance Overview (and what we changed)

Zen is in department **GA/HR** (`isHr=true`). Role derivation had set `Employee.role` / `User.role` to **`bnpi-pats-hr-user`**. In the app, `isHR = bnpi-pats-hr-manager || bnpi-pats-hr-user` unlocks `/hr/attendance`.

| Step | Result | Evidence |
|---|---|---|
| PATCH Employee + User `role=bnpi-pats-employee` | Both roles now `bnpi-pats-employee` | `.runtime/zen-role-fix-20260818/user-patch.json` |
| Confirm workforce DIRECT | Already DIRECT; left DIRECT | live GET |
| PATCH `employmentStatus=ACTIVE` alone | Overwritten back to ONBOARDING while mandated docs missing | `reconcileEmployeeOnboardingState` / `reopenedForMissingDocuments` |
| Upload mock TIN / SSS / PhilHealth / Pag-IBIG | HR upload auto-APPROVED | `.runtime/zen-role-fix-20260818/upload-*.json` |
| After last mandated doc | Process **COMPLETED**, status **ACTIVE** | boarding `cmspnny6t02sfqw01yxfdlxum` |

Mock government IDs (format-valid placeholders, **not** real people IDs). Same card image for all four:

| Type | Number | File |
|---|---|---|
| TIN | `123456789` | `mock-id-card.jpg` |
| SSS | `1234567890` | same |
| PhilHealth | `123456789012` | same |
| Pag-IBIG | `123456789012` | same |

---

## Password request + approve (what exists)

There is **no password-request workflow**. Password is:

| Step | Who | Result |
|---|---|---|
| Reset user password | Any logged-in role (API) | 200 · sets temp password + `requirePasswordChange=true` |
| Login with temp password | Zen `zensample@gmail.com` / `andrei00010!2026` | 200 · (then still `bnpi-pats-hr-user`; later fixed) |
| Change password | Zen `PATCH /api/auth/change-password` | 200 · “Password updated successfully” |
| Login with new password | `ZenAndrei00010!Audit` | 200 · role **`bnpi-pats-employee`** |

Admin UI has **Reset Password** on `/admin/configuration/users`. That is the product control. It is **not** an approval queue. It is an immediate reset.

---

## Sample approval (Employee Requests)

Password is not a request type. The working sample used **DOCUMENT_REQUEST** (COE) as the Employee Management approval path.

| Step | Actor | Result |
|---|---|---|
| Create request | Zen Andrei | `REQ-1786424090597` · `cmsyajah7015q8h80ka5fq01n` · SUBMITTED |
| Workflow | system | 1 Employee Submission (done) → 2 **Manager Approval** (SUPERVISOR) → 3 HR Review task → 4 System release |
| Assigned approver | **Ramon Villanueva** `EMP-EXEC-CEO-001` / `ceo@seed.local` | Zen has no supervisor; engine escalated (`SUPERVISOR_CHAIN_EXHAUSTED_ESCALATED_BY_RANK`) |
| Approve | CEO `Password123!` | 200 · state **APPROVED** |
| HR review task | Maria Santos (HR manager) | 200 · state **COMPLETED** |

Who **cannot** approve this step:

| Actor | HTTP | Why |
|---|---|---|
| HR manager (if they created the request) | 403 | Self-approval is not allowed |
| HR / manager (not the assigned supervisor) | 403 | “Only the current assigned approver can decide this step” |
| Admin user | 401 | No acting employee on the admin user — workflow cannot resolve an approver |

---

## Core 1.1 — actually working?

| Core row | Sample on Zen | Working? | Caveat |
|---|---|---|---|
| 1.1.1 Masterdata view | GET Zen as 6 roles | **Yes** | Even a peer employee can read the full record |
| 1.1.1 Masterdata edit | PATCH workLocation + isTour, restored | **Yes** | Even a peer employee and Zen can edit. Not an approval |
| 1.1.1 Name edit | PATCH firstName only | **Schema 400** | Not a role deny. Need lastName in body — not re-run |
| Set / change schedule | POST set-active `REGULAR_14DAY_ROTATION` | **Yes for HR/admin/HR user** | 403 for manager (wrong dept), peer, self |
| View schedule timeline | GET `/:id/schedules` | **Yes for HR/admin + self** | 403 for manager/peer |
| 1.1.2 Employee Requests | Zen filed COE request | **Yes** | Create works |
| 1.1.2 Approval | CEO approved, HR completed | **Yes, with hierarchy** | Needs assigned supervisor (or rank fallback) |
| Password | Reset + change | **Yes** | Not a request. **No role check** on reset |
| Onboarding complete | Mock mandated IDs | **Yes** | ACTIVE only after TIN/SSS/PhilHealth/Pag-IBIG |
| Role / HR access | Stripped `bnpi-pats-hr-user` | **Yes** | Login role is now `bnpi-pats-employee` |
| 1.1.3–1.1.6 | Not re-run here | See [employee-management-2026-08-18.md](./employee-management-2026-08-18.md) | Screen-exists audit only |

**Not 100% “core is correctly authorized.”**  
**Yes** for “HR can edit Zen, HR/admin can change his schedule, password can be reset and used, a request can be approved end-to-end, onboarding can complete.”

### Done vs not done

| Claim | Status | Evidence | UI still shows |
|---|---|---|---|
| All 6 roles can GET Zen | Proven | schedule-update-matrix.jsonl | Directory / profile |
| All 6 roles can PATCH workLocation / isTour | Proven | same | Edit form if they can open it |
| HR / admin / HR user can set-active schedule | Proven 201 | same | Schedule assign UI |
| Manager / employee / Zen cannot set-active | Proven 403 | re-probe messages | They should not get a working assign |
| Manager / employee cannot GET schedule timeline | Proven 403 | same | Timeline hidden / error |
| Zen can GET his own schedule | Proven 200 | same | Own profile schedule |
| Every employee field (salary, dept, role, terminate) tested | **Not done** | — | Do not assume |
| Deactivate schedule | **Not done** (unsafe unset) | — | — |
| Real GA/HR dept-head can assign Zen | **NEEDS_CONFIRMATION** | no dept manager on GA/HR | — |
| Playwright multi-role UI | Partial | HR screenshots only | Second login stays Maria |

---

## Failures / residuals

| Item | Class | Next |
|---|---|---|
| Any role can PATCH any employee (`workLocation`, `isTour`, and likely more) | `code_defect` (authz) | Gate PATCH to HR/admin (and maybe manager of that person) |
| Any role can reset any user password | `code_defect` (authz) | Gate reset to admin (or HR) |
| PATCH `embeddedSchedule` is also an open write if the caller can PATCH | `code_defect` (authz) | Same PATCH gate; do not rely on `set-active` alone |
| Admin cannot approve workflow | `apply_path` / design | Admin has no employee actor; use CEO/HR employee accounts |
| Zen has no supervisor | data | 1,428 people in org chart have the same gap; approval escalates to CEO |
| Playwright multi-role UI | test harness | Second login stays on Maria’s session; use a new browser context |
| Name PATCH needs full `personalInfo` | test / schema | Re-run with firstName + lastName if product needs that proof |

---

## How to log in as Zen now

```text
Email:    zensample@gmail.com
Password: ZenAndrei00010!Audit
Role:     bnpi-pats-employee
```

He should **not** see HR Attendance Overview anymore. If the UI still does, that is a stale session — log out and log in again.

---

## How to re-run

| What | Path |
|---|---|
| Original GET / PATCH / password / request matrix | `.runtime/run-zen-core-matrix.ps1` |
| Schedule + update role matrix | `.runtime/run-zen-schedule-update-matrix.ps1` |
| UI spec (HR only is reliable today) | `bnpi-pats-app/tests/smoke/hr-employee-management-core-zen.spec.ts` |
| Sheet existence audit | [employee-management-2026-08-18.md](./employee-management-2026-08-18.md) |
| Role / onboarding / mock IDs | `.runtime/zen-role-fix-20260818/` |
