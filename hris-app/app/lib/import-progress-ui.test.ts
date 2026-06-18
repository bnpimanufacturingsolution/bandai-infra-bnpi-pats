import { describe, expect, it } from "vitest";
import {
	formatElapsedImportTime,
	getImportProgressElapsedMs,
	parseImportDateMs,
	shortenImportError,
} from "./import-progress-ui";

describe("import progress UI helpers", () => {
	describe("formatElapsedImportTime", () => {
		it("shows a placeholder when elapsed time is missing or negative", () => {
			expect(formatElapsedImportTime(null)).toBe("-");
			expect(formatElapsedImportTime(0)).toBe("-");
			expect(formatElapsedImportTime(-1)).toBe("-");
		});

		it("formats sub-second durations in milliseconds", () => {
			expect(formatElapsedImportTime(450)).toBe("450ms");
		});

		it("formats second durations", () => {
			expect(formatElapsedImportTime(1400)).toBe("1s");
			expect(formatElapsedImportTime(44_600)).toBe("45s");
		});

		it("formats minute durations", () => {
			expect(formatElapsedImportTime(125_000)).toBe("2m 5s");
		});

		it("formats hour durations", () => {
			expect(formatElapsedImportTime(7_560_000)).toBe("2h 6m");
		});
	});

	describe("getImportProgressElapsedMs", () => {
		it("uses explicit durationMs when the API provides it", () => {
			expect(
				getImportProgressElapsedMs({
					startedAt: "2026-05-25T10:00:00.000Z",
					completedAt: "2026-05-25T10:10:00.000Z",
					durationMs: 1234,
				}),
			).toBe(1234);
		});

		it("calculates elapsed time from completed and started timestamps", () => {
			expect(
				getImportProgressElapsedMs({
					startedAt: "2026-05-25T10:00:00.000Z",
					completedAt: "2026-05-25T10:02:05.000Z",
				}),
			).toBe(125_000);
		});

		it("calculates in-flight elapsed time with an injected current time", () => {
			expect(
				getImportProgressElapsedMs(
					{
						startedAt: "2026-05-25T10:00:00.000Z",
					},
					Date.parse("2026-05-25T10:00:09.000Z"),
				),
			).toBe(9000);
		});

		it("returns null for missing or invalid start timestamps", () => {
			expect(getImportProgressElapsedMs(null)).toBeNull();
			expect(getImportProgressElapsedMs({ startedAt: "not-a-date" })).toBeNull();
		});
	});

	describe("parseImportDateMs", () => {
		it("parses valid date strings and rejects invalid values", () => {
			expect(parseImportDateMs("2026-05-25T10:00:00.000Z")).toBe(
				Date.parse("2026-05-25T10:00:00.000Z"),
			);
			expect(parseImportDateMs("invalid")).toBeNull();
			expect(parseImportDateMs(undefined)).toBeNull();
		});
	});

	describe("shortenImportError", () => {
		it("prefers an error line over surrounding stack text", () => {
			expect(shortenImportError("stack line\nInvalid employee id\nmore")).toBe(
				"Invalid employee id",
			);
		});

		it("truncates long messages to keep progress rows readable", () => {
			expect(shortenImportError("Error: " + "x".repeat(120), 20)).toBe(
				"Error: xxxxxxxxxxxxx...",
			);
		});
	});
});
