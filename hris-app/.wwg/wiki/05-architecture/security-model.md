# Security Model

Status: INFERRED_FROM_EXISTING_PROJECT
Sensitivity: HIGH for auth, authorization, employee data, payroll, billing, attendance, timesheets, credentials, and deployment.

## Authentication

The frontend auth context supports:

- Login with credentials.
- SSO login.
- Logout.
- Current-user hydration.
- Password updates.
- Handoff-token validation.
- Deactivated-account handling through auth service responses and browser events.

The app includes cookie/session behavior through credentialed API requests. Optional localStorage token behavior is only enabled when `VITE_AUTH_TOKEN_STORAGE_ENABLED=true`.

## Authorization

Observed role names include:

- `super_admin`
- `admin`
- `hris-admin`
- `hris-hr-manager`
- `hris-hr-user`
- `hris-employee-manager`
- `hris-employee`
- `hris-timekeeper`

Observed scope names include:

- SYSTEM
- ORGANIZATION
- APP

Observed role redirect behavior:

- Admin, HRIS admin, and super admin route to `/admin/dashboard`.
- HR manager, HR user, employee, and employee manager route to `/dashboard`.
- Timekeeper routes to `/time-logging`.

## Role Derivation

Role derivation logic maps HR department membership and manager-level titles into HR manager, HR user, employee manager, or employee roles.

Observed HR department names:

- HR
- HUMAN RESOURCES

Observed manager levels:

- Director
- Senior Manager
- Manager
- Lead

Observed non-manager levels:

- Senior
- Mid
- Junior
- Entry

## Data Sensitivity

The following data must be treated as sensitive:

- Employee personal data and emergency contacts.
- Employment status, employment type, salary, pay frequency, and payroll records.
- Attendance records, timesheets, corrections, leave, and schedule history.
- Job applications, documents, uploaded files, onboarding records, and request attachments.
- Audit logs, activity logs, device enrollment data, and facial-recognition/biometric-related integrations.
- Firebase service-account material and deployment secrets.

## Known Security Gaps To Confirm

- Final permission matrix is not canonical.
- Frontend route guarding is visible, but backend enforcement is outside this repository.
- Some permission helper behavior appears incomplete or placeholder-like and must not be treated as production authorization proof.
- Firebase service-account JSON files are present and tracked in the Git index by filename. Contents were not inspected. The tracked keys should be treated as exposed until the project owner confirms rotation/removal.
- Public routes, job application flows, onboarding status, and document viewer behavior need privacy review.

## Firebase Credential Triage

Date: 2026-05-15

- CONFIRMED: `firebase/hris-workforce-uat-20260416-firebase-adminsdk-fbsvc-ee4f65cccc.json` is tracked in the Git index.
- CONFIRMED: `firebase/scripts/hris-workforce-dev-20260416-firebase-adminsdk-fbsvc-5bc96d313b.json` is tracked in the Git index.
- CONFIRMED: GitHub Firebase hosting workflows no longer read fallback service-account JSON files from the repository; workflows require GitHub secrets instead.
- CONFIRMED: `.gitignore` now ignores future Firebase admin SDK and service-account JSON files.
- NEEDS_CONFIRMATION: Whether the existing tracked service-account keys have already been revoked/rotated.
- NEEDS_CONFIRMATION: Approval to remove tracked JSON files from the repository and coordinate key rotation.

## Agent Handling Rules

- Do not inspect or paste secret file contents unless explicitly directed by the user through a safe secret-review process.
- Do not run deployment, deletion, migration, or credential-sync commands without explicit approval.
- Do not weaken auth, authorization, employee data, payroll, billing, attendance, or timesheet checks without documenting risk and adding appropriate tests.
