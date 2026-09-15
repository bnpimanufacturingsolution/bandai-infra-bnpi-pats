# BNPI PATS Authentication & LMS/EPMR Integration Audit

**Audit date:** 2026-09-05  
**Mode:** Read-only codebase investigation  
**Scope:** `bnpi-pats-api`, `bnpi-pats-app`, and workspace-wide LMS/EPMR/SSO search  
**Production code modified:** No

## 1. Executive Summary

The current BNPI PATS can authenticate employees and administrators, expose an employee profile, enforce organization-scoped application access, and represent employment lifecycle states. Its local implementation is a JWT application-session system backed by the BNPI PATS `User` model and linked to `Employee`; it is not currently an OAuth 2.0, OpenID Connect, or SAML identity provider.

Local login accepts an email or employee ID, verifies a `bcryptjs` password hash, signs a 24-hour JWT, sets an HTTP-only `token` cookie, and returns the token in the JSON response. The frontend can also copy that token to `localStorage` and attach it as a bearer token. Logout clears the cookie and client storage but no token blacklist, version, revocation timestamp, refresh-token rotation, or server-side session invalidation was found.

The BNPI PATS therefore can be used immediately as an authentication front door for a controlled LMS bridge, but it should not directly issue an LMS/EPMR shared JWT from the current implementation. The lowest-disruption path is a server-side BNPI-PATS-to-LMS login bridge using a short-lived, one-time authorization artifact; LMS remains the existing token issuer for LMS/EPMR until a proper OIDC provider is introduced. A dedicated identity provider is the stronger long-term architecture if LMS, EPMR, BNPI PATS, and future applications need standards-based SSO.

The workspace contains no verified LMS or EPMR application implementation. Therefore the described LMS/EPMR JWT, shadow-user, JIT, role, and bridge contracts are **NOT VERIFIED IN THIS CODEBASE** and must be validated against those repositories before implementation.

## 2. Current BNPI PATS Authentication Architecture

There are two modes:

- **Local mode:** `config.idpEnabled` is false. BNPI PATS reads the local `User` record, verifies `password`, loads linked employee context, signs a JWT, sets a cookie, and returns the profile plus token.
- **External IDP mode:** `config.idpEnabled` is true. BNPI PATS forwards login, current-user, password, role, and user-management calls to `config.authBaseUrl`. This is an upstream auth-service adapter, not an BNPI PATS OIDC implementation.

Evidence:

- `bnpi-pats-api/config/config.ts:72-78` defines `IDP_ENABLED` and `AUTH_BASE_URL`.
- `bnpi-pats-api/app/auth/auth.controller.ts:994-1110` implements local/upstream login, password verification, JWT signing, cookie creation, and response.
- `bnpi-pats-api/app/auth/auth.router.ts:29-53` defines the BNPI PATS auth routes.
- `bnpi-pats-api/index.ts:544-545,727` mounts auth security middleware and the `/api/auth` router.

## 3. Authentication Flow

### Local browser login

```text
LoginForm
  -> AuthProvider.login(identifier, password, "bnpi-pats")
  -> authService.login()
  -> POST /api/auth/login
  -> resolveLocalLoginUserByIdentifier()
  -> bcryptjs.compare()
  -> loadLocalUserProfile()
  -> jwt.sign(buildLoginTokenPayload(), JWT_SECRET, { expiresIn: "24h" })
  -> Set-Cookie: token; JSON response also includes token
  -> AuthProvider stores user, optionally localStorage authToken, and userRole
  -> /auth/me refresh
```

Evidence:

