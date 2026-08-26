import { describe, expect, it } from "vitest";
import {
	buildClosedImportSearchParams,
	buildOpenImportSearchParams,
	getCollectionTotal,
	getCountClassName,
	getCountLabel,
	getStatusClassName,
	getStatusLabel,
	isWorkbookSourceInputsPanelReady,
	type AdminMigrationStepStatus,
} from "./admin-migration-ui";

const baseStep: AdminMigrationStepStatus = {
	count: 0,
	countLabelSingular: "employee",
	countLabelPlural: "employees",
};

describe("admin migration UI helpers", () => {
	describe("getCollectionTotal", () => {
		it("uses top-level pagination totals before falling back to collection length", () => {
			expect(
				getCollectionTotal({ pagination: { total: 42 } }, [{ id: "one" }]),
			).toBe(42);
		});

		it("uses top-level count responses from count-only import lists", () => {
			expect(getCollectionTotal({ count: 7 }, [])).toBe(7);
		});

		it("uses nested pagination totals from wrapped API responses", () => {
			expect(
				getCollectionTotal({ data: { pagination: { total: 13 } } }, []),
			).toBe(13);
		});

		it("uses nested count values before collection fallback", () => {
			expect(getCollectionTotal({ data: { count: 5 } }, [{ id: "one" }])).toBe(5);
		});

		it("falls back to collection length when no count metadata exists", () => {
			expect(getCollectionTotal({}, [{ id: "one" }, { id: "two" }])).toBe(2);
		});
	});

	describe("step labels and badges", () => {
		it("marks unavailable import steps as skipped", () => {
			const step = { ...baseStep, unavailable: true };

			expect(getStatusLabel(step)).toBe("Skipped");
			expect(getStatusClassName(step)).toContain("bg-slate-600");
			expect(getCountClassName(step)).toContain("bg-slate-500");
		});

		it("marks loading import steps as checking and counting", () => {
			const step = { ...baseStep, isLoading: true };

			expect(getStatusLabel(step)).toBe("Checking");
			expect(getCountLabel(step)).toBe("Counting");
			expect(getStatusClassName(step)).toContain("bg-gray-600");
		});

		it("shows empty import steps as not yet imported", () => {
			expect(getStatusLabel(baseStep)).toBe("Nothing imported yet");
			expect(getCountLabel(baseStep)).toBe("0 employees");
			expect(getCountClassName(baseStep)).toContain("bg-gray-700");
		});

		it("hides the status badge and formats singular counts when data exists", () => {
			const step = { ...baseStep, count: 1 };

			expect(getStatusLabel(step)).toBeNull();
			expect(getCountLabel(step)).toBe("1 employee");
			expect(getCountClassName(step)).toContain("bg-emerald-600");
		});

		it("formats large plural counts for imported migration records", () => {
			const step = { ...baseStep, count: 1200 };

			expect(getCountLabel(step)).toBe("1,200 employees");
		});
	});

	describe("source inputs panel", () => {
		it("shows the catalog when a workbook has mapped or downloadable sources", () => {
			expect(
				isWorkbookSourceInputsPanelReady([
					{
						downloadable: true,
						sheetMappings: [{ step: "DM4.1", sheet: "Attendance History" }],
					},
				]),
			).toBe(true);
		});

		it("shows DM4 the same way as other DM workbooks", () => {
			const dm4Sources = [
				{
					downloadable: true,
					sheetMappings: [
						{ step: "DM4.1", sheet: "Attendance History" },
						{ step: "DM4.2", sheet: "Timesheets" },
					],
				},
				{
					downloadable: false,
					sheetMappings: [{ step: "DM4.3", sheet: "rptOvertimeDetails" }],
				},
			];

			expect(isWorkbookSourceInputsPanelReady(dm4Sources)).toBe(true);
		});

		it("hides the catalog when no mapped or downloadable sources exist", () => {
			expect(isWorkbookSourceInputsPanelReady([])).toBe(false);
			expect(isWorkbookSourceInputsPanelReady([{ downloadable: false, sheetMappings: [] }])).toBe(
				false,
			);
		});
	});

	describe("import modal search params", () => {
		it("opens employee imports with auto-create disabled by default", () => {
			const params = buildOpenImportSearchParams(
				new URLSearchParams("tab=migration"),
				"import-employees",
			);

			expect(params.get("action")).toBe("import-employees");
			expect(params.get("importAutoCreate")).toBe("false");
			expect(params.get("tab")).toBe("migration");
		});

		it("opens non-employee imports without changing unrelated params", () => {
			const params = buildOpenImportSearchParams(
				new URLSearchParams("tab=migration&importStep=preview"),
				"import-departments",
			);

			expect(params.get("action")).toBe("import-departments");
			expect(params.get("importStep")).toBe("preview");
			expect(params.get("tab")).toBe("migration");
		});

		it("opens agency imports through the shared modal-state contract", () => {
			const params = buildOpenImportSearchParams(
				new URLSearchParams("tab=migration"),
				"import-agencies",
			);

			expect(params.get("action")).toBe("import-agencies");
			expect(params.has("importAutoCreate")).toBe(false);
			expect(params.get("tab")).toBe("migration");
		});

		it("closes imports by clearing modal-only state while preserving page params", () => {
			const params = buildClosedImportSearchParams(
				new URLSearchParams(
					"tab=migration&action=import-employees&importStep=preview&importAutoCreate=false&importDefaultLeaveBalances=true&importCreateTimesheets=true",
				),
			);

			expect(params.get("tab")).toBe("migration");
			expect(params.has("action")).toBe(false);
			expect(params.has("importStep")).toBe(false);
			expect(params.has("importAutoCreate")).toBe(false);
			expect(params.has("importDefaultLeaveBalances")).toBe(false);
			expect(params.has("importCreateTimesheets")).toBe(false);
		});
	});
});
