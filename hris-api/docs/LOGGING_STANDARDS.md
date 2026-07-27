# HRIS API — Logging Standards

## Contract

| Logger | File | Storage | Scope |
|--------|------|---------|-------|
| `logActivity()` | `utils/activityLogger.ts` | `ActivityLogging` | **All actions** — every successful handler |
| `logAudit()` | `utils/auditLogger.ts` | `AuditLogging` | **CUD only** — create, update, delete (and mutation equivalents). **No reads.** |

Current controller coverage snapshot: [logging-audit.md](logging-audit.md).

`shouldSkipAuditLog()` in `auditLogger.ts` skips GET/HEAD/OPTIONS and `READ` actions as a safety net.

## When to call each logger

| Handler type | `logActivity` | `logAudit` |
|--------------|:-------------:|:----------:|
| GET / read | Yes | No |
| POST create / import | Yes | Yes (CREATE) |
| PATCH / PUT update | Yes | Yes (UPDATE) |
| DELETE | Yes | Yes (DELETE) |
| Workflow mutation (publish, execute, approve) | Yes | Yes (UPDATE) |

## Inline pattern

### Read / non-CUD action

```typescript
logActivity(req, {
  userId: (req as any).user?.id || "unknown",
  action: config.ACTIVITY_LOG.<MODULE>.ACTIONS.<ACTION>,
  description: `${config.ACTIVITY_LOG.<MODULE>.DESCRIPTIONS.<DESC>}`,
  page: { url: req.originalUrl, title: config.ACTIVITY_LOG.<MODULE>.PAGES.<PAGE> },
});
```

### CUD mutation

```typescript
logActivity(req, { /* same shape */ });

logAudit(req, {
  userId: (req as any).user?.id || "unknown",
  action: config.AUDIT_LOG.ACTIONS.CREATE | UPDATE | DELETE,
  resource: config.AUDIT_LOG.RESOURCES.<MODULE>,
  severity: config.AUDIT_LOG.SEVERITY.<LEVEL>,
  entityType: config.AUDIT_LOG.ENTITY_TYPES.<MODULE>,
  entityId: entity.id,
  changesBefore: existing || null,
  changesAfter: snapshot || null,
  description: "...",
});
```

Reference: [template.controller.ts](../app/template/template.controller.ts), [department.controller.ts](../app/department/department.controller.ts).

## User activity feed

The admin Users module now exposes a dedicated read-only timeline endpoint:

- `GET /api/auth/users/:id/activity-logs`

This endpoint does not introduce a new storage model. It merges existing records from:

- `ActivityLogging`
- `AuditLogging`
- `RequestTransaction`
- `EmployeeScheduleHistory`
- `User.lastLogin`

The feed is reserved for HR and admin-facing roles only. The access allowlist is enforced server-side before the controller reads any sensitive HR activity data.

### Exposed activity categories

The merged timeline currently normalizes records into these categories when the source data supports them:

- Attendance
- Timesheet
- Payroll
- Leave
- Overtime
- Schedule
- Profile
- Login
- Account
- Request
- Audit

### Login history

Login history is represented using the existing user record and any available auth activity records. If no dedicated login event exists, the feed still shows the user's `lastLogin` value in the header summary.

## HR audit feed

The HR module now exposes a global mutation-only audit endpoint for sensitive cross-system operations:

- `GET /api/auth/hr/audit-logs`

This endpoint reuses the existing `AuditLogging` ledger. It does not add a second logging system or a new persistence model.

### Allowed roles

- `hris-hr-manager`
- `hris-hr-user`

### Included source tables

- `AuditLogging`
- Existing `logAudit()` sources for HR-sensitive CUD mutations

### Exposed categories

The endpoint exposes only `CREATE`, `UPDATE`, and `DELETE` audit rows. Login/read events remain excluded by design.

### Notes

- The feed is org-scoped through the authenticated request context.
- The feed is filtered to sensitive HR resources already written through `logAudit()`.
- No migration is required for the initial implementation.

## Severity

| Level | Use for |
|-------|---------|
| CRITICAL | Auth password/user delete, provisioning activate/bootstrap, payroll publish/release |
| HIGH | Migration execute, employee delete, payroll generate, workflow config |
| MEDIUM | Applicant/agency/document CRUD, schedule changes |
| LOW | Standard reference-data CRUD |

## PII and secrets

Never log passwords, tokens, hashes, or full record payloads. Use entity ids, counts, and redacted field diffs.

## Constants

Define strings in `config/constant.ts` under `config.ACTIVITY_LOG.<MODULE>` and `config.AUDIT_LOG`.

## Exclusions (noise)

Skip activity logging on progress polling (`*Progress`, `*progress/:jobId`), public/kiosk routes, and `status`/`docs` endpoints.

## Regenerating coverage report

```bash
cd hris-api && npx tsx scripts/generate-logging-audit.ts
```
