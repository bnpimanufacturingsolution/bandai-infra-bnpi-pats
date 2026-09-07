# Integration API: Employee Search

`GET /api/employee/search` — machine-to-machine employee lookup for external
applications (kiosks, partner systems, dashboards). Lightweight, fuzzy-capable,
paginated. Exposes **no salary/payroll data**.

Status: `CONFIRMED_CODE_AND_LIVE_LOCAL` (2026-09-04, `localhost:3001`).
Owner: hris-api (`app/employee/employee.controller.ts` → `searchEmployees`,
route in `app/employee/employee.router.ts`, auth in
`middleware/integrationApiKey.ts`).

---

## 1. Authentication (two accepted modes)

| Mode | How | Notes |
|---|---|---|
| **API key (integration)** | Header `X-API-Key: <key>` | Keys come from server env `INTEGRATION_API_KEYS` (comma-separated list). Fail-closed: if the env var is unset/empty the endpoint answers **503** rather than allowing open access. Comparison is timing-safe. |
| **JWT (HRIS users)** | Header `Authorization: Bearer <token>` from `POST /api/auth/login` | Same token as every other `/api` route. |

Wrong or missing key → `401`. Unconfigured server → `503` (deployment issue,
not a client error). Invalid JWT → `401`.

### Providing keys per environment

```bash
# local dev (hris-api/.env — never commit real values)
INTEGRATION_API_KEYS="hris_dev_key_one,hris_dev_key_two"

# VM/K3s runtime envs (appliance env / secret plumbing)
INTEGRATION_API_KEYS="hris_prod_team_a"
```

- One key **per consuming team** — rotate by appending the new key, giving the
  team time to switch, then removing the old one (comma-separated = zero
  downtime rotation).
- Changing the env requires an API process restart (K3s rollout).
- Generate keys with sufficient entropy, e.g.
  `openssl rand -hex 24` prefixed with `hris_`.

---

## 2. Endpoint

```
GET /api/employee/search?query=<text>&page=1&limit=10&sort=relevance
```

### Query parameters

| Param | Required | Default | Constraints | Description |
|---|---|---|---|---|
| `query` | **yes** | — | non-empty | Search text. Aliases: `q`, `search`. Multi-word supported. |
| `page` | no | `1` | ≥ 1 | 1-based page number. |
| `limit` | no | `10` | 1–100 (values above are clamped to 100) | Rows per page. |
| `sort` | no | `relevance` | `relevance`, `employeeId`, `employeeId:desc`, `fullName`, `fullName:desc` | `relevance` = exact matches in employeeId order first, then fuzzy matches by lowest edit score. Named sorts apply to matched rows only. |
| `employmentStatus` | no | — | exact match, e.g. `ACTIVE` | Filter. |
| `employmentType` | no | — | exact match, e.g. `REGULAR` | Filter. |
| `departmentId` | no | — | exact id | Filter. |
| `positionId` | no | — | exact id | Filter. |

### Matching semantics

1. **DB phase** — one pool query with the structural filters above applied
   (`isDeleted=false` + status/type/department/position), capped at 5000 rows.
   No text matching happens in SQL, so typo-only candidates still reach the
   fuzzy scorer.
2. **Match phase (in app)** — every query term must match at least one
   haystack (AND-of-terms, case-insensitive). Haystacks: `employeeId`,
   `fullName`, `firstName`, `middleName`, `lastName`, `email`.
   - **Exact** = substring match → `exactRows` (order: employeeId asc).
   - **Fuzzy** = per-word Damerau-Levenshtein distance when the exact phase
     fails: distance ≤ 1 for terms of 3–6 characters, ≤ 2 for 7+; terms of
     1–2 characters are exact-only. Fuzzy rows rank by lowest total distance,
     tie-broken by employeeId. `relevance` always lists exact rows before
     fuzzy rows.
3. **Pagination phase** — `total` = exact + fuzzy matched rows; the page slice
   is taken after sorting. Deep pages beyond the result set return an empty
   `employees` array with honest `hasNext=false`.

### Response

Standard success envelope (`{ status, message, data, code, timestamp }`).
`data`:

