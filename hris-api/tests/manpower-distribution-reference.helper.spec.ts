import { expect } from "chai";
import { getManpowerDistributionWorkbookReference } from "../helper/manpower-distribution-reference.helper";

describe("manpower distribution workbook reference helper", () => {
	it("returns an empty reference when the workbook asset is missing", () => {
		const reference = getManpowerDistributionWorkbookReference({
			month: "2026-04",
		});

		expect(reference).to.deep.equal({
			sourceWorkbook: "docs/Copy of 2026_04_April_HR Monthly Manpower Distribution.xlsx",
			month: "2026-04",
			genderSummary: { female: 0, male: 0, total: 0 },
			bnpiGenderSummary: { female: 0, male: 0, total: 0 },
			agencyGenderSummary: { female: 0, male: 0, total: 0 },
			directAgencySnapshot: null,
			averageManpower: null,
		});
	});
});
