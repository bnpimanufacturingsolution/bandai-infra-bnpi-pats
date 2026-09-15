# Yokatta FX-100 Integration Research

**Status:** Research documentation (not accepted runtime truth)  
**Last updated:** 2026-08-04  
**Task mode:** External product investigation — no Project Truth code path exists yet  
**Evidence stamp:** `.runtime/yokatta-fx100-research-20260804-150409/`

---

## Purpose

This document records the deep-research findings for integrating the
**Yokatta FX-100** (also FX100) fingerprint biometric time recorder into a
custom attendance / BNPI PATS system (Project Truth context: Hikvision + ZKTeco
already supported).

It is the **canonical research memo** for agents and operators. It supersedes
chat-only summaries and the over-claimed Manus executive summary where they
conflict.

### Reading rules

| Label | Meaning |
|---|---|
| **CONFIRMED** | Multi-source or primary-source fact for the named product |
| **STRONG** | Consistent marketing / family evidence; not lab-proven on FX-100 |
| **INFERRED** | Reasonable class inference; must not drive live production design alone |
| **SPECULATION** | Hypothesis only |
| **NEEDS_HARDWARE** | Requires physical unit (ports, firmware, protocol canary) |
| **REJECTED** | Claim checked and not supported for FX-100 as sold |

Do **not** invent OEM, port, or SDK compatibility. Prefer: read this file →
quote path → prove on hardware → implement.

---

## Executive verdict (reconciled)

| Question | Validated answer | Confidence |
|---|---|---:|
| Direct custom integration without official Yokatta software? | **Yes for batch attendance** (USB / Excel / Lite software export). Live network API **unproven for FX-100** | Batch **82%** · Live **25%** |
| TCP/IP Ethernet on **FX-100**? | **Not proven.** Public FX-100 materials emphasize **standalone via USB** | **15–25%** present |
| Official **Yokatta-branded** SDK / API? | **None found publicly** | **92%** absent |
| Candidate OEM SDK (Timmy / TIMY)? | **Exists for Timmy devices**; **transfer to FX-100 unproven** | Timmy SDK **95%** · FX-100 match **35–45%** |
| ZKTeco / pyzk / port 4370? | **No good evidence** for FX-100 | **88%** not compatible as sold |
| Yokatta is OEM factory? | **No** — PH retail / private-label brand | **92%** |
| Best integration method **today** | **USB / GLOG / Excel batch import** into BNPI PATS | **85%** |
| Best method **if** Timmy protocol proven on unit | Timmy WebSocket/JSON + official Timmy SDKs | Conditional **90%** *after canary* |

### Bottom line

1. **Yokatta FX-100 is not a first-class Project Truth device lane today.**
2. Treat it as a **batch attendance source**, not a live Hikvision/ZK-style bridge.
3. **Manus AI found a valuable OEM candidate** (Shenzhen Union Timmy / TIMY free SDKs).
4. Manus **over-claimed** that FX-100 is confirmed Timmy with WebSocket port 7788 ready.
5. **Do not implement a live Yokatta bridge** until a physical canary proves protocol family.

---

## Device identity (public marketing)

| Spec | Value | Label | Sources |
|---|---|---|---|
| Brand / model | Yokatta FX-100 / FX100 | CONFIRMED | Bundyclock, Biometric.PH, Lazada PH |
| Primary market | Philippines | CONFIRMED | Shopee, Lazada, Office Warehouse, Infinite Systems |
| Fingerprint capacity | ~1,000 | STRONG | Dealer listings |
| PIN capacity | ~1,000 | STRONG | Dealer listings |
| Transaction logs | ~160,000 | STRONG | Dealer listings |
| Templates per user | Up to 3 | STRONG | Dealer listings |
| Auth modes | Fingerprint / password (PIN) | STRONG | Dealer listings |
| Connectivity (as sold) | **Standalone via USB** download | STRONG–CONFIRMED | IndiaMart, FB resale, family FX-9/X600 |
| Bundled software claim | Lite Version Software + MS Excel reports | CONFIRMED (marketing) | Bundyclock, Biometric.PH |
| Field software (PH channel) | TIME MASTER Timekeeping System (Lite) often associated | STRONG | Informer Q&A, Lazada multi-model listings, Nideka GLOG workflow |
| Main dealer / steward | Infinite Systems Technology Corp. (Makati/Cebu) | STRONG | infiniteph.com, infinitesystems.net |

