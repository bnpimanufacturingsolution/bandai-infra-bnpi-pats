# BNPI DMA open-horizon recurring — 2026-08-18

## Status

`IMPLEMENTED_LOCAL_PROVEN` on local clone `5433` / org `cmryhwpv70000vgaktlmrubmx`.

## Local vs VM

| Layer | Where | Durable? |
|---|---|---|
| Import/code path (open-horizon DMA) | git `develop` | Yes once pushed/deployed |
| Brute data repair (Sheet2 upsert / horizon / line rewrites) | local `5433` only so far | **No** — local is testing only |
| VM/appliance DB replay | **Required later** | Needed for runtime truth |

Brute/data fixes in this payroll parity stream (DMA open-horizon upsert, loan
multi-cutoff horizon, WS-off ABSENT→REST_DAY, late/EO punch recompute, prior DED
mass reimport, dailyRate backfill) must be **re-run on the VM DB** when that path
is available. Do not treat local clone mutations as production/GitOps truth.

## Finish line (this turn)

| Claim | Status | Evidence |
|---|---|---|
| DMA recurring import path | Done | `isOpenHorizonCompensationCode`, COMP mass, workbook apply |
| Local enrollments from Jul Sheet2 | Done (test DB) | repair script execute |
| Jul DMA tally green | Done (local) | `fieldFailCounts.dma=0`, 828/828 match |
| VM DB data replay | **Open** | Replay repair scripts on appliance DB |
| Gross/TR green | Open | Not in scope |

## Residual after DMA

| Bucket | Count | Blocker class | Next |
|---|---:|---|---|
| VM brute-data replay | — | `apply_path` | Re-run DMA/loan/WS/late/DED/dailyRate repairs on VM DB |
| Missing emps 01831 / 01845 | 2 | `export_gap` / roster | Create employees or accept onlyInTarget |
| Gross fails | ~620 | mixed | Continue gross package |
| Absent reverse | ~173 | mixed | Sheet2 absent vs WS=0 days |
| Late | ~55 | residual | Sample + policy |
