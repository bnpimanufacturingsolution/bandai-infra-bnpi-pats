# Deployment Model

Status: INFERRED_FROM_EXISTING_PROJECT
Last reviewed: 2026-05-28

## Hosting

Firebase Hosting is configured through `firebase.json`.

- Hosting targets: `dev` and `uat`.
- Public directory: `build/client`.
- SPA rewrite: all routes rewrite to `/index.html`.
- The app build output is produced by `react-router build`.

## Environments

Observed Firebase/project naming:

- `hris-workforce-dev-20260416`.
- `hris-workforce-uat-20260416`.

The Firebase README references repository `hrisworkforcesystem-coder/hris-app`.

## CI/CD

Observed GitHub workflows include app quality verification, Firebase hosting deployment flows, image deployment, preflight, and rollback.

The canonical app quality gate is:

```bash
npm run quality:ci
```

It runs focused test typechecking, the app Vitest suite, and a production build. The stricter debt-burndown command is:

```bash
npm run quality:strict
```

`quality:strict` remains a release-candidate/manual hardening command until full app typecheck, route audits, and browser E2E are stable enough to make blocking.

The pull request workflow:

- Uses Node 20.
- Runs `npm ci`.
- Runs `npm run quality:ci`.
- Uploads the `build/client` output from the passing quality gate and deploys that artifact.
- Verifies `build/client/index.html` after artifact download before invoking Firebase preview deployment.
- Resolves the Firebase Hosting site from `.firebaserc` and writes a workspace-root, runner-scoped single-site preview config before deploying preview channels, avoiding fragile `hosting:<target>` matching in `firebase-tools hosting:channel:deploy` while keeping `public: build/client` relative to the repository workspace.
- Uses `VITE_API_BASE_URL` pointing at a Cloud Run dev API URL.
- Requires Firebase service-account JSON through GitHub secrets. Repository fallback service-account JSON loading has been removed.

The branch Firebase workflow:

- Runs on pushes to `develop` and `uat`.
- Runs `npm run quality:ci` before deploy.
- Uploads the build output from the passing quality gate and deploys that artifact.
- Uses GitHub Environments named `dev` and `uat` when deploying.

The image workflow:

- Auto-deploys staging only after successful `APP CI` on `develop`.
- Runs `npm run quality:ci` for manual dispatches before building/pushing an image.
- Stores per-environment previous/current image state under `.deploy-state` in the deployment path.
- Attempts to restore the previous image automatically when the post-deploy healthcheck fails.

## Local Development

- App dev server script: `npm run dev`.
- Vite dev server port in config: 5175.
- Typecheck script: `npm run typecheck`.
- Build script: `npm run build`.

## Operational Guardrails

- Deployments require explicit human approval when production, UAT, secrets, or public hosting are affected.
- GitHub branch protection and Environment approval settings are outside the repository and must be confirmed in GitHub before treating this as production release governance.
- Firebase service-account JSON files are present and tracked in the Git index by filename. Contents were not inspected; keys should be treated as exposed until owner confirms rotation/removal.
- Destructive Firebase scripts and employee deletion scripts are high-risk and must remain approval-gated.
- No production readiness claim is implied by this document.

## Current Readiness Notes

- Firebase tools are listed in devDependencies, but the previous infra check reported local Firebase CLI availability as missing.
- Docker support exists via `Dockerfile`, but prior infra checks found the local Docker daemon unavailable.
- README/package identity remains stale and should be reconciled before public release, stakeholder demos, or generated release notes.
