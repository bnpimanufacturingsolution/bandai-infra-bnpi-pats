#!/usr/bin/env python3
import json, urllib.request

api = "http://127.0.0.1:3101"


def http(m, p, t=None, b=None, timeout=60):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if t:
        h["Authorization"] = f"Bearer {t}"
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(api + p, data=d, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except Exception as e:
        c = getattr(e, "code", 0)
        raw = e.read().decode()[:2000] if hasattr(e, "read") else str(e)
        try:
            return c, json.loads(raw)
        except Exception:
            return c, {"_raw": raw[:500]}


def main():
    c, login = http(
        "POST",
        "/api/auth/login",
        b={"email": "admin@bandai.local", "password": "password123", "appCode": "hris"},
    )
    print("login", c)
    tok = login["data"]["token"]
    queries = [
        "/api/device/events?page=1&limit=10",
        "/api/device/events?page=1&limit=10&dateField=eventTime",
        "/api/device/events?page=1&limit=10&sort=eventTime&order=desc",
        "/api/device/events?page=1&limit=10&dateField=eventTime&sort=eventTime&order=desc",
    ]
    for q in queries:
        code, body = http("GET", q, t=tok)
        data = body.get("data") if isinstance(body, dict) else None
        if not isinstance(data, dict):
            print(q, code, str(body)[:200])
            continue
        ev = data.get("events") or data.get("items") or data.get("rows") or data.get("data") or []
        if isinstance(ev, dict):
            ev = ev.get("events") or []
        pag = data.get("pagination") or {}
        summ = data.get("summary") or {}
        first = ev[0] if isinstance(ev, list) and ev else None
        print(
            json.dumps(
                {
                    "q": q,
                    "code": code,
                    "keys": list(data.keys())[:20],
                    "events_len": len(ev) if isinstance(ev, list) else type(ev).__name__,
                    "pag_total": pag.get("total"),
                    "sum_total": summ.get("total"),
                    "first_keys": list(first.keys())[:15] if isinstance(first, dict) else None,
                    "first_id": (first or {}).get("id") if isinstance(first, dict) else None,
                    "first_time": (first or {}).get("eventTime") if isinstance(first, dict) else None,
                },
                default=str,
            )
        )


if __name__ == "__main__":
    main()
