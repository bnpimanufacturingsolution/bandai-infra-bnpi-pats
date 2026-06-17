# HRIS Monorepo Docker LAN Handover

Parent repo path: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`

## Source Provenance

- `hris-api` former branch/commit: `develop` / `8a81340e1325631f240f6b08dc1c09be771316da`
- `hris-app` former branch/commit: `develop` / `2f6ba33c6fb6f576a4fdcc6a455d66352e5198e5`
- Nested `.git` folders: absent for both `hris-api` and `hris-app`

## Docker Architecture

Main appliance compose file: `appliance/docker-compose.yml`

Visible services:

- `hris-api`
- `hris-app`

There is no standalone `health` service. Health checks are attached to the app/API services.

Ports:

- `hris-api`: `0.0.0.0:3001->3001`
- `hris-app`: `0.0.0.0:3000->3000`

Runtime LAN behavior:

- API listens on `HOST` or `0.0.0.0` by default.
- App static server listens on `0.0.0.0`.
- Browser runtime API base infers `http://<same-host>:3001` when the app is opened from a LAN hostname/IP and no explicit `VITE_API_BASE_URL` is built in.

## CORS

API CORS allows explicit configured origins and private LAN app origins on port `3000` when `ALLOW_LAN_CORS` is not `false`.

Required origins:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://<LAN-IP>:3000`

With credentials enabled, the API echoes the matched request origin instead of using `*`.

## Verification Commands

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH\hris-api
npm run build

cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH\hris-app
npm run build

cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
docker compose -f .\appliance\docker-compose.yml build
docker compose -f .\appliance\docker-compose.yml up -d
docker compose -f .\appliance\docker-compose.yml ps
curl.exe -i http://localhost:3001/health
curl.exe -i http://localhost:3000/
curl.exe -i http://<LAN-IP>:3001/health
curl.exe -i http://<LAN-IP>:3000/
curl.exe -i -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" http://localhost:3001/health
curl.exe -i -X OPTIONS -H "Origin: http://127.0.0.1:3000" -H "Access-Control-Request-Method: GET" http://localhost:3001/health
curl.exe -i -X OPTIONS -H "Origin: http://<LAN-IP>:3000" -H "Access-Control-Request-Method: GET" http://<LAN-IP>:3001/health
```

## Latest Verification

Verification date: `2026-06-17`

Host LAN adapter/IP tested:

- `vEthernet (ProjectTruth-External)`
- `192.168.110.65`

Docker services:

- `hris-api`: `hris-api-local:develop`, `614MB`
- `hris-app`: `hris-app-local:develop`, `1.3GB`
- No standalone `health` container/service was present.

Container status:

- `hris-api`: healthy, `0.0.0.0:3001->3001/tcp`
- `hris-app`: healthy, `0.0.0.0:3000->3000/tcp`

Build results:

- `hris-api`: `npm run build` PASS
- `hris-app`: `npm run build` PASS
- `docker compose -f .\appliance\docker-compose.yml build` PASS
- `docker compose -f .\appliance\docker-compose.yml build hris-app` PASS after LAN runtime-base fix

Curl results:

- `http://localhost:3001/health`: HTTP `200`
- `http://localhost:3000/`: HTTP `200`
- `http://192.168.110.65:3001/health`: HTTP `200`
- `http://192.168.110.65:3000/`: HTTP `200`

CORS preflight results:

- Origin `http://localhost:3000`: HTTP `204`, `Access-Control-Allow-Origin: http://localhost:3000`, credentials `true`
- Origin `http://127.0.0.1:3000`: HTTP `204`, `Access-Control-Allow-Origin: http://127.0.0.1:3000`, credentials `true`
- Origin `http://192.168.110.65:3000`: HTTP `204`, `Access-Control-Allow-Origin: http://192.168.110.65:3000`, credentials `true`

Browser/runtime verification:

- Playwright loaded `http://192.168.110.65:3000/`: HTTP `200`
- Relevant CORS/fetch/localhost console errors: `0`
- The rebuilt app container bundle no longer contains a literal `localhost:3001`; LAN browsers fall through to same-host API base `http://<LAN-IP>:3001`.

Warnings:

- API build still reports existing webpack optional dynamic-import/module-resolution warnings.
- App build still reports existing sourcemap and chunk-size warnings.
- App dependency pruning reports existing Node engine warnings for some packages under Node 20.
- The earlier standalone `hris-app-local` container and old manual Node API process were stopped so the final runtime is Docker Compose-owned.
