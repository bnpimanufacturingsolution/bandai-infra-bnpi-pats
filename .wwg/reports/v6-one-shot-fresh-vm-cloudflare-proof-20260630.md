# V6 One-Shot Fresh VM Cloudflare Proof - 2026-06-30

## Summary

Task mode: mixed infrastructure/runtime drift repair and V6 one-shot tooling.

Result: FULFILLED WITH WARNINGS.

The V6 one-shot command now exists and was proven against the current alternate
Project Truth VM target. The VM pulled `develop`, imported the stable host-side
Cloudflare named tunnel credential at runtime, enabled the VM-side
`cloudflared-bnpi-pats.service`, restored BNPI PATS Compose app/API runtime from
existing local images, and passed LAN/public PROD/DEV/UAT health, CORS, and HR
manager browser login proof.

Packaging conclusion: V6 should keep the V2 one-click extracted-zip shape. The
small zip should contain only the installer command/script and instructions; the
large VHDX and sidecars should remain in the public storage bucket; the
Cloudflare tunnel credential must be supplied from ProgramData at runtime and
must not be added to the zip, image, repo, or bucket objects.

Update after packaging pass: a V2-style V6 tiny package was generated locally
and published to GCS. It uses the current V5 latest base image and then runs the
V6 runtime proof after import/start. It does not contain a VHDX or Cloudflare
credential.

- Local zip:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\project-truth-hyperv-one-click-installer-v6.zip`
- Zip SHA-256:
  `a3bef4c92211f13d408e213ecf09f16ab619f0310221622f154893aa5a1a24c6`
- Public zip:
  `https://storage.googleapis.com/project-truth-image-export-bnpi-pats-492904-161377059311/public/project-truth/hyperv/v6/latest/project-truth-hyperv-one-click-installer-v6.zip`
- Publish evidence:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\v6-gcs-publish.json`
- Public URL verification:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\v6-public-url-verify.json`
- Cleanup evidence:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\gcs-staging-cleanup.json`

## Target

- VM name: `project-truth-local-vhdx-proof`
- VM LAN IP: `192.168.254.148`
- Switch: `ProjectTruth-External`
- SSH user: `infra`
- Branch: `develop`
- Pulled commit recorded by ansible-pull:
  `0e0301f6c54a7a07afce59a7cbe36338cccdd42c`

## Command Created

- Wrapper: `project-truth-v6-one-shot.cmd`
- CLI subcommand: `.\scripts\project-truth.ps1 v6-one-shot -GuestIp <ip>`
- Implementation: `scripts/project-truth-v6-one-shot.ps1`

The command resolves `GuestIp` from explicit input, `PROJECT_TRUTH_GUEST_IP`,
Project Truth config, then Hyper-V adapter discovery.

## V2 Installer Reference

Reference folder:

- `.runtime\gcp-v2-format`

Reference files:

- `ProjectTruth-Install-HyperV-v2.cmd`
- `ProjectTruth-Install-HyperV-v2.ps1`
- `Download-ProjectTruthHyperV.ps1`
- `Import-ProjectTruthHyperV.ps1`
- `README-v2.txt`

Accepted V6 packaging behavior:

1. User extracts a small zip.
2. User double-clicks the installer `.cmd`.
3. The `.cmd` keeps the console open and delegates to PowerShell.
4. The PowerShell script self-elevates when needed.
5. The script downloads/resumes the VHDX and sidecars from the public bucket.
6. The script verifies SHA-256 before Hyper-V import.
7. The script imports/starts the VM.
8. The script then runs the V6 one-shot runtime proof against the imported VM.

V6 must not create a second competing operator journey. It should feel like V2
with the added Cloudflare credential import/proof phase.

## Credential Handling

- Host credential source:
  `C:\ProgramData\ProjectTruth\secrets\cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json`
- VM credential target:
  `/etc/cloudflared/e3486f00-f974-46d3-9e11-911266749d00.json`
- Tunnel name: `bnpi-pats`
- Tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Secret handling proof: the script validates expected JSON fields without
  printing `TunnelSecret`, copies the file to `/tmp`, runs the VM helper, removes
  the temporary copy, and leaves root-only VM runtime state.

No credential JSON was committed to git.

## Script And Config Changes

- Added V6 tired-human `.cmd` wrapper.
- Added `v6-one-shot` to the Project Truth CLI dispatcher.
- Added V6 PowerShell orchestration with evidence output under
  `.runtime\v6-one-shot\<timestamp>`.
- Updated ansible-pull to install `project-truth-cloudflare-vm-tunnel`.
- Updated ansible-pull wrapper to skip the retired/stale `vendor/zkteco-sdk`
  submodule during pull.
- Hardened remote shell execution in `gitops-pull` and `verify-gitops-state`
  by staging LF-normalized scripts on the VM.
- Documented the V6 one-shot in the Cloudflare named tunnel runbook.

## Runtime Sync

Evidence:

- `.runtime\v6-one-shot\20260630-112256\03-ansible-pull.txt`
- `.runtime\v6-one-shot\20260630-112256\09-vm-pull-status.txt`

Status:

- `project-truth-ansible-pull.timer`: enabled and active/waiting.
- ansible-pull status recorded `develop@0e0301f6c54a7a07afce59a7cbe36338cccdd42c`.
- The V6 run staged the fixed wrapper/helper before ansible-pull.

Warning: the recurring timer later retried the old GitHub `develop` wrapper and
hit the stale ZKTeco submodule until this patch is committed and pushed.

## Cloudflare VM Tunnel

Evidence:

- `.runtime\v6-one-shot\20260630-112256\04-cloudflare-vm-tunnel.txt`
- `.runtime\v6-one-shot\20260630-112256\07-vm-runtime-state.txt`

Status:

- `cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate`:
  PASS.
- `cloudflared-bnpi-pats.service`: enabled and active.
- Public Grafana through VM-side Cloudflare: PASS.

## LAN And Public Network Proof

Evidence:

- `.runtime\v6-one-shot\20260630-112256\08-network-validation.json`
- `.runtime\v6-one-shot\20260630-112256\v6-one-shot-result.json`

LAN health:

- `http://192.168.254.148:3000/health`: PASS
- `http://192.168.254.148:3001/health`: PASS
- `http://192.168.254.148:3100/health`: PASS
- `http://192.168.254.148:3101/health`: PASS
- `http://192.168.254.148:3200/health`: PASS
- `http://192.168.254.148:3201/health`: PASS

