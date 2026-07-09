# Hyper-V Host/VM Bridge State - 2026-07-09

## 2026-07-09 Clean Host + VM Architecture Correction

Status: `SUPERSEDES_PRIOR_EXTERNAL_BRIDGE_RECOVERY_FOR_THIS_WORKSTATION`

The local workstation target is now a clean host + Linux Hyper-V VM model, not
a Windows Docker Desktop or WSL runtime and not a pile of custom Hyper-V
bridges.

Official architecture basis:

- Hyper-V virtual switch design separates external, internal, and private
  switching. External is the direct physical-LAN path. Internal/NAT is the
  host-plus-VM path.
- Hyper-V NAT is a valid VM runtime path for host-local work and outbound
  network reachability.
- Docker bridge networking is container-local. It does not replace the VM NIC
  route to a physical biometric device.

Therefore this workstation should keep:

- one clean Hyper-V VM path
- Docker inside the VM
- no Project Truth runtime in Windows Docker Desktop
- no Project Truth runtime in WSL
- no assumption that Docker bridge alone can replace VM-to-device routing

Accepted local architecture:

- Windows host owns only Hyper-V, browser access, SSH client access, and the
  physical Wi-Fi/LAN connection.
- `project-truth-local-vhdx-proof` owns the Project Truth runtime.
- Docker Engine belongs inside the Linux VM.
- HRIS app/API/Postgres/device services belong inside the VM or VM Docker
  containers.
- Hikvision/ZKTeco device SDK/listener processes run inside the VM or inside VM
  containers.
- Windows host access should be limited to `ping <VM_IP>`,
  `ssh infra@<VM_IP>`, `http://<VM_IP>:3000`, and
  `http://<VM_IP>:3001/health`.

Clean `ncpa.cpl` target:

- Keep the physical Wi-Fi/Ethernet adapter.
- Keep only the Hyper-V adapter required by the chosen VM switch.
- Do not use Windows Docker Desktop or WSL as a Project Truth runtime path.
- If `vEthernet (WSL (Hyper-V firewall))` must disappear from `ncpa.cpl`, that
  is a host product cleanup decision: disable/uninstall Docker Desktop and WSL
  after confirming no other local work depends on them. Do not treat that
  adapter as a Project Truth bridge.

Corrected Hyper-V policy:

- Remove broken/stale custom `ProjectTruth-*` switches unless actively needed
  for one proven test.
- Prefer `Default Switch` for recovery, or use exactly one dedicated clean VM
  switch if the host network needs a stable LAN-facing switch.
- Do not keep multiple ProjectTruth external/internal bridge variants.
- Do not bridge Windows Docker Desktop or WSL adapters into the Project Truth
  path.
- Do not assign `10.184.37.254` to the VM or host bridge; it was observed
  occupied/gateway-like.
- Do not use `.251` or `.252`; they were observed occupied.
- Use `10.184.37.241` only as a VM guest IP if it is proven non-conflicting on
  the active host/VM network. If the host LAN is not on `10.184.37.0/24`, use
  DHCP on the VM NIC and accept the assigned reachable VM IP.

Current cleanup state from the later 2026-07-09 repair pass:

- Custom `ProjectTruth-WiFi-Bridge` was removed.
- The VM was returned to `Default Switch` for clean recovery.
- The explicit WSL/Docker Desktop cleanup pass removed the `docker-desktop` WSL
  distro, disabled `com.docker.service`, removed the `WSL (Hyper-V firewall)`
  HNS network/switch, and disabled the Windows Subsystem for Linux optional
  feature with restart pending.
- Remaining visible `ncpa.cpl`/host adapters after cleanup were Ethernet,
  Wi-Fi, and `vEthernet (Default Switch)`.
- Remaining Hyper-V switch after cleanup was `Default Switch`.
- The earlier `ProjectTruth-WiFi-Bridge` addendum below is historical evidence,
  not the current target architecture.

Evidence:

- `.runtime/host-vm-only-wsl-hard-delete-20260709-195419/`

Final host-only VM proof from this cleanup:

- VM: `project-truth-local-vhdx-proof`
- Hyper-V switch: `Default Switch`
- Visible host adapters after cleanup: Ethernet, Wi-Fi, and
  `vEthernet (Default Switch)`
- Removed host drift: `docker-desktop` WSL distro, Docker Desktop service
  startup, `WSL (Hyper-V firewall)` switch/network, and WSL optional feature
  pending reboot
- Host-side VM access IP on `vEthernet (Default Switch)`:
  `10.184.37.248/24`
