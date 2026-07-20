declare const describe: any;
declare const it: any;

const assert = require("node:assert/strict");
const path = require("path");

const {
	expandSourceFiles,
	findBiometricPunchRows,
	normalizeBadgeId,
	parseBiometricTimestamp,
	resolveEmployeeScheduleSnapshotForDate,
} = require("../scripts/bnpi-demo-attendance-proof.cjs");
const {
	getMigrationApiRoot,
	getMigrationRepoRoot,
	resolveMigrationApiPath,
	resolveMigrationDm4SourceFiles,
} = require("../app/migration/migration-dry-run.service");

describe("DM4 biometric attendance proof helpers", function () {
	this.timeout(10000);
	const sourceFolder = path.resolve(
		__dirname,
		"../../docs/2026-20260527T124252Z-3-001/2026",
	);

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

	it("resolves DM4 scripts and source workbooks when launched from repo root", () => {
		const originalCwd = process.cwd();
		const repoRoot = path.resolve(__dirname, "../..");
		process.chdir(repoRoot);
		try {
			const resolution = resolveMigrationDm4SourceFiles([
				"docs/2026-20260527T124252Z-3-001/2026/Biometrics Data_Apr 11 - 25.xlsx",
			]);

			assert.equal(path.basename(getMigrationApiRoot()), "hris-api");
			assert.equal(getMigrationRepoRoot(), repoRoot);
			assert.equal(
				resolveMigrationApiPath("scripts", "bnpi-demo-attendance-proof.cjs"),
				path.join(repoRoot, "hris-api", "scripts", "bnpi-demo-attendance-proof.cjs"),
			);
			assert.equal(resolution.missing.length, 0);
			assert.equal(resolution.invalid.length, 0);
			assert.ok(
				resolution.sourceWorkbookFiles.some((filePath: string) =>
					filePath.endsWith("Biometrics Data_Apr 11 - 25.xlsx"),
				),
			);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it("groups raw biometric punches by normalized badge and business date", () => {
		const file = path.join(sourceFolder, "Biometrics Data_Apr 11 - 25.xlsx");
		const rows = findBiometricPunchRows(file);
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
