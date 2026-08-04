# Host template blob packages recovered — 2026-08-03

Status: HOST_TEMPLATES_INSTALLED_FROM_VM_TMP_RECOVERY.

## Problem

Product docs pointed at 	emplates/hikvision-five-device-sdk-packages/ for five/six
device-user export packages with raw fingerprint/face blobs. On the Project Truth
VM and local checkout, that directory was missing. July-28 final accepted package
files (874 users) were also missing under .runtime/.

What remained on the VM was:

`	ext
/tmp/sync-export-blobs/
`

containing real-blob exports for Main Entrance A/B/D/E/F (865 users each).

## Action

1. Recovered /tmp/sync-export-blobs into durable host path
   /opt/project-truth/templates/hikvision-five-device-sdk-packages/
2. Projected six import-ready 7-column CSVs (project-truth.hikvision-device-users.v1)
3. Copied the same tree to local workstation
   andai-infra/templates/hikvision-five-device-sdk-packages/
4. Updated docs/00-product/hikvision-five-device-sdk-export-packages.md

## Six templates

1. main-a-device-users.csv
2. main-b-device-users.csv
3. main-d-device-users.csv
4. main-e-device-users.csv
5. main-f-device-users.csv
6. unique-richest-device-users.csv

Import mode remains awPackage only. Biometric blobs stay gitignored.

## Residual

- Physical import still requires a compatible blank/target device.
- July-28 874-user final packages remain historical docs only until re-exported.
- Prefer Main E / unique-richest for densest face custody when importing later.