- VM stable host-access IP: `10.184.37.241/24`
- VM DHCP/NAT address from Default Switch: `172.26.62.243/20`
- Host ping to `10.184.37.241`: passed
- Host SSH/TCP `22` to `10.184.37.241`: passed
- Host HRIS URL proof:
  - `http://10.184.37.241:3000/auth/login` returned HTTP `200`
  - `http://10.184.37.241:3001/health` returned HTTP `200`
  - `http://10.184.37.241:3101/health` returned HTTP `200`
  - `http://10.184.37.241:3201/health` returned HTTP `200`
- VM Docker runtime: running inside Linux VM with HRIS app/API/Postgres
  containers healthy.
- Local VM Cloudflare status: `inactive` and `masked`.
- VM console/issue text now shows `LAN IP: 10.184.37.241`.

Remaining topology boundary:

- The clean `Default Switch` host-only/NAT topology currently does not prove
  VM-to-Hikvision reachability. VM probes to `10.184.37.139:80` and
  `10.184.37.139:8000` failed with `No route to host`.
- If physical device reachability must be restored from inside the VM, use one
  deliberately chosen clean LAN-facing switch or route, then prove it with
  device TCP evidence. Do not recreate multiple ProjectTruth switches or
  reintroduce WSL/Docker Desktop adapters.

## 2026-07-09 Biometric Routing Continuation

Latest reachable biometric truth:

- Physical Hikvision candidate `192.168.254.189` is live from the Windows host:
  ICMP passed, TCP `80` passed, TCP `443` passed, and TCP `8000` passed.
- The local Hyper-V VM does not need another Hyper-V switch for the HCNetSDK
  listener path. Docker does not create the physical device route; the working
  path is still the VM NIC plus Hyper-V host/NAT routing.
- After a live guest route fix, the VM also reached `192.168.254.189` on TCP
  `80`, `443`, and `8000` while remaining on `Default Switch`.
- The local HRIS `Main Entrance Device` row was stale and was corrected from
  `192.168.110.24` / `https` to `192.168.254.189` / `http`, with
  `vendor=Hikvision`, `model=DS-K1T341CMFW`, `sdkPort=8000`, and
  `webhookPath=/api/hikvision/callback`.

Proof after route correction:

- `GET /api/device/:id/health` from the VM-backed API reported:
  - network `reachable`
  - device API `Unauthorized`
- `GET /api/device/sync-preview?deviceId=<Main Entrance Device>` reported
  source status `source_unavailable` with error `Unauthorized`.
- VM-side `hikvision-biometric-service` build/link passed against Linux
  HCNetSDK.
- VM-side real listener run against `192.168.254.189:8000` progressed from
  HCNetSDK error `7` to HCNetSDK error `1` after the route fix.
- Direct host digest-auth ISAPI checks against `http://192.168.254.189`
  returned `401 Unauthorized`.

Current real blocker:

- The remaining blocker is not Hyper-V switch count, not Docker bridge design,
  and not host/VM reachability. The remaining blocker is Hikvision credential
  drift for the live device at `192.168.254.189`.
- The VM also has guest route drift on reboot: it keeps restoring stale
  `172.31.99.250/23` plus default route `172.31.98.1`, so a temporary live
  route fix was needed to reach `192.168.254.189` again. The stable boot-time
  fix still needs to be reconciled.

Evidence:

- `.runtime/biometric-tap-routing-20260709-200712/`

## Copyable Continuation Prompt