### Primary product links

| Source | URL |
|---|---|
| Bundyclock FX100 | https://bundyclock.com.ph/fx100-yokatta-biometric-time-attendance-machine |
| Biometric.PH FX100 | https://biometric.ph/yokatta-fx100-biometric-time-attendance-machine |
| Lazada FX-100 standalone | https://www.lazada.com.ph/products/yokatta-fx-100-biometrics-attendance-time-keeper-machine-standalone-biometric-fingerprint-scanner-helps-for-payroll-processing-biometric-attendance-bundy-clock-i231972873.html |
| IndiaMart FX-100 | https://www.indiamart.com/proddetail/yokatta-fx-100-fingerprint-biometric-reader-23741193048.html |
| Infinite Systems FX-9 (USB family) | http://infinitesystems.net/fingerprint%20time%20recorder%20-yokatta%20fx-9.html |
| Infinite PH FX-300 | https://infiniteph.com/cat-blogs/yokatta_fx300/ |
| Office Warehouse X600 (USB + BioTH2.0 sibling) | https://www.officewarehouse.com.ph/product/28212/ |

---

## OEM / manufacturer research

| Claim | Label | Confidence | Notes |
|---|---|---:|---|
| Yokatta is market brand / private label, not silicon factory | STRONG | **92%** | No Yokatta OEM developer portal; PH channel branding |
| Hardware is Chinese ODM white-label class | STRONG | **90%** | Capacity/USB/Excel stack matches Alibaba-class terminals |
| Algorithm class BioTH2.0 on Yokatta line | STRONG for X600; INFERRED for FX-100 | **85%** / **55%** | Office Warehouse X600 lists BioTH2.0 |
| OEM = **ZKTeco** | REJECTED as default | **15–25%** | No 4370, ZKTime, zkemkeeper, ZKFinger evidence for FX-100 |
| OEM = **Shenzhen Union Timmy Technology (TIMY / Timmy)** | SPECULATION / candidate | **35–45%** | Manus hypothesis; class similarity only — no FX-100→Timmy primary link |
| OEM = Anviz / Suprema / Ronald Jack / eSSL / Hikvision | REJECTED as default | **&lt;20% each** | No primary match |

### Manus OEM claim — audit

Manus labeled “OEM = Shenzhen Union Timmy” as **CONFIRMED 95%**.

**Audit result: OVER-CLAIMED.**

| What Manus showed | What that actually proves |
|---|---|
| Timmy company exists and sells biometric TA | Timmy is a real OEM |
| Timmy / TM8000 / other clocks use BioTH2.0 | BioTH2.0 is a **shared white-label algorithm name** |
| Yokatta family is USB Excel standalone class | Class overlap with many ODMs |
| **Missing** | Any document/photo saying FX-100 is Timmy model X |

BioTH2.0 also appears on non-Timmy / multi-brand listings (TM8000 clones, MYA3, STR23, KO-Mx*, etc.). Algorithm string alone does **not** identify Timmy as FX-100 factory.

**Required to raise Timmy match to CONFIRMED:** firmware string, PCB silkscreen, Infinite Systems OEM disclosure, or successful Timmy protocol canary on a physical FX-100.

---

## Communication capabilities (FX-100)

| Interface | Support | Label | Confidence |
|---|---|---|---:|
| USB flash / U-disk host download | **Yes — primary** | STRONG–CONFIRMED | **90%** |
| USB device-mode cable to PC | Possible | INFERRED | **40–55%** |
| TCP/IP Ethernet | **Not documented for FX-100** | REJECTED as product claim | **15–25%** present |
| Wi-Fi | No evidence | REJECTED | **0–10%** |
| RS232 / RS485 | No FX-100 evidence | REJECTED | **5–20%** |
| ADMS / cloud push | No evidence | REJECTED | **0–10%** |
| HTTP / REST / SOAP / WebSocket **on device** | No FX-100 evidence | REJECTED as product claim | **5–20%** |
| Timmy WebSocket (server listen **7788**) | Exists for **Timmy** network/AI/fingerprint SDK family | CONFIRMED for Timmy only | **95% Timmy** / **20% FX-100** |

