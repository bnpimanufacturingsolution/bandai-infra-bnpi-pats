# How local code reaches https://dev.bnpi-pats.tech

**Date:** 2026-08-19  
**Kind:** operator report (pull / push / GitOps)  
**Not** a UAT sign-off.  
**Live proof this day:** attendance **Request time** + Today/log layout served on public DEV after `origin/develop` `f93f30d` / ansible-pull `2026-08-19T10:01:21Z`.

| | |
|---|---|
| Public DEV app | `https://dev.bnpi-pats.tech` |
| Public DEV API | `https://dev-api.bnpi-pats.tech` |
| Source of truth for DEV code | GitHub `origin/develop` (`bnpimanufacturingsolution/bandai-infra`) |
| Serving runtime | Hyper-V VM `project-truth-node` → K3s namespace `dev` |
| Local preview (this PC) | Vite `http://localhost:5175` + API `http://localhost:3001` |

---

## Verdict (read this first)

| Question | Answer |
|---|---|
| Can I pull latest code **from the website** `https://dev.bnpi-pats.tech`? | **No.** That URL is the running app, not a git remote. |
| Can I pull latest code **from the VM**? | **Not as the normal path.** The VM copies `develop` from GitHub. You pull `origin/develop` on the Windows repo. |
| How does a UI change appear on DEV? | Commit → **push `develop` to GitHub** → VM `ansible-pull` rebuilds `bnpi-pats-app-local:develop` / `bnpi-pats-api-local:develop` → K3s rolls the `dev` pods. |
| Does merging `develop` **into** my feature branch update DEV? | **No.** That only updates your laptop branch. DEV does not serve `bryan-task`. |

```text
Windows repo (your edits, Vite)
        |
        | git push origin develop
        v
GitHub  origin/develop
        |
        | VM timer: project-truth-ansible-pull
        |   checkout /var/lib/project-truth/ansible-pull
        |   docker compose build selected images
        |   k3s ctr import + kubectl rollout
        v
K3s DEV pods  bnpi-pats-app-local:develop  +  bnpi-pats-api-local:develop
        |
        | Cloudflare named tunnel (keep it running)
        v
https://dev.bnpi-pats.tech
```

---

## 1. The four places people mix up

| Place | What it is | What it is not |
|---|---|---|
| `http://localhost:5175` | Your **current working tree** (including uncommitted files) | Not DEV. Not what clients see. |
| Feature branch (`bryan-task`, etc.) | Your work until it lands on `develop` | Not served by `https://dev.bnpi-pats.tech` |
| `origin/develop` on GitHub | The only branch the VM is built from | Not automatically your local branch |
| `https://dev.bnpi-pats.tech` | Built Docker image from a **specific SHA** of `develop` | Not a live mount of the Windows folder |

Local can look “done” while DEV is still an older SHA. That is expected until GitOps rebuilds.

---

## 2. Pull the latest `develop` onto this PC

Do this **before** you start a change, and again before you merge.

```powershell
cd C:\uzaro\bandai-infra
git fetch origin
git checkout develop
git pull origin develop
git log -1 --oneline
```

If you are already on a feature branch and only want develop’s commits in your branch:

```powershell
git checkout bryan-task
git fetch origin
git merge origin/develop
```

That merge keeps **you** up to date. It still does **not** publish your feature to DEV.

| Check | Command / look for |
|---|---|
| You have GitHub’s develop | `git rev-parse HEAD` equals `git rev-parse origin/develop` |
| Your feature is not lost | `git log origin/develop..HEAD --oneline` lists **your** commits only |

---

## 3. Put **your** change onto `develop`

### A. Feature is already committed on your branch

Preferred: merge or cherry-pick **onto** `develop`, then push `develop`.

```powershell
git checkout develop
git pull origin develop
git merge bryan-task
# or, for one commit only:
# git cherry-pick <sha>
git push origin develop
```

Wrong direction (does not update DEV):

```text
git checkout bryan-task
git merge develop     # laptop only
```

### B. Work is still uncommitted

Uncommitted files exist only on this PC. Vite shows them. GitHub and DEV do not.

```powershell
git status
git add <the files you mean to ship>
git commit -m "feat(...): short why"
git checkout develop
git pull origin develop
git cherry-pick <your-commit>   # or merge the feature branch
git push origin develop
```

