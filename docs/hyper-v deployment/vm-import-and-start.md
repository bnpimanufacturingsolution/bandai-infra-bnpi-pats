# VM Import and Start — Command Sequence

Runnable commands to take a verified VHDX and produce a running BNPI PATS VM on
a Windows Hyper-V host, followed by the connector and public-domain checks.

The port contract, ingress contract, and evidence tables live in
[`hyperv-deployment-runbook.md`](./hyperv-deployment-runbook.md). This document
is only the command sequence.

> All Hyper-V commands require **Administrator PowerShell**.

---

## Prerequisites

| Requirement | Check |
|---|---|
| VHDX present with `.sha256` sidecar | `Get-ChildItem C:\ -Recurse -Filter '*.vhdx' -File` |
| A Hyper-V switch exists | `Get-VMSwitch \| Select-Object Name, SwitchType` |
| `gcloud` authenticated | `gcloud auth list` |
| Cloudflare Access sign-in | one interactive browser step, later |

### Do not clone the GitHub repository

`https://github.com/bnpimanufacturingsolution/bandai-infra-bnpi-pats` is
currently **public** and tracks live secrets, including
`appliance/env/bnpi-pats-api.env` with a real `JWT_SECRET` and Postgres
credentials, plus `appliance/.env`. `.gitignore` has no `.env` rule.

Until that repository is set to private and the exposed secrets are rotated,
do not fetch from it. The VM import scripts are distributed through the private
GCS release path instead, which is the method used below.

Only eight scripts are needed, and they are published flat in the release path
because `bnpi-pats-vm.ps1` resolves its siblings through `$PSScriptRoot` and
they must sit side by side in one directory.

---

## 1. Full sequence

```powershell
# ---- 0. gcloud + release package -------------------------------------
gcloud auth login
gcloud config set project bandai-pats-vhdx-artifacts

$dst = 'C:\bandai-bnpi-pats'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
gcloud storage cp 'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7/*' $dst

# ---- 1. VM import scripts (private GCS, not GitHub) ------------------
# bnpi-pats-vm.ps1 and its siblings must share one directory because it
# resolves them through $PSScriptRoot.
$repo = 'C:\src\bandai-pats-scripts'
New-Item -ItemType Directory -Force -Path $repo | Out-Null
$release = 'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7'
$vmScripts = @(
  'bnpi-pats-vm.ps1','select-image.ps1','vhdx-autopilot.ps1','configure.ps1',
  'watch-until-healthy.ps1','normalize-image-acl.ps1',
  'verify-host-health.ps1','verify-lan-health.ps1'
)
foreach ($s in $vmScripts) { gcloud storage cp "$release/$s" $repo }
Get-ChildItem $repo -Filter '*.ps1' | Select-Object Name, Length

# ---- 2. pre-flight ---------------------------------------------------
Get-VMSwitch | Select-Object Name, SwitchType

# ---- 3. locate the VHDX ---------------------------------------------
$vhdx = (Get-ChildItem C:\ -Recurse -Filter '*.vhdx' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like '*current-state*' } | Select-Object -First 1).FullName
if (-not $vhdx) { throw 'VHDX not found' }
$vhdx

# ---- 4. import + start ----------------------------------------------
#    Do NOT pass -WithPublic  (see "Why not -WithPublic" below)
#    Do NOT pass -Confirm      (the script does not declare SupportsShouldProcess)
& "$repo\bnpi-pats-vm.ps1" `
  -VhdxPath $vhdx `
  -VmName 'bnpi-pats' `
  -SwitchName 'Default Switch' `
  -MemoryMb 6144

# ---- 5. result -------------------------------------------------------
Get-VM -Name 'bnpi-pats' | Select-Object Name, State
Get-VMNetworkAdapter -VMName 'bnpi-pats' | Select-Object IPAddresses
```

Expected tail of a successful run:

```text
SHA256 verified: <64 hex chars>
Direct Hyper-V import: vm=bnpi-pats switch=Default Switch mem=6144MB cpu=2
Guest IP: <address>
Writing direct Hyper-V host configuration
DONE. New VM: bnpi-pats @ <address>
LAN PROD: http://<address>:3000/auth/login + http://<address>:3001/health
```

