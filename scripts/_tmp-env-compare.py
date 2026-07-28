#!/usr/bin/env python3
"""Compare DEV / UAT / PROD resource allocations and business counts on Project Truth K3s."""
from __future__ import annotations

import base64
import json
import subprocess
import urllib.request
from datetime import datetime, timezone

NAMESPACES = ("dev", "uat", "prod")

# Prisma Postgres typically uses quoted PascalCase model tables.
COUNT_SQL_PASCAL = """
SELECT 'users' AS t, count(*)::text AS c FROM "User"
UNION ALL SELECT 'employees', count(*)::text FROM "Employee"
UNION ALL SELECT 'devices', count(*)::text FROM "Device" WHERE "isDeleted" = false
UNION ALL SELECT 'device_users', count(*)::text FROM "DeviceUser"
UNION ALL SELECT 'device_events', count(*)::text FROM "DeviceEvent"
UNION ALL SELECT 'attendances', count(*)::text FROM "Attendance"
UNION ALL SELECT 'departments', count(*)::text FROM "Department"
UNION ALL SELECT 'organizations', count(*)::text FROM "Organization";
"""

COUNT_SQL_SNAKE = """
SELECT 'users' AS t, count(*)::text AS c FROM users
UNION ALL SELECT 'employees', count(*)::text FROM employees
UNION ALL SELECT 'devices', count(*)::text FROM devices
UNION ALL SELECT 'device_users', count(*)::text FROM device_users
UNION ALL SELECT 'device_events', count(*)::text FROM device_events
UNION ALL SELECT 'attendances', count(*)::text FROM attendances
UNION ALL SELECT 'departments', count(*)::text FROM departments;
"""


def sh(cmd: str, timeout: int = 180) -> str:
    try:
        return subprocess.check_output(
            cmd, shell=True, text=True, stderr=subprocess.STDOUT, timeout=timeout
        )
    except subprocess.CalledProcessError as e:
        return e.output or f"ERR:{e}"
    except Exception as e:
        return f"ERR:{e}"


def http(method: str, url: str, token: str | None = None, body=None, timeout: int = 30):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except Exception as e:
        code = getattr(e, "code", 0)
        raw = e.read().decode()[:800] if hasattr(e, "read") else str(e)
        try:
            return code, json.loads(raw)
        except Exception:
            return code, {"_raw": raw[:400]}


def parse_counts(raw: str) -> dict:
    out = {}
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line or "ERR" in line or "error" in line.lower():
            continue
        if "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
        elif "," in line:
            parts = [p.strip() for p in line.split(",") if p.strip()]
        else:
            parts = line.split()
        if len(parts) >= 2 and parts[-1].isdigit():
            out[parts[0]] = int(parts[-1])
    return out


def mem_to_mi(s: str | None) -> str | None:
    if not s:
        return None
    s = str(s)
    try:
        if s.endswith("Ki"):
            return f"{int(s[:-2]) // 1024}Mi"
        if s.endswith("Mi"):
            return s
        if s.endswith("Gi"):
            return f"{int(float(s[:-2]) * 1024)}Mi"
        if s.isdigit():
            return f"{int(s) // (1024 * 1024)}Mi"
    except Exception:
        return s
    return s


def find_postgres_pod(ns: str) -> str:
    pod = sh(
        f"kubectl -n {ns} get pods -o jsonpath='{{.items[0].metadata.name}}' "
        f"-l app.kubernetes.io/name=hris-postgres 2>/dev/null"
    ).strip().strip("'")
    if pod and not pod.startswith("ERR") and pod != "":
        return pod
    for line in sh(f"kubectl -n {ns} get pods --no-headers 2>/dev/null").splitlines():
        if "postgres" in line.lower() and "Running" in line:
            return line.split()[0]
    return ""


def db_counts_for(ns: str, pod: str) -> dict:
    env = sh(
        f"kubectl -n {ns} exec {pod} -- printenv 2>/dev/null | egrep 'POSTGRES|DATABASE' | sort"
    )
    # Prefer official env vars inside official postgres image / bitnami-style
    attempts = []
    for sql in (COUNT_SQL_PASCAL, COUNT_SQL_SNAKE):
        b64 = base64.b64encode(sql.encode()).decode()
        for shell in (
            f'echo {b64} | base64 -d | PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F"|"',
            f'echo {b64} | base64 -d | PGPASSWORD="$POSTGRES_PASSWORD" psql -U postgres -d "$POSTGRES_DB" -t -A -F"|"',
            f'echo {b64} | base64 -d | psql -U postgres -d hris -t -A -F"|"',
            f'echo {b64} | base64 -d | psql -U hris -d hris -t -A -F"|"',
        ):
            raw = sh(
                f"kubectl -n {ns} exec {pod} -- sh -c {json.dumps(shell)}",
                timeout=120,
            )
            attempts.append(raw[:300])
            parsed = parse_counts(raw)
            if parsed.get("users") is not None or parsed.get("employees") is not None:
                return {
                    "pod": pod,
                    "env": env[:1000],
                    "counts": parsed,
                    "ok": True,
                }
    # list public tables as fallback truth
    list_sql = "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1 LIMIT 40;"
    b64 = base64.b64encode(list_sql.encode()).decode()
    tables = sh(
        f"kubectl -n {ns} exec {pod} -- sh -c {json.dumps(f'echo {b64} | base64 -d | PGPASSWORD=\"$POSTGRES_PASSWORD\" psql -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -t -A')}",
        timeout=60,
    )
    return {
        "pod": pod,
        "env": env[:1000],
        "counts": {},
        "ok": False,
        "tables_sample": tables[:800],
        "attempts_tail": attempts[-3:],
    }


