#!/usr/bin/env python3
import json, urllib.request, subprocess
from collections import Counter
from datetime import datetime, timezone

api = "http://127.0.0.1:3101"
DEVICES = [
    "cmrht5s2w00ei7zgsre8y3o5n",
    "cmpxw13hx002h7zwso7dyedrn",
    "cmripjwkw00ffl0013lfxcbxw",
    "cmriu5ab102goi001x9o7nfct",
    "cmrim1zop05ik7zp4zgm2sm4k",
]


def http(m, p, t=None, b=None, timeout=420):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if t:
        h["Authorization"] = "Bearer " + t
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(api + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except Exception as e:
        c = getattr(e, "code", 0)
        raw = e.read().decode()[:800] if hasattr(e, "read") else str(e)
        try:
            return c, json.loads(raw)
        except Exception:
            return c, {"_raw": raw[:300]}


def main():
    c, login = http(
        "POST",
        "/api/auth/login",
        b={"email": "admin@bandai.local", "password": "password123", "appCode": "hris"},
        timeout=25,
    )
    tok = (login.get("data") or {}).get("token") if isinstance(login, dict) else None
    print("login", c, bool(tok))
    if not tok:
        raise SystemExit(1)
    code, body = http(
        "GET",
        "/api/device/hikvision/sdk-users/merge/recovery/jobs",
        t=tok,
        timeout=45,
    )
    jobs = ((body.get("data") or {}).get("jobs") or []) if isinstance(body, dict) else []
    active = 0
    top = []
    for j in jobs[:20]:
        st = str(j.get("status") or "")
        ctr = j.get("counters") or {}
        if st in ("pending", "recovering", "retrying"):
            active += 1
        if len(top) < 3:
            top.append(
                {
                    "id": j.get("id"),
                    "status": st,
                    "stage": j.get("currentStage"),
                    "verified": ctr.get("verified"),
                    "pct": j.get("progressPercent"),
                    "label": j.get("progressLabel"),
                    "rem": ctr.get("physicallyVerifiedRemaining"),
                }
            )
    code, plan = http(
        "POST",
        "/api/device/hikvision/sdk-users/merge/plan",
        t=tok,
        b={"deviceIds": DEVICES},
        timeout=420,
    )
    data = (plan.get("data") or {}) if isinstance(plan, dict) else {}
    p = data.get("plan") or data
    users = p.get("users") or []
    fh = Counter()
    bk = Counter()
    rows = []
    for u in users:
        confs = u.get("conflicts") or []
        if not confs:
            continue
        fields = [x.get("field") for x in confs]
        for f in fields:
            fh[f] += 1
        fs = set(fields)
        hn = "displayName" in fs
        hd = bool(fs & {"validFrom", "validTo"})
        hc = "card" in fs
        if hn and hd:
            bk["PROFILE_NAME+DATES"] += 1
        elif hd and not hn:
            bk["PROFILE_DATES"] += 1
        elif hn and not hd:
            bk["PROFILE_NAME"] += 1
        elif hc and not (hn or hd):
            bk["CARD_COUNT_ONLY"] += 1
        else:
            bk["OTHER"] += 1
        names = list(
            dict.fromkeys(
                [r.get("displayName") for r in (u.get("records") or []) if r.get("displayName")]
            )
        )[:2]
        ab = []
        for conf in confs[:3]:
            a = (conf.get("deviceA") or {}).get("value")
            b = (conf.get("deviceB") or {}).get("value")
            ab.append("%s:%s/%s" % (conf.get("field"), a, b))
        rows.append(
            {
                "id": (u.get("vendorUserIds") or [""])[0],
                "names": names,
                "fields": fields,
                "ab": ab,
            }
        )
    out = {
        "utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "plan_http": code,
        "decision_people": len(rows),
        "buckets": dict(bk),
        "field_hist": dict(fh),
        "rows": rows[:6],
        "counts": p.get("counts"),
        "vs_old_16": "FIXED_card_out_of_decision"
        if fh.get("card", 0) == 0
        else "card_still_in_decision",
        "recovery_active": active,
        "recovery_top3": top,
        "img": subprocess.getoutput(
            "kubectl -n dev get deploy hris-api -o jsonpath={.spec.template.spec.containers[0].image} 2>/dev/null"
        ),
        "pod": subprocess.getoutput(
            "kubectl -n dev get pods -l app.kubernetes.io/name=hris-api --no-headers 2>/dev/null | head -1"
        )[:120],
    }
    print(json.dumps(out, indent=2, default=str))
    open("/tmp/heartbeat-latest.json", "w").write(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
