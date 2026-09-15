# Hikvision biometric clock: manual set and Manila fleet sync (2026-08-19)

Status: `RESEARCHED_CODE_VENDOR_AND_STALE_LIVE`. No panel time writes this pass.

Question: can BNPI Hikvision bio terminals (MinMoe / DS-K1T) be set to Manila time manually, and can all devices be synced together?

Short answer: **Yes.** The devices already expose Manual + NTP Time Settings. ISAPI `PUT /ISAPI/System/time` is a documented SET. Project Truth today only **GET**s the clock. Live BNPI panels last proven as `timeMode=manual` + `timeZone=CST-8:00:00` (UTC+8). That offset is already Manila; they are not fleet-NTP locked.

## Verdict

| Question | Answer | Evidence |
|---|---|---|
| Set time on the panel itself? | **Yes** — admin Time Settings | DS-K1T344 / DS-K1T670 manuals |
| Web / Hik-Connect / iVMS set? | **Yes** — Manual or NTP; iVMS Batch Time Sync | Vendor help + USA FAQ |
| ISAPI GET clock? | **Yes** | BNPI GET 200; BNPI PATS health |
| ISAPI PUT clock? | **Yes** (vendor Face Recognition Terminals ISAPI) | Not exercised on BNPI this pass |
| NTP on biometric firmware? | **Yes** | Same manuals + `/ISAPI/System/time/ntpServers` |
| BNPI PATS can SET time today? | **Yes, preview-first** | `POST /api/device/:id/time-sync` |
| Manila mapping | Device string **`CST-8:00:00`**, DST **off**, localTime `+08:00` | Live GET + POSIX TZ |
| Sync all devices together? | **Yes** — NTP (durable) or one-shot PUT/iVMS (drift) | See patterns below |

## Why it matters

BNPI PATS Time In/Out uses the **device punch time**, not server `receivedAt`. Naive SDK stamps get `+08:00`. Pairing is per employee across **all** devices on a Manila day. Clocks that drift from each other break in/out, late/UT, and day buckets.

| Drift | Attendance effect |
|---|---|
| Device ahead | Punch looks late or **next day** |
| Device behind | Punch looks early or **previous day** |
| Two devices differ | In on A / out on B can invert or split days |
| BNPI PATS software skew | Future-only, ≤30 min, import opt-in — **not** a substitute |

## How to set time (device, not BNPI PATS)

| Method | Fleet? | Durable? | How |
|---|---|---|---|
| Panel UI | One device | Until RTC drift | Admin login → System Settings → Time Settings. Set TZ, date/time, DST off. |
| Device web | One device | Until drift | Configuration → System → Time Settings. Manual **or** NTP. Sync with computer. |
| Hik-Connect | Per device | If NTP saved | Time Configuration: timezone + NTP **or** Synchronize with Phone. |
| iVMS-4200 | **Yes** | One-shot | Menu → Tool → **Batch Time Sync** → PC time. Official USA FAQ. |
| ISAPI PUT | **Yes** (loop) | NTP yes / manual no | `PUT /ISAPI/System/time` + optional `ntpServers` |
| HCNetSDK | **Yes** | Same as ISAPI | `NET_DVR_GET_TIMECFG` / `NET_DVR_SET_TIMECFG` |

## Manila mapping (do this)

Philippine Standard Time is UTC+8 with **no DST** (since 1978). Hikvision does **not** take IANA `Asia/Manila`.

| Field | Use | Do not use |
|---|---|---|
| IANA (BNPI PATS) | `Asia/Manila` | On the panel |
| ISAPI `timeZone` | **`CST-8:00:00`** | `CST-8:00:00DST…`, US Central, `GMT+8` POSIX |
| ISAPI `localTime` | ISO with **`+08:00`** | `Z` unless TZ also changes |
| DST | **Off** | Any DST bias |
| UI dropdown | GMT+08:00 / Beijing–Singapore class | US CST (UTC−6) |

POSIX `CST-8` means UTC+8 (sign inverted vs ISO). Same offset as Manila. Name is China Standard, not Chicago.

## ISAPI (GET then PUT the same shape)

Probe first (non-mutating):

```text
GET /ISAPI/System/time
GET /ISAPI/System/time?format=json
GET /ISAPI/System/time/capabilities
GET /ISAPI/System/time/ntpServers
```

Manual one-shot (air-gap / catch-up):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <timeMode>manual</timeMode>
  <localTime>2026-08-19T14:30:00+08:00</localTime>
  <timeZone>CST-8:00:00</timeZone>
