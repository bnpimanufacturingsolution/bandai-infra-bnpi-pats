# Overnight Continuation — Durable Credential Recovery and Live Gap Convergence

You are the single owner-operator agent continuing the authorized credential
recovery job in:

`C:\Users\stari\bandai-infra`

Continue from the current evidence; do not restart the investigation from
memory and do not treat the facts below as substitutes for fresh verification.
Read, measure, act, and prove.

This is a real K3s DEV/GitOps job. Do **not** run Project Truth as the runtime
with Windows `npm run dev`, Docker Desktop, WSL, or a host-local API. Local
commands are for source inspection, tests, and controlled port forwarding only.

The required runtime path is:

```text
Windows repo on develop
-> push to GitHub
-> exact-SHA GitHub Actions
-> VM ansible/GitOps pull
-> K3s DEV in project-truth-local-vhdx-proof
-> LAN devices
-> VM-managed named Cloudflare tunnel remains active
```

## 1. Access and environment bootstrap

1. Begin in `C:\Users\stari\bandai-infra` on `develop`.
2. Open `AGENTS.md`, every `.grok/rules/*.md`, and the mandatory WWG files in
   their required order before substantive action.
3. Open:
   - `Agent-Meta-Prompt-Template.md`
   - `docs/00-product/AGENT-PROMPT-durable-credential-recovery-and-live-gap-convergence.md`
   - `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`
   - `docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`
   - the latest `.wwg/reports/wwg-agent-handoff.md`
   - the latest evidence under
     `.runtime/credential-recovery-live-20260724-081023`
4. Reverify SSH; do not merely assume it remains available:

   ```powershell
   ssh -o BatchMode=yes project-truth-hris "echo SSH_OK"
   ```

5. Prefer direct LAN SSH first when it is routable:

   ```powershell
   ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19
   ```

   At the last check, direct LAN port 22 timed out and the documented
   `project-truth-hris` Cloudflare SSH alias worked. Recheck both and record the
   current result. Do not disable or restart the named Cloudflare tunnel.
6. If the local API forward is absent, create only this SSH forward:

   ```powershell
   ssh -N -L 127.0.0.1:53101:127.0.0.1:3101 project-truth-hris
   ```

   Use `http://127.0.0.1:53101` only as a tunnel to the VM/K3s DEV API.
7. Authenticate as `admin@bandai.local` with `appCode='hris'` using the
   documented repository credential. Never print the bearer token.
8. Create a new stamped `.runtime` evidence directory and publish a concise
   Current-State Report with confirmed, `STALE`, `CONFLICTING`, and
   `NEEDS_CONFIRMATION` facts.

## 2. Last verified continuation point — recheck before relying on it

At 2026-07-24 around 09:20 Asia/Manila:

- local and VM/GitOps source SHA:
  `eba1c099fb246f64203d3d3fd84c6ad517387752`;
- exact-SHA validation run `30058024551` completed successfully;
- K3s DEV had exactly one ready API replica and one ready app replica;
- `cloudflared-bnpi-hris.service` was active;
- the durable recovery list endpoint returned HTTP 200;
- durable recovery jobs: `0`;
- active legacy physical merge writers: `0`;
- no recovery or physical write job had been started;
- the recovery tables had been applied successfully;
- `hris-api-db-init` was still failing in the seed phase, after schema sync,
  because `defaultProjectSeeder.ts` hit a `User.userName` unique constraint
  during `prisma.user.upsert`;
- `prisma migrate diff` from live K3s DEV to the checked-in Postgres schema
  showed only creation of the two recovery tables before deployment, with no
  destructive drops;
- the UI and API now constrain the first recovery write to
  `canaryModality: "fingerprint"`.

These are handoff facts, not permission to skip a fresh check.

## 3. Exact physical scope

Revalidate current database IDs, names, addresses, authentication, and complete
inventory readability. Include exactly:

