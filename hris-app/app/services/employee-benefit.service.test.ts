import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("../lib/api-client", () => ({
	hrisApiClient: { get },
}));

import { employeeBenefitService } from "./employee-benefit.service";

describe("employeeBenefitService schedule fields", () => {
	beforeEach(() => {
		get.mockReset();
		get.mockResolvedValue({
			data: {
				employeeBenefits: [],
				pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
			},
		});
	});

	it("requests schedule mode and installment count when listing benefits", async () => {
		await employeeBenefitService.getEmployeeBenefits();

		expect(get).toHaveBeenCalledWith(
			expect.stringContaining(
				"scheduleMode,recurrenceFrequency,totalInstallments,attendanceBased,attendanceAmountBasis",
			),
		);
	});

	it("requests schedule mode and installment count when reading a benefit", async () => {
		get.mockResolvedValueOnce({ data: { id: "benefit-1" } });

		await employeeBenefitService.getEmployeeBenefit("benefit-1");

		expect(get).toHaveBeenCalledWith(
			expect.stringContaining(
				"scheduleMode,recurrenceFrequency,totalInstallments,attendanceBased,attendanceAmountBasis",
			),
		);
	});
});
