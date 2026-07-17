import { expect } from "chai";
import { summarizeHikvisionListenerLogs } from "../helper/hikvision-listener-status.helper";

describe("hikvision-listener-status helper", () => {
	it("marks the listener as receiving when recent SDK alarm callbacks post to HRIS", () => {
		const now = new Date("2026-07-10T01:22:00.000Z");
		const status = summarizeHikvisionListenerLogs(
			[
				'{"ts":"2026-07-10T01:21:18Z","employeeNo":"1","event":"acs_alarm_received","eventKind":"attendance_fingerprint_success","serialNo":"102"}',
				'{"ts":"2026-07-10T01:21:18Z","event":"hikvision_callback_post_result","ok":"true","serialNo":"102"}',
			],
			now,
		);

		expect(status.state).to.equal("receiving");
		expect(status.receivingCallbacks).to.equal(true);
		expect(status.postingToHris).to.equal(true);
		expect(status.armed).to.equal(true);
		expect(status.lastAlarmAt).to.equal("2026-07-10T01:21:18.000Z");
	});

	it("does not treat a running service with SDK login failure as receiving", () => {
		const now = new Date("2026-07-10T01:22:00.000Z");
		const status = summarizeHikvisionListenerLogs(
			[
				'{"ts":"2026-07-10T01:16:54Z","deviceName":"Main Entrance Device","event":"sdk_login","lastError":"7","ok":"false","sdkPort":"8000"}',
				'{"ts":"2026-07-10T01:17:01Z","event":"sdk_callback_register","ok":"true"}',
			],
			now,
		);

		expect(status.state).to.equal("login_failed");
		expect(status.receivingCallbacks).to.equal(false);
		expect(status.postingToHris).to.equal(false);
		expect(status.armed).to.equal(false);
		expect(status.lastLoginOk).to.equal(false);
		expect(status.lastError).to.equal("7");
	});

	it("keeps listener evidence separated per Hikvision device", () => {
		const now = new Date("2026-07-14T01:45:00.000Z");
		const status = summarizeHikvisionListenerLogs(
			[
				'{"ts":"2026-07-14T01:40:01Z","deviceId":"device-a","event":"device_config_loaded","host":"10.184.38.136","name":"Main Entrance Device A","sdkPort":"8000"}',
				'{"ts":"2026-07-14T01:40:02Z","deviceId":"device-a","deviceName":"Main Entrance Device A","event":"sdk_login","host":"10.184.38.136","lastError":"0","ok":"true","sdkPort":"8000"}',
				'{"ts":"2026-07-14T01:40:03Z","deviceId":"device-a","event":"sdk_alarm_arm","host":"10.184.38.136","ok":"true"}',
				'{"ts":"2026-07-14T01:40:04Z","deviceId":"device-b","event":"device_config_loaded","host":"10.184.38.139","name":"Main Entrance Device B","sdkPort":"8000"}',
				'{"ts":"2026-07-14T01:40:05Z","deviceId":"device-b","deviceName":"Main Entrance Device B","event":"sdk_login","host":"10.184.38.139","lastError":"7","ok":"false","sdkPort":"8000"}',
			],
			now,
		);

		const deviceA = status.devices.find((device) => device.deviceId === "device-a");
		const deviceB = status.devices.find((device) => device.deviceId === "device-b");

		expect(status.devices).to.have.length(2);
		expect(deviceA?.state).to.equal("armed");
		expect(deviceA?.armed).to.equal(true);
		expect(deviceB?.state).to.equal("login_failed");
		expect(deviceB?.lastLoginError).to.equal("7");
	});

	it("surfaces Hikvision locked-user backoff per device", () => {
		const status = summarizeHikvisionListenerLogs([
			'{"ts":"2026-07-14T02:30:00Z","deviceId":"device-a","event":"device_config_loaded","host":"192.168.18.41","name":"Test A","sdkPort":"8000"}',
			'{"ts":"2026-07-14T02:30:01Z","deviceId":"device-a","deviceName":"Test A","event":"sdk_login","host":"192.168.18.41","lastError":"153","ok":"false","sdkPort":"8000"}',
			'{"ts":"2026-07-14T02:30:01Z","deviceId":"device-a","event":"device_login_locked_backoff","host":"192.168.18.41","lastError":"153","attempt":"1"}',
		]);

		expect(status.lastFailureReason).to.equal("device_login_locked_backoff");
		expect(status.lastError).to.equal("153");
		expect(status.devices[0]?.lastFailureReason).to.equal("device_login_locked_backoff");
		expect(status.devices[0]?.lastLoginError).to.equal("153");
	});

	it("backs off per device when Hikvision SDK credentials are rejected", () => {
		const status = summarizeHikvisionListenerLogs([
			'{"ts":"2026-07-14T03:02:42Z","deviceId":"device-a","event":"device_config_loaded","host":"192.168.18.41","name":"Test A","sdkPort":"8000"}',
			'{"ts":"2026-07-14T03:02:43Z","deviceId":"device-a","deviceName":"Test A","event":"sdk_login","host":"192.168.18.41","lastError":"1","ok":"false","sdkPort":"8000"}',
			'{"ts":"2026-07-14T03:02:43Z","deviceId":"device-a","event":"device_login_auth_failed_backoff","host":"192.168.18.41","lastError":"1","attempt":"1"}',
		]);

		expect(status.lastFailureReason).to.equal("device_login_auth_failed_backoff");
		expect(status.lastError).to.equal("1");
		expect(status.diagnosis).to.contain("backing off");
		expect(status.devices[0]?.lastFailureReason).to.equal("device_login_auth_failed_backoff");
		expect(status.devices[0]?.lastLoginError).to.equal("1");
	});

	it("stays armed (not idle) after a quiet gap when the log still proves a successful path", () => {
		// Same shape as operator screenshot: last proof ~14 min ago, service still up.
		const now = new Date("2026-07-17T05:40:00.000Z");
		const status = summarizeHikvisionListenerLogs(
			[
				'{"ts":"2026-07-17T05:26:00Z","deviceId":"cmrlgqsjv000oob01165tbd8n","employeeNo":"1","event":"acs_alarm_received","eventKind":"attendance_fingerprint_success","serialNo":"4800","sourceHost":"127.0.0.1"}',
				'{"ts":"2026-07-17T05:26:01Z","deviceId":"cmrlgqsjv000oob01165tbd8n","event":"hikvision_callback_post_result","ok":"true","serialNo":"4800","sourceHost":"127.0.0.1"}',
			],
			now,
		);

		expect(status.receivingCallbacks).to.equal(false);
		expect(status.armed).to.equal(true);
		expect(status.state).to.equal("armed");
		expect(status.devices[0]?.receivingCallbacks).to.equal(false);
		expect(status.devices[0]?.armed).to.equal(true);
		expect(status.devices[0]?.state).to.equal("armed");
	});
});
