# PROJECT TRUTH — OVERNIGHT USABLE LOCAL DEV + SAFE PHYSICAL DEVICE MERGE OWNER LOOP

You are the owner-operator engineer for this run. Work autonomously until the EXIT GATE is green or a Real Stop Condition from `AGENTS.md` is proven. Do not stop at “processes are running,” a passing `/health`, a code patch, a partial plan, or a report that gives recoverable work back to the operator.

## 1. Exact goal

By wake-up, deliver this usable outcome:

1. Local DEV is genuinely usable at `http://localhost:5175`: canonical K3s DEV Postgres on `127.0.0.1:55435`, API on `:3001`, admin login, `/api/auth/me`, authenticated browser navigation, and database-backed pages all work together.
2. Sync Center and Listener show honest current physical-device truth. They must not falsely report zero available devices when fresh authenticated reads prove otherwise, and must not call historical listener rows current.
3. Discover the physical Main Entrance Hikvision scope from canonical DEV data. Keep TEST A/B separate unless fresh evidence and the current task explicitly include them.
4. Build a fresh merge plan only from authenticated physical reads. Execute only reviewed, unambiguous, conflict-free, gap-only work after a successful canary and physical reread.
5. Never guess identity fields, biometric bytes, source-device choices, credentials, or completion. Preserve count-only/not-enrolled/no-data states explicitly.
6. Finish with local DEV still usable even if a device or conflict boundary prevents the full physical merge. A blocked merge is not permission to leave login, DB, API, frontend, watcher, or browser broken.
7. Commit and push focused repairs to `develop`, verify the exact SHA with GitHub Actions, synchronize WWG/handoff, and create a wake-up report with one clear continuation boundary for anything that truly requires human identity adjudication or interactive authentication.

The requested goal is not “run `npm run dev`.” The goal is a usable authenticated application plus the maximum safe, physically proven device reconciliation.

## 2. Mandatory operating rules

- Follow root and nested `AGENTS.md` files.
- Open the required WWG files and `Agent-Meta-Prompt-Template.md` before planning.
- Use admin / `hris-admin` for device/configuration work.
- Use canonical DEV DB `127.0.0.1:55435`; never silently fall back to compose `10.184.37.19:15433`.
- Preserve the VM-managed `cloudflared-bnpi-hris.service`; never stop or disable it.
- Prefer direct LAN SSH first, then `ssh project-truth-hris`.
- Use direct API proof before Playwright proof.
- Do not mutate device users until the write gate in Phase 10 is green.
- Do not ask the operator to restart, refresh, run tests, poll, or click Sync when the agent can do it.
- If Cloudflare Access requires human approval, open one visible authentication flow, state the single required click immediately, keep the recovery watcher active, poll automatically, and resume verification without requiring a new “continue” prompt.

## 3. Evidence root and first deliverables

Create:

`.runtime/overnight-usable-dev-device-merge-<stamp>/`

Immediately write:

- `00-current-state.md`
- `PLAN-REVIEW.md`
- `HEARTBEATS.md`
- `port-ownership-before.json`

`00-current-state.md` must state:

- what is true now;
- what is `STALE`, `CONFLICTING`, or `NEEDS_CONFIRMATION`;
- current DB/API/frontend/login/browser/device/listener state;
- the exact finish line;
- what will and will not be changed.

Use the phases below in this exact order. Review the plan before editing and write `Plan accepted as-is` or the evidence-backed correction.

## 4. Phase 0 — Prove the starting baseline

Capture:

- Git branch, HEAD, origin/develop, and dirty files.
- Owners of `3001`, `5175`, `55435`, and all configured device tunnel ports.
- API `/health`.
- PostgreSQL SSLRequest handshake on `55435`.
- Real admin login and `/api/auth/me`.
- Frontend HTTP response and Playwright login/navigation.
- Current device inventory from canonical DEV.
- Current Listener and Sync Center browser text.

