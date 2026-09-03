declare const describe: any;
declare const it: any;

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");

const {
	expandSourceFiles,
	findBiometricPunchRows,
	normalizeBadgeId,
	parseBiometricTimestamp,
	resolveEmployeeScheduleSnapshotForDate,
} = require("../scripts/bnpi-demo-attendance-proof.cjs");

describe("DM4 biometric attendance proof helpers", function () {
	this.timeout(10000);
	const sourceFolder = fs.mkdtempSync(path.join(os.tmpdir(), "bnpi-proof-"));
	const nestedFolder = path.join(sourceFolder, "nested");
	const biometricFile = path.join(sourceFolder, "Biometrics Data_Apr 11 - 25.xlsx");
	const secondaryFile = path.join(nestedFolder, "Biometrics Data_Apr 11 - 25 copy.xlsx");

	fs.mkdirSync(nestedFolder, { recursive: true });

	const writeBiometricWorkbook = (filePath: string) => {
		const workbook = XLSX.utils.book_new();
		const sheet = XLSX.utils.aoa_to_sheet([
			["No.", "Date Time"],
			["21", "4/13/2026 7:49:31 AM"],
			["21", "4/13/2026 4:58:00 PM"],
		]);
		XLSX.utils.book_append_sheet(workbook, sheet, "Apr 13");
		XLSX.writeFile(workbook, filePath);
	};

	writeBiometricWorkbook(biometricFile);
	writeBiometricWorkbook(secondaryFile);

	it("normalizes biometric badge numbers to five digits without reordering", () => {
		assert.equal(normalizeBadgeId("21"), "00021");
		assert.equal(normalizeBadgeId("3123"), "03123");
		assert.equal(normalizeBadgeId("12345"), "12345");
	});

	it("parses biometric timestamps as Manila clock evidence", () => {
		const parsed = parseBiometricTimestamp("4/13/2026 7:49:31 AM");

		assert.ok(parsed instanceof Date);
		assert.equal(parsed.toISOString(), "2026-04-12T23:49:31.000Z");
	});

	it("expands the provided biometric source folder into multiple workbooks", () => {
		const files = expandSourceFiles([sourceFolder]);

		assert.ok(files.length > 1);
		assert.equal(files.every((file: string) => /\.xlsx$/i.test(file)), true);
	});

	it("groups raw biometric punches by normalized badge and business date", () => {
		const rows = findBiometricPunchRows(biometricFile);
		const row21 = rows.find(
			(row: any) => row.rawBadge === "21" && row.normalizedBadge === "00021",
		);

		assert.ok(row21);
		assert.equal(row21.employeeId, "00021");
		assert.equal(row21.date, "2026-04-13");
		assert.equal(row21.timeIn, "07:49");
		assert.equal(row21.timeOut, "16:58");
		assert.ok(row21.punches.length > 1);
	});

	it("resolves DM3 employee schedules for Saturday DM4 proof rows", () => {
		const employee = {
			embeddedSchedule: {
				templateId: "template-mon-sat",
				templateCode: "BNPI_WS_MON_SAT_DAY",
				templateName: "BNPI Mon-Sat Day",
				cycleDays: 7,
				effectiveStartDate: new Date("2026-05-11T00:00:00.000Z"),
				effectiveEndDate: new Date("2026-05-12T00:00:00.000Z"),
				reason: "BNPI WorkSharingSchedule employee schedule assignment backfill",
				pattern: [1, 2, 3, 4, 5, 6, 7].map((day) =>
					day <= 6
						? {
								day,
								shiftTypeId: "shift-day",
								shiftSnapshot: {
									code: "DAY",
									name: "Day",
									isOff: false,
									timeSlots: [
										{ type: "work", startTime: "08:00", endTime: "12:00" },
										{ type: "break", startTime: "12:00", endTime: "13:00" },
										{ type: "work", startTime: "13:00", endTime: "17:00" },
									],
								},
							}
						: {
								day,
								shiftTypeId: null,
								shiftSnapshot: { code: "OFF", name: "Rest", isOff: true, timeSlots: [] },
							},
				),
			},
			scheduleHistoryRecords: [],
		};

		const saturday = resolveEmployeeScheduleSnapshotForDate(
			employee,
			new Date("2026-05-23T00:00:00.000Z"),
		);
		const sunday = resolveEmployeeScheduleSnapshotForDate(
			employee,
			new Date("2026-05-24T00:00:00.000Z"),
		);

		assert.equal(saturday.scheduleCode, "BNPI_WS_MON_SAT_DAY");
		assert.equal(saturday.isOff, false);
		assert.equal(saturday.regularMinutes, 480);
		assert.equal(sunday.isOff, true);
	});
});
