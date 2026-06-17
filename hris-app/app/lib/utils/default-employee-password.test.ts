import { describe, expect, it } from "vitest";
import { buildDefaultEmployeePassword } from "./default-employee-password";

describe("buildDefaultEmployeePassword", () => {
	it("builds password with spaces removed from surname", () => {
		expect(buildDefaultEmployeePassword("Dela Cruz", "EMP3004", 2026)).to.equal(
			"delacruzEMP3004!2026",
		);
	});

	it("handles leading, trailing, and multiple internal spaces", () => {
		expect(buildDefaultEmployeePassword("  Dela   Cruz  ", "EMP3004", 2026)).to.equal(
			"delacruzEMP3004!2026",
		);
	});

	it("preserves non-space punctuation characters", () => {
		expect(buildDefaultEmployeePassword("O'Neil-Santos", "EMP3004", 2026)).to.equal(
			"o'neil-santosEMP3004!2026",
		);
	});
});