```json
{
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
    }
  ],
  "count": 1,
  "pagination": {
    "total": 454, "page": 1, "limit": 10,
    "totalPages": 46, "hasNext": true, "hasPrev": false
  },
  "query": "z",
  "sort": "relevance",
  "fuzzy": 0,
  "limit": 10
}
```

`data.fuzzy` = number of rows matched only via typo tolerance in this result
set (`0` when everything matched exactly or the term is 1–2 chars).

### Errors

| HTTP | Meaning |
|---|---|
| `400` | Missing/empty `query` |
| `401` | Missing/invalid API key **or** JWT |
| `503` | API-key auth requested but `INTEGRATION_API_KEYS` unset on the server (fail-closed) |
| `500` | Unexpected server error (check server logs; transient DB-forward drops have been observed in local dev) |

Responses are cached 30 seconds per unique query string (Express cache
middleware, key `cache:employee:search:<query>`).

---

## 3. Environment URL matrix

| Environment | Base URL | API-key env source |
|---|---|---|
| Local dev | `http://localhost:3001` | `hris-api/.env` |
| VM PROD | `http://10.184.37.19:3001` / `https://api.bnpi-hris.tech` | PROD runtime env |
| VM DEV | `http://10.184.37.19:3101` / `https://dev-api.bnpi-hris.tech` | DEV runtime env |
| VM UAT | `http://10.184.37.19:3201` / `https://uat-api.bnpi-hris.tech` | UAT runtime env |

Runtime environments must define `INTEGRATION_API_KEYS` in their env/secret
plumbing before the API-key mode works there; JWT mode works immediately.

---

## 4. Client examples

### cURL — quick start (public)

```bash
# DEV (swap host for PROD/UAT per the matrix above; ask the admin for your env's key)
curl --location 'https://dev-api.bnpi-hris.tech/api/employee/search?query=z&page=1&limit=10' \
  --header 'X-API-Key: <KEY>'

# Fuzzy typo tolerance example (matches "Zen Andrei" from "zan andrei")
curl --location 'https://dev-api.bnpi-hris.tech/api/employee/search?query=zan%20andrei&limit=10' \
  --header 'X-API-Key: <KEY>'
```

### cURL — local dev

```bash
curl --location 'http://localhost:3001/api/employee/search?query=z&page=2&limit=10' \
  --header 'X-API-Key: <KEY>'
```

### JavaScript (fetch)

```js
const res = await fetch(
  "https://dev-api.bnpi-hris.tech/api/employee/search?query=zan%20andrei&limit=10",
  { headers: { "X-API-Key": process.env.HRIS_API_KEY } },
);
const { data } = await res.json();
console.log(data.employees, data.pagination);
```

### Python (requests)

```python
import requests
r = requests.get(
    "https://dev-api.bnpi-hris.tech/api/employee/search",
    params={"query": "zan andrei", "limit": 10},
    headers={"X-API-Key": api_key},
    timeout=15,
)
employees = r.json()["data"]["employees"]
```

---

## 5. Operational notes

- **Activity logging**: every search is activity-logged
  (`SEARCH_EMPLOYEES` / "Searched employees via integration API").
- **No payroll exposure**: the row shape is fixed and deliberately excludes
  salary, payroll, benefits, and document data.
- **Tests**: `hris-api/tests/employee-integration-search.spec.ts` (13) +
  `hris-api/tests/integration-api-key.spec.ts` (8). Run scoped:
  `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-integration-search.spec.ts tests/integration-api-key.spec.ts`
- **Pool cap**: fuzzy matching covers the first 5000 filter-scoped employees
  (fleet is ~2,225 today). If the fleet grows past the cap, revisit with a
  trigram index.
- **Git hygiene**: `hris-api/.env` is (pre-existing) tracked in git — real
  integration keys must never be committed; register runtime keys through the
  env/secret plumbing instead.

## Changelog

- 2026-09-04 — Initial release: fuzzy ranking, page/limit, named sorts,
  status/type/department/position filters, `X-API-Key` auth lane (fail-closed),
  JWT compatibility, OpenAPI docs block.
