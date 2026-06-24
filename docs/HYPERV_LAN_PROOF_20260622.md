# Hyper-V LAN Proof - 2026-06-22

This proof was captured from an elevated PowerShell session on the Windows host.

## Host and VM

- Repo: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`
- VM: `PROJECT-TRUTH-NODE`
- VM state: `Running`
- VM status: `Operating normally`
- Hyper-V switch: `ProjectTruth-External`
- VM MAC: `00-15-5D-9A-4A-0D`
- Guest LAN IP: `192.168.100.89`
- Host bridge IP: `192.168.100.174`
- VHDX path: `.runtime\local-hyperv-build\latest\project-truth-node-latest_03D7DEE2-F059-4F1E-A62A-B8BC2247C839.avhdx`

The VHDX was used from the existing `.runtime` path. It was not copied to `C:\ProgramData` because the host C: drive did not have enough free space for the 20 GB image copy.

## LAN HRIS Verification

Command:

```powershell
.\scripts\verify-lan-health.ps1 -GuestIp 192.168.100.89 -TimeoutSeconds 8
```

Result:

| Check | URL | Result |
| --- | --- | --- |
| PROD app | `http://192.168.100.89:3000/auth/login` | PASS, HTTP 200 |
| PROD API | `http://192.168.100.89:3001/health` | PASS, healthy |
| DEV app | `http://192.168.100.89:3100/auth/login` | PASS, HTTP 200 |
| DEV API | `http://192.168.100.89:3101/health` | PASS, healthy |
| UAT app | `http://192.168.100.89:3200/auth/login` | PASS, HTTP 200 |
| UAT API | `http://192.168.100.89:3201/health` | PASS, healthy |

## Inside-VM Verification

Inside-VM proof was captured through SSH with the pinned host-key fingerprint:

```text
SHA256:DgA3p/6y5MYH3qU8AHfg41a/dnNqjmmYRWoB6txM5uQ
```

Observed state:

- Hostname: `project-truth-node`
- Guest interface: `eth0 UP 192.168.100.89/24`
- `project-truth-status` reported LAN app/API checks as HTTP 200.
- PROD, DEV, and UAT Docker service matrix reported app/API/Postgres containers as `running/healthy`.
- K3s node `project-truth-node` was `Ready`.
- Argo CD namespace pods were `Running`.
- `kubectl get applications -n argocd` returned no Application resources.

Durable runtime evidence was saved under:

```text
.runtime\proof\20260622-220321
```

