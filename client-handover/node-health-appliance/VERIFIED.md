# Verified

PASS: `node-health-appliance-latest.ova` imported cleanly, booted on bridged LAN, and passed Windows host curl.

- SHA256: `4928ae882716967013edf0bc6371f57411d841065cf13bb740f620b897394683`
- Size: 2.574 GiB / 2,763,731,968 bytes
- Bridge adapter tested: `Hyper-V Virtual Ethernet Adapter #3`
- Windows host IP: `192.168.100.174`
- Final guest LAN IP: `192.168.100.77`
- Guest IP host-owned: no

Passed:

```powershell
curl.exe http://192.168.100.77:3001/health
curl.exe http://192.168.100.77:3002/health
curl.exe http://192.168.100.77:3000/health
```

Returned DEV/UAT/PROD expected JSON exactly.


Watchdog fix proof: `logs\watchdog-fix-final-status.txt`.

## HRIS Monorepo Docker LAN Verification

PASS on `2026-06-17`: the HRIS monorepo Docker architecture now runs as the two intended services only:

- `hris-api`
- `hris-app`

No standalone `health` service/container is part of the HRIS Docker architecture.

Verified host LAN IP: `192.168.110.65`

Passed:

```powershell
npm run build # in hris-api
npm run build # in hris-app
docker compose -f .\appliance\docker-compose.yml build
docker compose -f .\appliance\docker-compose.yml up -d
curl.exe http://localhost:3001/health
curl.exe http://localhost:3000/
curl.exe http://192.168.110.65:3001/health
curl.exe http://192.168.110.65:3000/
```

CORS preflight passed for:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://192.168.110.65:3000`

The app LAN browser path was checked with Playwright at `http://192.168.110.65:3000/`; it returned HTTP `200` with no relevant CORS/fetch/localhost console errors.

Detailed HRIS handover: `client-handover/hris-monorepo-docker-lan.md`.

