# BNPI HRIS .tech Cloudflare Status - 2026-06-29

## Goal

Make the purchased domain `bnpi-hris.tech` work through the existing Cloudflare named tunnel for the BNPI HRIS production app.

Target app:

```text
http://10.184.38.91:3000/auth/login
```

Target public hostnames:

```text
https://bnpi-hris.tech/auth/login
https://www.bnpi-hris.tech/auth/login
https://app.bnpi-hris.tech/auth/login
```

## Current Evidence

- The domain currently delegates to OrderBox DNS:
  - `tech-domains.earth.orderbox-dns.com`
  - `tech-domains.mars.orderbox-dns.com`
  - `tech-domains.mercury.orderbox-dns.com`
  - `tech-domains.venus.orderbox-dns.com`
- No `bnpi-hris.tech` Cloudflare zone is visible to the currently authenticated Cloudflare account/token.
- The available local Cloudflare token verifies successfully but cannot create zones.
- Cloudflare API zone creation failed with missing permission:

```text
com.cloudflare.api.account.zone.create
```

- Existing Cloudflare account visible from local auth:
  - `49d353a7bd06c70dd6ae4bc1f3d3122c`
- Existing named tunnel is connected:
  - Tunnel: `bnpi-hris`
  - Tunnel ID: `1c8ee2c4-c9c5-4840-be39-639e4b5f605b`
- Local tunnel config now includes ingress for:
  - `bnpi-hris.tech`
  - `www.bnpi-hris.tech`
  - `app.bnpi-hris.tech`
- The Hyper-V VM `project-truth-local-vhdx-proof` was started and retained LAN IP `10.184.38.91`.
- PROD app health after VM start:
  - `http://10.184.38.91:3000/auth/login`
  - HTTP `200`
  - title `HR Management System`
- Scheduled tunnel task is running:
  - `ProjectTruth-BNPI-HRIS-Cloudflared`

## Update After Manual Cloudflare DNS Setup

- User added the required proxied Cloudflare DNS records:
  - `app.bnpi-hris.tech CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com`
  - `bnpi-hris.tech CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com`
  - `www.bnpi-hris.tech CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com`
- Cloudflare dashboard reports assigned nameservers:
  - `chase.ns.cloudflare.com`
  - `sierra.ns.cloudflare.com`
- Cloudflare public resolver `1.1.1.1` resolves the domain to Cloudflare nameservers and Cloudflare proxy IPs.
- The Windows default resolver still returned stale OrderBox nameserver data during verification.
- HTTPS checks to `www.bnpi-hris.tech` and `app.bnpi-hris.tech` reached Cloudflare proxy IPs but reset during TLS handshake.
- Current interpretation: Cloudflare zone activation, DNS cache propagation, or Universal SSL issuance is still settling. The VM origin itself is healthy.

## Update After Tunnel Restart

- The scheduled named tunnel task was restarted and is running:
  - `ProjectTruth-BNPI-HRIS-Cloudflared`
- `cloudflared tunnel info bnpi-hris` reports an active connector.
- Cloudflare public resolver still resolves all three hostnames to Cloudflare proxy IPs.
- Explicit HTTP checks to Cloudflare edge IPs for all three hostnames returned:

```text
HTTP/1.1 530
Server: cloudflare
```

- Current interpretation: DNS records and tunnel connector are correct, but the Cloudflare zone is still not fully active at the edge. Cloudflare dashboard must show the zone as `Active`, and Universal SSL should become active, before the public hostname is expected to work.

## Remaining Cutover Steps

1. In Cloudflare, add a new site/zone:

```text
bnpi-hris.tech
```

Use a full zone on the Free plan unless a paid plan is intentionally needed.

2. Copy the two Cloudflare nameservers assigned to `bnpi-hris.tech`.

The existing `uzaro.net` nameservers are not guaranteed to be reused. Use the nameservers shown for the new `bnpi-hris.tech` zone.

3. In the domain registrar dashboard shown by the user, replace all current OrderBox nameservers:

```text
tech-domains.earth.orderbox-dns.com
tech-domains.mars.orderbox-dns.com
tech-domains.mercury.orderbox-dns.com
tech-domains.venus.orderbox-dns.com
```

with the two Cloudflare nameservers assigned to `bnpi-hris.tech`.

4. After the Cloudflare zone is visible to the local token, add proxied CNAME records:

```text
bnpi-hris.tech     CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com  proxied
www.bnpi-hris.tech CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com  proxied
app.bnpi-hris.tech CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com  proxied
```

Cloudflare supports CNAME flattening at the apex, so the apex `bnpi-hris.tech` CNAME is acceptable inside Cloudflare DNS.

## Verification Commands

```powershell
Resolve-DnsName bnpi-hris.tech -Type NS
Resolve-DnsName bnpi-hris.tech -Type A
Resolve-DnsName www.bnpi-hris.tech -Type A
Resolve-DnsName app.bnpi-hris.tech -Type A
curl.exe -I https://bnpi-hris.tech/auth/login
curl.exe -I https://www.bnpi-hris.tech/auth/login
curl.exe -I https://app.bnpi-hris.tech/auth/login
```

## Notes

- This is not blocked by the tunnel or VM after the VM was restarted.
- The remaining blocker is Cloudflare zone creation permission or one manual Cloudflare dashboard add-site step.
- Do not expose raw database ports through public HTTP tunnels.
