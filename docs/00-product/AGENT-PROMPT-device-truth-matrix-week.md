# Ordered agent prompt: device truth matrix (this week + now)

**Device default:** Hikvision TEST A `cmrlgqsjv000oob01165tbd8n` / `192.168.254.189`  
**Always-on:** `.grok/rules/01-agent-owned-execution.md` — you run everything; no human homework.

---

## PASTE BLOCK (ordered research + matrix)

```text
================================================================
DEVICE TRUTH MATRIX — ORDERED (AGENT-OWNED, DO NOT STOP EARLY)
================================================================
Goal: For ONE device (default TEST A), produce hard numbers with evidence:

A) How many users exist ON THE DEVICE NOW (inventory)
B) This WEEK: how many User created / Fingerprint enrolled / User deleted /
   Attendance tap events HAPPENED (device logs + BNPI PATS saved)
C) What is residual willAdd in Sync logs preview
D) Employee-no shape truth (plain vs opaque base64 tokens)
E) Explain layers so numbers are not confused

Law: AGENTS.md + agent-owned execution. Bootstrap WWG with tools first.
Evidence: .runtime/device-truth-matrix-<stamp>/
Heartbeat each cycle. Recover DB 55435 / API / npm.cmd yourself (3 tries).
Do not stop after one API call or ~10 minutes. Matrix must complete.

----------------------------------------------------------------
ORDERED STEPS (do in order; save JSON after each)
----------------------------------------------------------------
0) STAMP + HEALTH
   - Create .runtime/device-truth-matrix-<yyyyMMdd-HHmmss>/
   - health :3001; if login fails on 55435 → start-k8s-dev-db-access or
     ssh -L 127.0.0.1:55435:10.43.130.9:5432 infra@10.184.37.19
   - restart bnpi-pats-api with npm.cmd; poll /health; login admin

1) DEVICE USERS NOW (inventory truth — UserInfo)
   - GET /api/device/<deviceId>/users?page=1&limit=100 (paginate all pages)
   - Report: total, ACTIVE, linked to BNPI PATS employeeId
   - Sample vendorUserId list (first 20) — expect PLAIN ids (1, 01515, …)
   - Save: device-users-summary.json

2) SYNC PREVIEW (event residual estimate — all history)
   - GET /api/device/sync-preview?deviceId=<id>
   - Table: eventLabel, eventCategory, willAdd, alreadyInBnpiPats, status
   - Record operationLogTotal + attendance totalEvents
   - Save: sync-preview.json + preview-rows.txt
   - NOTE: willAdd ≠ users-on-device-now; willAdd = estimated missing DeviceEvents

3) BNPI PATS DEVICE EVENTS — ALL TIME + THIS WEEK
   - For each action: USER_CREATED, USER_DELETED, FINGERPRINT_ENROLLED,
     FINGERPRINT_UPDATED, FACE_ENROLLED, TAP, TAP_REJECTED, UNKNOWN_OPERATION
   - Count via GET /api/device/events?deviceId=&eventAction=&page=1&limit=1
     pagination.total
   - Week: same with window=7d (or dateFrom/dateTo last 7 days, dateField=eventTime)
   - Save: bnpi-pats-event-counts.json

4) LOGSEARCH WEEK SAMPLE (device operation truth — Information metaId)
   - POST /api/device/<id>/hikvision/log-search
     body: execute=false, maxRows>=100, startTime/endTime last 7 days (+08:00)
   - If time format errors: use Manila +08:00 format from FormatHikvisionManilaDateTime
   - Classify sample: byAction counts for USER_CREATED / FINGERPRINT_ENROLLED / …
   - Save raw + by-action summary
   - Optional: full-history sample page 0 size 80 already inside sync-preview
     operation sample — use for proportion if week logSearch fails

5) EMPLOYEE NUMBER SHAPE MATRIX
   - Sample 50 USER_CREATED from BNPI PATS events: count opaque base64 vs plain
   - Sample 20 TAP: expect plain employee nos
   - Device users: expect plain vendorUserId
   - Document: logSearch addUserInfo often operator=SDK + remoteHost=VM IP
     → opaque token is DEVICE LOG CONTENT, not broken Bearer on logSearch

6) CROSS-CHECK MATRIX (must fill every cell)
   | Layer | Metric | Source | Count |
   | Users on device now | inventory total | DeviceUser UserInfo | |
   | Users linked BNPI PATS | inventory linked | DeviceUser.employeeId | |
   | User created residual | willAdd | sync-preview | |
   | Fingerprint enrolled residual | willAdd | sync-preview | |
   | User created saved all-time | BNPI PATS | DeviceEvent | |
   | User created saved this week | BNPI PATS window=7d | DeviceEvent | |
   | Fingerprint enrolled saved this week | BNPI PATS | DeviceEvent | |
   | Attendance tap residual | willAdd | sync-preview | |
   | Attendance tap saved this week | BNPI PATS | DeviceEvent | |
   | Operation log total | device | logSearch totalMatches Information | |
   | ACS attendance total | device | AcsEvent totalMatches | |

7) WRITE TRUTH-REPORT.md
   - Fill matrix with numbers + evidence paths
   - Explicit warnings:
     * willAdd is estimate (sample × total) for large catalogs
     * one sync pass may not finish full willAdd (scan caps)
     * opaque tokens ≠ missing parse; plain IDs are on DeviceUser + TAP
   - No "you should hard-refresh" endings — you prove

8) ACCEPTANCE
   [ ] Inventory total > 0 with plain vendorUserIds
   [ ] Preview rows include USER_CREATED + FINGERPRINT_ENROLLED + TAP
   [ ] Week BNPI PATS counts for at least USER_CREATED and FINGERPRINT_ENROLLED (0 ok if true)
   [ ] Employee-no shape documented (opaque vs plain)
   [ ] TRUTH-REPORT.md + JSON under .runtime/
   [ ] HEARTBEAT cycles ≥ 8 or full green
   [ ] Commit report if docs-only; code only if bugs found

START: step 0 tool actions now.
================================================================
```

---

## Short continue

```text
Run docs/00-product/AGENT-PROMPT-device-truth-matrix-week.md ordered matrix for TEST A.
Recover DB/API yourself. Fill truth matrix: users now + this week events + preview willAdd + opaque vs plain employee nos. Evidence under .runtime/device-truth-matrix-*/. Do not stop early.
```

---

## How to read the three truth layers

| Layer | Question it answers |
|---|---|
| **DeviceUser inventory** | Who exists on the device **now**? |
| **logSearch / ACS + willAdd** | What **events** happened / still need to be saved as DeviceEvents? |
| **BNPI PATS DeviceEvent counts** | What did we **already import** this week / all time? |

These three are **not** the same number and must not be forced equal.
