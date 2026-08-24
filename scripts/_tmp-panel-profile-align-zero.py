#!/usr/bin/env python3
"""
Drive Needs decision → 0 for name/date residual.

1) Build merge plan
2) Auto-pick: longer displayName, later validFrom/validTo
3) For every lagging panel peer: PUT UserInfo/Modify with selected name/dates
4) HRIS profile overlay job (users merge) when totalWork > 0
5) Replan until decision people == 0 (or max rounds)
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

DEVICES = [
    "cmrht5s2w00ei7zgsre8y3o5n",
    "cmpxw13hx002h7zwso7dyedrn",
    "cmripjwkw00ffl0013lfxcbxw",
    "cmriu5ab102goi001x9o7nfct",
    "cmrim1zop05ik7zp4zgm2sm4k",
]
API_CANDIDATES = ("http://127.0.0.1:3101", "http://127.0.0.1:3001")
OUT = "/tmp/panel-profile-align-zero.json"


def http(api: str, method: str, path: str, token: str | None = None, body: Any = None, timeout: int = 300):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(api + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")[:6000]
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw}
    except Exception as e:
        return 0, {"_raw": str(e)}


def date_ms(v: Any) -> int:
    if not v:
        return 0
    try:
        s = str(v).replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    except Exception:
        return 0


def to_hik_time(v: Any) -> str | None:
    if not v:
        return None
    try:
        s = str(v).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        # Device inventory usually returns local/manila-style beginTime.
        # Prefer +08:00 wall if naive/UTC midnight-ish date-only fields.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Format as Asia/Manila-ish fixed +08 without zoneinfo dependency:
        # shift to +08 then drop offset style devices accept.
        # Many panels accept "YYYY-MM-DDTHH:MM:SS".
        # Convert via timestamp.
        epoch = dt.timestamp()
        manila = datetime.fromtimestamp(epoch + 8 * 3600, tz=timezone.utc)
        return manila.strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        return str(v)[:19]


def login() -> tuple[str, str]:
    for api in API_CANDIDATES:
        code, body = http(
            api,
            "POST",
            "/api/auth/login",
            body={"email": "admin@bandai.local", "password": "password123", "appCode": "hris"},
            timeout=30,
        )
        print("login", api, code, flush=True)
        tok = (body.get("data") or {}).get("token") if isinstance(body, dict) else None
        if code in (200, 201) and tok:
            return api, tok
    raise SystemExit("login failed")


def plan(api: str, tok: str):
    code, resp = http(
        api,
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        token=tok,
        body={"deviceIds": DEVICES},
        timeout=420,
    )
    print("plan_http", code, flush=True)
    data = resp.get("data") or {}
    p = data.get("plan") or data
    return code, p, data


def pick_choices(users: list[dict]) -> tuple[dict, list[dict]]:
    choices: dict = {}
    rows: list[dict] = []
    for u in users:
        confs = u.get("conflicts") or []
        if not confs:
            continue
        ch: dict = {}
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
        rows.append(
            {
                "key": u["key"],
                "id": (u.get("vendorUserIds") or [""])[0],
                "fields": [c.get("field") for c in confs],
                "choices": ch,
            }
        )
    return choices, rows


def selected_value(conflict: dict, choice: str):
    side = conflict.get("deviceB") if choice == "B" else conflict.get("deviceA")
    return (side or {}).get("value")


def search_user(api: str, tok: str, device_id: str, employee_no: str) -> dict | None:
    body = {
        "deviceId": device_id,
        "UserInfoSearchCond": {
            "searchID": f"align-{device_id}-{employee_no}-{int(time.time())}",
            "searchResultPosition": 0,
            "maxResults": 5,
            "EmployeeNoList": [{"employeeNo": employee_no}],
        },
    }
    # try query deviceId variants
    for path in (
        f"/api/hikvision/access-control/user-info/search?deviceId={device_id}",
        "/api/hikvision/access-control/user-info/search",
    ):
        code, resp = http(api, "POST", path, token=tok, body=body, timeout=60)
        if code not in (200, 201):
            continue
        data = resp.get("data") or resp
        search = data.get("UserInfoSearch") or data.get("data", {}).get("UserInfoSearch") or data
        users = search.get("UserInfo") if isinstance(search, dict) else None
        if users is None and isinstance(data, dict):
            users = data.get("UserInfo")
        if isinstance(users, dict):
            users = [users]
        if not users:
            continue
        for u in users:
            en = str(u.get("employeeNo") or u.get("employeeNoString") or "").strip()
            if en == str(employee_no).strip() or not en:
                return u
        return users[0]
    return None


def modify_user(api: str, tok: str, device_id: str, user_info: dict) -> tuple[int, Any]:
    body = {"deviceId": device_id, "UserInfo": user_info}
    for path, method in (
        (f"/api/hikvision/access-control/user-info/modify?deviceId={device_id}", "PUT"),
        ("/api/hikvision/access-control/user-info/modify", "PUT"),
        (f"/api/hikvision/access-control/user-info/setup?deviceId={device_id}", "PUT"),
        ("/api/hikvision/access-control/user-info/setup", "PUT"),
    ):
        code, resp = http(api, method, path, token=tok, body=body, timeout=60)
        if code in (200, 201):
            return code, resp
        last = (code, resp)
    return last  # type: ignore


def align_panels(api: str, tok: str, plan: dict, choices: dict) -> list[dict]:
    results = []
    for u in plan.get("users") or []:
        ch = choices.get(u["key"]) or {}
        if not ch:
            continue
        # desired profile values for this identity
        desired_name = None
        desired_from = None
        desired_to = None
        for c in u.get("conflicts") or []:
            f = c.get("field")
            choice = ch.get(f)
            if not choice or choice == "KEEP":
                continue
            val = selected_value(c, choice)
            if f == "displayName":
                desired_name = val
            elif f == "validFrom":
                desired_from = val
            elif f == "validTo":
                desired_to = val
        if desired_name is None and desired_from is None and desired_to is None:
            continue

        for rec in u.get("records") or []:
            device_id = str(rec.get("deviceId") or "").strip()
            employee_no = str(rec.get("vendorUserId") or rec.get("employeeNo") or "").strip()
            if not device_id or not employee_no:
                continue
            needs = False
            if desired_name is not None and str(rec.get("displayName") or "").strip() != str(desired_name or "").strip():
                needs = True
            if desired_from is not None and date_ms(rec.get("validFrom")) != date_ms(desired_from):
                needs = True
            if desired_to is not None and date_ms(rec.get("validTo")) != date_ms(desired_to):
                needs = True
            if not needs:
                results.append(
                    {
                        "user": employee_no,
                        "deviceId": device_id,
                        "status": "already_aligned",
                    }
                )
                continue

            live = search_user(api, tok, device_id, employee_no)
            base = dict(live or {})
            base["employeeNo"] = employee_no
            if desired_name is not None:
                base["name"] = str(desired_name)
            valid = dict(base.get("Valid") or base.get("valid") or {})
            if desired_from is not None:
                t = to_hik_time(desired_from)
                if t:
                    valid["beginTime"] = t
            if desired_to is not None:
                t = to_hik_time(desired_to)
                if t:
                    valid["endTime"] = t
            if valid:
                if "enable" not in valid:
                    valid["enable"] = True
                base["Valid"] = valid
            # strip search-only noise
            for k in list(base.keys()):
                if k.startswith("_"):
                    base.pop(k, None)
            code, resp = modify_user(api, tok, device_id, base)
            results.append(
                {
                    "user": employee_no,
                    "deviceId": device_id,
                    "status": "ok" if code in (200, 201) else "error",
                    "http": code,
                    "name": base.get("name"),
                    "Valid": base.get("Valid"),
                    "resp_excerpt": str(resp)[:400],
                }
            )
            print(
                f"modify user={employee_no} device={device_id[-6:]} http={code} name={base.get('name')}",
                flush=True,
            )
    return results


def run_overlay_job(api: str, tok: str, plan_id: str, choices: dict, selected: list[str]) -> dict:
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
        "review",
        code_r,
        {
            "totalWork": (data or {}).get("totalWork") if isinstance(data, dict) else None,
            "dbOverlayWrites": wm.get("dbOverlayWrites") if isinstance(wm, dict) else None,
            "scopeHash": scope,
        },
        flush=True,
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
    print("start", code_s, str(st)[:500], flush=True)
    job = (st.get("data") or st).get("job") or (st.get("data") or st)
    job_id = (
        (job or {}).get("id")
        or (job or {}).get("jobId")
        or (st.get("data") or {}).get("jobId")
        or (st.get("data") or {}).get("id")
    )
    final = job
    if job_id:
        for i in range(90):
            time.sleep(2)
            _c, j = http(
                api,
                "GET",
                f"/api/device/hikvision/sdk-users/merge/jobs/{job_id}",
                token=tok,
                timeout=60,
            )
            jd = (j.get("data") or j).get("job") or (j.get("data") or j)
            status = jd.get("status")
            print(
                f"job poll {i} status={status} progress={jd.get('progressPercent')}",
                flush=True,
            )
            if status in ("completed", "failed", "cancelled", "error"):
                final = jd
                break
    return {"review_http": code_r, "start_http": code_s, "job_id": job_id, "final": final}


def main():
    api, tok = login()
    evidence: dict[str, Any] = {"api": api, "rounds": []}
    decision_after = None
    for round_i in range(1, 4):
        print(f"=== ROUND {round_i} ===", flush=True)
        code, p, raw = plan(api, tok)
        users = p.get("users") or []
        choices, rows = pick_choices(users)
        decision_before = len(rows)
        print(f"decision_people={decision_before} conflicts={ (p.get('counts') or {}).get('conflicts') }", flush=True)
        round_ev: dict[str, Any] = {
            "round": round_i,
            "planId": p.get("planId") or raw.get("planId"),
            "decision_people": decision_before,
            "rows": rows,
            "counts": p.get("counts"),
        }
        if decision_before == 0:
            decision_after = 0
            evidence["rounds"].append(round_ev)
            print("NEEDS_DECISION_ZERO", flush=True)
            break

        # 1) physical panel align first (source of residual)
        align = align_panels(api, tok, p, choices)
        round_ev["panel_writes"] = align
        ok_writes = sum(1 for r in align if r.get("status") == "ok")
        err_writes = [r for r in align if r.get("status") == "error"]
        print(f"panel ok={ok_writes} err={len(err_writes)}", flush=True)

        # 2) HRIS overlay job
        selected = [r["key"] for r in rows]
        plan_id = p.get("planId") or raw.get("planId")
        if plan_id:
            round_ev["overlay"] = run_overlay_job(api, tok, plan_id, choices, selected)

        # 3) replan
        code2, p2, raw2 = plan(api, tok)
        choices2, rows2 = pick_choices(p2.get("users") or [])
        decision_after = len(rows2)
        round_ev["decision_people_after"] = decision_after
        round_ev["after_rows"] = rows2
        round_ev["after_counts"] = p2.get("counts")
        evidence["rounds"].append(round_ev)
        print(f"after decision_people={decision_after}", flush=True)
        open(OUT, "w").write(json.dumps(evidence, indent=2, default=str))
        if decision_after == 0:
            print("NEEDS_DECISION_ZERO", flush=True)
            break
        if not ok_writes and err_writes:
            print("panel writes failed; stopping", flush=True)
            break

    evidence["decision_people_final"] = decision_after
    open(OUT, "w").write(json.dumps(evidence, indent=2, default=str))
    print(json.dumps({"decision_people_final": decision_after, "out": OUT}, indent=2), flush=True)
    if decision_after != 0:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
