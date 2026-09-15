#!/usr/bin/env python3
import json
import subprocess

TABLES = [
    ("users", '"User"'),
    ("employees", '"Employee"'),
    ("devices", '"Device"'),
    ("device_users", '"DeviceUser"'),
    ("device_events", '"DeviceEvent"'),
    ("attendances", '"Attendance"'),
    ("departments", '"Department"'),
    ("organizations", '"Organization"'),
]


def kexec_psql(ns: str, sql: str) -> tuple[int, str, str]:
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
    return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()


def main():
    report = {}
    for ns in ("dev", "uat", "prod"):
        rc, tables, err = kexec_psql(
            ns,
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;",
        )
        print("NS", ns, "tables_rc", rc, "n", len(tables.splitlines()) if tables else 0)
        if tables:
            print(" tables", tables.splitlines()[:25])
        counts = {}
        # try each table
        for key, rel in TABLES:
            # devices: exclude deleted if column exists
            if key == "devices":
                sql = f'SELECT count(*) FROM {rel} WHERE "isDeleted"=false;'
            else:
                sql = f"SELECT count(*) FROM {rel};"
            rc, out, err = kexec_psql(ns, sql)
            if rc == 0 and out.isdigit():
                counts[key] = int(out)
            else:
                # try without filter
                rc2, out2, err2 = kexec_psql(ns, f"SELECT count(*) FROM {rel};")
                if rc2 == 0 and out2.isdigit():
                    counts[key] = int(out2)
                else:
                    counts[key] = None
                    counts[f"{key}_err"] = (err or err2)[-120:]
        report[ns] = {"counts": counts, "table_count": len(tables.splitlines()) if tables else 0}
        print(json.dumps(report[ns], indent=2))
    open("/tmp/db-counts2.json", "w").write(json.dumps(report, indent=2))
    print("WROTE /tmp/db-counts2.json")


if __name__ == "__main__":
    main()
