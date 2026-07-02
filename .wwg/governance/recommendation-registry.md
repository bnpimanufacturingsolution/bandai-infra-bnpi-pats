# Recommendation Registry

Recommendations are candidate work only. They are not accepted project truth,
active Workspace tasks, or commitments until reviewed and promoted.

| ID | Status | Recommendation | Evidence | Date |
|---|---|---|---|---|
| REC-20260702-001 | Proposed | Add or repair DEV seed coverage for a valid own-department manager plus a matching workforce recruitment policy so the hiring requisition modal is testable without manual database repair. | DEV had `Administration.managerId = Arvin`, but Arvin's own `departmentId` was `Production`, so auth/request-context returned `isDepartmentManager=false`; no workforce recruitment policies existed before this verification pass. | 2026-07-02 |
| REC-20260702-002 | Superseded | Investigate why `10.184.37.19` intermittently stopped serving DEV app/API hostPorts while transient fallback address `10.184.38.144` remained reachable. | Superseded on 2026-07-03 by pure static LAN hard cutover: `eth0` now has `10.184.37.78/24` and `10.184.37.19/24`; API health passed on both static addresses. | 2026-07-02 |
