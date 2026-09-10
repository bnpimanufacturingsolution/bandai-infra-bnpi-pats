# Bandai HRIS — Employee Search API (Team Handoff)

> **Audience:** consuming teams integrating with the Bandai HRIS employee-search API.
> Full parameter reference: `docs/INTEGRATION_EMPLOYEE_SEARCH_API.md` in the repo.
> Last verified: 2026-09-07 (every curl in this file was executed and returned HTTP 200).

---

## 1. What this API does

Search live employee records by name / employee ID / email, with typo-tolerant
fuzzy matching, pagination, sorting, and exact filters. **No salary or payroll
data is ever returned.**

| Environment | Base URL | Status |
|---|---|---|
| PROD | `https://api.bnpi-hris.tech` | Live 2026-09-07 |
| DEV | `https://dev-api.bnpi-hris.tech` | Live 2026-09-07 |
| UAT | `https://uat-api.bnpi-hris.tech` | Live 2026-09-07 |

⚠️ **Security:** the working key below is a real credential. Treat it like a
password — do not commit it to any repo, do not paste it into public tickets,
and read it from an environment variable in your code.

---

## 2. Authentication

Send your API key in the `X-API-Key` request header.

| HTTP | Meaning |
|---|---|
| `200` | Success |
| `400` | Missing/empty `query` parameter |
| `401` | Missing or invalid API key |
| `503` | Server key list not configured (fail-closed) |

Keys are **per environment and per team**. Ask the HRIS admin for your team's
key. Rotation is zero-downtime: the admin appends your new key, you switch,
the old one is removed.

---

## 3. Working cURL samples (verified 2026-09-07)

### DEV — basic search

```bash
curl 'https://dev-api.bnpi-hris.tech/api/employee/search?query=z&page=1&limit=2' \
  -H 'X-API-Key: hris_dev_db8c2a2d810b0757b991b1a5a741ef2f86633f319ceabdc9'
```

**Actual response (trimmed):**

```json
{
  "status": "success",
  "message": "Employee search completed successfully",
  "data": {
    "employees": [
      {
        "id": "cmspnnxot02s5qw01yk7yy2er",
        "employeeId": "00010",
        "firstName": "Zen",
        "middleName": "",
        "lastName": "Andrei",
        "fullName": "Zen Andrei",
        "email": "zensample@gmail.com",
        "employmentStatus": "ACTIVE",
        "employmentType": "PROBATIONARY",
        "department": { "id": "…", "name": "Quality & Compliance Unit" },
        "position": { "id": "…", "title": "Technician" }
      },
      {
        "employeeId": "00091",
        "fullName": "Melanie Malabanan Gonzales",
        "email": "lhaniegonzales06@gmail.com"
      }
    ],
    "count": 2,
    "pagination": {
      "total": 486, "page": 1, "limit": 2,
      "totalPages": 243, "hasNext": true, "hasPrev": false
    },
    "query": "z",
    "sort": "relevance",
    "fuzzy": 0,
    "limit": 2
  },
  "code": 200
}
```

### PROD — fuzzy typo tolerance

`zen` (typo for "Zen") still matches, and `data.fuzzy` tells you how many rows
matched only via typo tolerance:

```bash
curl 'https://api.bnpi-hris.tech/api/employee/search?query=zen&limit=1' \
  -H 'X-API-Key: hris_prod_06501d5157412a9283ff5b53c4c4f10e406742ecfff0f060'
```

**Actual response (trimmed):**

```json
{
  "status": "success",
  "data": {
    "employees": [
      {
        "employeeId": "00338",
        "fullName": "June Nil De Castro Verzero",
        "email": "frozenflame0802@gmail.com",
        "department": { "name": "Production" },
        "position": { "title": "Senior Supervisor" }
      }
    ],
    "count": 1,
    "pagination": { "total": 8, "page": 1, "limit": 1, "totalPages": 8, "hasNext": true, "hasPrev": false },
    "query": "zen",
    "sort": "relevance",
    "fuzzy": 3,
    "limit": 1
  }
}
```

### UAT — smoke check

```bash
curl 'https://uat-api.bnpi-hris.tech/api/employee/search?query=z&limit=1' \
  -H 'X-API-Key: hris_uat_573c99707038ee77fd6bbfab76ae000be052125ec9710cb9'
```

→ HTTP 200 in ~1s.

---

