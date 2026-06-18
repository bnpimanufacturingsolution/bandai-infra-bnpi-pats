# Human Approval Matrix

## Purpose

Define a governance artifact for WWG projects.

## How to Use

Fill this file from requirements, architecture, domain rules, and selected profiles.

## Rules

Checks must be observable, evidence-based, and tied to approval expectations.

## Approval-Gated Changes

Require explicit approval before release-impacting changes that affect:

- Production configuration
- Compliance-sensitive behavior
- Pricing
- Billing
- Permissions
- Security posture
- Legal/trust messaging
- Public customer notices
- Data deletion or migration
- Irreversible operations

## Execution Modes

- `execution-first`: agent may implement when access and request allow.
- `ticket-only`: agent drafts only.
- `read-only-audit`: agent gathers evidence and reports without modifying code/config/deployments.
- `approval-gated`: agent prepares a plan, draft, or recommendation and waits for approval before release-impacting action.

Level 5 enforcement applies conceptually whenever approval-gated changes are documented, even before full automation exists.

Template upgrades that change generated-project defaults may require approval or review before release, especially when migrations are needed.

## Output Format

Owners, checks, evidence, status, and follow-up actions.

## Generated Governance Context

<!-- WWG_GENERATED:SELECTED_PROFILE_GATES:START -->
- No profile-specific governance source found yet.
<!-- WWG_GENERATED:SELECTED_PROFILE_GATES:END -->

<!-- WWG_GENERATED:APPROVAL_GATED_AREAS:START -->
- Governance level: standard
- Production configuration, compliance-sensitive behavior, pricing, billing, permissions, security posture, legal/trust messaging, public customer notices, data deletion/migration, and irreversible operations require approval-gated handling.
- Selected profiles reviewed: None
<!-- WWG_GENERATED:APPROVAL_GATED_AREAS:END -->

<!-- WWG_GENERATED:EVIDENCE_STANDARDS_SUMMARY:START -->
Claims about root cause, fixes, operational state, drift, release readiness, and approval decisions must cite code paths, logs, tests, config, database state, deployment output, source artifacts, or reproduction evidence.
<!-- WWG_GENERATED:EVIDENCE_STANDARDS_SUMMARY:END -->
