# Route & Layout Refactoring Plan

## Current State Analysis

### Current Structure

```
Routes (role-based prefixes):
├── /admin/*           → admin-layout.tsx
├── /hr/*      → hr-layout.tsx
├── /hr/*         → hr-user-layout.tsx
├── /employee/*        → employee-layout.tsx
└── /employee/*         → manager-layout.tsx

Directory Structure:
routes/
├── admin/
├── hr-manager/
├── hr-user/
├── employee/
├── manager/
└── shared/
```

### Issues with Current Approach

1. **Massive Duplication** - Same components/pages exist in multiple role directories
2. **Maintenance Nightmare** - Bug fixes need to be applied to multiple places
3. **Layout Context Hell** - Hard to navigate across layouts for HR users viewing employee profiles
4. **Inconsistent UX** - Different UI for same functionality across roles

---

## Proposed Solution: Unified Routes with Role-Based Sidebars

### New Structure

Keep `/employee/*` prefix for all roles (No `/shared/` prefix)

```
Routes (Unified Access):
├── /employee/dashboard         → employee/dashboard.tsx (all roles)
├── /employee/:id               → employee/$id.tsx (all roles can view any employee)
├── /employee/my-payroll        → employee/my-payroll.tsx (personal payroll - all roles)
├── /employee/my-attendance     → employee/my-attendance.tsx (personal attendance - all roles)
├── /employee/my-requests/:type → employee/requests/$type.tsx (my requests - all roles)
├── /employee/profile           → employee/profile.tsx (my profile - all roles)
├── /admin/*                    → admin-specific routes (keep separate)
└── /hr/*                       → hr-specific features (manage employees, payroll mgmt, etc.)

Directory Structure:
routes/
├── employee/                   (accessible by all roles: employees, managers, hr-user, hr-manager)
│   ├── dashboard.tsx
│   ├── $id.tsx                (employee detail - view any employee profile)
│   ├── my-payroll.tsx         (personal payroll view)
│   ├── my-attendance.tsx      (personal attendance view)
│   ├── profile.tsx            (my profile view)
│   └── requests
│       └── $type.tsx
├── admin/                      (admin-only features - KEEP SEPARATE)
│   ├── dashboard.tsx
│   ├── configuration/
│   └── ...
├── hr/                         (hr-only features - KEEP SEPARATE)
│   ├── employees/             (employee management)
│   ├── payroll/               (payroll management)
│   ├── attendance/            (attendance management)
│   └── ...
└── ...

layouts/
├── unified-layout.tsx         (handles all roles with conditional sidebars)
└── admin-layout.tsx           (keep separate for admin)
```

---

## Implementation Roadmap

### Phase 1: Setup & Analysis ✓

- [x] Identify duplicate components
- [x] List all role-specific routes
- [x] Map sidebar items by role
- [ ] Document API endpoints used

### Phase 2: Create Foundation

- [ ] Create `unified-layout.tsx` component
- [ ] Create role-aware sidebar component
- [ ] Consolidate employee route pages (keep in `routes/employee/`)
- [ ] Create `/hr/*` directory for HR-specific features
- [ ] Update `routes.ts` to use new structure

### Phase 3: Data Migration

- [ ] Move employee pages from `hr-manager/`, `hr-user/`, `manager/` to `/employee/`
- [ ] Update all imports across files
- [ ] Create role-specific logic within components (not directories)
- [ ] Delete old role-specific employee/payroll/attendance pages

### Phase 4: Testing & Cleanup

- [ ] Test all role-based navigation
- [ ] Verify sidebar visibility per role
- [ ] Clean up old role-specific directories (`hr-manager/`, `hr-user/`, `manager/`)
- [ ] Keep `/admin/` and `/hr/` (management-specific features)

---

## Sidebar Strategy

### Role-Based Sidebar Items

#### Employee

```
Working Space:
- Dashboard
- Team

General:
- My Profile (/employee/:id)
- My Payroll (/my-payroll)
- My Attendance (/my-attendance)
- My Requests (/my-requests/...)

Personal:
- Messages
- Help
- Settings
```

#### HR Manager

```
Working Space:
- Dashboard
- Employee Management
- Attendance
- Payroll Management
- Payroll Periods

General:
- My Profile (/employee/:id)
- My Payroll (/my-payroll)
- My Attendance (/my-attendance)
- My Requests (/my-requests/...)

Personal:
- Messages
- Settings
```

