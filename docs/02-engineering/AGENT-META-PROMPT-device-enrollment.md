# Ordered Agent Meta-Prompt — Device Enrollment Journey

Copy this prompt into the next implementation task. It is intentionally ordered so discovery and proof happen before mutation.

```text
You are the owner-operator agent for Project Truth. Implement the Admin Device Enrollment and Reconciliation journey in the existing hris-app/hris-api surfaces.

1. Read AGENTS.md, the required WWG summaries/project truth/terminology/principles/current-task/drift guard, README.md, and these planning docs:
   - docs/00-product/BRD-device-enrollment.md
   - docs/00-product/PRD-device-enrollment.md
   - docs/01-architecture/FE-ARCHITECTURE-device-enrollment.md
   - docs/01-architecture/DEVICE-ENROLLMENT-USER-JOURNEY.md
2. Classify the work as mixed: meaningful feature + UX/architecture + persistence-adjacent admin workflow. Start the WWG task gate where required.
3. Inspect the existing route, manage screen, hooks, devices.service.ts, device controller, merge helper, auth/role guard, and tests. Preserve established patterns.
4. Identify the exact endpoints and actor before UI work. Use admin@bandai.local/password123 with appCode=hris unless local docs specify otherwise. Run read-only health, auth, and preview probes first. Capture URL, payload, status, full JSON, and elapsed time under .runtime/endpoint-proof-<stamp>/.
5. Do not invent merge logic in the browser. The backend remains authoritative for identity grouping, conflicts, persistence, and audit data.
6. Implement the flow as Scope → Preflight → Discover → Preview → Resolve → Confirm → Apply → Verify. Persist only transient selections and explicit choices in client state; keep job/preview IDs recoverable from URL or server state.
7. Make Apply impossible when required conflicts, ambiguous matches, stale previews, or unreachable required targets remain. Use exact confirmation copy that names source, targets, planned writes, and warnings.
8. Use accessible semantic components: short progress labels, keyboard navigation, status chips with text, error summary plus inline error, aria-live job progress, visible focus, responsive table/detail layout, and no raw biometric templates.
9. Add meaningful unit/component/service tests for stage transitions, conflict resolution completeness, stale preview protection, partial job status, and response normalization. Add a Playwright regression for the read-only critical journey.
10. Validate with direct API/network probes before browser proof. Start the local target only through the repo-documented command if needed; do not move Project Truth runtime to Windows Docker/WSL.
11. Use headed Chrome for the requested browser proof. Capture navigation URL, visible text, console errors, request/response evidence, and screenshots. If Chrome authentication blocks access, stop and report the exact sign-in requirement; do not bypass it with another browser.
12. Verify the correct deployment boundary: local app/API, LAN VM, GitHub/GitOps/K3s, and public tunnel where in scope. Never disable the VM-managed Cloudflare tunnel.
13. Review for terminology drift and update canonical WWG/requirements surfaces only when the behavior is accepted truth. Label inferred, stale, conflicting, or needs-confirmation findings.
14. Run tests/build/lint and the WWG close gate. Fix recoverable failures with at least three plausible recovery attempts before declaring a blocker.
15. Final handoff must list changed files, API proof, browser proof attachments, runtime boundary proven, remaining drift, risks, and recommendations. If no future work was revealed, state exactly: No new recommendations were identified.
```

