import { describe, expect, it } from "vitest";
import { calendarYearGridPage, orderCalendarDropdownOptions } from "./calendar";

describe("orderCalendarDropdownOptions", () => {
	it("maps 0-based month indexes to names so February is Feb not 1", () => {
		const months = [
			{ value: 0, label: "1" },
			{ value: 1, label: "2" },
			{ value: 11, label: "12" },
		];
		expect(orderCalendarDropdownOptions(months).selectOptions.map((item) => item.label)).toEqual(
			["Jan", "Feb", "Dec"],
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

describe("calendarYearGridPage", () => {
	it("keeps the selected year on the visible page", () => {
		const years = Array.from({ length: 40 }, (_, index) => 1990 + index);
		const page = calendarYearGridPage(2002, years);
		expect(page.years).toContain(2002);
		expect(page.years[0]).toBe(2002 - (2002 - 1990) % 12);
	});
});
