# Infrastructure Readiness Checklist

## Local Tools

<!-- WWG_GENERATED:LOCAL_TOOL_CHECKS:START -->
| Tool | Status | Version | Required For | Recommendation |
|---|---|---|---|---|
| git | ready | git version 2.47.1.windows.2 | Local Development, GitHub publishing | Ready. |
| node | ready | v22.13.0 | Local Development, local development | Ready. |
| npm | missing | n/a | Local Development, local development | Install npm before using this profile. |
| gh | ready | gh version 2.69.0 (2025-03-19) | GitHub publishing | Run gh authentication explicitly when ready; WWG will not do it automatically. |
| pnpm | missing | n/a | local development | Install pnpm only if this project needs it. |
| docker | warning | Docker version 29.2.1, build a5c7197 | containerized local development | Docker is installed, but the daemon does not appear to be running. |
| gcloud | missing | n/a | Google Cloud | Install gcloud only if this project needs it. |
| firebase | missing | n/a | Firebase | Install firebase only if this project needs it. |
<!-- WWG_GENERATED:LOCAL_TOOL_CHECKS:END -->

## Accounts and Authentication

<!-- WWG_GENERATED:AUTH_CHECKS:START -->
| Service | Status | Recommendation |
|---|---|---|
| gh | not authenticated | Run gh authentication explicitly when ready; WWG will not do it automatically. |
| gcloud | not authenticated | Install gcloud only if this project needs it. |
| firebase | not logged in | Install firebase only if this project needs it. |
<!-- WWG_GENERATED:AUTH_CHECKS:END -->

## Hosting Readiness

## Deployment Readiness

## Open Questions

## Next Commands
