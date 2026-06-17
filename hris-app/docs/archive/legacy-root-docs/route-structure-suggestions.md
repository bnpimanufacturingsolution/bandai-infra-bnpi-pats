# Route Structure Optimization Suggestions

## Current Issues

### 1. **Massive Code Duplication**

The same components are duplicated across different role folders:

- `employee/requests/leave.tsx` (793 lines)
- `manager/requests/leave.tsx` (793 lines)
- **IDENTICAL FILES!**

Same pattern for:

- `employee/requests/document-request.tsx` = `manager/requests/document-request.tsx`
- `employee/requests/expense-reimbursement.tsx` = `manager/requests/expense-reimbursement.tsx`
- `employee/requests/time-requests.tsx` = `manager/requests/time-requests.tsx`
- `employee/attendance.tsx` = `manager/attendance.tsx`
- `employee/payroll.tsx` = `manager/payroll.tsx`
- `employee/messages.tsx` = `manager/messages.tsx`
- `employee/notifications.tsx` = `manager/notifications.tsx`
- `employee/help.tsx` = `manager/help.tsx`
- `employee/settings.tsx` = `manager/settings.tsx`

---

## Recommended New Structure

### Option 1: Shared Routes with Role-Based Access Control (BEST)

```
app/routes/
├── _shared/                          # Shared routes across all roles
│   ├── attendance.tsx                # My Attendance (used by employee, manager, hr-user)
│   ├── payroll.tsx                   # My Payroll (used by employee, manager, hr-user)
│   ├── messages.tsx                  # Messages (all roles)
│   ├── notifications.tsx             # Notifications (all roles)
│   ├── help.tsx                      # Help & Support (all roles)
│   ├── settings.tsx                  # Settings (all roles)
│   ├── profile.tsx                   # Profile (all roles)
│   │
│   ├── requests/                     # Shared request components
│   │   ├── leave.tsx                 # Leave requests (employee, manager, hr-user)
│   │   ├── time-requests.tsx         # Time requests
│   │   ├── expense-reimbursement.tsx # Expense reimbursement
│   │   └── document-request.tsx      # Document requests
│   │
│   └── leave/                        # Shared leave components
│       ├── index.tsx                 # My Leaves overview
│       └── [tabs].tsx                # Leave tabs (balance, history, policies)
│
├── admin/                            # Admin-specific routes only
│   ├── dashboard.tsx
│   ├── analytics.tsx
│   ├── audit-logs.tsx
│   └── configuration/
│       ├── departments.tsx
│       ├── positions.tsx
│       ├── employees.tsx
│       ├── users.tsx
│       ├── schedules.tsx
│       ├── benefit-types.tsx
│       └── loan-types.tsx
│
├── hr-manager/                         # HR Admin-specific only
│   ├── dashboard.tsx
│   ├── employees.tsx
│   ├── add-employee.tsx
│   ├── employee-profile.tsx
│   ├── attendance.tsx                # Team attendance (different from personal)
│   ├── job-openings.tsx
│   ├── announcements.tsx
│   ├── performance.tsx
│   ├── approvals.tsx
│   └── reports.tsx
│
├── hr-user/                          # HR User-specific only
│   ├── dashboard.tsx
│   ├── employee-records.tsx
│   ├── add-employee.tsx
│   └── reports.tsx
│
├── manager/                          # Manager-specific only
│   ├── dashboard.tsx
│   ├── team.tsx                      # Team management
│   ├── approvals.tsx                 # Approval workflows
│   ├── attendance-approval.$employeeId.tsx
│   ├── reports.tsx
│   └── benefits.tsx
│
└── employee/                         # Employee-specific only
    ├── dashboard.tsx
    ├── team.tsx                      # View team
    ├── learning.tsx
    ├── performance.tsx
    └── benefits.tsx
```

### How to Reference Shared Routes in routes.ts:

