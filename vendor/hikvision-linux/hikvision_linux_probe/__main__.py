from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Iterable

import requests
from requests.auth import HTTPBasicAuth, HTTPDigestAuth


DEFAULT_TARGETS = (
    "Main Entrance Device ISAPI=10.184.37.139:80:http",
    "Main Entrance Device SDK=10.184.37.139:8000:tcp",
)

SYSTEM_TIME_PATH = "/ISAPI/System/time"
ACS_EVENT_PATH = "/ISAPI/AccessControl/AcsEvent?format=json"
ACS_EVENT_TOTAL_NUM_PATH = "/ISAPI/AccessControl/AcsEventTotalNum?format=json"
USER_INFO_COUNT_PATH = "/ISAPI/AccessControl/UserInfo/Count?format=json"
USER_INFO_SEARCH_PATH = "/ISAPI/AccessControl/UserInfo/Search?format=json"


@dataclass(frozen=True)
class Target:
    name: str
    host: str
    port: int
    protocol: str


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def parse_target(value: str) -> Target:
    name = value
    address = value
    if "=" in value:
        name, address = value.split("=", 1)

    parts = address.rsplit(":", 2)
    if len(parts) == 2:
        host, port_text = parts
        protocol = "tcp"
    elif len(parts) == 3:
        host, port_text, protocol = parts
    else:
        raise argparse.ArgumentTypeError(
            f"target must be name=host:port[:protocol] or host:port[:protocol]: {value}"
        )

    try:
        port = int(port_text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port in target: {value}") from exc

    protocol = protocol.strip().lower()
    if protocol not in {"tcp", "http", "https"}:
        raise argparse.ArgumentTypeError(f"protocol must be tcp, http, or https: {value}")

    return Target(
        name=name.strip() or address,
        host=host.strip(),
        port=port,
        protocol=protocol,
    )


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


def build_isapi_url(target: Target, path: str = SYSTEM_TIME_PATH) -> str:
    scheme = target.protocol if target.protocol in {"http", "https"} else "http"
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{scheme}://{target.host}:{target.port}{normalized_path}"


def parse_datetime(value: str | None, default: dt.datetime) -> dt.datetime:
    if not value:
        return default
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    parsed = dt.datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone(dt.timedelta(hours=8)))
    return parsed


def hikvision_time(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec="seconds")


def build_auth(auth_mode: str, username: str | None, password: str | None) -> Any | None:
    if auth_mode == "none":
        return None
    if not username or password is None:
        return None
    if auth_mode == "basic":
        return HTTPBasicAuth(username, password)
    return HTTPDigestAuth(username, password)


def parse_system_time(body: str) -> dict[str, Any]:
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        return {"ok": False, "errorType": type(exc).__name__, "error": str(exc)}

    values: dict[str, str] = {}
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        text = (element.text or "").strip()
        if text:
            values[tag] = text

    return {
        "ok": True,
        "localTime": values.get("localTime"),
        "timeMode": values.get("timeMode"),
        "timeZone": values.get("timeZone"),
    }


def parse_response_body(response: requests.Response) -> dict[str, Any]:
    text = response.text or ""
    if not text:
        return {}
    try:
        return response.json()
    except ValueError:
        try:
            return {"xml": parse_system_time(text)}
        except Exception as exc:  # noqa: BLE001
            return {"raw": text[:1000], "parseError": str(exc)}


