# Project Truth Agent Operating Rules

This repo is Project Truth. Treat work here as owner-operator engineering, not a passive checklist.

## Autonomy Rule

Do not ask for approval for normal development or operations progress. Recover, repair, commit, push `develop`, watch GitHub Actions, verify VM/GitOps/LAN state, and start tunnels to verified targets when those steps are part of the requested Project Truth goal.

Keep going by default.

## Banned Fake Blockers

Do not stop just because:

- Docker is off.
- The Hyper-V VM is off.
- A port is down.
- A service is warming up.
- A workflow has not started yet.
- A tunnel needs to be opened to a verified target.
- `agent-browser` is missing from PATH.
- Code needs to be committed or pushed to `develop`.
- Dependencies or generated files need a normal repo-documented install/build/regenerate step.

Research, recover, retry, and capture evidence before calling anything blocked.

## Browser Verification Tool

When browser verification is requested, prefer `agent-browser`.

On this Windows host the npm global prefix is:

```text
C:\home\izu\.npm-global
```

If `agent-browser` is not found, repair it instead of stopping:

```powershell
npm install -g agent-browser@latest
$npmGlobal = (npm config get prefix).Trim()
if (($env:Path -split ';') -notcontains $npmGlobal) {
  $env:Path = "$npmGlobal;$env:Path"
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($userPath -split ';') -notcontains $npmGlobal) {
    [Environment]::SetEnvironmentVariable('Path', "$npmGlobal;$userPath", 'User')
  }
}
agent-browser --version
```

## Real Stop Conditions

Stop only when continuing is technically impossible or risks irreversible loss without a known recovery path:

- The same failure remains after at least 3 documented recovery attempts using different plausible fixes.
- The next action could destroy, overwrite, or leak client/user data and there is no verified backup or rollback path.
- Required credentials, physical device access, or network access are absent and cannot be recovered from documented local/VM/GitOps procedures.
- A command would require guessing unknown production secrets or inventing evidence.

Everything else is agent-owned work.

## Execution Loop Template

Use `Agent-Meta-Prompt-Template.md` for substantial or drift-sensitive work. Start with discovery, read AGENTS/WWG context, produce a current-state report, plan, review the plan, execute in loops, validate, correct mismatches, and only close out with evidence.

Do not call a task done because one local command passed. Keep going until the requested finish line is met, a real stop condition above is reached, or the user explicitly changes scope.

For prompts that mention drift, device truth, VM/GitOps state, LAN state, production evidence, or multi-step repair, agents must use the template's phase loop:

- Discovery/current-state report first.
- Plan and plan review before edits.
- Execute in passes.
- Validate against the requested finish line, not just local convenience.
- Retry or recover through at least three documented plausible fixes before calling a recoverable issue blocked.
- Record evidence and remaining drift in the handoff.

When WWG exists, start from `.wwg/reports/wwg-agent-handoff.md`, then use `Agent-Meta-Prompt-Template.md` to structure the actual execution prompt.

## Project Truth Finish Line

Host-local Docker health is only a diagnostic. The Project Truth finish line is:

```text
Windows host repo
-> GitHub push / GitHub Actions
-> GitOps manifests
-> Argo CD inside the bridged Hyper-V VM
-> K3s/appliance runtime inside the VM
-> LAN-reachable HRIS app/API
-> named Cloudflare Tunnel for verified public `bnpi-hris.tech` targets
```

Do not declare the architecture complete from host-local Docker alone unless the VM path is proven impossible with evidence.

## Canonical Role Guard

Admin device/configuration work is admin-role work. For `/admin/configuration/devices`, ZKTeco device events, runtime health, VM/GitOps drift, and repair operations, use admin / `hris-admin` as the actor and mental model. Do not default to `hris-hr-manager` for these surfaces unless the task explicitly targets an HR workflow or the relevant code/docs require the HR manager role.

<!-- WWG_GENERATED:EXISTING_PROJECT_ADOPTION_RULE:START -->
## Existing Project Adoption Rule

