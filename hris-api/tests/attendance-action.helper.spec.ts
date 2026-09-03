import { expect } from "chai";
import { analyzeAttendanceAction } from "../helper/attendance.helper";

describe("attendance action helper", () => {
	it("creates the first punch when no same-day attendance exists", () => {
		const result = analyzeAttendanceAction(null, "clock-in");

		expect(result).to.deep.include({ canProceed: true, action: "create" });
	});

	it("records timeOut when a same-day attendance has timeIn only", () => {
		const existingAttendance = {
			id: "attendance-1",
			timeIn: new Date("2026-06-09T00:00:00.000Z"),
			timeOut: null,
		};

		const result = analyzeAttendanceAction(existingAttendance, "clock-out");

		expect(result).to.deep.include({ canProceed: true, action: "update-clock-out" });
		expect(result.existingAttendance).to.equal(existingAttendance);
	});

	it("allows a later clock-out punch to replace an existing timeOut", () => {
		const existingAttendance = {
			id: "attendance-1",
			timeIn: new Date("2026-06-09T00:00:00.000Z"),
			timeOut: new Date("2026-06-09T09:00:00.000Z"),
		};

		const result = analyzeAttendanceAction(existingAttendance, "clock-out");

		expect(result).to.deep.include({ canProceed: true, action: "update-clock-out" });
		expect(result.existingAttendance).to.equal(existingAttendance);
	});

	it("still rejects an explicit clock-in after timeIn already exists", () => {
		const existingAttendance = {
			id: "attendance-1",
			timeIn: new Date("2026-06-09T00:00:00.000Z"),
			timeOut: new Date("2026-06-09T09:00:00.000Z"),
		};

		const result = analyzeAttendanceAction(existingAttendance, "clock-in");

		expect(result.canProceed).to.equal(false);
		expect(result.action).to.equal("reject");
	});
});
