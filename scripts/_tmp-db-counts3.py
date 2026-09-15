#!/usr/bin/env python3
import json
import subprocess

# Actual table names from pg_tables (mixed Prisma/SQL conventions)
QUERIES = [
    ("users", 'SELECT count(*) FROM users'),
    ("employees", 'SELECT count(*) FROM employees'),
    ("devices_active", 'SELECT count(*) FROM "Device" WHERE "isDeleted"=false'),
    ("devices_all", 'SELECT count(*) FROM "Device"'),
    ("device_users", 'SELECT count(*) FROM device_users'),
    ("device_events", 'SELECT count(*) FROM device_events'),
    ("attendances", 'SELECT count(*) FROM attendances'),
    ("departments", 'SELECT count(*) FROM departments'),
    ("persons", 'SELECT count(*) FROM "Person"'),
    ("applicants", 'SELECT count(*) FROM applicants'),
    ("timesheets", 'SELECT count(*) FROM timesheets'),
    ("timesheet_lines", 'SELECT count(*) FROM timesheet_lines'),
    ("documents", 'SELECT count(*) FROM documents'),
    ("organizations", 'SELECT count(*) FROM organizations'),
]


def q(ns: str, sql: str) -> int | None:
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
        "-c",
        sql,
    ]
    p = subprocess.run(cmd, text=True, capture_output=True, timeout=90)
    out = (p.stdout or "").strip()
    if p.returncode == 0 and out.isdigit():
        return int(out)
    return None


def main():
    report = {}
    for ns in ("dev", "uat", "prod"):
        counts = {}
        for key, sql in QUERIES:
            counts[key] = q(ns, sql)
        report[ns] = counts
        print(ns, json.dumps(counts))
    open("/tmp/db-counts3.json", "w").write(json.dumps(report, indent=2))
    print("WROTE /tmp/db-counts3.json")


if __name__ == "__main__":
    main()
