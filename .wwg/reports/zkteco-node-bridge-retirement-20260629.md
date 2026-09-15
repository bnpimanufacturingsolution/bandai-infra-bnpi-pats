# ZKTeco Node Bridge Retirement - 2026-06-29

## Summary

The Node.js ZKTeco bridge under `appliance/zkteco-bridge` is retired from the active Project Truth runtime. The active ZKTeco runtime path is the Windows Standalone SDK sidecar under `appliance/zkteco-standalone-sdk`, with BNPI PATS API reading its status through an explicitly configured `ZKTECO_BRIDGE_STATUS_URL`.

## Task Mode

Mixed drift repair and runtime truth synchronization.

## Truth Synchronization

- New truth detected: yes.
- Canonical docs updated: `docs/ZKTECO_RUNTIME_TRUTH.md`.
- Active runtime drift removed: Docker Compose, environment Compose, K3s GitOps overlays, K3s image import scripts, VM start/status scripts, and self-heal contract checks no longer recreate the Node bridge.
- Retired source removed: `appliance/zkteco-bridge`.
- Tests updated: ZKTeco device-health tests use an explicit SDK sidecar status URL instead of the stale `zkteco-bridge` service DNS.

## Evidence

- Host Docker scan found no `project-truth-zkteco-bridge` containers running or stopped.
- Current live device probe truth for `10.184.38.234:4370` and `10.184.38.235:4370`: TCP reachable, Windows SDK connect failed after three attempts with SDK error `-2`.
- This is not an event-count result and must not be represented as a successful SDK connection.

## Remaining Drift Guard

References to `project-truth-zkteco-bridge` are allowed only when they explicitly assert absence/retirement, such as self-heal contract guards.

## Recommendation Capture

No new recommendations were identified.
