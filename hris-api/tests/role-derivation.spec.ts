/**
 * Role Derivation Utility â€” Backend Tests
 * Stack: Mocha + Chai (expect style)
 * Run: mocha --require ts-node/register tests/role-derivation.spec.ts
 */

import { expect } from "chai";
import {
	deriveRoleAndFlags,
	deriveRoleAndFlagsFromRecord,
	isManagerLevel,
	isHrDepartment,
	MANAGER_LEVELS,
	NON_MANAGER_LEVELS,
	VALID_LEVELS,
} from "../utils/role-derivation";

const TEST_TIMEOUT = 5000;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PRIMARY function: deriveRoleAndFlagsFromRecord  (uses isHr / isManager flags)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

describe("deriveRoleAndFlagsFromRecord -- spec acceptance criteria", () => {
	// Required test cases from spec

	it("isHr=true, isManager=true â†’ hris-hr-manager, isHrManager=true, isManager=false", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: true }, { isManager: true });
		expect(result.role).to.equal("hris-hr-manager");
		expect(result.isHrManager).to.equal(true);
		expect(result.isManager).to.equal(false);
	});

	it("isHr=true, isManager=false â†’ hris-hr-user, flags both false", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: true }, { isManager: false });
		expect(result.role).to.equal("hris-hr-user");
		expect(result.isHrManager).to.equal(false);
		expect(result.isManager).to.equal(false);
	});

	it("isHr=false, isManager=true â†’ hris-employee-manager, isManager=true, isHrManager=false", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: false }, { isManager: true });
		expect(result.role).to.equal("hris-employee-manager");
		expect(result.isManager).to.equal(true);
		expect(result.isHrManager).to.equal(false);
	});

	it("isHr=false, isManager=false â†’ hris-employee, flags both false", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: false }, { isManager: false });
		expect(result.role).to.equal("hris-employee");
		expect(result.isManager).to.equal(false);
		expect(result.isHrManager).to.equal(false);
	});
});

describe("deriveRoleAndFlags object API -- canonical source of truth", () => {
	it("department.isHr=true + level.isManager=true => hris-hr-manager", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlags({
			department: { isHr: true },
			level: { isManager: true },
		});
		expect(result.role).to.equal("hris-hr-manager");
		expect(result.isHrManager).to.equal(true);
		expect(result.isManager).to.equal(false);
	});

	it("normalizes string booleans before strict checks", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlags({
			department: { isHr: "true" },
			level: { isManager: "true" },
		});
		expect(result.role).to.equal("hris-hr-manager");
		expect(result.isHrManager).to.equal(true);
		expect(result.isManager).to.equal(false);
	});

	it("uses position.isManager when no level is selected", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlags({
			department: { isHr: false },
			level: null,
			position: { isManager: true },
		});
		expect(result.role).to.equal("hris-employee-manager");
		expect(result.isManager).to.equal(true);
		expect(result.isHrManager).to.equal(false);
	});
});

describe("deriveRoleAndFlagsFromRecord -- missing/null flags treated as false", () => {
	it("dept.isHr=undefined, level.isManager=undefined â†’ hris-employee", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({}, {});
		expect(result.role).to.equal("hris-employee");
		expect(result.isManager).to.equal(false);
		expect(result.isHrManager).to.equal(false);
	});

	it("dept.isHr=null, level.isManager=null â†’ hris-employee", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: null }, { isManager: null });
		expect(result.role).to.equal("hris-employee");
	});

	it("dept.isHr=null, level.isManager=true â†’ hris-employee-manager", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: null }, { isManager: true });
		expect(result.role).to.equal("hris-employee-manager");
		expect(result.isManager).to.equal(true);
	});

	it("dept.isHr=true, level.isManager=undefined â†’ hris-hr-user", function () {
		this.timeout(TEST_TIMEOUT);
		const result = deriveRoleAndFlagsFromRecord({ isHr: true }, {});
		expect(result.role).to.equal("hris-hr-user");
		expect(result.isHrManager).to.equal(false);
	});
});

describe("deriveRoleAndFlagsFromRecord -- isManager and isHrManager mutually exclusive", () => {
	it("never both true for any flag combination", function () {
		this.timeout(TEST_TIMEOUT);
		const flagCombos = [
			{ isHr: true, isManager: true },
			{ isHr: true, isManager: false },
			{ isHr: false, isManager: true },
			{ isHr: false, isManager: false },
			{ isHr: null, isManager: null },
			{ isHr: undefined, isManager: undefined },
		];
		for (const combo of flagCombos) {
			const result = deriveRoleAndFlagsFromRecord(
				{ isHr: combo.isHr as any },
				{ isManager: combo.isManager as any },
			);
			const bothTrue = result.isManager && result.isHrManager;
			expect(
				bothTrue,
				`Both flags true for isHr=${combo.isHr} isManager=${combo.isManager}`,
			).to.equal(false);
		}
	});
});