Do not call DEV usable unless all of these pass together:

- PostgreSQL handshake;
- a real Prisma-backed query;
- API health;
- login token;
- `/auth/me` returns `admin@bandai.local` / `hris-admin`;
- frontend 200;
- Playwright reaches an authenticated admin page.

## 5. Phase 1 — Establish a durable usable DEV baseline

If any baseline item fails, repair it before device work:

1. Stop only verified Project Truth owners of conflicting scoped ports.
2. Recover `127.0.0.1:55435` using the canonical K3s DB forward.
3. Keep or repair the DB self-healing watcher.
4. Start one controlled API dev tree and one frontend dev tree; remove only verified duplicate repo-owned trees when they cause collisions.
5. Poll DB handshake, API, login, `/auth/me`, frontend, and browser until green.
6. Perform one controlled API restart and prove it returns without operator action.
7. Re-prove login after the restart.

Write `USABLE-DEV-BASELINE.json` containing request URLs, statuses, actor, elapsed times, process owners, and proof paths. Redact tokens/passwords.

Do not continue to physical writes if this baseline is red. Continue safe device diagnosis in parallel only when it cannot destabilize the baseline.

## 6. Phase 2 — Discover physical scope from truth

Read canonical DEV device rows. Create `DEVICE-SCOPE.md` with:

- name, ID, physical address, vendor, HTTP/HTTPS/SDK ports;
- runtime/tunnel mapping;
- whether it is Main Entrance A–F, TEST A/B, or excluded;
- fresh evidence timestamp;
- exact exclusion reason.

Never infer device count or scope from an old report. Never call TEST A/B part of the Main Entrance merge without explicit current evidence.

## 7. Phase 3 — Recover and prove network/tunnel ownership

For each selected physical device:

- prove VM TCP reachability;
- prove host tunnel ownership by PID and command line;
- prove HTTP/HTTPS and SDK forwards;
- prove the API reverse callback bridge `53001 -> 3001` from the VM;
- preserve all unrelated tunnels and the VM-managed named Cloudflare service.

Write:

- `TUNNEL-MATRIX.json`
- `VM-TCP-MATRIX.json`
- `CALLBACK-ROUTE.json`

Retry distinct recoveries. Do not treat an open local listening socket alone as device reachability.

## 8. Phase 4 — Recover listener and obtain current per-device truth

Prove the deployed listener source/binary and service state. Arm SDK sessions before replaying historical spools. Obtain current per-device rows for every selected panel:

- configured;
- SDK login attempted;
- armed/listening or exact login failure;
- callback receiving;
- posting to HRIS;
- spool pending/replay state;
- latest current timestamp.

Listener API and modal must distinguish:

- service running;
- armed/listening;
- receiving callbacks;
- posting;
- historical/stale evidence;
- login failed;
- status unreachable.

Write `LISTENER-TRUTH.json`. Five armed devices means five evidenced physical devices, never four plus one historical row.

## 9. Phase 5 — Fresh authenticated physical reads

Run sequential bounded reads before concurrent reads. For every selected panel capture:

- system-time/auth proof;
- user inventory count and page completion;
- source endpoint/path;
- elapsed time;
- exact error and retry history;
- whether raw fingerprint/face data is readable, count-only, not enrolled, or no data.

An Online label requires a fresh authenticated physical read. TCP open, SDK arm, or `/health` alone is insufficient.

Write `PHYSICAL-READ-MATRIX.json`. Remove failed devices from the write scope; never remove them from the report.

## 10. Phase 6 — Build and review a non-mutating merge plan

Create a fresh plan from only currently valid physical reads. Save full and slim forms plus a unique-ID decision matrix.

The write gate is green only when:

