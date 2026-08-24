# Firebase Scripts

Use the helpers in `firebase/scripts` to manage local Firebase project aliases and project setup for:

- `hris-workforce-dev-20260416`
- `hris-workforce-uat-20260416`

Main script:

- `firebase/scripts/manage-firebase-projects.ps1`
- `firebase/scripts/bootstrap-firebase-environments.ps1`

Recommended one-command setup:

```powershell
cd hris-app
.\firebase\scripts\bootstrap-firebase-environments.ps1
```

One-command setup plus GitHub env sync:

```powershell
.\firebase\scripts\bootstrap-firebase-environments.ps1 `
  -Repo "hrisworkforcesystem-coder/hris-app" `
  -DevBaseUrl "https://your-dev-api-url" `
  -UatBaseUrl "https://your-uat-api-url"
```

Examples:

```powershell
cd hris-app
.\firebase\scripts\manage-firebase-projects.ps1 -Action status
.\firebase\scripts\manage-firebase-projects.ps1 -Action ensure -CreateHostingSites
.\firebase\scripts\manage-firebase-projects.ps1 -Action ensure -CreateHostingSites -SyncGitHubEnv
```

Delete is explicit:

```powershell
.\firebase\scripts\manage-firebase-projects.ps1 -Action delete -DeleteDev -Force
.\firebase\scripts\manage-firebase-projects.ps1 -Action delete -DeleteUat -Force
```

The GitHub Actions env sync helper remains in `scripts/setup-firebase-github-env.ps1`. Current workflows read `FIREBASE_PROJECT_ID_*`, `VITE_API_BASE_URL_*`, `VITE_CLOUDINARY_PATH_*`, and Firebase service-account JSON secrets.
