# Public Discovery Review

## Purpose

Review SEO, GEO, AI crawler, and public route discovery readiness.

## How to Use

Use when public routes, metadata, canonical URLs, sitemap, robots.txt, llms.txt, structured data, or index/noindex policy changes.

## Rules

- Public discovery is part of public-surface review.
- Canonical production host must be declared.
- Staging, preview, temporary, private, admin, auth, operational, redirect-only, and ephemeral routes are excluded/noindex by default.
- Public metadata must match shipped truth.
- Structured data must truthfully describe the visible page.
- Public discovery context should be updated when canonical route, metadata, sitemap, robots.txt, llms.txt, structured data, or index/noindex truth changes.

## Review Checklist

- Canonical URLs use production host.
- Sitemap contains only approved canonical URLs.
- robots.txt references canonical sitemap.
- Indexable pages have titles, descriptions, and canonical URLs.
- Open Graph and Twitter/X URLs match canonical URL.
- Private/admin/auth/ephemeral routes are noindex.
- llms.txt contains only approved canonical public routes.
- Structured data matches visible page truth.

## Output Format

Report route class, discovery surface, evidence, approval needs, and required fixes.

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
