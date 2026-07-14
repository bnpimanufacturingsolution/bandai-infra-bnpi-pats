# PRD — Hikvision Copy to All Peer Devices Performance

## Product Outcome

When an administrator selects **Copy to all peer devices**, the modal should behave like one bounded operation, not five hidden single-device operations. It must quickly show which peers accepted and verified the user and which peers need retry.

## User Stories

- As an admin, I can copy one selected Hikvision user to every configured peer with one click and one request.
- As an admin, I can see progress and a final result for each peer.
- As an admin, I keep completed copies when one peer is offline.
- As an admin, I can retry only failed peers.
- As an operator, I can see timing phases that explain any run exceeding the target.

## Functional Requirements

### FR-01 Batch request

`POST /api/device/hikvision/copy-user` accepts either legacy `targetDeviceId` or a deduplicated `targetDeviceIds` array. The source device cannot appear in the target list. Every device must belong to the authenticated organization and be Hikvision.

### FR-02 Safe dry-run

`execute=false` or `dryRun=true` returns a per-target plan without SSH, SDK, device, or HRIS mutation. The response identifies already-converged targets and targets requiring a physical peer copy.

### FR-03 One VM SDK session

For targets requiring physical writes, the API builds one protected device spec containing the source and requested targets, runs one scoped VM wrapper, and parses SDK evidence by `targetDeviceId`.

### FR-04 Bounded preflight

Source and target SDK endpoints are checked concurrently with bounded timeouts. A failed target is reported independently. A failed source stops the physical batch because no target can be copied truthfully from it.

### FR-05 Concurrent verification

After the SDK run, target single-user refresh, HRIS link mirroring, and credential verification run concurrently per target. Verification retains existing fingerprint/card truth rules.

### FR-06 Per-target result

The response includes `results[]` with target identity, status, error, SDK evidence summary, refreshed `DeviceUser`, and timings. It also includes total, successful, failed, already-synchronized, and request timing counts.

### FR-07 Backward compatibility

A legacy single `targetDeviceId` request still returns the existing single-target response fields. Batch clients use `targetDeviceIds` and the per-target summary.

### FR-08 UI behavior

The modal sends one batch request for all selected/retry targets. While running, it shows one coordinated progress message. On completion, it preserves successful targets and lists failed targets for retry.

## Non-Functional Requirements

- Performance: reachable five-peer copy p95 ≤ 5,000 ms in the proven local/VM topology.
- Network: one browser `copy-user` request for copy-to-all.
- Reliability: bounded failure; no indefinitely pending browser request.
- Security: admin-only authorization, organization scoping, no secrets in response/evidence.
- Accessibility: loading and outcome text remain visible in the modal; controls remain disabled only while the active request is running.

## Acceptance Criteria

1. A five-peer UI submit produces exactly one `copy-user` network request.
2. The backend starts one VM wrapper/SDK session for the batch.
3. A dry-run returns five per-target plans without mutation.
4. Reachable peers are verified and reported independently.
5. One unreachable peer does not erase successful results for other peers.
6. Retry submits only prior failed target IDs.
7. Single-peer copy continues to work through the same endpoint.
8. Focused backend and frontend contract tests pass.
9. Direct endpoint and headless Playwright evidence record elapsed time, request count, response status, and per-target results.

## Current-State Evidence

- Screenshot/network observation: copy-to-all issued repeated `copy-user` requests and left the final request pending.
- Direct admin dry-run on 2026-07-14: five targets each returned a valid physical-copy plan in 210–346 ms.
- Evidence directory: `.runtime/hikvision-copy-all-perf-20260714-191924/`.

## Deployment Boundary

Local API and browser proof demonstrate the implementation path only. VM/GitOps/K3s/LAN/public promotion must be recorded separately before this is treated as production runtime truth.

