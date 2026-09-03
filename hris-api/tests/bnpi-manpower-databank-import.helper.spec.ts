import { expect } from "chai";
import {
	mapManpowerDatabankMatrix,
	mapManpowerEmploymentStatus,
	parseBnpiPersonName,
	pickManpowerDatabankSheet,
} from "../helper/bnpi-manpower-databank-import.helper";

describe("BNPI manpower databank import helper", () => {
	it("prefers Manpower Databank sheet name over day sheets", () => {
		const picked = pickManpowerDatabankSheet([
			"07-01",
			"07-24",
			"Manpower Databank",
			"Notes",
		]);
		expect(picked.sheetName).to.equal("Manpower Databank");
		expect(picked.reason).to.equal("manpower_databank_name");
	});

	it("auto-picks the latest day sheet when multi-day", () => {
		const picked = pickManpowerDatabankSheet([
			"07-01",
			"07-10",
			"07-24",
			"07-03",
			"Summary",
		]);
		expect(picked.sheetName).to.equal("07-24");
		expect(picked.reason).to.equal("latest_day_sheet");
	});

	it("falls back to the first sheet when no known pattern matches", () => {
		const picked = pickManpowerDatabankSheet(["Roster A", "Roster B"]);
		expect(picked.sheetName).to.equal("Roster A");
		expect(picked.reason).to.equal("first_sheet_fallback");
	});

	it("parses BNPI Last, First M. names", () => {
		const parsed = parseBnpiPersonName("Salud, Arvin M.");
		expect(parsed).to.deep.equal({
			firstName: "Arvin",
			middleName: "M.",
			lastName: "Salud",
		});
	});

	it("maps active/inactive/resigned status labels", () => {
		expect(mapManpowerEmploymentStatus("Active")).to.equal("ACTIVE");
		expect(mapManpowerEmploymentStatus("Inactive")).to.equal("INACTIVE");
		expect(mapManpowerEmploymentStatus("Resigned")).to.equal("RESIGNED");
		expect(mapManpowerEmploymentStatus("Terminated")).to.equal("TERMINATED");
	});

	it("maps matrix rows from July-style headers with title row", () => {
		const matrix = [
			["BNPI-F-GHS-008-1"],
			[
				"ID No.",
				"ID No.",
				"Company",
				"Employment Status",
				"Date Hired",
				"Nationality",
				"Employee Name",
				"Department",
				"Section",
				"Position",
				"Status",
				"Gender",
			],
			[
				"21",
				"21",
				"BNPI",
				"Direct Hired",
				"2013-04-04",
				"Filipino",
				"Salud, Arvin M.",
				"Administration/Production",
				"Administration/Production",
				"Deputy General Manager",
				"Active",
				"M",
			],
			[
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			],
		];

		const mapped = mapManpowerDatabankMatrix(matrix);
		expect(mapped.headerRowIndex).to.equal(1);
		expect(mapped.rows).to.have.length(1);
		const row = mapped.rows[0];
		expect(row.employeeId).to.equal("00021");
		expect(row.firstName).to.equal("Arvin");
		expect(row.lastName).to.equal("Salud");
		expect(row.department).to.equal("Administration/Production");
		expect(row.position).to.equal("Deputy General Manager");
		expect(row.workforceSource).to.equal("DIRECT");
		expect(row.employmentStatus).to.equal("ACTIVE");
		expect(row.gender).to.equal("male");
		expect(row.sourceRow).to.equal(3);
	});
});
