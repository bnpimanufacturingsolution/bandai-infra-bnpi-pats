# Verified

PASS: `node-health-appliance-latest.ova` imported cleanly, booted on bridged LAN, and passed Windows host curl.

- SHA256: `babd5d7f18f46ec0371834e365b87297f380c23e410cc598a579b534b20c872c`
- Size: 2.727 GiB / 2,927,792,128 bytes
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
