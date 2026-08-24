# 1.1.1 Employee Masterdata — where it lives (roles + routes)

**Date:** 2026-08-20  
**Sheet:** Employee Management → 1.1 Core → **1.1.1 Employee Masterdata** (claimed 100%)  
**Kind:** map the sheet row to the live app. Not a new UAT.

The product does **not** use the words “Employee Masterdata”. That row is the HR **Employees / Directory** surface.

| | |
|---|---|
| Sheet label | Employee Masterdata |
| App labels | **Employees** (sidebar) · **Directory** (submenu) · **Employee Directory** (page) |
| Primary HR route | `/hr/employees` |
| Prior hop | `audits/employee-management-2026-08-18.md` (Playwright, Maria Santos) |
| Role matrix | `audits/employee-management-core-zen-2026-08-18.md` |

---

## Who can see it in the UI

Sidebar item is built only when `user.role` is HR (`hris-hr-manager` or `hris-hr-user`). Code: `hris-app/app/components/organisms/Sidebar.tsx` (`isHR` → `hrWorkingSpaceItems` → **Employees**).

| Role | Sees **Employees** in Working Space? | Where to go instead |
|---|---|---|
| `hris-hr-manager` | **Yes** | Working Space → Employees → Directory |
| `hris-hr-user` | **Yes** | Same |
| `admin` / `hris-admin` | No HR sidebar item | Admin config list `/admin/configuration/employees` |
| `hris-employee-manager` | No | **My Team** `/employee/team` (not masterdata) |
| `hris-employee` | No | **My Profile** `/employee/:id` (self only) |

Unified layout still *mounts* `/hr/*` for several roles (`unified-layout.tsx` AuthGuard includes admin, HR, employee, manager). The **nav entry** is HR-only. A non-HR user can open `/hr/employees` by URL; that is not the intended product path.

---

## How to open it (HR)

1. Log in as HR, e.g. Maria Santos `hr-manager@seed.local` / `hris-hr-manager`.
2. Sidebar **WORKING SPACE** → **Employees** (folder) → **Directory**.
3. URL: `https://dev.bnpi-hris.tech/hr/employees` (or local `http://localhost:5175/hr/employees`).
4. Page chrome: List View / Directory / Organization Chart. Default list is masterdata.

---

## Routes (app)

| What | Path | File |
|---|---|---|
| HR list / directory / org tabs | `/hr/employees` | `hris-app/app/routes/hr/employees.tsx` |
| HR list view | `/hr/employees` or `?view=list` | `EmployeeList` |
| HR directory cards | `/hr/employees?view=directory` | `EmployeeDirectoryView` |
| Org chart (sheet 1.1.3, same page) | `/hr/employees?view=organization` | `OrganizationChartTab` |
| Add employee | `/hr/employees/new` | `hris-app/app/routes/hr/employees.new.tsx` |
| Edit employee | `/hr/employees/:id/edit` | `hris-app/app/routes/hr/employees.$id.edit.tsx` |
| Person profile (from a row) | `/employee/:id` | `hris-app/app/routes/employee/employee.$id.tsx` |
| Admin list | `/admin/configuration/employees` | `hris-app/app/routes/admin/configuration/employees.tsx` |
| Admin add | `/admin/configuration/employees/new` | same new form as HR |
| Admin profile | `/admin/configuration/employees/:id` | employee profile under admin layout |
| Admin edit | `/admin/configuration/employees/:id/edit` | same edit form as HR |

Route table: `hris-app/app/routes.ts` (`hrRoutes` under unified layout, `adminRoutes` under admin layout).

---

## API (not a page)

| Action | Endpoint | Who (live 2026-08-18) |
|---|---|---|
| List / get employee | `GET /api/employee` · `GET /api/employee/:id` | All logged-in roles returned **200** (open directory) |
| Edit fields | `PATCH /api/employee/:id` | All six roles **200** — **not** HR-only. See core audit |
| Assign schedule | `POST /api/employee/:id/schedules/set-active` | HR manager, HR user, admin **201**; manager / peer / self **403** |

---

## Same sheet, nearby rows (do not mix)

| ID | Sheet | App |
|---|---|---|
| 1.1.1 | Employee Masterdata | `/hr/employees` |
| 1.1.2 | Employee Requests | `/hr/approvals/requests` |
| 1.1.3 | Org Chart | `/hr/employees?view=organization` |
| 1.1.4 | Birthdays | `/celebrations/birthdays` |
| 1.1.5 | PAN / eligibility | `/hr/employee-status-changes` |
| 1.1.6 | 201 filing | `/hr/employee-documents` |

---

## Verdict

Sheet **1.1.1 Employee Masterdata** = HR **Employees Directory** at `/hr/employees`, shown in the sidebar to **`hris-hr-manager` and `hris-hr-user`**. Admin has a twin list under configuration. Employees and managers do not get this nav; they see self / team only.