| Device | ID | Historical address |
|---|---|---|
| Main Entrance Device B | `cmpxw13hx002h7zwso7dyedrn` | `10.184.37.20` |
| Main Entrance Device A | `cmrht5s2w00ei7zgsre8y3o5n` | `10.184.37.21` |
| Main Entrance Device F | `cmrim1zop05ik7zp4zgm2sm4k` | `10.184.37.25` |
| Main Entrance Device D | `cmripjwkw00ffl0013lfxcbxw` | `10.184.37.23` |
| Main Entrance Device E | `cmriu5ab102goi001x9o7nfct` | `10.184.37.24` |

Exclude from every write:

- Main Entrance Device C `cmripjwbx00ewl001ihcke210`
- TEST A `cmrlgqsjv000oob01165tbd8n`
- TEST B `cmrv02vam004cnxekd57dsjh8`

Mark contradictions `CONFLICTING`; never substitute or widen scope silently.

## 4. Ordered overnight execution

### Phase A — Repair deployment health without touching biometric state

1. Confirm source SHA, image state, one API replica, app/API readiness, named
   tunnel, DB reachability, and zero active physical writers.
2. Inspect the failed DB-init pod, current and previous logs, and the exact
   conflicting `User.userName` rows without exposing password hashes or secrets.
3. Repair DB-init idempotency safely:
   - do not delete or overwrite an existing user merely to make seed green;
   - do not use `prisma db push --accept-data-loss`;
   - prefer an identity-safe, deterministic seed lookup/update or decouple
     schema migration success from optional demo/default seeding according to
     repository conventions;
   - add a regression test for the duplicate-username condition.
4. Run Prisma validation, a live read-only migration diff, focused tests,
   typecheck/lint, production builds when affected, and `git diff --check`.
5. Commit and push the repair to `develop`, dispatch/watch exact-SHA CI, let the
   normal ansible/GitOps path deploy it, and recreate the failed immutable
   DB-init Job only after confirming zero active writers.
6. Require DB-init completion, both recovery tables present, recovery endpoint
   HTTP 200, one API replica, and exact running SHA before proceeding.

### Phase B — Fresh plan and frozen read-only review

1. Call the exact deployed merge plan endpoint directly as admin for only the
   five included devices.
2. Save raw request, raw response, status, elapsed time, plan ID, scope hash,
   source-device results, and errors.
3. Treat all earlier counts, including 505 fingerprint and 2,630 face gaps, as
   historical until this fresh response confirms current values.
4. Require all five devices to be authenticated and full-inventory-readable.
5. Confirm Main C and TEST A/B are absent from every proposed target.
6. Preserve the pre-write inventory/custody/owner snapshot and reviewed
   operation IDs/byte hashes.
7. Call the durable recovery review endpoint and verify its frozen scope hash,
   task graph, deduplication, counters, exclusions, and reason-code contract.
8. Stop before writes if identity, source bytes, owner protection, scope hash,
   target capability, or rollback evidence is unsafe or unresolved.

### Phase C — Fingerprint-only durable canary

1. Recheck zero active recovery/merge/import/SDK-copy writer.
2. Start one durable recovery job with:
   - the fresh reviewed plan ID;
   - the exact expected scope hash;
   - `maxVerifiedWrites: 1`;
   - `canaryModality: "fingerprint"`.
3. Record the returned job ID immediately.
4. Poll the durable job endpoint and correlated API/device logs. Prove lease,
   heartbeat, resume cursor, current source/target, stage timing, attempts,
   named errors, and last advancement.
5. Do not count custody recovery, queue transition, HTTP 200, SDK acceptance,
   or a write attempt as convergence.
6. Require a physical target reread to retain the fingerprint and make the
   fresh physically verified fingerprint gap decrease.
7. If no safe fingerprint becomes eligible, finish recoverable custody tasks
   and diagnose the exact reason. Do not fall through to face.
