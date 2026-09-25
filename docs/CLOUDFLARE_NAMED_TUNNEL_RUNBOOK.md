# Cloudflare Named Tunnel Runbook

## Current Public Access Model

Project Truth public access uses the named Cloudflare Tunnel `bnpi-pats`.

```text
Bootstrap or repair:
  Windows host cloudflared
  -> cloudflared-bnpi-pats.yml
  -> Hyper-V VM LAN IP
  -> BNPI PATS app/API/dev/uat/employee/Grafana ports
  -> bnpipats.tech public hostnames

Preferred BNPI runtime:
  Linux VM cloudflared
  -> localhost app/API/dev/uat/employee/Grafana/SSH services
  -> bnpipats.tech public hostnames
```

Current tunnel:

```text
Name: bnpi-pats
ID: 12e89b6a-dabb-4897-9925-08ce9213b983
Config: cloudflared-bnpi-pats.yml
Current connectors: Windows host scheduled task and optional VM-side systemd
```

The Windows host remains the canonical bootstrap owner for fresh imports. The wrapper discovers the
running VM LAN IP, rewrites `cloudflared-bnpi-pats.yml`, starts one named tunnel
connector, and writes evidence under `.runtime/cloudflare-named-tunnel`.

The current proof VM can also run the same named tunnel inside Linux after the
credential is imported as root-only runtime state. That VM-side connector targets
`localhost` services, including `ssh://localhost:22`, and does not require
router port forwarding, Windows hosts-file changes, or Windows network changes.

## Host-Managed Startup

Use this after a fresh VM import, reboot, LAN config change, DNS drift, or public access drift:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -ProvisionDns -VerifyPublic
```

The wrapper:

- starts `project-truth-local-vhdx-proof` if needed,
- discovers the VM LAN IP,
- verifies the production app origin,
- rewrites `cloudflared-bnpi-pats.yml`,
- optionally provisions the public DNS routes, including `ssh.bnpipats.tech`,
- stops conflicting `cloudflared` named tunnel processes,
- starts the `bnpi-pats` tunnel,
- optionally verifies public URLs.

To check a Windows host before running or exporting the appliance setup:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host
```

To repair DNS routes and start the tunnel from one command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

## Public URLs

```text
https://bnpipats.tech/auth/login
https://www.bnpipats.tech/auth/login
https://app.bnpipats.tech/auth/login
https://api.bnpipats.tech/health
https://emp.bnpipats.tech/auth/login
https://dev.bnpipats.tech/auth/login
https://dev-api.bnpipats.tech/health
https://dev-emp.bnpipats.tech/auth/login
https://uat.bnpipats.tech/auth/login
https://uat-api.bnpipats.tech/health
https://uat-emp.bnpipats.tech/auth/login
https://grafana.bnpipats.tech/api/health
```

Same-host API routing is also expected:

```text
https://bnpipats.tech/api/*
```

## Postgres Through Cloudflare Access TCP

Project Truth can publish Postgres TCP hostnames through the named tunnel, but
normal Cloudflare Access TCP still requires a client-side `cloudflared` process.
It does not create a raw public Postgres socket that database tools can open
directly at `db.bnpipats.tech:5432`.

Current DB Access TCP hostnames:

```text
PROD  db.bnpipats.tech     -> tcp://<VM>:15432
DEV   dev-db.bnpipats.tech -> tcp://<VM>:15433
UAT   uat-db.bnpipats.tech -> tcp://<VM>:15434
```

On each client workstation, start the local forwards:

```powershell
cloudflared access tcp --hostname db.bnpipats.tech --url localhost:55432
cloudflared access tcp --hostname dev-db.bnpipats.tech --url localhost:55433
cloudflared access tcp --hostname uat-db.bnpipats.tech --url localhost:55434
```

Then use these local database URLs:

```text
PROD  postgresql://postgres:postgres@localhost:55432/bnpi_pats
DEV   postgresql://postgres:postgres@localhost:55433/bnpi_pats
UAT   postgresql://postgres:postgres@localhost:55434/bnpi_pats
```

Project Truth also provides a small Windows helper that starts the same stable
ports and falls back only when one is already occupied:

```powershell
.\scripts\project-truth.ps1 start-bnpi-db-access -Environment prod
```

To start all three deployed database forwards at once:

