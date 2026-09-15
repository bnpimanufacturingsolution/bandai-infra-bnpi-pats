# Agent prompt loop — Device admin UX clarity (non-stop)

Use this prompt when continuing Device Management / Device events / Sync logs / Sync users clarity work.  
**Do not stop** after research or a partial patch. Keep looping until the acceptance checklist is proven green.

---

## Mission

Make the admin device journey understandable and fast-feeling:

1. **Device management** — health + Sync users + Sync logs actions  
2. **Device events** — saved ledger, honest loading, friendly service status  
3. **Sync logs modal** — event-first preview, slim layout, blocked devices collapsed  
4. **No VM jargon** in primary badges/banners (ops detail may remain inside Listener modal technical fields)  
5. **No redundant filter columns** inside Sync logs (ledger keeps Device / Time / Category / Action)  
6. **Skeletons/loading** must not look like hidden data; target 1–2s first useful paint messaging  

## Hard rules

- Read `AGENTS.md`, `.wwg/workspace/current-task.md`, and task-relevant WWG before edits.  
- Do **not** invent DeviceEvent rows from DeviceUser inventory.  
- Do **not** disable Cloudflare tunnel.  
- Prefer direct evidence (API + Playwright). Host LAN may fail; use public/CF when needed.  
- Recoverable issues are agent-owned (ports, installs, flaky tests, restarts).  
- Stop only for real stop conditions in `AGENTS.md` after 3 distinct recoveries.

## Non-stop loop

```text
LOOP until ALL acceptance boxes are checked with evidence:

1) DISCOVER
   - Open events.tsx, manage.tsx, enroll/device users if needed
   - Open latest screenshots under .runtime/device-ux-clarity*
   - Map journey: Devices → events → Sync logs → Sync users

2) PLAN (short)
   - List remaining copy/layout/loading gaps vs acceptance
   - Touch only device admin UX surfaces + tests

3) IMPLEMENT
   - Apply code changes
   - Update contract + Playwright assertions in the same pass

4) PROVE
   - vitest: device-events-page-contract + device-user-ui-contract
   - playwright: tests/smoke/admin-device-events-sync-modal.spec.ts
   - Optional live: public or localhost Device events + Sync logs screenshots
   - Capture .runtime/device-ux-clarity-<stamp>/

5) FIX
   - Any fail → fix → re-prove (do not end on suggestion)

6) TRUTH-SYNC + COMMIT
   - Update .wwg/workspace/current-task.md
   - Commit focused files; push develop when green
```

## Acceptance checklist (must all pass)

- [ ] Device events page has **no** `Current inventory` / `Needs reverify` strip  
- [ ] Primary status uses **Live capture / Server / Blocked: …** — **no** `VM listener` in badges/banners  
- [ ] Saved empty/loading says **Loading saved events…** or clear empty — not silent misleading skeleton-only  
- [ ] Sync logs summary: **Will add / Already saved / Devices ready** (not repeated “Devices checked” + “Ready source checks” as primary)  
- [ ] Sync logs table columns are **Event | Will add | Already saved | Status** only  
- [ ] Blocked device: **one** blocker reason, **no** full 16-row Unavailable catalog  
- [ ] Ready Hikvision preview still shows event-first will-add rows  
- [ ] Manage health: **Checking device connection…**; Sync users pending: **Reading users from device…**  
- [ ] Contract tests green  
- [ ] Playwright smoke **3/3** green with screenshots under `.runtime/`  
- [ ] Workspace/handoff updated; commit on `develop` when green  

## Commands

```powershell
# Contract
cd bnpi-pats-app
npx vitest run app/lib/device-events-page-contract.test.ts app/routes/admin/devices/device-user-ui-contract.test.ts

# Playwright smoke (headless)
npx playwright test tests/smoke/admin-device-events-sync-modal.spec.ts --config=playwright.smoke.config.ts
```

## User-facing terminology (keep stable)

| Concept | Preferred |
|---|---|
| BNPI PATS up | Server working |
| Live taps service | Live capture working / offline / blocked |
| Terminal unreachable | Blocked: device / Can’t reach this device |
| Sync preview | Preview only — nothing is saved until you confirm |
| Saved ledger | Device events / Saved events |
| Inventory | Device users (separate page) |

## Out of scope unless asked

- Full ACS serial historical reconciliation  
- GitOps image rebuild for production promotion of this UI  
- Physical Hikvision network repair  

## Done definition

All acceptance boxes checked with paths to evidence.  
If one path is blocked (e.g. host LAN), prove via public/CF or mock Playwright and document residual — then continue other open boxes.  
**Do not end the turn with “recommended next steps” while any required box is still open and recoverable.**
