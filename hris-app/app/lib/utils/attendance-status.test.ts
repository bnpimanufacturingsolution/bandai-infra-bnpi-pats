import { describe, expect, it } from "vitest";
import {
	compareClockedInFirst,
	isOverviewPresentRecord,
} from "./attendance-status";

describe("overview PRES", () => {
	it("counts a punch as present and leftover obligation status as not present", () => {
		expect(isOverviewPresentRecord({ status: "INCOMPLETE", timeIn: "2026-08-17T11:51:45.000Z" })).toBe(
			true,
		);
		expect(isOverviewPresentRecord({ status: "PRESENT", timeIn: null })).toBe(false);
		expect(isOverviewPresentRecord({ status: "ABSENT", timeIn: null })).toBe(false);
	});

	it("ranks clocked-in people ahead of alphabetical absents", () => {
		const ranked = [
			{ employeeName: "Aileen", status: "ABSENT", timeIn: null },
			{ employeeName: "Joys Ador Zuniga", status: "INCOMPLETE", timeIn: "2026-08-17T11:51:45.000Z" },
			{ employeeName: "Alberto", status: "NOT_CLOCKED_IN", timeIn: null },
		].sort(compareClockedInFirst);
		expect(ranked[0].employeeName).toBe("Joys Ador Zuniga");
		expect(ranked[1].employeeName).toBe("Aileen");
	});
});