```powershell
.\scripts\project-truth.ps1 start-bnpi-db-access -Environment all
```

It prints the exact `DATABASE_URL` to use and stores the background
`cloudflared` PID under `.runtime\cloudflare-db-tcp`.

### Local `bnpi-pats-api` DEV via SSH `-L` (2026-07-20)

When the Windows workstation cannot reach VM LAN `10.184.37.19` but
`ssh project-truth-bnpi-pats` works through Cloudflare Access, prefer:

```powershell
.\scripts\start-k8s-dev-db-access.ps1 -LocalPort 55435
```

Behavior (updated 2026-07-20):

1. Reuse `127.0.0.1:55435` only if **Postgres wire** answers (not TCP alone).
2. Prefer SSH forward to K3s DEV ClusterIP `10.43.130.9:5432`.
3. If that remote target refuses, **fall back** to compose DEV on the VM:
   `127.0.0.1:15433` (local Prisma URL remains `postgresql://postgres:postgres@127.0.0.1:55435/bnpi_pats`).

Operator bootstrap log for a full remote Windows workstation (key, cloudflared,
SSH alias, `npm run dev` skips): `docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md`.

The URL the user requested:

```text
postgresql://postgres:postgres@db.bnpipats.tech:5432/bnpi_pats
```

is only valid if the client is on Cloudflare WARP private routing, Cloudflare
Spectrum/raw TCP, or another direct TCP path. With normal Access TCP, use the
local URL after starting `cloudflared access tcp`.

## Fresh Or Final Images

Fresh VM images should not contain Cloudflare tunnel credentials. The repeatable
host-managed setup is:

1. Boot/import the fresh Project Truth VM.
2. Let the VM obtain a LAN IP.
3. From the Windows host, run:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -ProvisionDns -VerifyPublic
```

This model works on another Windows host only after that host has:

- `cloudflared` installed,
- access to the Cloudflare account that owns `bnpipats.tech`,
- the named tunnel credentials installed under the operator's `.cloudflared`
  profile, or a deliberate credential import step,
- network reachability to the VM LAN IP.

If the target host does not yet have Cloudflare account trust, run:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -Login
```

This starts the browser login for the Cloudflare tunnel-management certificate.
The named tunnel credential JSON is still secret material and must be imported
securely or recreated out-of-band. Do not put it in the repo or appliance image.

## VM-Managed Runtime Connector

A VM-managed tunnel can be cleaner for appliance portability because cloudflared
runs inside the VM, opens only outbound Cloudflare Tunnel connections, and
targets localhost services:

```yaml
ingress:
  - hostname: bnpipats.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: bnpipats.tech
    service: http://localhost:3000
  - hostname: api.bnpipats.tech
    service: http://localhost:3001
  - hostname: emp.bnpipats.tech
    service: http://localhost:3300
  - hostname: grafana.bnpipats.tech
    service: http://localhost:53000
```

To install it on a running VM, copy the named tunnel credential JSON to a
temporary VM path, then run:

```bash
sudo project-truth-cloudflare-vm-tunnel /tmp/12e89b6a-dabb-4897-9925-08ce9213b983.json
rm -f /tmp/12e89b6a-dabb-4897-9925-08ce9213b983.json
```

The script writes:

```text
/etc/cloudflared/12e89b6a-dabb-4897-9925-08ce9213b983.json
/etc/cloudflared/config.yml
/etc/systemd/system/cloudflared-bnpi-pats.service
```

Do not run this during image baking. Fresh/final images must still avoid baked
tunnel credentials. Import the credential only as a deliberate runtime setup
step on the target VM.

## Clean Remote Admin Journey

The preferred BNPI deployment shape is:

```text
BNPI Windows Server:
  no inbound ports
  no SSH setup
  no .ssh/config
  Hyper-V host only

BNPI Linux VM:
  runs cloudflared-bnpi-pats.service on boot
  exposes localhost:22 through ssh.bnpipats.tech

Remote admin:
  opens https://ssh.bnpipats.tech
  signs in with Cloudflare Access
  uses the browser-rendered SSH terminal
```

This keeps the client Windows Server out of the public SSH path. The only
required outbound dependency is that the Linux VM can reach Cloudflare to keep
the named tunnel connected.

## Browser SSH Access

