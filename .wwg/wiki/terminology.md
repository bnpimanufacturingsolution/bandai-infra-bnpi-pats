# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| flow | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| package | app/package-lock.json, app/package.json | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| target | README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| truth | package/name, README heading | Observed project term; confirm canonical meaning before broad use. | INFERRED |
| architecture | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| autopilot | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| branch | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| cli | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| admin / hris-admin | User correction; admin route folders | Canonical role for admin configuration, device management, ZKTeco device events, runtime health, and repair/operations work. Do not substitute HR manager for admin surfaces. | CONFIRMED |
| hris-hr-manager | Existing role tests and HR route code | HR workflow role only where code/docs explicitly require it; not the default actor for `/admin` device/configuration work. | CONFIRMED_WITH_BOUNDARY |
| current | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| dockerfile | app/Dockerfile | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| documents | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| format | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| fresh | package/name | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| goal | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| hyper | README heading | Observed project term; confirm canonical meaning before broad use. | NEEDS_CONFIRMATION |
| operator/LAN IP | Runtime repair evidence; appliance summary; WWG Project Truth | The LAN address operators should use for direct SSH/HTTP checks when their workstation can route to the VM LAN. | CONFIRMED_WITH_BOUNDARY |
| pure static LAN | Runtime repair evidence; netplan state | DHCP-disabled VM network mode where all required VM LAN addresses, default route, DNS, and search domains are persisted through Project Truth config. | CONFIRMED |
| K3s node/API IP | Runtime repair evidence; K3s node and Kubernetes endpoint checks | Static VM address used by K3s node InternalIP and Kubernetes API endpoint identity. The accepted canonical target is now `10.184.37.19`; `10.184.37.78` is retained only as a secondary transition address/TLS SAN. | CONFIRMED_WITH_BOUNDARY |
| VM-managed Cloudflare Tunnel | Runtime banner and Project Truth tunnel evidence | The live VM-side `cloudflared-bnpi-hris.service` connector for named tunnel `bnpi-hris`, including public HRIS, Grafana, DB Access TCP helper hostnames, and SSH through `ssh.bnpi-hris.tech`. This must remain active by default on the running server. | CONFIRMED |
| cloud mode / local mode | 2026-07-03 incident correction | A discouraged toggle concept for the running server. Agents must not make default-local/cloud-mode behavior control the live `cloudflared-bnpi-hris.service`; Cloudflare must stay enabled unless the user explicitly approves a time-bounded outage with recovery. | ACCEPTED_RUNTIME_SAFETY_RULE |
| DeviceUser / Device Users | 2026-07-06 local implementation; admin device UI | Durable HRIS record for a user identity read from a physical device and optionally linked to an Employee. This is identity/enrollment data, not attendance/device-log data and not biometric template transfer. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Sync device users | 2026-07-06 local implementation; admin device UI | Admin action that reviews then pulls physical device user identities through vendor APIs such as Hikvision `UserInfo/Search`, upserts `DeviceUser`, and auto-links only safe exact employee matches. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Sync logs / Sync device logs | 2026-07-06 local implementation; admin device UI | Admin action that imports or classifies physical device attendance/event records. It remains separate from Sync device users and resolves employee identity through `DeviceUser` first, then legacy fields. | CONFIRMED_LOCAL_IMPLEMENTATION_WITH_BOUNDARY |
| Hikvision alarm listener | 2026-07-09 Hikvision biometric sync architecture | Linux/VM-owned HCNetSDK service that logs into configured Hikvision devices, registers SDK alarm callbacks, arms alarm channels, classifies ACS events, and queues reconciliation work. It must not be named or treated as Windows `AlarmDemo` runtime. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |
| Biometric enrollment sync | 2026-07-09 Hikvision biometric sync architecture | Target workflow where a device enrollment/user-change event triggers source user/fingerprint reads, syncs the employee/device user to peer biometric devices, and persists HRIS `DeviceUser`/biometric metadata with dry-run/audit gates. This is higher-risk than device identity sync or attendance log sync. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |
| Biometric reconciliation worker | 2026-07-09 Hikvision biometric sync architecture | Background worker that performs the slow/sensitive user and fingerprint template read/write work after the alarm listener queues a reconcile event. It should provide dry-run, audit, and recovery evidence before mutating devices. | TARGET_ARCHITECTURE_PENDING_IMPLEMENTATION |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| flow | Flow | None detected | MEDIUM | README heading |
| package | Package | None detected | MEDIUM | app/package-lock.json, app/package.json |
| target | Target | None detected | MEDIUM | README heading |
| truth | Truth | None detected | MEDIUM | package/name, README heading |
| architecture | Architecture | None detected | MEDIUM | README heading |
| autopilot | Autopilot | None detected | MEDIUM | README heading |
| branch | Branch | None detected | MEDIUM | README heading |
| cli | Cli | None detected | MEDIUM | README heading |
| admin role | admin / hris-admin | administrator, admin user | HIGH | User correction 2026-06-29; `hris-app/app/routes/admin` |
| HR manager role | hris-hr-manager | HR Manager, hr-manager route legacy | HIGH | Existing HRIS role tests and HR workflow code |
| operator LAN access address | operator/LAN IP | LAN IP, stable VM address, static operator/LAN address | HIGH | 2026-07-03 pure static LAN repair evidence |
| pure static VM LAN mode | pure static LAN | static LAN, hard cutover, DHCP-disabled LAN | HIGH | 2026-07-03 netplan and `/etc/project-truth/lan.env` evidence |
| K3s node identity address | K3s node/API IP | node IP, Kubernetes endpoint IP | HIGH | 2026-07-03 user correction establishing `10.184.37.19` as canonical runtime truth |
| live VM named tunnel connector | VM-managed Cloudflare Tunnel | VM-side Cloudflare, cloudflared service, named tunnel connector, cloud mode | HIGH | 2026-07-03 VM banner and user correction after tunnel disable incident |
| physical device identity record | DeviceUser / Device Users | device users, enroll users, enrollment data | HIGH | 2026-07-06 schema/API/UI implementation |
| device identity sync action | Sync device users | review sync, user sync, enroll users sync | HIGH | 2026-07-06 admin device UI implementation |
| device event import action | Sync logs / Sync device logs | sync events, device log sync, attendance log sync | HIGH | 2026-07-06 admin events UI implementation |
| Hikvision SDK callback service | Hikvision alarm listener | HCNetSDK alarm listener, Linux alarm service | HIGH | 2026-07-09 architecture intake |
| cross-device fingerprint/user sync | Biometric enrollment sync | biometric sync, ONENROLL event, enrollment sync, fingerprint sync | HIGH | 2026-07-09 architecture intake |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| Admin device/configuration work was previously left as inferred generic roles | `.wwg/wiki/project-truth.md` previously listed `user, owner, guest`; user correction 2026-06-29 says this is clearly admin role | Use admin / `hris-admin` for `/admin` device, runtime, GitOps, VM, and ZKTeco drift work; use `hris-hr-manager` only for explicit HR workflows |
| `Enroll Users` sounded like a new attendance/biometric enrollment flow | Earlier admin device button/modal copy and user correction on 2026-07-06 | Use `Device Users` for the durable identity table, `Review sync` before the mutating pull, and keep `Sync logs` terminology for attendance/event import |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
