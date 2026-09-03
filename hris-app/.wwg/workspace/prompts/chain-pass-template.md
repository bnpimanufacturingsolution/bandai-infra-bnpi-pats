# Chain Pass Prompt Template

Status: ACTIVE
Last reviewed: 2026-06-26

## Purpose

Reusable prompt structure for context-efficient WWG prompt chains.

Use this template for intermediate passes in medium-risk, high-risk, multi-step, or cross-repo prompt chains. The template should stay small; stable rules live in WWG governance and context files.

Use `.wwg/workspace/prompts/agent-meta-prompt-template.md` for chain kickoff framing and final close-out. Use this file only for the in-between execution passes.

## Prompt

```txt
You are executing pass <N> of <TOTAL> for <CHAIN_NAME>.

GLOBAL CONTRACT
- Follow AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: <TASK_SLICE_FROM_TASK_CONTEXT_INDEX>
- Repo scope: <APP/API/CROSS_REPO>
- Risk level: <LOW/MEDIUM/HIGH>

INPUT STATE
<PASTE COMPACT STATE PACKET ONLY>

PASS GOAL
<ONE OR TWO SENTENCES>

LIKELY FILES
- <file or folder>

ACCEPTANCE CRITERIA
- <behavior or artifact>
- <validation expectation>
- <truth/governance sync expectation>

VALIDATION
- <focused command>
- <broader command if needed>

STOP CONDITIONS
- Stop if Project Truth conflicts with the requested change.
- Stop before production/shared data mutation, deployment, credential changes, deletion, or irreversible operations.
- Stop if required context is missing and a reasonable safe assumption is not possible.

HANDOFF
Return an updated compact state packet. Summarize passing tests by command and result. Include only failing snippets needed by the next pass.
```

## Usage Notes

- One pass should have one clear job.
- Passes should hand off decisions and changed files, not transcript history.
- This is the compact execution-pass companion to the full agent meta-template, not a standalone replacement for kickoff planning or final handoff.
- Full standalone prompts are reserved for external agent runs where WWG context is unavailable.
- If the next pass is in the same conversation, paste only the updated state packet and next pass goal.