## 4. Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `query` (alias `q`, `search`) | string | required | Space-separated words are AND-matched against employeeId, name parts, email. Fuzzy (typo) tolerance: words 3–6 chars allow distance 1; 7+ allow distance 2; 1–2 chars exact-only. |
| `page` | int | 1 | 1-based |
| `limit` | int | 10 | max 100 |
| `sort` | enum | `relevance` | `relevance` \| `employeeId` \| `employeeId:desc` \| `fullName` \| `fullName:desc` |
| `employmentStatus` | enum | — | exact filter — see values below |
| `employmentType` | enum | — | exact filter — see values below |
| `departmentId` | CUID | — | exact filter — see "Discovering IDs" below |
| `positionId` | CUID | — | exact filter — see "Discovering IDs" below |

**`employmentStatus` — allowed values (case-sensitive, from schema):**

| Value | Meaning |
|---|---|
| `ACTIVE` | Currently working |
| `RESIGNATION_REQUESTED` | Resignation submitted, pending approval |
| `SERVING_NOTICE` | Exit clearance done, working final days |
| `OFFBOARDING` | Approved resignation, offboarding in progress |
| `ONBOARDING` | New hire, onboarding in progress |
| `INACTIVE` | Temporarily inactive |
| `TERMINATED` | Terminated by company |
| `RESIGNED` | Completed resignation process |
| `FORMER_EMPLOYEE` | No longer with company (resigned/terminated) |
| `RETIRED` | Retired |
| `ON_LEAVE` | On leave |

**`employmentType` — allowed values (case-sensitive, from schema):**

| Value | |
|---|---|
| `REGULAR` | |
| `PROBATIONARY` | |
| `CONTRACTUAL` | |
| `PART_TIME` | |
| `CONSULTANT` | |
| `INTERN` | |

**Discovering valid `departmentId` / `positionId` values** (they are CUIDs
like `cmryaf7ml0015nj3o5k6ljg78`, not names):

1. **From search results themselves (no extra access needed):** every row
   already includes `department.id` / `department.name` and `position.id` /
   `position.title` — grab the ID from a result row and reuse it to refine.
2. **Admin/HR JWT list endpoints:** `GET /api/department?document=true&pagination=true`
   and `GET /api/position?document=true&pagination=true` return the full
   catalog with `id` + `name`/`title` (requires an HRIS JWT, not the API key).

**Verified filter-chain example** (HTTP 200, live 2026-09-07):

```bash
curl 'https://dev-api.bnpi-hris.tech/api/employee/search?query=a&employmentStatus=ACTIVE&employmentType=REGULAR&limit=1' \
  -H 'X-API-Key: <KEY>'
```

**Examples:**

```bash
# Filter + sort + paginate
curl 'https://dev-api.bnpi-hris.tech/api/employee/search?query=tech&page=2&limit=10&sort=fullName&employmentStatus=ACTIVE' \
  -H 'X-API-Key: <KEY>'

# AND semantics: both words must match
curl 'https://dev-api.bnpi-hris.tech/api/employee/search?query=zen%20andrei' \
  -H 'X-API-Key: <KEY>'
```

---

## 5. Code samples

### JavaScript (fetch) — read key from env, never hardcode

```js
const res = await fetch(
  "https://dev-api.bnpi-hris.tech/api/employee/search?query=zan%20andrei&limit=10",
  { headers: { "X-API-Key": process.env.HRIS_API_KEY } },
);
if (res.status === 401) throw new Error("Check HRIS_API_KEY — rejected");
const { data } = await res.json();
console.log(data.employees, data.pagination);
```

### Python (requests)

```python
import os, requests

r = requests.get(
    "https://dev-api.bnpi-hris.tech/api/employee/search",
    params={"query": "zan andrei", "limit": 10},
    headers={"X-API-Key": os.environ["HRIS_API_KEY"]},
    timeout=15,
)
r.raise_for_status()
data = r.json()["data"]
print(data["employees"], data["pagination"])
```

---

## 6. Integration notes for AI-assisted builds

- Responses are **cached 30 seconds** per identical query string — identical
  back-to-back requests may return the same result instantly.
- `hasNext` / `hasPrev` drive pagination; deep pages are honest (a page past
  the end returns an empty `employees[]`, not an error).
- Typo tolerance is **per word**; short terms (1–2 chars) are exact-only, so
  `query=z` never fuzzy-expands.
- The endpoint never returns salary/payroll fields — do not code for them.
- URL-encode spaces in `query` (`%20`) as shown in the samples.

---

## 7. Getting your own team key

Keys are per-team and per-environment. Contact the HRIS admin with your team
name; a distinct key is appended to the server allowlist with zero downtime
(rotation = append → consumers switch → old key removed).

---

*Endpoint live-proof evidence: `.runtime/employee-search-env-probe-20260907-121922/` (repo-internal).*