#### HR User

```
Similar to HR Manager with fewer permissions
```

#### Manager

```
Working Space:
- Dashboard
- Team
- Approvals

General:
- My Profile (/employee/:id)
- My Payroll (/my-payroll)
- My Attendance (/my-attendance)
- Reports

Personal:
- Messages
- Settings
```

---

### Route Naming Convention

- Use `/employee/*` for all personal/shared routes (accessible by all roles)
- Use `/admin/` for admin-only routes
- Use `/hr/` for HR-only management features
- Keep role-based sidebars showing/hiding different items

### Component Organization

```tsx
// Keep ONE file accessible by all roles:
// employee/my-payroll.tsx
// With role detection inside:
const { user } = useAuth();
const isHR = user?.role?.includes("hr");
const isManager = user?.role === "hris-employee-manager";

// Show/hide different sections based on role
return (
  <>
    {/* Show for all roles */}
    <MyPayrollSummary />

    {/* Show only for HR */}
    {isHR && <PayrollAnalytics />}

    {/* Show only for managers */}
    {isManager && <TeamPayrollOverview />}
  </>
);
```

// \_shared/profile/personal-info.tsx
// With role detection inside:
const { user } = useAuth();
const isHR = user.role?.includes("hr");

````

### Sidebar Component Example

```tsx
// components/sidebar.tsx
export function Sidebar() {
  const { user } = useAuth();

  const sidebarItems = getSidebarItemsByRole(user.role);

  return (
    <aside>
      {sidebarItems.map((item) => (
        <NavLink key={item.id} to={item.path}>
          {item.label}
        </NavLink>
      ))}
    </aside>
  );
}
````

---

## Files to Keep Separate

These should NOT be consolidated:

- `/admin/*` - Admin dashboard, configuration pages
- `/hr/employees/*` - HR-specific employee management
- `/hr/payroll/*` - HR-specific payroll management
- `/employee/approvals/*` - Manager-specific approval workflows

---

## Migration Path for Specific Features

### Employee Profile

```
CURRENT:
- /employee/:id               → employee-layout
- /hr/employee        → hr-layout (modal)
- /hr/employee           → hr-user-layout (modal)

NEW:
- /employee/:id               → unified-layout (all roles)
- /admin/employees/:id        → admin-layout (separate)
```

### My Payroll

```
CURRENT:
- /employee/payroll           → employee-layout
- /hr/payroll         → hr-layout
- /employee/payroll            → manager-layout

NEW:
- /payroll                    → unified-layout (all roles)
- /admin/payroll/*            → admin-layout (separate)
```

### My Attendance

```
CURRENT:
- /employee/attendance        → employee-layout
- /hr/my-attendance   → hr-layout
- /employee/attendance         → manager-layout

NEW:
- /attendance                 → unified-layout (all roles)
- /admin/attendance/*         → admin-layout (separate)
```

---

## Testing Checklist

- [ ] Employee can view own profile at `/employee/:id`
- [ ] HR can view any employee profile at `/employee/:id`
- [ ] Manager can view team members at `/employee/:id`
- [ ] All roles can access `/my-payroll`
- [ ] All roles can access `/my-attendance`
- [ ] Sidebar shows correct items per role
- [ ] Role-specific features hidden properly
- [ ] Deep linking still works
- [ ] Mobile responsive on all layouts
- [ ] No console errors on navigation

---

## Benefits After Refactoring

✅ **DRY Principle** - Single source of truth for shared pages
✅ **Easier Maintenance** - One component to fix instead of 3-5
✅ **Better UX** - Consistent experience across roles
✅ **Faster Development** - New features added once, accessible to all
✅ **Smaller Bundle** - Less duplicate code
✅ **Flexibility** - Easy to add role-based logic inline

---

## Estimated Effort

- **Analysis**: 2-3 hours
- **Phase 1-2**: 8-10 hours
- **Phase 3-4**: 10-12 hours
- **Total**: 20-25 hours (depending on complexity)

## Risk Mitigation

- Keep admin routes separate initially
- Create feature branch for all changes
- Test thoroughly before merge
- Have rollback plan ready
