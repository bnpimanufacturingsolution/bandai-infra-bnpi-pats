# Recommendation Registry

Recommendations are proposed follow-up work only. They are not accepted project truth or active scope until reviewed.

| ID | Status | Recommendation | Evidence | Scope |
|---|---|---|---|---|
| REC-20260629-001 | Proposed | Align Terraform SSH configuration with the running Hyper-V VM: either update Terraform docs/vars to use LAN SSH port `22`, or configure the VM/network path to expose the documented `2222`. | On 2026-06-29, `10.184.38.91:22` was open and `10.184.38.91:2222` was closed. `%ProgramData%\ProjectTruth\config\project-truth.json` was repaired for current CLI use, but `terraform-hyperv/terraform.tfvars` still lists SSH port `2222`. | Hyper-V runtime configuration |
| REC-20260629-002 | Completed | Add or recover the intended `infra` SSH credential path for the current Hyper-V proof VM so agents can verify inside-VM GitOps/K3s/Argo CD state without manual credential guessing. | Completed on 2026-06-29 by validating `infra / infra` through pinned-host-key `plink`, installing `%USERPROFILE%\.ssh\node-health-appliance_ed25519.pub` for `infra`, and proving Windows OpenSSH key login to `infra@10.184.38.91`. | VM access and verification |
| REC-20260629-003 | Proposed | Run a focused GitOps/K3s/Argo CD health repair pass now that SSH access is working. | On 2026-06-29, `verify-gitops-state -GuestIp 10.184.38.91` reached the VM over SSH and listed Argo CD Applications, but sync statuses were `Unknown`, runtime app health included `Degraded` and `Progressing`, and a Kubernetes API read returned `127.0.0.1:6443` connection refused. | GitOps runtime health |