LAN CORS for `system-provisioning/status`:

- PROD origin `http://192.168.254.148:3000`: PASS, HTTP 204
- DEV origin `http://192.168.254.148:3100`: PASS, HTTP 204
- UAT origin `http://192.168.254.148:3200`: PASS, HTTP 204

Public health:

- `https://bnpi-pats.tech/auth/login`: PASS
- `https://api.bnpi-pats.tech/health`: PASS
- `https://dev.bnpi-pats.tech/auth/login`: PASS
- `https://dev-api.bnpi-pats.tech/health`: PASS
- `https://uat.bnpi-pats.tech/auth/login`: PASS
- `https://uat-api.bnpi-pats.tech/health`: PASS
- `https://grafana.bnpi-pats.tech/api/health`: PASS

Public CORS for `system-provisioning/status`:

- PROD `https://bnpi-pats.tech/api/system-provisioning/status`: PASS, HTTP 204
- DEV `https://dev-api.bnpi-pats.tech/api/system-provisioning/status`: PASS, HTTP 204
- UAT `https://uat-api.bnpi-pats.tech/api/system-provisioning/status`: PASS, HTTP 204

## Browser Proof

`agent-browser` was attempted first with stable Chrome flags, then
`agent-browser doctor --fix`, `agent-browser install`, and explicit `--args`.
It still failed with `DevToolsActivePort`, so Playwright fallback was used.

Evidence:

