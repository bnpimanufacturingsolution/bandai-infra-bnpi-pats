# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth, active Workspace tasks, or commitments until reviewed and promoted.

| ID | Date | Status | Recommendation | Evidence |
|---|---|---|---|---|
| REC-20260629-CF-TECH-TUNNEL-ACCOUNT | 2026-06-29 | Implemented | Put the `bnpi-hris.tech` Cloudflare zone and the `bnpi-hris` named tunnel in the same Cloudflare account, or create a new named tunnel inside the account that owns the `bnpi-hris.tech` zone. | Implemented by logging into the Cloudflare account that owns `bnpi-hris.tech`, creating tunnel `e3486f00-f974-46d3-9e11-911266749d00`, routing the `.tech` hostnames to it, and verifying public HTTP 200 checks. |
