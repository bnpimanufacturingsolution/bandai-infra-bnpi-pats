import { expect } from "chai";
import {
	formatDayLaborTypeLabel,
	normalizeDayLaborType,
} from "../helper/day-labor-type.helper";

describe("day-labor-type.helper", () => {
	it("accepts DIRECT and INDIRECT only", () => {
		expect(normalizeDayLaborType("DIRECT")).to.equal("DIRECT");
		expect(normalizeDayLaborType("indirect")).to.equal("INDIRECT");
		expect(normalizeDayLaborType("AGENCY")).to.equal(null);
		expect(normalizeDayLaborType("")).to.equal(null);
		expect(normalizeDayLaborType(null)).to.equal(null);
	});

	it("does not treat hire-source AGENCY as a day labor tag", () => {
		expect(normalizeDayLaborType("AGENCY")).to.equal(null);
		expect(formatDayLaborTypeLabel("DIRECT")).to.equal("Direct");
		expect(formatDayLaborTypeLabel(null)).to.equal("Not tagged");
	});
});
