#!/usr/bin/env python3
"""Auto-resolve name+date decisions (longer name, later dates) and start users merge job."""
import json
import time
import urllib.request
from datetime import datetime

DEVICES = [
    "cmrht5s2w00ei7zgsre8y3o5n",
    "cmpxw13hx002h7zwso7dyedrn",
    "cmripjwkw00ffl0013lfxcbxw",
    "cmriu5ab102goi001x9o7nfct",
    "cmrim1zop05ik7zp4zgm2sm4k",
]


def http(api, method, path, token=None, body=None, timeout=300):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(api + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except Exception as e:
        code = getattr(e, "code", 0)
        raw = ""
        if hasattr(e, "read"):
            try:
                raw = e.read().decode()[:4000]
            except Exception:
                raw = str(e)
        try:
            return code, json.loads(raw)
        except Exception:
            return code, {"_raw": raw or str(e)}


def date_ms(v):
    if not v:
        return 0
    try:
        s = str(v).replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    except Exception:
        return 0


def pick_choices(users):
    choices = {}
    rows = []
    for u in users:
        confs = u.get("conflicts") or []
        if not confs:
            continue
        ch = {}
        for c in confs:
            f = c.get("field")
            a = c.get("deviceA") or {}
            b = c.get("deviceB") or {}
            if f in ("validFrom", "validTo"):
                ch[f] = "B" if date_ms(b.get("value")) > date_ms(a.get("value")) else "A"
            elif f == "displayName":
                la = len(str(a.get("value") or "").strip())
                lb = len(str(b.get("value") or "").strip())
                ch[f] = "B" if lb > la else "A"
            else:
                ch[f] = "A"
        choices[u["key"]] = ch
        name_vals = []
        date_vals = {}
        for c in confs:
            f = c.get("field")
            a = (c.get("deviceA") or {}).get("value")
            b = (c.get("deviceB") or {}).get("value")
            if f == "displayName":
                name_vals = [a, b]
            if f in ("validFrom", "validTo"):
                date_vals[f] = {"A": a, "B": b, "pick": ch.get(f)}
        rows.append(
            {
                "key": u["key"],
                "id": (u.get("vendorUserIds") or [""])[0],
                "fields": [c.get("field") for c in confs],
                "choices": ch,
                "name_vals": name_vals,
                "date_vals": date_vals,
            }
        )
    return choices, rows


def main():
    api = None
    login = None
    for base in ("http://127.0.0.1:3101", "http://127.0.0.1:3001"):
        code, login = http(
            base,
            "POST",
            "/api/auth/login",
            body={
                "email": "admin@bandai.local",
                "password": "password123",
                "appCode": "bnpi-pats",
            },
        )
        print("login", base, code)
        if code in (200, 201) and isinstance(login, dict) and (login.get("data") or {}).get("token"):
            api = base
            break
    if not api:
        raise SystemExit(f"login failed: {login}")

    tok = login["data"]["token"]
    code, plan_resp = http(
        api,
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        token=tok,
        body={"deviceIds": DEVICES},
        timeout=300,
    )
    print("plan_status", code)
    plan = (plan_resp.get("data") or {}).get("plan") or plan_resp.get("data") or {}
    plan_id = plan.get("planId") or (plan_resp.get("data") or {}).get("planId")
    users = plan.get("users") or []
    choices, rows = pick_choices(users)
    print(
        json.dumps(
            {
                "api": api,
                "planId": plan_id,
                "decision_people_before": len(rows),
                "counts": plan.get("counts"),
                "rows": rows,
            },
            indent=2,
            default=str,
        )
    )
    out_before = {
        "api": api,
        "planId": plan_id,
        "decision_people_before": len(rows),
        "rows": rows,
        "counts": plan.get("counts"),
    }
    open("/tmp/profile-overlay-burn-before.json", "w").write(
        json.dumps(out_before, indent=2, default=str)
    )
    if not rows:
        print("NO_DECISIONS_LEFT")
        open("/tmp/profile-overlay-burn.json", "w").write(
            json.dumps({"decision_people_before": 0, "status": "already_clean"}, indent=2)
        )
        return

    selected = [r["key"] for r in rows]
    review_body = {
        "planId": plan_id,
        "deviceIds": DEVICES,
        "choices": choices,
        "autoResolveDecisions": True,
        "selectedUserKeys": selected,
    }
    code_r, rev = http(
        api,
        "POST",
        "/api/device/hikvision/sdk-users/merge/review",
        token=tok,
        body=review_body,
        timeout=300,
    )
    data = rev.get("data") or rev
    print("REVIEW", code_r)
    scope = None
    wm = {}
    if isinstance(data, dict):
        scope = (
            data.get("scopeHash")
            or (data.get("scope") or {}).get("scopeHash")
            or data.get("expectedScopeHash")
        )
        wm = data.get("writeMatrix") or {}
        if not scope and isinstance(data.get("review"), dict):
            scope = data["review"].get("scopeHash")
            wm = data["review"].get("writeMatrix") or wm
        print(
            "review_summary",
            {
                "totalWork": data.get("totalWork") or wm.get("totalWork"),
                "dbOverlayWrites": data.get("dbOverlayWrites") or wm.get("dbOverlayWrites"),
                "physicalWrites": data.get("physicalWrites") or wm.get("totalWrites"),
                "scopeHash": scope,
            },
        )

    start_body = {
        "planId": plan_id,
        "choices": choices,
        "autoResolveDecisions": True,
        "selectedUserKeys": selected,
        "mode": "users",
    }
    if scope:
        start_body["expectedScopeHash"] = scope

    code_s, st = http(
        api,
        "POST",
        "/api/device/hikvision/sdk-users/merge/jobs",
        token=tok,
        body=start_body,
        timeout=300,
    )
    print("START", code_s)
    print(json.dumps(st, default=str)[:2500])
    job = (st.get("data") or st).get("job") or (st.get("data") or st)
    job_id = (
        (job or {}).get("id")
        or (job or {}).get("jobId")
        or (st.get("data") or {}).get("jobId")
        or (st.get("data") or {}).get("id")
    )
    print("job_id", job_id)
    final = job
    if job_id:
        for i in range(90):
            time.sleep(2)
            code_j, j = http(
                api,
                "GET",
                f"/api/device/hikvision/sdk-users/merge/jobs/{job_id}",
                token=tok,
                timeout=60,
            )
            jd = (j.get("data") or j).get("job") or (j.get("data") or j)
            status = jd.get("status")
            prog = jd.get("progressPercent") or jd.get("progress")
            print(
                f"poll {i} status={status} progress={prog} "
                f"done={jd.get('completedWrites')}/{jd.get('totalWrites') or jd.get('totalWork')}"
            )
            if status in ("completed", "failed", "cancelled", "error"):
                final = jd
                print(json.dumps({"final": jd}, default=str)[:4000])
                break

    code2, plan2 = http(
        api,
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        token=tok,
        body={"deviceIds": DEVICES},
        timeout=300,
    )
    p2 = (plan2.get("data") or {}).get("plan") or plan2.get("data") or {}
    users2 = p2.get("users") or []
    _c2, rows2 = pick_choices(users2)
    after = {
        "decision_people_after": len(rows2),
        "rows": rows2,
        "counts": p2.get("counts"),
        "job_id": job_id,
        "job_final": final,
    }
    print(json.dumps(after, indent=2, default=str)[:5000])
    open("/tmp/profile-overlay-burn.json", "w").write(
        json.dumps({**out_before, **after}, indent=2, default=str)
    )


if __name__ == "__main__":
    main()