describe("deriveRoleAndFlags", () => {
	// â”€â”€ HR department â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("HR + manager-level â†’ hris-hr-manager", () => {
		it("HR + Director â†’ hris-hr-manager, isHrManager=true, isManager=false", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Director");
			expect(result.role).to.equal("hris-hr-manager");
			expect(result.isHrManager).to.equal(true);
			expect(result.isManager).to.equal(false);
		});

		it("HR + Senior Manager â†’ hris-hr-manager", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Senior Manager");
			expect(result.role).to.equal("hris-hr-manager");
			expect(result.isHrManager).to.equal(true);
		});

		it("HR + Manager â†’ hris-hr-manager", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Manager");
			expect(result.role).to.equal("hris-hr-manager");
			expect(result.isHrManager).to.equal(true);
		});

		it("HR + Lead â†’ hris-hr-manager", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Lead");
			expect(result.role).to.equal("hris-hr-manager");
			expect(result.isHrManager).to.equal(true);
		});
	});

	describe("HR + non-manager-level â†’ hris-hr-user", () => {
		it("HR + Senior â†’ hris-hr-user, flags both false", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Senior");
			expect(result.role).to.equal("hris-hr-user");
			expect(result.isHrManager).to.equal(false);
			expect(result.isManager).to.equal(false);
		});

		it("HR + Mid â†’ hris-hr-user", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Mid");
			expect(result.role).to.equal("hris-hr-user");
		});

		it("HR + Junior â†’ hris-hr-user", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Junior");
			expect(result.role).to.equal("hris-hr-user");
		});

		it("HR + Entry â†’ hris-hr-user, flags false", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("HR", "Entry");
			expect(result.role).to.equal("hris-hr-user");
			expect(result.isHrManager).to.equal(false);
			expect(result.isManager).to.equal(false);
		});
	});

	// â”€â”€ Non-HR department â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("Non-HR + manager-level â†’ hris-employee-manager", () => {
		it("IT + Director â†’ hris-employee-manager, isManager=true", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("IT", "Director");
			expect(result.role).to.equal("hris-employee-manager");
			expect(result.isManager).to.equal(true);
			expect(result.isHrManager).to.equal(false);
		});

		it("IT + Manager â†’ hris-employee-manager, isManager=true", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("IT", "Manager");
			expect(result.role).to.equal("hris-employee-manager");
			expect(result.isManager).to.equal(true);
		});

		it("Finance + Lead â†’ hris-employee-manager", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Finance", "Lead");
			expect(result.role).to.equal("hris-employee-manager");
			expect(result.isManager).to.equal(true);
		});

		it("Operations + Senior Manager â†’ hris-employee-manager", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Operations", "Senior Manager");
			expect(result.role).to.equal("hris-employee-manager");
			expect(result.isManager).to.equal(true);
		});
	});

	describe("Non-HR + non-manager-level â†’ hris-employee", () => {
		it("IT + Junior â†’ hris-employee, flags both false", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("IT", "Junior");
			expect(result.role).to.equal("hris-employee");
			expect(result.isManager).to.equal(false);
			expect(result.isHrManager).to.equal(false);
		});

		it("Finance + Entry â†’ hris-employee", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Finance", "Entry");
			expect(result.role).to.equal("hris-employee");
		});

		it("Engineering + Mid â†’ hris-employee", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Engineering", "Mid");
			expect(result.role).to.equal("hris-employee");
		});

		it("Sales + Senior â†’ hris-employee", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Sales", "Senior");
			expect(result.role).to.equal("hris-employee");
		});
	});

	// â”€â”€ Mutual exclusivity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("isManager and isHrManager are mutually exclusive", () => {
		it("isManager and isHrManager cannot both be true", function () {
			this.timeout(TEST_TIMEOUT);
			// Test all valid combinations
			for (const dept of ["HR", "IT", "Finance", "Sales"]) {
				for (const level of VALID_LEVELS) {
					const result = deriveRoleAndFlags(dept, level as string);
					const bothTrue = result.isManager && result.isHrManager;
					expect(bothTrue, `Both flags true for dept=${dept} level=${level}`).to.equal(
						false,
					);
				}
			}
		});
	});

	// â”€â”€ Case insensitivity for department â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("Department name comparison is case-insensitive", () => {
		it("hr (lowercase) is treated as HR department", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("hr", "Manager");
			expect(result.role).to.equal("hris-hr-manager");
		});

		it("Hr (mixed) is treated as HR department", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Hr", "Entry");
			expect(result.role).to.equal("hris-hr-user");
		});

		it("'Human Resources' (full name) â†’ hris-hr-manager for Director", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Human Resources", "Director");
			expect(result.role).to.equal("hris-hr-manager");
			expect(result.isHrManager).to.equal(true);
			expect(result.isManager).to.equal(false);
		});

		it("'Human Resources' (full name) â†’ hris-hr-user for Entry", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("Human Resources", "Entry");
			expect(result.role).to.equal("hris-hr-user");
		});

		it("dept name 'Finance' with code 'HR' â†’ hris-hr-manager", function () {
			this.timeout(TEST_TIMEOUT);
			// edge-case: name doesn't say HR but code does
			const result = deriveRoleAndFlags("Finance", "Manager", "HR");
			expect(result.role).to.equal("hris-hr-manager");
		});
	});

	// â”€â”€ Whitespace trimming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("Whitespace is trimmed from inputs", () => {
		it("' HR ' with extra spaces still matches HR", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("  HR  ", "Manager");
			expect(result.role).to.equal("hris-hr-manager");
		});

		it("' Manager ' with extra spaces matches Manager level", function () {
			this.timeout(TEST_TIMEOUT);
			const result = deriveRoleAndFlags("IT", "  Manager  ");
			expect(result.role).to.equal("hris-employee-manager");
		});
	});

	// â”€â”€ Invalid level â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

	describe("Invalid level throws an error", () => {
		it("Throws for an unknown level name", function () {
			this.timeout(TEST_TIMEOUT);
			expect(() => deriveRoleAndFlags("IT", "Associate")).to.throw(/Invalid level/);
		});

		it("Throws for empty level name", function () {
			this.timeout(TEST_TIMEOUT);
			expect(() => deriveRoleAndFlags("HR", "")).to.throw(/Invalid level/);
		});
	});
});

