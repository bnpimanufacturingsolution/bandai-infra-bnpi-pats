# AGENT JOB CARD — Merge UI truth · one source of counts · hide card · multi-agent FE

**Mode:** agent-owned · non-stop · multi-agent crew  
**Surface:** `bnpi-pats-app/app/routes/admin/devices/enroll.tsx` (+ API writeMatrix only if required)  
**Skills (ordered):** `impeccable` → **clarify → distill → layout → polish → harden → audit**  
**ENV:** DEV `dev.bnpi-pats.tech` · devices A/B/D/E/F · admin@bandai.local  
**Finish line:** honest Review modal + one count contract + card off default residual UX · prove with Playwright + API JSON under `.runtime/`

---

## 0. Screenshot truth (do NOT invent — quote UI)

### Image A — Review selected merge (FALSE / confusing)

| UI claim | What matrix shows | Verdict |
|---|---|---|
| **Start peer copy job (76 IDs)** (red CTA) | Every visible row: **No target**, **COPY 0** | **FALSE CTA** — counts selected IDs, not executable peer copies |
| **76 selected unique IDs · 20 selected potential writes · 798 excluded** | Matrix: Source 0 FP/face, 0/5 devices, 5 gaps | **CONFLICTING** — “potential writes 20” ≠ matrix COPY total 0 |
| Device A tile **20** + subtitle **6 selected unique IDs** | Same panel | **CONFLICTING** — two numbers for same tile |
| Device F **5** “From Main Entrance Device A” | Unclear: sources vs targets vs missing | **NEEDS_CONFIRMATION** until code labels fixed |
| Rows 1596/1597/… “Richest source” + “No target” | Person present on source only; peers not missing? or already present? | **Misleading “gaps”** — 5 gaps on FP/face with Source 0 is inventory noise, not a write |

**Root product lie:** CTA and header inflate **selection size** as if it were **work**. Operator truth is: `executable peer copies = sum(COPY) > 0`. If sum(COPY)=0, CTA must be disabled / renamed “Nothing to peer-copy”.

### Image B — Merge device users (confusing multi-source counts)

| Chip / block | Screenshot | Live API baseline (when green) | Operator confusion |
|---|---|---|---|
| Unique IDs | 874 | unionUsers ~874 | OK identity |
| Device ID records | 4,350 | sourceRows ~4350 | OK inventory rows |
| **Needs review** | **15** | decision_people often **0**; missing ~15–20 | **FALSE label** if it mixes missing+decision+other |
| Potential writes | 40 | missing-person creates + other | Easy to double-count with recovery |
| Recovery job | awaiting_replan · all 0 · Remaining 10 | card residual | Looks stuck; Remaining ≠ wave |
| Potential ops / Card / Ready / Agent recovery | 20 / 20 / 0 / 20 | card-only agent recovery | **Card dominates residual** — user: **do not include card for now** |

---

## 1. Product rules (non-negotiable)

1. **One source of truth per number** — each chip has exactly one definition printed under it (tooltip + one-line caption). No silent dual meaning.
2. **Never enable Start peer copy** unless `writeMatrix.totalWrites` (physical peer creates) **> 0**. Label CTA with **executable copies**, not selected ID count.
3. **Card modality OFF default residual UX** for this job:
   - Hide card from default “Potential operations / Agent recovery” chips OR put behind `Show card residual` toggle default **off**.
   - Do **not** put card back into Needs decision (already DECISION_FIELDS).
   - Card recovery jobs may still exist backend; UI default must not drown the screen.
4. **Needs decision ≠ Needs review ≠ Missing ≠ Potential writes** — split chips honestly.
5. **Recovery counters:** rename Residual left; English stage; never show 100% as “success” when verified=0.
6. Impeccable: clarify copy, distill counts, layout hierarchy, polish, harden empty/false CTAs, audit a11y.

---

## 2. Ordered multi-agent plan (spawn in parallel where independent)

### Agent A — TRUTH / COUNTS (API + UI contract) · `explore` then `general-purpose`
**Owner:** count contract  
**Read:** `enroll.tsx` (write matrix, chips, CTA), `device.controller.ts` serialize writeMatrix, merge plan counts.  
**Do:**
1. Table of every chip → formula → source field (plan.counts / writeMatrix / credentialWrites filter).
2. Fix false: peer-copy CTA; Device A 20 vs 6; potential writes vs COPY=0.
3. Split: Needs decision | Missing from device | Credential residual (FP/face only default) | Peer-copy executable.
4. Unit/contract tests for CTA disabled when totalWrites=0.
**Done when:** no chip without formula; CTA never says “Start peer copy (N IDs)” when N copies=0.