</Time>
```

`PUT /ISAPI/System/time` with digest `admin`. Then GET to prove.

Fleet NTP (preferred):

1. PUT `/ISAPI/System/time/ntpServers` (LAN NTP or `ph.pool.ntp.org` if WAN exists)
2. PUT time with `timeMode=NTP` and `timeZone=CST-8:00:00` (no `localTime` required)
3. Optional POST `.../ntpServers/test`
4. GET until `timeMode=NTP` and `localTime` still `+08:00`

Auth: HTTP Digest, typically **admin**. Operator users `NEEDS_CONFIRMATION` (likely no).

## Project Truth code (today)

| Path | What it does |
|---|---|
| `bnpi-pats-api/config/hikvision.endpoint.ts` | GET `/ISAPI/System/time?format=json` only |
| Device health | GET clock → `provenBy: systemTime`. UI badge **Readable**, not the clock value |
| `scripts/check-hikvision-device-clock.ts` | GET + skew vs server |
| Python probe | GET XML `localTime` / `timeMode` / `timeZone`. **No writes** |
| C++ listener | Copies ACS `struTime` onto the event. **Does not set** panel clock |
| BNPI PATS | Stores `hikvisionClockSkewSeconds` on Device config. Does **not** PUT the panel |

`hikvisionFetch` can send PUT if called that way. **No caller does.**

## Live BNPI clocks (stale files; not re-probed 2026-08-19)

This workstation: localhost:3001 down; ping `10.184.37.19` false. Today’s clocks = `NEEDS_CONFIRMATION`.

Every surviving Time XML: **`timeMode=manual`**, **`timeZone=CST-8:00:00`**. No NTP server captured.

| Device | Last Time XML | vs API | Notes |
|---|---|---:|---|
| Main B | 2026-08-17 09:02:44+08 | ~+30s | STALE |
| Main D | 2026-08-17 09:03:23+08 | ~+61s | ~40s ahead of B/E same minute |
| Main E | 2026-08-17 09:02:43+08 | ~+21s | STALE |
| Device 5 | 2026-08-12/13 | ~+45s | STALE |
| Main A/C/F, TEST A/B | no XML in surviving packs | — | 08-17 A/C/F `EHOSTUNREACH` |

Trial 2026-07-01 (older IP): `localTime=...+08:00`, `timeMode=manual`, `timeZone=CST-8:00:00`.

## Recommended BNPI order (not executed)

| Pri | Action | Why |
|---|---|---|
| 1 | GET time + ntpServers + capabilities on each DS-K1T | Firmware proof before write |
| 2 | Same TZ `CST-8:00:00`, DST off, **NTP** to one LAN NTP | Durable fleet lock |
| 3 | If a panel cannot NTP: one-shot PUT of the same Manila `localTime` | Recovery only |
| 4 | Re-GET skew vs server; keep BNPI PATS `Asia/Manila` | Prove wall clock |
| 5 | Do clock jumps **off shift**; never set backward during live T&A | ACS/search/duplicate punches |

Do not mix some NTP, some manual, some DST-on. Do not treat iVMS batch as durable NTP (it is a PC-time push).

## Risks

| Risk | Mitigation |
|---|---|
| Forward jump | Gaps in ACS windows; prefer NTP slew; off-shift |
| Backward jump | Duplicate stamps; export events first |
| TZ wrong but clock “looks” right | Always set `timeZone` + mode; GET after PUT |
| Manual vs NTP fight | One source of truth |
| `notSupport` on PUT | GET capabilities; PUT the GET template |
| Air-gapped public NTP | LAN NTP on the VM |

## What this pass did **not** do

- No PUT/POST to any panel
- No NTP enable
- No BNPI PATS clock-writer feature
- No live 2026-08-19 GET (API/VM unreachable from this host)

## Sources

- Code: `hikvision.endpoint.ts`, health GET, `check-hikvision-device-clock.ts`, `hikvision-event-contract.helper.ts`, C++ `sdk_time_to_string`
- BNPI GET: `docs/HIKVISION_LINUX_TRIAL_20260701.md`; `.runtime/hikvision-greenlight-check-20260817/`; Device 5 health packs
- Vendor: ISAPI Face Recognition Terminals (GET/PUT time + ntpServers); DS-K1T Time Settings manuals; [Hik-Connect Time Configuration](https://www.hik-connect.com/views/terms/newHelp/helpIos/GUID-D4BE2F75-E08E-4326-9576-4A7DD45E588B.html); [iVMS Batch Time Sync](https://supportusa.hikvision.com/support/solutions/articles/17000130943-can-you-sync-the-time-on-all-devices-in-the-ivms-4200-with-the-pc-time-)
- Open ISAPI example: PUT `/ISAPI/System/time/ntpServers/1` with `NTPServer` XML ([cnblogs ISAPI passthrough](https://www.cnblogs.com/lsgxeva/p/16414498.html)); ZoneMinder GET/PUT `ISAPI/System/time`
- POSIX: `CST-8` = UTC+8; PH no DST
