# README Validation

## Summary

- Detected repository mode: IN_PROGRESS
- README found: yes
- Current README length: 202 lines
- Current README command count: 0
- Validation status: warn
- Doctrine mode: deterministic inspection
- Apply safe: no
- Final authorship: not requested

## Bloat Areas

- None.

## Phase / Pass Pollution

- None.

## Command Sprawl

- None.

## Missing Front-Door Sections

- Install
- Documentation
- Current Status
- License
- For Agents
- What It Is
- Why It Exists

## Missing Docs Links

- None.

## Local Link Findings

- Link: docs/TERRAFORM_HYPERV_ARCHITECTURE.md
  Target: docs/TERRAFORM_HYPERV_ARCHITECTURE.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md
  Target: docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md
  Exists: no
  Severity: low
  Recommended action: Create the linked file or remove/update the README link.
- Link: docs/OPERATIONS.md
  Target: docs/OPERATIONS.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/IMAGE_FORMATS.md
  Target: docs/IMAGE_FORMATS.md
  Exists: no
  Severity: low
  Recommended action: Create the linked file or remove/update the README link.
- Link: docs/HEALTHCHECKS.md
  Target: docs/HEALTHCHECKS.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md
  Target: docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/GITOPS_GH_WATCH_RUNBOOK.md
  Target: docs/GITOPS_GH_WATCH_RUNBOOK.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/SELF_HEALING_AND_DRIFT_RECOVERY.md
  Target: docs/SELF_HEALING_AND_DRIFT_RECOVERY.md
  Exists: yes
  Severity: info
  Recommended action: No action needed.
- Link: docs/INSTALLER_TEST_REPORT.md
  Target: docs/INSTALLER_TEST_REPORT.md
  Exists: no
  Severity: low
  Recommended action: Create the linked file or remove/update the README link.

## Stale Status / Version Findings

- Package version 1.0.0 is not mentioned in README status.

## Recommended README Outline

- Project name
- One-sentence description
- What It Is
- Why It Exists
- Core Model
- Install
- Start with an AI Agent
- For Agents
- Documentation
- Current Status
- License

## Section Routing Decisions

- Current Working Branch: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 3 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- Main Documents: move -> docs/infrastructure.md
  Reason: Infrastructure readiness, cloud tooling, env, and secret-handling details belong in the infrastructure guide.
  Signals: 9 lines, 0 commands, 9 links, mostly bullets, concise section, links to deeper docs, infrastructure detail.
  Confidence: medium.
- Normal CLI Flow: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 9 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- VHDX Autopilot: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 25 lines, 0 commands, 0 links, mostly prose.
  Confidence: medium.
- Installer Flow: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 6 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- Target Architecture: summarize-and-route -> docs/maintenance.md
  Reason: Maintenance doctrine and report workflow detail belong in the maintenance guide.
  Signals: 30 lines, 0 commands, 0 links, mostly prose, maintenance depth.
  Confidence: medium.
- Target Repo Shape: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 12 lines, 0 commands, 0 links, mostly prose.
  Confidence: medium.
- Image Format Targets: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 7 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- Ownership Rules: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 7 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- Verification Goal: move -> docs/infrastructure.md
  Reason: Infrastructure readiness, cloud tooling, env, and secret-handling details belong in the infrastructure guide.
  Signals: 44 lines, 0 commands, 0 links, mostly prose, infrastructure detail.
  Confidence: medium.
- Legacy Note: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 1 lines, 0 commands, 0 links, mostly prose, concise section.
  Confidence: high.

## Docs Files Recommended to Create or Update

- docs/infrastructure.md
- docs/maintenance.md

## Planned README Edits

- Route detailed sections out of README.md.
- Repair README governance findings.
- Handoff-first mode: README.md will not be changed unless explicit scaffold mode is used.

## Validation Findings

- LOW: readme-section-missing - README is missing expected front-door section: Install. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: Documentation. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: Current Status. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: License. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: For Agents. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: What It Is. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: Why It Exists. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-local-link-missing - README links to missing local target: docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md. Recommendation: Create the linked file or remove/update the README link.
- LOW: readme-local-link-missing - README links to missing local target: docs/IMAGE_FORMATS.md. Recommendation: Create the linked file or remove/update the README link.
- LOW: readme-local-link-missing - README links to missing local target: docs/INSTALLER_TEST_REPORT.md. Recommendation: Create the linked file or remove/update the README link.
- LOW: readme-status-stale - Package version 1.0.0 is not mentioned in README status. Recommendation: Review Current Status and version wording.

## Proposed README

```md
# Project Truth Hyper-V Terraform
This branch is the clean Hyper-V/Terraform direction for Project Truth, with a separate maintainer image-factory track for VirtualBox client artifacts.
## What It Is
This repository is prepared with WWG, which separates project truth, agent operating context, and governance checks so humans and agents can continue work from shared evidence.
## Why It Exists
It gives future maintainers a clear starting point: what the project is, how to start it, and where deeper project truth lives.
## Core Model
- Wiki = what is true
- Workspace = what agents should do now
- Governance = what must be checked
- CHANGELOG.md = what meaningfully changed
- AGENTS.md = how agents operate
## Install
```bash
npm install
npm run build
```
## Start with WWG

| Need | Use |
| --- | --- |
| Prepare an agent handoff | `wwg brief` |
| Check project health | `wwg status` |
| Repair or refresh context | `wwg maintain` |
| Run CI-safe checks | `wwg ci ...` |
| Use maintainer internals | `wwg dev ...` |

Use lifecycle commands first. Keep detailed command reference, CI examples, and maintainer internals in docs.

## For Agents

Before changing this repository, read `AGENTS.md` first. Use `.wwg/wiki/project-truth.md` for canonical truth, `.wwg/workspace/current-task.md` for current work, and `.wwg/governance/drift-guard.md` for safety rules.

## Documentation
- `.wwg/wiki/project-truth.md` for canonical project truth.
## Current Status
Active project. Review the documentation map and changelog for current details.
## License
See [LICENSE](LICENSE).
```

## WWG Truth Synchronization

- Task mode: README validate
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: NONE
- Canonical files changed:
  - None; README reports are generated review evidence, not canonical Wiki Truth.
- Implementation discoveries synced:
  - None; report output remains evidence only until separately accepted.
- Remaining stale context:
  - Review README validation findings above.
- Generated By: WWG
- Generated At: 2026-07-17T00:39:49.433Z
- Canonical Truth Impact: none; report evidence does not rewrite `.wwg/wiki`.
- Requires Review: review findings or candidates before promoting any semantic truth.
- Vorter runtime evidence accepted as WWG truth: NO

