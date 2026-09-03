from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import ipaddress
import json
import os
import socket
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Iterable
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError


DEFAULT_TARGETS = (
    "ZKTeco Device 10.184.38.9=10.184.38.9:4370",
    "ZKTeco Device 10.184.38.235=10.184.38.235:4370",
    "ZKTeco Device 10.184.38.234=10.184.38.234:4370",
    "ZKTeco Device 10.184.38.10=10.184.38.10:4370",
)

CAPABILITY_REPORT = {
    "runtime": "project-truth-zkteco-linux-pyzk-trial",
    "status": "linux_bridge_runtime",
    "canonicalHrisRuntime": True,
    "proven": [
        "tcp_connectivity",
        "pyzk_import",
        "pyzk_handshake",
        "pyzk_user_read",
        "pyzk_stored_attendance_history_read",
        "read_only_device_metadata",
        "docker_handshake_with_host_network",
        "docker_stored_attendance_history_read_with_host_network",
        "linux_bridge_health_status_api",
        "linux_bridge_sync_api",
        "hris_event_posting_from_bridge_mode",
    ],
    "notProven": [
        "attendance_log_read_parity",
        "realtime_watch_mode",
        "gitops_k3s_managed_runtime",
    ],
    "canonicalPath": "vendor/zkteco-linux PyZK Linux bridge",
}


BRIDGE_RUNTIME = "project-truth-zkteco-linux-pyzk"


class BridgeState:
    def __init__(self) -> None:
        self.started_at = utc_now()
        self.last_sync_at: str | None = None
        self.last_event_at: str | None = None
        self.last_error: str | None = None
        self.configured_devices = 0
        self.connected_devices = 0
        self.events_seen = 0
        self.events_posted = 0
        self.webhook_failed = 0
        self.devices: list[dict[str, Any]] = []
        self.lock = threading.Lock()

    def update(self, **kwargs: Any) -> None:
        with self.lock:
            for key, value in kwargs.items():
                setattr(self, key, value)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "service": "project-truth-zkteco-linux-pyzk-bridge",
                "runtime": BRIDGE_RUNTIME,
                "status": "online" if self.connected_devices else "degraded",
                "startedAt": self.started_at,
                "lastSyncAt": self.last_sync_at,
                "lastEventAt": self.last_event_at,
                "lastError": self.last_error,
                "configuredDevices": self.configured_devices,
                "connectedDevices": self.connected_devices,
                "eventsSeen": self.events_seen,
                "eventsPosted": self.events_posted,
                "webhookFailed": self.webhook_failed,
                "devices": self.devices,
            }


@dataclass(frozen=True)
class Target:
    name: str
    host: str
    port: int


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def parse_target(value: str) -> Target:
    name = value
    address = value
    if "=" in value:
        name, address = value.split("=", 1)
    if ":" not in address:
        raise argparse.ArgumentTypeError(f"target must be name=host:port or host:port: {value}")
    host, port_text = address.rsplit(":", 1)
    try:
        port = int(port_text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port in target: {value}") from exc
    return Target(name=name.strip() or address, host=host.strip(), port=port)


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, sort_keys=True), flush=True)


