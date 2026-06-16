# Full VirtualBox Clean Rebuild Verify Results

## Artifact

- Path: `client-handover\node-health-appliance\node-health-appliance-latest.ova`
- Type: Oracle VirtualBox OVA
- Size: 2.574 GiB / 2,763,731,968 bytes
- SHA256: `4928ae882716967013edf0bc6371f57411d841065cf13bb740f620b897394683`

## Network

- Adapter 1 default: bridged
- Adapter 2 default: none
- Bridge tested: `Hyper-V Virtual Ethernet Adapter #3`
- Windows host IP: `192.168.100.174`
- Final imported guest LAN IP: `192.168.100.77`
- Guest IP unique and not host-owned: yes

## Curl Proof

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

## Guest Status

`project-truth-status` showed DEV/UAT/PROD PASS, healthy Docker containers, LAN IP `192.168.100.77`, and active watchdog.

## Console

`logs\final-console.png` showed a clean Ubuntu login prompt with no endless watchdog/soft-lockup spam.

## WARN

The disposable repair VM required VirtualBox poweroff after guest OS and ACPI shutdown did not complete. The final OVA was still re-imported cleanly afterward and passed Windows host LAN curl without manual repair.


Watchdog fix proof: `logs\watchdog-fix-final-status.txt`.

