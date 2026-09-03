# Hikvision Device Events and Sync Center - WWG Truth Synchronization

## Classification

Mixed regression repair, meaningful feature, runtime repair, high-risk cleanup,
and local operational verification.

## Synchronized truth

- Project Truth now states that `DeviceEvent` is the single saved device-event
  ledger and that current inventory cannot create lifecycle history.
- The summary records direct Device A inventory, selected-window ACS parity,
  logSearch persistence/deduplication, and backup-first cleanup.
- Terminology defines `Evidence source` and `Direct device evidence` separately
  from runtime path and event history.
- Workspace records the completed local implementation and its promotion
  boundary.
- Governance records one proposed follow-up for bounded historical ACS serial
  reconciliation and unknown-code review.

## Evidence promoted

- Direct inventory: 167 users, 162 with fingerprints, 161 with faces, 109 with
  cards, and 2,107 device logs.
- Frozen window: 70/70 ACS serials saved, 23/23 logSearch rows saved, repeat
  execute 23/23 duplicates, combined API total 93.
- Cleanup: 219 exported/deleted fake lifecycle rows, zero linked attendance,
  zero remaining under the same predicate.
- Local browser: Playwright saved-ledger and raw-payload drawer proof passed.

## Boundaries retained

- Local/shared-DEV proof is not GitOps/public promotion proof.
- The 1,236 difference between current device log total and all-time SDK rows is
  a calculated historical gap, not a row-by-row missing proof.
- Unknown evidence remains unknown until explicit vendor evidence supports a
  mapping.

No other new recommendations were identified.

## WWG Truth Synchronization

- Task mode: mixed regression repair, meaningful feature, runtime repair, high-risk cleanup, and local operational verification
- New truth detected: YES — DeviceEvent single ledger; inventory never creates lifecycle history; evidence-source terminology split
- Wiki updated: YES — Project Truth / summary / terminology for DeviceEvent, evidence source, direct device evidence
- Workspace updated: YES — completed local implementation and promotion boundary recorded
- Governance review completed: YES — one proposed follow-up for bounded historical ACS serial reconciliation
- Drift status: MEDIUM — local/shared-DEV proof is not GitOps/public promotion; 1,236 historical gap remains calculated, not serial-proven
- Canonical files changed:
  - `.wwg/wiki/project-truth.md` / summary / terminology (DeviceEvent contract)
  - `.wwg/workspace/current-task.md`
  - `.wwg/governance/recommendation-registry.md` (historical reconciliation proposal)
- Implementation discoveries synced:
  - Direct inventory and frozen-window ACS/logSearch parity
  - Backup-first cleanup of 219 fake lifecycle rows, zero linked attendance
  - Local Playwright saved-ledger proof
- Remaining stale context:
  - Unknown evidence remains unknown until explicit vendor mapping
  - GitOps/public promotion and full historical serial reconciliation still open
