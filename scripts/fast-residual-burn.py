#!/usr/bin/env python3
"""
Fast residual burn for Project Truth merge/recovery.

Principles:
  - ONE merge/plan per wave (reuse for review + execute — no double inventory)
  - Fingerprint recovery job (max 1 active) then merge-users with auto choices
  - Prefer scoped residual; do not re-plan mid-job

Usage on VM:
  python3 scripts/fast-residual-burn.py
  HRIS_API=http://127.0.0.1:3101 python3 /tmp/fast-residual-burn.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

API = os.environ.get("HRIS_API", "http://127.0.0.1:3101")
OUT = os.environ.get("OUT_DIR", "/tmp/fast-residual-burn")
DEVICES = [
    "cmrht5s2w00ei7zgsre8y3o5n",  # A
    "cmpxw13hx002h7zwso7dyedrn",  # B
    "cmripjwkw00ffl0013lfxcbxw",  # D
    "cmriu5ab102goi001x9o7nfct",  # E
    "cmrim1zop05ik7zp4zgm2sm4k",  # F
]
MAX_WAVES = int(os.environ.get("MAX_WAVES", "6"))
# Residual default: 20 (stable). Override via PROJECT_TRUTH_RECOVERY_MAX_VERIFIED_WRITES.
MAX_VERIFIED_WRITES = int(
    os.environ.get("PROJECT_TRUTH_RECOVERY_MAX_VERIFIED_WRITES")
    or os.environ.get("MAX_VERIFIED_WRITES")
    or "20"
)
os.makedirs(OUT, exist_ok=True)


def http(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 900) -> tuple[int, Any]:
    url = f"{API}{path}"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {"_raw": raw[:2000]}
        except Exception:
            return e.code, {"_raw": raw[:2000]}
    except Exception as e:
        return 0, {"error": str(e)}


def dig(d: Any, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return default if cur is None else cur


def save(name: str, obj: Any):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, default=str)
    return path


def login() -> str:
    code, body = http(
        "POST",
        "/api/auth/login",
        body={"email": "admin@bandai.local", "password": "password123", "appCode": "hris"},
        timeout=30,
    )
    tok = dig(body, "data", "token") or ""
    if not tok:
        raise SystemExit(f"login failed {code} {body}")
    return tok


def wait_recovery_idle(token: str, max_wait: int = 900) -> None:
    t0 = time.time()
    while time.time() - t0 < max_wait:
        code, body = http(
            "GET",
            "/api/device/hikvision/sdk-users/merge/recovery/jobs?limit=5",
            token=token,
            timeout=60,
        )
        jobs = dig(body, "data", "jobs") or []
        active = [j for j in jobs if j.get("status") in ("pending", "recovering", "retrying")]
        if not active:
            return
        j = active[0]
        c = j.get("counters") or {}
        print(
            f"  wait recovery {j.get('id')} {j.get('status')} stage={j.get('currentStage')} v={c.get('verified')} f={c.get('failed')}",
            flush=True,
        )
        time.sleep(8)


def wait_merge_idle(token: str, job_id: str | None, max_wait: int = 1200) -> dict:
    if not job_id:
        return {}
    t0 = time.time()
    last = {}
    while time.time() - t0 < max_wait:
        code, body = http(
            "GET",
            f"/api/device/hikvision/sdk-users/merge/jobs/{job_id}",
            token=token,
            timeout=60,
        )
        data = dig(body, "data") or body or {}
        # shapes vary
        job = dig(data, "job") or dig(data, "progress") or data
        st = str(job.get("status") or dig(data, "status") or "")
        print(f"  wait merge {job_id} status={st}", flush=True)
        last = job if isinstance(job, dict) else {"status": st, "raw": data}
        if st in ("completed", "failed", "cancelled", "succeeded", "done", "needs_attention"):
            return last
        # also try recovery-style if 404
        if code == 404:
            return {"status": "unknown", "http": 404}
        time.sleep(8)
    return last


def richness(record: dict) -> int:
    be = record.get("biometricEvidence") or {}
    fp = be.get("fingerprint") or {}
    face = be.get("face") or {}
    raw = int(fp.get("rawBlobCount") or 0)
    rawf = 1 if face.get("rawBlobPresent") else 0
    nfp = int(fp.get("reportedCount") or (record.get("rawPayload") or {}).get("numOfFP") or 0)
    nface = int(face.get("reportedCount") or (record.get("rawPayload") or {}).get("numOfFace") or 0)
    return raw * 6 + rawf * 4 + nfp * 2 + nface * 2


def build_richest_choices(plan: dict) -> dict:
    choices: dict = {}
    for user in plan.get("users") or []:
        recs = user.get("records") or []
        if not recs:
            continue
        richest = sorted(recs, key=richness, reverse=True)[0]
        rid = str(richest.get("deviceId") or "")
        for c in user.get("conflicts") or []:
            field = c.get("field")
            a = str((c.get("deviceA") or {}).get("id") or "")
            b = str((c.get("deviceB") or {}).get("id") or "")
            if field == "fingerprint" and (richest.get("biometricEvidence") or {}).get("fingerprint", {}).get("status") != "raw_blob_present":
                ch = "KEEP"
            elif field == "face" and (richest.get("biometricEvidence") or {}).get("face", {}).get("status") != "raw_blob_present":
                ch = "KEEP"
            elif a == rid:
                ch = "A"
            elif b == rid:
                ch = "B"
            else:
                ch = "KEEP"
            choices.setdefault(user["key"], {})[field] = ch
    return choices


def summarize_plan(plan: dict, plan_id: str) -> dict:
    users = plan.get("users") or []
    fp = [w for w in (plan.get("credentialWrites") or []) if isinstance(w, dict) and w.get("modality") == "fingerprint"]
    uids = sorted({str(w.get("vendorUserId")) for w in fp if w.get("vendorUserId")}, key=lambda x: int(x) if str(x).isdigit() else 0)
    decision = sum(1 for u in users if u.get("conflicts"))
    missing = sum(1 for u in users if u.get("missingOnDeviceIds"))
    ready = sum(1 for w in fp if w.get("executionEligibility") == "ready_from_raw_blob")
    return {
        "planId": plan_id,
        "unique_fp": len(uids),
        "fp_ids": uids,
        "fp_ready": ready,
        "decision_people": decision,
        "missing_people": missing,
        "plannedWrites": len(plan.get("plannedWrites") or []),
    }


def main() -> int:
    token = login()
    print("logged in", flush=True)
    wave_reports = []

    for wave in range(1, MAX_WAVES + 1):
        print(f"\n===== WAVE {wave} =====", flush=True)
        wait_recovery_idle(token)

        # 1) ONE plan only
        t0 = time.time()
        code, plan_resp = http(
            "POST",
            "/api/device/hikvision/sdk-users/merge/plan",
            token=token,
            body={"deviceIds": DEVICES},
            timeout=900,
        )
        plan_sec = round(time.time() - t0, 1)
        plan = dig(plan_resp, "data", "plan") or dig(plan_resp, "data") or {}
        plan_id = dig(plan, "planId") or dig(plan_resp, "data", "planId") or ""
        if code != 200 or not plan_id:
            print("PLAN_FAIL", code, plan_resp)
            break
        summary = summarize_plan(plan, plan_id)
        summary["plan_sec"] = plan_sec
        print(json.dumps(summary, indent=2), flush=True)
        save(f"wave{wave}-summary.json", summary)

        if summary["unique_fp"] == 0 and summary["missing_people"] == 0 and summary["decision_people"] == 0:
            print("ALL_ZERO", flush=True)
            save("FINAL.json", {"verdict": "ALL_ZERO", "wave": wave, **summary})
            return 0

        # 2) FP recovery if ready (reuse same planId — no replan)
        if summary["fp_ready"] > 0:
            print(f"FP recovery ready={summary['fp_ready']}", flush=True)
            code_r, review = http(
                "POST",
                "/api/device/hikvision/sdk-users/merge/recovery/review",
                token=token,
                body={
                    "planId": plan_id,
                    "deviceIds": DEVICES,
                    "canaryModality": "fingerprint",
                },
                timeout=300,
            )
            scope = dig(review, "data", "scopeHash") or ""
            save(f"wave{wave}-recovery-review.json", {"http": code_r, "resp": review})
            if scope:
                code_e, exec_resp = http(
                    "POST",
                    "/api/device/hikvision/sdk-users/merge/recovery/jobs",
                    token=token,
                    body={
                        "planId": plan_id,
                        "expectedScopeHash": scope,
                        "deviceIds": DEVICES,
                        "canaryModality": "fingerprint",
                        "maxVerifiedWrites": MAX_VERIFIED_WRITES,
                        "dryRun": False,
                        "execute": True,
                    },
                    timeout=120,
                )
                job_id = (
                    dig(exec_resp, "data", "id")
                    or dig(exec_resp, "data", "jobId")
                    or dig(exec_resp, "data", "job", "id")
                    or ""
                )
                print(f"recovery job={job_id} http={code_e} msg={dig(exec_resp, 'message')}", flush=True)
                save(f"wave{wave}-recovery-start.json", exec_resp)
                if job_id:
                    # poll
                    t1 = time.time()
                    while time.time() - t1 < 1200:
                        _, jobb = http(
                            "GET",
                            f"/api/device/hikvision/sdk-users/merge/recovery/jobs/{job_id}",
                            token=token,
                            timeout=60,
                        )
                        job = dig(jobb, "data", "job") or dig(jobb, "data") or {}
                        c = job.get("counters") or {}
                        st = str(job.get("status") or "")
                        print(
                            f"  recovery poll {st} stage={job.get('currentStage')} v={c.get('verified')} f={c.get('failed')}",
                            flush=True,
                        )
                        if st in (
                            "completed",
                            "failed",
                            "cancelled",
                            "succeeded",
                            "done",
                            "needs_attention",
                        ):
                            summary["recovery"] = {
                                "jobId": job_id,
                                "status": st,
                                "verified": c.get("verified"),
                                "failed": c.get("failed"),
                                "elapsed_sec": round(time.time() - t1, 1),
                            }
                            break
                        time.sleep(8)

        # 3) Replan once after recovery for merge-users (needed: plan may have changed)
        wait_recovery_idle(token)
        t0 = time.time()
        code, plan_resp2 = http(
            "POST",
            "/api/device/hikvision/sdk-users/merge/plan",
            token=token,
            body={"deviceIds": DEVICES},
            timeout=900,
        )
        plan2 = dig(plan_resp2, "data", "plan") or dig(plan_resp2, "data") or {}
        plan_id2 = dig(plan2, "planId") or dig(plan_resp2, "data", "planId") or ""
        summary2 = summarize_plan(plan2, plan_id2)
        summary2["plan_sec"] = round(time.time() - t0, 1)
        print("after recovery", json.dumps(summary2), flush=True)
        save(f"wave{wave}-after-recovery.json", summary2)

        if summary2["missing_people"] > 0 or summary2["decision_people"] > 0:
            choices = build_richest_choices(plan2)
            selected = [
                u["key"]
                for u in (plan2.get("users") or [])
                if u.get("missingOnDeviceIds") or u.get("conflicts")
            ]
            print(
                f"merge-users decisions={summary2['decision_people']} missing={summary2['missing_people']} selected={len(selected)} choices={sum(len(v) for v in choices.values())}",
                flush=True,
            )
            code_mr, mreview = http(
                "POST",
                "/api/device/hikvision/sdk-users/merge/review",
                token=token,
                body={
                    "planId": plan_id2,
                    "deviceIds": DEVICES,
                    "mode": "users",
                    "choices": choices,
                    "selectedUserKeys": selected,
                    "autoResolveDecisions": True,
                },
                timeout=300,
            )
            mscope = dig(mreview, "data", "scopeHash") or ""
            save(f"wave{wave}-merge-review.json", {"http": code_mr, "resp": mreview})
            print(f"merge review http={code_mr} scope_len={len(mscope)} msg={dig(mreview, 'message')}", flush=True)
            if mscope:
                code_mj, mjob = http(
                    "POST",
                    "/api/device/hikvision/sdk-users/merge/jobs",
                    token=token,
                    body={
                        "planId": plan_id2,
                        "deviceIds": DEVICES,
                        "mode": "users",
                        "choices": choices,
                        "selectedUserKeys": selected,
                        "expectedScopeHash": mscope,
                        "includeFingerprints": True,
                        "includeFaceRecognition": True,
                        "autoResolveDecisions": True,
                        "execute": True,
                    },
                    timeout=180,
                )
                mid = (
                    dig(mjob, "data", "jobId")
                    or dig(mjob, "data", "id")
                    or dig(mjob, "data", "progress", "jobId")
                    or ""
                )
                print(f"merge job={mid} http={code_mj} msg={dig(mjob, 'message')}", flush=True)
                save(f"wave{wave}-merge-start.json", mjob)
                if mid:
                    last = wait_merge_idle(token, mid)
                    summary2["merge"] = {"jobId": mid, "last": last}
                elif code_mj in (200, 201, 202):
                    # maybe sync apply returned progress inline
                    summary2["merge"] = dig(mjob, "data") or mjob

        wave_reports.append({"wave": wave, "before": summary, "after": summary2})
        save("progress.json", wave_reports)

        if (
            summary2["unique_fp"] == 0
            and summary2["missing_people"] == 0
            and summary2["decision_people"] == 0
        ):
            print("ALL_ZERO", flush=True)
            save("FINAL.json", {"verdict": "ALL_ZERO", "waves": wave_reports})
            return 0

        # stop if no movement
        if wave > 1:
            prev = wave_reports[-2]["after"]
            if (
                prev.get("unique_fp") == summary2["unique_fp"]
                and prev.get("decision_people") == summary2["decision_people"]
                and prev.get("missing_people") == summary2["missing_people"]
                and summary2.get("fp_ready", 0) == 0
            ):
                print("NO_MOVEMENT stop", flush=True)
                break

    save("FINAL.json", {"verdict": "PARTIAL", "waves": wave_reports})
    print("DONE", json.dumps(wave_reports[-1] if wave_reports else {}, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
