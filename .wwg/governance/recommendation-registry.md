# Recommendation Registry

Recommendations are proposed follow-up work only. They are not accepted project truth or active scope until reviewed and promoted.

## Proposed

| ID | Recommendation | Evidence | Status |
| --- | --- | --- | --- |
| REC-20260630-HIKVISION-EMPLOYEE-MAP | Map DEV Hikvision employee no. `1` to a real HRIS employee or create an explicit test employee policy for physical device probes. | Fresh physical and callback-shaped Hikvision events saved successfully but remained `UNMATCHED` with `employee_not_found`. | Proposed |
| REC-20260630-K3S-DISK-PRESSURE | Add routine K3s/containerd image cleanup or increase VM disk headroom before full runtime image rebuilds. | Rebuilding DEV runtime images triggered `node.kubernetes.io/disk-pressure:NoSchedule`; cleanup and K3s restart were required before DEV API/app/watcher returned to `Running`. | Proposed |
| REC-20260630-DEV-LOCAL-CORS-SMOKE | Add a supported local browser smoke path for public DEV API testing, either by allowing selected localhost origins in DEV CORS or by documenting the same-origin proxy harness. | Local browser QA against `https://dev-api.bnpi-hris.tech/api` was blocked by CORS from `http://localhost:*`; API auth worked from host probes and public app origins, so the limitation is local QA ergonomics. | Proposed |