| Step | Evidence |
|---|---|
| Frontend form | `bnpi-pats-app/app/components/organisms/LoginForm.tsx:25-57,76-122`; accepts `Employee ID or Email` and password. |
| Frontend auth state | `bnpi-pats-app/app/contexts/auth-provider.tsx:181-239`; calls login, stores role, refreshes `/auth/me`, and optionally stores token. |
| Frontend service | `bnpi-pats-app/app/services/auth-service.ts:21-35`; posts credentials to `/auth/login`. |
| Backend route | `bnpi-pats-api/app/auth/auth.router.ts:29-34`; exposes `POST /login`, `POST /logout`, and protected `GET /me`. |
| User lookup | `bnpi-pats-api/app/auth/auth.controller.ts:787-846`; email lookup uses `User.email`, with a person-contact email fallback; non-email identifier uses `Employee.employeeId` then linked `User.id`. |
| Password verification | `bnpi-pats-api/app/auth/auth.controller.ts:1050-1059`; `bcrypt.compare(password, localUser.password)`. |
| Active account check | `bnpi-pats-api/app/auth/auth.controller.ts:1061-1064`; non-active `User.status` receives 403. |
| Token creation | `bnpi-pats-api/app/auth/auth.controller.ts:1092-1096`; signs with `JWT_SECRET`, `expiresIn: "24h"`. |
| Cookie | `bnpi-pats-api/app/auth/auth.controller.ts:1096`; `res.cookie("token", token, buildAuthCookieOptions(req))`. |
| Cookie options | `bnpi-pats-api/helper/auth-cookie.helper.ts:22-38`; HTTP-only, 24-hour max age, secure on HTTPS non-local hosts, SameSite lax locally and none for secure cross-site requests. |
| Response | `bnpi-pats-api/app/auth/auth.controller.ts:1098-1100`; returns profile and `token` in JSON. |
| Current profile | `bnpi-pats-api/app/auth/auth.controller.ts:1431-1501`; local `/auth/me` reloads the local user and linked employee. |
| Redirect | `bnpi-pats-app/app/routes/auth/login.tsx:18-92`; routes by role, onboarding, or required password change. |

## 4. Identity Ownership

In local mode, the authentication identity is owned by `User`. Employee identity and employment context are owned by `Employee`, with personal data in `Person`.

The link is `Employee.userId -> User.id`; it is optional in the schema. `Person.userId` also exists, but the login implementation resolves the account through `Employee.userId` when logging in by employee ID or person contact email.

Evidence:

- `bnpi-pats-api/prisma/schema/user.prisma:5-24`: `User.id`, unique `userName`, unique `email`, optional `password`, `role`, `status`, `isDeleted`, optional `organizationId`, and JSON metadata.
- `bnpi-pats-api/prisma/schema/employee.prisma:75-91,157-164`: `Employee.organizationId`, `employeeId`, optional `userId`, `role`, employment fields, and unique `[organizationId, employeeId]`; `personId` is unique.
- `bnpi-pats-api/app/auth/auth.controller.ts:503-650`: `/auth/me` loads `User`, then finds `Employee` by `userId` and matching organization, then merges employee metadata.

## 5. User / Employee Data Model

| Concept | Verified fields | Evidence |
|---|---|---|
| User account | `id`, `userName`, `email`, `password`, `role`, `status`, `isDeleted`, `lastLogin`, `loginMethod`, `organizationId`, `metadata` | `bnpi-pats-api/prisma/schema/user.prisma:5-24` |
| Employee | `id`, `organizationId`, `employeeId`, `userId`, `role`, employment dates/status/type, department/section/position/level IDs, `reportToId`, `isManager`, `isHrManager`, `isDeleted` | `bnpi-pats-api/prisma/schema/employee.prisma:75-164` |
| Person | `id`, optional `organizationId`, optional `userId`, optional `employeeId`, `personalInfo`, `contactInfo`, identification, metadata, soft-delete state | `bnpi-pats-api/prisma/schema/person.prisma:58-83` |
| Personal data | first/middle/last name, date of birth, gender, nationality and related fields | `bnpi-pats-api/prisma/schema/person.prisma:17-29` |
| Contact data | email, phones, addresses | `bnpi-pats-api/prisma/schema/person.prisma:39-47` |
| Organization | `id`, name, unique code, branding, soft-delete state | `bnpi-pats-api/prisma/schema/organization.prisma:1-16` |
| Department | organization ID, unique organization/name and organization/code, active/deleted flags, manager ID | `bnpi-pats-api/prisma/schema/department.prisma:1-37` |
| Position | organization ID, title/code, active/deleted flags, manager flag | `bnpi-pats-api/prisma/schema/position.prisma:1-43` |

Findings:

- Email is unique on `User`, but employee contact email is stored inside JSON `Person.contactInfo`; the fallback lookup is not a database uniqueness constraint.
- Employee ID is unique only within an organization: `@@unique([organizationId, employeeId])`.
- One employee can have no account because `Employee.userId` is optional. The current create flow normally provisions an account and then updates the employee link.
- The current `User` schema has no relation field back to `Employee`; the linkage is represented on `Employee.userId` and duplicated in user metadata.
- Multiple accounts per employee are not explicitly prohibited by a schema constraint on `Employee.userId`; the create flow has application-level uniqueness checks. **NOT VERIFIED as impossible at database level.**

## 6. Token & Session Architecture

### JWT payload

`buildLoginTokenPayload()` creates only these application claims:

```text
userId
role
roleId
organizationId
metadata.employee.id
```

Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:748-760`.

The JWT library adds standard `iat` and `exp`; the middleware type declares those fields. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:21-35`.