def main():
    report = {
        "utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "nodes": [],
        "namespaces": {},
        "db_counts": {},
        "health": {},
        "notes": [],
    }

    try:
        nj = json.loads(sh("kubectl get nodes -o json"))
        for n in nj.get("items", []):
            cap = n["status"].get("capacity", {})
            alloc = n["status"].get("allocatable", {})
            cond = {c["type"]: c["status"] for c in n["status"].get("conditions", [])}
            report["nodes"].append(
                {
                    "name": n["metadata"]["name"],
                    "cpu_capacity": cap.get("cpu"),
                    "memory_capacity": mem_to_mi(cap.get("memory")),
                    "cpu_allocatable": alloc.get("cpu"),
                    "memory_allocatable": mem_to_mi(alloc.get("memory")),
                    "ready": cond.get("Ready"),
                }
            )
    except Exception as e:
        report["notes"].append(f"nodes: {e}")

    report["top_nodes"] = sh("kubectl top nodes 2>/dev/null")
    report["allocated_resources"] = sh(
        "kubectl describe nodes 2>/dev/null | egrep -A20 'Allocated resources' | head -60"
    )

    for ns in NAMESPACES:
        ns_info = {
            "deployments": [],
            "statefulsets": [],
            "pods": sh(f"kubectl -n {ns} get pods -o wide --no-headers 2>/dev/null"),
            "top_pods": sh(f"kubectl -n {ns} top pods 2>/dev/null"),
            "pvc": sh(f"kubectl -n {ns} get pvc --no-headers 2>/dev/null"),
            "svc": sh(f"kubectl -n {ns} get svc --no-headers 2>/dev/null"),
        }
        for kind, key in (("deploy", "deployments"), ("sts", "statefulsets")):
            try:
                items = json.loads(sh(f"kubectl -n {ns} get {kind} -o json 2>/dev/null")).get(
                    "items", []
                )
            except Exception:
                items = []
            for d in items:
                status = d.get("status") or {}
                containers = []
                for c in (
                    (d.get("spec") or {}).get("template", {}).get("spec", {}).get("containers")
                    or []
                ):
                    res = c.get("resources") or {}
                    containers.append(
                        {
                            "name": c.get("name"),
                            "image": c.get("image"),
                            "requests": res.get("requests") or {},
                            "limits": res.get("limits") or {},
                        }
                    )
                ns_info[key].append(
                    {
                        "name": d["metadata"]["name"],
                        "ready": status.get("readyReplicas", status.get("replicas")),
                        "desired": (d.get("spec") or {}).get("replicas"),
                        "containers": containers,
                    }
                )
        report["namespaces"][ns] = ns_info

        pod = find_postgres_pod(ns)
        if not pod:
            report["db_counts"][ns] = {"error": "no postgres pod"}
        else:
            report["db_counts"][ns] = db_counts_for(ns, pod)

        report["health"][ns] = {
            "hris-api": sh(
                f"kubectl -n {ns} get deploy hris-api -o jsonpath='{{.status.readyReplicas}}/{{.spec.replicas}}' 2>/dev/null"
            ).strip(),
            "hris-app": sh(
                f"kubectl -n {ns} get deploy hris-app -o jsonpath='{{.status.readyReplicas}}/{{.spec.replicas}}' 2>/dev/null"
            ).strip(),
            "hris-postgres": sh(
                f"kubectl -n {ns} get sts hris-postgres -o jsonpath='{{.status.readyReplicas}}/{{.spec.replicas}}' 2>/dev/null"
            ).strip()
            or sh(
                f"kubectl -n {ns} get pods --no-headers 2>/dev/null | awk '/postgres/ {{print $2; exit}}'"
            ).strip(),
        }

    # Optional: login counts via DEV API only if port-forward up
    for label, base in (("dev_local_3101", "http://127.0.0.1:3101"),):
        code, health = http("GET", f"{base}/health", timeout=5)
        report["health"][label] = {"code": code, "body": health}
        if code == 200:
            c, login = http(
                "POST",
                f"{base}/api/auth/login",
                body={
                    "email": "admin@bandai.local",
                    "password": "password123",
                    "appCode": "hris",
                },
            )
            tok = (login.get("data") or {}).get("token") if isinstance(login, dict) else None
            if tok:
                # lightweight admin counts if endpoints exist
                for path, key in (
                    ("/api/user?page=1&limit=1", "users_api"),
                    ("/api/employee?page=1&limit=1", "employees_api"),
                    ("/api/device?page=1&limit=1", "devices_api"),
                ):
                    sc, body = http("GET", base + path, token=tok, timeout=20)
                    pag = {}
                    if isinstance(body, dict):
                        data = body.get("data") or body
                        pag = (
                            data.get("pagination")
                            or (data.get("meta") or {})
                            or body.get("pagination")
                            or {}
                        )
                    report.setdefault("api_counts", {}).setdefault("dev", {})[key] = {
                        "http": sc,
                        "total": pag.get("total"),
                    }

    path = "/tmp/env-compare-report.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    print(json.dumps(report, indent=2, default=str)[:110000])
    print("WROTE", path)


if __name__ == "__main__":
    main()
