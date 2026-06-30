# Cloudflare Public E2E Verification - 2026-06-30

## Summary

Task mode: mixed bug fix and runtime verification.

Result: PROD, DEV, and UAT public Cloudflare HRIS paths are verified end to
end through the VM-side named tunnel path.

## Findings And Repair

- DEV and UAT frontend bundles were using stale public API-base behavior. The
  appliance DEV/UAT app build config now lets runtime hostname resolution pick
  `dev-api.bnpi-hris.tech` and `uat-api.bnpi-hris.tech`.
- Missing static assets now return non-cacheable 404 responses from the HRIS app
  server instead of cached SPA HTML.
- DEV and UAT browser login initially failed because
  `/api/system-provisioning/status` returned 200/204 without CORS headers for
  `https://dev.bnpi-hris.tech` and `https://uat.bnpi-hris.tech`.
- The API CORS contract now includes the public `bnpi-hris.tech` PROD, DEV, and
  UAT app origins, and the appliance API env file carries the same origins.

## Evidence

- Public CORS after repair:
  `.runtime/cloudflare-public-e2e/20260630-090346/cors-provisioning-status-after-repair.jsonl`
- Browser proof:
  `.runtime/cloudflare-public-e2e/20260630-090346/browser-proof-playwright.json`
- Dashboard DB counts:
  `.runtime/cloudflare-public-e2e/20260630-090346/dashboard-db-counts.jsonl`
- Screenshots:
  `.runtime/browser-evidence/screenshots/prod-dashboard.png`
  `.runtime/browser-evidence/screenshots/dev-dashboard.png`
  `.runtime/browser-evidence/screenshots/uat-dashboard.png`

Browser results:

- PROD: `https://bnpi-hris.tech/admin/dashboard`, `/auth/me` 200,
  `/dashboard/overview` 200, expected same-host `/api` path used.
- DEV: `https://dev.bnpi-hris.tech/admin/dashboard`, `/auth/me` 200,
  `/dashboard/overview` 200, expected `https://dev-api.bnpi-hris.tech/api` path
  used.
- UAT: `https://uat.bnpi-hris.tech/admin/dashboard`, `/auth/me` 200,
  `/dashboard/overview` 200, expected `https://uat-api.bnpi-hris.tech/api` path
  used.

Dashboard DB counts:

- PROD: employees 7, active 7, departments 25, positions 29, new hires 0.
- DEV: employees 2217, active 2053, departments 12, positions 22, new hires 5.
- UAT: employees 7, active 7, departments 25, positions 29, new hires 0.

Runtime state:

- VM Docker app/API containers for PROD, DEV, and UAT were healthy.
- `cloudflared-bnpi-hris.service` was active on the VM.
- K3s node was Ready.
- Argo CD applications for prod/dev/uat runtime and app paths were
  Synced/Healthy.

## Tests

- `npx tsx node_modules/mocha/bin/mocha --no-config tests/cors-origin.contract.spec.ts`
  passed: 4 tests.
- `npm test -- app/lib/runtime-api-base.test.ts --runInBand` passed: 6 tests.
- A broader mis-invoked API `npm test` run executed the whole suite; the new CORS
  tests passed, but unrelated existing DB/controller/tax failures remained.

## Truth Synchronization

- Project truth updated: yes, to record 2026-06-30 public browser/CORS evidence
  and current VM-side connector evidence.
- Terminology updated: no terminology changes.
- Governance updated: yes, recommendation registry received a proposed public
  CORS/browser smoke regression item.
- Drift status: low after repair. Existing WWG validation blockers remain
  unrelated generated-report contract issues.

