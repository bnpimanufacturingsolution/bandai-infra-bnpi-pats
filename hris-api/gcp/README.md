# GCP Deployment Runbook

This folder contains the scripts for deploying `hris-api` to Google Cloud Run.

This setup is now environment-based:

- `develop` branch -> `dev`
- `uat` branch -> `uat`

Both environments use:

- the same GCP project: `hris-492904`
- different Cloud Run services
- different Secret Manager secret names
- different Mongo databases

## Environment mapping

DEV:

- branch: `develop`
- Cloud Run service: `hris-api-dev`
- database: `hris-dev`
- env file: [`.env.dev`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/.env.dev)

UAT:

- branch: `uat`
- Cloud Run service: `hris-api-uat`
- database: `hris-uat`
- env file: [`.env.uat`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/.env.uat)

## Files in this folder

[`setup-gcs-local.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/setup-gcs-local.ps1)

- local machine setup for `gcloud`, ADC, and GCS checks
- run this first on a new machine

[`setup-github-workload-identity.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/setup-github-workload-identity.ps1)

- creates or updates the GitHub deployer service account
- configures Workload Identity Federation
- grants IAM roles needed by GitHub Actions

[`sync-github-deploy-secrets.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/sync-github-deploy-secrets.ps1)

- pushes the environment-specific GitHub Actions secrets
- uses `_DEV` or `_UAT` secret names

[`audit-github-deploy-secrets.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/audit-github-deploy-secrets.ps1)

- lists current GitHub Actions secret names
- shows missing env-specific deploy secrets
- shows old unsuffixed deploy secrets that are no longer needed
- can auto-sync `dev` and `uat` env-specific secrets in fix mode
- can remove the old unsuffixed deploy secrets after the new ones are complete

[`gcp-deploy.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/gcp-deploy.ps1)

- bootstraps GCP resources for one environment
- syncs env values into Secret Manager
- builds the image
- deploys to Cloud Run

[`setup-github-cd.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/setup-github-cd.ps1)

- one-command setup for a full environment
- calls deploy bootstrap, workload identity setup, and GitHub secret sync in order

[`setup-all-environments.ps1`](c:/Users/anoni/OneDrive/Desktop/HRIS-PROJECT/hris-api/gcp/setup-all-environments.ps1)

- one-command setup for both `dev` and `uat`
- runs `setup-github-cd.ps1` twice in the correct order

## Recommended order

### First time on a machine

Run:

```powershell
.\gcp\setup-gcs-local.ps1 -ProjectId "hris-492904" -BucketName "hris-492904-uploads"
```

What this handles:

- `gcloud auth login`
- project selection
- application default credentials
- quota project
- storage access check

### First-time setup for both DEV and UAT

Run:

```powershell
.\gcp\setup-all-environments.ps1 -Repo "hrisworkforcesystem-coder/hris-api"
```

This is now the easiest full setup command.

It handles:

1. full DEV setup
2. full UAT setup
3. GitHub secret sync for both environments
4. initial deploys for both environments unless `-SkipInitialDeploy` is used

### First-time setup for DEV

Run:

```powershell
.\gcp\setup-github-cd.ps1 -Environment dev -Repo "hrisworkforcesystem-coder/hris-api"
```

This is the main setup command for DEV.

It handles:

1. GCP bootstrap and first deploy
2. GitHub Workload Identity setup
3. GitHub Actions secret sync for `_DEV`

### First-time setup for UAT

Run:

```powershell
.\gcp\setup-github-cd.ps1 -Environment uat -Repo "hrisworkforcesystem-coder/hris-api"
```

This is the main setup command for UAT.

It handles:

1. GCP bootstrap and first deploy
2. GitHub Workload Identity setup
3. GitHub Actions secret sync for `_UAT`

## Day-to-day commands

### Re-sync GitHub secrets only

DEV:

```powershell
.\gcp\sync-github-deploy-secrets.ps1 -Environment dev -Repo "hrisworkforcesystem-coder/hris-api"
```

UAT:

```powershell
.\gcp\sync-github-deploy-secrets.ps1 -Environment uat -Repo "hrisworkforcesystem-coder/hris-api"
```

### Audit or clean old GitHub deploy secrets

Audit only:

```powershell
.\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api"
```

Audit and auto-fix missing env-specific deploy secrets:

```powershell
.\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api" -Fix
```

Audit, auto-fix, then remove old unsuffixed deploy secrets if safe:

```powershell
.\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api" -Fix -RemoveLegacy
```

Remove old unsuffixed deploy secrets after confirming `_DEV` and `_UAT` secrets exist:

```powershell
.\gcp\audit-github-deploy-secrets.ps1 -Repo "hrisworkforcesystem-coder/hris-api" -RemoveLegacy
```

### Re-run Workload Identity only

DEV:

```powershell
.\gcp\setup-github-workload-identity.ps1 -Environment dev -Repo "hrisworkforcesystem-coder/hris-api"
```

UAT:

```powershell
.\gcp\setup-github-workload-identity.ps1 -Environment uat -Repo "hrisworkforcesystem-coder/hris-api"
```

### Re-deploy only

DEV:

```powershell
.\gcp\gcp-deploy.ps1 -Environment dev
```

UAT:

```powershell
.\gcp\gcp-deploy.ps1 -Environment uat
```

### Resume from a failed deploy step

Examples:

```powershell
.\gcp\gcp-deploy.ps1 -Environment dev -StartFrom build
.\gcp\gcp-deploy.ps1 -Environment uat -StartFrom deploy
```

## Safe order when something breaks

If GitHub Action auth is failing:

1. run `setup-github-workload-identity.ps1`
2. run `audit-github-deploy-secrets.ps1 -Fix`
3. if needed, run `audit-github-deploy-secrets.ps1 -RemoveLegacy`
4. rerun the workflow

If you want to rebuild both environments cleanly:

1. run `setup-all-environments.ps1`

If Cloud Run deployment is failing but IAM/secrets are already set:

1. run `gcp-deploy.ps1 -Environment <env> -StartFrom deploy`

If Secret Manager values changed:

1. update `.env.dev` or `.env.uat`
2. run `gcp-deploy.ps1 -Environment <env> -StartFrom secrets`
3. if needed, redeploy from `deploy`

## GitHub Actions secret naming

The workflow now expects environment-specific secret names only.

Examples:

DEV:

- `GCP_PROJECT_ID_DEV`
- `GCP_REGION_DEV`
- `CLOUD_RUN_SERVICE_DEV`
- `GCP_WORKLOAD_IDENTITY_PROVIDER_DEV`
- `GCP_SERVICE_ACCOUNT_EMAIL_DEV`
- `GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL_DEV`
- `SECRET_DATABASE_URL_DEV`

UAT:

- `GCP_PROJECT_ID_UAT`
- `GCP_REGION_UAT`
- `CLOUD_RUN_SERVICE_UAT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER_UAT`
- `GCP_SERVICE_ACCOUNT_EMAIL_UAT`
- `GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL_UAT`
- `SECRET_DATABASE_URL_UAT`

There is no legacy unsuffixed deploy path anymore.

## Notes

- Custom domains are not part of this setup yet.
- Cloud Run URLs are the expected deploy target for now.
- If you want production later, add it as a separate explicit environment instead of mixing it into this flow.
- Keep the current script names. The run order is documented here, so renaming is not necessary and avoids breaking commands or references.
