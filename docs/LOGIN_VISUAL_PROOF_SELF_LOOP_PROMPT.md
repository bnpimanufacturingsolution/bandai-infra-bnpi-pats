# Project Truth Login Visual Proof Self-Loop Prompt

You are an autonomous repair/proof agent in this repo. Do not stop after one failed screenshot if there is a reasonable repair path. Keep a truth-first loop: inspect, patch or rebuild, reset the VM, wait 10 seconds, capture proof, judge the proof, and repeat until the visual proof passes or the same blocker repeats.

Current truth to preserve:

- The appliance source files that control the login/help text are:
  - `appliance/bin/project-truth-lan-summary.sh`
  - `appliance/profile.d/project-truth-hris-help.sh`
- A prior run proved observability endpoints were reachable, but the live login/help visual was not client-ready.
- Passing endpoint health is not enough. The visible VM console proof must also pass.

Required command:

```powershell
.\scripts\login-visual-proof-loop.ps1 -WaitSeconds 10 -MaxPasses 3 -ResetMode Reset -PatchLiveGuest -GuestIp <LAN_IP_IF_KNOWN>
```

If `-PatchLiveGuest` fails because VirtualBox guestcontrol is unavailable, do not claim success. Use one of these repair paths, then rerun the command above:

1. Patch through SSH if the VM IP and credentials work.
2. Patch through the console only as a last resort, and clear/reset the tty before capturing visual proof.
3. Rebuild or republish the image from the corrected repo source.
4. Restore/reset to the minimal known bootable VM state, apply the patch, then rerun proof.

Visual pass criteria:

- The proof folder is `.runtime\login-visual-proof\<timestamp>`.
- Open each `pass-*\screen-plus-10s.png`.
- PASS only when the visible login/help block is clean, line-broken, readable, and includes:
  - PROD login and API
  - DEV login and API
  - UAT login and API
  - Grafana
  - Prometheus
  - Loki
  - Useful commands
- FAIL if the screenshot shows literal `\n`, jammed URLs, missing observability URLs, or only post-login command/status output.
- FAIL if the screenshot shows visible bootstrap/proof commands after the banner, including `mkdir -p ~/.ssh`, `authorized_keys`, `KEY_READY`, pasted SSH keys, `docker compose`, `kubectl`, `sudo`, or any other automation that should have run through guestcontrol, SSH, systemd, or logs.

Loop policy:

- If screenshot is post-login status output, reset or power-cycle to get back to the login/banner surface and capture again.
- If screenshot contains visible typed automation commands, prefer VirtualBox guestcontrol or SSH for the repair path; do not use the console as the proof surface until it has been reset and is clean.
- If the source is fixed but live VM is not, patch the live VM or rebuild the VM. Do not blur those two states.
- If endpoints pass but visual proof fails, report `VISUAL_PROOF_FAILED_CURRENT_LIVE_VM`.
- If the same blocker repeats for three consecutive loop attempts, stop and report the exact blocker with proof paths.

Final answer format:

```text
Verdict: PASS or VISUAL_PROOF_FAILED_CURRENT_LIVE_VM or BLOCKED
Proof folder: .runtime\login-visual-proof\<timestamp>
What passed:
What failed:
Next exact repair command:
```
