#!/usr/bin/env python3
"""
Execute fingerprint force-clear recovery for the unique FP gap 9 people.
DEV only. Real writes (dryRun=false after a preview gate).

  python3 scripts/execute-fp-gap-force-clear.py
  HRIS_API=http://127.0.0.1:3101 OUT_DIR=/tmp/fp-gap-exec python3 ...
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

API = os.environ.get("HRIS_API", "http://127.0.0.1:3101")
EMAIL = "admin@bandai.local"
PASSWORD = "password123"
APP_CODE = "hris"
# Canonical Main A/B/D/E/F (never C / TEST)
DEVICE_IDS = [
    "cmrht5s2w00ei7zgsre8y3o5n",  # A
    "cmpxw13hx002h7zwso7dyedrn",  # B
    "cmripjwkw00ffl0013lfxcbxw",  # D
    "cmriu5ab102goi001x9o7nfct",  # E
    "cmrim1zop05ik7zp4zgm2sm4k",  # F
]
TARGET_UIDS = {"10", "696", "976", "1007", "1715", "1751", "1757", "1814", "1815"}
OUT_DIR = os.environ.get("OUT_DIR", "/tmp/fp-gap-force-exec")
MAX_WRITES = int(os.environ.get("MAX_VERIFIED_WRITES", "50"))
POLL_SEC = int(os.environ.get("POLL_SEC", "15"))
MAX_WAIT_SEC = int(os.environ.get("MAX_WAIT_SEC", "3600"))
os.makedirs(OUT_DIR, exist_ok=True)


def http_json(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 900) -> tuple[int, Any]:
    url = f"{API}{path}" if path.startswith("/") else path
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {"_raw": ""}
        except json.JSONDecodeError:
            payload = {"_raw": raw[:4000]}
        return e.code, payload
    except Exception as e:
        return 0, {"error": str(e)}


def save(name: str, obj: Any) -> str:
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False, default=str)
    print(f"WROTE {path}", flush=True)
    return path


def dig(d: Any, *keys: str, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return default if cur is None else cur


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "api": API,
        "deviceIds": DEVICE_IDS,
        "targetVendorUserIds": sorted(TARGET_UIDS, key=lambda x: int(x)),
        "maxVerifiedWrites": MAX_WRITES,
        "mutating": True,
        "logic": {
            "policy": "AUTO_RESOLVE_DUAL_OWNER_FORCE_CLEAR",
            "what": (
                "On conflicted TARGET device only: sticky-delete peer finger slots, "
                "then write gap person's FP from richest SOURCE. Peer keeps FP on other devices."
            ),
            "anti_dupe": "never permanent ban — force-clear + write when raw blob present",
        },
    }

    code, health = http_json("GET", "/health", timeout=15)
    report["health"] = {"http": code, "body": health}
    save(f"00-health-{stamp}.json", health)
    if code != 200:
        report["verdict"] = "EXEC_FAIL_HEALTH"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2))
        return 2

    code, login = http_json(
        "POST",
        "/api/auth/login",
        body={"email": EMAIL, "password": PASSWORD, "appCode": APP_CODE},
        timeout=30,
    )
    token = dig(login, "data", "token") or ""
    report["login"] = {"http": code, "hasToken": bool(token)}
    if not token:
        report["verdict"] = "EXEC_FAIL_LOGIN"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2))
        return 2

    # Cancel/wait if active job
    code_j, jobs_list = http_json(
        "GET",
        "/api/device/hikvision/sdk-users/merge/recovery/jobs?limit=5",
        token=token,
        timeout=60,
    )
    save(f"01-jobs-list-{stamp}.json", {"http": code_j, "resp": jobs_list})
    active = []
    for j in dig(jobs_list, "data") or dig(jobs_list, "data", "jobs") or []:
        if isinstance(j, dict) and j.get("status") in ("pending", "recovering", "retrying"):
            active.append(j)
    if isinstance(dig(jobs_list, "data"), dict):
        for j in dig(jobs_list, "data", "items") or dig(jobs_list, "data", "rows") or []:
            if isinstance(j, dict) and j.get("status") in ("pending", "recovering", "retrying"):
                active.append(j)
    report["activeJobsBefore"] = [
        {"id": j.get("id"), "status": j.get("status")} for j in active
    ]
    if active:
        report["verdict"] = "EXEC_BLOCKED_ACTIVE_JOB"
        report["activeJobIds"] = [j.get("id") for j in active]
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps({"STATUS": report["verdict"], "active": report["activeJobsBefore"]}, indent=2))
        return 3

    print("PLAN...", flush=True)
    t0 = time.time()
    code, plan_resp = http_json(
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        token=token,
        body={"deviceIds": DEVICE_IDS},
        timeout=900,
    )
    plan_elapsed = round(time.time() - t0, 2)
    plan = dig(plan_resp, "data", "plan") or dig(plan_resp, "data") or {}
    plan_id = dig(plan, "planId") or dig(plan_resp, "data", "planId")
    writes = dig(plan, "credentialWrites") or []
    if not isinstance(writes, list):
        writes = []
    fp_writes = [
        w
        for w in writes
        if isinstance(w, dict)
        and str(w.get("modality")) == "fingerprint"
        and str(w.get("vendorUserId") or "") in TARGET_UIDS
    ]
    unique_fp = sorted(
        {str(w.get("vendorUserId")) for w in writes if isinstance(w, dict) and str(w.get("modality")) == "fingerprint" and w.get("vendorUserId")},
        key=lambda x: int(x) if str(x).isdigit() else 0,
    )
    force_n = sum(1 for w in fp_writes if w.get("fleetSameByteMajorityForceOverwrite"))
    anti_n = sum(1 for w in fp_writes if w.get("blockingReason") == "device_fp_anti_dupe_peer_owner")
    ready_n = sum(1 for w in fp_writes if w.get("executionEligibility") == "ready_from_raw_blob")
    report["plan"] = {
        "http": code,
        "elapsedSec": plan_elapsed,
        "planId": plan_id,
        "unique_fp": len(unique_fp),
        "unique_fp_ids": unique_fp,
        "fp_rows_for_9": len(fp_writes),
        "ready": ready_n,
        "force_flags": force_n,
        "anti_dupe": anti_n,
    }
    save(
        f"02-plan-summary-{stamp}.json",
        {
            "planId": plan_id,
            "unique_fp": unique_fp,
            "fp_sample": [
                {
                    "uid": w.get("vendorUserId"),
                    "elig": w.get("executionEligibility"),
                    "block": w.get("blockingReason"),
                    "force": w.get("fleetSameByteMajorityForceOverwrite"),
                    "src": w.get("sourceDeviceId"),
                    "tgt": w.get("targetDeviceId"),
                    "reason": str(w.get("recommendationReason") or "")[:160],
                }
                for w in fp_writes[:30]
            ],
        },
    )
    if code != 200 or not plan_id:
        report["verdict"] = "EXEC_FAIL_PLAN"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2)[:4000])
        return 4
    if ready_n == 0:
        report["verdict"] = "EXEC_FAIL_NO_READY"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2)[:4000])
        return 5

    print("REVIEW...", flush=True)
    code_r, review = http_json(
        "POST",
        "/api/device/hikvision/sdk-users/merge/recovery/review",
        token=token,
        body={
            "planId": plan_id,
            "deviceIds": DEVICE_IDS,
            "modalities": ["fingerprint"],
            "canaryModality": "fingerprint",
        },
        timeout=600,
    )
    scope_hash = dig(review, "data", "scopeHash")
    counters = dig(review, "data", "counters") or {}
    report["review"] = {
        "http": code_r,
        "scopeHash": scope_hash,
        "fingerprintReady": counters.get("fingerprintReady"),
        "readyToWrite": counters.get("readyToWrite"),
        "physicalActionRequired": counters.get("physicalActionRequired"),
    }
    save(f"03-review-{stamp}.json", {"http": code_r, "resp": review})
    if code_r != 200 or not scope_hash:
        report["verdict"] = "EXEC_FAIL_REVIEW"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2)[:4000])
        return 6

    print("DRYRUN gate...", flush=True)
    code_d, dry = http_json(
        "POST",
        "/api/device/hikvision/sdk-users/merge/recovery/jobs",
        token=token,
        body={
            "planId": plan_id,
            "expectedScopeHash": scope_hash,
            "deviceIds": DEVICE_IDS,
            "canaryModality": "fingerprint",
            "maxVerifiedWrites": MAX_WRITES,
            "dryRun": True,
            "execute": False,
        },
        timeout=120,
    )
    preview = dig(dry, "data", "executionPreview") or {}
    would = int(preview.get("wouldWriteCount") or 0)
    would_people = int(preview.get("wouldWriteUniquePeople") or 0)
    report["dryRun"] = {
        "http": code_d,
        "wouldWriteCount": would,
        "wouldWriteUniquePeople": would_people,
        "willCreateJob": dig(dry, "data", "willCreateJob"),
        "fingerprintReady": preview.get("fingerprintReady"),
    }
    save(f"04-dryrun-{stamp}.json", {"http": code_d, "resp": dry})
    if code_d != 200 or would < 1:
        report["verdict"] = "EXEC_FAIL_DRYRUN_GATE"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2)[:4000])
        return 7

    print(
        f"EXECUTE real job planId={plan_id} wouldWrite={would} people={would_people} max={MAX_WRITES}",
        flush=True,
    )
    code_e, exec_resp = http_json(
        "POST",
        "/api/device/hikvision/sdk-users/merge/recovery/jobs",
        token=token,
        body={
            "planId": plan_id,
            "expectedScopeHash": scope_hash,
            "deviceIds": DEVICE_IDS,
            "canaryModality": "fingerprint",
            "maxVerifiedWrites": MAX_WRITES,
            "dryRun": False,
            "execute": True,
        },
        timeout=120,
    )
    job_id = dig(exec_resp, "data", "id") or dig(exec_resp, "data", "jobId") or dig(exec_resp, "data", "job", "id")
    report["execute"] = {
        "http": code_e,
        "jobId": job_id,
        "message": dig(exec_resp, "message"),
    }
    save(f"05-execute-start-{stamp}.json", {"http": code_e, "resp": exec_resp})
    # API returns 202 Accepted when the durable recovery job is started.
    if code_e not in (200, 201, 202) or not job_id:
        report["verdict"] = "EXEC_FAIL_START"
        save(f"STATUS-{stamp}.json", report)
        print(json.dumps(report, indent=2)[:6000])
        return 8

    # Poll job
    terminal = {"completed", "failed", "cancelled", "succeeded", "done"}
    t_end = time.time() + MAX_WAIT_SEC
    last = None
    while time.time() < t_end:
        code_p, job = http_json(
            "GET",
            f"/api/device/hikvision/sdk-users/merge/recovery/jobs/{job_id}",
            token=token,
            timeout=60,
        )
        data = dig(job, "data") or job or {}
        status = str(data.get("status") or "")
        counters = data.get("counters") or {}
        stage = data.get("currentStage") or data.get("stage")
        last = {
            "http": code_p,
            "status": status,
            "stage": stage,
            "counters": counters,
            "heartbeatAt": data.get("heartbeatAt"),
            "error": data.get("error") or data.get("lastError"),
        }
        print(
            f"POLL job={job_id} status={status} stage={stage} verified={counters.get('verified')} failed={counters.get('failed')} writing={counters.get('writing')}",
            flush=True,
        )
        save(f"06-job-poll-latest.json", last)
        if status.lower() in terminal or status in ("completed", "failed", "cancelled"):
            break
        time.sleep(POLL_SEC)

    save(f"07-job-final-{stamp}.json", {"http": code_p, "resp": job})
    report["jobFinal"] = last
    verified = int((last or {}).get("counters", {}).get("verified") or 0)
    failed = int((last or {}).get("counters", {}).get("failed") or 0)
    report["verified"] = verified
    report["failed"] = failed

    # Replan residual unique_fp
    print("REPLAN residual...", flush=True)
    code2, plan2 = http_json(
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        token=token,
        body={"deviceIds": DEVICE_IDS},
        timeout=900,
    )
    plan2_data = dig(plan2, "data", "plan") or dig(plan2, "data") or {}
    writes2 = dig(plan2_data, "credentialWrites") or []
    if not isinstance(writes2, list):
        writes2 = []
    unique2 = sorted(
        {
            str(w.get("vendorUserId"))
            for w in writes2
            if isinstance(w, dict)
            and str(w.get("modality")) == "fingerprint"
            and w.get("vendorUserId")
        },
        key=lambda x: int(x) if str(x).isdigit() else 0,
    )
    report["after"] = {
        "planHttp": code2,
        "unique_fp": len(unique2),
        "unique_fp_ids": unique2,
        "fp_ready": sum(
            1
            for w in writes2
            if isinstance(w, dict)
            and str(w.get("modality")) == "fingerprint"
            and w.get("executionEligibility") == "ready_from_raw_blob"
        ),
        "anti_dupe": sum(
            1
            for w in writes2
            if isinstance(w, dict)
            and w.get("blockingReason") == "device_fp_anti_dupe_peer_owner"
        ),
    }
    save(f"08-after-plan-{stamp}.json", report["after"])

    before_n = report["plan"]["unique_fp"]
    after_n = report["after"]["unique_fp"]
    report["delta"] = {
        "unique_fp_before": before_n,
        "unique_fp_after": after_n,
        "unique_fp_delta": before_n - after_n,
        "verified": verified,
        "failed": failed,
    }
    if verified > 0 and after_n < before_n:
        report["verdict"] = "EXEC_PROGRESS"
    elif verified > 0:
        report["verdict"] = "EXEC_VERIFIED_NO_UNIQUE_DROP"
    elif failed > 0:
        report["verdict"] = "EXEC_FAILED_WRITES"
    else:
        report["verdict"] = "EXEC_NO_VERIFY"
    save(f"STATUS-{stamp}.json", report)
    print(json.dumps({"STATUS": report["verdict"], "delta": report["delta"], "jobId": job_id}, indent=2))
    return 0 if verified > 0 else 9


if __name__ == "__main__":
    sys.exit(main())
