# Task Router Prompt

## Purpose

Route a natural developer prompt into WWG structured execution.

## How to Use

Use this at the start of meaningful work when the request is not already a complete classified task.

## Rules

- Developers may prompt naturally. Agents must execute structurally.
- If the user asks to fix, implement, investigate, debug, update, create, add, test, commit, or push, execute by default when required access exists.
- Produce a ticket only when the user explicitly asks for ticket-only mode.
- Ticket-only mode applies to: "create a prompt", "draft a task ticket", "ticket only", "do not execute", or "planning only".
- Use read-only-audit mode for monitor, inspect, review, assess, check health, audit production, summarize logs, analyze performance, or look for issues.
- Use approval-gated mode for production configuration, compliance-sensitive behavior, pricing, billing, permissions, security posture, legal/trust messaging, public customer notices, data deletion/migration, or irreversible operations.

## Output Format

```md
Natural prompt:
Change category:
Primary workflow:
Secondary workflows:
Execution mode:
Evidence level:
Likely affected layers:
Artifact type:
Canonical family:
Template-vs-instance impact:
Canonical artifacts to inspect:
Validation expectations:
Public/user-facing surfaces to review:
Context/skill maintenance required:
Report expectations:
```
