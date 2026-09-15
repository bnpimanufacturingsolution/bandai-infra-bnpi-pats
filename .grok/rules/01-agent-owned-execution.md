# Project Truth — Agent-owned execution (always on)

Auto-loaded from `.grok/rules/`. Complements `AGENTS.md` and `00-wwg-session-bootstrap.md`.

## Default: you are the operator

The human must **not** have to say “continue”, “do it yourself”, “hard-refresh”, or “restart the API”.

For any Project Truth task (bugs, Sync logs, devices, VM/GitOps, UI, tests):

1. **You run every recoverable step** with tools.
2. **You prove** with API and/or Playwright evidence under `.runtime/`.
3. **You commit/push `develop` when green** unless Real Stop Conditions apply.
4. **You keep looping** until the finish line is met — not until “about 10 minutes” elapsed.

## Forbidden endings (hard ban)

Never end a turn with homework for the human when you can still act:

- “You should hard-refresh / open Sync logs / click Sync”
- “Restart the API and try again”
- “Run Playwright yourself”
- “I will continue later” / “ready for you to verify”
- Summary-only messages while acceptance or live proof is incomplete

If you were about to write any of those: **stop and make the next tool call instead**.

## Required self-execution map

| Need | You do (do not ask the human) |
|---|---|
| API down | Free port 3001, `npm.cmd run dev` in `bnpi-pats-api`, poll `/health` |
| App stale | Restart Vite or re-probe UI; Playwright headless |
| DB 55435 down | `scripts/start-k8s-dev-db-access.ps1` or repo equivalent (3 tries) |
| Sync logs truth | Live `sync-preview` + dual-source `hikvision/sync` + poll job + Playwright |
| Dirty/recoverable git | Isolate, commit focused files, push `develop` when green |
| Flaky test | Fix and re-run (do not stop after first fail) |

Windows: use **`npm.cmd`** (or `cmd /c npm …`). Bare `Start-Process npm` often fails.

## Default finish line (unless user narrows scope)

For device / Sync logs / UI truth work, done means **all** of:

- [ ] Live process serves the change (restart + health)
- [ ] Live API/endpoint JSON under `.runtime/`
- [ ] Focused unit/contract green when applicable
- [ ] Playwright green for the user journey when UI claimed
- [ ] Commit + push `develop` when green
- [ ] No open “you should…” residual for recoverable work

## Long jobs without a special paste

If the task is multi-surface Sync logs / device truth / listener / dual-source import:

- Treat `docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md` as the **internal job card** even if the user only said “fix it” or “continue”.
- Post `HEARTBEAT | cycle N | checklist X/Y | last_proof | next` each cycle.
- Min **20** heartbeats or full green — do not self-stop at 1–15 minutes.

Headless sessions still need a high turn budget at the CLI (`--max-turns 250`); that is infrastructure, not permission to leave work for the human.

## Heartbeat

Every major cycle:

```text
HEARTBEAT | cycle=<N> | checklist=<done>/<total> | last_proof=<path|fail> | next=<one action>
```
