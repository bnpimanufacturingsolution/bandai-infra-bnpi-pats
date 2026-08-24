# Route Unification - Implementation Checklist

## Phase 1: Pre-Migration (Before running scripts)

### Prerequisites

- [ ] Commit all current work to git
    ```bash
    git add .
    git commit -m "Pre-unification backup"
    ```
- [ ] Create a feature branch for this work
    ```bash
    git checkout -b feature/route-unification
    ```
- [ ] Review current route structure
    - [ ] List all routes in `hr-manager/`
    - [ ] List all routes in `hr-user/`
    - [ ] List all routes in `manager/`
    - [ ] Document role-specific features

### Environment Setup

- [ ] Ensure Node.js version is compatible
- [ ] Clear node_modules and reinstall (optional)
    ```bash
    rm -rf node_modules package-lock.json
    npm install
    ```
- [ ] Run linter to establish baseline
    ```bash
    npm run lint
    ```

## Phase 2: Dry Run (Test the migration plan)

### Execute Dry Run

- [ ] Run unification script in dry-run mode
    ```bash
    npm run unify-routes:dry-run
    ```
- [ ] Review the output carefully
    - [ ] Verify directories to be created
    - [ ] Verify files to be copied
    - [ ] Verify imports to be updated
    - [ ] Verify files to be deleted

### Document Changes

- [ ] Screenshot or save the dry-run report
- [ ] Create a note about any concerns
- [ ] Check if all route files are accounted for

### Pre-Execution Review

- [ ] All files present in source directories?
- [ ] Backup location identified?
- [ ] Team members notified about the change?

## Phase 3: Execution (Run the actual migration)

### Execute Full Migration

- [ ] Run migration with full execution
    ```bash
    npm run migrate-routes
    ```
- [ ] Confirm backup was created
    - [ ] Backup directory exists: `.routes-backup/`
    - [ ] routes.ts backup present
    - [ ] layouts/ backup present
    - [ ] route directories backup present

### Verify File Operations

- [ ] New directories created:
    - [ ] `app/routes/employee/` - has files
    - [ ] `app/routes/hr/` - has files
    - [ ] `app/routes/hr/recruitment/` - exists
- [ ] Files copied correctly:
    - [ ] HR Manager files in `/hr`
    - [ ] HR User files in `/hr`
    - [ ] Manager files in `/employee`
- [ ] Old directories removed:
    - [ ] `app/routes/hr/` - deleted
    - [ ] `app/routes/hr/` - deleted
    - [ ] `app/routes/employee/` - deleted

## Phase 4: Configuration Updates

### Update routes.ts

- [ ] Review new routes.ts structure
- [ ] Verify route prefixes match new locations
- [ ] Update layout bindings
    ```typescript
    layout("./layouts/unified-layout.tsx", [
      ...prefix("employee", [...employeeRoutes]),
      ...prefix("hr", [...hrRoutes]),
    ]),
    ```
- [ ] Ensure all route patterns are correct
- [ ] Check for duplicate routes
    ```bash
    npm run detect:duplicates
    ```

### Update unified-layout.tsx

- [ ] Review current unified-layout.tsx
- [ ] Compare with template: `scripts/unified-layout.template.tsx`
- [ ] Merge navigation items from all four layouts
- [ ] Add role-based conditional rendering
    ```typescript
    function getNavItemsByRole(userRole: string): NavItem[] {
    	// ... role-specific logic
    }
    ```
- [ ] Test navigation rendering for each role
- [ ] Verify Sidebar component receives correct props
- [ ] Test TopNavbar integration

### Update Imports

- [ ] Run bulk import update script (if created)
- [ ] Search for old import paths:
    - [ ] `routes/hr/` → `routes/hr/`
    - [ ] `routes/hr/` → `routes/hr/`
    - [ ] `routes/employee/` → `routes/employee/`
