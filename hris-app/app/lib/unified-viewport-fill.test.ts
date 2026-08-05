import { describe, expect, it } from "vitest";
import { isUnifiedViewportFillPath } from "./unified-viewport-fill";

describe("isUnifiedViewportFillPath", () => {
	it("fills HR dense list/table pages", () => {
		expect(isUnifiedViewportFillPath("/hr/benefits-management")).toBe(true);
		expect(isUnifiedViewportFillPath("/hr/benefits-management/")).toBe(true);
		expect(isUnifiedViewportFillPath("/hr/benefit-types")).toBe(true);
		expect(isUnifiedViewportFillPath("/hr/activity-logs")).toBe(true);
		expect(isUnifiedViewportFillPath("/hr/audit-logs")).toBe(true);
		expect(isUnifiedViewportFillPath("/hr/settings/documents")).toBe(true);
	});

	it("keeps page scroll for forms, multi-view, and non-list pages", () => {
		expect(isUnifiedViewportFillPath("/hr/benefits-management/new")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/employees")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/employees/new")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/employees/emp-1/edit")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/benefit-enrollments")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/dashboard")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/run-payroll")).toBe(false);
		expect(isUnifiedViewportFillPath("/hr/notifications")).toBe(false);
		expect(isUnifiedViewportFillPath("/employee/dashboard")).toBe(false);
	});
});
