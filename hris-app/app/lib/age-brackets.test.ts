import { describe, expect, it } from "vitest";
import {
	AGE_BRACKETS,
	computeAge,
	summarizeAgeBrackets,
} from "./age-brackets";

const asOf = new Date("2026-08-25T00:00:00Z");

describe("age-brackets", () => {
	it("computes age from birthdate honoring month/day", () => {
		expect(computeAge("2000-08-24", asOf)).to.equal(26);
		expect(computeAge("2000-08-26", asOf)).to.equal(25);
		expect(computeAge(null, asOf)).to.be.null;
	});

	it("buckets people into the standard brackets", () => {
		const summary = summarizeAgeBrackets(
			[
				{ dateOfBirth: "2000-05-01" },
				{ dateOfBirth: "1995-01-01" },
				{ dateOfBirth: "1990-06-15" },
				{ dateOfBirth: "1970-02-02" },
			],
			asOf,
		);
		const byId = Object.fromEntries(summary.rows.map((row) => [row.id, row.count]));
		expect(byId["25-34"]).to.equal(2);
		expect(byId["35-44"]).to.equal(1);
		expect(byId["55-64"]).to.equal(1);
	});

	it("tracks unknown ages separately and averages the known", () => {
		const summary = summarizeAgeBrackets(
			[{ dateOfBirth: "1996-01-01" }, {}, { dateOfBirth: "" }],
			asOf,
		);
		expect(summary.withAge).to.equal(1);
		expect(summary.withoutAge).to.equal(2);
		expect(summary.averageAge).to.equal(30);
		expect(AGE_BRACKETS).to.have.lengthOf(6);
	});
});
