# Project Truth VirtualBox OVA

Verified: 2026-06-17 00:27 local host time

- Final artifact: `node-health-appliance-latest.ova`
- Artifact type: Oracle VirtualBox OVA
- Size: 2.727 GiB / 2,927,792,128 bytes
- SHA256: `babd5d7f18f46ec0371834e365b87297f380c23e410cc598a579b534b20c872c`
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

The appliance uses DHCP on Adapter 1, so the actual LAN IP may change on another network. Run `project-truth-status` in the VM console to see the current IP and curl commands.