```text
Continue Project Truth local Hyper-V + Hikvision repair from current repo state.

Read first:
- AGENTS.md
- .wwg/reports/hyperv-host-vm-bridge-state-20260709.md
- .wwg/workspace/current-task.md
- .wwg/governance/recommendation-registry.md

Current architecture truth:
- Windows host is Hyper-V only, plus Wi-Fi/LAN, browser, and SSH client.
- No Project Truth runtime in Windows Docker Desktop.
- No Project Truth runtime in WSL.
- Hyper-V VM `project-truth-local-vhdx-proof` owns Project Truth runtime.
- Docker Engine runs inside the Linux VM.
- `Default Switch` is the only remaining Hyper-V switch on this workstation.
- Host uses VM IPs and VM HTTP ports only.

Current proven network truth:
- Host-access VM IP: `10.184.37.241`
- Host-side helper IP on `vEthernet (Default Switch)`: `10.184.37.248/24`
- Host ping to `10.184.37.241` works.
- Host SSH to `infra@10.184.37.241` works.
- Host HRIS URLs on `10.184.37.241` work.
- Cloudflare in this local VM path is inactive/masked.

Current Hikvision truth:
- Live physical device is `192.168.254.189`.
- Host reachability to `192.168.254.189`: ping OK, TCP 80 OK, TCP 443 OK, TCP 8000 OK.
- VM reachability to `192.168.254.189` can work on `Default Switch` without creating another Hyper-V switch.
- Local HRIS `Main Entrance Device` row was corrected to:
  - address `192.168.254.189`
  - port `80`
  - protocol `http`
  - config vendor `Hikvision`
  - model `DS-K1T341CMFW`
  - sdkPort `8000`
  - source `vendor/hikvision-linux`
  - webhookPath `/api/hikvision/callback`

Current blocker truth:
- Another Hyper-V switch is not the current blocker.
- Docker bridge networking is not the current blocker.
- The current blockers are:
  1. VM route drift on reboot: guest keeps restoring stale `172.31.99.250/23` and default route `172.31.98.1`
  2. Hikvision credential drift: direct ISAPI digest auth to `192.168.254.189` returns `401 Unauthorized`
  3. HCNetSDK listener moved from error `7` to error `1` after route fix, proving route was repaired and credentials are now the remaining blocker

Work order:
1. Keep Project Truth runtime inside the VM and Docker inside the VM.
2. Do not create another Hyper-V switch unless new evidence proves `Default Switch` cannot support the required path.
3. First repair VM boot-time route drift so the VM keeps a valid default route after reboot.
4. Then repair the live Hikvision credential source for `Main Entrance Device` at `192.168.254.189`.
5. Re-run:
   - host ping/TCP proof to `192.168.254.189`
   - VM TCP proof to `192.168.254.189:80` and `:8000`
   - `/api/device/:id/health`
   - `/api/device/sync-preview?deviceId=<Main Entrance Device>`
   - `vendor/hikvision-linux/hikvision_biometric_service.cpp` live run against `192.168.254.189:8000`
6. Do not stop until one of these is true:
   - a real tap event is received by the HCNetSDK listener and posted into HRIS
   - or 3 distinct documented recovery attempts fail after route and credential repair, with evidence

Rules:
- Do not use `10.184.37.254` for host or VM.
- Do not recreate WSL/Docker Desktop adapters.
- Do not move Project Truth runtime back onto the Windows host.
- Do not treat Docker bridge networking as a replacement for VM/device routing.
- Keep evidence in a stamped `.runtime/...` directory.

Final answer must include:
- whether the VM still uses `Default Switch`
- current VM IP
- current live Hikvision IP
- whether credential auth succeeded
- whether a real tap event reached HRIS
- exact evidence directory
```

Local Cloudflare boundary:

- For this local-only VM path, Cloudflare should be inactive inside the local
  VM and must not be used as proof that host-to-VM networking works.
- This does not authorize disabling a separate running/public Project Truth
  server's VM-managed tunnel unless that server is explicitly the local test VM
  and a recovery path is documented.

## Current Runtime Truth

- Canonical VM: `project-truth-local-vhdx-proof`
- Canonical VM operator/runtime IP: `10.184.37.19`
- Secondary VM IP: `10.184.37.78`
- Current local Hyper-V VM attachment: `ProjectTruth-External`.
- Current local Hyper-V switch truth: `ProjectTruth-External` is an internal switch, despite its name.
- Current real host-side external bridge: `ProjectTruth-WiFi-Bridge`, bound to `Intel(R) Wi-Fi 6E AX211 160MHz`, with Windows host IP `10.184.38.4/24` and default route via `10.184.38.254`.
- Current host config: `%ProgramData%\ProjectTruth\config\project-truth.json` still points to VM `project-truth-local-vhdx-proof`, switch `ProjectTruth-External`, and guest IP hint `10.184.37.19`; this is stale for future bridge operations until the VM guest IP collision risk below is resolved.

## 2026-07-09 Bridge Repair Addendum

Evidence directory:

- `.runtime/hyperv-bridge-repair-20260709-154238/`

Host-side findings:

- `ProjectTruth-External` was proven to be `SwitchType Internal`, with no physical adapter binding.
- A real external Wi-Fi bridge was created additively as `ProjectTruth-WiFi-Bridge`.
- After bridge creation, Windows host IP `10.184.38.4/24` moved to `vEthernet (ProjectTruth-WiFi-Bridge)`, and the default route stayed `10.184.38.254`.
- The stale tentative address `10.184.37.250/24` was removed from `vEthernet (ProjectTruth-External)`.
- `10.184.37.254` replied to ping and had TCP `22` and `80` open through the routed LAN path, so it is occupied and must not be assigned to Windows host-side vEthernet.

