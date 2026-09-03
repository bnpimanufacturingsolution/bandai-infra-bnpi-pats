# Runtime Infrastructure Prompt

## Purpose

Route runtime, deployment, database, environment, config, worker, queue, cache, and infrastructure work through evidence-based investigation.

## How to Use

Use for deployment/runtime behavior, local-vs-deployed differences, database connectivity, provider runtime failures, schema drift, worker failures, queue reliability, cache divergence, or config issues.

## Rules

- Runtime suspects are hypotheses until confirmed by logs, config, reproduction, or targeted checks.
- "Works locally" is not sufficient proof of architectural correctness.
- Deployment fixes must not mask authoritative backend defects with client-side workarounds.
- Approval may be required for production configuration, secrets, data migration, or irreversible operations.

## Output Format

```md
Change category:
Execution mode:
Affected runtime layers:
Evidence level:
Confirmed root cause or hypothesis:
Local vs deployed comparison:
Authoritative backend flow traced:
Fix plan or fix applied:
Validation:
Approval gate required:
Maintenance updates:
```
