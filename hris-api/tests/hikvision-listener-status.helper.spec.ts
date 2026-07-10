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
});
