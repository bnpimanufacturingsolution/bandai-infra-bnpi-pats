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
    extract_count,
)


class ProbeTests(unittest.TestCase):
    def test_parse_named_http_target(self) -> None:
        target = parse_target("Main Entrance=10.184.37.139:80:http")

        self.assertEqual(target.name, "Main Entrance")
        self.assertEqual(target.host, "10.184.37.139")
        self.assertEqual(target.port, 80)
        self.assertEqual(target.protocol, "http")

    def test_parse_unnamed_target_defaults_to_tcp(self) -> None:
        target = parse_target("10.184.37.139:8000")

        self.assertEqual(target.name, "10.184.37.139:8000")
        self.assertEqual(target.protocol, "tcp")

    def test_build_isapi_url(self) -> None:
        target = Target("device", "10.184.37.139", 80, "http")

        self.assertEqual(
            build_isapi_url(target),
            "http://10.184.37.139:80/ISAPI/System/time",
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

    def test_extract_count_prefers_match_counts(self) -> None:
        payload = {
            "ok": True,
            "AcsEvent": {
                "totalMatches": 746,
                "InfoList": [{"serialNo": 1}],
            },
        }

        self.assertEqual(extract_count(payload, ("AcsEvent",)), 746)

    def test_biometric_service_keeps_callback_light_and_queues_reconcile(self) -> None:
        source = Path(__file__).resolve().parents[1] / "hikvision_biometric_service.cpp"
        text = source.read_text(encoding="utf-8")

        self.assertIn("NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)", text)
        self.assertIn("NET_DVR_SetupAlarmChan_V50", text)
        self.assertIn("COMM_ALARM_ACS", text)
        self.assertIn("NET_DVR_ACS_ALARM_INFO", text)
        self.assertIn("queue_hris_device_event(job)", text)
        self.assertIn("/api/hikvision/callback", text)
        self.assertIn("EN_HCNETSDK_ALARM", text)
        self.assertIn("queue_reconcile(job)", text)
        self.assertIn("worker_loop", text)
        self.assertIn("rawFingerprintTemplateStored", text)
        self.assertIn("--min-sdk-time", text)
        self.assertIn("acs_alarm_ignored_before_min_sdk_time", text)
        self.assertIn("MINOR_ADD_FINGER_BY_EMPLOYEE_NO", text)
        self.assertIn("MINOR_MOD_FINGER_BY_EMPLOYEE_NO", text)

    def test_build_script_produces_project_truth_named_service(self) -> None:
        script = Path(__file__).resolve().parents[1] / "scripts" / "build-hikvision-biometric-service.sh"
        text = script.read_text(encoding="utf-8")

        self.assertIn("hikvision_biometric_service.cpp", text)
        self.assertIn("hikvision-biometric-service", text)
        self.assertNotIn("hcnetsdk_alarm_probe.cpp", text)
        self.assertNotIn("hcnetsdk_alarm_probe", text)


if __name__ == "__main__":
    unittest.main()
