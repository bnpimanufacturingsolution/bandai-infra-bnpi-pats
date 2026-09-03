<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-app/.wwg/workspace/context/chain-state-template.md) -->
# Chain State Template

Status: ACTIVE
Last reviewed: 2026-06-26

## Purpose

Provide a compact pass-to-pass state packet for prompt chaining.

Use this instead of long narrative handoffs for intermediate passes inside an active chain. Keep one state packet per active chain in local scratch space or the agent message. Commit only reusable templates and durable outcomes.

This packet is a companion to `.wwg/workspace/prompts/agent-meta-prompt-template.md`, not a replacement for chain kickoff planning or final handoff formatting.

### bandai-infra develop notes (same section: Purpose)

Use this instead of long narrative handoffs. Keep one state packet per active chain in local scratch space or the agent message. Commit only reusable templates and durable outcomes.
## State Packet

```yaml
chain:
  name: ""
  task_mode: ""
  risk_level: ""
  repo_scope:
    app: false
    api: false
  current_pass: 1
  total_passes: 1

context:
  tier0_read: true
  task_slice: ""
  extra_docs_read: []
  intentionally_skipped:
    - "generated reports unless validating WWG"
    - "old handoffs unless debugging history"

source_truth:
  constraints: []
  conflicts: []
  needs_confirmation: []

work:
  completed: []
  changed_files: []
  decisions: []
  blocked: []

validation:
  passed: []
  failed: []
  not_run:
    - command: ""
      reason: ""

next:
  pass_goal: ""
  required_inputs: []
  likely_files: []
  risks: []
  stop_conditions: []
```

## Handoff Rules

- Keep the state packet under 50 lines when practical.
- Store verbose command output in reports, not the state packet.
- Include failed command snippets only when the next pass must diagnose them.
- Use the full meta-template for chain kickoff and final close-out; use this packet for intermediate pass continuity.
- Do not restate global safety rules when they already live in `.wwg/governance/development-operating-model.md`.
- Do not commit task-specific state packets unless the project owner asks for an auditable planning artifact.
