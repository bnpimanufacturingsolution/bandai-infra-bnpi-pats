#!/usr/bin/env python3
"""
Project Truth — K3s Hikvision callback outbox (SQLite).

Architecture:
  Host SDK listener / K3s watcher
    → POST /api/hikvision/callback  (this service, drop-in)
    → SQLite outbox (indexed, durable on PVC/hostPath)
    → drain worker POST → bnpi-pats-api /api/hikvision/callback
    → Postgres device_events (product truth)

Env:
  PORT                 default 8080
  OUTBOX_DB            default /data/outbox.db
  DRAIN_CALLBACK_URL   default http://bnpi-pats-api:3001/api/hikvision/callback
  DRAIN_INTERVAL_SEC   default 2
  DRAIN_BATCH          default 25
  MAX_ATTEMPTS         default 30
  IMMEDIATE_DRAIN      default 1  (try once synchronously on enqueue)
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Optional
from urllib import error as urlerror
from urllib import request as urlrequest

PORT = int(os.environ.get("PORT", "8080"))
OUTBOX_DB = os.environ.get("OUTBOX_DB", "/data/outbox.db")
DRAIN_CALLBACK_URL = os.environ.get(
    "DRAIN_CALLBACK_URL", "http://bnpi-pats-api:3001/api/hikvision/callback"
).rstrip("/")
if not DRAIN_CALLBACK_URL.endswith("/api/hikvision/callback"):
    # allow base URL
    if "/api/" not in DRAIN_CALLBACK_URL:
        DRAIN_CALLBACK_URL = DRAIN_CALLBACK_URL + "/api/hikvision/callback"
DRAIN_INTERVAL_SEC = float(os.environ.get("DRAIN_INTERVAL_SEC", "2"))
DRAIN_BATCH = int(os.environ.get("DRAIN_BATCH", "25"))
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "30"))
IMMEDIATE_DRAIN = os.environ.get("IMMEDIATE_DRAIN", "1").lower() in (
    "1",
    "true",
    "yes",
)

_db_lock = threading.RLock()
_started_at = time.time()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(OUTBOX_DB, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db() -> None:
    os.makedirs(os.path.dirname(OUTBOX_DB) or ".", exist_ok=True)
    with _db_lock:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS callback_outbox (
                  id TEXT PRIMARY KEY,
                  received_at_ms INTEGER NOT NULL,
                  device_id TEXT,
                  serial_no TEXT,
                  employee_no TEXT,
                  major TEXT,
                  minor TEXT,
                  payload_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  attempts INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT,
                  last_attempt_at_ms INTEGER,
                  done_at_ms INTEGER,
                  source TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_outbox_status_received
                  ON callback_outbox(status, received_at_ms);
                CREATE INDEX IF NOT EXISTS idx_outbox_device
                  ON callback_outbox(device_id, received_at_ms);
                CREATE INDEX IF NOT EXISTS idx_outbox_serial
                  ON callback_outbox(serial_no);
                """
            )
            conn.commit()
        finally:
            conn.close()


def _extract_meta(payload: dict[str, Any]) -> dict[str, Optional[str]]:
    # Support flat and nested shapes from SDK / watcher.
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    acs = {}
    if isinstance(payload.get("AccessControllerEvent"), dict):
        acs = payload["AccessControllerEvent"]
    nested = payload.get("EventNotificationAlert")
    if isinstance(nested, dict) and isinstance(
        nested.get("AccessControllerEvent"), dict
    ):
        acs = nested["AccessControllerEvent"]

    def pick(*keys: str) -> Optional[str]:
        for src in (payload, event, acs):
            if not isinstance(src, dict):
                continue
            for k in keys:
                v = src.get(k)
                if v is not None and str(v).strip() != "":
                    return str(v).strip()
        return None

    return {
        "device_id": pick("deviceId", "sourceDeviceId", "device_id"),
        "serial_no": pick("serialNo", "serial_no", "serialNumber"),
        "employee_no": pick(
            "employeeNo", "employeeNoString", "employee_no", "employeeNoString"
        ),
        "major": pick("major"),
        "minor": pick("minor"),
    }


