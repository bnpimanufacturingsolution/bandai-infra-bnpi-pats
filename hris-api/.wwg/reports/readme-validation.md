# README Validation

## Summary

- Detected repository mode: IN_PROGRESS
- README found: yes
- Current README length: 46 lines
- Current README command count: 9
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
- Current Status
- License
- What It Is
- Why It Exists

## Missing Docs Links

- None.

## Local Link Findings

- None.

## Stale Status / Version Findings

- Package version 1.0.122 is not mentioned in README status.

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

- Quick Start: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 4 lines, 2 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- Common Commands: keep -> README.md
  Reason: Common Commands is a concise front-door summary, so it should remain in README.md.
  Signals: 5 lines, 3 commands, 0 links, mostly prose, front-door heading, concise section.
  Confidence: high.
- Postgres Migration Commands: keep -> README.md
  Reason: No routing-only content signals were detected; keep this README section unless a human review finds duplication elsewhere.
  Signals: 6 lines, 4 commands, 0 links, mostly prose, concise section.
  Confidence: high.
- For Agents: keep -> README.md
  Reason: For Agents is a concise front-door summary, so it should remain in README.md.
  Signals: 5 lines, 0 commands, 0 links, mostly bullets, front-door heading, concise section, WWG agent routing useful.
  Confidence: high.
- Documentation: keep -> README.md
  Reason: Documentation is a concise front-door summary, so it should remain in README.md.
  Signals: 8 lines, 0 commands, 0 links, mostly bullets, front-door heading, concise section.
  Confidence: high.

## Docs Files Recommended to Create or Update

- None.

## Planned README Edits

- Repair README governance findings.
- Handoff-first mode: README.md will not be changed unless explicit scaffold mode is used.

## Validation Findings

- LOW: readme-section-missing - README is missing expected front-door section: Install. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: Current Status. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: License. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: What It Is. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-section-missing - README is missing expected front-door section: Why It Exists. Recommendation: Add a concise section or route readers to the matching docs page.
- LOW: readme-status-stale - Package version 1.0.122 is not mentioned in README status. Recommendation: Review Current Status and version wording.

## Proposed README

```md
# HRIS API
HRIS API built with TypeScript, Express, and Prisma.
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
