# Standalone BNPI PATS snapshot + bandai-infra develop recombine

Branch: `import/bnpi-pats-standalone-develop-snapshot`  
Snapshot date: 2026-07-20  
Recombine date: 2026-07-20

## Phase 1 — Snapshot base

Method: `git archive` of standalone `develop` (no history; tracked files only)

| Folder | Standalone repo | Branch | Commit |
|--------|-----------------|--------|--------|
| `bnpi-pats-app/` | `bnpimanufacturingsolution/bnpi-pats-app` | `develop` | `93d6504ea84f78969420760fc707b63fa88da383` |
| `bnpi-pats-api/` | `bnpimanufacturingsolution/bnpi-pats-api` | `develop` | `7535c691eee477435bd548c0a1b449918d73594e` |

Tip commits:

- bnpi-pats-app: `93d6504e` role-aware sidebar scrollbar is hidden by default and only appears while the cursor is over the sidebar
- bnpi-pats-api: `7535c691` feat(benefits): add recurring benefit frequency cadence

## Phase 2 — Union recombine with `bandai-infra` `develop`

Source monorepo commit: `7cc4c64` (`develop` at recombine time).

Because `develop` is the parent of the snapshot commit, a normal `git merge develop` is a no-op. Recombine was done as a **folder-level union**:

| Bucket | Policy |
|--------|--------|
| Develop-only paths under `bnpi-pats-app/` / `bnpi-pats-api/` | Restored from `develop` (except junk/tmp/backup copies) |
| Standalone-only paths | Kept |
| Env files (`.env*`) | Prefer `develop` |
| Diverged **device / hikvision / zkteco / biometric / infrastructure / docker / package(lock)** | Prefer `develop` |
| Diverged **product core / UI** | Prefer standalone snapshot |
| Diverged **docs / AGENTS / CHANGELOG / WWG wiki / governance / current-task / observability README** | Careful section-aware merge (standalone spine; unique develop substance retained; near-duplicates dropped; stale PRD-only pointers discarded) |

Junk skipped on restore:

- `bnpi-pats-api/.cloudinary-*.tmp`
- `bnpi-pats-api/.env copy`
- `bnpi-pats-api/.env.backup-*`
- `bnpi-pats-api/.fix-temp.txt`
- `bnpi-pats-api/.gitignore copy`

Conflict inventory (pre-resolution): `docs/BNPI_PATS_UNION_MERGE_CONFLICTS.md`

## Not included

- Git history from the standalone repos
- Untracked files (`node_modules`, local builds, dumps, etc.)
- `bnpi-pats-emp-app` (unchanged; remains submodule)

## Intent

Standalone product `develop` is the product base; bandai-infra monorepo device/ops deltas and unique files are layered on top so both lineages are available on one branch for further cleanup.
