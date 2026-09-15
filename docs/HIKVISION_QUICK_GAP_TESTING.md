# Hikvision Quick Gap Testing

This repo now has a real quick-test path for the exact admin Sync Center journey at:

```text
http://localhost:5175/admin/configuration/devices?action=device-users&syncPanel=users
```

Before this change, the only concrete create/delete examples lived in ad hoc proof files under `.runtime/`, such as:

```text
.runtime/hikvision-under5-proof-20260710-161015/create-9013.sh
```

Those proof files were useful evidence, but they were not a reusable operator script.

## What exists now

- `scripts/hikvision-quick-gap.ps1`
  - Fast local helper for:
    - previewing current Sync Center counts
    - creating a real one-device-only Hikvision user gap
    - applying a dev-only synthetic face tally to a saved `DeviceUser`
    - clearing the synthetic face tally
    - deleting the quick-test user from one or all Hikvision devices
- `scripts/ensure-local-bnpi-pats-api-hotreload.ps1`
  - Checks whether local `sync-preview` is fresh enough to expose `peerDriftTotalCount`
  - Can restart the local API watcher if the response is stale
- `scripts/restart-local-bnpi-pats-api-dev.ps1`
  - Cleanly stops the local repo-owned `bnpi-pats-api` watcher and starts it again

## Why the API looked stale

The page can look wrong even when Chrome is fine if `localhost:3001` is still serving an older `sync-preview` shape.

The hot-reload path now runs through:

```text
bnpi-pats-api/scripts/run-dev-api-watch.cjs
```

That watcher forces polling-friendly file watch env for Windows/OneDrive:

- `CHOKIDAR_USEPOLLING=true`
- `CHOKIDAR_INTERVAL=150`
- `WATCHPACK_POLLING=true`

## Quick commands

Check whether the local API is fresh enough for the new Sync Center preview fields:

```powershell
.\scripts\ensure-local-bnpi-pats-api-hotreload.ps1 -RestartIfStale
```

Create a real `8 vs 7` gap on one physical Hikvision device:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode real-user-gap -SourceDevice "Main Entrance Device A" -RestartApiIfStale
```

That creates a real user only on the selected device, then prints the latest local `sync-preview` table.

Apply a dev-only synthetic face tally to an already-saved `DeviceUser`:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode mock-face -SourceDevice "Main Entrance Device A" -VendorUserId 6 -FaceCount 2 -RestartApiIfStale
```

If the saved `DeviceUser` row is stale, add `-SyncSourceToBnpiPats`:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode mock-face -SourceDevice "Main Entrance Device A" -VendorUserId 6 -FaceCount 2 -SyncSourceToBnpiPats -RestartApiIfStale
```

Clear the synthetic face tally:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode clear-mock-face -SourceDevice "Main Entrance Device A" -VendorUserId 6 -RestartApiIfStale
```

Delete a quick-test user from every configured Hikvision device:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode delete-user -VendorUserId 9013 -DeleteFromAllDevices -RestartApiIfStale
```

Preview current counts only:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode preview -RestartApiIfStale
```

## Recommended fast test loop

1. Run:

```powershell
.\scripts\ensure-local-bnpi-pats-api-hotreload.ps1 -RestartIfStale
```

2. Create one real-device-only gap:

```powershell
.\scripts\hikvision-quick-gap.ps1 -Mode real-user-gap -SourceDevice "Main Entrance Device A" -RestartApiIfStale
```

3. In Chrome, press `Refresh summary`.

Expected result:

- the source device should move from `7` to `8` under `From device`
- `Saved in BNPI PATS` should still be the old count until the sync path catches up
- the row should clearly show a mismatch

4. Run `Make peers match` in Sync Center.

Expected result:

- the other device should converge to the richer truth
- after refresh, counts should tally again

## Boundary

- `real-user-gap` creates a real user on the physical terminal.
- `mock-face` only changes saved BNPI PATS `DeviceUser` metadata for verification; it does not claim that a real face template was written to the physical device.
