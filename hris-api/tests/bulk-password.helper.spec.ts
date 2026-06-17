import { expect } from "chai";
import { buildBulkDefaultPassword } from "../helper/bulk-password.helper";

describe("buildBulkDefaultPassword", () => {
	it("builds password with spaces removed from surname", () => {
		expect(buildBulkDefaultPassword("Dela Cruz", "EMP3004", 2026)).to.equal(
			"delacruzEMP3004!2026",
		);
	});

	it("handles leading, trailing, and multiple internal spaces", () => {
		expect(buildBulkDefaultPassword("  Dela   Cruz  ", "EMP3004", 2026)).to.equal(
			"delacruzEMP3004!2026",
		);
	});

	it("preserves non-space punctuation characters", () => {
		expect(buildBulkDefaultPassword("O'Neil-Santos", "EMP3004", 2026)).to.equal(
			"o'neil-santosEMP3004!2026",
		);
	});
});
