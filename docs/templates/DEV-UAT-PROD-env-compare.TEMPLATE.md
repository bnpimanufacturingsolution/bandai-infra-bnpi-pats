# Template: DEV · UAT · PROD environment compare

**Purpose:** One place to compare **limits (CPU/RAM)**, disk, readiness, and **business counts** across the three K3s namespaces on the Project Truth node.

**Colorful Excel (committed snapshot):**  
[`docs/templates/DEV-UAT-PROD-env-compare.xlsx`](./DEV-UAT-PROD-env-compare.xlsx)

| Sheet | Content |
|---|---|
| `DEV-UAT-PROD` | Metric rows · columns DEV / UAT / PROD · teal header · green = DEV higher on device data |
| `Why DEV higher` | Why device_events / device_users can be higher on DEV than UAT |

---

## How to regenerate (live numbers)

From the VM (or any host with `kubectl` to the appliance):

```bash
# Prefer latest script in repo
python3 scripts/export-env-compare-xlsx.py
# Writes:
#   docs/templates/DEV-UAT-PROD-env-compare.xlsx  (when run from repo root)
#   or /tmp/DEV-UAT-PROD-compare.xlsx
```

To refresh **business counts** from Postgres first:

```bash
python3 scripts/_tmp-db-counts3.py   # or promote to scripts/export-env-db-counts.py
# Then update the ROWS data in scripts/export-env-compare-xlsx.py and re-run export
```

---

## Expected layout (columns)

| Metric | DEV | UAT | PROD | Note |
|---|---:|---:|---:|---|
| CPU limit (API / App / PG / total) | … | … | … | **limits**, not requests |
| RAM limit (API / App / PG / total) | … | … | … | **limits**, not requests |
| Disk Postgres / uploads PVC | … | … | … | GiB Bound |
| Employees / Users / Depts / … | … | … | … | business |
| Device users / Device events | … | … | … | often DEV ≥ UAT after live taps |
| Ready (API / App / PG) | 1/1 | 1/1 | 1/1 | deploy readiness |

---

## Why DEV can be higher than UAT (device data)

UAT is **not** “later and always larger.”

1. **2026-07-24** — DEV was cloned into UAT and PROD → HR core matched (employees, users, attendances, …).
2. After clone, **DEV kept live Hikvision** traffic → `device_events` / `device_users` grew.
3. UAT/PROD did not get the same continuous live device stream.

So:

| Area | Pattern |
|---|---|
| Employees, users, payroll-ish | **Equal** (clone parity) |
| Device events / device users | **DEV higher** until re-sync |

To make UAT/PROD device tables match DEV again requires an **authorized** device-data re-clone/re-sync (not automatic).

---

## Shared host truth

All three namespaces run on **one** Hyper-V K3s node (`project-truth-node`):

- CPU capacity: **8**
- RAM capacity: **~13.4 GiB**
- Limits across envs are **overcommitted** vs node size

---

## Ownership

| File | Role |
|---|---|
| `docs/templates/DEV-UAT-PROD-env-compare.xlsx` | Operator-facing colorful snapshot |
| `docs/templates/DEV-UAT-PROD-env-compare.TEMPLATE.md` | This template / how-to |
| `scripts/export-env-compare-xlsx.py` | Regenerates the xlsx (stdlib only) |
