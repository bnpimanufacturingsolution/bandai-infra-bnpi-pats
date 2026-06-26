import { expect } from "chai";
import {
	buildZktecoDeviceEventDedupeKey,
	DEFAULT_ZKTECO_MIN_PUNCH_PAIR_GAP_MINUTES,
	isZktecoAttendancePunchEvent,
	normalizeZktecoPayload,
	parseZktecoEventTime,
	selectZktecoPunchPair,
	ZKTECO_DEVICE_EVENT_SOURCE,
} from "../helper/zkteco-event-contract.helper";

describe("zkteco event contract helper", () => {
	it("normalizes the VM-native bridge attendance payload accepted by /api/zkteco/events", () => {
		const event = normalizeZktecoPayload({
			device: { type: "ZKTeco", ip: "10.184.38.10", port: 4370 },
			attendance: {
				enrollNumber: " 1 ",
				userName: "Project Truth Smoke",
				timestamp: "2026-06-18T22:27:26",
				verifyMethodName: "Fingerprint",
				attState: 0,
				attStateName: "Check In",
				isValid: true,
				workCode: 0,
				serialNo: 123,
			},
			eventType: "AttendanceTransaction",
		});

		expect(event).to.deep.equal({
			deviceId: undefined,
			deviceIP: "10.184.38.10",
			devicePort: 4370,
			employeeNo: "1",
			name: "Project Truth Smoke",
			time: "2026-06-18T22:27:26",
			eventType: "AttendanceTransaction",
			verifyMode: "Fingerprint",
			attState: 0,
			attStateName: "Check In",
			workCode: 0,
			serialNo: 123,
			isValid: true,
		});
	});

	it("defaults the device port to the ZKTeco TCP port and accepts flat payloads", () => {
		const event = normalizeZktecoPayload({
			deviceIP: "10.184.38.10",
			employeeNo: "EMP-001",
			eventTime: "2026-06-18T08:00:00+08:00",
			verifyMode: "Card",
		});

		expect(event.devicePort).to.equal(4370);
		expect(event.employeeNo).to.equal("EMP-001");
		expect(event.verifyMode).to.equal("Card");
	});

	it("uses serial number in dedupe keys so same-second punches do not collapse", () => {
		const base = {
			deviceId: "device-1",
			eventTime: parseZktecoEventTime("2026-06-18T08:00:00+08:00"),
			employeeNo: "1",
			event: {
				eventType: "AttendanceTransaction",
				verifyMode: "Fingerprint",
				attState: 0,
				workCode: 0,
			},
		};

		const first = buildZktecoDeviceEventDedupeKey({
			...base,
			event: { ...base.event, serialNo: 1 },
		});
		const second = buildZktecoDeviceEventDedupeKey({
			...base,
			event: { ...base.event, serialNo: 2 },
		});

		expect(first).to.not.equal(second);
		expect(first).to.have.length(64);
	});

	it("keeps the ZKTeco source distinct from other device event save paths", () => {
		expect(ZKTECO_DEVICE_EVENT_SOURCE).to.equal("ZKTECO_EVENT");
	});

	it("treats valid attendance transactions as attendance punches", () => {
		expect(
			isZktecoAttendancePunchEvent({
				eventType: "AttendanceTransaction",
				isValid: true,
			}),
		).to.equal(true);
		expect(
			isZktecoAttendancePunchEvent({
				eventType: "AttendanceTransaction",
				isValid: false,
			}),
		).to.equal(false);
		expect(
			isZktecoAttendancePunchEvent({
				eventType: "AttendanceTransaction",
				isValid: "false" as any,
			}),
		).to.equal(false);
		expect(isZktecoAttendancePunchEvent({ eventType: "UserSync" })).to.equal(false);
	});

	it("selects earliest valid ZKTeco punch as time in and latest as time out", () => {
		const pair = selectZktecoPunchPair([
			{
				eventTime: new Date("2026-06-18T10:00:00.000Z"),
				payload: {
					eventType: "UserSync",
					attendance: { timestamp: "2026-06-18T18:00:00+08:00" },
				},
			},
			{
				eventTime: new Date("2026-06-18T09:00:00.000Z"),
				payload: {
					eventType: "AttendanceTransaction",
					attendance: { timestamp: "2026-06-18T17:00:00+08:00", isValid: true },
				},
			},
			{
				eventTime: new Date("2026-06-18T00:00:00.000Z"),
				payload: {
					eventType: "AttendanceTransaction",
					attendance: { timestamp: "2026-06-18T08:00:00+08:00", isValid: true },
				},
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeIn?.toISOString()).to.equal("2026-06-18T00:00:00.000Z");
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-18T09:00:00.000Z");
	});

	it("uses no default minute gap for ZKTeco punch pairing", () => {
		expect(DEFAULT_ZKTECO_MIN_PUNCH_PAIR_GAP_MINUTES).to.equal(0);

		const pair = selectZktecoPunchPair([
			{
				eventTime: new Date("2026-06-18T00:00:00.000Z"),
				payload: { eventType: "AttendanceTransaction" },
			},
			{
				eventTime: new Date("2026-06-18T00:00:10.000Z"),
				payload: { eventType: "AttendanceTransaction" },
			},
		]);

		expect(pair.count).to.equal(2);
		expect(pair.timeOut?.toISOString()).to.equal("2026-06-18T00:00:10.000Z");
	});

	it("can ignore rapid repeat punches when a minimum ZKTeco pair gap is configured", () => {
		const pair = selectZktecoPunchPair(
			[
				{
					eventTime: new Date("2026-06-18T00:00:00.000Z"),
					payload: { eventType: "AttendanceTransaction" },
				},
				{
					eventTime: new Date("2026-06-18T00:00:10.000Z"),
					payload: { eventType: "AttendanceTransaction" },
				},
			],
			{ minPairGapMinutes: 30 },
		);

		expect(pair.count).to.equal(2);
		expect(pair.timeOut).to.equal(null);
	});
});
