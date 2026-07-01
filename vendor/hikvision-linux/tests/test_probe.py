import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hikvision_linux_probe.__main__ import (  # noqa: E402
    Target,
    get_acs_event_list,
    hikvision_time,
    build_isapi_url,
    parse_system_time,
    parse_target,
    sdk_env_probe,
    tcp_probe,
)


class ProbeTests(unittest.TestCase):
    def test_parse_named_http_target(self) -> None:
        target = parse_target("Main Entrance=192.168.254.181:80:http")

        self.assertEqual(target.name, "Main Entrance")
        self.assertEqual(target.host, "192.168.254.181")
        self.assertEqual(target.port, 80)
        self.assertEqual(target.protocol, "http")

    def test_parse_unnamed_target_defaults_to_tcp(self) -> None:
        target = parse_target("192.168.254.181:8000")

        self.assertEqual(target.name, "192.168.254.181:8000")
        self.assertEqual(target.protocol, "tcp")

    def test_build_isapi_url(self) -> None:
        target = Target("device", "192.168.254.181", 80, "http")

        self.assertEqual(
            build_isapi_url(target),
            "http://192.168.254.181:80/ISAPI/System/time",
        )

    def test_parse_system_time_xml(self) -> None:
        parsed = parse_system_time(
            """
            <Time xmlns="http://www.isapi.org/ver20/XMLSchema">
              <timeMode>manual</timeMode>
              <localTime>2026-07-01T08:10:11+08:00</localTime>
              <timeZone>CST-8:00:00</timeZone>
            </Time>
            """
        )

        self.assertTrue(parsed["ok"])
        self.assertEqual(parsed["localTime"], "2026-07-01T08:10:11+08:00")
        self.assertEqual(parsed["timeMode"], "manual")

    def test_hikvision_time_uses_manila_offset(self) -> None:
        import datetime as dt

        value = dt.datetime(2026, 7, 1, 0, 0, tzinfo=dt.timezone.utc)

        self.assertEqual(hikvision_time(value), "2026-07-01T08:00:00+08:00")

    def test_get_acs_event_list(self) -> None:
        events = get_acs_event_list({"AcsEvent": {"InfoList": [{"serialNo": 1}]}})

        self.assertEqual(events, [{"serialNo": 1}])

    def test_tcp_probe_reports_failure_without_raising(self) -> None:
        result = tcp_probe(Target("closed-test-port", "127.0.0.1", 1, "tcp"), timeout=0.2)

        self.assertEqual(result["stage"], "tcp")
        self.assertFalse(result["ok"])
        self.assertIn("errorType", result)

    def test_sdk_env_probe_reports_missing_root(self) -> None:
        result = sdk_env_probe(None)

        self.assertEqual(result["stage"], "sdk_env")
        self.assertFalse(result["ok"])


if __name__ == "__main__":
    unittest.main()
