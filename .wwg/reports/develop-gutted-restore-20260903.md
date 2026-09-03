# Incident Report: develop Mass-Deletion + Restore (2026-09-03)

**Status:** RESOLVED — develop restored on remote; PR #9 unblocked via merge commit `1d04dd40`.

## Timeline

| When (approx) | Event |
|---|---|
| Sep 2, ~19:37 +07 | `fb326549` "save" by `malasaernestdodz` pushed to `origin/develop` — mass deletion begins |
| Sep 2, ~19:37 +07 | `653d3c32` "save" (7 seconds later) — final gutted tip |
| Sep 3 | PR #9 (`feature/attendance-per-section` → `develop`) reports CONFLICTING on 3 files |
| Sep 3 | Backup branch `backup/develop-gutted-20260903` pushed (preserves gutted tip `653d3c32`) |
| Sep 3 | Restore commit `5e4c3046` created (`git commit-tree`: tree of `85327bd2`, parent `653d3c32`) and fast-forward pushed to `origin/develop` |
| Sep 3 | Restored develop merged into feature branch (`1d04dd40`), zero conflicts; tests green |

## Damage Assessment

- **3,793 tracked files deleted** from `develop` across the two "save" commits, **zero content added**.
- Deleted scope: all of `hris-app/`, most of `hris-api/`, `scripts/`, `gitops/`, `appliance/`, `installer/`, `README.md`, `.github/` workflows.
- **Strict-subset proof:** `653d3c32` tree ⊂ `85327bd2` tree; only differing file (`.gitignore`) was an EOL-only change. The restore therefore loses nothing.
- PR #9's conflicts (`docs/OVERTIME_SOURCE_OF_TRUTH.md`, `hris-api/app/timesheet/timesheet.controller.ts`, `hris-app/app/routes/admin/rules-policies/timesheet.tsx`) were **modify/delete artifacts** of the gutting, not content disputes.

## Restore Method

```
backup:  backup/develop-gutted-20260903  = 653d3c32 (gutted tip, preserved)
restore: git commit-tree '85327bd2^{tree}' -p 653d3c32   →  5e4c3046
push:    git push origin 5e4c3046:refs/heads/develop      (normal fast-forward, NO force push)
```

Both "save" commits remain reachable in history with author attribution intact. Remote verified at `5e4c3046` via `git ls-remote origin refs/heads/develop`.

## Local Branch Complication (handled)

A concurrent/background `git pull` merged the gutted develop (`653d3c32`) into `feature/attendance-per-section` mid-operation, staging ~3,793 deletions. It was **aborted cleanly** (`git merge --abort`; working tree restored, all 3,794 files verified). The restored develop was then merged (`1d04dd40`, zero conflicts — develop side equals the merge-base tree). The same background sync also delivered the merge commit to origin (push reported "Everything up-to-date"; PR `headRefOid` = `1d04dd40`).

**Operational lesson:** avoid parallel git operations (IDE auto-sync, second terminals) in this worktree while agent tasks run.

## Post-Restore Verification

- `git diff --stat 8c4d2d29 HEAD` → empty (merge added zero content changes).
- `git diff --name-only --diff-filter=D 85327bd2 HEAD` → 0 lines (no deletions vs last-good).
- All PR #9 files present post-merge; `resolveTimesheetSubmissionOutcome` present (`timesheet.controller.ts` :170, :3410).
- `tests/timesheet-auto-approve.spec.ts` → **15 passing, TESTEXIT=0** (DB logger noise from offline `10.184.37.19:15433` is known non-fatal).

## Rollback Path (if ever needed)

`git push origin backup/develop-gutted-20260903:refs/heads/develop` is NOT desired; but the gutted tip is recoverable from the backup branch. No further action required.

## Open Items

1. Confirm with `malasaernestdodz` the source of the partial-working-tree commits (likely VS Code stage-all on a broken checkout) before next `develop` push.
2. CI on `develop` was failing 5s-fast BEFORE the gutting (runner-level, unrelated) — needs separate investigation.
3. PR #7 (`develop` → `uat`) was previously CONFLICTING against the gutted develop — recheck mergeability now that develop is restored.
4. Pre-existing housekeeping: `project-truth.md` conflict-marker cleanup (pending user decision, untouched).
