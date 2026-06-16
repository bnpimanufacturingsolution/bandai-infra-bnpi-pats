# Project Truth VirtualBox OVA

Verified: 2026-06-17 06:24 local host time

- Final artifact: `node-health-appliance-latest.ova`
- Artifact type: Oracle VirtualBox OVA
- Size: 2.574 GiB / 2,763,731,968 bytes
- SHA256: `4928ae882716967013edf0bc6371f57411d841065cf13bb740f620b897394683`
- Network default: Adapter 1 bridged, Adapter 2 disabled
- Bridge adapter tested: `Hyper-V Virtual Ethernet Adapter #3`
- Windows host IP: `192.168.100.174`
- Final imported guest LAN IP: `192.168.100.77`
- Guest IP host-owned: no

## Windows Host Curl Proof

```powershell
curl.exe http://192.168.100.77:3001/health
curl.exe http://192.168.100.77:3002/health
curl.exe http://192.168.100.77:3000/health
```

```json
{"status":"ok","environment":"DEV","version":"gitops-dev-webhook-trycloudflare-001"}
{"status":"ok","environment":"UAT","version":"gitops-uat-001"}
{"status":"ok","environment":"PROD","version":"gitops-prod-001"}
```

The appliance is pinned to `192.168.100.77/24` for this bridged LAN. Run `project-truth-status` in the VM console to see the current IP and curl commands.


Watchdog fix proof: `logs\watchdog-fix-final-status.txt`.

