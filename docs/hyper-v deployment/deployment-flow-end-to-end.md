# BNPI PATS — End-to-End Deployment Flow

One sequential path from "VHDX exists on a Windows host" to "all four public
hostnames serve the frontend and the API". Read top to bottom. Do not skip
ahead: each phase produces the input the next one needs.

| Phase | Where | Produces |
|---|---|---|
| **A** | Windows Hyper-V host | A running VM with an IP |
| **B** | Inside the VM | App on `:3000`, API on `:3001` |
| **C** | Windows host | Tunnel connector registered |
| **D** | Anywhere | Public domains verified |

Contract details (ports, ingress, evidence) are in
[`hyperv-deployment-runbook.md`](./hyperv-deployment-runbook.md).

> Never fetch the scripts from GitHub. That repository is public and tracks
> live credentials. Everything below comes from the private GCS release path.

---

## PHASE A — Windows Hyper-V host

> Administrator PowerShell. Run on the machine that physically holds the VHDX.

### A1. Authenticate and pull the tooling

```powershell
gcloud auth login
gcloud config set project bandai-pats-vhdx-artifacts

$release = 'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7'

# release tools (prepare / upload / deploy / download)
$dst = 'C:\bandai-bnpi-pats'
New-Item -ItemType Directory -Force -Path $dst | Out-Null
gcloud storage cp "$release/*" $dst

# Hyper-V import scripts. These must sit side by side in ONE directory because
# bnpi-pats-vm.ps1 resolves its siblings through $PSScriptRoot.
$repo = 'C:\src\bnpi-pats-scripts'
New-Item -ItemType Directory -Force -Path $repo | Out-Null
foreach ($s in 'bnpi-pats-vm.ps1','select-image.ps1','vhdx-autopilot.ps1','configure.ps1',
               'watch-until-healthy.ps1','normalize-image-acl.ps1',
               'verify-host-health.ps1','verify-lan-health.ps1') {
  gcloud storage cp "$release/$s" $repo
}
Get-ChildItem $repo -Filter '*.ps1' | Select-Object Name, Length
```

**Gate A1:** eight `.ps1` files listed.

### A2. Locate the VHDX

```powershell
Get-ChildItem C:\ -Recurse -Filter '*.vhdx' -File -ErrorAction SilentlyContinue |
  Select-Object FullName, @{N='GB';E={[math]::Round($_.Length/1GB,2)}}, LastWriteTime |
  Sort-Object LastWriteTime -Descending | Format-Table -AutoSize
```

Set it explicitly. Do not guess the name.

```powershell
$vhdx = 'C:\...\project-truth-node-local-hyperv-v7-current-state.vhdx'
Test-Path $vhdx
```

If a `.sha256` sidecar sits next to it, the import verifies the hash
automatically and refuses to continue on mismatch.

**Gate A2:** `Test-Path` returns `True`.

### A3. Inspect the switches

```powershell
Get-VMSwitch | Select-Object Name, SwitchType
```

**Gate A3:** at least one switch exists. Note whether any is `External`.

> If **no** `External` switch exists, use A4b. That is common on a laptop with
> only NAT/Internal switches, and it is not a blocker: the connector runs inside
> the VM, so the host does not need a bridged network for the tunnel.

### A4a. Import and start — host has an External switch

```powershell
& "$repo\bnpi-pats-vm.ps1" `
  -VhdxPath $vhdx `
  -VmName 'bnpi-pats' `
  -SwitchName '<the External switch name>' `
  -MemoryMb 6144
```

Do not pass `-WithPublic` (it starts a host-managed connector; see the runbook).
Do not pass `-Confirm` (the script does not declare `SupportsShouldProcess`).

### A4b. Import and start — no External switch

`bnpi-pats-vm.ps1` hardcodes `-RequireExternalSwitch`, so it aborts on such a
host. Call the autopilot directly and omit that flag; it then falls back to
`FallbackSwitch = "Default Switch"`.

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
```

**Gate A4:** output contains `Guest IP:` and a `DONE`/`imported` line.

### A5. Record the IP

```powershell
$ip = (Get-VMNetworkAdapter -VMName 'bnpi-pats' |
       Select-Object -ExpandProperty IPAddresses |
       Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notlike '169.254.*' } |
       Select-Object -First 1)
$ip
```

**Gate A5:** a real IPv4 address. Everything downstream uses this value.

### A6. Write the host configuration

Only needed for the A4a path; `bnpi-pats-vm.ps1` already did it. For A4b:

```powershell
& "$repo\configure.ps1" `
  -ConfigPath 'C:\ProgramData\BandaiApp\Bnpipats\config\project-truth.json' `
  -ImagePath $vhdx `
  -TargetPlatform hyperv `
  -VmName 'bnpi-pats' `
  -SwitchName 'Default Switch' `
  -VmPath 'C:\ProgramData\BandaiApp\Bnpipats\HyperV' `
  -CpuCount 2 -MemoryMb 6144 `
  -GuestIpHint $ip
