# Why only 853 employees are scheduled on Monday 2026-08-17

Weekday of requested date: **Mon**. Same rule as Attendance Overview: a person is “scheduled to work” only if they have a **regular (not off) shift** on that calendar day.

## Short answer

853 is not “everyone in the company.” It is **ACTIVE/ONBOARDING people whose Monday shift is a work day**. Everyone else is rest, missing schedule, or outside the employee filter.

## How today is split

| Bucket | Count | What it means | In the 853 card? |
|---|---:|---|---|
| Regular work today | **853** | Monday shift exists and is **not** rest/off | Yes — this is the 853 |
| Rest / off today | **0** | They have a schedule, but Monday is a rest day | No |
| No schedule record | **1360** | `embeddedSchedule` is empty | No — Missing schedule |
| Schedule exists but Monday unresolved | **0** | Template/pattern present, no resolvable Monday shift | No — Missing schedule |
| Missing schedule total | **1360** | Matches the card’s Missing schedule | No |
| Not started yet | 0 | Hire/start date after 2026-08-17 | No |
| Already terminated | 13 | Termination before 2026-08-17 | No |
| In attendance employee filter | **2226** | Not deleted + ACTIVE/ONBOARDING (or still-terminated-in-range) | Parent set |

Check: scheduled + rest + missing + skipped = 2226 (filter size 2226).

## All employees in the org (not just the 853)

| Employment status | Count |
|---|---:|
| ACTIVE | 2060 |
| ONBOARDING | 166 |
| deleted (excluded) | 0 |

The card does **not** use every employee row. It uses people who are not deleted and are ACTIVE or ONBOARDING (or terminated but still in range).

## Workforce source in the 853 vs the full filter

| Source | In filter | Scheduled today |
|---|---:|---:|
| AGENCY | 1355 | 0 |
| DIRECT | 871 | 853 |

## Why Monday is rest for some people who *do* have a schedule

If a template is 6-day / rotating / Sun–Thu, **Monday can be their rest day**. Those people have a schedule, but they are not “scheduled to work” today.

| Template (rest today) | People |
|---|---:|

## Templates among the 853 who *are* working Monday

| Template | People |
|---|---:|
| BNPI_SCHED_MON_SAT_WS_0600_1400_BR_1115_1145 | 423 |
| BNPI_SCHED_MON_SAT_WS_0645_1545_BR_1045_1145 | 127 |
| BNPI_SCHED_MON_SAT_WS_0800_1600_BR_1215_1245 | 77 |
| BNPI_SCHED_MON_SAT_WS_0815_1615_BR_1215_1245 | 67 |
| BNPI_SCHED_MON_SAT_WS_0715_1515 | 44 |
| BNPI_WS_MON_SAT_WS_0700_1500 | 39 |
| BNPI_WS_MON_SAT_WS_0615_1415 | 18 |
| BNPI_WS_MON_SAT_WS_0645_1445 | 18 |
| BNPI_SCHED_MON_SAT_WS_0745_1545_BR_1145_1215 | 12 |
| REGULAR_14DAY_ROTATION | 7 |
| BNPI_SCHED_MON_SAT_WS_0600_1500_BR_1045_1145 | 6 |
| BNPI_SCHED_MON_SAT_WS_0700_1600_BR_0830_0845 | 4 |
| BNPI_WS_MON_SAT_WS_0545_1345 | 3 |
| BNPI_WS_MON_SAT_WS_0730_1530 | 3 |
| BNPI_SCHED_MON_SAT_WS_0800_1600_BR_1200_1230 | 1 |

## Departments in the 853

| Department | Scheduled today |
|---|---:|
| Production | 601 |
| Product Engineering | 79 |
| Product Assurance | 63 |
| Purchasing | 37 |
| Administration | 29 |
| N/A | 18 |
| Business Strategy | 17 |
| Software Development | 4 |
| Human Resources | 2 |
| Executive | 1 |
| Purchasing/Product Engineering/Product Assurance | 1 |
| QCU/Business Strategy/Customer Service | 1 |

## Why 1,360 show as Missing schedule

| Reason Monday shift could not be resolved | People |
|---|---:|
| no embeddedSchedule | 1360 |

Those 1,360 are still employees. They stay on **Schedule Coverage → Missing schedule**. They are not in Utilization / Not clocked in, because the system has no regular Monday work shift for them.

## Sample: rest today (have a schedule, Monday off)

| ID | Name | Dept | Template |
|---|---|---|---|

## Sample: missing schedule (no Monday work shift)

| ID | Name | Dept | Status | Template |
|---|---|---|---|---|
| CPS-B4425 | Rose Ann M. Carandang | Production | ACTIVE | (no template) |
| NC-BNP1310 | Mark Allen Bautista Maniquiz | Production | ACTIVE | (no template) |
| CGSIBAT012117 | Mark Anthony M. Llames | Production | ONBOARDING | (no template) |
| CPS-B4430 | Rhea D. Plandez | Production | ACTIVE | (no template) |
| NC-BNP1315 | Meriam Micosa Milar | Production | ACTIVE | (no template) |
| CPS-B4503 | Aaliyah D. Bruzo | Production | ACTIVE | (no template) |
| NC-BNP1318 | Leo Barbosa Segovia | Purchasing | ACTIVE | (no template) |
| CPS-B4441 | Angelica O. Magsino | Production | ACTIVE | (no template) |
| A-14724 | Marlon C. Barde | Production | ACTIVE | (no template) |
| A-15130 | Vanessa A. Guico | Production | ACTIVE | (no template) |
| CPS-B4442 | Leah Rhose O. Marzo | Production | ACTIVE | (no template) |
| A-15132 | Hazel Joy P. Magnaye | Production | ACTIVE | (no template) |
| NC-BNP1322 | Clarence Evangelista Atienza | Production | ACTIVE | (no template) |
| CPS-B4444 | Kurt Reiñel V. Tuca | Production | ACTIVE | (no template) |
| NC-BNP1323 | Melanie Baltar Mendoza | Administration | ACTIVE | (no template) |

## What this is not

- It is **not** “only 853 employees exist.”
- It is **not** a clock-in count. Clock-ins today are 0; the 853 still have a work shift.
- The old **1,706** was Monday+Tuesday (UTC end-of-day spilling into Tuesday). That was a date-range bug, not 1,706 unique Monday people.

Generated: 2026-08-17T02:04:13.849Z