Verified token configuration:

- Signing secret configuration name: `JWT_SECRET`; actual value intentionally not reported. Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:1086-1096`, `bnpi-pats-api/middleware/verifyToken.ts:180-195`.
- Algorithm: **NOT EXPLICITLY CONFIGURED** in the `jwt.sign` or `jwt.verify` calls; the jsonwebtoken library default is therefore used by the current code path.
- Expiration: 24 hours at issue. Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:1092-1096`.
- Issuer: **NOT VERIFIED IN CODEBASE**.
- Audience: **NOT VERIFIED IN CODEBASE**.
- Subject (`sub`): **NOT INCLUDED BY `buildLoginTokenPayload()`**.
- Refresh token: **NOT VERIFIED IN CODEBASE**.
- Rotation: **NOT VERIFIED IN CODEBASE**.
- JTI: **NOT VERIFIED IN CODEBASE**.

### Validation and lifecycle

- Extraction accepts the `token` cookie first, then `Authorization: Bearer ...`. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:68-77`.
- Verification calls `jwt.verify(token, JWT_SECRET)` and then loads the employee record. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:180-226`.
- Employee records with `isDeleted=false` are required for protected requests. Final/former employment states are blocked by `getEmployeeActionBlock`. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:203-247`.
- Logout calls `res.clearCookie()` and records audit activity. Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:1106-1131`.
- No blacklist, `tokenVersion`, `lastLogoutAt`, `revokedAt`, refresh-token store, or JTI revocation path was found in the auth source search. Existing Redis is used for cache/status/application infrastructure, not verified JWT revocation.
- A previously issued bearer token remains cryptographically valid until expiry unless the user is blocked by the employee lookup/action-block path. This means logout is not token revocation for copied bearer tokens.

## 7. Roles & Permissions

The verified local role catalog is:

- `bnpi-pats-hr-manager`
- `bnpi-pats-hr-user`
- `bnpi-pats-employee-manager`
- `bnpi-pats-employee`
- `bnpi-pats-admin`
- `admin`
- `super_admin`

Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:27-97`.

The employee create path derives role from organization structure rather than trusting client flags. Evidence: `bnpi-pats-api/app/employee/employee.controller.ts:3820-3865`; it derives role from department, level, and position, then persists the derived role and sends it to account creation at `bnpi-pats-api/app/employee/employee.controller.ts:3960-4008`.

The frontend contains role-to-scope mapping, but `hasPermission()` is currently a placeholder returning true for any authenticated user. Evidence: `bnpi-pats-app/app/contexts/auth-provider.tsx:75-84`. API authorization remains the meaningful security boundary; frontend role hiding is not sufficient.

A role mapping to LMS/EPMR is **NOT VERIFIED** because those codebases and role contracts are absent from this workspace. Do not automatically map BNPI PATS manager/admin roles to LMS/EPMR roles without an explicit target-system matrix.

## 8. Organization / Tenant Model

BNPI PATS has organization membership on `User`, `Employee`, `Person`, `Department`, and `Position`. Employee IDs and department/position names/codes are organization-scoped. Evidence: the schema files cited in Section 5.

The JWT carries `organizationId`; middleware copies it to the request and injects it into missing POST bodies. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:86-101,145-172`.

The `/auth/me` employee query constrains the linked employee to the local user's organization. Evidence: `bnpi-pats-api/app/auth/auth.controller.ts:540-548`.

Cross-organization account switching is **NOT VERIFIED**. The current local token contains one organization ID, and no organization-selection or multi-membership token flow was found.

The client may submit an organization ID, but middleware fills it only when absent; complete authorization behavior for every endpoint is not established by the auth middleware alone. Endpoint-specific tenant enforcement must be reviewed before exposing an integration API.

## 9. Employee Lifecycle

### New employee

The add-employee flow creates `Person` and `Employee` transactionally, derives the role, generates credentials, creates a local or upstream auth account, updates `Employee.userId`, and patches user metadata with employee context. Evidence: `bnpi-pats-api/app/employee/employee.controller.ts:3890-4025`; helper implementation at `bnpi-pats-api/helper/employee.helper.ts:1468-1580`.

The generated password is based on employee data via `buildBulkDefaultPassword()`. Evidence: `bnpi-pats-api/helper/employee.helper.ts:1488-1495`. This creates an onboarding credential risk if default credentials are delivered or retained without a forced change; the flow sets `requirePasswordChange` and `isFirstLogin` true.

### Transfer / promotion

