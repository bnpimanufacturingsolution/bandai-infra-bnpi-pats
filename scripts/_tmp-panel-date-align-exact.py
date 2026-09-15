#!/usr/bin/env python3
"""
Fix residual validFrom/validTo by copying the winner device's exact
Valid.beginTime/endTime strings (no timezone re-encode). Names already aligned.

Also normalizes calendar-day comparison so plan residual can hit 0.
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
OUT = "/tmp/panel-date-align-exact.json"


def http(api, method, path, token=None, body=None, timeout=300):
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


def date_ms(v):
    if not v:
        return 0
    try:
        s = str(v).replace("Z", "+00:00")
        return int(datetime.fromisoformat(s).timestamp() * 1000)
    except Exception:
        return 0


def day_key(v) -> str:
    """Calendar day in Asia/Manila for residual equality."""
    if not v:
        return ""
    try:
        s = str(v).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # shift to +08
        manila = datetime.fromtimestamp(dt.timestamp() + 8 * 3600, tz=timezone.utc)
        return manila.strftime("%Y-%m-%d")
    except Exception:
        return str(v)[:10]


def login():
    for api in API_CANDIDATES:
        code, body = http(
            api,
            "POST",
            "/api/auth/login",
            body={"email": "admin@bandai.local", "password": "password123", "appCode": "bnpi-pats"},
            timeout=30,
        )
        print("login", api, code, flush=True)
        tok = (body.get("data") or {}).get("token") if isinstance(body, dict) else None
        if code in (200, 201) and tok:
            return api, tok
    raise SystemExit("login failed")


def plan(api, tok):
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
    return data.get("plan") or data, data


def search_user(api, tok, device_id, employee_no):
    body = {
        "deviceId": device_id,
        "UserInfoSearchCond": {
            "searchID": f"exact-{device_id}-{employee_no}-{int(time.time())}",
            "searchResultPosition": 0,
            "maxResults": 5,
            "EmployeeNoList": [{"employeeNo": employee_no}],
        },
    }
    for path in (
        f"/api/hikvision/access-control/user-info/search?deviceId={device_id}",
        "/api/hikvision/access-control/user-info/search",
    ):
        code, resp = http(api, "POST", path, token=tok, body=body, timeout=60)
        if code not in (200, 201):
            continue
        data = resp.get("data") or resp
        search = data.get("UserInfoSearch") or (data.get("data") or {}).get("UserInfoSearch") or data
        users = search.get("UserInfo") if isinstance(search, dict) else None
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


def modify_user(api, tok, device_id, user_info):
    body = {"deviceId": device_id, "UserInfo": user_info}
    last = (0, {})
    for path in (
        f"/api/hikvision/access-control/user-info/modify?deviceId={device_id}",
        "/api/hikvision/access-control/user-info/modify",
        f"/api/hikvision/access-control/user-info/setup?deviceId={device_id}",
        "/api/hikvision/access-control/user-info/setup",
    ):
        code, resp = http(api, "PUT", path, token=tok, body=body, timeout=60)
        last = (code, resp)
        if code in (200, 201):
            return last
    return last


def pick_choice(conflict):
    f = conflict.get("field")
    a = conflict.get("deviceA") or {}
    b = conflict.get("deviceB") or {}
    if f in ("validFrom", "validTo"):
        return "B" if date_ms(b.get("value")) > date_ms(a.get("value")) else "A"
    if f == "displayName":
        la = len(str(a.get("value") or "").strip())
        lb = len(str(b.get("value") or "").strip())
        return "B" if lb > la else "A"
    return "A"


def extract_valid_strings(user_info: dict | None):
    if not user_info:
        return None, None
    valid = user_info.get("Valid") or user_info.get("valid") or {}
    return valid.get("beginTime"), valid.get("endTime")


def decision_rows(plan_obj):
    rows = []
    for u in plan_obj.get("users") or []:
        confs = u.get("conflicts") or []
        if confs:
            rows.append(
                {
                    "key": u["key"],
                    "id": (u.get("vendorUserIds") or [""])[0],
                    "fields": [c.get("field") for c in confs],
                    "details": [
                        {
                            "field": c.get("field"),
                            "A": (c.get("deviceA") or {}).get("value"),
                            "B": (c.get("deviceB") or {}).get("value"),
                            "A_id": (c.get("deviceA") or {}).get("id"),
                            "B_id": (c.get("deviceB") or {}).get("id"),
                            "A_day": day_key((c.get("deviceA") or {}).get("value")),
                            "B_day": day_key((c.get("deviceB") or {}).get("value")),
                        }
                        for c in confs
                    ],
                }
            )
    return rows


def main():
    api, tok = login()
    evidence = {"api": api, "rounds": []}
    final = None
    for round_i in range(1, 5):
        print(f"=== ROUND {round_i} ===", flush=True)
        p, raw = plan(api, tok)
        rows = decision_rows(p)
        print("decision_people", len(rows), flush=True)
        print(json.dumps(rows, indent=2, default=str)[:4000], flush=True)
        round_ev = {"round": round_i, "before": rows, "writes": []}
        if not rows:
            final = 0
            evidence["rounds"].append(round_ev)
            break

        for u in p.get("users") or []:
            confs = [c for c in (u.get("conflicts") or []) if c.get("field") in ("validFrom", "validTo", "displayName")]
            if not confs:
                continue
            # pick winner device per field; for dates prefer single winner device that has later from+to
            choices = {c.get("field"): pick_choice(c) for c in confs}
            # Resolve winner device for dates: prefer device that has later validFrom
            from_c = next((c for c in confs if c.get("field") == "validFrom"), None)
            to_c = next((c for c in confs if c.get("field") == "validTo"), None)
            name_c = next((c for c in confs if c.get("field") == "displayName"), None)

            winner_device_id = None
            if from_c:
                choice = choices.get("validFrom") or "A"
                winner_device_id = (
                    (from_c.get("deviceB") if choice == "B" else from_c.get("deviceA")) or {}
                ).get("id")
            elif to_c:
                choice = choices.get("validTo") or "A"
                winner_device_id = (
                    (to_c.get("deviceB") if choice == "B" else to_c.get("deviceA")) or {}
                ).get("id")
            elif name_c:
                choice = choices.get("displayName") or "A"
                winner_device_id = (
                    (name_c.get("deviceB") if choice == "B" else name_c.get("deviceA")) or {}
                ).get("id")

            records = u.get("records") or []
            winner_rec = next((r for r in records if str(r.get("deviceId")) == str(winner_device_id)), None)
            if not winner_rec:
                continue
            emp = str(winner_rec.get("vendorUserId") or winner_rec.get("employeeNo") or "").strip()
            winner_live = search_user(api, tok, str(winner_device_id), emp)
            win_begin, win_end = extract_valid_strings(winner_live)
            # fallback from plan values as calendar local midnight / end
            if not win_begin and from_c:
                choice = choices.get("validFrom") or "A"
                val = selected = (
                    (from_c.get("deviceB") if choice == "B" else from_c.get("deviceA")) or {}
                ).get("value")
                d = day_key(val)
                if d:
                    win_begin = f"{d}T00:00:00"
            if not win_end and to_c:
                choice = choices.get("validTo") or "A"
                val = (
                    (to_c.get("deviceB") if choice == "B" else to_c.get("deviceA")) or {}
                ).get("value")
                d = day_key(val)
                if d:
                    win_end = f"{d}T23:59:59"
            win_name = None
            if name_c:
                choice = choices.get("displayName") or "A"
                win_name = (
                    (name_c.get("deviceB") if choice == "B" else name_c.get("deviceA")) or {}
                ).get("value")
            if win_name is None and winner_live:
                win_name = winner_live.get("name")

            print(
                f"user={emp} winner={str(winner_device_id)[-6:]} begin={win_begin} end={win_end} name={win_name}",
                flush=True,
            )

            for rec in records:
                device_id = str(rec.get("deviceId") or "").strip()
                if not device_id:
                    continue
                rec_emp = str(rec.get("vendorUserId") or rec.get("employeeNo") or emp).strip()
                # skip if calendar day already matches for all residual fields
                ok = True
                if from_c and day_key(rec.get("validFrom")) != day_key(
                    (
                        (from_c.get("deviceB") if choices.get("validFrom") == "B" else from_c.get("deviceA"))
                        or {}
                    ).get("value")
                ):
                    ok = False
                if to_c and day_key(rec.get("validTo")) != day_key(
                    (
                        (to_c.get("deviceB") if choices.get("validTo") == "B" else to_c.get("deviceA"))
                        or {}
                    ).get("value")
                ):
                    ok = False
                if name_c and str(rec.get("displayName") or "").strip() != str(win_name or "").strip():
                    ok = False
                if ok and device_id == str(winner_device_id):
                    continue
                if ok:
                    continue

                live = search_user(api, tok, device_id, rec_emp) or {}
                base = dict(live)
                base["employeeNo"] = rec_emp
                if win_name is not None:
                    base["name"] = str(win_name)
                valid = dict(base.get("Valid") or base.get("valid") or {})
                if win_begin:
                    valid["beginTime"] = win_begin
                if win_end:
                    valid["endTime"] = win_end
                if "enable" not in valid:
                    valid["enable"] = True
                base["Valid"] = valid
                for k in list(base.keys()):
                    if str(k).startswith("_"):
                        base.pop(k, None)
                code, resp = modify_user(api, tok, device_id, base)
                item = {
                    "user": rec_emp,
                    "deviceId": device_id,
                    "http": code,
                    "begin": win_begin,
                    "end": win_end,
                    "name": base.get("name"),
                    "resp": str(resp)[:200],
                }
                round_ev["writes"].append(item)
                print(f"  write device=...{device_id[-6:]} http={code} begin={win_begin} end={win_end}", flush=True)
                time.sleep(0.2)

        # small settle
        time.sleep(2)
        p2, _ = plan(api, tok)
        rows2 = decision_rows(p2)
        round_ev["after"] = rows2
        final = len(rows2)
        evidence["rounds"].append(round_ev)
        open(OUT, "w").write(json.dumps(evidence, indent=2, default=str))
        print("after decision_people", final, flush=True)
        if final == 0:
            break

    evidence["decision_people_final"] = final
    open(OUT, "w").write(json.dumps(evidence, indent=2, default=str))
    print(json.dumps({"decision_people_final": final, "out": OUT}, indent=2), flush=True)
    if final != 0:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
