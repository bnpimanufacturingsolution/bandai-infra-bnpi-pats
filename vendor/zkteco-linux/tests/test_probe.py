import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from zkteco_linux_probe.__main__ import (
    CAPABILITY_REPORT,
    Target,
    build_hris_payload,
    filter_attendance_records,
    main,
    parse_target,
    tcp_probe,
)


class FakeAttendance:
    def __init__(self, uid: int, user_id: str, timestamp: str, status: int = 1, punch: int = 0) -> None:
        self.uid = uid
        self.user_id = user_id
        self.timestamp = timestamp
        self.status = status
        self.punch = punch


class ProbeTests(unittest.TestCase):
    def test_parse_named_target(self) -> None:
        target = parse_target("Device A=10.184.38.9:4370")

        self.assertEqual(target.name, "Device A")
        self.assertEqual(target.host, "10.184.38.9")
        self.assertEqual(target.port, 4370)

    def test_parse_unnamed_target_uses_address_as_name(self) -> None:
        target = parse_target("10.184.38.10:4370")

        self.assertEqual(target.name, "10.184.38.10:4370")
        self.assertEqual(target.host, "10.184.38.10")
        self.assertEqual(target.port, 4370)

    def test_tcp_probe_reports_failure_without_raising(self) -> None:
        result = tcp_probe(Target("closed-test-port", "127.0.0.1", 1), timeout=0.2)

        self.assertEqual(result["stage"], "tcp")
        self.assertFalse(result["ok"])
        self.assertIn("errorType", result)

    def test_capabilities_mode_reports_linux_runtime_boundary(self) -> None:
        with patch("zkteco_linux_probe.__main__.emit") as emit:
            exit_code = main(["--mode", "capabilities"])

        self.assertEqual(exit_code, 0)
        payload = emit.call_args.args[0]
        self.assertEqual(payload["event"], "capabilities")
        self.assertEqual(payload["status"], "linux_bridge_runtime")
        self.assertTrue(payload["canonicalHrisRuntime"])
        self.assertEqual(payload["notProven"], CAPABILITY_REPORT["notProven"])
        self.assertIn("realtime_watch_mode", payload["notProven"])
        self.assertIn("PyZK Linux bridge", payload["canonicalPath"])

    def test_latest_filter_keeps_bounded_most_recent_records(self) -> None:
        records = [
            FakeAttendance(1, "101", "2026-07-01T08:00:00"),
            FakeAttendance(2, "102", "2026-07-01T09:00:00"),
            FakeAttendance(3, "103", "2026-07-01T10:00:00"),
        ]

        selected = filter_attendance_records(records, since=None, latest=2)

        self.assertEqual([record.user_id for record in selected], ["102", "103"])

    def test_build_hris_payload_matches_zkteco_event_contract(self) -> None:
        payload = build_hris_payload(
            Target("ZKTeco A", "10.184.38.9", 4370),
            FakeAttendance(37501, "1321", "2026-07-01T15:21:06", status=1, punch=5),
            {"1321": "Sample User"},
        )

        self.assertEqual(payload["device"]["type"], "ZKTeco")
        self.assertEqual(payload["device"]["runtime"], "project-truth-zkteco-linux-pyzk")
        self.assertEqual(payload["device"]["ip"], "10.184.38.9")
        self.assertEqual(payload["attendance"]["enrollNumber"], "1321")
        self.assertEqual(payload["attendance"]["userName"], "Sample User")
        self.assertEqual(payload["attendance"]["timestamp"], "2026-07-01T15:21:06")
        self.assertEqual(payload["attendance"]["serialNo"], 37501)
        self.assertEqual(payload["eventType"], "AttendanceTransaction")


if __name__ == "__main__":
    unittest.main()
