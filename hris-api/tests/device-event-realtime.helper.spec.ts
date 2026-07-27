import { expect } from "chai";
import {
	buildDeviceEventRealtimePayload,
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
		expect(payload?.emittedAt).to.be.a("string");
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
		expect(emitted).to.have.length(1);
		expect(emitted.every((item) => item.event === "device-event:saved")).to.equal(true);
	});
});
