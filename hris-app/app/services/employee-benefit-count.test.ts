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

	it("uses count-only API (no documents / no pagination / no row fields)", async () => {
		getMock.mockResolvedValue({
			data: {
				data: {
					// Count-only shape — must not require employeeBenefits array
					count: 831,
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
		expect(url).toContain("document=false");
		expect(url).toContain("pagination=false");
		// Must not request row payload / joins for a column total
		expect(url).not.toContain("document=true");
		expect(url).not.toContain("fields=");
		expect(url).not.toContain("limit=");
	});

	it("returns 0 for empty benefitTypeId", async () => {
		await expect(employeeBenefitService.countByBenefitTypeId("")).resolves.toBe(0);
		expect(getMock).not.toHaveBeenCalled();
	});

	it("countByBenefitTypeIds batches parallel count-only calls", async () => {
		getMock
			.mockResolvedValueOnce({ data: { data: { count: 831 } } })
			.mockResolvedValueOnce({ data: { data: { count: 66 } } });

		const map = await employeeBenefitService.countByBenefitTypeIds([
			"type-mla",
			"type-hys",
			"type-mla", // dedupe
		]);

		expect(map).toEqual({ "type-mla": 831, "type-hys": 66 });
		expect(getMock).toHaveBeenCalledTimes(2);
	});
});
