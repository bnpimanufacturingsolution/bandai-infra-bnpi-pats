import { expect } from "chai";
import {
	buildZktecoDeviceEventDedupeKey,
	normalizeZktecoPayload,
	parseZktecoEventTime,
	ZKTECO_DEVICE_EVENT_SOURCE,
} from "../helper/zkteco-event-contract.helper";

describe("zkteco event contract helper", () => {
	it("normalizes the Windows bridge attendance payload accepted by /api/zkteco/events", () => {
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
});
