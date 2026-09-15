# Uzaro Cloudflare Cutover Evidence - 2026-06-29

## Current State

- Cloudflare zone `uzaro.net` exists in account `49d353a7bd06c70dd6ae4bc1f3d3122c`.
- Cloudflare zone status is `initializing`.
- Cloudflare expects nameservers:
  - `gina.ns.cloudflare.com`
  - `tom.ns.cloudflare.com`
- Public authoritative nameservers still resolve as:
  - `ns1.arvixeshared.com`
  - `ns2.arvixeshared.com`
- RDAP reports registrar `Tucows Domains Inc.` and status includes `client update prohibited`.

## Tunnel And DNS

- Named tunnel `bnpi-pats` exists:
  - Tunnel ID: `1c8ee2c4-c9c5-4840-be39-639e4b5f605b`
  - Active connector observed from Windows host.
- Cloudflare DNS contains proxied record:
  - `bnpi-pats.uzaro.net CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com`
- Local `cloudflared-bnpi-pats.yml` routes:
  - `app.bnpi-pats.dedyn.io -> http://192.168.254.148:3000`
  - `bnpi-pats.uzaro.net -> http://192.168.254.148:3000`
- Stray record `bnpi-pats-bandai.dpdns.org.uzaro.net` was removed from Cloudflare.

## Verification

- LAN target responds:
  - `http://192.168.254.148:3000/auth/login`
  - Returned BNPI PATS app HTML with title `HR Management System`.
- Public DNS currently resolves `bnpi-pats.uzaro.net` through Arvixe DNS to the tunnel CNAME, but it is not Cloudflare-proxied from the authoritative DNS path.
- Public HTTPS currently times out:
  - `https://bnpi-pats.uzaro.net/auth/login`

## Remaining Cutover Step

At the registrar/hosting account for `uzaro.net`, unlock DNS updates if needed and replace:

```text
ns1.arvixeshared.com
ns2.arvixeshared.com
```

with:

```text
gina.ns.cloudflare.com
tom.ns.cloudflare.com
```

After propagation, verify:

```powershell
Resolve-DnsName uzaro.net -Type NS
Resolve-DnsName bnpi-pats.uzaro.net -Type A
curl.exe -I https://bnpi-pats.uzaro.net/auth/login
```
