# HR Manager LAN/Public Dashboard Repair - 2026-06-30

## Summary

Task mode: mixed regression repair and runtime verification.

Result: `hr-manager@seed.local` can log in and reach the HR Manager dashboard on
LAN and public PROD/DEV/UAT paths.

## Repair

- Fixed the shared role dashboard shell crash by defining `role` from the
  selected role dashboard config before passing it to dashboard cards.
- Rebuilt and restarted the VM `hris-app-local:develop` app containers for PROD,
  DEV, and UAT.
- Recreated the PROD API container so it picked up the public `bnpi-hris.tech`
  CORS origin list already present in repo config.
- Restarted the VM-side `cloudflared-bnpi-hris.service`.

## Evidence

- Browser proof:
  `.runtime/cloudflare-public-e2e/20260630-hr-manager-proof/hr-manager-browser-proof.json`
- Screenshots:
  `.runtime/browser-evidence/screenshots/lan-prod-hr-dashboard.png`
  `.runtime/browser-evidence/screenshots/lan-dev-hr-dashboard.png`
  `.runtime/browser-evidence/screenshots/lan-uat-hr-dashboard.png`
  `.runtime/browser-evidence/screenshots/public-prod-hr-dashboard.png`
  `.runtime/browser-evidence/screenshots/public-dev-hr-dashboard.png`
  `.runtime/browser-evidence/screenshots/public-uat-hr-dashboard.png`

Verified final pages:

- LAN PROD: `http://192.168.254.148:3000/dashboard`
- LAN DEV: `http://192.168.254.148:3100/dashboard`
- LAN UAT: `http://192.168.254.148:3200/dashboard`
- Public PROD: `https://bnpi-hris.tech/dashboard`
- Public DEV: `https://dev.bnpi-hris.tech/dashboard`
- Public UAT: `https://uat.bnpi-hris.tech/dashboard`

All six browser runs reached `/dashboard`, did not hit the error boundary, showed
HR dashboard content, and had zero captured CORS, `ERR_FAILED`, `ReferenceError`,
or `TypeError` console entries.

API routing observed:

- LAN PROD used `192.168.254.148:3001`.
- LAN DEV used `192.168.254.148:3101`.
- LAN UAT used `192.168.254.148:3201`.
- Public PROD used same-host `bnpi-hris.tech/api`.
- Public DEV used `dev-api.bnpi-hris.tech`.
- Public UAT used `uat-api.bnpi-hris.tech`.

## Tests

- `npm test -- app/components/dashboards/shared/role-dashboard-shell.test.tsx app/components/dashboards/shared/role-dashboard.config.test.ts app/lib/runtime-api-base.test.ts`
  passed: 3 files, 15 tests.

## Recommendation Capture

No new recommendations were identified.