### Sibling / family notes (do not collapse into FX-100 truth)

| Model | Stated comms | Use |
|---|---|---|
| Yokatta FX-8 / FX-9 | STANDALONE VIA USB | Strong USB family pattern |
| Yokatta X600 | USB Flash Drive; BioTH2.0 | Algorithm clue |
| Yokatta FX-300 | USB Host / standalone USB download (official retail); mixed FB TCP claims | Treat TCP claims as CONFLICTING |
| NIDEKA network SKUs (same dealer catalog) | Explicit TCP/IP LAN | Shows dealers label network models **separately** |
| Timmy TM20 and network lines | TCP/IP + USB + free SDK | Timmy product truth, not FX-100 |

---

## SDK and API status

### Yokatta brand

| Resource | Result | Confidence |
|---|---|---:|
| Public Yokatta SDK (COM/DLL/.NET/Java/Python/Node) | **Not found** | **92%** |
| Public Yokatta API / protocol manual | **Not found** | **92%** |
| Public developer portal | **Not found** | **90%** |
| Public installer download for Lite software | **Not found** (dealer media only) | **90%** |
| GitHub Yokatta attendance protocol client | **Not found** | **93%** |

### Candidate OEM: Timmy / TIMY (Shenzhen Union Timmy Technology Co., Ltd.)

| Resource | Result | Confidence |
|---|---|---:|
| Free SDK page | **Exists** | **95%** |
| Languages advertised | Python, PHP, C#/.NET, Java (+ series-specific packages) | **95%** |
| AiFace WebSocket docs | Documented on Timmy site | **95%** as Timmy docs |
| Protocol notes from third-party research | WebSocket+JSON family; default listen port often cited as **7788** (no TLS in some docs) | STRONG for Timmy materials |
| Applies automatically to Yokatta FX-100 | **No** | Match **35–45%** |

**SDK download hub (Timmy):**  
https://www.timyteco.net/downloads/software-development-kitsdk.html  

**Timmy company / Alibaba:**  
https://timyteco.en.alibaba.com/ · https://sztimmy.en.alibaba.com/

### ZKTeco ecosystem

| Target | Compatible with FX-100? | Confidence |
|---|---|---:|
| TCP 4370 / ZK binary protocol | No evidence | **90%** no |
| zkemkeeper / ZKEM | No evidence | **88%** no |
| pyzk / node-zklib | No reports | **90%** no |
| ZKTime / BioTime | Not the shipped stack | **85%** no |

### Third-party gateways

Universal bridges (e.g. Cams Biometrics) list ZK/Anviz-class brands; **Yokatta is not a documented supported brand** in public materials reviewed.

---

## Official software (attendance path)

| Item | Finding | Label | Confidence |
|---|---|---|---:|
| Marketing name | Lite Version Software + MS Excel Report Output | CONFIRMED (marketing) | **95%** |
| Field name (PH) | TIME MASTER Timekeeping System Lite (often) | STRONG | **85%** |
| Device export name | GLOG / GLG-style USB attendance file (family) | STRONG class | **80–90%** |
| Typical flow | Device → USB download → Lite/TIME MASTER → Excel/reports | STRONG | **90%** |
| PC DB engine | Likely Access/Jet for TIME MASTER Lite | INFERRED | **60%** |
| Safe third-party live DB access | **Not supported** — use export artifacts | STRONG | **85%** |

### Typical operator workflow

```text
Yokatta FX-100 (standalone punches)
  → Menu → USB Download → attendance log (GLOG / GLG_*.TXT class)
  → USB stick → PC
  → Lite Version Software / TIME MASTER import
  → MS Excel / Crystal reports
  → Custom BNPI PATS import (recommended integration surface)
```

---

## Fingerprint templates

