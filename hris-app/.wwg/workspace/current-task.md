# Current Task

## Status
done

## Summary
Confirm device-user CSV/package import job progress path (hris-app) + import conflict auto-resolve capabilities (hris-api) + getDeviceUserImportJob serialization.

## Category
docs-only (verification; no product code change this session)

## Packages
- bandai-infra/hris-app
- bandai-infra/hris-api
- Dual-app: **HR-only (no counterpart)** — admin device users Sync Center

## Verification results

### 1) UI import job progress path (hris-app) — COMPLETE
- `enroll.tsx`: `data-testid="device-user-import-job-progress"`, progress bar, weights stages, API `progressPercent` with client fallback
- `useDeviceUserImportJob`: polls every 2s until completed/failed
- `devices.service.ts` `DeviceUserImportJobResponse`: `progressPercent`, `progressWeights` typed
- Vitest: `device-user-ui-contract.test.ts` + `device-display-address.test.ts` — **7 passed**
- Playwright smoke: `admin-device-user-csv-import-job-progress.spec.ts` — **1 passed**

### 2) Import conflict handling (hris-api device.controller)
- `review_conflict` when hard conflict = **employeeNo** mismatch on existing vendorUserId
- Soft conflicts (**displayName**, **userType** only) auto-downgrade to `action: "match"` with `conflictFields: []` and `autoResolvedConflicts` populated
- Same employeeNo/vendorUserId can proceed as match and write biometrics (rawPackage / sdkPeerCopy); metadataOnly → `matched_metadata_only`
- **No** import body flags: `forceOverwrite`, `overwrite`, `resolveConflict`, `conflictStrategy`, `autoResolve`
- Execute body: `execute=true`, `confirmation`, `previewToken`, `targetDeviceId`, payload, `biometricTransferMode`, `runAsJob`/`jobMode`/`async`
- Note: `autoResolveDecisions` exists only on **merge** apply endpoints, not device-user import

### 3) getDeviceUserImportJob
- Uses `serializeDeviceUserPackageImportJob(job)` which always merges `buildDeviceUserPackageImportProgress` → `progressPercent`, `progressLabel`, `progressWeights` always present

## Code changes this session
none (truth already in code; verification only)

## Drift
NONE

## Dual-app
HR-only (no emp-app counterpart)
