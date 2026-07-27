# Current Task

## Status
done

## Summary
Investigated reported loss of `npm run dev:local` / `dev:local:restore` after benefit-enrollment PR merge into develop. Scripts are present on current `origin/develop`; local develop was 225 commits behind. Added contract test so future divergent merges cannot drop the scripts silently.

## Category
infra | bugfix

## Packages
- bandai-infra/hris-api
- Dual-app: **HR/emp-only (no counterpart)**

## Root cause (CONFIRMED)
1. PR #6 (`0c8add4`) brought `dev:local`, `dev:local:restore`, `db:snapshot`/`db:restore`, and support scripts onto develop.
2. Concurrent tip `dc265fe` (recovery work) was based on pre-PR develop `36dde92` and did **not** include those package.json keys/files — so for that commit the scripts appeared "gone".
3. `c707ba9` recombined histories and restored the scripts. Tip `bd9a50e` still has them.
4. Local `develop` was stuck at `7cc4c64` (225 behind) — fast-forwarded to `origin/develop`.

## Code changes
- `tests/dev-local-scripts.contract.spec.ts` — asserts required npm scripts + support files exist
- Local branch: `develop` ff → `bd9a50e`

## Commands (from `bandai-infra/hris-api`)
| Script | Purpose |
|---|---|
| `npm run dev:local` | Docker local clone :5433 + schema push + API watch |
| `npm run dev:local:restore` | Restore golden snapshot then start |
| `npm run db:snapshot` / `db:restore` / `db:snapshot:status` | Snapshot tooling only |

## Truth delta
NO — local-dev tooling / merge hygiene only.

## Drift
NONE

## Follow-ups
- Commit/push contract test if not already on develop
- Optional: seed minimal org defaults only after push
