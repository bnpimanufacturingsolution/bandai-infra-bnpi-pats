import { expect } from "chai";
import {
	TALLY_CORE_KEYS,
	TALLY_KEY_FIELDS,
	bucketBands,
	classifyTally,
	money,
	normCode,
} from "../helper/tally-compare.helper";

describe("tally-compare helper (all-period tally script core)", () => {
	it("parses client register money cells", () => {
		expect(money("1,834.50")).to.equal(1834.5);
		expect(money("          7,727.35 ")).to.equal(7727.35);
		expect(money("-")).to.equal(0);
		expect(money("")).to.equal(0);
		expect(money(null)).to.equal(0);
		expect(money(2006.49)).to.equal(2006.49);
	});

	it("normalizes employee codes to padded 5-digit form", () => {
		expect(normCode("403")).to.equal("00403");
		expect(normCode("1792")).to.equal("01792");
		expect(normCode("01792")).to.equal("01792");
		expect(normCode("")).to.equal("");
		expect(normCode(null)).to.equal("");
	});

	it("includes Leave/leavePay in the compared set but NOT in the TALLIED core", () => {
		const keys = TALLY_KEY_FIELDS.map((f) => f.key);
		expect(keys).to.include("leavePay");
		expect(TALLY_CORE_KEYS).to.not.include("leavePay");
	});

	it("bands a fully matching employee as TALLIED even when leavePay differs", () => {
		const base = {
			gross: 1000, net: 900, totalReceivable: 950, ot: 100, absent: 0,
			late: 0, totalDedn: 100, regOtHrs: 2, leavePay: 0,
		};
		const c = classifyTally(base, { ...base, leavePay: 500 });
		expect(c.band).to.equal("TALLIED");
		expect(c.fieldMatch.leavePay).to.equal(false);
	});

	it("reproduces the Alexa-near band (OT exact, TR within ₱1)", () => {
		const target = {
			gross: 7727.35, net: 7727.35, totalReceivable: 8227.35, ot: 2006.49,
			absent: 1834.5, late: 419.64, totalDedn: 0, regOtHrs: 21, leavePay: 0,
		};
		const app = {
			gross: 7726.58, net: 7726.58, totalReceivable: 8226.58, ot: 2006.49,
			absent: 1834.5, late: 420.41, totalDedn: 0, regOtHrs: 21, leavePay: 0,
		};
		expect(classifyTally(target, app).band).to.equal("ALEXA_NEAR");
	});

	it("bands OT-only matches and unmatched rows", () => {
		const target = {
			gross: 5000, net: 4800, totalReceivable: 5100, ot: 300,
			absent: 200, late: 0, totalDedn: 100, regOtHrs: 3, leavePay: 0,
		};
		const otOk = classifyTally(target, {
			...target, totalReceivable: 5140, gross: 5040,
		});
		expect(otOk.band).to.equal("OT_OK_NEAR_50");

		const unmatch = classifyTally(target, {
			gross: 9999, net: 9999, totalReceivable: 9999, ot: 1,
			absent: 1, late: 1, totalDedn: 1, regOtHrs: 99, leavePay: 0,
		});
		expect(unmatch.band).to.equal("UNMATCH");
	});

	it("skips the optional ARP column only when app is 0 and target is not", () => {
		const base = {
			gross: 1000, net: 900, totalReceivable: 950, ot: 100, absent: 0,
			late: 0, totalDedn: 100, regOtHrs: 2, leavePay: 0, arp: 0,
		};
		const c = classifyTally({ ...base, arp: 200 }, base);
		expect(c.fieldMatch.arp).to.equal("SKIP_OPTIONAL");
	});

	it("buckets band counts for summaries", () => {
		expect(bucketBands([{ band: "TALLIED" }, { band: "TALLIED" }, { band: "UNMATCH" }])).to.deep.equal({
			TALLIED: 2,
			UNMATCH: 1,
		});
	});
});
