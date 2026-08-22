import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();

vi.mock("~/lib/api-client", () => ({
	hrisApiClient: {
		get: getMock,
	},
}));

describe("timesheetlineService", () => {
	beforeEach(() => {
		getMock.mockReset();
	});

	it("fetches timesheet lines with default document and pagination params", async () => {
		const { default: timesheetlineService } = await import("./timesheetline.service");
		getMock.mockResolvedValueOnce({
			data: {
				timesheetlines: [],
				pagination: { total: 0, page: 1, limit: 20, totalPages: 0 },
			},
		});

		await timesheetlineService.getTimesheetlines();

		expect(getMock).toHaveBeenCalledWith(
			"/api/timesheetline?document=true&pagination=true&count=false",
		);
	});

	it("serializes filters for approved effective payroll-ready lines", async () => {
		const { default: timesheetlineService } = await import("./timesheetline.service");
		getMock.mockResolvedValueOnce({ data: { timesheetlines: [] } });

		await timesheetlineService.getTimesheetlines({
			page: 2,
			limit: 50,
			fields: ["id", "employeeId", "overtimeHours"],
			filter: {
				status: "APPROVED",
				payrollPeriodId: "period-1",
			},
		});

		expect(getMock).toHaveBeenCalledWith(
			"/api/timesheetline?fields=id%2CemployeeId%2CovertimeHours&page=2&limit=50&filter=status%3AAPPROVED%2CpayrollPeriodId%3Aperiod-1&document=true&pagination=true&count=false",
		);
	});

	it("throws when the API response does not include data", async () => {
		const { default: timesheetlineService } = await import("./timesheetline.service");
		getMock.mockResolvedValueOnce({ message: "No timesheet lines" });

		await expect(timesheetlineService.getTimesheetlines()).rejects.toThrow(
			"No timesheet lines",
		);
	});
});
