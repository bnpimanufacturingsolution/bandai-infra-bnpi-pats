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

