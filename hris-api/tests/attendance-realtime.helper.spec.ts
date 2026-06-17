import { expect } from "chai";
import {
	buildAttendanceRealtimePayload,
	emitAttendanceRealtimeEvent,
} from "../helper/attendance-realtime.helper";

describe("attendance realtime helper", () => {
	it("builds a compact attendance event payload from attendance and obligation truth", () => {
		const businessDate = new Date("2026-06-05T00:00:00.000Z");
		const payload = buildAttendanceRealtimePayload({
			attendance: {
				id: "attendance-1",
				organizationId: "org-1",
				employeeId: "employee-1",
				status: "PRESENT",
			},
			obligation: {
				id: "obligation-1",
				businessDate,
				status: "PRESENT",
			},
			action: "clock_in_created",
			source: "HIKVISION_CALLBACK",
		});

		expect(payload).to.include({
			attendanceId: "attendance-1",
			obligationId: "obligation-1",
			organizationId: "org-1",
			employeeId: "employee-1",
			businessDate: "2026-06-05T00:00:00.000Z",
			status: "PRESENT",
			action: "clock_in_created",
			source: "HIKVISION_CALLBACK",
		});
		expect(payload?.emittedAt).to.be.a("string");
	});

	it("emits attendance events to organization and employee rooms", () => {
		const rooms: string[] = [];
		const emitted: Array<{ event: string; payload: any }> = [];
		const io = {
			to(room: string) {
				rooms.push(room);
				return this;
			},
			emit(event: string, payload: any) {
				emitted.push({ event, payload });
				return {};
			},
		};

		const payload = emitAttendanceRealtimeEvent(io as any, {
			attendance: {
				id: "attendance-1",
				organizationId: "org-1",
				employeeId: "employee-1",
				status: "PRESENT",
			},
			action: "clock_out_updated",
			source: "WEB_CLOCK",
		});

		expect(payload?.attendanceId).to.equal("attendance-1");
		expect(rooms).to.deep.equal(["attendance:org:org-1", "employee:employee-1"]);
		expect(emitted).to.have.length(2);
		expect(emitted.every((item) => item.event === "attendance:event")).to.equal(true);
	});
});
