# Standalone HRIS snapshot + bandai-infra develop recombine

Branch: `import/hris-standalone-develop-snapshot`  
Snapshot date: 2026-07-20  
Recombine date: 2026-07-20

## Phase 1 — Snapshot base

Method: `git archive` of standalone `develop` (no history; tracked files only)

| Folder | Standalone repo | Branch | Commit |
|--------|-----------------|--------|--------|
| `hris-app/` | `hrisworkforcesystem-coder/hris-app` | `develop` | `93d6504ea84f78969420760fc707b63fa88da383` |
| `hris-api/` | `hrisworkforcesystem-coder/hris-api` | `develop` | `7535c691eee477435bd548c0a1b449918d73594e` |

Tip commits:

- hris-app: `93d6504e` role-aware sidebar scrollbar is hidden by default and only appears while the cursor is over the sidebar
- hris-api: `7535c691` feat(benefits): add recurring benefit frequency cadence

## Phase 2 — Union recombine with `bandai-infra` `develop`

Source monorepo commit: `7cc4c64` (`develop` at recombine time).

Because `develop` is the parent of the snapshot commit, a normal `git merge develop` is a no-op. Recombine was done as a **folder-level union**:

| Bucket | Policy |
|--------|--------|
| Develop-only paths under `hris-app/` / `hris-api/` | Restored from `develop` (except junk/tmp/backup copies) |
| Standalone-only paths | Kept |
| Env files (`.env*`) | Prefer `develop` |
| Diverged **device / hikvision / zkteco / biometric / infrastructure / docker / package(lock)** | Prefer `develop` |
| Diverged **product core / UI** | Prefer standalone snapshot |
| Diverged **docs / AGENTS / CHANGELOG / WWG wiki / governance / current-task / observability README** | Careful section-aware merge (standalone spine; unique develop substance retained; near-duplicates dropped; stale PRD-only pointers discarded) |

Junk skipped on restore:

- `hris-api/.cloudinary-*.tmp`
- `hris-api/.env copy`
- `hris-api/.env.backup-*`
- `hris-api/.fix-temp.txt`
- `hris-api/.gitignore copy`

Conflict inventory (pre-resolution): `docs/HRIS_UNION_MERGE_CONFLICTS.md`

## Not included

- Git history from the standalone repos
- Untracked files (`node_modules`, local builds, dumps, etc.)
- `hris-emp-app` (unchanged; remains submodule)

## Intent

Standalone product `develop` is the product base; bandai-infra monorepo device/ops deltas and unique files are layered on top so both lineages are available on one branch for further cleanup.