def enqueue(payload: dict[str, Any], source: str = "http") -> dict[str, Any]:
    meta = _extract_meta(payload)
    # Stable-ish id for idempotent re-enqueue of the same ACS serial on same device.
    serial = meta.get("serial_no") or ""
    device = meta.get("device_id") or ""
    if serial and device:
        row_id = f"{device}:{serial}"
    else:
        row_id = str(uuid.uuid4())

    now = int(time.time() * 1000)
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    with _db_lock:
        conn = _connect()
        try:
            existing = conn.execute(
                "SELECT id, status FROM callback_outbox WHERE id = ?", (row_id,)
            ).fetchone()
            if existing and existing["status"] == "done":
                return {
                    "id": row_id,
                    "status": "done",
                    "deduped": True,
                    "message": "already drained",
                }
            if existing and existing["status"] in ("pending", "in_flight"):
                return {
                    "id": row_id,
                    "status": existing["status"],
                    "deduped": True,
                    "message": "already queued",
                }
            conn.execute(
                """
                INSERT INTO callback_outbox (
                  id, received_at_ms, device_id, serial_no, employee_no,
                  major, minor, payload_json, status, attempts, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
                ON CONFLICT(id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  status = CASE
                    WHEN callback_outbox.status = 'done' THEN 'done'
                    ELSE 'pending'
                  END,
                  device_id = excluded.device_id,
                  serial_no = excluded.serial_no,
                  employee_no = excluded.employee_no,
                  major = excluded.major,
                  minor = excluded.minor
                """,
                (
                    row_id,
                    now,
                    meta.get("device_id"),
                    meta.get("serial_no"),
                    meta.get("employee_no"),
                    meta.get("major"),
                    meta.get("minor"),
                    body,
                    source,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    result: dict[str, Any] = {
        "id": row_id,
        "status": "pending",
        "deduped": False,
        "message": "queued",
    }
    if IMMEDIATE_DRAIN:
        drained = drain_one(row_id)
        result["immediateDrain"] = drained
        if drained.get("ok"):
            result["status"] = "done"
            result["message"] = "queued and drained"
    return result


def _post_callback(payload_json: str) -> tuple[bool, str]:
    data = payload_json.encode("utf-8")
    req = urlrequest.Request(
        DRAIN_CALLBACK_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(len(data)),
            "X-Project-Truth-Outbox": "1",
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if 200 <= resp.status < 300:
                return True, f"http_{resp.status}"
            return False, f"http_{resp.status}:{body[:300]}"
    except urlerror.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            err_body = str(e)
        # 409 conflict / already exists often means durable success for our ledger
        if e.code in (200, 201, 202, 204, 409):
            return True, f"http_{e.code}:{err_body}"
        return False, f"http_{e.code}:{err_body}"
    except Exception as e:
        return False, f"{type(e).__name__}:{e}"


def drain_one(row_id: Optional[str] = None) -> dict[str, Any]:
    now = int(time.time() * 1000)
    with _db_lock:
        conn = _connect()
        try:
            if row_id:
                row = conn.execute(
                    """
                    SELECT * FROM callback_outbox
                    WHERE id = ? AND status IN ('pending', 'in_flight', 'dead')
                    """,
                    (row_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT * FROM callback_outbox
                    WHERE status = 'pending' AND attempts < ?
                    ORDER BY received_at_ms ASC
                    LIMIT 1
                    """,
                    (MAX_ATTEMPTS,),
                ).fetchone()
            if not row:
                return {"ok": True, "drained": False, "reason": "empty"}
            conn.execute(
                """
                UPDATE callback_outbox
                SET status = 'in_flight', attempts = attempts + 1,
                    last_attempt_at_ms = ?
                WHERE id = ?
                """,
                (now, row["id"]),
            )
            conn.commit()
            payload = row["payload_json"]
            rid = row["id"]
            attempts = int(row["attempts"]) + 1
        finally:
            conn.close()

    ok, detail = _post_callback(payload)
    with _db_lock:
        conn = _connect()
        try:
            if ok:
                conn.execute(
                    """
                    UPDATE callback_outbox
                    SET status = 'done', done_at_ms = ?, last_error = NULL
                    WHERE id = ?
                    """,
                    (int(time.time() * 1000), rid),
                )
            else:
                status = "dead" if attempts >= MAX_ATTEMPTS else "pending"
                conn.execute(
                    """
                    UPDATE callback_outbox
                    SET status = ?, last_error = ?
                    WHERE id = ?
                    """,
                    (status, detail[:1000], rid),
                )
            conn.commit()
        finally:
            conn.close()
    return {"ok": ok, "drained": True, "id": rid, "detail": detail, "attempts": attempts}


def drain_batch(limit: int = DRAIN_BATCH) -> dict[str, Any]:
    results = []
    for _ in range(limit):
        r = drain_one()
        if not r.get("drained"):
            break
        results.append(r)
    return {
        "processed": len(results),
        "ok": sum(1 for r in results if r.get("ok")),
        "failed": sum(1 for r in results if r.get("drained") and not r.get("ok")),
    }


def stats() -> dict[str, Any]:
    with _db_lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT status, COUNT(*) AS c FROM callback_outbox GROUP BY status
                """
            ).fetchall()
            by_status = {r["status"]: r["c"] for r in rows}
            oldest = conn.execute(
                """
                SELECT id, received_at_ms, attempts, last_error
                FROM callback_outbox
                WHERE status = 'pending'
                ORDER BY received_at_ms ASC
                LIMIT 1
                """
            ).fetchone()
            recent = conn.execute(
                """
                SELECT id, status, device_id, serial_no, employee_no, major, minor,
                       received_at_ms, attempts, last_error
                FROM callback_outbox
                ORDER BY received_at_ms DESC
                LIMIT 10
                """
            ).fetchall()
        finally:
            conn.close()
    oldest_age_ms = None
    if oldest:
        oldest_age_ms = int(time.time() * 1000) - int(oldest["received_at_ms"])
    return {
        "byStatus": by_status,
        "pending": by_status.get("pending", 0),
        "in_flight": by_status.get("in_flight", 0),
        "done": by_status.get("done", 0),
        "dead": by_status.get("dead", 0),
        "oldestPendingAgeMs": oldest_age_ms,
        "oldestPending": dict(oldest) if oldest else None,
        "recent": [dict(r) for r in recent],
        "drainCallbackUrl": DRAIN_CALLBACK_URL,
        "dbPath": OUTBOX_DB,
        "uptimeSec": int(time.time() - _started_at),
    }


def drain_loop() -> None:
    while True:
        try:
            drain_batch()
        except Exception:
            traceback.print_exc()
        time.sleep(DRAIN_INTERVAL_SEC)


class Handler(BaseHTTPRequestHandler):
    server_version = "ProjectTruthCallbackOutbox/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[outbox] {self.address_string()} {fmt % args}")

    def _send(self, code: int, obj: Any) -> None:
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> Any:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/health", "/healthz"):
            self._send(
                200,
                {
                    "status": "healthy",
                    "service": "bnpi-pats-callback-outbox",
                    "pending": stats().get("pending"),
                },
            )
            return
        if path in ("/status", "/api/outbox/status"):
            self._send(200, {"status": "success", "data": stats()})
            return
        self._send(404, {"status": "error", "message": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        try:
            body = self._read_json()
        except Exception as e:
            self._send(400, {"status": "error", "message": f"invalid json: {e}"})
            return

        # Drop-in path used by C++ listener and watcher
        if path in (
            "/api/hikvision/callback",
            "/enqueue",
            "/api/outbox/enqueue",
        ):
            if not isinstance(body, dict):
                self._send(400, {"status": "error", "message": "body must be object"})
                return
            try:
                result = enqueue(body, source=path)
                # Mimic API-ish success so producers treat enqueue as accepted.
                code = 200 if result.get("status") in ("pending", "done") else 202
                self._send(
                    code,
                    {
                        "status": "success",
                        "message": "Callback accepted by outbox",
                        "data": result,
                        "outbox": True,
                    },
                )
            except Exception as e:
                traceback.print_exc()
                self._send(500, {"status": "error", "message": str(e)})
            return

        if path in ("/drain", "/api/outbox/drain"):
            self._send(200, {"status": "success", "data": drain_batch()})
            return

        self._send(404, {"status": "error", "message": "not found"})


def main() -> None:
    init_db()
    print(
        json.dumps(
            {
                "event": "callback_outbox_start",
                "port": PORT,
                "db": OUTBOX_DB,
                "drainUrl": DRAIN_CALLBACK_URL,
            }
        ),
        flush=True,
    )
    t = threading.Thread(target=drain_loop, name="outbox-drain", daemon=True)
    t.start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