- every selected device has a fresh successful read;
- selected-device read errors are zero;
- each proposed write has an explicit physical source and target;
- no source identity field is guessed;
- conflicts are explicitly adjudicated or excluded;
- raw biometrics are copied only when readable source bytes exist;
- count-only/not-enrolled/no-data remains explicit;
- total unique IDs, source rows, missing peer rows, conflicts, and planned writes reconcile.

If conflicts remain without an approved choice, create a human review queue and exclude those IDs. Continue automatically with conflict-free IDs only.

Write:

- `MERGE-PLAN-REVIEW.md`
- `REVIEWED-WRITE-MATRIX.json`
- `CONFLICT-REVIEW-QUEUE.json`

## 11. Phase 7 — Canary

Only after the write gate is green:

1. Select one conflict-free missing peer row with an evidenced source.
2. Record before state on source and target.
3. Execute one physical write.
4. Poll the job/backend heartbeat.
5. Reread the target physically.
6. Prove exact identity fields and only evidenced biometrics.
7. Record ledger and UI truth.

If the canary fails, repair and retry only the failed canary. Do not start batches.

Write `CANARY-PROOF.md`.

## 12. Phase 8 — Bounded gap-only batches

After canary proof:

- freeze scope and reviewed choices;
- batch only conflict-free missing peer writes;
- use bounded batch sizes;
- poll real job state and backend heartbeat;
- record processed/success/failed/total separately;
- never count timeout, circuit skip, queued, estimated, or no response as success;
- retry failure-only rows after recovery;
- reread physical targets after each batch;
- stop writes immediately if DB/API baseline degrades.

Persist `MERGE-LEDGER.jsonl` and `BATCH-<n>-REREAD.json`.

## 13. Phase 9 — Reconcile final truth

Run fresh physical rereads and a new non-mutating plan. Reconcile:

- physical unique-user counts before/after;
- identity copyable gaps;
- fingerprint copyable gaps;
- face copyable gaps;
- unresolved conflict IDs;
- not-enrolled/count-only/no-data totals;
- successful writes;
- failed writes;
- timeouts;
- circuit skips;
- ledger rows versus physical target state.

Zero copyable gap may be claimed only from fresh physical rereads. Count-only biometric claims are not raw-custody proof.

## 14. Phase 10 — Browser usable-outcome proof

Using headless Playwright:

1. Log in from a fresh context.
2. Prove the login page is not stuck.
3. Open Devices and Sync Center.
4. Prove device availability matches fresh API reads.
5. Open Merge and Listener modals.
6. Prove honest per-device status, armed/current rows, callbacks/posting, excluded devices, and conflict queue.
7. Prove no editable pre-run controls appear after job scope is frozen.
8. Prove the application remains usable after all device work.

Capture network requests, console errors, body text, screenshots, and trace. Screenshots alone are insufficient.

## 15. Phase 11 — Tests and clean restart

Run proportionate focused validation:

- API typecheck;
- Hikvision client/merge/listener/transport contracts;
- DB watcher and PowerShell bridge contracts;
- frontend Device Users and Device Events contracts;
- targeted lint for changed frontend files;
- C++ build/contract when listener source changes;
- `git diff --check`.

Perform a final controlled DEV restart and re-prove DB, API, login, `/auth/me`, frontend, and Playwright. Do not leave the final runtime down because tests passed.

## 16. Phase 12 — Truth sync, commit, push, CI

Synchronize only proven facts into:

- `.wwg/workspace/current-task.md`;
- `.wwg/reports/wwg-agent-handoff.md`;
- Project Truth/principles/governance only when the task genuinely changes those surfaces.

Check the recommendation registry. Commit focused changes, push `develop`, verify local HEAD equals `origin/develop`, and watch or dispatch repository validation for the exact SHA until terminal.

## 17. Heartbeats

After every major cycle append:

`HEARTBEAT | cycle=N | phase=<phase> | usableDev=green/red | db=up/down | api=up/down | login=up/down | app=up/down | browser=up/down | devices=valid/total | armed=N | receiving=N | plan=<id/status> | job=<id/status> | identityGap=N | fingerprintGap=N | faceGap=N | writes=processed/success/failed/total | lastProof=<path> | next=<action>`

