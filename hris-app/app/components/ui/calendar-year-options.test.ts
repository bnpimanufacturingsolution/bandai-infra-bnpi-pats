import { describe, expect, it } from "vitest";
import { orderCalendarDropdownOptions } from "./calendar";

describe("orderCalendarDropdownOptions", () => {
	it("keeps month options in calendar order", () => {
		const months = [
			{ value: 0, label: "Jan" },
			{ value: 6, label: "Jul" },
			{ value: 11, label: "Dec" },
		];
		expect(orderCalendarDropdownOptions(months).selectOptions.map((item) => item.label)).toEqual(
			["Jan", "Jul", "Dec"],
		);
	});

	it("lists years newest first so 2026 is not buried under 1919", () => {
		const years = Array.from({ length: 108 }, (_, index) => ({
			value: 1919 + index,
			label: String(1919 + index),
		}));
		const ordered = orderCalendarDropdownOptions(years).selectOptions.map((item) => item.label);
		expect(ordered[0]).toBe("2026");
		expect(ordered[ordered.length - 1]).toBe("1919");
	});
});
