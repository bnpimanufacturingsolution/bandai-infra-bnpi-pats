import { describe, expect, it } from "vitest";
import { formatManilaClockTime } from "./manila-clock";

describe("formatManilaClockTime", () => {
	it("shows Hikvision UTC punches in Manila time like Device Events", () => {
		const label = formatManilaClockTime("2026-08-17T05:40:36.000Z").replace(/\s/g, " ");
		expect(label).to.equal("1:40 PM");
	});

	it("does not show the UTC hour as if it were already Manila", () => {
		const label = formatManilaClockTime("2026-08-17T05:40:36.000Z");
		expect(label.includes("5:40")).to.equal(false);
	});

	it("does not treat a double-shifted 21:40Z obligation as the device clock", () => {
		const correct = formatManilaClockTime("2026-08-17T05:40:36.000Z").replace(/\s/g, " ");
		const shifted = formatManilaClockTime("2026-08-16T21:40:36.000Z").replace(/\s/g, " ");
		expect(correct).to.equal("1:40 PM");
		expect(shifted).to.equal("5:40 AM");
	});
});