Department, position, level, manager, and role changes are handled through employee update paths and role derivation. User metadata synchronization is best-effort. Evidence: `bnpi-pats-api/app/employee/employee.controller.ts:5180-5595`; `bnpi-pats-api/helper/employee.helper.ts:471-610`.

No verified LMS/EPMR outbound event, webhook, queue contract, or synchronization worker was found for these changes.

### Termination

Employment statuses include `ACTIVE`, `INACTIVE`, `TERMINATED`, `RESIGNED`, `FORMER_EMPLOYEE`, `RETIRED`, `ON_LEAVE`, and transitional statuses. Evidence: `bnpi-pats-api/prisma/schema/employee.prisma:5-17`.

Completion of a termination updates the employee to `TERMINATED`. Evidence: `bnpi-pats-api/app/termination/termination.controller.ts:1141-1242`.

Protected requests are blocked for final/former employment states by middleware. Evidence: `bnpi-pats-api/middleware/verifyToken.ts:203-247`.

The startup login guard also checks terminated/resigned users before login as a best-effort block. Evidence: `bnpi-pats-api/index.ts:547-575` and the surrounding login middleware.

There is no verified automatic LMS/EPMR deprovisioning or cross-system token revocation path.

## 10. Existing API & Integration Capabilities

Verified BNPI PATS endpoints relevant to an integration adapter:

| Method | Path | Auth | Verified behavior |
|---|---|---|---|
| POST | `/api/auth/login` | Public route, auth security middleware | Local or upstream login; email/employee ID plus password; sets cookie and returns profile/token. `bnpi-pats-api/app/auth/auth.router.ts:29`; controller `:994-1110`. |
| POST | `/api/auth/logout` | Route itself is not wrapped by `verifyToken` | Clears token cookie and writes audit activity; does not revoke copied bearer tokens. `bnpi-pats-api/app/auth/auth.router.ts:30`; controller `:1106-1131`. |
| GET | `/api/auth/me` | `verifyToken` | Returns user plus linked employee context. `bnpi-pats-api/app/auth/auth.router.ts:33`; controller `:1431-1501`. |
| PATCH | `/api/auth/change-password` | `verifyToken` | Changes local password or forwards to upstream IDP. `bnpi-pats-api/app/auth/auth.router.ts:31`; controller `:1160+`. |
| GET | `/api/employee` | Global auth middleware | Employee list with filters/pagination. `bnpi-pats-api/app/employee/employee.router.ts:300-329`. |
| GET | `/api/employee/:id` | Global auth middleware | Employee by database ID. `bnpi-pats-api/app/employee/employee.router.ts:150-184`. |
| POST/PATCH/DELETE | `/api/employee`, `/api/employee/:id` | Global auth middleware | Create/update/delete employee operations; not an external identity contract. `bnpi-pats-api/app/employee/employee.router.ts:330+`, `:587-630`. |
| GET/POST/PATCH/DELETE | `/api/auth/users...` | `verifyToken` plus selected access middleware | User administration. `bnpi-pats-api/app/auth/auth.router.ts:35-53`. |

An integration-specific `GET /employees/:id`, `GET /current-user`, `POST /auth/token`, `POST /auth/verify`, client-credentials grant, service account, or partner API contract is **NOT VERIFIED**. `/auth/me` and the protected employee APIs are not sufficient by themselves as a safe cross-application handoff protocol.

## 11. Existing SSO / OAuth / OIDC / SAML Capability

No OAuth 2.0, OIDC, SAML, JWKS, authorization endpoint, token endpoint, userinfo endpoint, discovery document, PKCE, state/nonce validation, or client registration implementation was found in the BNPI PATS source search.

The frontend has methods named `ssoLogin()` and `validateHandoffToken()`, but they post to `/auth/login` and `/auth/validate`. Evidence: `bnpi-pats-app/app/services/auth-service.ts:38-57,112-132`. The backend auth router has no `/validate` route. Evidence: complete route list `bnpi-pats-api/app/auth/auth.router.ts:29-53`; workspace search found no backend `/validate` implementation.

Conclusion: **No OAuth/OIDC/SAML implementation found.** The existing `ssoLogin`/handoff client surface is incomplete or stale relative to the backend and must not be treated as an implemented SSO protocol.

## 12. LMS Compatibility

The actual LMS source code is not present in the inspected workspace. The existing LMS JWT issuer, external handoff, JIT provisioning, role requirements, token validation, and shadow-user model are therefore **NOT VERIFIED IN CODEBASE**.

Against the supplied integration context only:

