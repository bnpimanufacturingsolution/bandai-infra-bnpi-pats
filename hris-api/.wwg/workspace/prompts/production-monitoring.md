# Production Monitoring Prompt

## Purpose

Run read-only production monitoring and produce an evidence-based operations report.

## How to Use

Use when asked to monitor, inspect, review, assess, check health, audit production, summarize logs, analyze performance, or look for issues.

## Rules

- Production monitoring defaults to read-only-audit mode.
- Do not modify code, config, deployments, secrets, data, or infrastructure unless explicitly requested.
- Separate confirmed issues, watch-items, likely benign signals, and unknowns.
- Sampled logs must be described as sampled evidence.
- Recommendations must state evidence level.

## Output Format

Use `wiki-template/base/08-operations/operations-report-template.md`.
