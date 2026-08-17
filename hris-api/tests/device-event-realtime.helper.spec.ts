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
			employeeNo: "15",
			eventCategory: "ATTENDANCE",
			eventAction: "CHECK_IN",
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
			employeeNo: "15",
		});
		expect(payload?.emittedAt).to.be.a("string");
		expect(payload?.event?.id).to.equal("event-1");
		expect(payload?.event?.employeeNo).to.equal("15");
	});

	it("includes a joined device { id, name, address } on the slim socket row", () => {
		const payload = buildDeviceEventRealtimePayload({
			id: "event-d",
			organizationId: "org-1",
			deviceId: "cmripjwkw00ffl0013lfxcbxw",
			status: "UNMATCHED",
			source: "EN_HCNETSDK_ALARM",
			device: {
				id: "cmripjwkw00ffl0013lfxcbxw",
				name: "Main Entrance Device D",
				address: "10.184.38.140",
			},
		});

		expect(payload?.event?.device).to.deep.include({
			id: "cmripjwkw00ffl0013lfxcbxw",
			name: "Main Entrance Device D",
			address: "10.184.38.140",
		});
	});

	it("builds device from deviceName / deviceAddress when no join is present", () => {
		const payload = buildDeviceEventRealtimePayload({
			id: "event-e",
			deviceId: "cmriu5ab102goi001x9o7nfct",
			source: "EN_HCNETSDK_ALARM",
			deviceName: "Main Entrance Device E",
			deviceAddress: "10.184.38.141",
		});

		expect(payload?.event?.device).to.deep.equal({
			id: "cmriu5ab102goi001x9o7nfct",
			name: "Main Entrance Device E",
			address: "10.184.38.141",
		});
	});

	it("fills device.address from payload.deviceIP so the FE subtitle is not a CUID", () => {
		const payload = buildDeviceEventRealtimePayload({
			id: "event-ip",
			deviceId: "cmripjwkw00ffl0013lfxcbxw",
			source: "EN_HCNETSDK_ALARM",
			payload: { deviceIP: "10.184.38.140", major: 5 },
		});

		expect(payload?.event?.device).to.deep.equal({
			id: "cmripjwkw00ffl0013lfxcbxw",
			name: null,
			address: "10.184.38.140",
		});
	});

	it("fills device.address from payload.ipAddress when deviceIP is absent", () => {
		const payload = buildDeviceEventRealtimePayload({
			id: "event-ip2",
			deviceId: "cmriu5ab102goi001x9o7nfct",
			source: "EN_HCNETSDK_ALARM",
			payload: { ipAddress: "10.184.38.141" },
		});

		expect(payload?.event?.device).to.deep.equal({
			id: "cmriu5ab102goi001x9o7nfct",
			name: null,
			address: "10.184.38.141",
		});
	});

	it("emits saved events to org and device rooms as a UNION (not intersection)", () => {
		const roomsHit: string[] = [];
		const emitted: Array<{ room: string | null; event: string; payload: any }> = [];

		const makeRoomTarget = (room: string) => {
			return {
				emit: (event: string, payload: unknown) => {
					roomsHit.push(room);
					emitted.push({ room, event, payload });
					return makeRoomTarget(room);
				},
				to: (_next: string) => {
					throw new Error(
						"chained .to() intersection is forbidden for device-event:saved",
					);
				},
			};
		};

		const io = {
			to: (room: string) => makeRoomTarget(room),
			emit: (event: string, payload: unknown) => {
				emitted.push({ room: null, event, payload });
				return io;
			},
		};

		const payload = emitDeviceEventSaved(io as any, {
			id: "event-1",
			organizationId: "org-1",
			deviceId: "device-1",
			status: "UNMATCHED",
			source: "HIKVISION_CALLBACK",
			employeeNo: "",
		});

		expect(payload?.eventId).to.equal("event-1");
		expect(roomsHit).to.deep.equal([
			"device-events:org:org-1",
			"device-events:device:device-1",
		]);
		expect(emitted).to.have.length(2);
		expect(emitted.every((item) => item.event === "device-event:saved")).to.equal(true);
		expect(emitted[0].payload.eventId).to.equal("event-1");
		expect(emitted[1].payload.eventId).to.equal("event-1");
		expect(emitted[0].payload.event?.id).to.equal("event-1");
	});

	it("still emits to org room alone when deviceId is missing", () => {
		const roomsHit: string[] = [];
		const io = {
			to: (room: string) => ({
				emit: (_event: string, _payload: unknown) => {
					roomsHit.push(room);
					return io;
				},
			}),
		};

		emitDeviceEventSaved(io as any, {
			id: "event-2",
			organizationId: "org-1",
			status: "UNMATCHED",
			source: "HIKVISION_CALLBACK",
		});

		expect(roomsHit).to.deep.equal(["device-events:org:org-1"]);
	});
});