### Agent B — REVIEW MODAL HONESTY · `general-purpose` + FE skills **clarify → distill → harden**
**Owner:** Image A modal  
**Do:**
1. Header: `selectedIds` / `executablePeerCopies` / `excluded` with plain English.
2. Per-device tiles: one number each, labeled (e.g. “missing peers to create” vs “selected IDs on this device”).
3. Matrix: hide or collapse rows with COPY=0 unless filter “show no-op IDs”.
4. Primary button: disabled + muted when executable=0; copy: “No peer copies for this selection”.
5. Secondary path: “Back to review” only.
**Done when:** Playwright screenshot: selection with no targets → CTA disabled, banner “0 executable peer copies”.

### Agent C — MAIN MERGE PANEL · **layout → clarify → distill · hide card**
**Owner:** Image B  
**Do:**
1. Top chips only: Unique IDs | Records | **Missing** | **Needs decision** | **Peer-copy ready** | **FP/face residual** (not card by default).
2. Card: toggle “Include card residual” default **off**; when off, Potential ops / Agent recovery exclude card.
3. Recovery panel: progressLabel + Residual left; never imply success at verified=0.
4. Remove duplicate “Needs review 15” if it ≠ decision+missing formula.
**Done when:** hard-refresh DEV: card not in default chips; decision 0 stays 0; missing labeled Missing.

### Agent D — RECOVERY PROGRESS · already partially landed `4b76667`
**Owner:** job panel honesty  
**Do:** prove progressLabel live; if still snake_case stage only, fix app poll types; residual label; empty Ready state copy.
**Done when:** screenshot recovery shows English stage + residual not “Remaining” ambiguity.

### Agent E — PLAYWRIGHT / PROOF · `general-purpose`
**Owner:** evidence  
**Do:**
1. Login DEV, open merge, capture chips JSON + screenshots.
2. Select all / review modal → assert CTA disabled when totalWrites=0.
3. Assert card default-hidden.
4. Write `.runtime/merge-ui-truth-<stamp>/REPORT.md` + screenshots.
**Done when:** REPORT green checklist.

### Agent F (optional parallel) — ROOT / land develop
Commit/push when A–E green; redeploy DEV if image lag; do not touch cloudflared.

---

## 3. EXIT GATE (all must be green)

- [ ] Review modal never offers peer copy when sum(COPY)=0 / totalWrites=0  
- [ ] Every top-level count has one formula + caption  
- [ ] Card residual default **hidden** (toggle optional)  
- [ ] Needs decision still **0** on live plan (do not regress name/date)  
- [ ] Missing labeled **Missing**, not “Needs review” soup  
- [ ] Recovery: English stage; Residual left; verified=0 ≠ success  
- [ ] Playwright evidence under `.runtime/merge-ui-truth-*`  
- [ ] Commit + push `develop` when green  

---

## 4. Paste prompt (ROOT — spawn agents)

```text
You are Project Truth multi-agent crew. Job card:
docs/00-product/AGENT-PROMPT-merge-ui-truth-one-source-no-card.md

Bootstrap: AGENTS.md + WWG current-task/handoff + enroll.tsx write matrix + live merge/plan.

Screenshot truth (Image A Review modal, Image B Merge panel):
- FALSE: Start peer copy (76 IDs) while matrix COPY=0 / No target all rows.
- CONFLICTING: 76 selected vs 20 potential writes vs Device A 20 vs 6 selected unique IDs.
- Card residual confuses default chips — HIDE card by default this job.
- Needs review 15 must not lie if decision_people=0 (likely missing).

Spawn parallel agents A–E from the job card. Use impeccable skills in order:
clarify → distill → layout → polish → harden → audit on enroll.tsx only for FE.

Non-stop: implement → prove API → Playwright → commit push develop → redeploy DEV if needed.
Never disable cloudflared. Table-first residual reports. HEARTBEAT each cycle.
EXIT GATE in job card must all be green before stop.
```

---

## 5. Definition of “honest”

| Number | Allowed formula (pick one, document) |
|---|---|
| Unique IDs | `plan.counts.unionUsers` |
| Device records | `plan.counts.sourceRows` or dedupedDeviceRecords |
| Needs decision | people with `conflicts.length>0` (profile only) |
| Missing | people with `missingOnDeviceIds.length>0` |
| Peer-copy executable | `writeMatrix.totalWrites` (physical creates only) |
| FP residual | credentialWrites modality fingerprint, non-card |
| Face residual | credentialWrites modality face |
| Card residual | **hidden by default**; toggle only |
| Recovery Residual left | counters.physicallyVerifiedRemaining |
| Recovery Verified | counters.verified this wave |

If two formulas disagree, UI shows **CONFLICTING** badge + both values — never average.