- [ ] Manual review for missed imports:
    ```bash
    grep -r "hr-manager" app/
    grep -r "hr-user" app/
    grep -r "routes/manager" app/
    ```

## Phase 5: Code Quality

### Linting & Type Checking

- [ ] Run eslint
    ```bash
    npm run lint
    ```
    - [ ] Fix all errors
    - [ ] Fix all warnings
    - [ ] No import path issues
- [ ] Run TypeScript check
    ```bash
    npm run typecheck
    ```
    - [ ] No type errors
    - [ ] All imports resolve correctly

### Import Validation

- [ ] No broken imports
- [ ] All lazy-loaded components load properly
- [ ] API imports resolve
- [ ] Component imports work
- [ ] Layout imports correct

### Build Test

- [ ] Build succeeds
    ```bash
    npm run build
    ```
- [ ] No build errors
- [ ] No build warnings about unused routes

## Phase 6: Route Testing

### Route Accessibility

- [ ] Test `/employee/*` routes:
    - [ ] `/employee/dashboard`
    - [ ] `/employee/profile`
    - [ ] `/employee/attendance`
    - [ ] `/employee/payroll`
    - [ ] `/employee/benefits`
    - [ ] `/employee/requests/leave`
    - [ ] etc.
- [ ] Test `/hr/*` routes:
    - [ ] `/hr/dashboard`
    - [ ] `/hr/employees`
    - [ ] `/hr/recruitment`
    - [ ] `/hr/payroll`
    - [ ] etc.

### Role-Based Access Control

- [ ] Test as Employee:
    - [ ] Can access `/employee/*`
    - [ ] Cannot access `/hr/*`
    - [ ] Navigation shows employee items
    - [ ] Manager items NOT visible
- [ ] Test as Manager:
    - [ ] Can access `/employee/*`
    - [ ] Cannot access `/hr/*` (unless HR_MANAGER too)
    - [ ] Navigation shows manager items
    - [ ] Can see team/approvals
- [ ] Test as HR Manager:
    - [ ] Can access `/hr/*`
    - [ ] Can access `/employee/*`
    - [ ] Navigation shows HR items
    - [ ] Can see recruitment, employees, etc.
- [ ] Test as HR User:
    - [ ] Can access `/hr/*`
    - [ ] Can access `/employee/*`
    - [ ] Navigation shows HR items (similar to manager)

### Navigation Testing

- [ ] Sidebar renders correctly for each role
- [ ] Menu items active state works
- [ ] Nested menu items expand/collapse
- [ ] Links navigate to correct routes
- [ ] Mobile navigation works (hamburger menu)

## Phase 7: Smoke Testing

### Critical User Flows

- [ ] Login flow works
- [ ] Dashboard loads for each role
- [ ] Navigation between pages works
- [ ] Forms submit correctly
- [ ] API calls work
- [ ] Data displays properly
- [ ] Modals/dialogs still work
- [ ] Notifications still work

### Data-Dependent Routes

- [ ] Employee detail page works
- [ ] Attendance records display
- [ ] Payroll info loads
- [ ] Request submissions work
- [ ] Approvals flow works

## Phase 8: Rollback Plan (If Issues Found)

### Quick Rollback

- [ ] Backup location known
- [ ] Rollback commands prepared:

    ```bash
    # Restore from backup
    cp .routes-backup/routes.ts app/routes.ts
    cp .routes-backup/layouts/* app/layouts/
    cp -r .routes-backup/routes/* app/routes/

    # Restore directories
    mkdir -p app/routes/hr-manager app/routes/hr-user app/routes/manager
    ```

- [ ] Git branch ready to revert
    ```bash
    git reset --hard HEAD~1  # or appropriate commit
    ```

### Issue Documentation

- [ ] Document any issues found
- [ ] Note error messages
- [ ] Record which roles are affected
- [ ] Identify breaking changes

## Phase 9: Documentation Updates

### Code Documentation

- [ ] Update README with new route structure
- [ ] Update relevant JSDoc comments
- [ ] Document role-based access patterns
- [ ] Update architecture docs

