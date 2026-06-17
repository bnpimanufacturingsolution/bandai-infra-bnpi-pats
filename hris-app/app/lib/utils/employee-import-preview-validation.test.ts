import { describe, expect, it } from "vitest";
import { buildEmployeeImportPreviewValidation } from "./employee-import-preview-validation";

describe("buildEmployeeImportPreviewValidation", () => {
	it("flags missing required lookup values as blocking errors", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["", "Manager", "HR Manager", "hris-manager", "Regular Schedule"]],
			columnMapping: {},
			autoCreateResources: false,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		expect(result.hasBlockingIssues).toBe(true);
		expect(result.issues.some((issue) => issue.fieldKey === "DEPARTMENT")).toBe(true);
	});

	it("downgrades unknown master data to warnings when auto-create is enabled", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["SALES DEPT.", "Manager", "Account Executive", "hris-manager", "Regular Schedule"]],
			columnMapping: {},
			autoCreateResources: true,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		expect(result.hasBlockingIssues).toBe(false);
		expect(result.issues.every((issue) => issue.severity === "warning")).toBe(true);
	});

	it("passes clean rows without issues", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["ADMIN", "Manager", "HR Manager", "hris-manager", "Regular Schedule"]],
			columnMapping: {},
			autoCreateResources: false,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		expect(result.hasBlockingIssues).toBe(false);
		expect(result.issues).toHaveLength(0);
	});

	it("flags missing system role as a blocking error", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["ADMIN", "Manager", "HR Manager", "", "Regular Schedule"]],
			columnMapping: {},
			autoCreateResources: false,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		expect(result.hasBlockingIssues).toBe(true);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				fieldKey: "ROLE",
				severity: "error",
				message: "System role is required before import.",
			}),
		);
	});

	it("flags unknown schedule with create metadata", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["ADMIN", "Manager", "HR Manager", "hris-manager", "Night Shift"]],
			columnMapping: {},
			autoCreateResources: false,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		expect(result.hasBlockingIssues).toBe(true);
		const scheduleIssue = result.issues.find((issue) => issue.fieldKey === "SCHEDULE");
		expect(scheduleIssue).toEqual(
			expect.objectContaining({
				fieldKey: "SCHEDULE",
				severity: "error",
				createLabel: "Create Schedule",
			}),
		);
		expect(scheduleIssue?.createHref).toContain("/admin/configuration/schedule-templates?");
		expect(scheduleIssue?.createHref).toContain("prefillName=Night+Shift");
		expect(scheduleIssue?.createHref).toContain(
			"returnAction=import-employees",
		);
		expect(result.summary).toContainEqual(
			expect.objectContaining({
				fieldKey: "SCHEDULE",
				title: "Schedule setup needed",
			}),
		);
	});

	it("builds a row-specific create href for unresolved positions", () => {
		const result = buildEmployeeImportPreviewValidation({
			previewHeaders: ["DEPARTMENT", "LEVEL", "POSITION", "ROLE", "SCHEDULE"],
			previewData: [["ADMIN", "Manager", "TECHNOLOGY DEVELOPER", "hris-manager", "Regular Schedule"]],
			columnMapping: {},
			autoCreateResources: false,
			departmentOptions: [{ value: "ADMIN", label: "ADMIN" }],
			levelOptions: [{ value: "Manager", label: "Manager" }],
			positionOptions: [{ value: "HR Manager", label: "HR Manager" }],
			roleOptions: [{ value: "hris-manager", label: "HRIS Manager" }],
			scheduleOptions: [{ value: "Regular Schedule", label: "Regular Schedule" }],
		});

		const positionIssue = result.issues.find((issue) => issue.fieldKey === "POSITION");
		expect(positionIssue?.createHref).toContain("/admin/configuration/positions?");
		expect(positionIssue?.createHref).toContain("prefillName=TECHNOLOGY+DEVELOPER");
		expect(positionIssue?.createHref).toContain("returnStep=3");
	});
});