For new projects:
- Wiki leads code.

For existing projects:
- Code/docs/config reveal operational reality.
- WWG converts that reality into governed truth.
- Inferred truth must be labeled.
- Unclear or conflicting reality must be marked as `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE`.

Do not treat adopted wiki content as fully confirmed until reviewed.

Developers may prompt naturally. Agents must execute structurally.

## Required WWG Reading Order

Before modifying code, read compact active surfaces when present, then full canonical sources: `.wwg/wiki/project-truth-summary.md`, `.wwg/wiki/terminology-summary.md`, `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning, `.wwg/workspace/current-task.md`, `.wwg/governance/drift-guard.md`, `README.md`, and relevant source files.

## Principle Management

Principles live in `.wwg/wiki/principles/`.

Principles are durable, high-friction mutable guidance documents that explain why the project is designed a certain way and how agents should reason about future work.

Project Truth tells agents what is true. Principles tell agents how to think. Governance tells agents what to check. Workspace tells agents what to do now.

Before making changes that affect product architecture, naming, positioning, agent behavior, governance, project structure, UX philosophy, or long-term design direction, review relevant principle files.

Explicit principle updates are required when the user says something like:

- "This is a principle."
- "Add this to our guiding principles."
- "Save this as design doctrine."
- "This should guide future architecture."
- "This is how agents should think about the project."
- "This should be maintained going forward."

Implicit principle review is required when a task affects durable reasoning, such as changing product architecture, naming or terminology, major system relationships, governance behavior, agent behavior, positioning, project structure, or cross-project reusable rules.

Agents must not casually rewrite active principles for one-off implementation details, bug fixes, temporary experiments, or ambiguous user comments.

If a possible principle change is uncertain, record it as a candidate principle or mention it in a handoff/report instead of modifying an active principle directly.

## Task Mode Classification

Classify each meaningful change before implementation as copy-only, docs-only, meaningful feature, bug fix, regression repair, high-risk, non-software, or mixed.

If the request contradicts Project Truth or touches payment, auth, authorization, security, persistence, database/user data, production deployment, destructive actions, or compliance-sensitive behavior, pause and plan before implementation.

## Wiki-First Flow

Use for features, architecture, product decisions, UX standards, governance, and unclear requests.

## Code-Discovery Flow

Use for bugs, regressions, incidents, performance issues, and root-cause analysis.

## Truth Synchronization Rule

Sync code, Wiki, Workspace, Governance, and reports when implementation reveals product truth. Project Truth must not be silently overwritten, terminology changes require terminology docs, and accepted behavior changes require Project Truth or requirements updates.

## Non-Negotiable Close-Out Rule

Do not close out while relevant canonical truth, terminology, mock/demo boundaries, or governance review remain stale.

## Test Enforcement

Meaningful feature behavior requires meaningful tests. Bug fixes require regression tests whenever practical. Removed or weakened tests must be flagged. If no tests are added for meaningful work, document why. Non-software work may use decision logs, manual verification, approval checklists, or Project Truth updates when software tests are not the right evidence.

## Recommendation Capture

Before closing out meaningful work, check whether the task revealed future work outside the approved scope. If yes, add or update `.wwg/governance/recommendation-registry.md`, keep the entry concise and evidence-based, leave status as `Proposed` unless explicitly instructed otherwise, and do not implement it unless it belongs to the current task. If no, state: "No new recommendations were identified." Recommendations are candidate work only; they are not accepted project truth, active Workspace tasks, or commitments until reviewed and promoted.

## Natural Prompt Preference

Users may prompt naturally, for example: "Sync Project Truth with the latest docs and reports.", "Reconcile this implementation back to Project Truth.", "Pause and create a planning review before implementation.", or "Add meaningful regression tests for the fixed bug." CLI commands are backup for technical users.
<!-- WWG_GENERATED:EXISTING_PROJECT_ADOPTION_RULE:END -->
