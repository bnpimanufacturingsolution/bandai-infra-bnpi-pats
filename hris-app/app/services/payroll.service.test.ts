import { beforeEach, describe, expect, it, vi } from "vitest";

const hrisApiClientMock = vi.hoisted(() => ({
	get: vi.fn(),
	post: vi.fn(),
	patch: vi.fn(),
	getBlob: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
	hrisApiClient: hrisApiClientMock,
}));

describe("payrollService", () => {
	beforeEach(() => {
		Object.values(hrisApiClientMock).forEach((mock) => mock.mockReset());
	});

	it("fetches payroll records through the HRIS API client with query params", async () => {
		const { payrollService } = await import("./payroll.service");
		const payrollResponse = {
			data: [],
			pagination: { page: 2, limit: 25, total: 0, totalPages: 0 },
		};
		hrisApiClientMock.get.mockResolvedValueOnce(payrollResponse);

		const result = await payrollService.getPayrollRecords({
			page: 2,
			limit: 25,
			employeeId: "employee-1",
			month: 6,
			year: 2026,
			status: "draft",
		});

		expect(hrisApiClientMock.get).toHaveBeenCalledWith(
			"/hms/payroll?page=2&limit=25&employeeId=employee-1&month=6&year=2026&status=draft",
		);
		expect(result).toBe(payrollResponse);
	});

	it("encodes payroll ids when building detail, update, and download URLs", async () => {
		const { payrollService } = await import("./payroll.service");
		const id = "payroll/id 1";
		hrisApiClientMock.get.mockResolvedValueOnce({ data: { id } });
		hrisApiClientMock.patch.mockResolvedValueOnce({ data: { id, status: "paid" } });
		const slip = new Blob(["payslip"], { type: "application/pdf" });
		hrisApiClientMock.getBlob.mockResolvedValueOnce(slip);

		await payrollService.getPayrollRecord(id);
		await payrollService.updatePayrollStatus(id, "paid");
		const result = await payrollService.downloadPayrollSlip(id);

		expect(hrisApiClientMock.get).toHaveBeenCalledWith("/hms/payroll/payroll%2Fid%201");
		expect(hrisApiClientMock.patch).toHaveBeenCalledWith(
			"/hms/payroll/payroll%2Fid%201",
			{ status: "paid" },
		);
		expect(hrisApiClientMock.getBlob).toHaveBeenCalledWith(
			"/hms/payroll/payroll%2Fid%201/download",
		);
		expect(result).toBe(slip);
	});

	it("posts generation and bulk status updates through the HRIS API client", async () => {
		const { payrollService } = await import("./payroll.service");
		hrisApiClientMock.post
			.mockResolvedValueOnce({ data: { generatedCount: 1, payrollIds: ["payroll-1"] } })
			.mockResolvedValueOnce({ data: { updatedCount: 1 } });

		await payrollService.generatePayroll({
			month: 6,
			year: 2026,
			employeeIds: ["employee-1"],
		});
		await payrollService.bulkUpdatePayrollStatus(["payroll-1"], "paid");

		expect(hrisApiClientMock.post).toHaveBeenNthCalledWith(
			1,
			"/hms/payroll/generate",
			{ month: 6, year: 2026, employeeIds: ["employee-1"] },
		);
		expect(hrisApiClientMock.post).toHaveBeenNthCalledWith(
			2,
			"/hms/payroll/bulk-update",
			{ ids: ["payroll-1"], status: "paid" },
		);
	});
});
