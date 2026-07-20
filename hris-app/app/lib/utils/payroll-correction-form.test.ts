import { describe, expect, it } from "vitest";
import {
	buildCorrectionRowFromBreakdownDay,
	buildPayrollCorrectionPayload,
	deriveHoursTypeFromProposedClocks,
	durationMinutesFromClocks,
	evaluatePayrollCorrectionSubmit,
	extractClockFromIso,
	getChangedSelectedDays,
	parseAfterMinutesInput,
	withProposedClocks,
	type PayrollCorrectionDayRow,
} from "./payroll-correction-form";

const row = (
	partial: Partial<PayrollCorrectionDayRow> & Pick<PayrollCorrectionDayRow, "date">,
): PayrollCorrectionDayRow => ({
	selected: false,
	hoursType: "OT",
	beforeMinutes: 0,
	afterMinutes: 0,
	timeIn: "",
	timeOut: "",
	originalTimeIn: "",
	originalTimeOut: "",
	originalRegularMinutes: 0,
	originalOtMinutes: 0,
	...partial,
});

describe("payroll-correction-form", () => {
	it("allows multi-day select when only some days have a minutes change", () => {
		const rows = [
			row({ date: "2026-06-01", selected: true, beforeMinutes: 0, afterMinutes: 120 }),
			row({ date: "2026-06-02", selected: true, beforeMinutes: 480, afterMinutes: 480 }),
			row({ date: "2026-06-03", selected: false, beforeMinutes: 0, afterMinutes: 60 }),
		];

		const evalResult = evaluatePayrollCorrectionSubmit({
			reason: "Missed OT on Jun 1",
			rows,
		});

		expect(evalResult.canSubmit).toBe(true);
		expect(evalResult.changedDays).toHaveLength(1);
		expect(evalResult.changedDays[0].date).toBe("2026-06-01");
		expect(evalResult.errors.selectedWithoutChange).toBe(false);
	});

	it("blocks submit when selected days have no delta even with a reason", () => {
		const rows = [
			row({ date: "2026-06-01", selected: true, beforeMinutes: 60, afterMinutes: 60 }),
			row({ date: "2026-06-02", selected: true, beforeMinutes: 0, afterMinutes: 0 }),
		];

		const evalResult = evaluatePayrollCorrectionSubmit({
			reason: "Trying to submit",
			rows,
		});

		expect(evalResult.canSubmit).toBe(false);
		expect(evalResult.errors.selectedWithoutChange).toBe(true);
		expect(evalResult.errors.reasonRequired).toBe(false);
	});

	it("blocks submit without reason even when deltas exist", () => {
		const rows = [
			row({ date: "2026-06-01", selected: true, beforeMinutes: 0, afterMinutes: 90 }),
		];
		const evalResult = evaluatePayrollCorrectionSubmit({ reason: "   ", rows });
		expect(evalResult.canSubmit).toBe(false);
		expect(evalResult.errors.reasonRequired).toBe(true);
	});

	it("builds payload only with changed selected days", () => {
		const rows = [
			row({
				date: "2026-06-01",
				selected: true,
				hoursType: "OT",
				beforeMinutes: 0,
				afterMinutes: 120,
				timeIn: "17:00",
				timeOut: "19:00",
			}),
			row({
				date: "2026-06-02",
				selected: true,
				hoursType: "REGULAR",
				beforeMinutes: 480,
				afterMinutes: 480,
				timeIn: "08:00",
				timeOut: "16:00",
			}),
			row({
				date: "2026-06-03",
				selected: true,
				hoursType: "OT",
				beforeMinutes: 0,
				afterMinutes: 30,
				timeIn: "18:00",
				timeOut: "18:30",
			}),
		];

		const built = buildPayrollCorrectionPayload({
			reason: "Two OT days",
			rows,
		});

		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.payload.dayDeltas).toHaveLength(2);
		expect(built.payload.dayDeltas.map((d) => d.date)).toEqual([
			"2026-06-01",
			"2026-06-03",
		]);
		expect(built.payload.dayDeltas[0].deltaMinutes).toBe(120);
		expect(built.payload.dayDeltas[0].timeIn).toBe("17:00");
		expect(built.payload.dayDeltas[0].timeOut).toBe("19:00");
		expect(built.payload.dayDeltas[1].deltaMinutes).toBe(30);
	});

	it("getChangedSelectedDays ignores unselected deltas", () => {
		const rows = [
			row({ date: "2026-06-01", selected: false, beforeMinutes: 0, afterMinutes: 999 }),
			row({ date: "2026-06-02", selected: true, beforeMinutes: 10, afterMinutes: 20 }),
		];
		expect(getChangedSelectedDays(rows)).toHaveLength(1);
		expect(getChangedSelectedDays(rows)[0].date).toBe("2026-06-02");
	});

	it("parseAfterMinutesInput allows empty so the field can be cleared and retyped", () => {
		expect(parseAfterMinutesInput("")).toBe("");
		expect(parseAfterMinutesInput("  ")).toBe("");
		expect(parseAfterMinutesInput("90")).toBe(90);
		expect(parseAfterMinutesInput("-5")).toBe(0);
		expect(parseAfterMinutesInput("12.6")).toBe(13);
	});

	it("durationMinutesFromClocks handles same-day and overnight spans", () => {
		expect(durationMinutesFromClocks("08:00", "17:00")).toBe(540);
		expect(durationMinutesFromClocks("20:00", "05:00")).toBe(540);
		expect(durationMinutesFromClocks("09:00", "")).toBe("");
		expect(durationMinutesFromClocks("", "17:00")).toBe("");
	});

	it("withProposedClocks re-derives afterMinutes and auto hoursType from time in/out", () => {
		const base = row({
			date: "2026-06-02",
			timeIn: "08:00",
			timeOut: "17:00",
			beforeMinutes: 540,
			afterMinutes: 540,
			originalTimeIn: "08:00",
			originalTimeOut: "17:00",
			originalRegularMinutes: 480,
			originalOtMinutes: 60,
		});
		const patched = withProposedClocks(base, { timeOut: "18:00" });
		expect(patched.timeIn).toBe("08:00");
		expect(patched.timeOut).toBe("18:00");
		expect(patched.afterMinutes).toBe(600);
		expect(patched.hoursType).toBe("OT");
	});

	it("deriveHoursTypeFromProposedClocks classifies from clocks", () => {
		expect(
			deriveHoursTypeFromProposedClocks({
				timeIn: "",
				timeOut: "",
				afterMinutes: "",
				beforeMinutes: 480,
				originalTimeIn: "08:00",
				originalTimeOut: "16:00",
			}),
		).toBe("ABSENT");

		expect(
			deriveHoursTypeFromProposedClocks({
				timeIn: "08:00",
				timeOut: "18:00",
				afterMinutes: 600,
				beforeMinutes: 480,
				originalTimeIn: "08:00",
				originalTimeOut: "16:00",
				originalRegularMinutes: 480,
			}),
		).toBe("OT");

		expect(
			deriveHoursTypeFromProposedClocks({
				timeIn: "09:00",
				timeOut: "16:00",
				afterMinutes: 420,
				beforeMinutes: 480,
				originalTimeIn: "08:00",
				originalTimeOut: "16:00",
			}),
		).toBe("LATE");

		expect(
			deriveHoursTypeFromProposedClocks({
				timeIn: "08:00",
				timeOut: "15:00",
				afterMinutes: 420,
				beforeMinutes: 480,
				originalTimeIn: "08:00",
				originalTimeOut: "16:00",
			}),
		).toBe("EARLY_OUT");

		expect(
			deriveHoursTypeFromProposedClocks({
				timeIn: "08:00",
				timeOut: "16:00",
				afterMinutes: 480,
				beforeMinutes: 480,
				originalTimeIn: "08:00",
				originalTimeOut: "16:00",
				originalRegularMinutes: 480,
				originalOtMinutes: 0,
			}),
		).toBe("REGULAR");
	});

	it("blocks delta when only one clock is filled", () => {
		const rows = [
			row({
				date: "2026-06-01",
				selected: true,
				beforeMinutes: 0,
				afterMinutes: 120,
				timeIn: "08:00",
				timeOut: "",
			}),
		];
		const evalResult = evaluatePayrollCorrectionSubmit({
			reason: "Incomplete clocks",
			rows,
		});
		expect(evalResult.canSubmit).toBe(false);
		expect(evalResult.errors.selectedWithoutChange).toBe(true);
	});

	it("buildCorrectionRowFromBreakdownDay prefills clocks and paid span", () => {
		const built = buildCorrectionRowFromBreakdownDay(
			{
				date: "2026-06-02",
				timeIn: "2026-06-02T00:00:00.000Z", // local extract may vary; use clock-ish via hoursWorked fallback
				timeOut: "2026-06-02T10:02:00.000Z",
				hoursWorked: "10:02",
				regularHours: "8:00",
				overtimeHours: "2:02",
			},
			true,
		);
		expect(built.date).toBe("2026-06-02");
		expect(built.selected).toBe(true);
		expect(built.hoursType).toBe("OT");
		// before is clock span when extractable, else hoursWorked
		expect(built.beforeMinutes).toBeGreaterThan(0);
		expect(built.afterMinutes).toBe(built.beforeMinutes);
	});

	it("extractClockFromIso accepts already-formatted clocks", () => {
		expect(extractClockFromIso("08:30")).toBe("08:30");
		expect(extractClockFromIso("")).toBe("");
	});
});
