# Hikvision SADP Device Screenshot - 2026-06-30

## Source Type

- Chat-provided screenshot evidence.
- The prior conversation referenced by the user is not available in this agent
  context, so this note records only the visible screenshot facts and the
  user's instruction to keep following the Project Truth meta-prompt.

## Observed Facts

- Tool/UI: Hikvision SADP.
- Total online devices: 1.
- Device ID: `001`.
- Device type/model: `DS-K1T201AEF`.
- Status: `Active`.
- IPv4 address: `192.168.254.181`.
- Port: `8000`.
- Enhanced SDK service: `N/A`.
- Software version: visible prefix `V1.3.45 build 2...`; full build text is
  truncated in the screenshot.

## Interpretation Boundaries

- This proves SADP discovery of one active Hikvision device on the LAN at the
  time of the screenshot.
- This does not prove HRIS callback ingestion, AlarmDemo runtime delivery,
  admin browser/socket receipt, attendance write behavior, or public/VM path
  evidence.
- Treat device credentials, activation/security state, and full firmware build
  as `NEEDS_CONFIRMATION` until captured from a trusted device or operator
  source.

## Follow-Up Runtime Evidence Captured

On 2026-06-30, the DEV HRIS device row `cmqquro2g002em73cdp74rx0q`
(`Main Entrance Device`) was updated from stale `192.168.110.24` / `https` to
the SADP-observed physical device address `192.168.254.181:80` / `http`.

Evidence captured by Codex:

- Host TCP probes passed for `192.168.254.181:8000` and `192.168.254.181:80`.
- Direct ISAPI digest-auth probe to
  `http://192.168.254.181/ISAPI/System/time?format=json` returned HTTP 200 and
  device local time `2026-06-30T16:30:08+08:00`.
- DEV HRIS device health for `cmqquro2g002em73cdp74rx0q` reported network
  reachable and `deviceApi.ok=true` against
  `http://192.168.254.181:80`; the only degraded check was the expected
  Windows-only AlarmDemo process check from the Linux/VM API context.
- DEV HRIS ACS event pull through
  `POST https://dev-api.bnpi-hris.tech/api/hikvision/access-control/acs-events`
  returned HTTP 200 for a dated query and included a physical-device attendance
  event: `major=5`, `minor=38`, `employeeNoString=1`, `serialNo=997`, time
  `2026-06-30T16:17:07+08:00`.
- The ACS pull saved a DEV `device_events` row:
  `cmr0e1jk2002lm601rul855z2`, source `HIKVISION_CALLBACK`, status
  `UNMATCHED`, employee no. `1`, event time `2026-06-30T08:17:07.000Z`,
  received at `2026-06-30T08:31:59.811Z`, device address
  `192.168.254.181`.
- Browser verification with Playwright on
  `https://dev.bnpi-hris.tech/admin/configuration/devices/events?view=saved`
  showed the saved event row with employee no. `1`, terminal
  `Main Entrance Device`, address `192.168.254.181`, and save path
  `Device callback`.
- Screenshot evidence:
  `.runtime/browser-evidence/screenshots/hikvision-device-events-live-physical-after.png`.

Remaining boundaries:

- This proves DEV physical-device ISAPI pull -> HRIS callback persistence ->
  admin saved-events UI display.
- It does not prove a spontaneous device HTTP-host push callback, Windows
  AlarmDemo service runtime, employee matching, attendance creation, or
  PROD/UAT/public cross-environment parity.