| Question | Answer | Label | Confidence |
|---|---|---|---:|
| Public template format for Yokatta | None | CONFIRMED absence | **90%** |
| ISO 19794-2 claim | None found | CONFIRMED absence | **90%** |
| Export templates | Possible via class “User” USB dump / OEM SDK if matched | INFERRED | **55%** |
| Cross-vendor import (Hikvision/ZK/Suprema) | Re-enroll | STRONG | **85%** |
| Timmy SDK template fields (`signatures`, backupnum, base64 photo) | Documented in Timmy SDK materials (research capture) | STRONG for Timmy | **85%** Timmy |

**Project Truth implication:** Do not plan multi-vendor raw FP merge from Yokatta without proven custody format. Treat as **re-enroll source** or **attendance-only source**.

---

## Custom integration feasibility

| Operation | Feasible without Yokatta-branded SDK? | Method | Confidence |
|---|---|---|---:|
| Read attendance logs | **Yes (batch)** | USB / Excel / Lite export | **High** |
| Real-time punch stream | **Unproven on FX-100** | Only if Timmy/network protocol proven | **Low for FX-100** |
| User CRUD remote | **Unproven** | Device UI / Lite SW / Timmy SDK if matched | **Low–Med** |
| FP template R/W remote | **Poor without OEM match** | Timmy SDK only if matched | **Low** |
| Sync to custom BNPI PATS | **Yes (batch)** | File/DB import job | **High** |

### Language notes

| Language | Yokatta-specific library | Notes |
|---|---|---|
| Node / PHP / Python / C# / Java | **None under Yokatta name** | Use Excel/CSV parsers for batch path |
| Timmy Python/PHP/C#/Java SDK | Exists on Timmy site | Use only after protocol canary |
| pyzk / zklib | ZK only | Do not assume |

---

## Manus AI report — full reconciliation

Manus delivered a high-confidence report claiming:

- OEM = Shenzhen Union Timmy  
- Official SDK/API = WebSocket/JSON via Timmy  
- Best method = WebSocket on port 7788  

### Keep from Manus

| Finding | Action |
|---|---|
| Timmy free multi-language SDKs exist | Document as **candidate OEM toolkit** |
| Timmy WebSocket/JSON family exists | Document as **conditional live path** |
| USB GLG/GLOG class exports exist in Timmy manuals | Aligns with PH USB workflow research |
| No public SDK under “Yokatta” name | Confirms earlier research |

### Reject / downgrade from Manus

| Manus claim | Corrected status |
|---|---|
| FX-100 OEM = Timmy **CONFIRMED 95%** | **SPECULATION / NEEDS_HARDWARE 35–45%** |
| TCP/IP on FX-100 **YES 90%** | **Not proven 15–25%** |
| Official API for FX-100 **YES 95%** | **Timmy yes; FX-100 unproven** |
| Best method WebSocket **90%** | **Only after canary; default is USB/Excel** |
| Real-time/user CRUD on FX-100 **CONFIRMED** | **Conditional on protocol match** |

### Logical error to avoid

```text
Timmy has WebSocket SDK
+ BioTH2.0 appears on many Chinese clocks
+ Yokatta is in the same market class
≠ Yokatta FX-100 speaks Timmy WebSocket on 7788
```

---

## Recommended architecture (Project Truth)

```text
                    ┌──────────────────────┐
                    │  Yokatta FX-100       │
                    │  (standalone punches) │
                    └──────────┬───────────┘
                               │ default path
                               ▼
                    ┌──────────────────────┐
                    │ USB export / Excel /  │
                    │ Lite or TIME MASTER  │
                    └──────────┬───────────┘
                               │ scheduled watcher
                               ▼
                    ┌──────────────────────┐
                    │ Yokatta batch importer│
                    │ - parse files         │
                    │ - map employee IDs    │
                    │ - idempotent upsert   │
                    │ - last_import stamp   │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │ BNPI PATS attendance /     │
                    │ DeviceEvent ledger    │
                    │ labels: batch | stale │
                    │ NOT live-listener     │
                    └──────────────────────┘

Optional (feature-flagged only after hardware canary):
  If Timmy protocol proven → Timmy WS/SDK bridge
  If ZK protocol proven    → reuse vendor/zkteco-linux path
  Else                     → keep batch-only

Existing live lanes (unchanged):
  Hikvision → SDK / ISAPI / callback
  ZKTeco    → TCP 4370 / pyzk
```

### Product honesty rules