- BNPI PATS can authenticate an employee and provide an employee profile.
- BNPI PATS can provide a stable BNPI PATS user ID, employee database ID, employee ID, organization ID, role, status, name, email, department, position, and hire date where populated.
- BNPI PATS cannot currently provide a standards-based authorization-code/OIDC response.
- BNPI PATS should not expose its 24-hour application JWT as a shared LMS trust token without an explicit token-exchange design.

## 13. EPMR Compatibility

The actual EPMR source code is not present in the inspected workspace. EPMR JWT validation, shadow-user schema, role requirements, provisioning, and deprovisioning are **NOT VERIFIED IN CODEBASE**.

Based on the supplied context, EPMR should continue receiving identity through LMS during the first integration phase. EPMR should not independently trust a browser-carried BNPI PATS JWT unless its validator, issuer, audience, key distribution, and revocation behavior are redesigned and proven.

## 14. Identity Mapping

Recommended cross-system identity precedence:

1. A future immutable central identity ID, if introduced by the identity layer.
2. Current BNPI PATS `User.id` as the authentication-account identifier.
3. Current BNPI PATS `Employee.id` as the BNPI PATS employee-record identifier.
4. `Employee.employeeId` as the human/business identifier, scoped by `organizationId`.
5. Email only as a mutable login/contact attribute, never as the sole foreign key.

For the current bridge, send and persist both:

```text
bnpiPatsUserId       = User.id
bnpiPatsEmployeeId   = Employee.id
employeeNumber   = Employee.employeeId
organizationId   = Employee.organizationId
```

Do not use email as the stable foreign key. `Employee.employeeId` is only unique within an organization. Evidence: `bnpi-pats-api/prisma/schema/employee.prisma:75-91,157-164`; `bnpi-pats-api/prisma/schema/user.prisma:5-24`.

## 15. Security Findings

| ID | Finding | Evidence / risk |
|---|---|---|
| F1 | JWT is returned in JSON and optionally stored in browser `localStorage`. | `bnpi-pats-api/app/auth/auth.controller.ts:1098-1100`; `bnpi-pats-app/app/contexts/auth-provider.tsx:196-224`; `bnpi-pats-app/app/lib/api-client.ts:145-156,413-440`. XSS or browser extension compromise can expose the bearer token. |
| F2 | Logout is cookie clearing, not bearer-token revocation. | `bnpi-pats-api/app/auth/auth.controller.ts:1106-1131`; no revocation fields/path found. A copied token can remain valid for up to 24 hours, subject to employee action blocking. |
| F3 | JWT issuer/audience/algorithm constraints are not explicitly configured. | `bnpi-pats-api/app/auth/auth.controller.ts:1092-1096`; `bnpi-pats-api/middleware/verifyToken.ts:180-190`. This weakens cross-system trust and makes direct LMS validation inappropriate. |
| F4 | No refresh-token rotation or JTI revocation was verified. | Auth source search and token implementation. Long-lived access JWT is used instead. |
| F5 | Frontend `hasPermission()` returns true for any authenticated user. | `bnpi-pats-app/app/contexts/auth-provider.tsx:75-84`. Frontend permission state cannot be used for LMS/EPMR authorization. |
| F6 | Employee contact-email fallback is application-level JSON scanning. | `bnpi-pats-api/app/auth/auth.controller.ts:803-822`. It lacks the `User.email` uniqueness guarantee and may be ambiguous. |
| F7 | Default password generation is data-derived and account creation forces a first-login change. | `bnpi-pats-api/helper/employee.helper.ts:1468-1495`; `:1540-1575`. Verify delivery, exposure, expiration, and brute-force controls before using it for external SSO onboarding. |
| F8 | Security documentation conflicts with the login implementation. | `bnpi-pats-api/docs/SECURITY.md:52-65` claims Argon2 and comprehensive session handling; actual login uses `bcryptjs` and stateless JWT. Treat the documentation claim as `STALE/CONFLICTING`. |
| F9 | Rate limiting is configured through auth security middleware, but effective production values and deployment configuration were not fully verified in this audit. | Middleware mounted at `bnpi-pats-api/index.ts:544-545`; `bnpi-pats-api/docs/SECURITY.md:10-31` is documentation, not proof of live configuration. `NEEDS_CONFIRMATION`. |
| F10 | CORS allows an explicit origin list plus LAN patterns and credentials. | `bnpi-pats-api/config/config.ts:11-64`; `bnpi-pats-api/index.ts:468-474`. Cross-site cookie integration requires exact origin, HTTPS, SameSite, and CSRF review. |

## 16. Integration Gaps

