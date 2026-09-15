# Device Events duplicates — 2026-08-17

Status: **ROOT_CAUSED**. Local hot-reload API **is serving** the skip. Historical rows remain. GitOps/K3s serving path is **NEEDS_CONFIRMATION**.

Operator asked not to push after the first two commits; later local commits may already be on `origin/develop`. This note documents truth, not a new deploy.

## Are the updates on?

| Surface | On updates? | Proof |
|---|---|---|
| Git `develop` | Yes | `a801c4b` serial collapse; `935963a` skip ACS exception; `a6dce32` TAP/evidence display |
| Local API `http://localhost:3001` | **Yes** | `GET /health` healthy. Smoke `POST /api/hikvision/callback` major=2/minor=38 empty → `persisted=false` `reason=acs_exception_not_punch`. DB `serialNo=GROK-DOC-M2-38-20260817` count **0**. |
| Local app `http://localhost:5175` | Yes | Vite serving current `bnpi-pats-app` |
| DEV DB `127.0.0.1:55435` | Shared ledger | Same K3s DEV database the UI reads |
| VM listener → this API only | **CONFLICTING** | Reverse `53001→3001` is the intended path. A live B row `major=2/38` serial `8564` still saved at `2026-08-17 02:51:12Z` after this API process started (`~02:42Z`). Smoke after that was not saved. Possible second writer or reload lag. |
| VM listener C++ rebuild | No | Source classify requires major=5; running ELF **NEEDS_CONFIRMATION** |
| Historical cleanup | No | Old exception + serial-extra rows still in `device_events` |

Evidence: `.runtime/device-event-dup-20260817/on-updates-proof/`.

## What the operator saw

| UI | Truth |
|---|---|
| 63,933 Saved events | Whole ledger (API/DB ~63,940+), not one tap |
| Unknown person on B/D/E every few minutes | Each **armed** panel emits ACS **exception** `major=2` `minor=38` every **301s**, empty person |
| CUID device names | Device D `cmripjwkw00ffl0013lfxcbxw`, Device E `cmriu5ab102goi001x9o7nfct` (socket row without name) |
| “Watcher save” | Latest socket label, not a second writer |
| “Sync duplicated logs” | Partly identity_repost extras; partly 5-min exceptions looking identical |

## Residual (live DEV, 2026-08-17)

| Bucket | Count (measured) | What it is | Blocker | Next |
|---|---:|---|---|---|
| SDK `major=2` `minor=38` empty | 4,541+ (grew while armed) | Armed-device ACS exception, not a punch | `code_defect` (mislabeled) | Skip persist — **on local API** |
| Real tap `major=5` `minor=38` | 590 SDK + 788 callback | Real fingerprint pass; **0 empty** | none | Keep |
| Same device+serial 2+ rows | 963 groups / ~1,992 rows | `identity_repost` new key per guessed person | `code_defect` | Serial collapse — **in git + local** |
| `SYNC_SIGNAL` vs logSearch enroll | 25k + 24k | Two families for operations | leftover | REC-20260817-DEVICEEVENT-SERIAL-COLLAPSE |
| Same serial on 2 devices | 0 | Not cloned across panels | — | — |

### Per-row samples

| Serial | Device | Rows / interval | Persons | Why |
|---|---|---|---|---|
| 5560 | Main D | 4 | empty, 1838, 320, 186 | identity_repost + key included employeeNo |
| 8530–8564 | Main B | +1 every 301s | empty | major=2/38 exception |
| 10787+ | Main D | same cadence | empty | same |
| 8848+ | Main E | same cadence | empty | same |

A/C/F: **0** of these today (not armed).

## Fixes (code)

| Commit | Change |
|---|---|
| `a801c4b` | Serial-only DeviceEvent match (any source, empty person). Sync skip by serial. One ACS `searchID` per job. Taxonomy/evidence stamps. Listener save + device name on socket. |
| `935963a` | Do **not** persist `major=2` + `minor=38` + empty person. Taxonomy = device health, not TAP. C++ `classify_event` requires major=5 for fingerprint pass/fail. |
| `a6dce32` | Display real TAP / evidence for stored major=5 punches; pad employee match. |

Gate: `isHikvisionArmedListenerAcsException` in `bnpi-pats-api/helper/hikvision-event-contract.helper.ts`. Callback returns 200 `acs_exception_not_punch` and does not `create`.

## Open

| Item | Owner |
|---|---|
| Confirm no new `2/38` empty rows after the next 5–10 min on **this** API | agent / operator refresh |
| If they still appear, find the other writer (K3s DEV API vs `:3001`) | agent |
| Rebuild VM listener so C++ stops calling minor=38 a tap | agent when asked |
| Reviewed delete of historical 2/38 + serial extras | only if operator authorizes |
| Do not push unless asked | standing |

## Files

- Runtime: `.runtime/device-event-dup-20260817/FINDINGS.md`
- Per-device: `.runtime/device-event-dup-20260817/per-active-device/FINDINGS.md`
- Live skip proof: `.runtime/device-event-dup-20260817/on-updates-proof/`
