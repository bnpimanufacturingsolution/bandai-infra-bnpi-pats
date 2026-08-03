# Current Task

## Status
done

## Summary
Sync Center Device Users import: default `biometricTransferMode` to `rawPackage` when a loaded CSV contains FP1( fingerprint cells or long base64-looking face/fp blobs. Labels show "Package data (rawPackage)". React Query preview/execute mutations unchanged.

## Category
ui-ux

## Packages
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)** — Sync Center device import is admin-only

## Changes
- `app/routes/admin/devices/enroll.tsx` — `looksLikeCsvRawBiometricPackageText` + `inferDeviceUserImportBiometricTransferMode`; set mode on CSV file load and after preview when package has raw blobs; option/plan labels "Package data (rawPackage)"
- `app/routes/admin/devices/device-user-ui-contract.test.ts` — contract expectations for rawPackage default path and hooks
- `app/lib/hooks/useDevices.ts` — no code change (usePreviewDeviceUserImport / useExecuteDeviceUserImport already present; covered by contract test)

## Truth delta
YES (CONFIRMED) — Device-user CSV import with raw biometric cells defaults the UI transfer mode to `rawPackage` (package data write path) instead of `sdkPeerCopy`.

## Drift
NONE (docs updated via this task note; no broader project-truth rewrite required for admin-only default)

## Verification
- `npx vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` (from bandai-infra/hris-app) — pass
