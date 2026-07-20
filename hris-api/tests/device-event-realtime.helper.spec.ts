import { expect } from "chai";
import {
	buildDeviceEventRealtimePayload,
	buildRealtimeDeviceEventRow,
	emitDeviceEventSaved,
} from "../helper/device-event-realtime.helper";

describe("device event realtime helper", () => {
	it("builds the saved-event payload used by the admin device events page", () => {
		const payload = buildDeviceEventRealtimePayload({
			id: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			status: "ATTENDANCE_CREATED",
			source: "EN_HCNETSDK_ALARM",
			eventTime: new Date("2026-06-05T01:00:00.000Z"),
			receivedAt: new Date("2026-06-05T01:00:01.000Z"),
			updatedAt: new Date("2026-06-05T01:00:02.000Z"),
		});

		expect(payload).to.include({
			eventId: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			status: "ATTENDANCE_CREATED",
			source: "EN_HCNETSDK_ALARM",
		});
		expect(payload?.event).to.deep.include({
			id: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			status: "ATTENDANCE_CREATED",
			source: "EN_HCNETSDK_ALARM",
		});
		expect(payload?.emittedAt).to.be.a("string");
	});

	it("includes the table-safe saved-event row without device access credentials", () => {
		const event = buildRealtimeDeviceEventRow({
			id: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			device: {
				id: "device-1",
				name: "Main Entrance Device",
				address: "10.184.37.139",
				port: 80,
				protocol: "http",
				access: { username: "admin", password: "secret" },
			},
			employee: {
				id: "employee-1",
				employeeId: "BNPI-001",
				deviceEmpId: "1",
				fullName: "Codex Hikvision Probe",
			},
			employeeNo: "1",
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "INFERRED",
			payload: { AcsEventInfo: { serialNo: 997 } },
		});

		expect(event?.device).to.deep.equal({
			id: "device-1",
			name: "Main Entrance Device",
			address: "10.184.37.139",
			port: 80,
			protocol: "http",
		});
		expect(event?.employee).to.deep.equal({
			id: "employee-1",
			employeeId: "BNPI-001",
			deviceEmpId: "1",
			fullName: "Codex Hikvision Probe",
			person: { personalInfo: { firstName: "Codex Hikvision Probe" } },
		});
		expect(event).to.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "INFERRED",
		});
		expect((event?.device as any)?.access).to.equal(undefined);
	});

	it("emits saved events to the organization/device room union", () => {
		const rooms: string[] = [];
		const emitted: Array<{ event: string; payload: any }> = [];
		const io = {
			to(room: string) {
				rooms.push(room);
				return this;
			},
			emit(event: string, payload: any) {
				emitted.push({ event, payload });
				return {
				};
			},
		};

		const payload = emitDeviceEventSaved(io as any, {
			id: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			status: "UNMATCHED",
			source: "HIKVISION_CALLBACK",
		});

		expect(payload?.eventId).to.equal("event-1");
		expect(rooms).to.deep.equal([
			"device-events:org:org-1",
			"device-events:device:device-1",
		]);
		// One emit per room so "All devices" (org-only join) and device-scoped tabs both hear it.
		expect(emitted).to.have.length(2);
		expect(emitted.every((item) => item.event === "device-event:saved")).to.equal(true);
		expect(emitted.every((item) => item.payload?.eventId === "event-1")).to.equal(true);
	});
});