def tcp_probe(target: Target, timeout: float) -> dict[str, Any]:
    started = time.monotonic()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((target.host, target.port))
        return {
            "ok": True,
            "stage": "tcp",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
        }
    except Exception as exc:  # noqa: BLE001 - probe output should preserve failure type.
        return {
            "ok": False,
            "stage": "tcp",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    finally:
        sock.close()


def safe_call(obj: Any, method_name: str) -> dict[str, Any]:
    method = getattr(obj, method_name, None)
    if method is None:
        return {"supported": False}
    try:
        return {"supported": True, "ok": True, "value": method()}
    except Exception as exc:  # noqa: BLE001 - device support varies by model/firmware.
        return {
            "supported": True,
            "ok": False,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def handshake_probe(target: Target, timeout: float, password: int, force_udp: bool) -> dict[str, Any]:
    started = time.monotonic()
    try:
        from zk import ZK
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "import",
            "target": target.__dict__,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }

    conn = None
    try:
        zk = ZK(
            target.host,
            port=target.port,
            timeout=int(timeout),
            password=password,
            force_udp=force_udp,
            ommit_ping=True,
        )
        conn = zk.connect()
        metadata = {
            "deviceName": safe_call(conn, "get_device_name"),
            "firmwareVersion": safe_call(conn, "get_firmware_version"),
            "serialNumber": safe_call(conn, "get_serialnumber"),
            "platform": safe_call(conn, "get_platform"),
        }
        return {
            "ok": True,
            "stage": "handshake",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "metadata": metadata,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "handshake",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:
                pass


def quick_count_probe(target: Target, timeout: float, password: int, force_udp: bool) -> dict[str, Any]:
    started = time.monotonic()
    try:
        from zk import ZK
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "count",
            "target": target.__dict__,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }

    conn = None
    try:
        zk = ZK(
            target.host,
            port=target.port,
            timeout=int(timeout),
            password=password,
            force_udp=force_udp,
            ommit_ping=True,
        )
        conn = zk.connect()
        connected_at = time.monotonic()
        conn.read_sizes()
        return {
            "ok": True,
            "stage": "count",
            "target": target.__dict__,
            "transport": "udp" if force_udp else "tcp",
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "connectSeconds": round(connected_at - started, 3),
            "readSizesSeconds": round(time.monotonic() - connected_at, 3),
            "counts": {
                "users": getattr(conn, "users", None),
                "fingers": getattr(conn, "fingers", None),
                "records": getattr(conn, "records", None),
                "cards": getattr(conn, "cards", None),
                "faces": getattr(conn, "faces", None),
                "usersCapacity": getattr(conn, "users_cap", None),
                "recordsCapacity": getattr(conn, "rec_cap", None),
                "usersAvailable": getattr(conn, "users_av", None),
                "recordsAvailable": getattr(conn, "rec_av", None),
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "count",
            "target": target.__dict__,
            "transport": "udp" if force_udp else "tcp",
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:
                pass


def cidr_hosts(cidr_values: list[str]) -> list[Target]:
    targets: list[Target] = []
    for cidr in cidr_values:
        network = ipaddress.ip_network(cidr, strict=False)
        for host in network.hosts():
            targets.append(Target(name=str(host), host=str(host), port=4370))
    return targets


def discover_targets(targets: list[Target], args: argparse.Namespace) -> dict[str, Any]:
    started = time.monotonic()
    found: list[dict[str, Any]] = []

    def probe(target: Target) -> dict[str, Any] | None:
        result = quick_count_probe(target, args.timeout, args.password, True)
        if not result.get("ok"):
            return None
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.discover_workers) as executor:
        for result in executor.map(probe, targets):
            if result is not None:
                found.append(result)

    return {
        "event": "discover_finished",
        "timestamp": utc_now(),
        "stage": "discover",
        "ok": True,
        "transport": "udp",
        "cidrs": args.discover_cidr,
        "scannedHosts": len(targets),
        "foundDevices": len(found),
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "devices": found,
    }


def attendance_time(value: Any) -> str | None:
    timestamp = getattr(value, "timestamp", None)
    if timestamp is None:
        return None
    if hasattr(timestamp, "isoformat"):
        return timestamp.isoformat()
    return str(timestamp)


def parse_attendance_datetime(value: Any) -> dt.datetime | None:
    timestamp = getattr(value, "timestamp", value)
    if timestamp is None:
        return None
    if isinstance(timestamp, dt.datetime):
        return timestamp
    try:
        return dt.datetime.fromisoformat(str(timestamp))
    except ValueError:
        return None


def attendance_sort_key(value: Any) -> tuple[str, int]:
    timestamp = attendance_time(value) or ""
    uid = getattr(value, "uid", 0) or 0
    return (timestamp, int(uid))


def filter_attendance_records(
    records: list[Any],
    *,
    since: dt.datetime | None,
    latest: int | None,
) -> list[Any]:
    ordered = sorted(records, key=attendance_sort_key)
    if since is not None:
        ordered = [
            record
            for record in ordered
            if (parse_attendance_datetime(record) or dt.datetime.min) >= since
        ]
    if latest is not None and latest > 0:
        ordered = ordered[-latest:]
    return ordered


def user_name_map(users: list[Any]) -> dict[str, str]:
    output: dict[str, str] = {}
    for user in users:
        user_id = getattr(user, "user_id", None)
        name = getattr(user, "name", None)
        if user_id is not None and name:
            output[str(user_id)] = str(name)
    return output


def build_hris_payload(target: Target, record: Any, names: dict[str, str]) -> dict[str, Any]:
    user_id = str(getattr(record, "user_id", "") or "")
    timestamp = attendance_time(record)
    return {
        "device": {
            "type": "ZKTeco",
            "runtime": BRIDGE_RUNTIME,
            "ip": target.host,
            "port": target.port,
        },
        "attendance": {
            "enrollNumber": user_id,
            "userName": names.get(user_id),
            "timestamp": timestamp,
            "verifyMethodName": str(getattr(record, "status", "")),
            "attState": getattr(record, "punch", None),
            "attStateName": str(getattr(record, "punch", "")),
            "isValid": True,
            "workCode": None,
            "serialNo": getattr(record, "uid", None),
        },
        "eventType": "AttendanceTransaction",
        "bridge": {
            "runtime": BRIDGE_RUNTIME,
            "source": "pyzk",
            "mode": "poll-sync",
        },
    }


def post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    started = time.monotonic()
    try:
        with urllib_request.urlopen(req, timeout=timeout) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            return {
                "ok": 200 <= response.status < 300,
                "statusCode": response.status,
                "elapsedSeconds": round(time.monotonic() - started, 3),
                "body": response_body[:1000],
            }
    except HTTPError as exc:
        return {
            "ok": False,
            "statusCode": exc.code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "error": exc.read().decode("utf-8", errors="replace")[:1000],
        }
    except URLError as exc:
        return {
            "ok": False,
            "statusCode": None,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "error": str(exc.reason),
        }


def summarize_users(users: list[Any], sample_limit: int) -> dict[str, Any]:
    sample = []
    for user in users[:sample_limit]:
        sample.append(
            {
                "uid": getattr(user, "uid", None),
                "userId": getattr(user, "user_id", None),
                "name": getattr(user, "name", None),
                "privilege": getattr(user, "privilege", None),
            }
        )
    return {"count": len(users), "sample": sample}


def summarize_attendance(records: list[Any], sample_limit: int) -> dict[str, Any]:
    ordered = sorted(records, key=lambda item: attendance_time(item) or "")
    sample = []
    for record in ordered[-sample_limit:]:
        sample.append(
            {
                "uid": getattr(record, "uid", None),
                "userId": getattr(record, "user_id", None),
                "timestamp": attendance_time(record),
                "status": getattr(record, "status", None),
                "punch": getattr(record, "punch", None),
            }
        )
    return {
        "count": len(records),
        "firstTimestamp": attendance_time(ordered[0]) if ordered else None,
        "lastTimestamp": attendance_time(ordered[-1]) if ordered else None,
        "latestSample": sample,
    }


def history_probe(target: Target, args: argparse.Namespace) -> dict[str, Any]:
    started = time.monotonic()
    try:
        from zk import ZK
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "import",
            "target": target.__dict__,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }

    conn = None
    try:
        zk = ZK(
            target.host,
            port=target.port,
            timeout=int(args.timeout),
            password=args.password,
            force_udp=args.force_udp,
            ommit_ping=True,
        )
        conn = zk.connect()
        payload: dict[str, Any] = {}
        if args.mode in {"users", "history"}:
            payload["users"] = summarize_users(conn.get_users(), args.sample_limit)
        if args.mode in {"attendance", "history"}:
            payload["attendance"] = summarize_attendance(conn.get_attendance(), args.sample_limit)
        return {
            "ok": True,
            "stage": args.mode,
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            **payload,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": args.mode,
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:
                pass


def sync_target(target: Target, args: argparse.Namespace) -> dict[str, Any]:
    started = time.monotonic()
    try:
        from zk import ZK
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "sync",
            "target": target.__dict__,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }

    since = dt.datetime.fromisoformat(args.since) if args.since else None
    conn = None
    try:
        zk = ZK(
            target.host,
            port=target.port,
            timeout=int(args.timeout),
            password=args.password,
            force_udp=args.force_udp,
            ommit_ping=True,
        )
        conn = zk.connect()
        users = list(conn.get_users() or [])
        names = user_name_map(users)
        all_records = list(conn.get_attendance() or [])
        records = filter_attendance_records(all_records, since=since, latest=args.latest)
        posted = 0
        failed = 0
        post_results = []

        for record in records:
            payload = build_hris_payload(target, record, names)
            if args.dry_run_webhooks:
                result = {"ok": True, "dryRun": True, "statusCode": None}
            else:
                result = post_json(args.webhook_url, payload, args.webhook_timeout)
            if result["ok"]:
                posted += 1
            else:
                failed += 1
            if len(post_results) < args.sample_limit:
                post_results.append(
                    {
                        "employeeNo": payload["attendance"]["enrollNumber"],
                        "timestamp": payload["attendance"]["timestamp"],
                        "serialNo": payload["attendance"]["serialNo"],
                        **result,
                    }
                )

        return {
            "ok": failed == 0,
            "stage": "sync",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "users": {"count": len(users)},
            "attendance": {
                "available": len(all_records),
                "selected": len(records),
                "firstSelectedAt": attendance_time(records[0]) if records else None,
                "lastSelectedAt": attendance_time(records[-1]) if records else None,
            },
            "webhook": {
                "url": args.webhook_url,
                "dryRun": args.dry_run_webhooks,
                "posted": posted,
                "failed": failed,
                "sample": post_results,
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "sync",
            "target": target.__dict__,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:
                pass


def target_matches_device_ip(target: Target, device_ip: str | None) -> bool:
    return not device_ip or target.host.strip() == device_ip.strip()


def filter_targets_for_device(targets: Iterable[Target], device_ip: str | None) -> list[Target]:
    target_list = list(targets)
    filtered = [target for target in target_list if target_matches_device_ip(target, device_ip)]
    return filtered if device_ip else target_list


def summarize_sync_result(result: dict[str, Any]) -> dict[str, Any]:
    attendance = result.get("attendance") or {}
    webhook = result.get("webhook") or {}
    target = result.get("target") or {}
    users = result.get("users") or {}
    selected = int(attendance.get("selected") or 0)
    return {
        "name": target.get("name"),
        "ip": target.get("host"),
        "port": target.get("port"),
        "connected": bool(result.get("ok")),
        "userCount": int(users.get("count") or 0),
        "totalEvents": int(attendance.get("available") or 0),
        "selectedEvents": selected,
        "wouldPost": selected,
        "posted": int(webhook.get("posted") or 0),
        "failed": int(webhook.get("failed") or 0),
        "firstSelectedAt": attendance.get("firstSelectedAt"),
        "lastSelectedAt": attendance.get("lastSelectedAt"),
        **({"lastError": result.get("error")} if result.get("error") else {}),
    }


def run_preview(targets: Iterable[Target], args: argparse.Namespace, device_ip: str | None = None) -> dict[str, Any]:
    target_list = filter_targets_for_device(targets, device_ip)
    devices = []
    failures = 0
    user_count = 0
    total_events = 0
    selected_events = 0

    emit({"event": "preview_started", "timestamp": utc_now(), "targetCount": len(target_list), "deviceIp": device_ip})
    for target in target_list:
        result = sync_target(target, argparse.Namespace(**{**vars(args), "dry_run_webhooks": True}))
        emit(result)
        summary = summarize_sync_result(result)
        devices.append(summary)
        if not result.get("ok"):
            failures += 1
        user_count += int(summary.get("userCount") or 0)
        total_events += int(summary.get("totalEvents") or 0)
        selected_events += int(summary.get("selectedEvents") or 0)

    payload = {
        "service": "project-truth-zkteco-linux-pyzk-bridge",
        "runtime": BRIDGE_RUNTIME,
        "status": "online" if devices and failures == 0 else "degraded",
        "dryRun": True,
        "deviceIp": device_ip,
        "configuredDevices": len(target_list),
        "connectedDevices": len([device for device in devices if device.get("connected")]),
        "userCount": user_count,
        "totalEvents": total_events,
        "selectedEvents": selected_events,
        "devices": devices,
    }
    emit({"event": "preview_finished", "timestamp": utc_now(), "failures": failures, "selectedEvents": selected_events})
    return payload


def run_sync(targets: Iterable[Target], args: argparse.Namespace, state: BridgeState | None = None) -> int:
    target_list = filter_targets_for_device(targets, getattr(args, "device_ip", None))
    failures = 0
    connected = 0
    events_seen = 0
    events_posted = 0
    webhook_failed = 0
    devices = []
    last_event_at = None

    emit({"event": "sync_started", "timestamp": utc_now(), "targetCount": len(target_list)})
    for target in target_list:
        result = sync_target(target, args)
        emit(result)
        attendance = result.get("attendance") or {}
        users = result.get("users") or {}
        webhook = result.get("webhook") or {}
        device_connected = bool(attendance or users) and not result.get("error")
        if device_connected:
            connected += 1
        else:
            failures += 1
        selected = int(attendance.get("selected") or 0)
        posted = int(webhook.get("posted") or 0)
        failed = int(webhook.get("failed") or 0)
        events_seen += selected
        events_posted += posted
        webhook_failed += failed
        last_event_at = attendance.get("lastSelectedAt") or last_event_at
        devices.append(
            {
                "name": target.name,
                "ip": target.host,
                "port": target.port,
                "connected": device_connected,
                "userCount": int(users.get("count") or 0),
                "totalEvents": int(attendance.get("available") or 0),
                "selectedEvents": selected,
                "eventsSeen": selected,
                "eventsPosted": posted,
                "webhookFailed": failed,
                "firstSelectedAt": attendance.get("firstSelectedAt"),
                "lastSelectedAt": attendance.get("lastSelectedAt"),
                "lastEventAt": attendance.get("lastSelectedAt"),
                **({"lastError": result.get("error")} if result.get("error") else {}),
            }
        )

    if state:
        state.update(
            last_sync_at=utc_now(),
            last_event_at=last_event_at,
            last_error=None if failures == 0 else f"{failures} device sync failure(s)",
            configured_devices=len(target_list),
            connected_devices=connected,
            events_seen=events_seen,
            events_posted=events_posted,
            webhook_failed=webhook_failed,
            devices=devices,
        )

    emit(
        {
            "event": "sync_finished",
            "timestamp": utc_now(),
            "failures": failures,
            "eventsSeen": events_seen,
            "eventsPosted": events_posted,
            "webhookFailed": webhook_failed,
        }
    )
    return 1 if failures or webhook_failed else 0


def make_bridge_handler(state: BridgeState, targets: list[Target], args: argparse.Namespace):
    class Handler(BaseHTTPRequestHandler):
        def _write_json(self, status_code: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, sort_keys=True).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _query(self) -> dict[str, list[str]]:
            return parse_qs(urlsplit(self.path).query)

        def _device_ip(self) -> str | None:
            query = self._query()
            value = (query.get("deviceIp") or query.get("device_ip") or [""])[0]
            return value.strip() or None

        def do_GET(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            if path in {"/health", "/status"}:
                self._write_json(200, state.snapshot())
                return
            if path == "/preview":
                payload = run_preview(targets, args, self._device_ip())
                self._write_json(200 if payload["connectedDevices"] else 207, payload)
                return
            self._write_json(404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlsplit(self.path).path
            if path == "/sync":
                sync_args = argparse.Namespace(**{**vars(args), "device_ip": self._device_ip()})
                exit_code = run_sync(targets, sync_args, state)
                self._write_json(202 if exit_code == 0 else 207, state.snapshot())
                return
            self._write_json(404, {"error": "not_found"})

        def log_message(self, format: str, *values: Any) -> None:
            return

    return Handler


def run_bridge(targets: Iterable[Target], args: argparse.Namespace) -> int:
    target_list = list(targets)
    state = BridgeState()
    state.update(configured_devices=len(target_list))
    server = ThreadingHTTPServer((args.status_host, args.status_port), make_bridge_handler(state, target_list, args))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    emit(
        {
            "event": "bridge_started",
            "timestamp": utc_now(),
            "statusUrl": f"http://{args.status_host}:{args.status_port}/status",
            "targetCount": len(target_list),
            "webhookUrl": args.webhook_url,
        }
    )
    try:
        exit_code = run_sync(target_list, args, state)
        if args.once:
            return exit_code
        while True:
            time.sleep(args.poll_seconds)
            exit_code = run_sync(target_list, args, state)
    finally:
        server.shutdown()
        server.server_close()


def run(targets: Iterable[Target], args: argparse.Namespace) -> int:
    if args.mode == "capabilities":
        emit({"event": "capabilities", "timestamp": utc_now(), **CAPABILITY_REPORT})
        return 0
    if args.mode == "discover":
        discover_cidrs = args.discover_cidr or []
        if not discover_cidrs:
            emit(
                {
                    "event": "discover_failed",
                    "timestamp": utc_now(),
                    "ok": False,
                    "error": "--discover-cidr is required for discover mode",
                }
            )
            return 2
        emit({"event": "discover_started", "timestamp": utc_now(), "cidrs": discover_cidrs})
        payload = discover_targets(cidr_hosts(discover_cidrs), args)
        emit(payload)
        return 0 if payload["foundDevices"] else 1
    if args.mode == "preview":
        payload = run_preview(targets, args, args.device_ip)
        emit(payload)
        return 0 if payload["connectedDevices"] else 1
    if args.mode == "sync":
        return run_sync(targets, args)
    if args.mode == "bridge":
        return run_bridge(targets, args)

    failures = 0
    emit({"event": "probe_started", "mode": args.mode, "timestamp": utc_now()})
    for target in targets:
        if args.mode == "count":
            result = quick_count_probe(target, args.timeout, args.password, args.force_udp)
            emit(result)
            if not result["ok"]:
                failures += 1
            continue

        result = tcp_probe(target, args.timeout)
        emit(result)
        if not result["ok"]:
            failures += 1
            if args.mode == "handshake":
                continue
        if args.mode == "handshake":
            result = handshake_probe(target, args.timeout, args.password, args.force_udp)
            emit(result)
            if not result["ok"]:
                failures += 1
        if args.mode in {"users", "attendance", "history"}:
            result = history_probe(target, args)
            emit(result)
            if not result["ok"]:
                failures += 1
    emit({"event": "probe_finished", "mode": args.mode, "timestamp": utc_now(), "failures": failures})
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only ZKTeco Linux connectivity trial.")
    parser.add_argument(
        "--mode",
        choices=(
            "tcp",
            "handshake",
            "count",
            "discover",
            "users",
            "attendance",
            "history",
            "preview",
            "sync",
            "bridge",
            "capabilities",
        ),
        default="tcp",
    )
    parser.add_argument("--target", action="append", type=parse_target, help="name=host:port")
    parser.add_argument("--timeout", type=float, default=5)
    parser.add_argument("--password", type=int, default=0)
    parser.add_argument("--force-udp", action="store_true")
    parser.add_argument("--sample-limit", type=int, default=3)
    parser.add_argument("--webhook-url", default=os.environ.get("ZKTECO_WEBHOOK_URL", ""))
    parser.add_argument("--webhook-timeout", type=float, default=float(os.environ.get("ZKTECO_WEBHOOK_TIMEOUT", "15")))
    parser.add_argument("--dry-run-webhooks", action="store_true")
    parser.add_argument("--latest", type=int, default=int(os.environ.get("ZKTECO_SYNC_LATEST", "1")))
    parser.add_argument("--since", default=os.environ.get("ZKTECO_SYNC_SINCE", ""))
    parser.add_argument("--device-ip", default=os.environ.get("ZKTECO_DEVICE_IP", ""))
    parser.add_argument("--discover-cidr", action="append", default=[])
    parser.add_argument("--discover-workers", type=int, default=int(os.environ.get("ZKTECO_DISCOVER_WORKERS", "64")))
    parser.add_argument("--status-host", default=os.environ.get("ZKTECO_STATUS_HOST", "0.0.0.0"))
    parser.add_argument("--status-port", type=int, default=int(os.environ.get("ZKTECO_STATUS_PORT", "4371")))
    parser.add_argument("--poll-seconds", type=float, default=float(os.environ.get("ZKTECO_POLL_SECONDS", "30")))
    parser.add_argument("--once", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.mode in {"sync", "bridge"} and not args.webhook_url:
        parser.error("--webhook-url or ZKTECO_WEBHOOK_URL is required for sync/bridge mode")
    targets = args.target or [parse_target(value) for value in DEFAULT_TARGETS]
    return run(targets, args)


if __name__ == "__main__":
    sys.exit(main())
