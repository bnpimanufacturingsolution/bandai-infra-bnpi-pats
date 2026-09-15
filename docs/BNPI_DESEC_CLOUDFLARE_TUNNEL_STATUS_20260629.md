# BNPI deSEC / Cloudflare Tunnel Status - 2026-06-29

## Goal

Provide a permanent production hostname for the verified BNPI BNPI PATS app through a Cloudflare named tunnel.

Target app:

```text
http://192.168.254.148:3000/auth/login
```

Target public hostname attempted:

```text
https://app.bnpi-pats.dedyn.io/auth/login
```

## Current Evidence

- deSEC domain exists:
  - `bnpi-pats.dedyn.io`
- deSEC authoritative nameservers:
  - `ns1.desec.io`
  - `ns2.desec.org`
- deSEC currently has:
  - `app CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com.`
- Cloudflare zone exists after dashboard import:
  - Zone: `bnpi-pats.dedyn.io`
  - Status: `pending`
  - Cloudflare nameservers: `elmo.ns.cloudflare.com`, `ullis.ns.cloudflare.com`
- Cloudflare DNS import contains:
  - `app CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com`
  - Proxy: enabled
- Named tunnel is healthy:
  - Tunnel: `bnpi-pats`
  - Tunnel ID: `1c8ee2c4-c9c5-4840-be39-639e4b5f605b`
  - Connector observed connected to Cloudflare edges.
- LAN BNPI PATS app is healthy:
  - `http://192.168.254.148:3000/auth/login`
  - Returned title: `HR Management System`

## Blocker

Cloudflare zone `bnpi-pats.dedyn.io` cannot become active unless `bnpi-pats.dedyn.io` is delegated to Cloudflare nameservers. deSEC `dedyn.io` domains do not support external nameserver delegation.

This is not a repo, tunnel, or token failure. It is a provider policy limitation for free `*.dedyn.io` domains.

Evidence from deSEC public material:

- deSEC signup limitation page states that `dedyn.io` domains cannot change NS records and external delegation is not supported: https://desec.io/signup?domainType=dynDNS
- deSEC community confirms that domains under `dedyn.io` cannot be delegated to other nameservers as policy: https://talk.desec.io/t/cannot-modify-ns-records-for-this-domain/1309
- deSEC API docs confirm apex RRsets use `/rrsets/@/{type}/`, which was tested for `NS` and returned `400`: https://desec.readthedocs.io/en/latest/dns/rrsets.html#accessing-the-zone-apex

## Why The Current CNAME Is Not Enough

Public DNS currently resolves:

```text
app.bnpi-pats.dedyn.io CNAME 1c8ee2c4-c9c5-4840-be39-639e4b5f605b.cfargotunnel.com
```

But that path is DNS-only at deSEC, not a Cloudflare-proxied hostname. The target currently resolves only to Cloudflare's internal tunnel AAAA value:

```text
fd10:aec2:5dae::
```

That is why public HTTPS to `app.bnpi-pats.dedyn.io` times out even though the tunnel connector itself is connected.

## Viable Permanent Options

1. Use a real domain delegated to Cloudflare.
   - Example: finish `uzaro.net` nameserver cutover to Cloudflare.
   - Cloudflare already has `bnpi-pats.uzaro.net` configured as a proxied tunnel record.
   - Required registrar nameservers:
     - `gina.ns.cloudflare.com`
     - `tom.ns.cloudflare.com`

2. Register/transfer another domain that allows changing nameservers, then add it to Cloudflare.
   - Add a proxied tunnel DNS record in that active Cloudflare zone.

3. Use `bnpi-pats.dedyn.io` as direct dynamic DNS only.
   - This would require exposing the origin directly by A/AAAA and router/firewall configuration.
   - This does not satisfy the Cloudflare Tunnel production goal and is not recommended for this architecture.

4. Use TryCloudflare only as a temporary demo fallback.
   - Not permanent and URLs rotate.

## Current Next Best Step

Use the already prepared Cloudflare zone for `uzaro.net` and finish nameserver cutover at the registrar/hosting account:

```text
Replace:
ns1.arvixeshared.com
ns2.arvixeshared.com

With:
gina.ns.cloudflare.com
tom.ns.cloudflare.com
```

After propagation:

```powershell
Resolve-DnsName uzaro.net -Type NS
Resolve-DnsName bnpi-pats.uzaro.net -Type A
curl.exe -I https://bnpi-pats.uzaro.net/auth/login
```

## Safety Notes

- Rotate any Cloudflare/deSEC tokens pasted into chat/browser after setup is complete.
- Do not delete the Cloudflare pending `bnpi-pats.dedyn.io` zone until choosing final DNS direction; it is harmless but cannot activate under `dedyn.io` policy.