| Requirement | Current BNPI PATS | LMS requirement | EPMR requirement | Gap / solution |
|---|---|---|---|---|
| Authentication | Local bcrypt password plus JWT cookie/bearer | Existing LMS login/JWT issuer per supplied context | Consumes LMS JWT per supplied context | Use a server-side BNPI PATS login bridge first; do not share BNPI PATS JWT directly. |
| Employee ID | `Employee.employeeId`, org-scoped | External employee ID field assumed from context | Shadow-user external ID assumed | Persist BNPI PATS user ID, employee record ID, employee number, and org ID; validate target names. |
| Email | Unique `User.email`; person contact email JSON | Profile/login attribute | Profile/shadow attribute | Use for display/login only, not identity key. |
| Organization | `organizationId` on token and records | Target tenant/org contract unknown | Target tenant/org contract unknown | Establish explicit allow-list and tenant mapping. |
| Roles | Single `User.role` plus derived `Employee.role`; frontend scope mapping | LMS subrole requirement unknown | EPMR subrole requirement unknown | Create an explicit mapping table and enforce on server. |
| Token expiration | 24-hour JWT | LMS token lifetime/issuer unknown | LMS validation contract unknown | Bridge artifact should be one-time and minutes-lived; target LMS issues normal session JWT. |
| Logout/revocation | Cookie clear; no token blacklist | LMS logout behavior unknown | EPMR logout behavior unknown | Add revocation/session strategy to bridge and coordinate LMS logout. |
| Provisioning | Employee creation provisions a local/upstream BNPI PATS account | JIT assumed from context | Shadow user assumed from context | LMS adapter should upsert by immutable BNPI PATS identity. |
| Termination | BNPI PATS status/action block; no external push | Needs deprovisioning | Needs deprovisioning | Add outbound lifecycle sync or scheduled reconciliation; revoke LMS/EPMR sessions. |
| SSO | No OIDC/SAML | Existing custom handoff | Existing LMS bridge | Small bridge now; OIDC later. |

## 17. Architecture Options

### Option A: BNPI PATS -> LMS external handoff

**Fit:** Best immediate compatibility if the existing LMS handoff can accept a server-to-server request and one-time artifact.

**Required changes:** BNPI PATS endpoint that authenticates the current BNPI PATS session and creates a short-lived, audience-bound, one-time handoff; LMS endpoint that consumes it server-to-server; JIT upsert by BNPI PATS identity; no JWT in URL.

**Assessment:** Recommended first phase, with LMS remaining token issuer. Existing LMS/EPMR bridge remains intact.

### Option B: BNPI PATS login -> LMS login bridge

**Fit:** Also feasible now. LMS redirects the user to BNPI PATS; BNPI PATS authenticates; BNPI PATS redirects back with a one-time code; LMS exchanges the code server-to-server and issues its existing JWT.

**Assessment:** Recommended browser flow for the first implementation. It minimizes changes to BNPI PATS and preserves the LMS/EPMR trust boundary.

### Option C: BNPI PATS as OIDC provider

**Fit:** Not feasible without an architectural addition. Current BNPI PATS has no discovery document, authorization endpoint, token endpoint, JWKS, client registry, PKCE/state/nonce implementation, or standards-compliant claims contract.

**Assessment:** Do not implement by adapting the current application JWT. Build or adopt a real OIDC provider instead.

### Option D: Dedicated identity provider

**Fit:** Strongest long-term option for BNPI PATS, LMS, EPMR, and future applications.

**Assessment:** Justified when more applications, MFA, central session revocation, user lifecycle provisioning, and standards-based federation are required. It is a larger change and should be phased rather than blocking the first LMS integration.

## 18. Recommended Architecture

```text
Employee
  |
  v
LMS login request
  |
  v
LMS redirects to BNPI PATS authorization bridge
  |
  v
BNPI PATS authenticates local User or configured upstream IDP
  |
  | one-time, short-lived, audience-bound code
  v
LMS backend exchanges code over server-to-server TLS
  |
  | validates BNPI PATS identity, organization, employment status, mapped access
  v
LMS provisions/updates its user and issues its normal LMS JWT
  |
  v
EPMR consumes the existing LMS trust boundary
```

This is Option B implemented with an Option A-style server-side exchange. It preserves the current LMS/EPMR architecture, avoids exposing BNPI PATS credentials to LMS/EPMR, avoids sending bearer JWTs through URLs, and keeps authorization decisions explicit in the LMS adapter.

BNPI PATS should remain authoritative for employee identity and employment status. LMS should remain the application-session/token issuer until a dedicated OIDC layer is adopted. EPMR should remain downstream of LMS during migration.

## 19. Recommended Authentication Flow