### C. Files that git never sees

If `git status` does not list a file that Vite is using, DEV can never get it.

Known trap (2026-08-19): root `.gitignore` had unanchored `templates/`, which also ignored `bnpi-pats-app/app/components/templates/AttendanceRateDonut.tsx`. Local Vite had the donut; `git push` did not. The DEV image then failed with `Could not resolve "./AttendanceRateDonut"`.

```powershell
git check-ignore -v path\to\file
git add -f path\to\file     # only if it must ship and ignore is wrong
```

Intended ignore is **repo-root** package templates (`/templates/`), not React page templates.

---

## 4. What happens after `git push origin develop`

| Step | Owner | What “green” looks like |
|---|---|---|
| 1. GitHub has the SHA | You | `git ls-remote origin refs/heads/develop` shows your commit |
| 2. Argo CD syncs manifests | VM | `project-truth-dev` **Synced** at that SHA. **This is not the new UI yet.** Same image tag `bnpi-pats-app-local:develop` can still be the old build. |
| 3. `project-truth-ansible-pull` | VM timer (~5 min) or `sudo project-truth-ansible-pull` | State file commit = your SHA |
| 4. Docker rebuild | VM | Only services whose paths changed: `bnpi-pats-app/` → app image, `bnpi-pats-api/` → API image. Docs-only can be `services=none` |
| 5. K3s import + rollout | VM | New `bnpi-pats-app-*` / `bnpi-pats-api-*` pod age is recent, `1/1 Running` |
| 6. Public URL | Cloudflare tunnel (do not stop it) | New hashed `/assets/root-….css` / attendance JS. Hard-refresh the tab. |

Image tags stay `bnpi-pats-app-local:develop` and `bnpi-pats-api-local:develop`. The **SHA inside the image** is what changes.

Path → image (from `ansible/project-truth-pull.yml`):

| Changed path | Rebuilds |
|---|---|
| `bnpi-pats-app/` | `bnpi-pats-app-local:develop` |
| `bnpi-pats-api/` (most) | `bnpi-pats-api-local:develop` |
| `bnpi-pats-api/prisma/` or seeds | also `bnpi-pats-api-db-init:develop` |
| `bnpi-pats-emp-app/` | `bnpi-pats-emp-app-local:develop` |
| `appliance/docker-compose*` | all of the above |
| `.wwg/`, `docs/`, `audits/` only | usually **no** image (`services=none`) |

---

## 5. Force / watch the VM pull

Direct LAN first (this workstation):

```powershell
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
```

If LAN SSH times out, Cloudflare alias (keep the tunnel **on**):

```powershell
ssh project-truth-bnpi-pats
```

On the VM:

```bash
# last successful pull
sudo cat /var/lib/project-truth/ansible-pull-state

# last image SHA actually imported
sudo cat /var/lib/project-truth/k8s-runtime-image-state

# run now (do not start a second copy if already "activating")
sudo project-truth-ansible-pull

# or
sudo project-truth-ansible-pull --status
sudo journalctl -u project-truth-ansible-pull.service -n 80 --no-pager

sudo kubectl -n dev get pods
sudo kubectl -n argocd get applications.argoproj.io \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision
```

LAN DEV (same code as public, no Cloudflare HTML cache):

```text
http://10.184.37.19:3100
http://10.184.37.19:3101/health
```

| File | Meaning |
|---|---|
| `/var/lib/project-truth/ansible-pull-state` | Last playbook apply (`branch`, `commit`, `synced_at`) |
| `/var/lib/project-truth/k8s-runtime-image-state` | Last **imported** image SHA + which services built |
| Argo `REV=` | Git SHA of manifests. Can match GitHub while the **old** Docker image is still running |

---

## 6. Prove DEV is serving **your** change

Do not stop at “I pushed” or “Argo is Synced”.

| Proof | How |
|---|---|
| GitHub tip | `git ls-remote origin refs/heads/develop` |
| VM pulled that tip | `ansible-pull-state` `commit=` equals that SHA |
| Image rebuilt | `k8s-runtime-image-state` `commit=` equals that SHA and `services=` includes `bnpi-pats-app` or `bnpi-pats-api` as needed |
| New pod | `kubectl -n dev get pods` — `bnpi-pats-app` / `bnpi-pats-api` age is after `synced_at` |
| New browser assets | View source on `https://dev.bnpi-pats.tech/...` — `root-….css` hash **changed** vs the old tab |
| Feature string in JS | Search the attendance (or other) chunk for your label, e.g. `Request time` |
| UI | Hard-refresh. Expand the control if it is not first-paint (Request time is on the **open day card**) |

