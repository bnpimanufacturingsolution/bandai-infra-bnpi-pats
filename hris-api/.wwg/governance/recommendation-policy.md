# WWG Recommendation Policy

## Purpose

WWG preserves useful future work without allowing agent recommendations to silently change project scope.

Agents, audits, and maintenance runs may discover important improvements while completing unrelated work. These recommendations should be captured, reviewed, and promoted intentionally.

## Core Principles

1. Recommendations are not truth.
2. Recommendations are not active work.
3. Recommendations are not commitments.
4. Recommendations must not expand the current task unless explicitly approved.
5. Recommendations should preserve useful agent, human, audit, and maintenance insights.
6. Accepted recommendations should eventually connect to workspace work, proposals, issues, governance updates, or regression tests.

## When to Add a Recommendation

Add a recommendation when the work reveals:

- missing regression coverage
- missing or outdated documentation
- missing wiki truth
- possible technical debt
- useful future features
- architecture improvements
- governance gaps
- security or compliance concerns
- UX improvements
- non-technical process improvements
- repeated manual work that could be automated
- unclear ownership or decision history
- a useful idea that is out of scope for the current task

## When Not to Add a Recommendation

Do not add a recommendation for:

- work already completed in the current task
- random speculation without evidence
- ideas unrelated to the project
- duplicate recommendations unless adding new evidence
- tasks that should be fixed immediately as part of the current scope

## Required Fields

Every recommendation should include at least:

- ID
- Name
- Type
- Source
- Reason
- Suggested Timing
- Impact
- Effort
- Status
- Created date

## Agent Closeout Requirement

At the end of meaningful work, agents must perform a Recommendation Capture check.

The closeout must answer:

1. Did this work reveal useful future work outside the current task scope?
2. If yes, was a recommendation added or updated in `.wwg/governance/recommendation-registry.md`?
3. If no, state: "No new recommendations were identified."

If yes:

- add or update an entry in `.wwg/governance/recommendation-registry.md`
- keep the recommendation concise and evidence-based
- leave status as `Proposed` unless explicitly instructed otherwise
- do not implement it unless it belongs to the current task

If no:

- state in closeout: "No new recommendations were identified."

The Recommendation Capture check must not silently expand the approved task scope.

## Review Requirement

Recommendations should be reviewed during maintenance, planning, release preparation, or governance review.

High-impact or stale recommendations should be revisited before major releases.

Maintain may summarize recommendation counts, high-impact open items, stale `Review By` dates, and items needing human review. Audit and handoff reports may remind agents to capture or review recommendations.

These reports must not score, promote, implement, rewrite statuses, or convert recommendations into active work automatically.