1. Employee selects LMS.
2. LMS creates a random `state` and redirects to an BNPI PATS bridge URL.
3. BNPI PATS authenticates the existing BNPI PATS session, or presents the BNPI PATS login.
4. BNPI PATS verifies active account, linked employee, organization, and allowed LMS access.
5. BNPI PATS creates a one-time authorization code stored server-side or in a short-lived encrypted store. The code contains no password and is not a JWT access token.
6. BNPI PATS redirects to a pre-registered LMS callback with `code` and `state` only.
7. LMS backend exchanges the code directly with BNPI PATS over TLS.
8. BNPI PATS returns a normalized identity record with `bnpiPatsUserId`, `bnpiPatsEmployeeRecordId`, `employeeNumber`, `organizationId`, employment status, profile fields, and mapped application entitlements.
9. LMS upserts its user by immutable BNPI PATS identity, then issues its own normal LMS session/JWT.
10. LMS/EPMR use their existing internal bridge.
11. Logout clears LMS/EPMR sessions and invokes BNPI PATS/session revocation coordination when supported; until revocation exists, the bridge must use short-lived one-time codes and LMS must re-check BNPI PATS status on login and at a bounded session interval.

## 20. Required BNPI PATS Changes

### Small modification

- Add a dedicated integration authorization/start endpoint and callback/code exchange endpoint.
- Add registered LMS client configuration: client ID, exact redirect URI, allowed organization(s), and signing/encryption configuration.
- Add a normalized, minimal identity response with immutable IDs and employment status.
- Add explicit LMS access entitlement rather than inferring it solely from a broad BNPI PATS role.
- Add audit records for authorization start, code issuance, exchange, denial, and revocation.

### Security hardening required before production

- Stop returning access JWTs to browser JavaScript where cookie-only mode is possible.
- Add issuer, audience, explicit algorithm, and key rotation policy to any token used cross-system.
- Add server-side session/token revocation or a token-version check for BNPI PATS sessions.
- Add CSRF protection for cookie-authenticated state-changing endpoints.
- Add exact redirect URI, state, nonce/PKCE-equivalent protections appropriate to the bridge.
- Confirm rate limiting and brute-force behavior from executable middleware/config, not documentation.

### Architectural change, if standards-based federation is required

Adopt a real OIDC provider or dedicated identity provider rather than turning the existing `/auth/login` JWT into an OIDC substitute.

## 21. Required LMS Changes

The exact LMS repository was not available, so these are integration requirements, not verified source findings:

- Add a backend-only BNPI PATS code exchange client.
- Register exact BNPI PATS callback and client credentials/keys.
- Map BNPI PATS immutable identity to the LMS external identity field.
- JIT create/update users and apply an explicit BNPI-PATS-to-LMS role/entitlement map.
- Reconcile organization and employment status on every login and periodically.
- Issue the existing LMS session/JWT only after successful exchange.
- Remove URL JWT transport from the new path; preserve old path only during migration with telemetry and expiry.
- Add logout/session revocation behavior and deny terminated/inactive BNPI PATS identities.

## 22. Required EPMR Changes

The exact EPMR repository was not available, so these are integration requirements, not verified source findings:

- Continue validating the LMS-issued identity during phase one.
- Ensure EPMR shadow users are keyed by the LMS/BNPI PATS immutable external identity, not email alone.
- Consume role/entitlement decisions from LMS; do not independently trust browser-supplied BNPI PATS claims.
- Add deprovisioning/update handling for LMS status changes.
- Remove or time-bound any legacy URL token bridge.

## 23. Migration / Rollout Strategy

1. Inventory and confirm LMS/EPMR contracts, especially external ID, tenant, roles, JWT validation, and logout.
2. Add BNPI PATS identity export/read contract and integration audit events without changing normal BNPI PATS login.
3. Build a non-production LMS bridge using one-time codes and a small test organization.
4. Run dual-path identity matching by BNPI PATS user ID and employee record ID; report collisions and unmapped roles.
5. Enable JIT LMS provisioning for a pilot group; keep existing LMS login available as rollback.
6. Add scheduled reconciliation for new, updated, transferred, inactive, and terminated employees.
7. Prove logout, terminated-user denial, organization isolation, replay rejection, expired-code rejection, redirect-state rejection, and role mapping.
8. Expand by organization or cohort, then retire the legacy URL JWT handoff after evidence shows no active clients.
9. Reassess a dedicated OIDC provider when another application requires the same federation contract.

## 24. Risks & Considerations

