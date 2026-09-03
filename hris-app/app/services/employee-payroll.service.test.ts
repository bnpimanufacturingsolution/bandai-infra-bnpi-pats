import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();
const getBlobMock = vi.fn();

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		get: getMock,
		post: postMock,
		getBlob: getBlobMock,
	},
}));

describe("employeePayrollService", () => {
	beforeEach(() => {
		getMock.mockReset();
		postMock.mockReset();
		getBlobMock.mockReset();
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches employee payrolls with default document and pagination params", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		getMock.mockResolvedValueOnce({
			data: {
				employeePayrolls: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
			},
		});

		await employeePayrollService.getEmployeePayrolls();

		expect(getMock).toHaveBeenCalledWith(
			"/api/employeePayroll?document=true&pagination=true&count=false",
		);
	});

	it("unwraps nested payroll list responses", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		getMock.mockResolvedValueOnce({
			data: {
				data: {
					employeePayrolls: [{ id: "payroll-1" }],
					pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				},
			},
		});

		const result = await employeePayrollService.getEmployeePayrolls();

		expect(result).toMatchObject({
			employeePayrolls: [{ id: "payroll-1" }],
		});
	});

	it("supports query params for paid payroll snapshot field selection", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		getMock.mockResolvedValueOnce({
			data: {
				employeePayrolls: [],
			},
		});

		await employeePayrollService.getEmployeePayrollsWithParams({
			fields: ["id", "employeeId", "timesheetSnapshot"],
			filter: { status: "PAID", payrollPeriodId: "period-1" },
			page: 1,
			limit: 25,
		});

		expect(getMock).toHaveBeenCalledWith(
			"/api/employeePayroll?fields=id%2CemployeeId%2CtimesheetSnapshot&page=1&limit=25&filter=status%3APAID%2CpayrollPeriodId%3Aperiod-1&document=true&pagination=true&count=false",
		);
	});

	it("fetches payroll breakdown from the dedicated breakdown endpoint", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		getMock.mockResolvedValueOnce({
			data: {
				data: {
					employeeInfo: { id: "emp-1" },
					payrollPeriod: { id: "period-1" },
				},
			},
		});

		await employeePayrollService.getEmployeePayrollBreakdown("payroll-1");

		expect(getMock).toHaveBeenCalledWith("/api/employeePayroll/payroll-1/breakdown");
	});

	it("uploads payslip release attachments to the period-scoped endpoint", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		postMock.mockResolvedValueOnce({
			data: {
				data: {
					upload: { url: "https://files.test/release.pdf" },
					payrollPeriodId: "period-1",
					updatedEmployeePayrolls: 3,
				},
			},
		});
		const file = new File(["release"], "release.pdf", { type: "application/pdf" });

		await employeePayrollService.uploadPayslipReleaseAttachment({
			payrollPeriodId: "period-1",
			file,
		});

		expect(postMock).toHaveBeenCalledWith(
			"/api/employeePayroll/period/period-1/payslip-release/attachment",
			expect.any(FormData),
		);
	});

	it("requests payslip generation and release through period-scoped endpoints", async () => {
		const { default: employeePayrollService } = await import("./employee-payroll.service");
		postMock
			.mockResolvedValueOnce({
				data: {
					data: {
						payrollPeriodId: "period-1",
						totalEmployeePayrolls: 2,
						generated: 2,
						skippedMissingAttachment: 0,
						skippedAlreadyGenerated: 0,
						failed: 0,
					},
				},
			})
			.mockResolvedValueOnce({
				data: {
					data: {
						payrollPeriodId: "period-1",
						totalEmployeePayrolls: 2,
						released: 2,
						skippedMissingPayslip: 0,
					},
				},
			});

		await employeePayrollService.generatePayslipsForPeriod("period-1");
		await employeePayrollService.releasePayslipsForPeriod("period-1");

		expect(postMock).toHaveBeenNthCalledWith(
			1,
			"/api/employeePayroll/period/period-1/payslip-release/generate-payslips",
		);
		expect(postMock).toHaveBeenNthCalledWith(
			2,
			"/api/employeePayroll/period/period-1/payslip-release/release",
		);
	});
});
