# Context Drift Detection

## Purpose

Define checks for detecting drift between canonical truth, implementation, workspace context, skills, governance, and user-facing surfaces.

## How to Use

Run these checks during maintenance review, release readiness, incidents, and after canonical decisions.

## Rules

- Do not leave docs, skills, context, and implementation drifting after a canonical decision.
- Record unresolved drift in reports and contradictions.
- Resolve canonical truth before updating derived artifacts when truth conflicts.

## Checks

| Drift Type | Check |
|---|---|
| Terminology drift | Product terms use the glossary canonical name across server, client, docs, admin surfaces, public pages, and reports. |
| Architecture drift | Implementation still matches system overview, data model, integration map, and ADRs. |
| Source-of-truth drift | Authoritative systems remain authoritative; caches, queues, pub/sub, and projections do not silently become hidden sources of truth. |
| Skill drift | Reusable workflows in skill files match current implementation and governance expectations. |
| Design drift | UI behavior matches design principles, screens, user journeys, loading states, empty states, responsive rules, and canonical design files such as `DESIGN.md` when present. |
| Test drift | Tests cover current requirements, product invariants, bug fixes, and quality gates. |
| Public content drift | Public docs, release notes, marketing pages, admin copy, and help text do not contradict current product truth. |
| Guardrail drift | Regression guardrail catalog and sign-off workflow reflect known misses and validation blind spots. |
| Generated-section drift | Generated markers are stable, non-overlapping, and human-written content outside markers is preserved. |
| Runtime drift | Deployed runtime behavior, config, secrets, migrations, workers, queues, or caches diverge from documented architecture or Runtime Truth. |
| Discovery drift | Public metadata, canonical URLs, sitemap, robots.txt, llms.txt, structured data, or index/noindex policy diverges from public truth. |
| Evidence drift | Reports present hypotheses as confirmed facts or omit evidence paths. |
| Canonical context drift | Project master context or dedicated context files no longer reflect current canonical truth. |
| Reference-history drift | Historical reports are edited as current guidance instead of being promoted through canonical docs. |
| Truth-conflict drift | Code/runtime behavior and docs disagree without recorded evidence, decision, or resolution. |
| Template-vs-project drift | Upstream template defaults are mistaken for accepted local project truth, or local project truth is overwritten by generic defaults. |

## Output Format

Drift findings should include evidence, the canonical artifact, affected derived artifacts, recommended fix, owner, and follow-up date.

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