Browser SSH is the default remote-admin journey for unprepared or temporary
computers. It avoids installing `cloudflared`, editing `.ssh/config`, or copying
the Project Truth SSH key to every machine an admin might use.

Required state:

1. `ssh.bnpipats.tech` is a published SSH application route on tunnel
   `bnpi-pats`.
2. The route service is `localhost:22` when the connector runs inside the VM.
3. A Cloudflare Access self-hosted application protects
   `ssh.bnpipats.tech`.
4. Browser rendering is enabled for the SSH application.
5. The Access policy allows only approved admin identities.
6. The Linux VM has an SSH username compatible with the Access identity mapping
   required by Cloudflare browser-rendered SSH.

Cloudflare dashboard path:

```text
Zero Trust -> Networks -> Tunnels -> bnpi-pats -> Routes
  Add/confirm published application: ssh.bnpipats.tech
  Service: SSH / localhost:22

Zero Trust -> Access controls -> Applications
  Configure ssh.bnpipats.tech
  Enable browser-based SSH sessions
  Keep only Allow/Block policies for this browser-rendered app
```

Validation from any browser:

```text
https://ssh.bnpipats.tech
```

Expected result: Cloudflare Access login appears, then Cloudflare renders an
SSH terminal connected to the Project Truth VM.

CLI SSH remains available for prepared admin workstations, but it is not the
clean journey for random office PCs:

```powershell
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 `
  -o ProxyCommand="cloudflared access ssh --hostname %h" `
  infra@ssh.bnpipats.tech
```

## Prepared Workstation CLI Key

For a remote admin workstation that should use native SSH instead of the
browser-rendered terminal, generate one local key and install only its public
half into the VM's `infra` account.

Current Windows workstation key:

```text
%USERPROFILE%\.ssh\bnpi_pats_cloudflare_ed25519
```

Current Windows SSH alias:

```powershell
ssh bnpi-pats-client-vm
```

If the public key is not installed yet, open the browser SSH terminal at:

```text
https://ssh.bnpipats.tech
```

Then run this inside the browser terminal as `infra`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
grep -qxF 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICIQuU6GwMOippbn5Hdwk6ExcbqcbQyI4aHVmN2j9IAS bnpi-pats-cloudflare-cli' ~/.ssh/authorized_keys 2>/dev/null || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICIQuU6GwMOippbn5Hdwk6ExcbqcbQyI4aHVmN2j9IAS bnpi-pats-cloudflare-cli' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

After the key is installed, this native SSH command should authenticate through
Cloudflare Access:

```powershell
ssh -i $env:USERPROFILE\.ssh\bnpi_pats_cloudflare_ed25519 `
  -o ProxyCommand="cloudflared access ssh --hostname %h" `
  infra@ssh.bnpipats.tech
```

The equivalent durable alias is:

```powershell
ssh bnpi-pats-client-vm
```

## Remote CLI SSH Through WARP Private Routing

When browser SSH works but native `cloudflared access ssh` is reset before SSH
authentication, use Cloudflare One/WARP private routing instead of the
browser-rendered SSH hostname.

Current VM LAN SSH target:

```text
10.184.37.19
```

Current private route to publish to Cloudflare Tunnel:

```text
10.184.37.19/32 -> bnpi-pats
```

Current VM connector requirement:

```yaml
warp-routing:
  enabled: true
```

The Windows workstation key is already authorized on the VM:

```text
%USERPROFILE%\.ssh\bnpi_pats_cloudflare_ed25519
```

After the workstation is enrolled into the correct Cloudflare Zero Trust WARP
organization, the remote CLI command is plain SSH to the private VM address:

```powershell
ssh -i $env:USERPROFILE\.ssh\bnpi_pats_cloudflare_ed25519 infra@10.184.37.19
```

Proof with WARP connected and the same key:

```text
FINAL_REMOTE_WARP_SSH_OK
project-truth-node
infra
Route: 10.184.37.19/32 via CloudflareWARP, source 100.96.0.1
OpenSSH: Authenticated using publickey, exit status 0
```

Current verified Zero Trust organization:

```text
tight-thunder-c664
```

Current device-profile requirement:

```text
Split tunnel mode: Include
Included destination: 10.184.37.19/32
Gateway firewall policy: allow TCP destination 10.184.37.19 port 22
```

Expected WARP setup on another admin workstation:

