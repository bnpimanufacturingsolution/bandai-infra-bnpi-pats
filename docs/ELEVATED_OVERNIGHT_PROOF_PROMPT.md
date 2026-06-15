# Elevated Overnight Prompt: Prove Project Truth End To End

## Mission

Run the Project Truth proof through the legitimate Windows UAC elevation path. Do not use UAC bypass tools. Do not fake a VHDX, VM, health response, SSH result, Kubernetes state, or Argo CD state.

The normal architecture remains:

```text
prebuilt Project Truth Hyper-V VHDX
  -> Terraform on the Windows host creates/manages the VM
  -> VM boots K3s + Argo CD
  -> Argo CD syncs DEV/UAT/PROD GitOps manifests
  -> verifier proves host-local, LAN, SSH, Kubernetes, and Argo CD health
```

## Working Folder

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

## Legit Elevation Rule

Use the checked-in self-elevating runner:

```powershell
.\scripts\project-truth.ps1 run-elevated-proof -Apply -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx -WatchGitHubActions
```

If Windows shows a UAC prompt, approve it. The runner relaunches under Administrator, writes logs under `.runtime\overnight\<timestamp>`, and continues without needing a second manual command.

Do not use UACME, UAC bypasses, token theft, policy weakening, or any other elevation bypass.

## Expected Evidence

The runner must create:

```text
.runtime\overnight\<timestamp>\elevated-proof.log
.runtime\overnight\<timestamp>\summary.md
.runtime\overnight\<timestamp>\screenshots\
```

It must also create per-step logs for installer, shortcuts, doctor, Terraform, VM facts, guest IP discovery, health, inside-VM proof, repair, and GitHub Actions where applicable.

## Stop Conditions

Stop only on SUCCESS, TIMEOUT, or a real BLOCKED state with evidence.

Correct image blocker:

```text
BLOCKED ON IMAGE ARTIFACT, NOT REPO IMPLEMENTATION.
Real Hyper-V boot and health are pending until a Project Truth VHDX exists at:
C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx
```

Next exact command after placing the artifact:

```powershell
.\scripts\project-truth.ps1 run-elevated-proof -Apply -ImagePath C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx -WatchGitHubActions
```

## Required Final Answer

Report:

```text
Branch:
Commit:
Remote:
GitHub Actions:
Installed path:
ProgramData path:
Shortcut proof:
Screenshot folder:
Selected VHDX:
VHDX checksum:
Terraform init:
Terraform validate:
Terraform plan:
Terraform apply:
VM name:
VM switch:
VM IP:
Host-local DEV/UAT/PROD health:
LAN DEV/UAT/PROD health:
SSH:
Inside VM hostname/IPs:
Docker state:
Kubernetes nodes:
Kubernetes DEV/UAT/PROD pods:
Kubernetes DEV/UAT/PROD services:
Argo CD apps:
Self-repair result:
Truth:
Drift:
Gaps:
Next exact command:
```

Use PROVEN, BLOCKED, SKIPPED BY SAFETY GATE, and NOT TESTED labels. Do not call the proof successful unless VM boot, guest IP, host-local health, LAN health, SSH, Kubernetes, and Argo CD proof all pass with real output.
