  # Merge device users — fast + correct overnight (COPY THE FENCE ONLY)

  Supersedes the short “continue” prompt and the long nested task-writer card.  
  **How to use:** select everything inside the fence below → paste into Grok → leave running overnight (`--max-turns 300+`, always-approve).

  ```text
  ================================================================
  PROJECT TRUTH — MERGE DEVICE USERS: FAST + RELIABLE OVERNIGHT
  ================================================================
  You are owner-operator engineer. Not a summarizer. Not a planner who stops.
  Agent-owned end-to-end. Self-repair. Non-stop until ACCEPTANCE is green or
  Real Stop (only after 3 distinct recovery attempts with evidence per AGENTS.md).

  Law: AGENTS.md + WWG bootstrap (open with tools: project-truth summary/handoff,
  current-task, relevant truth, then code). Branch: develop.
  SSH: ssh project-truth-bnpi-pats first (fallback infra@10.184.37.19 with node-health key).
  Local API: http://localhost:3001  admin@bandai.local / password123 / appCode=bnpi-pats
  Windows: npm.cmd. Restart API yourself; poll /health. Never leave “restart API” for me.
  Do not disable Cloudflare tunnel (AGENTS.md).

  HEARTBEAT every major cycle:
  HEARTBEAT | cycle=N | phase=A/B/C/D | checklist=X/Y | last_proof=path|fail | next=<one action>

  Spawn 2–4 agents when it speeds truth (explore in parallel for code/C++/SSH legs;
  general-purpose for independent implement slices). You orchestrate. No plan-only
  agents — each must return evidence paths or diffs. If one path blocks, continue others.

  ================================================================
  1) WHAT I ACTUALLY WANT (human plain English)
  ================================================================

  I use the admin UI “Merge device users” so my Hikvision door panels share the
  same people and the same biometrics.

  When I run the job I expect:
    • Same person IDs end up on every panel in scope
    • Fingerprints that exist on any panel get copied to the others that lack them
    • Faces that exist on any panel get copied the same way
    • The job finishes in a reasonable time, not hours of fake “progress”
    • If something fails, it is remembered so we can retry only failures

  What is broken today (session evidence — re-prove live, do not only quote):
    • Job “processes” thousands of writes but mostly fails
    • Dominant failure: timeout then circuit-skip (“Skipped SDK peer copy after N
      timeout failures for source → target”)
    • Host health can show TEST A/B ONLINE while the VM (where peer copy runs)
      cannot TCP 192.168.254.109/110
    • Old apply path was sequential 1 person × 1 target = one VM SDK spawn each time
      (N×T sessions). That is why multi-device merge feels dead slow.
    • Partial code may already call copyHikvisionUserToPeersBatch in merge apply
      + circuit default 3 — LIVE process must be proven after restart

  Your job overnight is NOT “write docs.” It is:
    (1) measure what is true on network + devices + code
    (2) race small architectures with timers and success rates
    (3) implement the winner into the real merge job
    (4) run real merges and prove tallies + speed with numbers
    (5) durable failures + retry

  ================================================================
  2) SUCCESS WHEN I WAKE UP
  ================================================================

  A. SPEED
    Before/after numbers for the same small workload (same IDs, same devices):
    wall-clock seconds, successful peer writes, failed writes, SDK timeout count.
    Winner must beat broken baseline by a clear margin (not hand-wavy).

  B. TALLIES (on devices actually reachable from the VM)
    After merge + device reread:
    - Per device userCount approaches union unique IDs for that scope
    - For each person ID: FP count on each device ≥ max FP seen on fleet for that ID
    - Same for face
    - “Not enrolled anywhere” is OK and labeled — do not invent biometrics
    - Host-online but VM-unreachable devices: fix network OR exclude + document;
      do not fake success

  C. RELIABILITY
    - Failures on disk: .runtime/merge-fast-<stamp>/ledger/success.jsonl + failure.jsonl
    - Retry-failed-only works once proven
    - Progress counts distinguish: real peer write success vs circuit-skip vs db-only

  D. EVIDENCE
    Folder .runtime/merge-fast-<stamp>/ with matrices, bake-off, canary, wakeup report.
    develop pushed when green slices land.

  ================================================================
  3) SCOPE RULES (do not get this wrong)
  ================================================================

  Devices in product picture (re-resolve IDs live from API):
    Main Entrance B  10.184.37.20   cmpxw13hx002h7zwso7dyedrn
    Main Entrance A  10.184.37.21   cmrht5s2w00ei7zgsre8y3o5n
    Main Entrance C  10.184.37.22   cmripjwbx00ewl001ihcke210
    Main Entrance D  10.184.37.23   cmripjwkw00ffl0013lfxcbxw
    TEST A           192.168.254.109 cmrlgqsjv000oob01165tbd8n
    TEST B           192.168.254.110 cmrv02vam004cnxekd57dsjh8
    (Main E / Login A out of scope unless you explicitly prove them)

  Wave policy:
    MERGE ONLY devices with VM TCP OK on 80, 443, and 8000 from ssh project-truth-bnpi-pats.
    Prior: Main A–D OK; TEST A/B FAIL from VM. Re-probe every session.
    If you can repair TEST A/B reachability from VM (routes/tunnels without breaking
    AGENTS tunnel rules), then include them in a later wave. Until then Wave1 = Main A–D.

  Prior Wave1 plan snapshot (stale until re-run):
    unionUsers=687, plannedWrites=2061, missing=0, conflicts≈957, plan ~22s
    Evidence: .runtime/merge-overnight-20260722-073759/
  Prior full-6 plan: unionUsers≈852 (includes TEST A/B people not on Main-only union)

  Important nuance for Main A–D:
    missing≈0 means users already exist on all four; the heavy work is often
    fingerprint/face gaps + conflict resolution, not creating missing user shells.
    Speed work must optimize biometric peer copy, not only “create user.”

  Out of scope:
    Invent multi-employee bulk ISAPI write not in repo / not proven on these panels.
    Unbounded Promise.all of concurrent SDK logins to the same panels.
    Disabling cloudflared-bnpi-pats.

  ================================================================
  4) ARCHITECTURE TRUTH (use this; re-verify in code)
  ================================================================

  Copy path:
    Admin merge job (bnpi-pats-api)
      → runHikvisionManualCopyOnVm (SSH + scp spec + sudo timeout run-once)
      → C++ hikvision_biometric_service
      → per peer: UserInfo/SetUp (ISAPI) → fingerprints (ISAPI/SDK) → face (SDK)

  Already true in repo:
    • C++: one employeeNo can fan out to all peer sessions in one process
    • JS: copyHikvisionUserToPeersBatch = one employee → many targets, one VM session
    • Merge apply historically did 1:1 copyHikvisionUserToPeerWithRetry in nested loops
    • Partial fix may wire merge apply → batch; prove with live batch_copy_* events
    • No proven multi-user bulk enroll API — speed = batch per person + skip converged
      + fewer process spawns + reachable network + smart circuit + optional modality staging
      + optional long-lived listener if run-once dominates

  Files to know:
    bnpi-pats-api/app/device/device.controller.ts
      applyHikvisionSdkUserMerge, startHikvisionSdkUserMergeJob,
      copyHikvisionUserToPeersBatch, runHikvisionManualCopyOnVm
    bnpi-pats-api/helper/device-user-merge.helper.ts  (plan only)
    vendor/hikvision-linux/src/hikvision_bio/acs.cpp + spool.cpp + identity.cpp + fingerprint.cpp + face.cpp + copy.cpp
    docs/00-product/PRD-hikvision-copy-to-all-performance.md

  Prior evidence dirs (resume, do not treat as live truth without re-check):
    .runtime/merge-speed-truth-20260722-073117/
    .runtime/merge-job-status-20260722-071734/
    .runtime/merge-overnight-20260722-073759/

  ================================================================
  5) WORK ORDER (mandatory sequence)
  ================================================================

  PHASE A — Measure reality (no big mutate yet)
    A1. Create .runtime/merge-fast-<stamp>/
    A2. ssh project-truth-bnpi-pats: hostname, hikvision listener active?, TCP matrix all 6
        devices × ports 80/443/8000 → ssh-tcp.txt
    A3. API health; admin login; device list + per-device /health user counts
        → devices-health.json
    A4. Lock WAVE = devices with VM TCP all OK. Write TRUTH-MATRIX.md
    A5. Non-mutating POST /api/device/hikvision/sdk-users/merge/plan for WAVE deviceIds
        → merge-plan-wave.json (unique IDs, plannedWrites, conflicts, missing, seconds)
    A6. Grep live source + running process: batch path present? Restart API if code
        newer than process. Confirm /health after restart.
    A7. HEARTBEAT. Spawn parallel explore if helpful (controller path, C++ timeouts, SSH).

  PHASE B — Architecture bake-off (same small N, timed)  ★ DO NOT SKIP
    Pick 5–10 unique vendor IDs that have real FP/face gaps on WAVE (from plan/issues).
    Same IDs for every arm. Measure wall clock + success/fail + error classes.

    Arms to compare (at least 1 baseline + 2 alternatives; more if useful):
      ARM0 Baseline: sequential 1:1 peer copy (if still callable) OR document why gone
      ARM1 Batch multi-target: one employee → all missing peers, one VM session
          (copyHikvisionUserToPeersBatch / merge job with batch)
      ARM2 Staged modality: users-only pass, then FP, then face (if user shells already
          present, focus FP then face timing)
      ARM3 Optional bounded parallel (concurrency 2 max, different sources or strict
          mutex) ONLY if ARM1 still slow and SDK does not thrash — prove or discard

    Write BAKE-OFF-MATRIX.md:
      arm | seconds | ok | fail | timeouts | notes | winner?
    Winner = best reliable throughput (ok per minute), not theoretical.

    Spawn agents to prepare arms in parallel only when they do not fight the same
    device SDK session. Prefer sequential arms on same panels if contention appears.

  PHASE C — Implement the winner into production merge path
    C1. Wire applyHikvisionSdkUserMerge / merge job to winning architecture
    C2. Durable ledger on every job:
        .runtime/merge-fast-<stamp>/ledger/success.jsonl
        .runtime/merge-fast-<stamp>/ledger/failure.jsonl
        fields: at, jobId, vendorUserId, sourceDeviceId, targetDeviceId, stage, status, error
    C3. Retry-failed-only: PowerShell script under scripts/ and/or API endpoint that
        reads failure.jsonl and re-runs only those rows
    C4. Preflight: do not burn 10s timeouts on VM-unreachable targets; fail fast + ledger
    C5. Circuit: default ≥3; re-probe path after cool-down; never treat skip as success
    C6. Focused tests (merge helper + biometric/merge contract strings for batch/ledger)
    C7. Restart API; commit + push develop when green

  PHASE D — Real run + prove tallies
    D1. Canary: 5–10 gap IDs on WAVE — require real peer write success events
        (batch_copy / copy_success with strategy), not only db_merge_done
    D2. Expand: larger selected set or full gap matrix for WAVE (respect time;
        prefer gap-only / richest-source recommended)
    D3. Reread plan or health user counts + credential gap sample
    D4. WAKEUP-REPORT.md:
          before/after per device: users, FP gaps, face gaps
          bake-off winner + speed delta
          remaining failures + how to retry
    D5. If TEST A/B still desired: only after VM TCP fixed; new wave + new matrix

  Self-repair loops (agent does these without asking):
    API down → free port 3001, npm.cmd run dev, poll health
    Listener dead on VM → check service, rebuild/restart managed listener if you changed C++
    SSH flake → retry, then LAN SSH
    Flaky test → fix and re-run
    Dirty git → focused commit of this work only
    Timeout storms → preflight, reduce scope, fix path, re-canary

  ================================================================
  6) ACCEPTANCE CHECKLIST
  ================================================================

  [ ] TRUTH-MATRIX.md + ssh-tcp.txt + devices-health.json
  [ ] WAVE = VM-reachable only (TEST A/B excluded unless TCP fixed)
  [ ] BAKE-OFF-MATRIX.md with timings; winner named with evidence
  [ ] Live merge job uses winner (event proof: batch_copy_* or documented arm events)
  [ ] ledger/success.jsonl + failure.jsonl from a real run
  [ ] retry-failed proven on ≥1 failure row
  [ ] Canary: ≥1 real peer write success (not circuit-skip, not db-only)
  [ ] Larger WAVE run: tallies improved with numbers; speed improved vs baseline with numbers
  [ ] Focused tests green; /health healthy; develop pushed when green
  [ ] WAKEUP-REPORT.md written
  [ ] No “you should hard-refresh / restart API / click Sync” residual

  EXIT GATE:
    Do not end on summary if any required box is open and not a Real Stop.
    Do not count circuit-skips as successful merges.
    Do not invent bulk multi-user ISAPI without live device proof.
    Next step after HEARTBEAT is always a tool call.

  ================================================================
  7) START NOW
  ================================================================
  1) Bootstrap WWG + short current-state in .runtime/merge-fast-<stamp>/00-current-state.md
  2) HEARTBEAT cycle=1 phase=A
  3) SSH TCP matrix + API health (parallel agents OK)
  4) Continue A→B→C→D without waiting for the human
  ================================================================
  ```