```powershell
winget install --id Cloudflare.Warp
& "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" --accept-tos registration new tight-thunder-c664
& "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe" connect
ssh -i $env:USERPROFILE\.ssh\bnpi_pats_cloudflare_ed25519 infra@10.184.37.19
```

## V6 One-Shot Fresh VM Proof

For a fresh or alternate VM that should pull latest `develop`, import the stable
host-side credential at runtime, start the VM-side connector, and verify LAN and
public network proof, use:

```powershell
.\project-truth-v6-one-shot.cmd -GuestIp <vm-lan-ip>
```

or the equivalent CLI subcommand:

```powershell
.\scripts\project-truth.ps1 v6-one-shot -GuestIp <vm-lan-ip>
```

If `-GuestIp` is omitted, the command checks `PROJECT_TRUTH_GUEST_IP`,
`C:\ProgramData\BandaiApp\Bnpipats\config\project-truth.json`, then Hyper-V adapter
discovery. The default credential source is:

```text
C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json
```

The command validates that the JSON has the expected tunnel fields without
printing secret contents, copies it to the VM only as temporary runtime input,
installs it root-only under `/etc/cloudflared`, validates ingress, restarts
`cloudflared-bnpi-pats.service`, and writes evidence under
`.runtime\v6-one-shot`.

## V6 One-Click Zip Contract

Use the V2 reference shape for V6 packaging:

```text
Extract small zip
  -> double-click ProjectTruth-Install-HyperV-v6.cmd
  -> self-elevate if needed
  -> download VHDX and sidecars from the public storage bucket
  -> resume interrupted downloads
  -> verify SHA-256
  -> import/start Hyper-V VM
  -> discover or accept VM LAN IP
  -> run the V6 one-shot runtime proof
```

The V2 reference lives under `.runtime/gcp-v2-format` and intentionally keeps
the large VHDX out of the zip. V6 should preserve that model. The zip should
include only installer scripts and human-readable instructions; the bucket
should hold the VHDX, SHA-256, import helper, manifest, and readme sidecars.

Do not include the Cloudflare tunnel credential in any zip, VHDX, public bucket
object, repo file, or baked image. The installer may require the host-side
handoff credential to exist before it runs the V6 runtime phase:

```text
C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json
```

The V6 runtime phase should pass or fail with evidence, not silently skip
Cloudflare. Minimum proof after the VM imports:

- LAN SSH to the VM.
- `project-truth-ansible-pull` sync from `develop`.
- VM-side `cloudflared-bnpi-pats.service` enabled and active.
- LAN PROD/DEV/UAT app/API health.
- Public PROD/DEV/UAT app/API/Grafana health.
- Public CORS for pre-login provisioning endpoints.
- CLI SSH through `ssh.bnpipats.tech`.

Current V6 proof warning: public/LAN BNPI PATS is served by healthy Docker Compose
containers while K3s pods remain resource-constrained. Do not treat Argo
Application `Synced/Healthy` summaries alone as proof that K3s is the serving
runtime.

## SSH Through Domain

Public SSH through the domain is possible with Cloudflare Access TCP/SSH, not
with normal HTTPS routing.

Preferred hostname:

```text
ssh.bnpipats.tech
```

Current host-managed origin:

```text
ssh://10.184.37.19:22
```

VM-managed origin if enabled:

```text
ssh://localhost:22
```

Preferred access for unprepared computers:

```text
https://ssh.bnpipats.tech
```

Verified client command:

```powershell
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 `
  -o ProxyCommand="cloudflared access ssh --hostname %h" `
  infra@ssh.bnpipats.tech
```

The Windows SSH alias is also configured on the current host:

```powershell
ssh project-truth-bnpi-pats
```

Current status: DNS route, tunnel ingress, Cloudflare Access policy, public CLI
SSH, alias login, and a VM-side Linux connector with `ssh://localhost:22`
ingress are verified. Browser-rendered SSH is the preferred target journey for
unprepared machines, but still needs Cloudflare Access browser rendering enabled
and browser proof captured. The Access policy currently allows
`1bis.solutions.tech@gmail.com`.

## TryCloudflare Boundary

TryCloudflare quick tunnels are deprecated for the normal Project Truth path.
They may remain as a manual, temporary proof tool only. They must not appear as
the default VM/SSH visual proof path, and random `*.trycloudflare.com` URLs must
not be treated as durable project truth.
