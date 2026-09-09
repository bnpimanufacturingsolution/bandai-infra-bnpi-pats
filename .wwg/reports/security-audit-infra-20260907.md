# Infrastructure Security Audit — Platform Layer (2026-09-07)

Status: `AUDIT_COMPLETE_READ_ONLY`. Scope: **infrastructure only** — Windows host, Hyper-V VM OS, network/firewall, Docker, K3s/K8s control plane, Cloudflare tunnel edge, system services, patching, logging/audit. App-code findings are in `.wwg/reports/security-audit-full-20260907.md` and are cross-referenced only where they are also infra defects.

Evidence: `.runtime/security-audit-infra-20260907/vm-probe-3-deep-infra.txt` (+ `host-probe.txt`; earlier `../security-audit-full-20260907/vm-probe.txt`, `vm-probe-2.txt`). All VM data gathered read-only over `ssh project-truth-hris`.

Probe limitation: Hyper-V PowerShell cmdlets were unavailable in this session's shell (module not loaded), so VM switch/adapter enumeration could not be re-verified from the host this pass — `NEEDS_CONFIRMATION` against earlier evidence (VM `project-truth-local-vhdx-proof` on `ProjectTruth-External`/Default Switch per Project Truth).

---

## Executive Summary

The VM's **kernel and K3s platform posture is notably good** (AppArmor enforcing, hardened sysctls, unattended-upgrades active, K3s credential files locked down, no anonymous cluster bindings). But the audit confirms **three infrastructure-critical chains** that bypass all of that good hygiene:

1. **LAN → VM root in one step:** sshd accepts **passwords** (`PasswordAuthentication yes`, enforced by 3 sshd_config.d files), the `infra` password appears hardcoded in repo scripts, and `infra` has **`NOPASSWD:ALL` sudo**. No fail2ban, no UFW `limit` on SSH.
2. **The Windows host has no firewall at all** (all three profiles disabled) and **RDP is enabled** — the hypervisor itself is the softest point in the whole stack.
3. **Data at rest is unencrypted end-to-end:** no LUKS on the VM, K3s `--secrets-encryption` off, so one copied VHDX (or host disk) yields HRIS DB + biometrics + all K8s secrets in the clear.

| Severity | Count (infra layer) |
|---|---|
| CRITICAL | 4 |
| HIGH | 9 |
| MEDIUM | 10 |
| LOW | 4 |
| Confirmed-secure (positive) | 13 |
| NEEDS_CONFIRMATION | 3 |

---

## CRITICAL (infra layer)

| ID | Finding | Evidence |
|---|---|---|
| **IC1** | **VM LAN→root chain fully confirmed:** `infra ALL=(ALL) NOPASSWD:ALL` in `/etc/sudoers.d/90-infra` + sshd `passwordauthentication yes` (effective; enforced by `50-cloud-init.conf`, `90-packer-password-auth.conf`, `90-project-truth-password-auth.conf`) + `infra` password hardcoded (`plink -pw infra`) in `scripts/hyperv-visual-proof-loop.ps1:68`, `login-visual-proof-loop.ps1:127` + no fail2ban + UFW plain `ALLOW` (not `limit`) on 22/tcp from Anywhere | `vm-probe-3-deep-infra.txt` §A,§Q,§R; `vm-probe-2.txt` sshd -T; `vm-probe.txt` §9 |
| **IC2** | **Windows host firewall fully disabled** on Domain/Private/Public profiles (all `Enabled=False`, inbound `NotConfigured`) while **RDP is enabled** (`fDenyTSConnections=0`). The hypervisor host — holder of all VHDXs, SSH keys, Cloudflare credential import paths — accepts unsolicited LAN traffic | `host-probe.txt` firewall + RDP sections |
| **IC3** | **No encryption at rest anywhere in the chain:** VM filesystem has no LUKS layer; K3s runs **without `--secrets-encryption`** (K8s Secrets, incl. DB creds and `INTEGRATION_API_KEYS`, plaintext in `/var/lib/rancher/k3s/server/db/state.db`); Postgres data dirs unencrypted; host VHDX files unencrypted. One VHDX copy/host disk theft = full HRIS data + biometrics + every credential | `vm-probe-3-deep-infra.txt` §G (no LUKS), §J (no secrets-encryption arg) |
| **IC4** | **Observability stack is an unauthenticated LAN service set:** Prometheus (`user=0`), Loki (`user=0`), Grafana, Tempo, Alertmanager, node/cadvisor exporters all serve with **zero auth**, and UFW allows their ports (`9091,3110,9093,9115,9110,8088,53000`…) **from Anywhere** on both v4 and v6. Loki explicitly `auth_enabled: false` | `vm-probe-3-deep-infra.txt` §H,§I; UFW rules `vm-probe.txt` §5; `loki-config.yml` |

