import { describe, expect, it } from "vitest";
import {
	ADMIN_MIGRATION_IMPORT_ACTION_SEQUENCE,
	ADMIN_MIGRATION_MODAL_TITLES,
	buildDm4RunSourcePayload,
	filterDm4AttendanceSourcePaths,
	getWorkbookReportIssue,
	isDm4ApprovedOvertimeSource,
	isDm4NonAttendanceSource,
	normalizeWorkbookReportLifecycle,
} from "./migration";
import {
	buildClosedImportSearchParams,
	buildCloseWorkbookSearchParams,
	buildCloseWorkbookUploadSearchParams,
	buildOpenImportSearchParams,
	buildOpenWorkbookSearchParams,
	buildOpenWorkbookUploadSearchParams,
	buildWorkbookImportProgressFromRun,
	formatWorkbookImportProgressDescription,
	formatWorkbookImportProgressTitle,
	getWorkbookImportProgressToastId,
	getWorkbookUploadKind,
	isAdminMigrationWorkbookId,
	isMigrationRunStatusSuccess,
	isMigrationRunStatusTerminal,
	isWorkbookUploadOpen,
} from "~/lib/admin-migration-ui";

describe("admin migration route contract", () => {
	it("keeps the route import actions in setup dependency order", () => {
		expect(ADMIN_MIGRATION_IMPORT_ACTION_SEQUENCE).toEqual([
			"import-departments",
			"import-sections",
			"import-positions",
			"import-levels",
			"import-shift-types",
			"import-agencies",
			"import-holidays",
			"import-leave-types",
			"import-benefit-types",
			"import-loan-types",
			"import-employees",
		]);
	});

	it("labels approved overtime by report basename, not a strict year prefix", () => {
		expect(
			isDm4ApprovedOvertimeSource(
				"confidential-files/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
			),
		).toBe(true);
		expect(isDm4ApprovedOvertimeSource("docs/Bandai Payroll/2026 rptOvertimeDetails.xlsx")).toBe(
			true,
		);
		expect(isDm4ApprovedOvertimeSource("Biometrics Data_Jun 26 - Jul 10.xlsx")).toBe(false);
	});

	it("labels DM1/DM2/DM4 upload activity kinds for the shared feed", () => {
		// Imported helpers cover OT basename + OT-only payload; activity copy is pure and local.
		// Smoke: kind strings used by the shared mass_upload_import_logs kinds remain distinct.
		const kinds = [
			"dm1-workbook",
			"dm2-workbook",
			"workbook",
			"dm4-workbook",
			"dm4-overtime",
			"compensation",
			"deduction",
			"manpower-databank",
			"period-leave",
			"worksharing-schedule",
		];
		expect(new Set(kinds).size).toBe(kinds.length);
		expect(kinds).toContain("dm4-overtime");
		expect(kinds).toContain("dm1-workbook");
		expect(kinds).toContain("worksharing-schedule");
		expect(kinds).toContain("period-leave");
	});

	it("scopes DM4 overtime-only runs to the selected OT file without biometrics", () => {
		const biometrics = [
			"confidential-files/DMs/Biometrics Data_Jun 26 - Jul 10.xlsx",
			"confidential-files/DMs/extra-punch.xlsx",
		];
		const overtime = [
			"confidential-files/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
		];

		const otOnly = buildDm4RunSourcePayload("overtime-only", biometrics, overtime);
		expect(otOnly.biometricFiles).toEqual([]);
		expect(otOnly.approvedOvertimeFiles).toEqual(overtime);
		expect(otOnly.sourceFiles).toEqual(overtime);
		expect(otOnly.sourceFiles).not.toContain(biometrics[0]);
		expect(otOnly.sourceFiles).not.toContain(biometrics[1]);

		const full = buildDm4RunSourcePayload("full", biometrics, overtime);
		expect(full.biometricFiles).toEqual(biometrics);
		expect(full.approvedOvertimeFiles).toEqual(overtime);
		expect(full.sourceFiles).toEqual([...biometrics, ...overtime]);
	});

	it("builds correct URL query params for workbook deep links and tabs", () => {
		const base = new URLSearchParams("tab=migration");
		const opened = buildOpenWorkbookSearchParams(base, "dm3");
		expect(opened.get("workbook")).toBe("dm3");
		expect(opened.get("tab")).toBe("migration");
		expect(opened.has("upload")).toBe(false);

		const withUpload = buildOpenWorkbookUploadSearchParams(opened);
		expect(withUpload.get("workbook")).toBe("dm3");
		expect(withUpload.get("upload")).toBe("1");

		const closedUpload = buildCloseWorkbookUploadSearchParams(withUpload);
		expect(closedUpload.get("workbook")).toBe("dm3");
		expect(closedUpload.has("upload")).toBe(false);

		const closedPage = buildCloseWorkbookSearchParams(closedUpload);
		expect(closedPage.has("workbook")).toBe(false);
		expect(closedPage.has("upload")).toBe(false);
		expect(closedPage.get("tab")).toBe("migration");
	});

	it("scopes biometrics-only Import attendance to selected biometrics without OT", () => {
		const biometrics = [
			".runtime/dm4-uploads/org/2026-08-04/Biometrics Data_Jul 11 - 25_3.xlsx",
		];
		const overtime = [
			"confidential-files/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
		];

		const bioOnly = buildDm4RunSourcePayload("biometrics-only", biometrics, overtime);
		expect(bioOnly.biometricFiles).toEqual(biometrics);
		expect(bioOnly.approvedOvertimeFiles).toEqual([]);
		expect(bioOnly.sourceFiles).toEqual(biometrics);
		expect(bioOnly.sourceFiles).not.toContain(overtime[0]);
		expect(bioOnly.mode).toBe("biometrics-only");
	});

	it("drops DM1/DM2/DM3 master workbooks from biometrics attendance lists", () => {
		const mixed = [
			"confidential-files/DMs/Biometrics Data_Jun 26 - Jul 10.xlsx",
			"confidential-files/DMs/DM1-master-data-migration (4).xlsx",
			"confidential-files/DMs/DM2-policy-data-migration (2).xlsx",
			"confidential-files/DMs/DM3-employee-data-migration (4).xlsx",
			"confidential-files/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
		];
		expect(isDm4NonAttendanceSource(mixed[1])).toBe(true);
		expect(isDm4NonAttendanceSource(mixed[4])).toBe(true);
		expect(isDm4NonAttendanceSource(mixed[0])).toBe(false);
		expect(filterDm4AttendanceSourcePaths(mixed)).toEqual([mixed[0]]);

		const bioOnly = buildDm4RunSourcePayload("biometrics-only", mixed, [mixed[4]]);
		expect(bioOnly.sourceFiles).toEqual([mixed[0]]);
		expect(bioOnly.approvedOvertimeFiles).toEqual([]);
	});

	it("overtime-only payload stays empty when no OT file is attached", () => {
		const otOnly = buildDm4RunSourcePayload(
			"overtime-only",
			["confidential-files/DMs/Biometrics Data_Jun 26 - Jul 10.xlsx"],
			[],
		);
		expect(otOnly.biometricFiles).toEqual([]);
		expect(otOnly.approvedOvertimeFiles).toEqual([]);
		expect(otOnly.sourceFiles).toEqual([]);
	});

	it("keeps every import action mapped to a modal title", () => {
		for (const action of ADMIN_MIGRATION_IMPORT_ACTION_SEQUENCE) {
			expect(ADMIN_MIGRATION_MODAL_TITLES[action]).toMatch(/^Import /);
		}
	});

	it("opens and closes route modal search state without dropping page context", () => {
		const opened = buildOpenImportSearchParams(
			new URLSearchParams("tab=migration&page=2"),
			"import-departments",
		);
		const closed = buildClosedImportSearchParams(opened);

		expect(opened.get("action")).toBe("import-departments");
		expect(opened.get("tab")).toBe("migration");
		expect(opened.get("page")).toBe("2");
		expect(closed.has("action")).toBe(false);
		expect(closed.get("tab")).toBe("migration");
		expect(closed.get("page")).toBe("2");
	});

	it("opens workbook as page state and keeps upload as a separate modal flag", () => {
		const opened = buildOpenWorkbookSearchParams(
			new URLSearchParams("tab=migration"),
			"dm3",
		);
		expect(opened.get("workbook")).toBe("dm3");
		expect(isWorkbookUploadOpen(opened)).toBe(false);
		expect(isAdminMigrationWorkbookId(opened.get("workbook"))).toBe(true);

		const withUpload = buildOpenWorkbookUploadSearchParams(opened);
		expect(withUpload.get("workbook")).toBe("dm3");
		expect(isWorkbookUploadOpen(withUpload)).toBe(true);
		expect(getWorkbookUploadKind(withUpload)).toBe("workbook");

		const closedUpload = buildCloseWorkbookUploadSearchParams(withUpload);
		expect(closedUpload.get("workbook")).toBe("dm3");
		expect(isWorkbookUploadOpen(closedUpload)).toBe(false);

		const closedPage = buildCloseWorkbookSearchParams(closedUpload);
		expect(closedPage.has("workbook")).toBe(false);
		expect(closedPage.has("upload")).toBe(false);
		expect(closedPage.get("tab")).toBe("migration");
	});

	it("opens DM3 worksharing schedule upload modal via dedicated upload kind", () => {
		const dm3 = buildOpenWorkbookSearchParams(new URLSearchParams("tab=migration"), "dm3");
		const schedule = buildOpenWorkbookUploadSearchParams(dm3, "worksharing-schedule");
		expect(schedule.get("workbook")).toBe("dm3");
		expect(schedule.get("upload")).toBe("worksharing-schedule");
		expect(getWorkbookUploadKind(schedule)).toBe("worksharing-schedule");
		expect(isWorkbookUploadOpen(schedule)).toBe(true);
	});

	it("opens DM3 period leave upload modal via dedicated upload kind", () => {
		const dm3 = buildOpenWorkbookSearchParams(new URLSearchParams("tab=migration"), "dm3");
		const leave = buildOpenWorkbookUploadSearchParams(dm3, "period-leave");
		expect(leave.get("workbook")).toBe("dm3");
		expect(leave.get("upload")).toBe("period-leave");
		expect(getWorkbookUploadKind(leave)).toBe("period-leave");
		expect(isWorkbookUploadOpen(leave)).toBe(true);
	});

	it("opens DM4 biometrics and overtime upload modals via dedicated upload kinds", () => {
		const dm4 = buildOpenWorkbookSearchParams(new URLSearchParams("tab=migration"), "dm4");
		const biometrics = buildOpenWorkbookUploadSearchParams(dm4, "biometrics");
		expect(biometrics.get("workbook")).toBe("dm4");
		expect(biometrics.get("upload")).toBe("biometrics");
		expect(getWorkbookUploadKind(biometrics)).toBe("biometrics");
		expect(isWorkbookUploadOpen(biometrics)).toBe(true);

		const overtime = buildOpenWorkbookUploadSearchParams(dm4, "overtime");
		expect(overtime.get("upload")).toBe("overtime");
		expect(getWorkbookUploadKind(overtime)).toBe("overtime");

		const closed = buildCloseWorkbookUploadSearchParams(overtime);
		expect(closed.get("workbook")).toBe("dm4");
		expect(closed.has("upload")).toBe(false);
	});

	it("opens DM3 compensation, deduction, and manpower-databank modals via dedicated upload kinds", () => {
		const dm3 = buildOpenWorkbookSearchParams(new URLSearchParams("tab=migration"), "dm3");
		const compensation = buildOpenWorkbookUploadSearchParams(dm3, "compensation");
		expect(compensation.get("workbook")).toBe("dm3");
		expect(compensation.get("upload")).toBe("compensation");
		expect(getWorkbookUploadKind(compensation)).toBe("compensation");

		const deduction = buildOpenWorkbookUploadSearchParams(dm3, "deduction");
		expect(deduction.get("upload")).toBe("deduction");
		expect(getWorkbookUploadKind(deduction)).toBe("deduction");

		const databank = buildOpenWorkbookUploadSearchParams(dm3, "manpower-databank");
		expect(databank.get("upload")).toBe("manpower-databank");
		expect(getWorkbookUploadKind(databank)).toBe("manpower-databank");

		// Statutory / monthly-payment register is not a DM3 UI upload kind.
		// Benefits and deductions come from compensation + deduction mass uploads.
		const statutoryLegacy = new URLSearchParams(dm3);
		statutoryLegacy.set("upload", "statutory");
		expect(getWorkbookUploadKind(statutoryLegacy)).toBe(null);
	});

	it("can open workbook page with upload modal already open (deep link / in-page CTA)", () => {
		// Hub no longer exposes a direct Upload button; upload opens only after Open workbook.
		// Helper still supports upload=1 for in-workbook modal and deep links.
		const opened = buildOpenWorkbookSearchParams(new URLSearchParams(), "dm1", {
			upload: true,
		});
		expect(opened.get("workbook")).toBe("dm1");
		expect(isWorkbookUploadOpen(opened)).toBe(true);

		const openOnly = buildOpenWorkbookSearchParams(new URLSearchParams(), "dm2");
		expect(openOnly.get("workbook")).toBe("dm2");
		expect(isWorkbookUploadOpen(openOnly)).toBe(false);
	});

	it("opens employee import with auto-create explicitly disabled by route helper contract", () => {
		const opened = buildOpenImportSearchParams(
			new URLSearchParams("tab=migration"),
			"import-employees",
		);

		expect(opened.get("action")).toBe("import-employees");
		expect(opened.get("importAutoCreate")).toBe("false");
	});

	it("keeps running employee workbook reports active until the workbook end event", () => {
		const report = normalizeWorkbookReportLifecycle({
			runId: "run-1",
			workbookId: "dm3",
			workbookName: "DM3-employee-data-migration.xlsx",
			sourceFilename: "DM3-employee-data-migration.xlsx",
			startedAt: "2026-05-27T13:00:00.000Z",
			status: "running",
			sheets: [
				{
					sheetName: "Employees",
					target: "Employee",
					status: "Finalizing",
					jobId: "job-1",
					totalRows: 857,
					created: 857,
					updated: 0,
					skipped: 0,
					blocked: 0,
					failed: 0,
					elapsedMs: 1000,
					firstError: "Finalizing 857 rows: metadata and attendance obligations",
					errors: [],
				},
			],
			events: [
				{
					id: "event-1",
					at: "2026-05-27T13:00:01.000Z",
					sheetName: "Employees",
					status: "Finalizing",
					message: "Employees: Finalizing 857 rows",
					rowCount: 857,
				},
			],
		});

		expect(report.status).toBe("running");
		expect(report.sheets[0].status).toBe("Imported");
		expect(report.events?.[0]?.message).toContain("Finalizing 857 rows");
	});

	it("keeps terminal failed workbook issue as the visible report truth", () => {
		const report = normalizeWorkbookReportLifecycle({
			runId: "run-2",
			workbookId: "dm3",
			workbookName: "DM3-employee-data-migration.xlsx",
			sourceFilename: "DM3-employee-data-migration.xlsx",
			startedAt: "2026-05-28T10:00:00.000Z",
			finishedAt: "2026-05-28T10:08:37.000Z",
			status: "failed",
			sheets: [
				{
					sheetName: "Employee Schedule Assignments",
					target: "EmployeeScheduleHistory",
					status: "Failed",
					totalRows: 778,
					created: 674,
					updated: 0,
					skipped: 0,
					blocked: 0,
					failed: 104,
					elapsedMs: 8370,
					firstError: "Employee 01549 was not found.",
					errors: [],
				},
			],
			events: [
				{
					id: "event-2",
					at: "2026-05-28T10:08:30.000Z",
					sheetName: "Employees",
					status: "running",
					message: "Row 2 - 00024 - Augusto Libuit: Added",
				},
			],
		});

		expect(getWorkbookReportIssue(report)).toBe("Employee 01549 was not found.");
	});

	it("preserves elapsed time from persisted workbook timestamps", () => {
		const report = normalizeWorkbookReportLifecycle({
			runId: "run-3",
			workbookId: "dm3",
			workbookName: "DM3-employee-data-migration.xlsx",
			sourceFilename: "DM3-employee-data-migration.xlsx",
			startedAt: "2026-05-31T12:00:00.000Z",
			finishedAt: "2026-05-31T12:03:15.000Z",
			status: "completed",
			sheets: [
				{
					sheetName: "Employees",
					target: "Employee",
					status: "Imported",
					totalRows: 857,
					created: 857,
					updated: 857,
					skipped: 0,
					blocked: 0,
					failed: 0,
					elapsedMs: 0,
					errors: [],
				},
			],
		});

		expect(report.elapsedMs).toBe(195000);
	});

	it("uses durable stale event time instead of current time for terminal stale reports", () => {
		const report = normalizeWorkbookReportLifecycle({
			runId: "run-stale",
			workbookId: "dm3",
			workbookName: "DM3-employee-data-migration.xlsx",
			sourceFilename: "DM3-employee-data-migration.xlsx",
			startedAt: "2026-06-07T02:51:03.870Z",
			status: "blocked",
			sheets: [
				{
					sheetName: "Employees",
					target: "Employee",
					status: "Blocked",
					totalRows: 2212,
					created: 0,
					updated: 2212,
					skipped: 0,
					blocked: 1,
					failed: 0,
					elapsedMs: 0,
					errors: [],
				},
			],
			events: [
				{
					id: "stale-event",
					at: "2026-06-07T03:06:03.388Z",
					status: "Blocked",
					message: "Backend worker memory is no longer tracking this run.",
				},
			],
		});

		expect(report.finishedAt).toBe("2026-06-07T03:06:03.388Z");
		expect(report.elapsedMs).toBe(899518);
	});
});
