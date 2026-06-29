# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth, active Workspace tasks, or commitments until reviewed and promoted.

| ID | Date | Status | Recommendation | Evidence |
|---|---|---|---|---|
| REC-20260629-CF-TECH-TUNNEL-ACCOUNT | 2026-06-29 | Implemented | Put the `bnpi-hris.tech` Cloudflare zone and the `bnpi-hris` named tunnel in the same Cloudflare account, or create a new named tunnel inside the account that owns the `bnpi-hris.tech` zone. | Implemented by logging into the Cloudflare account that owns `bnpi-hris.tech`, creating tunnel `e3486f00-f974-46d3-9e11-911266749d00`, routing the `.tech` hostnames to it, and verifying public HTTP 200 checks. |
| REC-20260629-CF-VM-MANAGED-TUNNEL | 2026-06-29 | Proposed | Add an optional VM-managed Cloudflare Tunnel install/import flow for portable final images, with credentials supplied out-of-band and never baked into the repo or public image. | Current proven tunnel ownership is host-managed on Windows. VM-managed mode would improve portability but needs a secure credential import, systemd service, localhost ingress, and rollback plan. |
| REC-20260629-CF-ACCESS-SSH | 2026-06-29 | Proposed | Finish Cloudflare Access SSH for `ssh.bnpi-hris.tech` by creating or confirming the Access app/policy for the operator and proving a successful SSH login through `cloudflared access tcp`. | DNS route and tunnel ingress are now configured for `ssh.bnpi-hris.tech`; LAN SSH is verified on `192.168.254.148:22`; the client listener starts, but SSH through it returned connection refused, so Access authorization/login proof remains missing. |