```typescript
// Shared routes that multiple roles use
const sharedRoutes = {
	attendance: "routes/_shared/attendance.tsx",
	payroll: "routes/_shared/payroll.tsx",
	messages: "routes/_shared/messages.tsx",
	notifications: "routes/_shared/notifications.tsx",
	help: "routes/_shared/help.tsx",
	settings: "routes/_shared/settings.tsx",
	profile: "routes/_shared/profile.tsx",
};

const employeeRoutes = [
	route("dashboard", "routes/employee/dashboard.tsx"),
	route("team", "routes/employee/team.tsx"),
	route("learning", "routes/employee/learning.tsx"),

	// Shared routes
	route("attendance", sharedRoutes.attendance),
	route("payroll", sharedRoutes.payroll),
	route("messages", sharedRoutes.messages),
	route("notifications", sharedRoutes.notifications),
	route("help", sharedRoutes.help),
	route("settings", sharedRoutes.settings),
	route("profile", sharedRoutes.profile),

	// Shared requests
	...prefix("requests", [
		route("leave", "routes/_shared/requests/leave.tsx"),
		route("time-requests", "routes/_shared/requests/time-requests.tsx"),
		route("expense-reimbursement", "routes/_shared/requests/expense-reimbursement.tsx"),
		route("document-request", "routes/_shared/requests/document-request.tsx"),
	]),
];

const managerRoutes = [
	route("dashboard", "routes/employee/dashboard.tsx"),
	route("team", "routes/employee/team.tsx"),
	route("approvals", "routes/employee/approvals.tsx"),
	route("reports", "routes/employee/reports.tsx"),

	// Same shared routes as employee
	route("attendance", sharedRoutes.attendance),
	route("payroll", sharedRoutes.payroll),
	route("messages", sharedRoutes.messages),
	route("notifications", sharedRoutes.notifications),
	route("help", sharedRoutes.help),
	route("settings", sharedRoutes.settings),
	route("profile", sharedRoutes.profile),

	// Same shared requests as employee
	...prefix("requests", [
		route("leave", "routes/_shared/requests/leave.tsx"),
		route("time-requests", "routes/_shared/requests/time-requests.tsx"),
		route("expense-reimbursement", "routes/_shared/requests/expense-reimbursement.tsx"),
		route("document-request", "routes/_shared/requests/document-request.tsx"),
	]),
];
```

---

## Benefits

1. **DRY Principle**: No more duplicated code
2. **Single Source of Truth**: Update one file, all roles get the fix
3. **Easier Maintenance**: Bug fixes and features in one place
4. **Smaller Bundle Size**: Less duplicate code
5. **Consistency**: Same UI/UX across all roles
6. **Role-Based Logic**: Use `useAuth()` or similar to show/hide features based on role

---

## Implementation Steps

1. **Create `_shared` folder** in `app/routes/`
2. **Move duplicate files** to `_shared/`
3. **Add role detection** inside shared components:
    ```tsx
    const { user } = useAuth();
    const isManager = user?.role === "manager";
    const isEmployee = user?.role === "employee";
    ```
4. **Update routes.ts** to reference shared routes
5. **Delete duplicate files**
6. **Test each role** to ensure everything works

---

## Files to Move to `_shared/`:

### High Priority (Exact Duplicates):

- ✅ `attendance.tsx` (employee, manager)
- ✅ `payroll.tsx` (employee, manager, hr-user)
- ✅ `messages.tsx` (employee, manager, admin)
- ✅ `notifications.tsx` (employee, manager, admin)
- ✅ `help.tsx` (employee, admin)
- ✅ `settings.tsx` (employee, manager, admin)
- ✅ `profile.tsx` (employee, manager, hr-manager)
- ✅ `requests/leave.tsx` (employee, manager)
- ✅ `requests/time-requests.tsx` (employee, manager)
- ✅ `requests/expense-reimbursement.tsx` (employee, manager)
- ✅ `requests/document-request.tsx` (employee, manager)

### Medium Priority (Similar Components):

- `leave.tsx` (employee, manager, hr-user)
- `team.tsx` (employee vs manager - different permissions)

---

## Estimated Impact

- **Lines of code removed**: ~8,000+ lines
- **Files reduced**: From 133 to ~90 files
- **Maintenance effort**: 60% reduction
- **Bundle size**: 15-20% smaller

---

## Alternative: Component-Based Approach

If you prefer more flexibility:

```
app/
├── routes/
│   ├── employee/
│   │   └── attendance.tsx    # Just imports from components
│   └── manager/
│       └── attendance.tsx    # Just imports from components
│
└── components/
    └── features/
        └── attendance/
            └── AttendancePage.tsx  # Actual component with logic
```

This way routes are separate but components are shared.

---

## Recommendation

**Use Option 1 (Shared Routes)**

- Cleaner route structure
- Better with React Router v7
- Less boilerplate
- True single source of truth