8. Repair recoverable failures with at least five distinct evidenced attempts
   before declaring a real blocker.

### Phase D — Measured fingerprint waves

1. After the one-row reread-proven canary, run bounded fingerprint-only waves.
2. Keep exactly one fleet-wide writer owner, serial writes per target, and
   concurrency only across independent targets under shared ordered locks.
3. Measure real verified reductions in 10–20 second windows.
4. Target 5–10 verified reductions per window only when enough independent safe
   operations and measured device latency permit it.
5. If the target is missed, optimize the measured dominant stage and preserve
   before/after evidence. Never animate or estimate the verified counter.
6. Retry only failed safe scope; never replay already reread-verified writes.

### Phase E — Face canary, then face waves

1. Do not start face until fingerprint behavior is physically proven.
2. Generate a fresh plan/review and start exactly one face canary with
   `canaryModality: "face"` and `maxVerifiedWrites: 1`.
3. Require current raw face custody, exact source byte hash, duplicate-owner
   refusal, target build/capability attestation, SDK/ISAPI evidence, and
   physical reread retention.
4. A failed face attempt must remain visible and must not decrement the face
   gap.
5. Name and repair the actual failure cause before repeating a bounded canary.
6. Scale face waves only after physical reread proof.

### Phase F — Finish recoverable work and prove the browser

1. Continue bounded recovery/write/reread waves while safe recoverable rows
   remain.
2. Reread all five devices and generate the final plan.
3. Reconcile source captures, peer-copy attempts, writes, failures, and
   physically verified gaps.
4. Confirm zero writes to Main C and TEST A/B.
5. Confirm listener and Saved Events behavior remains healthy.
6. Use API/network proof first, then headless Playwright.
7. Prove the durable job survives modal close/reopen and page reload.
8. Capture screenshots plus network/console evidence for live stages and actual
   fingerprint/face reductions.
9. Update Project Truth, terminology, architecture, workspace, governance,
   recommendation registry if needed, and handoff with evidence paths, timings,
   remaining physical boundaries, exact SHA, CI, and runtime proof.
10. Commit/push final truth synchronization and re-prove exact-SHA CI and K3s
    runtime.

## 5. Safety and truth rules

- Never invent, convert, synthesize, or guess biometric bytes.
- Never adjudicate different same-slot checksums without identity evidence.
- Never overwrite another physical user's credential.
- Never decrement a gap before physical reread.
- Never deploy/restart the API while a physical writer is active.
- Never overlap recovery, merge, import, or SDK-copy writers.
- Never report `Recovery queued` unless a durable job, lease, heartbeat, and
  cursor exist; before a job, use `Recovery needed`.
- Keep headline and stage physical-action totals backend-owned.
- Keep the VM-managed named Cloudflare tunnel active.
- Do not ask the operator to restart, refresh, click Sync, run the job, or watch
  progress when the agent can do it.

## 6. Overnight progress contract

At least every 15 minutes and every phase boundary, record:

- current phase and job ID;
- exact running SHA and CI run;
- current physically verified remaining fingerprint/face gaps;
- recovered, ready, writing, rereading, verified, retrying, failed, and
  physical-action counts;
- last real advancement time;
- throughput and measured dominant delay;
- latest named error and recovery attempt;
- whether any physical writer is active;
- evidence directory.

Do not report a percentage without an explicit denominator and verification
class. Continue autonomously until all recoverable work is physically verified
or a repository Real Stop Condition is evidenced. Do not call the job
`FULFILLED` while DB-init is unhealthy, the first modality lacks physical reread
proof, safe recoverable rows remain idle, exclusions are unproven, or final
exact-SHA runtime/browser evidence is absent.

## 7. Start here

Start with Phase A. The immediate known defect to close is the idempotent
DB-init seed failure on duplicate `User.userName`. After it is repaired and
deployed, take a fresh five-device read-only plan. Do not start any physical
write from the handoff's historical plan or counts.