// â”€â”€ isManagerLevel helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isManagerLevel", () => {
	it("returns true for Director", () => {
		expect(isManagerLevel("Director")).to.equal(true);
	});

	it("returns true for Lead", () => {
		expect(isManagerLevel("Lead")).to.equal(true);
	});

	it("returns false for Senior", () => {
		expect(isManagerLevel("Senior")).to.equal(false);
	});

	it("returns false for Entry", () => {
		expect(isManagerLevel("Entry")).to.equal(false);
	});

	it("returns false for unknown level", () => {
		expect(isManagerLevel("Associate")).to.equal(false);
	});
});

// â”€â”€ isHrDepartment helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isHrDepartment", () => {
	it("returns true for 'HR'", () => {
		expect(isHrDepartment("HR")).to.equal(true);
	});

	it("returns true for 'hr' (lowercase)", () => {
		expect(isHrDepartment("hr")).to.equal(true);
	});

	it("returns true for 'Human Resources' (full database name)", () => {
		expect(isHrDepartment("Human Resources")).to.equal(true);
	});

	it("returns true when code is 'HR' even if name differs", () => {
		expect(isHrDepartment("People & Culture", "HR")).to.equal(true);
	});

	it("returns false for 'IT'", () => {
		expect(isHrDepartment("IT")).to.equal(false);
	});

	it("returns false for 'Finance' with no code", () => {
		expect(isHrDepartment("Finance")).to.equal(false);
	});
});

// â”€â”€ Constant coverage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("MANAGER_LEVELS and NON_MANAGER_LEVELS are complete", () => {
	it("MANAGER_LEVELS contains 4 levels", () => {
		expect(MANAGER_LEVELS).to.have.lengthOf(4);
	});

	it("NON_MANAGER_LEVELS contains 4 levels", () => {
		expect(NON_MANAGER_LEVELS).to.have.lengthOf(4);
	});

	it("VALID_LEVELS equals MANAGER_LEVELS + NON_MANAGER_LEVELS", () => {
		expect(VALID_LEVELS).to.have.lengthOf(MANAGER_LEVELS.length + NON_MANAGER_LEVELS.length);
	});

	it("MANAGER_LEVELS includes Director, Senior Manager, Manager, Lead", () => {
		expect(MANAGER_LEVELS).to.include.members([
			"Director",
			"Senior Manager",
			"Manager",
			"Lead",
		]);
	});

	it("NON_MANAGER_LEVELS includes Senior, Mid, Junior, Entry", () => {
		expect(NON_MANAGER_LEVELS).to.include.members(["Senior", "Mid", "Junior", "Entry"]);
	});

	it("recognizes hris-line-leader with isManager=true", () => {
		const result = deriveRoleAndFlags({ department: { isHr: false }, level: { isManager: true } });
		expect(result.isManager).to.equal(true);
	});
});

