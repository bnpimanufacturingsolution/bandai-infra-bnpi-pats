# Monorepo Nested Repo Provenance

Parent repo path: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`

Inspection date: `2026-06-17`

## Parent Repository

- Parent `.git`: present
- Parent branch at inspection: `main`
- Parent status at inspection: existing modified project files plus untracked `appliance/`, `hris-api/`, and `hris-app/`

## Nested Repository Conversion

At inspection time, both nested Git metadata folders were already absent:

- `hris-api\.git`: absent
- `hris-app\.git`: absent

Because the nested `.git` folders were already removed before this documentation pass, live nested Git metadata such as remotes and dirty status could not be read from those folders. The supplied source-control provenance is preserved below.

## Supplied Provenance

### hris-api

- Former repo path: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH\hris-api`
- Former branch: `develop`
- Former commit: `8a81340e1325631f240f6b08dc1c09be771316da`

### hris-app

- Former repo path: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH\hris-app`
- Former branch: `develop`
- Former commit: `2f6ba33c6fb6f576a4fdcc6a455d66352e5198e5`

## Result

`hris-api` and `hris-app` are normal folders under the parent monorepo and should be owned by the parent repository in Source Control.
