import { describe, expect, it } from "vitest";
import {
	buildJobDateCode,
	buildJobDisplayCode,
	buildJobDisplayCodes,
	buildJobPositionInitials,
} from "./recruitment-job-code";

describe("recruitment-job-code utils", () => {
	it("uses per-word initials for multi-word titles (max 3 words)", () => {
		expect(buildJobPositionInitials("Software Engineer")).toBe("SE");
		expect(buildJobPositionInitials("Deputy General Manager")).toBe("DGM");
		expect(buildJobPositionInitials("Chief Technology Officer Emeritus")).toBe("CTO");
	});

	it("uses the first two letters for single-word titles", () => {
		expect(buildJobPositionInitials("Operator")).toBe("OP");
		expect(buildJobPositionInitials("IT")).toBe("IT");
		expect(buildJobPositionInitials("A")).toBe("A");
	});

	it("strips non-letters and survives messy titles", () => {
		expect(buildJobPositionInitials("  Jr. - Specialist  ")).toBe("JS");
		expect(buildJobPositionInitials("&/^%")).toBe("JOB");
		expect(buildJobPositionInitials(null)).toBe("JOB");
		expect(buildJobPositionInitials(undefined)).toBe("JOB");
	});

	it("formats createdAt as MMDDYYYY (local)", () => {
		expect(buildJobDateCode(new Date(2026, 0, 18))).toBe("01182026");
		expect(buildJobDateCode(new Date(2026, 10, 3).toISOString())).toBe("11032026");
		expect(buildJobDateCode("garbage")).toBe("");
		expect(buildJobDateCode(null)).toBe("");
	});

	it("composes the operator sample SE-01182026", () => {
		expect(buildJobDisplayCode("Software Engineer", new Date(2026, 0, 18))).toBe("SE-01182026");
		expect(buildJobDisplayCode("Operator", null)).toBe("OP");
	});

	it("dedupes same position + same day with ordered suffixes", () => {
		const day = new Date(2026, 8, 14).toISOString();
		const codes = buildJobDisplayCodes([
			{ id: "j1", positionTitle: "Factory Manager", createdAt: day },
			{ id: "j2", positionTitle: "Factory Manager", createdAt: day },
			{ id: "j3", positionTitle: "Factory Manager", createdAt: day },
			{ id: "j4", positionTitle: "Operator", createdAt: day },
		]);

		expect(codes.j1).toBe("FM-09142026");
		expect(codes.j2).toBe("FM-09142026-2");
		expect(codes.j3).toBe("FM-09142026-3");
		expect(codes.j4).toBe("OP-09142026");
	});

	it("prefers the canonical Position.code over derived initials", () => {
		const day = new Date(2026, 0, 18);
		expect(buildJobDisplayCode("Software Engineer", day, "SW-MGR")).toBe("SW-MGR-01182026");
		expect(buildJobDisplayCode("Operator", day, "opr")).toBe("OPR-01182026");
		expect(buildJobDisplayCode("Operator", day, "  OPR  ")).toBe("OPR-01182026");
		// Numeric legacy codes are valid Position.code values and stay as-is.
		expect(buildJobDisplayCode("Factory Manager", day, "23")).toBe("23-01182026");
		expect(buildJobDisplayCode("Odd", day, "a/b c")).toBe("ABC-01182026");
	});

	it("falls back to initials when position code is missing or unusable", () => {
		const day = new Date(2026, 0, 18);
		expect(buildJobDisplayCode("Operator", day, "")).toBe("OP-01182026");
		expect(buildJobDisplayCode("Operator", day, null)).toBe("OP-01182026");
		expect(buildJobDisplayCode("Operator", day, "---")).toBe("OP-01182026");
	});

	it("codes map keys by canonical code and suffixes same code + same day", () => {
		const day = new Date(2026, 7, 25).toISOString();
		const codes = buildJobDisplayCodes([
			{ id: "a", positionTitle: "Operator", positionCode: "OPR", createdAt: day },
			{ id: "b", positionTitle: "Operator", positionCode: "17", createdAt: day },
			{ id: "c", positionTitle: "Factory Manager", positionCode: "23", createdAt: day },
			{ id: "d", positionTitle: "Factory Manager", positionCode: "23", createdAt: day },
		]);

		// Same title but different position codes need no suffix.
		expect(codes.a).toBe("OPR-08252026");
		expect(codes.b).toBe("17-08252026");
		expect(codes.c).toBe("23-08252026");
		expect(codes.d).toBe("23-08252026-2");
	});

	it("ignores entries without ids and handles empty lists", () => {
		expect(buildJobDisplayCodes([])).toEqual({});
		expect(
			buildJobDisplayCodes([
				{ id: "", positionTitle: "Operator", createdAt: new Date() },
				{ id: "  ", positionTitle: "Operator", createdAt: new Date() },
			]),
		).toEqual({});
	});
});
