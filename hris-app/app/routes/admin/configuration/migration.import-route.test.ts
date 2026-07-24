import { describe, expect, it } from "vitest";
import {
	ADMIN_MIGRATION_IMPORT_ACTION_SEQUENCE,
	ADMIN_MIGRATION_MODAL_TITLES,
	getWorkbookReportIssue,
	normalizeWorkbookReportLifecycle,
} from "./migration";
import {
	buildClosedImportSearchParams,
	buildCloseWorkbookSearchParams,
	buildCloseWorkbookUploadSearchParams,
	buildOpenImportSearchParams,
	buildOpenWorkbookSearchParams,
	buildOpenWorkbookUploadSearchParams,
	isAdminMigrationWorkbookId,
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

		const closedUpload = buildCloseWorkbookUploadSearchParams(withUpload);
		expect(closedUpload.get("workbook")).toBe("dm3");
		expect(isWorkbookUploadOpen(closedUpload)).toBe(false);

		const closedPage = buildCloseWorkbookSearchParams(closedUpload);
		expect(closedPage.has("workbook")).toBe(false);
		expect(closedPage.has("upload")).toBe(false);
		expect(closedPage.get("tab")).toBe("migration");
	});

	it("can open workbook page with upload modal already open from hub CTA", () => {
		const opened = buildOpenWorkbookSearchParams(new URLSearchParams(), "dm1", {
			upload: true,
		});
		expect(opened.get("workbook")).toBe("dm1");
		expect(isWorkbookUploadOpen(opened)).toBe(true);
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
