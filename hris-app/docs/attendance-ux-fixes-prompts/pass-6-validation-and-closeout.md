# Pass 6 of 6 — Validation, Truth Sync, Close-Out

```txt
You are executing pass 6 of 6 for attendance-ux-fixes.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: full-repo quality gate + WWG close-out
- Repo scope: APP
- Risk level: LOW

INPUT STATE
<PASTE PASS 5's RETURNED STATE PACKET HERE>

PASS GOAL
Run the full deployable quality gate across all changes from Passes 2-5,
fix any cross-pass regressions, sync WWG truth/workspace surfaces, log the
deferred HR-initiated-time-adjustment capability as a recommendation
(explicitly NOT implemented in this chain), and produce the final
handoff.

LIKELY FILES
- .wwg/workspace/current-task.md (append a new dated section summarizing
  this chain, following the existing entry format already in the file)
- .wwg/governance/recommendation-registry.md (if it exists — add an entry
  for "HR-initiated TIME_ADJUSTMENT request creation requires API
  authorization change" and "compensatoryLeaveCredit needs a distinct
  skipReason for the zero-delta case, not just NO_COMPENSATORY_LEAVE_POLICY";
  if the file does not exist, note that in the handoff instead of creating
  a new governance surface unprompted)
- output/reports/ (if a curated report is warranted; optional for a
  LOW-risk app-only chain — use judgment, do not over-produce artifacts)
- docs/testing-coverage-matrix.md / docs/testing-strategy.md (update only
  if new test files were added in Passes 2-5 and these docs track app
  test coverage by area, per existing project convention)

ACCEPTANCE CRITERIA
- npm run quality:ci passes (test obligations, focused test typecheck,
  full Vitest suite, Playwright smoke, production build).
- All five issues from docs/attendance-ux-fixes-prompts/00-chain-plan.md
  are verifiably fixed: re-check each acceptance criterion list from
  Passes 2-5 against the final code state, not just "tests passed."
- .wwg/workspace/current-task.md has a new section documenting this
  chain: status COMPLETE, what changed, validation results, and the
  explicit scope boundary (HR-initiated time-adjustment creation was
  deliberately NOT built).
- A recommendation entry exists (in the registry if present, otherwise in
  the current-task.md follow-up notes) for the two deferred backend items
  identified during discovery.
- No ../hris-api file was modified anywhere in this chain.
- No production/shared data mutation, deployment, credential change, or
  destructive command was executed at any point.

VALIDATION
- npm run quality:ci
- npx @homedesk/wwg validate (only if current-task.md or other WWG
  surfaces were edited this pass — skip if no WWG context changed)

STOP CONDITIONS
- Stop if npm run quality:ci fails for reasons unrelated to Passes 2-5's
  changes (pre-existing debt) — distinguish pre-existing failures from
  regressions this chain introduced; do not silently fix unrelated
  pre-existing failures as part of this chain's scope.
- Stop if any pass's diff touched ../hris-api — that would violate this
  chain's explicit app-only scope; revert and re-plan if found.

HANDOFF
Produce the full Final Handoff Format from
.wwg/workspace/prompts/agent-meta-prompt-template.md section 9:
Final Status, Summary, Task Classification, Files Changed, Files
Intentionally Not Changed, Truth/Governance Surfaces Updated, Validation
Performed, Test Close-Out, Evidence, Drift Review, Changelog, Warnings/
Risks, Acceptance Review, Recommendations, Recommended Next Step.
```
