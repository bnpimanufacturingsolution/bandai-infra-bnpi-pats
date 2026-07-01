import { expect } from "chai";
import {
	buildHikvisionDeviceEventDedupeKey,
	DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES,
	extractHikvisionSystemLocalTime,
	extractHikvisionEventData,
	getHikvisionObservedDeviceIp,
	getHikvisionClockSkewSecondsFromSystemTime,
	getHikvisionObservedClockSkewSeconds,
	hikvisionEventMatchesConfiguredDevice,
	isHikvisionAttendancePunchEvent,
	normalizeHikvisionAcsEventListTimes,
	normalizeHikvisionAddress,
	normalizeHikvisionDeviceEventSource,
	normalizeHikvisionFutureSkewedEventTime,
	parseHikvisionBusinessDateBound,
	parseHikvisionBodyPayload,
	parseHikvisionEventTime,
	selectHikvisionPunchPair,
} from "../helper/hikvision-event-contract.helper";

describe("hikvision event contract helper", () => {
	it("normalizes live ACS event fields used by the device events page", () => {
		const event = extractHikvisionEventData({
			deviceId: "device-1",
			AcsEventInfo: {
				major: 5,
				minor: 75,
				time: "2026-06-05T08:01:02+08:00",
				employeeNoString: "EMP-001",
				userType: "normal",
				currentVerifyMode: "card",
				doorNo: 1,
				serialNo: 987,
			},
		});

		expect(event).to.deep.equal({
			deviceId: "device-1",
			source: undefined,
			eventType: "normal",
			major: 5,
			minor: 75,
			actionCode: undefined,
			time: "2026-06-05T08:01:02+08:00",
			employeeNo: "EMP-001",
			name: undefined,
			deviceIP: undefined,
			doorNo: 1,
			verifyMode: "card",
			serialNo: 987,
			deviceTime: undefined,
			timeAdjusted: false,
			deviceClockSkewSeconds: 0,
		});
	});

	it("keeps EN HCNETSDK alarm source distinct from normal callback source", () => {
		expect(normalizeHikvisionDeviceEventSource("EN_HCNETSDK_ALARM")).to.equal(
			"EN_HCNETSDK_ALARM",
		);
		expect(normalizeHikvisionDeviceEventSource("anything_else")).to.equal(
			"HIKVISION_CALLBACK",
		);
	});

	it("requires Hikvision observed IP to match the configured device address when present", () => {
		expect(normalizeHikvisionAddress("http://10.184.38.215:80/path")).to.equal(
			"10.184.38.215",
		);
		expect(
			hikvisionEventMatchesConfiguredDevice(
				{ deviceIP: "10.184.38.215" },
				{ address: "10.184.38.215" },
			),
		).to.equal(true);
		expect(
			hikvisionEventMatchesConfiguredDevice(
				{ deviceIP: "10.184.38.215" },
				{ address: "192.168.1.40" },
			),
		).to.equal(false);
		expect(
			hikvisionEventMatchesConfiguredDevice({ deviceIP: undefined }, { address: "192.168.1.40" }),
		).to.equal(true);
	});

	it("extracts observed Hikvision alarm IP from raw alarm payloads", () => {
		expect(
			getHikvisionObservedDeviceIp({
				rawAlarm: { deviceIp: "10.184.38.215" },
				socketCandidate: { deviceIP: "192.168.1.40" },
			}),
		).to.equal("10.184.38.215");
	});

	it("uses serial number in dedupe keys so same-second device events do not collapse", () => {
		const base = {
			deviceId: "device-1",
			source: "HIKVISION_CALLBACK",
			eventTime: parseHikvisionEventTime("2026-06-05T08:01:02+08:00"),
			employeeNo: "EMP-001",
		};

		const first = buildHikvisionDeviceEventDedupeKey({
			...base,
			event: { employeeNo: "EMP-001", serialNo: 1 },
		});
		const second = buildHikvisionDeviceEventDedupeKey({
			...base,
			event: { employeeNo: "EMP-001", serialNo: 2 },
		});

		expect(first).to.not.equal(second);
	});

	it("treats device timestamps without timezone as Philippine local time", () => {
		const parsed = parseHikvisionEventTime("2026-06-05T14:28:51");

		expect(parsed.toISOString()).to.equal("2026-06-05T06:28:51.000Z");
	});

	it("builds saved-event date filters from Philippine business-day bounds", () => {
		expect(parseHikvisionBusinessDateBound("2026-06-05")?.toISOString()).to.equal(
			"2026-06-04T16:00:00.000Z",
		);
		expect(parseHikvisionBusinessDateBound("2026-06-05", true)?.toISOString()).to.equal(
			"2026-06-05T15:59:59.999Z",
		);
	});

	it("adjusts live ACS lists when the device clock is ahead of the server", () => {
		const adjusted = normalizeHikvisionAcsEventListTimes(
			[
				{ time: "2026-06-05T14:42:20+08:00", serialNo: 954 },
				{ time: "2026-06-05T14:28:49+08:00", serialNo: 950 },
			],
			new Date("2026-06-05T06:40:20.000Z"),
		);

		expect(adjusted[0].time).to.equal("2026-06-05T14:40:20+08:00");
		expect(adjusted[0].deviceTime).to.equal("2026-06-05T14:42:20+08:00");
		expect(adjusted[0].timeAdjusted).to.equal(true);
		expect(adjusted[1].time).to.equal("2026-06-05T14:26:49+08:00");
	});

	it("does not reuse stored device clock skew after the row is no longer future-skewed", () => {
		const adjusted = normalizeHikvisionAcsEventListTimes(
			[{ time: "2026-06-05T14:42:20+08:00", serialNo: 954 }],
			new Date("2026-06-05T06:49:20.000Z"),
			120,
		);

		expect(getHikvisionObservedClockSkewSeconds(adjusted)).to.equal(0);
		expect(adjusted[0].time).to.equal("2026-06-05T14:42:20+08:00");
		expect(adjusted[0].deviceTime).to.equal(undefined);
	});

	it("does not apply stale stored clock skew when the device time is already current", () => {
		const normalized = normalizeHikvisionFutureSkewedEventTime(
			"2026-06-08T23:38:22+08:00",
			new Date("2026-06-08T15:38:27.860Z"),
			180,
		);
		const list = normalizeHikvisionAcsEventListTimes(
			[{ time: "2026-06-08T23:38:22+08:00", serialNo: 662 }],
			new Date("2026-06-08T15:38:27.860Z"),
			180,
		);

		expect(normalized.adjusted).to.equal(false);
		expect(normalized.eventTime.toISOString()).to.equal("2026-06-08T15:38:22.000Z");
		expect(list[0].time).to.equal("2026-06-08T23:38:22+08:00");
		expect(list[0].timeAdjusted).to.equal(undefined);
	});

	it("reads Hikvision XML system time and computes device clock skew", () => {
		const payload = {
			raw: `<Time><localTime>2026-06-05T15:01:51+08:00</localTime></Time>`,
		};

		expect(extractHikvisionSystemLocalTime(payload)).to.equal(
			"2026-06-05T15:01:51+08:00",
		);
		expect(
			getHikvisionClockSkewSecondsFromSystemTime(
				payload,
				new Date("2026-06-05T06:57:24.000Z"),
			),
		).to.equal(300);
	});

	it("parses XML callback bodies with ACS field aliases", () => {
		const payload = parseHikvisionBodyPayload(`
			<EventNotificationAlert>
				<employeeNoString>EMP-002</employeeNoString>
				<currentVerifyMode>face</currentVerifyMode>
				<serialNo>12345</serialNo>
			</EventNotificationAlert>
		`);

		expect(payload.employeeNoString).to.equal("EMP-002");
		expect(payload.currentVerifyMode).to.equal("face");
		expect(payload.serialNo).to.equal("12345");
	});

	it("does not treat fingerprint enrollment as an attendance punch", () => {
		expect(
			isHikvisionAttendancePunchEvent({
				major: 3,
				minor: 1055,
				actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO",
			}),
		).to.equal(false);
		expect(
			isHikvisionAttendancePunchEvent({
				major: 5,
				minor: 38,
				actionCode: "MINOR_FINGERPRINT_COMPARE_PASS",
			}),
		).to.equal(true);
		expect(
			isHikvisionAttendancePunchEvent({
				major: 5,
				minor: 75,
			}),
		).to.equal(true);
	});

	it("selects earliest biometric punch as time in and latest as time out", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:02:11.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T14:54:20.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T14:00:00.000Z"),
				payload: { major: 3, minor: 1055, actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T14:54:20.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:02:11.000Z");
	});

	it("does not create a clock out from one accepted punch", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(1);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut).to.equal(null);
	});

	it("uses no default minute gap for accepted punch pairing", () => {
		expect(DEFAULT_HIKVISION_MIN_PUNCH_PAIR_GAP_MINUTES).to.equal(0);

		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T15:41:39.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:41:39.000Z");
	});

	it("allows a later accepted punch to become clock out", () => {
		const pair = selectHikvisionPunchPair([
			{
				eventTime: new Date("2026-06-08T15:41:29.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
			{
				eventTime: new Date("2026-06-08T15:44:10.000Z"),
				payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:41:29.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T15:44:10.000Z");
	});

	it("does not pair rapid repeat accepted punches as clock out", () => {
		const pair = selectHikvisionPunchPair(
			[
				{
					eventTime: new Date("2026-06-08T15:21:29.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T15:21:39.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
			],
			{ minPairGapMinutes: 30 },
		);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T15:21:29.000Z");
		expect(pair.timeOut).to.equal(null);
	});

	it("pairs accepted punches only after the configured minimum gap", () => {
		const pair = selectHikvisionPunchPair(
			[
				{
					eventTime: new Date("2026-06-08T08:01:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T08:10:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
				{
					eventTime: new Date("2026-06-08T17:03:00.000Z"),
					payload: { major: 5, minor: 38, actionCode: "MINOR_FINGERPRINT_COMPARE_PASS" },
				},
			],
			{ minPairGapMinutes: 30 },
		);

		expect(pair.count).to.equal(3);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-08T08:01:00.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-08T17:03:00.000Z");
	});
});
