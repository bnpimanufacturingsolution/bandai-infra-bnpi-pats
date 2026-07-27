import { beforeEach, describe, expect, it, vi } from "vitest";

const hrisGetMock = vi.fn();

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		get: hrisGetMock,
	},
}));

describe("reportsService manpower distribution reference", () => {
	beforeEach(() => {
		hrisGetMock.mockReset();
	});

	it("unwraps the API envelope and returns the workbook reference payload", async () => {
		const { default: reportsService } = await import("./reports.service");
		const reference = {
			sourceWorkbook: "docs/Copy of 2026_04_April_HR Monthly Manpower Distribution.xlsx",
			month: "2026-04",
			genderSummary: { female: 0, male: 0, total: 0 },
			bnpiGenderSummary: { female: 0, male: 0, total: 0 },
			agencyGenderSummary: { female: 0, male: 0, total: 0 },
			directAgencySnapshot: null,
			averageManpower: null,
		};

		hrisGetMock.mockResolvedValueOnce({
			data: {
				success: true,
				message: "Manpower distribution workbook reference loaded successfully.",
				data: reference,
			},
		});

		await expect(reportsService.getManpowerDistributionReference("2026-04")).resolves.toEqual(
			reference,
		);
		expect(hrisGetMock).toHaveBeenCalledWith(
			"/api/reports/manpower-distribution/reference?month=2026-04",
		);
	});
});