- Current 24-hour bearer tokens make logout and immediate deprovisioning weaker than the desired architecture.
- `User.email` and `Person.contactInfo.email` can diverge; identity matching must use database IDs.
- Employee account linkage is optional and duplicated in metadata, so reconciliation must detect orphaned or mismatched links.
- BNPI PATS role names describe BNPI PATS authorization and should not be copied blindly into LMS/EPMR subroles.
- Organization IDs are present in the JWT, but target-system tenant enforcement is unknown and must be tested at the boundary.
- The frontend exposes an incomplete handoff client (`/auth/validate`) that has no verified backend route; this is a compatibility hazard.
- Security documentation claims Argon2 and session management that the current login path does not implement; operational/security review must use code, not that document.
- The exact LMS/EPMR implementations are absent from this workspace; final API and claim compatibility remains `NEEDS_CONFIRMATION`.

## 25. Final Conclusion

**Can BNPI PATS become the authoritative employee identity/authentication source?** Yes, for employee identity and employment status, and as the authentication authority for a controlled bridge. The current BNPI PATS already owns local user credentials, employee linkage, organization membership, roles, and employment status.

**Can the current BNPI PATS directly serve as the LMS/EPMR OIDC identity provider?** No. No OAuth/OIDC/SAML implementation was found, and the current JWT is an internal 24-hour application token with no explicit issuer/audience contract or verified revocation mechanism.

**Recommended practical architecture:** BNPI PATS authenticates the employee; a backend-only, one-time BNPI-PATS-to-LMS authorization-code bridge transfers a minimal identity assertion; LMS provisions/updates the user and issues its existing LMS JWT; EPMR continues consuming LMS identity. Add a dedicated OIDC provider later when federation requirements justify the change.

This provides single employee identity without duplicating credentials in LMS/EPMR, preserves existing LMS/EPMR compatibility, supports lifecycle reconciliation, and limits the BNPI PATS changes to a focused integration surface plus security hardening.

## 26. Source File Index

### BNPI PATS API

- `bnpi-pats-api/app/auth/auth.controller.ts`: local/IDP login, profile loading, token payload, logout, `/me`, password behavior.
- `bnpi-pats-api/app/auth/auth.router.ts`: auth route definitions.
- `bnpi-pats-api/middleware/verifyToken.ts`: token extraction, JWT verification, employee status/action block, request context.
- `bnpi-pats-api/helper/auth-cookie.helper.ts`: cookie security attributes and lifetime.
- `bnpi-pats-api/config/config.ts`: `IDP_ENABLED`, `AUTH_BASE_URL`, CORS allow-list and credentials configuration.
- `bnpi-pats-api/index.ts`: middleware order, auth security middleware, login guard, route mounting.
- `bnpi-pats-api/helper/employee.helper.ts`: account creation, credential generation, employee metadata synchronization.
- `bnpi-pats-api/app/employee/employee.controller.ts`: employee creation/update/account-linking lifecycle.
- `bnpi-pats-api/app/employee/employee.router.ts`: employee API routes.
- `bnpi-pats-api/app/termination/termination.controller.ts`: termination completion and status update.
- `bnpi-pats-api/prisma/schema/user.prisma`: authentication account model.
- `bnpi-pats-api/prisma/schema/employee.prisma`: employee identity, employment, organization, and account link.
- `bnpi-pats-api/prisma/schema/person.prisma`: personal/contact data and person link.
- `bnpi-pats-api/prisma/schema/organization.prisma`: organization model.
- `bnpi-pats-api/prisma/schema/department.prisma`: department and organization constraints.
- `bnpi-pats-api/prisma/schema/position.prisma`: position and organization constraints.
- `bnpi-pats-api/docs/SECURITY.md`: documentation claim that conflicts with the current auth implementation.

### BNPI PATS frontend

- `bnpi-pats-app/app/components/organisms/LoginForm.tsx`: login form and identifier fields.
- `bnpi-pats-app/app/contexts/auth-provider.tsx`: login, logout, token storage, role/scope checks, current-user refresh.
- `bnpi-pats-app/app/services/auth-service.ts`: login, logout, `/auth/me`, stale handoff client methods.
- `bnpi-pats-app/app/lib/api-client.ts`: credentials inclusion and optional localStorage bearer attachment.
- `bnpi-pats-app/app/routes/auth/login.tsx`: role/onboarding/password-change redirects.
- `bnpi-pats-app/app/guards/auth-guard.tsx`: authenticated route guard; role/scope checks are partly commented in the redirect effect.

### LMS/EPMR search result

- No verified LMS or EPMR application source, schema, auth bridge, or API implementation was found in the inspected workspace. Existing search hits are unrelated documentation/observability text or BNPI PATS client naming and are not evidence of an LMS/EPMR implementation.
