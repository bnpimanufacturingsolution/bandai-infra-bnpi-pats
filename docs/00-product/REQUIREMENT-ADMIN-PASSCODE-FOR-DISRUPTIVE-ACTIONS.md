# Requirement: Admin Passcode Confirmation for Disruptive Actions

- Status: `CONFIRMED_OPERATOR_REQUIREMENT` (2026-08-25) — **documented only, NOT implemented**
- Owner: Operator (BNPI)
- Applies to: HRIS admin surfaces (`hris-api` + `hris-app` `/admin/**`, plus any other role surface that performs destructive/validation-worthy actions)

## Requirement statement

All disruptive (destructive / high-impact / validation-worthy) admin tasks and
actions must ask the acting admin for their personal passcode before the action
executes. The passcode substitutes for two-factor authentication (2FA) on
these confirmations.

Each admin has their own passcode:

- A passcode belongs to exactly one admin user account (`User`).
- One admin's passcode must never authorize another admin's action.
- The passcode is verified server-side against the acting (authenticated)
  admin's stored passcode before any destructive mutation runs.

## Why

- Destructive admin operations currently rely on session auth alone. A stolen,
  idle, or shared browser session could trigger irreversible damage (deletes,
  resets, payroll generation, device fleet writes).
- A per-admin passcode adds an identity-bound second factor at the moment of
  danger, without deploying SMS/email/TOTP infrastructure.

## Scope: what counts as disruptive

An action is disruptive when any of these is true:

1. It deletes, overwrites, resets, or irreversibly mutates business data
   (examples: employee hard delete, device events reset, data cleanups).
2. It writes to physical devices at fleet or multi-record scale
   (examples: device merge write-back, biometric copy-to-all, clock sync execute).
3. It changes money outcomes (payroll generate/regenerate, period lock/close,
   mass-upload apply).
4. It changes security/configuration posture (user roles, org config,
   integration credentials).

Non-disruptive reads, previews, dry-runs (`execute=false`), list views, and
exports stay exempt. Preview/dry-run remains mandatory first per the Real
Endpoint Dry-Run Rule; the passcode gates the transition from preview to real
execute.

Exact per-endpoint classification will be enumerated at implementation time
and tracked as an appendix in this file. Until then, when unsure whether an
action is disruptive, treat it as disruptive (`NEEDS_CONFIRMATION` default-on).

## UX contract (intended)

- Disruptive confirm UI shows what will be affected (scope, counts) and asks
  for the acting admin's passcode in one step before enabling Execute.
- Wrong passcode = action never starts; failure is auditable, not silent.
- API rejects destructive calls lacking a valid passcode even if called
  directly (server-side enforcement, not UI-only).

## Security requirements (intended)

- Passcodes are stored hashed (never plaintext) and are unique per admin.
- Verification endpoint/rule is rate-limited; repeated failures are logged to
  audit trail with actor, target, timestamp.
- Passcode management (set/change/reset) is itself an authenticated,
  self-service-only flow; admins cannot view another admin's passcode.
- Reset path must be defined (operator-assisted reset is acceptable initial
  answer) before rollout.

## Open questions (NEEDS_CONFIRMATION)

- Exact inventory of endpoints/actions classified disruptive (to be appended
  here during implementation planning).
- Passcode format rules (length, digits vs alphanumeric, expiry, reuse limits).
- Whether HR-manager-role destructive actions (not just `/admin`) are in scope
  from day one.
- Session-level caching: re-prompt per action vs short verification window
  (e.g., N minutes) — default plan is per-action prompt.
- Where reset lives (self-service email? operator-assisted?).

## Implementation status

| Item | Status |
|---|---|
| Requirement documented | DONE (this file, 2026-08-25) |
| Endpoint/action classification | NOT STARTED |
| Schema/storage (hashed per-admin passcode) | NOT STARTED |
| Server-side enforcement on destructive routes | NOT STARTED |
| Confirm-passcode UI component | NOT STARTED |
| Audit logging of passcode-gated attempts | NOT STARTED |
| Rate limiting | NOT STARTED |

No code, schema, or behavior has changed for this requirement yet.