```

### A7. Confirm SSH reachability before touching the app

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new `
  -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" `
  infra@$ip 'hostname; uptime'
```

If the key is not on this host, use a password prompt instead by dropping `-i`
and `-o BatchMode=yes`.

**Gate A7:** the VM answers. If not, fix this before Phase B.

---

## PHASE B — Inside the VM

> Everything in this phase runs **in the Linux VM**, not on Windows.
> The appliance commands are installed into the image by `provision.sh`.

### B1. Seed the database

```bash
project-truth-bnpi-pats-seed
```

Runs the `bnpi-pats-api-db-init` service: Prisma `db push` plus seed data, then
restarts the API. This creates the schema and the default appliance admin
(`admin@bandai.local` / `password123`).

### B2. Start the stack

```bash
project-truth-bnpi-pats-start
```

Brings up `bnpi-pats-app` (`:3000`), `bnpi-pats-api` (`:3001`) and
`bnpi-pats-postgres`.

To bring the other environments up in the same run:

```bash
project-truth-bnpi-pats-env-start dev
project-truth-bnpi-pats-env-start uat
```

### B3. Verify locally before exposing anything

```bash
ss -ltn | grep -E ':(3000|3001|3100|3101|3200|3201|22)\b'
curl -i  http://127.0.0.1:3001/health
curl -I  http://127.0.0.1:3000/
project-truth-bnpi-pats-status
```

**Gate B3:** `:3000` and `:3001` are listening, `/health` returns JSON, and `/`
returns HTML. A port missing here is the port whose public hostname will return
`502`.

### B4. Install the Cloudflare connector in the VM

The token is supplied through the environment and must never be committed.

```bash
export PROJECT_TRUTH_TUNNEL_TOKEN='<tunnel token>'
bash install-cloudflared-in-vm.sh
```

The script installs `cloudflared`, registers a systemd service, waits for the
`Registered tunnel connection` log line, then prints which of
`3000 3001 3100 3101 3200 3201 22` are listening.

```bash
systemctl is-enabled cloudflared
journalctl -u cloudflared -n 30 --no-pager
```

**Gate B4:** `CLOUDFLARED_IN_VM_DONE connected=1` and an `active` service.

Copy `install-cloudflared-in-vm.sh` onto the VM first if it is not present
there, for example:

```powershell
scp "$repo\..\..\scripts\install-cloudflared-in-vm.sh" "infra@$ip:/tmp/"
```

---

## PHASE C — Windows host, tunnel ingress

Return to the Windows host. The connector is now **inside the VM**, so the SSH
rule must target the VM itself rather than a fixed LAN address or a Windows
host.

```powershell
$env:CLOUDFLARE_CERT = "$env:USERPROFILE\.cloudflared\cert.pem"
& cloudflared tunnel info 12e89b6a-dabb-4897-9925-08ce9213b983
```

Confirm a connector is listed with a current timestamp. Then set:

```yaml
- hostname: ssh.bnpipats.tech
  service: ssh://localhost:22
```

All other ingress rules stay as documented in the runbook: API and
`/socket.io/.*` path rules first, then the per-host frontend catch-alls
(`3000`, `3100`, `3200`), with `http://` and a final `http_status:404`.

**Gate C:** `tunnel info` shows one or more live connectors. Before this point
every hostname returns `530`.

---

## PHASE D — Public verification

```powershell
foreach ($h in 'bnpipats.tech','www.bnpipats.tech','dev.bnpipats.tech','uat.bnpipats.tech') {
  $fe  = curl.exe -s -o NUL -w "%{http_code}|%{content_type}" "https://$h/auth/login"
  $api = curl.exe -s -o NUL -w "%{http_code}|%{content_type}" "https://$h/api/health"
  "{0,-22} FE={1,-28} API={2}" -f $h, $fe, $api
}
```

| Result | Meaning |
|---|---|
| `FE=200\|text/html` and `API=200\|application/json` | correct |
| `530` | no connector; return to Phase C |
| `502` | origin not listening; return to B3 |
| `FE` returns `application/json` | frontend route answered by an API; ingress is misrouted |

SSH:

```powershell
ssh project-truth-bnpi-pats
```

Cloudflare Access requires one interactive browser sign-in the first time. That
step cannot be automated.

---

## Flow summary

```text
A1 pull tooling (GCS)      ->  A2 find VHDX  ->  A3 switches
   ->  A4 import + start   ->  A5 IP  ->  A6 host config  ->  A7 SSH works
B1 seed  ->  B2 start  ->  B3 ports+health  ->  B4 cloudflared in VM
C  ingress ssh->localhost:22  +  connector registered
D  4 hostnames  +  ssh
```

## Current blockers

| Blocker | Where | Status |
|---|---|---|
| VHDX not yet located on the host | A2 | open |
| No External switch | A3 | handled by A4b |
| GitHub repository is public and tracks live secrets | — | separate security task, unrelated to this flow |