def isapi_time_probe(
    target: Target,
    timeout: float,
    username: str | None,
    password: str | None,
    auth_mode: str,
    verify_tls: bool,
) -> dict[str, Any]:
    started = time.monotonic()
    url = build_isapi_url(target)
    try:
        response = requests.get(
            url,
            auth=build_auth(auth_mode, username, password),
            headers={"Accept": "application/xml"},
            timeout=timeout,
            verify=verify_tls,
        )
        parsed = parse_system_time(response.text) if response.ok else None
        return {
            "ok": response.ok,
            "stage": "isapi_time",
            "target": target.__dict__,
            "url": url,
            "statusCode": response.status_code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "metadata": parsed,
        }
    except Exception as exc:  # noqa: BLE001 - probe output should preserve failure type.
        return {
            "ok": False,
            "stage": "isapi_time",
            "target": target.__dict__,
            "url": url,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def build_acs_event_body(args: argparse.Namespace) -> dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc)
    start = parse_datetime(args.start, now - dt.timedelta(minutes=args.lookback_minutes))
    end = parse_datetime(args.end, now + dt.timedelta(minutes=1))
    return {
        "AcsEventCond": {
            "searchID": args.search_id or f"vendor-truth-{int(time.time())}",
            "searchResultPosition": args.position,
            "maxResults": args.limit,
            "startTime": hikvision_time(start),
            "endTime": hikvision_time(end),
            "major": args.major,
            "minor": args.minor,
            "timeReverseOrder": True,
        }
    }


def get_acs_event_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
    acs_event = payload.get("AcsEvent") or payload.get("AcsEventSearch") or {}
    info_list = acs_event.get("InfoList") if isinstance(acs_event, dict) else None
    return info_list if isinstance(info_list, list) else []


def summarize_acs_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "time": event.get("time"),
        "major": event.get("major"),
        "minor": event.get("minor"),
        "employeeNoString": event.get("employeeNoString"),
        "name": event.get("name"),
        "serialNo": event.get("serialNo"),
        "cardNo": event.get("cardNo"),
        "currentVerifyMode": event.get("currentVerifyMode"),
        "doorNo": event.get("doorNo"),
        "attendanceStatus": event.get("attendanceStatus"),
    }


