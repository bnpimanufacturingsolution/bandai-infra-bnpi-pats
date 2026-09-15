#!/usr/bin/env python3
import json
import subprocess

SQL = r"""
SELECT 'users' AS t, count(*)::text FROM "User"
UNION ALL SELECT 'employees', count(*)::text FROM "Employee"
UNION ALL SELECT 'devices', count(*)::text FROM "Device" WHERE "isDeleted"=false
UNION ALL SELECT 'device_users', count(*)::text FROM "DeviceUser"
UNION ALL SELECT 'device_events', count(*)::text FROM "DeviceEvent"
UNION ALL SELECT 'attendances', count(*)::text FROM "Attendance"
UNION ALL SELECT 'departments', count(*)::text FROM "Department"
UNION ALL SELECT 'organizations', count(*)::text FROM "Organization";
"""

SQL_SNAKE = r"""
SELECT 'users' AS t, count(*)::text FROM users
UNION ALL SELECT 'employees', count(*)::text FROM employees
UNION ALL SELECT 'devices', count(*)::text FROM devices
UNION ALL SELECT 'device_users', count(*)::text FROM device_users
UNION ALL SELECT 'device_events', count(*)::text FROM device_events
UNION ALL SELECT 'attendances', count(*)::text FROM attendances
UNION ALL SELECT 'departments', count(*)::text FROM departments;
"""


def run(ns: str) -> dict:
    for sql in (SQL, SQL_SNAKE):
        cmd = [
            "kubectl",
            "-n",
            ns,
            "exec",
            "-i",
            "bnpi-pats-postgres-0",
            "--",
            "psql",
            "-U",
            "postgres",
            "-d",
            "bnpi-pats",
            "-t",
            "-A",
            "-F",
            "|",
        ]
        p = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=120)
        out = (p.stdout or "").strip()
        err = (p.stderr or "").strip()
        counts = {}
        for line in out.splitlines():
            line = line.strip()
            if "|" in line:
                k, v = line.split("|", 1)
                if v.isdigit():
                    counts[k] = int(v)
        if counts:
            return {"ns": ns, "ok": True, "counts": counts, "rc": p.returncode}
        last = {"ns": ns, "ok": False, "rc": p.returncode, "stdout": out[:400], "stderr": err[:400]}
    return last


def main():
    result = {}
    for ns in ("dev", "uat", "prod"):
        result[ns] = run(ns)
        print(json.dumps(result[ns], indent=2))
    # node capacity
    node = subprocess.getoutput(
        "kubectl get node -o jsonpath='{.items[0].metadata.name} cpu={.items[0].status.capacity.cpu} mem={.items[0].status.capacity.memory} alloc_cpu={.items[0].status.allocatable.cpu} alloc_mem={.items[0].status.allocatable.memory}' 2>/dev/null"
    )
    print("NODE", node)
    top = subprocess.getoutput("kubectl top nodes 2>/dev/null")
    print("TOP", top)
    open("/tmp/db-counts.json", "w").write(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
