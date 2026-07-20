# Standalone HRIS snapshot provenance

Branch: `import/hris-standalone-develop-snapshot`
Snapshot date: 2026-07-20
Method: `git archive` of standalone `develop` (no history; tracked files only)

## Sources

| Folder | Standalone repo | Branch | Commit |
|--------|-----------------|--------|--------|
| `hris-app/` | `hrisworkforcesystem-coder/hris-app` | `develop` | `93d6504ea84f78969420760fc707b63fa88da383` |
| `hris-api/` | `hrisworkforcesystem-coder/hris-api` | `develop` | `7535c691eee477435bd548c0a1b449918d73594e` |

### Tip commits

- hris-app: 93d6504e role-aware sidebar scrollbar is hidden by default and only appears while the cursor is over the sidebar
- hris-api: 7535c691 feat(benefits): add recurring benefit frequency cadence

## Intent

Standalone `develop` is the base for these folders. Bandai-infra's prior `hris-app` / `hris-api` tree content is intentionally replaced here so it can be merged back later from `bandai-infra` `develop` (or other infra work).

## Not included

- Git history from the standalone repos
- Untracked files (`node_modules`, local builds, dumps, etc.)
- `hris-emp-app` (unchanged; remains submodule)
