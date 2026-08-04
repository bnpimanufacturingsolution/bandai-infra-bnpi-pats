import { expect } from "chai";
import * as XLSX from "xlsx";
import {
	buildWorkSharingAssignmentNotes,
	normalizeWorkSharingEmployeeId,
	parseWorkSharingScheduleWorkbook,
	parseWorkSharingShiftWindow,
	pickWorkSharingSheetName,
	toWorkSharingMonSatScheduleCode,
	toWorkSharingShiftCode,
} from "../helper/bnpi-worksharing-schedule-import.helper";

function buildSampleWorkbookBuffer(options?: {
	sheetName?: string;
	rows?: any[][];
}): Buffer {
	const sheetName = options?.sheetName || "WorkSharingSchedule (9)";
	const rows =
		options?.rows ||
		[
			[
				"Employeeid",
				"EmployeeName",
				"Department",
				"Division",
				"Position",
				"Shift",
				"2026-07-11",
				"2026-07-12",
				"2026-07-25",
			],
			[
				21,
				"Salud, Arvin M.",
				"Administration/Production",
				"Administration/Production",
				"Deputy General Manager",
				"08:15 to 16:15",
				1,
				1,
				0,
			],
			[
				6,
				"Azucena, Danilo B.",
				"Production",
				"Injection and Mold 2",
				"Senior Engineer",
				"06:45 to 15:45",
				0,
				1,
				1,
			],
			[
				21,
				"Salud, Arvin M. (dup)",
				"Administration/Production",
				"Administration/Production",
				"Deputy General Manager",
				"08:15 to 16:15",
				1,
				1,
				1,
			],
			[
				99,
				"Bad Shift Person",
				"Ops",
				"Ops",
				"Staff",
				"flex",
				1,
				0,
				0,
			],
		];
	const workbook = XLSX.utils.book_new();
	const sheet = XLSX.utils.aoa_to_sheet(rows);
	XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("BNPI WorkSharingSchedule import helper", () => {
	it("pads numeric employee ids", () => {
		expect(normalizeWorkSharingEmployeeId(21)).to.equal("00021");
		expect(normalizeWorkSharingEmployeeId("00032")).to.equal("00032");
	});

	it("parses shift windows and builds WorkSharing codes", () => {
		const window = parseWorkSharingShiftWindow("08:15 to 16:15");
		expect(window).to.deep.equal({ startTime: "08:15", endTime: "16:15" });
		const shiftCode = toWorkSharingShiftCode("08:15 to 16:15");
		expect(shiftCode).to.equal("WS_0815_1615");
		expect(toWorkSharingMonSatScheduleCode(shiftCode)).to.equal(
			"BNPI_WS_MON_SAT_WS_0815_1615",
		);
	});

	it("detects overnight shifts", () => {
		const window = parseWorkSharingShiftWindow("18:45 to 03:45");
		expect(window).to.deep.equal({ startTime: "18:45", endTime: "03:45" });
		expect(toWorkSharingShiftCode("18:45 to 03:45")).to.equal("WS_1845_0345");
	});

	it("prefers WorkSharingSchedule sheet names", () => {
		expect(
			pickWorkSharingSheetName(["Notes", "WorkSharingSchedule (9)", "Summary"]),
		).to.equal("WorkSharingSchedule (9)");
		expect(pickWorkSharingSheetName(["Roster A", "Roster B"])).to.equal("Roster A");
	});

	it("parses workbook assignments with period effective dates", () => {
		const buffer = buildSampleWorkbookBuffer();
		const parsed = parseWorkSharingScheduleWorkbook(buffer);
		expect(parsed.sheetName).to.equal("WorkSharingSchedule (9)");
		expect(parsed.effectiveFrom).to.equal("2026-07-11");
		expect(parsed.effectiveTo).to.equal("2026-07-25");
		expect(parsed.assignments).to.have.length(2);
		expect(parsed.assignments[0]).to.include({
			employeeExternalId: "00021",
			shiftLabel: "08:15 to 16:15",
			scheduleCode: "BNPI_WS_MON_SAT_WS_0815_1615",
		});
		expect(parsed.assignments[1]).to.include({
			employeeExternalId: "00006",
			shiftLabel: "06:45 to 15:45",
			scheduleCode: "BNPI_WS_MON_SAT_WS_0645_1545",
		});
		const skipReasons = parsed.skippedRows.map((row) => row.reason);
		expect(skipReasons).to.include("duplicate_employee_id");
		expect(skipReasons.some((reason) => reason.startsWith("unsupported_shift:"))).to.equal(
			true,
		);
	});

	it("builds operator notes for assignments", () => {
		const buffer = buildSampleWorkbookBuffer();
		const assignment = parseWorkSharingScheduleWorkbook(buffer).assignments[0];
		const notes = buildWorkSharingAssignmentNotes(assignment);
		expect(notes).to.include("source row");
		expect(notes).to.include("2026-07-11");
		expect(notes).to.include("2026-07-25");
		expect(notes).to.include("08:15 to 16:15");
	});
});