## HIGH (infra layer)

| ID | Finding | Evidence |
|---|---|---|
| IH1 | **auditd inactive** — no kernel audit trail (execs, file changes, sudo usage). journald is persistent but app-level only; rsyslog is local-only, no remote log sink | §C |
| IH2 | **Patching lag:** `*** System restart required ***` + 54 packages upgradable; no reboot policy/process documented | §D |
| IH3 | **Docker hardening absent:** no `/etc/docker/daemon.json` (no log-rotation caps → disk-fill DoS via container logs, no live-restore); Grafana/Prometheus/Loki/Tempo/backup containers run as **root** (`user=0` or empty); no `cap_drop`, no read-only rootfs anywhere | §H,§I |
| IH4 | **dnsmasq listens on the LAN IP** `10.184.37.19:53` (plus 127.0.0.1) — an open DNS resolver on the device VLAN; usable for internal recon/amplification | §P; `vm-probe.txt` §6 |
| IH5 | **Weak-SSH posture is enforced by infrastructure-as-code:** Packer/user-data (`image-factory/packer/provision.sh`, `http/user-data`) sets `PasswordAuthentication yes`, `KbdInteractiveAuthentication yes`; every reprovisioned VM inherits it | W11 + sshd_config.d listing |
| IH6 | **K3s admin kubeconfig world-readable file mode** `/etc/rancher/k3s/k3s.yaml` = `644 root` (embedded cluster-admin client cert). Mitigated today because only root/infra have shells — but both can read it, and `infra` = passwordless sudo anyway | `vm-probe.txt` §8; `vm-probe-2.txt` |
| IH7 | **Unmapped service `caddy.service` running on the VM** — not referenced in this audit's configs; reverse proxies are prime lateral-movement targets. Purpose/config `NEEDS_CONFIRMATION` | §N |
| IH8 | **X11 forwarding enabled** on sshd (`X11Forwarding yes`) — unnecessary channel for an operator/automation VM | `vm-probe.txt` §3 |
| IH9 | **`GatewayPorts clientspecified` + `AllowTcpForwarding yes`** on sshd: any SSH client (incl. future compromised keys) can bind remote forwards on all interfaces — required for the device-bridge design, but it makes sshd a permanent tunnel pivot into the LAN | `vm-probe-2.txt` sshd_config.d |

## MEDIUM (infra layer)

- 4 AppArmor profiles in complain mode (not enforcing).
- No fail2ban; no SSH rate limiting anywhere (UFW plain ALLOW).
- ModemManager running in a headless VM (unneeded service surface).
- No centralized/remote logging for VM or K3s (logs live-and-die on the VM; an attacker with root can erase them — ties IH1).
- No container image scanning anywhere in the build path (VM-built images, `imagePullPolicy: Never`).
- Windows host retains a legacy RSA `id_rsa` key alongside 3 ed25519 keys (crypto hygiene; RSA still fine but inconsistent).
- Docker/K3s both running on one VM without resource isolation guardrails (single-node blast radius — architectural, accepted).
- UFW allows 80/443/53/38080 from Anywhere — broader than the documented service map needs from "Anywhere" vs the device subnet.
- No NTP hardening/auth note (systemd-timesyncd default pool).
- No CIS-style baseline benchmark evidence (manual audit only).

## LOW

- `send_redirects=1` on all-IPv4 (should be 0 on non-router; ip_forward=1 is legitimately needed for K3s).
- rsyslog + journald duplication without retention caps verified.
- `/etc/hosts.allow`/`hosts.deny` present but effectively unused (tcpwrappers deprecated).
- Device spec backup files (`hikvision-hot-reload.env.bak-*`) accumulate in `/etc/project-truth/` (600 — OK, but unreviewed sprawl).

