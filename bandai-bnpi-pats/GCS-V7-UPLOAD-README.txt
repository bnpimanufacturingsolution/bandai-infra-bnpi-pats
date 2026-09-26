PROJECT TRUTH V7 GCS RELEASE STAGING

This folder is the single staging/upload package.

STEP 1 â€” On the machine that contains the V7 VHDX, run:

  powershell -NoProfile -ExecutionPolicy Bypass -File .\prepare-project-truth-v7-staging.ps1

The preparation script searches these locations:

  C:\ProgramData\BandaiApp\Bnpipats\images
  C:\ProgramData\BandaiApp\Bnpipats
  C:\ProgramData\ProjectTruth\images
  C:\ProgramData\ProjectTruth

It copies into this same bandai-bnpi-pats folder:

  project-truth-node-local-hyperv-v7-current-state.vhdx
  project-truth-node-local-hyperv-v7-current-state.vhdx.sha256
  project-truth-hyperv-v7-manifest.json
  README-HYPERV-EXPORT.txt
  Import-ProjectTruthHyperV.ps1
  download-project-truth-vhdx.ps1
  download-project-truth-vhdx.ps1.sha256
  upload-project-truth-v7-to-gcs.ps1
  prepare-project-truth-v7-staging.ps1
  prepare-project-truth-v7-staging.ps1.sha256
  GCS-V7-UPLOAD-README.txt
  step-up.md
  STAGING-MANIFEST.json

STEP 2 â€” After STAGING_V7_READY is displayed, run:

  powershell -NoProfile -ExecutionPolicy Bypass -File .\upload-project-truth-v7-to-gcs.ps1

The upload destination is exactly:

  gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7/

The upload script uses an allowlist. It does not upload V5/proven VHDX files, .env files, tunnel credentials, or SSH private keys.
