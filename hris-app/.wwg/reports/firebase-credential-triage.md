# Firebase Credential Triage

## Outcome

Status: ACTION_REQUIRED

Non-destructive safety fixes were applied:

- Firebase hosting workflows now require GitHub secrets for service-account JSON.
- Repository fallback service-account JSON loading was removed from Firebase hosting workflows.
- `.gitignore` now ignores future Firebase admin SDK and service-account JSON files.

Tracked Firebase admin SDK JSON files remain present and require owner-approved removal and key rotation.

## Evidence

Files detected by filename only; contents were not inspected:

- `firebase/hris-workforce-uat-20260416-firebase-adminsdk-fbsvc-ee4f65cccc.json`
- `firebase/scripts/hris-workforce-dev-20260416-firebase-adminsdk-fbsvc-5bc96d313b.json`

Git index check confirmed both filenames are tracked.

Workflow reference review found fallback behavior in:

- `.github/workflows/firebase-hosting-develop.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`

## Validation

- Searched workflow/config references without reading JSON contents.
- Confirmed fallback service-account file reads were removed from Firebase hosting workflows.
- Confirmed `.gitignore` includes Firebase service-account credential patterns.

## Risks

- Tracked service-account JSON files should be treated as exposed until the project owner confirms key rotation or revocation.
- Removing the files from the current tree is not enough if credentials were committed; rotation is still required.
- Deploy workflows will now fail if the expected GitHub secrets are not configured.

## Next Action

Owner approval needed:

1. Rotate or revoke the Firebase service-account keys represented by the tracked JSON files.
2. Remove the tracked JSON files from the repository.
3. Configure GitHub secrets:
   - `FIREBASE_SERVICE_ACCOUNT_DEV` or `FIREBASE_SERVICE_ACCOUNT_HRIS_APP_DEV`
   - `FIREBASE_SERVICE_ACCOUNT_UAT`, `FIREBASE_SERVICE_ACCOUNT_HRIS_APP_UAT`, or `FIREBASE_SERVICE_ACCOUNT_HRIS_UAT`
4. Verify Firebase deploy workflows after secrets are configured.

## Detailed Notes

No secret values, JSON contents, client email values, private keys, or project credential fields were opened or copied during this triage.

## Files Changed Or Files Reviewed

Changed:

- `.github/workflows/firebase-hosting-develop.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`
- `.gitignore`
- `.wwg/wiki/05-architecture/security-model.md`
- `.wwg/wiki/05-architecture/deployment-model.md`
- `.wwg/governance/recommendation-registry.md`

Reviewed:

- Firebase JSON filenames under `firebase/`
- `.github/workflows/firebase-hosting-develop.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`

## WWG Truth Synchronization

- Task mode: Existing Project Adoption / security governance maintenance
- New truth detected: YES
- Wiki updated: YES
- Workspace updated: YES
- Governance review completed: YES
- Drift status: ORANGE
- Canonical files changed:
  - `.wwg/wiki/05-architecture/security-model.md`
  - `.wwg/wiki/05-architecture/deployment-model.md`
  - `.wwg/governance/recommendation-registry.md`
- Implementation discoveries synced:
  - Firebase service-account JSON files are tracked by filename.
  - Firebase hosting workflows previously supported repository fallback service-account JSON loading.
  - Firebase hosting workflows now require GitHub secrets.
- Remaining stale context:
  - Actual credential revocation/rotation status is unknown.
  - Tracked JSON files remain until owner approves removal.
