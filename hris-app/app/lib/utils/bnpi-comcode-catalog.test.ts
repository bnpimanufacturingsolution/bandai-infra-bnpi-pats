import { describe, expect, it } from "vitest";
import {
	BNPI_COMCODE_CATALOG,
	resolveBenefitDisplay,
} from "./bnpi-comcode-catalog";

describe("bnpi-comcode-catalog", () => {
	it("maps BNPI screenshot codes to human descriptions", () => {
		expect(BNPI_COMCODE_CATALOG.DMA.description).toBe("De Minimis Allowance");
		expect(BNPI_COMCODE_CATALOG.AON.description).toBe("Adjustment OT/ND");
		expect(BNPI_COMCODE_CATALOG.PFA.description).toBe("Perfect Attendance");
		expect(BNPI_COMCODE_CATALOG.MTX.description).toMatch(/Matrix/i);
	});

	it("never titles MTX as MTX · MTX", () => {
		const d = resolveBenefitDisplay({
			code: "MTX",
			typeName: "MTX",
			typeDescription: "Code label NEEDS_CONFIRMATION; treated as gross-included compensation.",
			enrollmentName: "MTX",
		});
		expect(d.title).toBe("MTX · Matrix / Other Comp");
		expect(d.description).toBe("Matrix / Other Comp");
		expect(d.title).not.toMatch(/^MTX · MTX$/);
	});

	it("prefers real DB type name over catalog when useful", () => {
		const d = resolveBenefitDisplay({
			code: "AON",
			typeName: "Adjustment OT/ND",
			enrollmentName: "AON",
		});
		expect(d.description).toBe("Adjustment OT/ND");
		expect(d.title).toBe("AON · Adjustment OT/ND");
	});

	it("ignores NEEDS_CONFIRMATION type descriptions", () => {
		const d = resolveBenefitDisplay({
			code: "ABS",
			typeName: "ABS",
			typeDescription:
				"Code label NEEDS_CONFIRMATION; treated as post-gross net adjustment until HRIS label is confirmed.",
		});
		expect(d.description).toBe("Adjustment Basic");
		expect(d.fromCatalog).toBe(true);
	});
});