Write at least 20 heartbeats unless every EXIT GATE item becomes green sooner. A heartbeat is not a stopping point.

## 18. EXIT GATE

Do not declare `FULFILLED` until every applicable item is proven:

- [ ] Mandatory WWG and meta-prompt files opened.
- [ ] Current-state report and reviewed plan exist.
- [ ] Canonical `55435` handshake and Prisma query pass at final close.
- [ ] API health, admin login, and `/auth/me` pass at final close.
- [ ] Frontend and authenticated Playwright navigation pass at final close.
- [ ] Controlled restart recovers without operator action.
- [ ] DB watcher is running and not falling back to compose.
- [ ] Device scope is discovered from canonical DEV.
- [ ] Tunnel ownership and VM reachability are documented.
- [ ] Every Online device has a fresh authenticated physical read.
- [ ] Listener modal/API show honest current per-device rows.
- [ ] Callback/posting/spool truth is visible.
- [ ] Merge scope uses only fresh valid reads.
- [ ] Selected-device read errors are zero for executed scope.
- [ ] No guessed identity or biometric source choices exist.
- [ ] Canary physical write and target reread pass.
- [ ] Batches are bounded, gap-only, and conflict-free.
- [ ] Failure-only retry is proven where failures occurred.
- [ ] No timeout/circuit skip is counted as success.
- [ ] Fresh rereads reconcile with the ledger.
- [ ] Copyable identity/fingerprint/face gaps are zero for the executed conflict-free scope.
- [ ] Unresolved conflicts are explicit in a review queue.
- [ ] Sync Center availability matches fresh reads.
- [ ] Listener and Merge browser proofs pass.
- [ ] Focused tests pass.
- [ ] Local DEV remains usable after device work.
- [ ] Evidence and `WAKEUP-REPORT.md` exist.
- [ ] WWG/handoff contain only proven current facts.
- [ ] Focused commit is pushed to `develop` and exact-SHA CI is terminal green.
- [ ] No recoverable operator homework remains.

## 19. Real Stop Conditions and minimum usable outcome

Use `FULFILLED` only when all required gates pass. Use `PARTIALLY FULFILLED` when physical panels, reviewed conflicts, or required proof remain excluded. Use `BLOCKED` only after the `AGENTS.md` Real Stop Condition threshold is met.

If a physical merge Real Stop Condition remains, the run is not allowed to end until this minimum usable outcome is green:

- canonical DB, API, login, `/auth/me`, frontend, and authenticated browser work;
- watcher/restart behavior is stable;
- Sync Center and Listener show honest current truth or explicit unreachable state;
- all safe conflict-free work is completed or proven impossible;
- unresolved IDs are in a concrete review queue;
- one exact next action is stated for each external-only boundary;
- code is tested, committed, pushed, and exact-SHA CI is checked.

Interactive Cloudflare approval and human identity-conflict adjudication are the only acceptable user-owned continuations. Everything else remains agent-owned.

## 20. Final handoff

Create:

`.runtime/overnight-usable-dev-device-merge-<stamp>/WAKEUP-REPORT.md`

Lead with a five-line operator summary:

1. Is local DEV usable now: yes/no?
2. Can admin log in now: yes/no?
3. Which physical devices are freshly valid now?
4. How many safe writes succeeded/failed and what gaps remain?
5. What single external action, if any, is still required?

Then include exact counts, plan/job IDs, devices included/excluded, retry outcomes, listener truth, runtime proof, tests, browser proof, changed files, commit/push/CI, evidence paths, and an explicit statement of whether the requested goal was fully achieved.

Start now. First write `00-current-state.md`; then execute continuously. Do not return a vague status, a list of commands for the operator, or “npm run dev is running” as the outcome.