Example from 2026-08-19 (attendance request):

| Before push | After GitOps |
|---|---|
| `origin/develop` `b409ca4` | `f93f30d` then docs `6f97387` |
| HTML `root-pLw9zlEI.css` | `root-CIRKoZkC.css` |
| No `Request time` | `_id.attendance-DI1eNUjI.js` contains `Request time` |
| — | Playwright: Zen My Attendance, expand Aug 19 → orange **Request time** |

---

## 7. Why DEV stayed old (this week’s cases)

| What it looked like | Real cause | What to do |
|---|---|---|
| Local has the button, DEV does not | Feature only on `bryan-task`; `develop` never got the commit | Merge/cherry-pick **onto** `develop` and `git push origin develop` |
| “I already merged develop” | Merged `develop` **into** the feature branch | That updates the laptop only |
| Layout on local, not on DEV | Uncommitted `app.css` | Commit it, then push `develop` |
| Push “done” but DEV image build red | New file under `bnpi-pats-app/app/components/templates/` ignored | `git check-ignore -v`, fix `/templates/` ignore, `git add` the file, push again |
| Argo Synced, UI still old | Manifest SHA updated; Docker tag not rebuilt yet | Wait for ansible-pull or run `sudo project-truth-ansible-pull`; watch `k8s-runtime-image-state` |
| ansible-pull 403 `account is suspended` | VM GitHub token user suspended | Repair `argocd/project-truth-repo-creds` / pull token; host `git push` can still work |
| `bnpi-pats-emp-app` 404 on pull | Token cannot read the private submodule | Script applies playbook from the main checkout; do not delete `bnpi-pats-emp-app` from `develop` |
| Tab still looks old | Browser cached previous hashed assets | Hard-refresh; confirm CSS/JS hash in View Source |

---

## 8. Operator checklist (copy this)

### Start of day — get latest

- [ ] `git fetch origin`
- [ ] `git checkout develop && git pull origin develop`
- [ ] If working on a feature: merge `origin/develop` into that branch
- [ ] Local preview is `localhost:5175`, not `dev.bnpi-pats.tech`

### Ship to DEV

- [ ] `git status` — no leftover UI files you expect on DEV
- [ ] `git check-ignore -v` on any new file Vite is using
- [ ] Commit on the feature branch
- [ ] Checkout `develop`, pull, merge or cherry-pick **your** commits
- [ ] `git push origin develop`
- [ ] Confirm `git ls-remote origin refs/heads/develop` is your SHA

### Confirm DEV actually rebuilt

- [ ] SSH VM (LAN `infra@10.184.37.19` first, else `project-truth-bnpi-pats`)
- [ ] `ansible-pull-state` commit = your SHA
- [ ] `k8s-runtime-image-state` commit = your SHA and expected `services=`
- [ ] `kubectl -n dev get pods` — app/api pods new and `1/1`
- [ ] Public page has a **new** `/assets/root-….css` hash
- [ ] Click through the feature (do not trust the collapsed first paint)

Do **not** stop or toggle `cloudflared-bnpi-pats.service` for a normal deploy.

---

## 9. Related files

| Path | Use |
|---|---|
| `ansible/project-truth-pull.yml` | What the VM rebuilds after a new `develop` SHA |
| `appliance/bin/project-truth-ansible-pull.sh` | `sudo project-truth-ansible-pull` |
| `docs/GITOPS_GH_WATCH_RUNBOOK.md` | GitHub Actions / overlay watch |
| `AGENT-DEPLOY.md` | Example of SHA → image-state → live pod |
| `AGENTS.md` | Host-local VM first, tunnel stay-on, finish line |

---

## WWG

| Field | Value |
|---|---|
| Task mode | docs-only operator report |
| Truth update | Local Vite ≠ public DEV. DEV is GitOps of `origin/develop` + ansible image rebuild. |
| Remaining stale | If ansible-pull 403 returns, public DEV SHA can lag GitHub again. Re-check `ansible-pull-state`. |