- Do **not** show FX-100 as online live listener like Hikvision callbacks without transport proof.
- Do **not** claim fingerprint merge across Hikvision/ZK from Yokatta templates without format proof.
- Prefer explicit UI/API labels: `batch`, `file_import`, `last_import_at`, `needs_canary`.

---

## Hardware canary checklist (mandatory before live bridge)

| Step | Pass criteria | Closes |
|---:|---|---|
| 1 | Rear panel photo | RJ45 / USB-host / serial present? |
| 2 | Menu walk: Comm / Network / Cloud / Server | Network path exists? |
| 3 | System Info / firmware / algorithm string | OEM family strings |
| 4 | USB attendance export sample | File name + schema (`GLOG` / `GLG_001.TXT` / other) |
| 5 | If Ethernet: port scan **7788**, **4370**, 80, 8080 | Protocol family |
| 6 | If 7788/Timmy menus: Timmy Python SDK canary | Timmy match |
| 7 | If 4370: pyzk `read_sizes` canary | ZK match |
| 8 | Optional: Lite/TIME MASTER DLL `strings` | Software lineage |
| 9 | Optional: PCB silkscreen | Named factory |

Until steps 1–5 pass, **batch import remains the only approved design assumption**.

---

## Research method log

| Phase | What ran | Output |
|---|---|---|
| 10 parallel agents | OEM, comms, SDK, reverse-eng, ZK compat, network, software, templates, custom integration, alternatives | Synthesized in runtime stamp |
| Host web verification | Dealer pages, Infinite Systems, Office Warehouse, Timmy SDK page | Confirmed USB path + Timmy SDK existence |
| Manus AI report intake | User-pasted technical investigation | Audited; OEM/WS claims downgraded |
| This document | Durable Project Truth research memo | `docs/YOKATTA_FX100_INTEGRATION_RESEARCH.md` |

### Runtime evidence directory

```text
.runtime/yokatta-fx100-research-20260804-150409/
  REPORT.md          # first 10-agent synthesis
```

Update this docs file when hardware canary evidence lands; do not silently overwrite rejected claims.

---

## Project Truth scope boundary

| Item | Status |
|---|---|
| Code adapter for Yokatta | **Not implemented** |
| Device type enum / Sync Center lane | **Not present** |
| Accepted wiki Project Truth for Yokatta devices | **Not promoted** — research only |
| Recommendation | See registry: batch importer candidate + hardware canary before live bridge |

### Final answers (canonical)

1. **Can custom app communicate directly?** Batch file path **yes**. Live direct API **unproven**.
2. **Method?** USB / Excel / Lite export import **now**; Timmy WS **only after canary**.
3. **Official Yokatta SDK?** **No public SDK.**
4. **Official Yokatta API?** **No public API.**
5. **Best method without API?** Scheduled USB/Excel/GLOG import.
6. **Rebranded OEM?** Brand is private-label class; exact factory open.
7. **Manufacturer?** Candidate Timmy **unproven**; Chinese ODM class **strong**.
8. **Network detail to implement?** Timmy docs exist for Timmy devices only; not proven for FX-100.
9. **USB automation?** Stick/export → drop folder → idempotent BNPI PATS upsert.
10. **Architecture?** Batch adapter default; optional protocol bridge behind canary gate.

---

## Contacts (dealer truth, not API)

| Party | Role | Notes |
|---|---|---|
| Infinite Systems Technology Corp. | Primary PH Yokatta channel | https://infiniteph.com/ — ask OEM/SDK in writing |
| Bundyclock / Biometric.PH | Retail same cluster | Product claims Lite + Excel |
| Timmy / TIMY (if OEM confirmed) | Candidate factory SDK | https://www.timyteco.net/ · info@timyteco.net |

**Written ask to dealer (recommended):**

1. Is FX-100 USB-only or does any revision have TCP/IP?  
2. Exact software name/version shipped with FX-100?  
3. Any SDK / protocol document available under NDA?  
4. Is the OEM Shenzhen Union Timmy or another factory?  
5. Can you confirm firmware platform / algorithm string?

---

## Change log

| Date | Change |
|---|---|
| 2026-08-04 | Initial durable research memo: 10-agent synthesis + Manus audit + architecture + canary checklist |
