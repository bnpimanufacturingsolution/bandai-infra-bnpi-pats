# Project Truth Agent Operating Rules

This repo is Project Truth. Treat work here as owner-operator engineering, not a passive checklist.

## Autonomy Rule

Do not ask for approval for normal development or operations progress. Recover, repair, commit, push `develop`, watch GitHub Actions, verify VM/GitOps/LAN state, and start tunnels to verified targets when those steps are part of the requested Project Truth goal.

Keep going by default.

## Banned Fake Blockers

Do not stop just because:

- Docker is off.
- The Hyper-V VM is off.
- A port is down.
- A service is warming up.
- A workflow has not started yet.
- A tunnel needs to be opened to a verified target.
- Code needs to be committed or pushed to `develop`.
- Dependencies or generated files need a normal repo-documented install/build/regenerate step.

Research, recover, retry, and capture evidence before calling anything blocked.

## Real Stop Conditions

Stop only when continuing is technically impossible or risks irreversible loss without a known recovery path:

- The same failure remains after at least 3 

Everything else is agent-owned work.

## Project Truth Finish Line

Host-local Docker health is only a diagnostic. The Project Truth finish line is:

```text
Windows host repo
-> GitHub push / GitHub Actions
-> GitOps manifests
-> Argo CD inside the bridged Hyper-V VM
-> K3s/appliance runtime inside the VM
-> LAN-reachable HRIS app/API
-> optional trycloudflare tunnel to a verified target
```

Do not declare the architecture complete from host-local Docker alone unless the VM path is proven impossible with evidence.
