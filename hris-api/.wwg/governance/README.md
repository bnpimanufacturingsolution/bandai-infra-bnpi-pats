# Governance Layer

## Purpose

Define validation, audit, release, and enforcement expectations.

## Contents

- Validation plans turn requirements into checks
- Quality gates define minimum completion criteria
- Audit logs preserve review history
- Truth capture checks whether natural prompts, uploads, code investigation, or operational evidence introduced new canonical truth
- Context drift detection checks terminology, architecture, source-of-truth, skill, design, test, and public content drift
- Drift guard defines required pre-change and post-change context checks against project truth, terminology, and the current task
- Truth Alignment Status explains whether change is accepted requirement evolution, undocumented requirement change, documentation lag, implementation drift, regression/quality drift, or terminology drift
- Truth Sync and Reconciliation explains how to decide between accepting new truth, reconciling drift, planning first, or repairing regression/quality gaps
- Test Enforcement classifies implementation changes by test obligation and flags missing, weak, removed, or missing regression tests
- Maintenance review confirms classification, artifact review, context updates, skill updates, validation, reports, and commit readiness
- Canonical artifact review prevents duplicate truth and records unresolved conflicts
- Public surface review checks user-facing communication and approval needs
- Regression guardrail catalog preserves learning from missed bugs, incidents, and sign-off gaps
- Recommendation policy and registry preserve useful future work as governed candidates without treating it as accepted truth or active scope
- Public discovery review checks SEO, GEO, AI crawler, canonical URL, sitemap, robots.txt, llms.txt, structured data, and index/noindex readiness
- Operational readiness review checks runtime, monitoring, deployment, support, and approval gates
- Evidence standards classify claims as confirmed, likely, hypothesis, or unknown
- Truth conflict resolution prevents agents from silently choosing between docs and code/runtime behavior
- Enforcement levels define advisory, agent-required, local validation, CI warning, CI blocking, and approval-gated controls
- Upstream template defaults should stay separate from the generated project's `.wwg/governance/` files

## Maintenance

Keep this page current when files are added, renamed, or promoted into compiled project truth.

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