def acs_events_probe(
    target: Target,
    args: argparse.Namespace,
) -> dict[str, Any]:
    started = time.monotonic()
    url = build_isapi_url(target, ACS_EVENT_PATH)
    if not args.username or args.password is None:
        return {
            "ok": False,
            "stage": "acs_events",
            "target": target.__dict__,
            "url": url,
            "errorType": "MissingCredentials",
            "error": "HIKVISION_USERNAME and HIKVISION_PASSWORD are required for ACS event discovery.",
        }

    body = build_acs_event_body(args)
    try:
        response = requests.post(
            url,
            auth=build_auth(args.auth, args.username, args.password),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            json=body,
            timeout=args.timeout,
            verify=args.verify_tls,
        )
        parsed = parse_response_body(response)
        events = get_acs_event_list(parsed)
        return {
            "ok": response.ok,
            "stage": "acs_events",
            "target": target.__dict__,
            "url": url,
            "statusCode": response.status_code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "query": body,
            "eventCount": len(events),
            "events": [summarize_acs_event(event) for event in events[: args.sample_limit]],
            "rawKeys": sorted(parsed.keys()),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "acs_events",
            "target": target.__dict__,
            "url": url,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "query": body,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def first_number(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    if isinstance(value, list):
        for item in value:
            found = first_number(item)
            if found is not None:
                return found
    if isinstance(value, dict):
        preferred_keys = (
            "totalMatches",
            "numOfMatches",
            "userNumber",
            "userCount",
            "count",
            "totalNum",
            "num",
            "total",
        )
        for key in preferred_keys:
            if key in value:
                found = first_number(value[key])
                if found is not None:
                    return found
        for item in value.values():
            found = first_number(item)
            if found is not None:
                return found
    return None


def extract_count(payload: dict[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        if key in payload:
            found = first_number(payload[key])
            if found is not None:
                return found
    return first_number(payload)


def get_user_info_search_count(
    target: Target,
    args: argparse.Namespace,
) -> dict[str, Any]:
    started = time.monotonic()
    url = build_isapi_url(target, USER_INFO_SEARCH_PATH)
    body = {
        "UserInfoSearchCond": {
            "searchID": f"user-count-{int(time.time())}",
            "searchResultPosition": 0,
            "maxResults": 1,
        }
    }
    try:
        response = requests.post(
            url,
            auth=build_auth(args.auth, args.username, args.password),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            json=body,
            timeout=args.timeout,
            verify=args.verify_tls,
        )
        parsed = parse_response_body(response)
        search = parsed.get("UserInfoSearch") if isinstance(parsed, dict) else None
        count = extract_count(search if isinstance(search, dict) else parsed, ("totalMatches", "numOfMatches"))
        return {
            "ok": response.ok and count is not None,
            "stage": "user_info_search_count",
            "url": url,
            "statusCode": response.status_code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "count": count,
            "rawKeys": sorted(parsed.keys()) if isinstance(parsed, dict) else [],
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "user_info_search_count",
            "url": url,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def get_acs_events_search_count(
    target: Target,
    args: argparse.Namespace,
) -> dict[str, Any]:
    started = time.monotonic()
    url = build_isapi_url(target, ACS_EVENT_PATH)
    body = build_acs_event_body(argparse.Namespace(**{**vars(args), "limit": 1, "position": 0}))
    try:
        response = requests.post(
            url,
            auth=build_auth(args.auth, args.username, args.password),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            json=body,
            timeout=args.timeout,
            verify=args.verify_tls,
        )
        parsed = parse_response_body(response)
        acs_event = parsed.get("AcsEvent") if isinstance(parsed, dict) else None
        count = extract_count(acs_event if isinstance(acs_event, dict) else parsed, ("totalMatches", "numOfMatches"))
        return {
            "ok": response.ok and count is not None,
            "stage": "acs_events_search_count",
            "url": url,
            "statusCode": response.status_code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "count": count,
            "query": body,
            "rawKeys": sorted(parsed.keys()) if isinstance(parsed, dict) else [],
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": "acs_events_search_count",
            "url": url,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "query": body,
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def get_simple_count_endpoint(
    target: Target,
    args: argparse.Namespace,
    path: str,
    stage: str,
    keys: tuple[str, ...],
) -> dict[str, Any]:
    started = time.monotonic()
    url = build_isapi_url(target, path)
    try:
        response = requests.get(
            url,
            auth=build_auth(args.auth, args.username, args.password),
            headers={"Accept": "application/json"},
            timeout=args.timeout,
            verify=args.verify_tls,
        )
        parsed = parse_response_body(response)
        count = extract_count(parsed, keys) if isinstance(parsed, dict) else None
        return {
            "ok": response.ok and count is not None,
            "stage": stage,
            "url": url,
            "statusCode": response.status_code,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "count": count,
            "rawKeys": sorted(parsed.keys()) if isinstance(parsed, dict) else [],
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "stage": stage,
            "url": url,
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "errorType": type(exc).__name__,
            "error": str(exc),
        }


def summary_counts_probe(target: Target, args: argparse.Namespace) -> dict[str, Any]:
    if not args.username or args.password is None:
        return {
            "ok": False,
            "stage": "summary_counts",
            "target": target.__dict__,
            "errorType": "MissingCredentials",
            "error": "HIKVISION_USERNAME and HIKVISION_PASSWORD are required for summary counts.",
        }

    started = time.monotonic()
    stages = [
        get_simple_count_endpoint(
            target,
            args,
            USER_INFO_COUNT_PATH,
            "user_info_count_endpoint",
            ("UserInfoCount", "userNumber", "userCount", "count", "total"),
        ),
        get_user_info_search_count(target, args),
        get_simple_count_endpoint(
            target,
            args,
            ACS_EVENT_TOTAL_NUM_PATH,
            "acs_event_total_num_endpoint",
            ("AcsEventTotalNum", "totalNum", "total", "count", "num"),
        ),
        get_acs_events_search_count(target, args),
    ]
    user_count = next(
        (
            item.get("count")
            for item in stages
            if item["stage"].startswith("user_") and item.get("ok") and item.get("count") is not None
        ),
        None,
    )
    event_count = next(
        (
            item.get("count")
            for item in stages
            if item["stage"].startswith("acs_") and item.get("ok") and item.get("count") is not None
        ),
        None,
    )
    return {
        "ok": user_count is not None or event_count is not None,
        "stage": "summary_counts",
        "target": target.__dict__,
        "elapsedSeconds": round(time.monotonic() - started, 3),
        "userCount": user_count,
        "eventCount": event_count,
        "attempts": stages,
    }


def sdk_env_probe(sdk_root: str | None) -> dict[str, Any]:
    if not sdk_root:
        return {
            "ok": False,
            "stage": "sdk_env",
            "error": "HIKVISION_LINUX_SDK_ROOT is not set",
        }

    expected = [
        "libhcnetsdk.so",
        "HCNetSDKCom",
        "include",
    ]
    present = []
    missing = []
    for name in expected:
        path = os.path.join(sdk_root, name)
        if os.path.exists(path):
            present.append(name)
        else:
            missing.append(name)

    return {
        "ok": len(missing) == 0,
        "stage": "sdk_env",
        "sdkRoot": sdk_root,
        "present": present,
        "missing": missing,
        "note": "SDK files are local runtime inputs and must not be committed.",
    }


def run(targets: Iterable[Target], args: argparse.Namespace) -> int:
    failures = 0
    emit({"event": "probe_started", "mode": args.mode, "timestamp": utc_now()})

    if args.mode == "sdk-env":
        result = sdk_env_probe(args.sdk_root)
        emit(result)
        failures += 0 if result["ok"] else 1
        emit({"event": "probe_finished", "mode": args.mode, "timestamp": utc_now(), "failures": failures})
        return 1 if failures else 0

    loops = args.loops if args.mode == "watch" else 1
    for loop in range(1, loops + 1):
        if args.mode == "watch":
            emit({"event": "watch_loop", "loop": loop, "timestamp": utc_now()})
        for target in targets:
            tcp_result = tcp_probe(target, args.timeout)
            emit(tcp_result)
            if not tcp_result["ok"]:
                failures += 1
                if args.mode in {"isapi-time", "acs-events", "watch"}:
                    continue

            if args.mode == "isapi-time" and target.protocol in {"http", "https"}:
                result = isapi_time_probe(
                    target,
                    args.timeout,
                    args.username,
                    args.password,
                    args.auth,
                    args.verify_tls,
                )
                emit(result)
                if not result["ok"]:
                    failures += 1

            if args.mode in {"acs-events", "watch"} and target.protocol in {"http", "https"}:
                result = acs_events_probe(target, args)
                emit(result)
                if not result["ok"]:
                    failures += 1
            if args.mode == "summary-counts" and target.protocol in {"http", "https"}:
                result = summary_counts_probe(target, args)
                emit(result)
                if not result["ok"]:
                    failures += 1
        if args.mode == "watch" and loop < loops:
            time.sleep(args.interval)
    emit({"event": "probe_finished", "mode": args.mode, "timestamp": utc_now(), "failures": failures})
    return 1 if failures else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only Hikvision Linux connectivity trial.")
    parser.add_argument(
        "--mode",
        choices=("tcp", "isapi-time", "acs-events", "summary-counts", "watch", "sdk-env"),
        default="tcp",
    )
    parser.add_argument("--target", action="append", type=parse_target, help="name=host:port[:protocol]")
    parser.add_argument("--timeout", type=float, default=5)
    parser.add_argument("--username", default=os.getenv("HIKVISION_USERNAME"))
    parser.add_argument("--password", default=os.getenv("HIKVISION_PASSWORD"))
    parser.add_argument("--auth", choices=("digest", "basic", "none"), default=os.getenv("HIKVISION_AUTH", "digest"))
    parser.add_argument("--sdk-root", default=os.getenv("HIKVISION_LINUX_SDK_ROOT"))
    parser.add_argument("--verify-tls", action="store_true")
    parser.add_argument("--lookback-minutes", type=int, default=60)
    parser.add_argument("--start", help="ISO timestamp; defaults to now minus --lookback-minutes")
    parser.add_argument("--end", help="ISO timestamp; defaults to now plus one minute")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--sample-limit", type=int, default=10)
    parser.add_argument("--position", type=int, default=0)
    parser.add_argument("--major", type=int, default=0)
    parser.add_argument("--minor", type=int, default=0)
    parser.add_argument("--search-id")
    parser.add_argument("--loops", type=int, default=12)
    parser.add_argument("--interval", type=float, default=5)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    targets = args.target or [parse_target(value) for value in DEFAULT_TARGETS]
    return run(targets, args)


if __name__ == "__main__":
    sys.exit(main())
