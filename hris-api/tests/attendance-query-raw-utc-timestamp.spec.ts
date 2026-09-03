import { expect } from "chai";
import { readQueryRawUtcTimestamp } from "../helper/attendance.helper";

describe("readQueryRawUtcTimestamp", () => {
	it("keeps Hikvision UTC punches that already have a Z suffix", () => {
		const parsed = readQueryRawUtcTimestamp("2026-08-17T05:40:36.000Z");
		expect(parsed?.toISOString()).to.equal("2026-08-17T05:40:36.000Z");
	});

	it("treats naive SQL/ISO wall clocks as UTC, matching Device Event 1:40 PM Manila", () => {
		expect(readQueryRawUtcTimestamp("2026-08-17T05:40:36")?.toISOString()).to.equal(
			"2026-08-17T05:40:36.000Z",
		);
		expect(readQueryRawUtcTimestamp("2026-08-17 05:40:36.000")?.toISOString()).to.equal(
			"2026-08-17T05:40:36.000Z",
		);
	});

	it("rebuilds node-pg timestamp-without-tz Dates from local wall-clock components", () => {
		// node-pg on a Manila host turns stored `2026-08-17 05:40:36` into a Date
		// whose local components are 05:40:36 (instant 2026-08-16T21:40:36.000Z).
		const pgStyle = new Date(2026, 7, 17, 5, 40, 36, 0);
		expect(readQueryRawUtcTimestamp(pgStyle)?.toISOString()).to.equal(
			"2026-08-17T05:40:36.000Z",
		);
	});

	it("does not show 5:40 AM Manila for Zen's 13:40 device tap", () => {
		const pgStyle = new Date(2026, 7, 17, 5, 40, 36, 0);
		const instant = readQueryRawUtcTimestamp(pgStyle);
		const manila = new Intl.DateTimeFormat("en-US", {
			timeZone: "Asia/Manila",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
			.format(instant as Date)
			.replace(/\s/g, " ");
		expect(manila).to.equal("1:40 PM");
		expect(manila.includes("5:40")).to.equal(false);
	});
});