### Team Communication

- [ ] Document changes for team
- [ ] Update onboarding docs
- [ ] Share checklist with team
- [ ] Explain new navigation structure

### Commit Messages

- [ ] Clear commit message explaining changes
- [ ] Reference ticket/issue if applicable
- [ ] Include migration details

    ```
    feat: unify role-based routes and layouts

    - Consolidate hr-layout, hr-user-layout, employee-layout, manager-layout
    - Merge hr-manager and hr-user routes under /hr
    - Move manager routes to /employee (manager = employee + perms)
    - Update routes.ts with new configuration
    - Update unified-layout.tsx with role-based nav

    Migration: npm run migrate-routes
    Backup: .routes-backup/
    ```

## Phase 10: Post-Migration

### Cleanup

- [ ] Remove old backup (after 1-2 weeks)
- [ ] Remove scripts if one-time use:
    - [ ] `scripts/unify-routes.ts` (optional)
    - [ ] `scripts/migrate-routes.ts` (optional)
- [ ] Remove template file
    - [ ] `scripts/unified-layout.template.tsx`

### Monitor

- [ ] Monitor error logs for broken routes
- [ ] Check Sentry/error reporting
- [ ] Monitor performance (no regression)
- [ ] Gather user feedback

### Final Verification

- [ ] All tests pass
- [ ] No error reports
- [ ] All routes work as expected
- [ ] Performance is good
- [ ] Team is happy

## Troubleshooting Guide

### Issue: Routes return 404

**Solution:**

1. Verify route files were copied correctly
2. Check routes.ts configuration
3. Verify file names match route definitions
4. Check for typos in route prefixes

### Issue: Imports not found

**Solution:**

1. Run `npm run lint` to find issues
2. Manually search for old import paths:
    ```bash
    grep -r "routes/hr-manager" app/
    grep -r "routes/manager" app/
    ```
3. Update imports manually or with find/replace

### Issue: Sidebar not rendering

**Solution:**

1. Check unified-layout.tsx is properly imported
2. Verify useAuth() returns correct role
3. Check navigation items array
4. Review Sidebar component props

### Issue: Role-based access not working

**Solution:**

1. Verify user.role is being set correctly
2. Check role comparison logic
3. Ensure guards are applied to routes
4. Test with different user accounts

### Issue: Layout looks broken

**Solution:**

1. Compare with backup layout files
2. Check for CSS/Tailwind issues
3. Verify component imports
4. Check for missing styles

## Rollback Checklist (If Needed)

- [ ] Stop all active sessions
- [ ] Restore from backup
    ```bash
    cp .routes-backup/routes.ts app/routes.ts
    cp -r .routes-backup/routes/* app/routes/
    cp .routes-backup/layouts/* app/layouts/
    ```
- [ ] Re-run linter
    ```bash
    npm run lint
    ```
- [ ] Rebuild
    ```bash
    npm run build
    ```
- [ ] Restart dev server
- [ ] Test critical flows
- [ ] Notify team of rollback

## Sign-Off

- [ ] Migration completed successfully
- [ ] All tests passing
- [ ] All team members aware
- [ ] Documentation updated
- [ ] Ready for deployment

**Date Completed:** **\*\***\_\_\_**\*\***
**Completed By:** **\*\***\_\_\_**\*\***
**Reviewed By:** **\*\***\_\_\_**\*\***

---

## Quick Reference Commands

```bash
# Dry run (test only)
npm run unify-routes:dry-run

# Full migration
npm run migrate-routes

# Lint check
npm run lint

# Type check
npm run typecheck

# Build test
npm run build

# Rollback
cp -r .routes-backup/* app/

# Find old imports
grep -r "hr-manager\|hr-user\|/manager" app/ --include="*.tsx" --include="*.ts"
```

---

**Created:** 2026-01-07
**Version:** 1.0
**Status:** Ready for Use