- `.runtime\browser-evidence\v6-one-shot-20260630\browser-proof.json`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\lan-prod-dashboard.png`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\lan-dev-dashboard.png`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\lan-uat-dashboard.png`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\public-prod-dashboard.png`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\public-dev-dashboard.png`
- `.runtime\browser-evidence\v6-one-shot-20260630\screenshots\public-uat-dashboard.png`

HR manager credential used:

- `hr-manager@seed.local`

Results:

- LAN PROD final URL `/dashboard`: PASS
- LAN DEV final URL `/dashboard`: PASS
- LAN UAT final URL `/dashboard`: PASS
- Public PROD final URL `/dashboard`: PASS
- Public DEV final URL `/dashboard`: PASS
- Public UAT final URL `/dashboard`: PASS

Browser acceptance notes:

- No "Something went wrong" was present.
- No CORS, `ERR_FAILED`, `ReferenceError`, or `TypeError` console entries were
  recorded.
- DEV produced non-blocking `400 action metrics` console errors for missing
  employee context.
- Some `auth/me` and Cloudflare RUM requests were `ERR_ABORTED` during
  navigation/teardown; dashboard proof still passed.

## GitOps And Kubernetes

Evidence:

- `.runtime\v6-one-shot\20260630-112256\10-gitops-pull.txt`
- `.runtime\v6-one-shot\20260630-112256\11-verify-gitops-state.txt`

Status:

- `gitops-pull`: PASS after script hardening.
- `verify-gitops-state -RequireRuntimeApplications`: PASS for rendered overlays
  and required Argo Application existence.
- K3s node: Ready.
- Argo Applications reported `Synced/Healthy`.

Warning: many K3s pods were `Pending`, `Evicted`, `Completed`, or
`ContainerStatusUnknown` under resource pressure. The serving BNPI PATS runtime for
this proof is Compose app/API containers plus Docker Postgres, not healthy K3s
pods.

## Validation Performed

- `git diff --check`: PASS
- PowerShell parse checks for changed scripts: PASS
- `.\scripts\tests\bnpi-cloudflare-config.test.ps1`: PASS
- `.\scripts\project-truth.ps1 test-self-heal-contract`: PASS, 149 checks
- V6 one-shot clean run: PASS
- `.\scripts\project-truth.ps1 vm-pull -GuestIp 192.168.254.148 -Status`: PASS
  after local SSH config repair
- `.\scripts\project-truth.ps1 gitops-pull -GuestIp 192.168.254.148`: PASS
- `.\scripts\project-truth.ps1 verify-gitops-state -GuestIp 192.168.254.148 -RequireRuntimeApplications`: PASS
- Playwright LAN/public browser proof: PASS

Not run to completion:

- `watch-until-healthy`: not used as final gate because the existing command
  includes host-local `127.0.0.1` checks, while this task's finish line is
  VM/LAN/public Cloudflare proof. The V6 one-shot network validation is the
  authoritative proof for this pass.

## Warnings And Remaining Drift

- The ansible-pull submodule fix must be committed and pushed to `develop`;
  otherwise the VM timer can revert to the stale wrapper and fail on
  `vendor/zkteco-sdk`.
- The VM needed Hyper-V dynamic memory maximum raised from 3 GB to 6 GB during
  the build/import pass; final memory tuning should be reviewed.
- K3s runtime pods are not currently the serving health source despite Argo
  reporting Applications Healthy.
- The V6 proof used the existing proof VM as the alternate target; no old VM
  should be shut down solely from this report unless this target is accepted as
  the replacement runtime.
- Browser proof used Playwright fallback because `agent-browser` could not
  launch Chrome headlessly on this host after documented recovery attempts.

## Old VM Shutdown Assessment

Do not turn off any older VM solely from this report unless
`project-truth-local-vhdx-proof` is explicitly selected as the replacement. This
proof shows the current VM can serve LAN and public BNPI PATS after V6 repair, but
K3s resource drift remains and should be reviewed before decommissioning another
known-good runtime.

## Recommendation Capture

New recommendation recorded:

- `REC-20260630-007: Reconcile K3s Runtime Health With Serving Runtime`
- `REC-20260630-008: Package V6 As V2-Style One-Click Zip`

## WWG Truth Synchronization

- Task mode: Mixed infrastructure/runtime/package artifact synchronization.
- New truth detected: YES
- Wiki updated: YES
- Workspace updated: YES
- Governance review completed: YES
- Drift status: MEDIUM
- Canonical files changed:
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/workspace/current-task.md`
  - `.wwg/governance/recommendation-registry.md`
  - `docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md`
- Implementation discoveries synced:
  - V6 should preserve the V2/V5 tiny one-click zip flow and add runtime
    Cloudflare credential import/proof after Hyper-V import/start.
  - The V6 package published on 2026-06-30 is tiny, public, and contains no
    VHDX or Cloudflare credential.
  - Current public/LAN serving health is Docker Compose plus VM-side
    Cloudflare; K3s pods remain resource-constrained.
- Remaining stale context:
  - Browser-rendered SSH still needs Cloudflare Access browser proof.
  - The current V6 package uses the V5 latest base VHDX plus V6 runtime proof;
    a separately published V6 VHDX sidecar set remains future work.
  - Existing WWG generated reports outside this task still have truth-sync
    contract validation findings.
