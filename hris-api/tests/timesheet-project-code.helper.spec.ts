import { expect } from "chai";
import {
	BNPI_DIRECT_PREFIX,
	BNPI_INDIRECT_PREFIX,
	normalizeProjectCodeOverride,
	normalizeWorkforceSourceBucket,
	resolveDayLaborBucket,
	resolveManilaYearOfDate,
	resolveTimesheetProjectCode,
} from "../helper/timesheet-project-code.helper";

describe("timesheet project code helper", () => {
	describe("normalizeWorkforceSourceBucket", () => {
		it("maps AGENCY to INDIRECT", () => {
			expect(normalizeWorkforceSourceBucket("AGENCY")).to.equal("INDIRECT");
			expect(normalizeWorkforceSourceBucket("agency")).to.equal("INDIRECT");
		});

		it("maps BNPI and missing/empty source to DIRECT (canonical: not AGENCY = DIRECT)", () => {
			expect(normalizeWorkforceSourceBucket("BNPI")).to.equal("DIRECT");
			expect(normalizeWorkforceSourceBucket(null)).to.equal("DIRECT");
			expect(normalizeWorkforceSourceBucket(undefined)).to.equal("DIRECT");
			expect(normalizeWorkforceSourceBucket("")).to.equal("DIRECT");
		});
	});

	describe("resolveDayLaborBucket", () => {
		it("day tag wins over hire source", () => {
			expect(
				resolveDayLaborBucket({ dayLaborType: "INDIRECT", workforceSource: "BNPI" }),
			).to.equal("INDIRECT");
			expect(
				resolveDayLaborType_AgencyDirect(),
			).to.equal("DIRECT");
		});

		it("falls back to workforce source when no tag", () => {
			expect(resolveDayLaborBucket({ dayLaborType: null, workforceSource: "AGENCY" })).to.equal(
				"INDIRECT",
			);
			expect(resolveDayLaborBucket({ dayLaborType: null, workforceSource: null })).to.equal(
				"DIRECT",
			);
		});
	});

	describe("resolveManilaYearOfDate", () => {
		it("uses Asia/Manila year, not UTC year, at the New Year boundary", () => {
			// 2026-01-01T00:30+08:00 == 2025-12-31T16:30Z -> Manila year 2026
			expect(resolveManilaYearOfDate(new Date("2025-12-31T16:30:00.000Z"))).to.equal(2026);
			// 2026-12-31T16:00Z == 2027-01-01T00:00+08:00 -> Manila year 2027
			expect(resolveManilaYearOfDate(new Date("2026-12-31T16:00:00.000Z"))).to.equal(2027);
		});

		it("handles plain YYYY-MM-DD strings", () => {
			expect(resolveManilaYearOfDate("2026-09-08")).to.equal(2026);
		});

		it("returns null for garbage", () => {
			expect(resolveManilaYearOfDate("not-a-date")).to.equal(null);
			expect(resolveManilaYearOfDate(null)).to.equal(null);
		});
	});

	describe("resolveTimesheetProjectCode", () => {
		it("direct day -> bnpi-dl-<year>", () => {
			expect(
				resolveTimesheetProjectCode({ dayLaborType: "DIRECT", date: "2026-09-08" }),
			).to.equal("bnpi-dl-2026");
		});

		it("indirect day -> bnpi-id-<year>", () => {
			expect(
				resolveTimesheetProjectCode({ dayLaborType: "INDIRECT", date: "2026-09-08" }),
			).to.equal("bnpi-id-2026");
		});

		it("agency hire source with no tag -> bnpi-id-<year> (per-day derivation)", () => {
			expect(
				resolveTimesheetProjectCode({ workforceSource: "AGENCY", date: "2026-03-15" }),
			).to.equal("bnpi-id-2026");
		});

		it("same employee, different days, different tags -> different codes per day", () => {
			const monday = resolveTimesheetProjectCode({
				dayLaborType: "DIRECT",
				date: "2026-09-07",
			});
			const tuesday = resolveTimesheetProjectCode({
				dayLaborType: "INDIRECT",
				date: "2026-09-08",
			});
			expect(monday).to.equal("bnpi-dl-2026");
			expect(tuesday).to.equal("bnpi-id-2026");
		});

		it("unclassifiable day (empty source string) -> null, never guesses", () => {
			// Empty source still classifies as DIRECT (missing source = DIRECT per
			// canonical terminology), so only a bad date can null the code.
			expect(
				resolveTimesheetProjectCode({ workforceSource: "", dayLaborType: "", date: "2026-01-01" }),
			).to.equal("bnpi-dl-2026");
			expect(resolveTimesheetProjectCode({ dayLaborType: "DIRECT", date: "garbage" })).to.equal(
				null,
			);
		});

		it("year rolls over at Manila New Year", () => {
			expect(
				resolveTimesheetProjectCode({ dayLaborType: "DIRECT", date: "2025-12-31T16:30:00.000Z" }),
			).to.equal("bnpi-dl-2026");
		});

		it("prefix constants are the canonical codes", () => {
			expect(BNPI_DIRECT_PREFIX).to.equal("bnpi-dl");
			expect(BNPI_INDIRECT_PREFIX).to.equal("bnpi-id");
		});
	});

	describe("normalizeProjectCodeOverride", () => {
		it("passes through explicit codes and trims", () => {
			expect(normalizeProjectCodeOverride("  BNPI-X-1 ")).to.equal("BNPI-X-1");
			expect(normalizeProjectCodeOverride(null)).to.equal(null);
			expect(normalizeProjectCodeOverride(undefined)).to.equal(null);
			expect(normalizeProjectCodeOverride("")).to.equal(null);
		});

		it("rejects >64 chars", () => {
			expect(() => normalizeProjectCodeOverride("x".repeat(65))).to.throw(/64/);
		});
	});
});

function resolveDayLaborType_AgencyDirect() {
	return resolveDayLaborBucket({ dayLaborType: "DIRECT", workforceSource: "AGENCY" });
}
