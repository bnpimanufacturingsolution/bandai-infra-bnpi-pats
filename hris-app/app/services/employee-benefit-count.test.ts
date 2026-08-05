import { describe, expect, it, vi, beforeEach } from "vitest";

const getMock = vi.fn();

vi.mock("~/lib/api-client", () => ({
	hrisApiClient: {
		get: (...args: unknown[]) => getMock(...args),
	},
}));

import employeeBenefitService from "./employee-benefit.service";

describe("employeeBenefitService.countByBenefitTypeId", () => {
	beforeEach(() => {
		getMock.mockReset();
	});

	it("returns pagination.total for a benefit type (accurate enrolled count)", async () => {
		getMock.mockResolvedValue({
			data: {
				data: {
					employeeBenefits: [{ id: "row-1" }],
					count: 831,
					pagination: { total: 831, page: 1, limit: 1, totalPages: 831 },
				},
			},
		});

		const total = await employeeBenefitService.countByBenefitTypeId(
			"cmryj0l9g00gdvgakb9nbjxi5",
		);

		expect(total).toBe(831);
		expect(getMock).toHaveBeenCalledTimes(1);
		const url = String(getMock.mock.calls[0][0]);
		expect(url).toContain("/api/employeeBenefit?");
		expect(url).toContain("filter=benefitTypeId%3Acmryj0l9g00gdvgakb9nbjxi5");
		expect(url).toContain("count=true");
		expect(url).toContain("limit=1");
	});

	it("returns 0 for empty benefitTypeId", async () => {
		await expect(employeeBenefitService.countByBenefitTypeId("")).resolves.toBe(0);
		expect(getMock).not.toHaveBeenCalled();
	});
});