VM identity findings:

- SSH to `10.184.37.19` reached `project-truth-node` and proved `eth0` with `10.184.37.19/24` and `10.184.37.78/24`.
- That SSH target reported guest MAC `00:15:5d:38:01:0a`.
- The currently attached local Hyper-V VM adapter reports MAC `00:15:5d:9a:4a:14`.
- Therefore, do not assume the already reachable `10.184.37.19` service path is the same NIC currently attached to local Hyper-V `ProjectTruth-External`.
- Attaching the local VM to the new external bridge while its guest image may still be statically configured as `10.184.37.19` risks a duplicate IP on the real LAN.

Safe bridge decision:

- `ProjectTruth-WiFi-Bridge` is the intended host-side external bridge object for this Windows host.
- Do not assign `10.184.37.254` to the host bridge; it is already occupied/gateway-like.
- Do not attach the local VM to `ProjectTruth-WiFi-Bridge` until the guest-side static IP is confirmed or changed to a non-conflicting LAN address, or until the existing `10.184.37.19` owner is proven to be this exact local VM NIC.
- The VM service IP remains `10.184.37.19`; the host bridge IP is currently `10.184.38.4`; the default gateway is `10.184.38.254`; the occupied `.37` gateway/service address is `10.184.37.254`; the Hikvision device is `10.184.37.139`.

## Important Distinction

`10.184.37.250` was not the VM IP. It was a Windows host-side `vEthernet`
address used during an earlier host-test bridge recovery path. It is no longer
assigned after the 2026-07-09 bridge repair addendum.

The documented host-test working state was:

- Move `project-truth-local-vhdx-proof` to internal switch
  `ProjectTruth-HostTest-10-184-37`.
- Assign Windows host-side vEthernet address `10.184.37.250/24` with
  `SkipAsSource=False`.
- Keep the VM serving at `10.184.37.19` and `10.184.37.78`.

That host-test path made Windows host probes pass to SSH and PROD/DEV/UAT
app/API ports on the VM at the time. It should now be treated as historical
local validation evidence, not as the current bridge target and not as a
replacement for the VM's canonical `10.184.37.19` identity.

`10.184.37.254` is also not the VM IP and not a safe host-side vEthernet
assignment. On 2026-07-09 it replied to ICMP and accepted TCP `22` and `80`
from the Windows host via `vEthernet (ProjectTruth-WiFi-Bridge)` and next hop
`10.184.38.254`.

## Current Live Checks

On 2026-07-09, live host and VM checks showed:

- Windows host can reach `10.184.37.19:22`.
- Windows host cannot directly reach Hikvision `10.184.37.139:80` or
  `10.184.37.139:8000`.
- VM `10.184.37.19` can ping Hikvision `10.184.37.139`.
- VM `10.184.37.19` can open Hikvision SDK port `10.184.37.139:8000`.
- Later same-day bridge repair proved `ProjectTruth-External` was internal,
  created `ProjectTruth-WiFi-Bridge` as the real external Wi-Fi bridge, removed
  stale tentative `10.184.37.250/24`, and left the local VM attached to the
  internal switch until guest-side IP conflict risk is resolved. Evidence:
  `.runtime/hyperv-bridge-repair-20260709-154238/`.

Therefore, current Hikvision SDK runtime proof should run from the VM, not from
host-direct Windows networking.

## Rollback / Recovery Shape

If host-to-VM direct validation breaks again, recover toward the documented
external bridge state rather than changing the VM identity:

1. Preserve the VM-managed Cloudflare tunnel.
2. Confirm VM `eth0` still has `10.184.37.19/24`.
3. Confirm whether `10.184.37.19` belongs to the exact local Hyper-V NIC before
   attaching the local VM to an external bridge.
4. Use `ProjectTruth-WiFi-Bridge` for the Windows host-side external bridge.
5. Do not assign `10.184.37.254` to the host bridge; it is occupied.
6. Do not reassign stale `10.184.37.250/24` unless a future isolated host-test
   switch is deliberately recreated and proven non-conflicting.
7. Verify host-to-VM SSH and HRIS ports against `10.184.37.19`.
8. Verify VM-to-Hikvision `10.184.37.139:80` and `10.184.37.139:8000` from
   inside the VM.
9. Do not rename `10.184.37.250` or `10.184.37.254` as a VM IP in Project Truth
   docs.

## Source References

- `.wwg/workspace/current-task.md` lines 467-479.
- `.wwg/wiki/project-truth-summary.md` lines 63-70.
- `.wwg/governance/recommendation-registry.md` entry
  `REC-20260703-002`.
