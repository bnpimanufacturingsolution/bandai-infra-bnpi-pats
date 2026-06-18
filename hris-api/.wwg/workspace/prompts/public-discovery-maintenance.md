# Public Discovery Maintenance Prompt

## Purpose

Review SEO, GEO, AI crawler, canonical route, and public metadata readiness.

## How to Use

Use when public routes, docs, metadata, sitemap, robots.txt, llms.txt, structured data, or index/noindex policies change.

## Rules

- Public discovery is part of the broader public-surface workflow.
- Canonical production host must be declared.
- Private, admin, auth, operational, redirect-only, ephemeral, staging, and preview routes are noindex/excluded by default.
- Public metadata must match shipped truth.

## Output Format

```md
Canonical production host:
Routes reviewed:
Index/noindex decisions:
Sitemap validation:
robots.txt validation:
llms.txt validation:
Metadata validation:
Structured data validation:
Approval gate required:
Known gaps:
```
