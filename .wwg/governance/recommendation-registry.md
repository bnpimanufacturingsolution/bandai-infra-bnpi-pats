# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth,
active Workspace tasks, or commitments until reviewed and promoted.

| ID | Status | Recommendation | Evidence | Date |
|---|---|---|---|---|
| REC-20260702-001 | Proposed | Add or repair DEV seed coverage for a valid own-department manager plus a matching workforce recruitment policy so the hiring requisition modal is testable without manual database repair. | DEV had `Administration.managerId = Arvin`, but Arvin's own `departmentId` was `Production`, so auth/request-context returned `isDepartmentManager=false`; no workforce recruitment policies existed before this verification pass. | 2026-07-02 |
| REC-20260702-002 | Proposed | Investigate why the persistent secondary LAN IP `10.184.37.19` intermittently stops serving DEV app/API hostPorts while DHCP fallback `10.184.38.144` remains reachable. | During this run, `10.184.37.19:3101` timed out from Windows after initially passing, while `10.184.38.144:3100` and `10.184.38.144:3101` passed and served DEV. | 2026-07-02 |
