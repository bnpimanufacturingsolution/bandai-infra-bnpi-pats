# PATS Local Development Setup

This guide details how engineers run, build, and test PATS components locally.

---

## 1. Prerequisites

- Node.js (v18 or v20 LTS)
- npm
- Access to local or forwarded PostgreSQL database

---

## 2. Running the Application Locally

### 2.1 Backend API (`bnpi-pats-api`)
```powershell
cd bnpi-pats-api
npm install
npm run dev
```
Serves endpoints at `http://localhost:3001/api`.

### 2.2 Web Application (`bnpi-pats-app`)
```powershell
cd bnpi-pats-app
npm install
npm run dev
```
Launches frontend UI at `http://localhost:5173`.

---

## 3. Running Validation Tests

```powershell
# In repo root: verify self-heal and contract compliance
powershell -File scripts/test-self-heal-contract.ps1
```
All contract checks must pass.
