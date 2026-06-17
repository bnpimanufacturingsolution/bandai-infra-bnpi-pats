# WWG Recommendation Registry

This registry captures useful future work discovered by agents, humans, audits, reviews, maintenance runs, retrospectives, and implementation closeouts.

Recommendations are not project truth until accepted.
Recommendations are not active work until promoted into the workspace backlog, current task, proposal, issue, or implementation plan.
Agents may add recommendations, but they must not treat recommendations as authorization to expand scope.

## Status Lifecycle

| Status | Meaning |
|---|---|
| Proposed | Captured but not reviewed |
| Accepted | Reviewed and considered useful future work |
| Promoted | Moved into backlog, proposal, issue, or current task |
| In Progress | Actively being worked on |
| Done | Completed and reconciled into relevant WWG files |
| Deferred | Useful, but intentionally postponed |
| Rejected | Reviewed and intentionally declined |
| Superseded | Replaced by another recommendation |

## Recommendation Registry

| ID | Name | Type | Source | Reason | Suggested Timing | Impact | Effort | Risk If Ignored | Status | Owner | Created | Review By | Links |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REC-0001 | Example recommendation | Governance | Agent closeout | Explain why this should be revisited | Next minor release | Medium | Medium | Useful improvement may be forgotten | Proposed | Unassigned | YYYY-MM-DD | YYYY-MM-DD | |

## Entry Guidance

Each recommendation should answer:

- What is being recommended?
- Why was it discovered?
- What evidence supports it?
- When should it be revisited?
- What is the risk if ignored?
- Should it become a backlog item, proposal, ADR, regression test, documentation update, or governance rule?

## Promotion Rule

A recommendation may only become active work when it is explicitly promoted into one of the following:

- `.wwg/workspace/current-task.md`
- a backlog or planning artifact
- a proposal under `docs/proposals` or `.wwg/proposals` if present
- an issue tracker item
- an implementation prompt
- an accepted governance rule
- a regression test plan
