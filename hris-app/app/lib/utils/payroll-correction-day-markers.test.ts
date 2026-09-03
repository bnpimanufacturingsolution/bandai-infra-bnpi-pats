import { describe, expect, it } from "vitest";
import {
	buildPayrollCorrectionMarkersByDate,
	extractPayrollCorrectionItems,
	formatMinutesShort,
} from "./payroll-correction-day-markers";

describe("payroll-correction-day-markers", () => {
	it("indexes requested and ready corrections by day and prefers REQUESTED marker", () => {
		const map = buildPayrollCorrectionMarkersByDate([
			{
				id: "c1",
				status: "READY",
				reason: "approved ot",
				dayDeltas: [
					{
						date: "2026-06-02",
						hoursType: "OT",
						beforeMinutes: 0,
						afterMinutes: 60,
						deltaMinutes: 60,
					},
				],
			},
			{
				id: "c2",
				status: "REQUESTED",
				reason: "pending ot",
				dayDeltas: [
					{
						date: "2026-06-02",
						hoursType: "OT",
						beforeMinutes: 60,
						afterMinutes: 120,
						deltaMinutes: 60,
					},
					{
						date: "2026-06-03",
						hoursType: "REGULAR",
						beforeMinutes: 480,
						afterMinutes: 540,
						deltaMinutes: 60,
					},
				],
			},
			{
				id: "c3",
				status: "REJECTED",
				dayDeltas: [
					{
						date: "2026-06-04",
						hoursType: "OT",
						beforeMinutes: 0,
						afterMinutes: 30,
						deltaMinutes: 30,
					},
				],
			},
		]);

		expect(map.has("2026-06-04")).toBe(false);
		expect(map.get("2026-06-02")?.status).toBe("REQUESTED");
		expect(map.get("2026-06-02")?.badgeTone).toBe("correction-requested");
		expect(map.get("2026-06-02")?.deltas).toHaveLength(2);
		expect(map.get("2026-06-03")?.status).toBe("REQUESTED");
		expect(map.get("2026-06-03")?.deltas[0].deltaMinutes).toBe(60);
	});

	it("formats minutes and extracts list payload shapes", () => {
		expect(formatMinutesShort(90)).toBe("1:30");
		expect(formatMinutesShort(-15)).toBe("-0:15");
		expect(
			extractPayrollCorrectionItems({ items: [{ id: "a", status: "READY" }] }),
		).toHaveLength(1);
		expect(
			extractPayrollCorrectionItems({ data: { items: [{ id: "b", status: "REQUESTED" }] } }),
		).toHaveLength(1);
	});
});