---

## 2. Fallback when no External switch exists

`scripts/bnpi-pats-vm.ps1` hardcodes `-RequireExternalSwitch` when it calls
`vhdx-autopilot.ps1`, so it aborts on a host that only has an Internal or NAT
switch:

```text
Stop-Blocker: No external Hyper-V switch found and no active physical adapter is available.
```

Call the autopilot directly. It has `FallbackSwitch = "Default Switch"` and
only enforces an external switch when the flag is present, so omitting the flag
allows the fallback:

```powershell
& "$repo\vhdx-autopilot.ps1" `
  -Mode Import `
  -VhdxPath $vhdx `
  -VmName 'bnpi-pats' `
  -PreferredSwitch 'Default Switch' `
  -CpuCount 2 `
  -StartupMemoryGB 6 `
  -MinimumMemoryGB 3 `
  -MaximumMemoryGB 8 `
  -Start

Get-VM -Name 'bnpi-pats' | Select-Object Name, State
Get-VMNetworkAdapter -VMName 'bnpi-pats' | Select-Object IPAddresses
```

If an External switch does exist, pass its real name to step 4 instead of
`Default Switch` so the strict path succeeds.

---

## 3. Command corrections on record

Three mistakes were made and corrected in this sequence. They are recorded here
so they are not reintroduced.

| Mistake | Symptom | Correction |
|---|---|---|
| `& "$repo\bnpi-pats-vm.ps1"` | `The term is not recognized` | Point at the directory that actually holds the scripts |
| `-Confirm:$false` | `A parameter cannot be found that matches parameter name 'Confirm'` | `bnpi-pats-vm.ps1` declares no `[CmdletBinding()]` and no `SupportsShouldProcess`, so `-Confirm` does not exist. Remove it |
| `git clone` from the GitHub repository | Silent secret exposure | The repository is public and tracks live credentials. Pull the eight scripts from the private GCS release path instead |

---

## 4. Why not `-WithPublic`

`-WithPublic` makes `bnpi-pats-vm.ps1` invoke
`ensure-bnpi-cloudflare-host.ps1 -ProvisionDns -StartTunnel -VerifyPublic`,
which starts a **host-managed** connector on the Windows host.

`AGENTS.md` requires the tunnel to be **VM-managed**:

> The running Project Truth server depends on the VM-managed named Cloudflare
> Tunnel for public BNPI PATS and for `ssh project-truth-bnpi-pats`.

A host-managed connector resolves the ingress `localhost:<port>` against
whatever application happens to hold that port on the Windows host. That is
exactly how an unrelated application was published on `bnpipats.tech` and
`ssh.bnpipats.tech` pointed at a Windows `sshd` instead of the VM.

Therefore: **import and start without `-WithPublic`**, then install the
connector inside the VM.

---

## 5. After the VM has an IP

With the guest IP in hand:

```bash
# inside the VM
project-truth-bnpi-pats-seed      # schema + seed data
project-truth-bnpi-pats-start     # app :3000, api :3001
```

Then install the connector **in the VM**:

```bash
# inside the VM
PROJECT_TRUTH_TUNNEL_TOKEN='<token>' bash install-cloudflared-in-vm.sh
```

That script installs `cloudflared`, registers it as a systemd service, waits
for the `Registered tunnel connection` log line, and then reports which of
`3000 3001 3100 3101 3200 3201 22` are listening so any remaining `502` is
immediately attributable to a missing port.

Finally, because the connector is now VM-managed, the SSH ingress rule must
point at the VM itself:

```yaml
- hostname: ssh.bnpipats.tech
  service: ssh://localhost:22
```

Verify with the command block in
[`hyperv-deployment-runbook.md`](./hyperv-deployment-runbook.md#7-verification).

---

## Related

| Document | Purpose |
|---|---|
| `hyperv-deployment-runbook.md` | Ports, ingress, DNS, verification, evidence |
| `hyperv-vm-from-vhdx.md` | Generic Hyper-V VM creation from a VHDX |
| `hyperV-image.md` | Building the image |
| `../step-by-step.md` | GCS to VM sequence |