## Confirmed-secure (infra positives)

1. UFW **active with default-deny incoming** (exceptions noted above).
2. AppArmor **active, 26 profiles enforcing**.
3. Kernel hardening: `randomize_va_space=2`, `kptr_restrict=1`, `dmesg_restrict=1`, `unprivileged_bpf_disabled=2`, `tcp_syncookies=1`, `accept_redirects=0`, `accept_source_route=0`, `rp_filter=2`.
4. **unattended-upgrades enabled + active**.
5. K3s server token `600`, all `server/cred` kubeconfigs `600`, DB dir `700 root`.
6. **No anonymous ClusterRoleBindings**; 7 NetworkPolicies exist; Argo CD on ClusterIP only (not LAN-exposed).
7. No empty-password accounts; only root+infra have shells.
8. No privileged Docker containers; otel runs as 10001, alertmanager/node-exporter as nobody.
9. Cloudflare tunnel credential `600 root`; `/etc/cloudflared` configs contain no secrets; both tunnel configs have 404 catch-all.
10. Hikvision device spec files all `600 root`.
11. Defender on host: real-time protection on, signatures fresh (0 days), quick scan 2 days.
12. Persistent journald (post-reboot forensics possible locally).
13. K3s state.db correct dir perms (`700`), token never committed to repo.

## NEEDS_CONFIRMATION

1. `caddy.service` purpose/listeners (IH7).
2. Hyper-V switch topology re-verification from host (probe limitation noted above).
3. Whether `90-packer-password-auth.conf` is intentionally required for reinstall flows or removable drift.

---

## Infra-layer remediation roadmap

**P0 — this week (does not touch app code; tunnel stays active throughout):**
1. **VM SSH:** set `PasswordAuthentication no` + `PermitRootLogin no` (remove/override the three weak sshd_config.d files), keep pubkey-only for `infra`; verify key login **before** closing passwords; add UFW `limit 22/tcp` in place of plain ALLOW.
2. **Windows host:** enable firewall on all profiles with explicit allows (Hyper-V, SSH client, browser, RDP from operator subnet only — or disable RDP if unused); least-privilege RDP via NLA is already default.
3. **Root-equivalence:** convert `infra` sudoers from `NOPASSWD:ALL` to a scoped command list (or at minimum `NOPASSWD` only for the service/ansible commands actually needed); rotate the `infra` password and purge `plink -pw` scripts.
4. **Observability LAN exposure:** either bind those host ports to `127.0.0.1`/LAN-CIDR UFW sources, or add basic auth on Prometheus/Loki/Tempo/Alertmanager.
5. Enable K3s `--secrets-encryption` (requires etcd/state reseed — schedule with operator; back up first per DB rules).

**P1 — this month:** install/enabled fail2ban (or rely on UFW limit + CF Access for SSH) · start `auditd` with a lean ruleset (sudo, sshd, auth failures, docker/k3s socket access) · ship journald/rsyslog to a remote sink (Loki already exists) · reboot policy: apply the pending kernel + reboot in a maintenance window · Docker `daemon.json` (log rotation, live-restore) + per-container `cap_drop: ALL` + non-root users for grafana/prometheus/loki/tempo · restrict dnsmasq to loopback or the device subnet purpose · document or remove caddy · remove X11Forwarding.

**P2 — this quarter:** LUKS (or BitLocker-host-side for the VHDX store) as part of the next image build — note this changes the image-factory flow and must keep the V7 clean-image lane separate · CIS Ubuntu benchmark pass (automate with OpenSCAP in Packer) · container image scanning in the VM build path · K8s: enforce NetworkPolicies default-deny per namespace · document `GatewayPorts` necessity per device bridge.

**Constraints honored:** all changes above are additive and keep `cloudflared-bnpi-hris.service` running; nothing here requires tunnel outage. DB-related changes follow the backup-first rule (see app-audit H11 — create HRIS DB backups *before* any K3s secrets-encryption work).

## Cross-reference to app-layer report

IC1 = C12 confirmed at sudoers level · IC4 = H10 confirmed at container level · IH3/IH5/H6 tie to app-report C4/C5/C6. Nothing in this pass contradicts the full-audit report; severities stand.
