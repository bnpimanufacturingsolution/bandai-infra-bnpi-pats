import { describe, expect, it } from "vitest";
import { buildAttendanceImportMutationInput } from "./attendance-import-ui";

describe("attendance import UI helpers", () => {
	it("wraps the selected file for the attendance import mutation contract", () => {
		const file = new File(["EMPLOYEE_ID,DATE"], "attendance.csv", { type: "text/csv" });

		expect(buildAttendanceImportMutationInput(file)).toEqual({ file });
	});

	it("preserves attendance import options when timesheet creation is requested", () => {
		const file = new File(["EMPLOYEE_ID,DATE"], "attendance.csv", { type: "text/csv" });

		expect(buildAttendanceImportMutationInput(file, { createTimesheets: true })).toEqual({
			file,
			options: { createTimesheets: true },
		});
	});
});
