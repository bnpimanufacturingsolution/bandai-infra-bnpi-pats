/**
 * Role Derivation Utility â€” Frontend Tests
 * Stack: Vitest
 * Run: npx vitest run app/lib/utils/role-derivation.test.ts
 */

import { describe, it, expect } from "vitest";
import {
	deriveRoleAndFlags,
	deriveRoleAndFlagsFromRecord,
	isManagerLevel,
	isHrDepartment,
	roleLabel,
	MANAGER_LEVELS,
	NON_MANAGER_LEVELS,
	VALID_LEVELS,
	type HrisRole,
} from "./role-derivation";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PRIMARY function: deriveRoleAndFlagsFromRecord  (uses isHr / isManager flags)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

describe("deriveRoleAndFlagsFromRecord â€” spec acceptance criteria", () => {
	it("isHr=true, isManager=true â†’ hris-hr-manager, isHrManager=true, isManager=false", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: true }, { isManager: true });
		expect(r.role).toBe("hris-hr-manager");
		expect(r.isHrManager).toBe(true);
		expect(r.isManager).toBe(false);
	});

	it("isHr=true, isManager=false â†’ hris-hr-user, flags both false", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: true }, { isManager: false });
		expect(r.role).toBe("hris-hr-user");
		expect(r.isHrManager).toBe(false);
		expect(r.isManager).toBe(false);
	});

	it("isHr=false, isManager=true â†’ hris-employee-manager, isManager=true, isHrManager=false", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: false }, { isManager: true });
		expect(r.role).toBe("hris-employee-manager");
		expect(r.isManager).toBe(true);
		expect(r.isHrManager).toBe(false);
	});

	it("isHr=false, isManager=false â†’ hris-employee, flags both false", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: false }, { isManager: false });
		expect(r.role).toBe("hris-employee");
		expect(r.isManager).toBe(false);
		expect(r.isHrManager).toBe(false);
	});
});

describe("deriveRoleAndFlags object API â€” canonical source of truth", () => {
	it("department.isHr=true + level.isManager=true => hris-hr-manager", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: true },
			level: { isManager: true },
		});
		expect(result.role).toBe("hris-hr-manager");
		expect(result.isHrManager).toBe(true);
		expect(result.isManager).toBe(false);
	});

	it("normalizes string booleans before strict checks", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: "true" },
			level: { isManager: "true" },
		});
		expect(result.role).toBe("hris-hr-manager");
		expect(result.isHrManager).toBe(true);
		expect(result.isManager).toBe(false);
	});

	it("falls back to position.isManager when level is missing", () => {
		const result = deriveRoleAndFlags({
			department: { isHr: false },
			level: null,
			position: { isManager: true },
		});
		expect(result.role).toBe("hris-employee-manager");
		expect(result.isManager).toBe(true);
		expect(result.isHrManager).toBe(false);
	});
});

describe("deriveRoleAndFlagsFromRecord â€” missing/null flags treated as false", () => {
	it("empty objects â†’ hris-employee", () => {
		const r = deriveRoleAndFlagsFromRecord({}, {});
		expect(r.role).toBe("hris-employee");
		expect(r.isManager).toBe(false);
		expect(r.isHrManager).toBe(false);
	});

	it("null flags â†’ hris-employee", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: null }, { isManager: null });
		expect(r.role).toBe("hris-employee");
	});

	it("isHr=null, isManager=true â†’ hris-employee-manager", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: null }, { isManager: true });
		expect(r.role).toBe("hris-employee-manager");
		expect(r.isManager).toBe(true);
	});

	it("isHr=true, isManager=undefined â†’ hris-hr-user", () => {
		const r = deriveRoleAndFlagsFromRecord({ isHr: true }, {});
		expect(r.role).toBe("hris-hr-user");
		expect(r.isHrManager).toBe(false);
	});
});

describe("deriveRoleAndFlagsFromRecord â€” isManager and isHrManager mutually exclusive", () => {
	it("never both true for any flag combination", () => {
		const combos = [
			[true, true],
			[true, false],
			[false, true],
			[false, false],
			[null, null],
			[undefined, undefined],
		] as const;

		for (const [isHr, isManager] of combos) {
			const r = deriveRoleAndFlagsFromRecord(
				{ isHr: isHr as any },
				{ isManager: isManager as any },
			);
			expect(
				r.isManager && r.isHrManager,
				`Both true for isHr=${isHr} isManager=${isManager}`,
			).toBe(false);
		}
	});
});

// â”€â”€ Required acceptance criteria â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("deriveRoleAndFlags â€” required acceptance criteria", () => {
	it("HR + Director â†’ hris-hr-manager, isHrManager=true, isManager=false", () => {
		const result = deriveRoleAndFlags("HR", "Director");
		expect(result).not.toBeNull();
		expect(result!.role).toBe("hris-hr-manager");
		expect(result!.isHrManager).toBe(true);
		expect(result!.isManager).toBe(false);
	});

	it("HR + Entry â†’ hris-hr-user, both flags false", () => {
		const result = deriveRoleAndFlags("HR", "Entry");
		expect(result).not.toBeNull();
		expect(result!.role).toBe("hris-hr-user");
		expect(result!.isHrManager).toBe(false);
		expect(result!.isManager).toBe(false);
	});

	it("IT + Manager â†’ hris-employee-manager, isManager=true, isHrManager=false", () => {
		const result = deriveRoleAndFlags("IT", "Manager");
		expect(result).not.toBeNull();
		expect(result!.role).toBe("hris-employee-manager");
		expect(result!.isManager).toBe(true);
		expect(result!.isHrManager).toBe(false);
	});

	it("IT + Junior â†’ hris-employee, both flags false", () => {
		const result = deriveRoleAndFlags("IT", "Junior");
		expect(result).not.toBeNull();
		expect(result!.role).toBe("hris-employee");
		expect(result!.isManager).toBe(false);
		expect(result!.isHrManager).toBe(false);
	});
});

// â”€â”€ HR + all manager levels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("HR department + manager-level â†’ hris-hr-manager", () => {
	for (const level of ["Director", "Senior Manager", "Manager", "Lead"]) {
		it(`HR + ${level} â†’ hris-hr-manager`, () => {
			const result = deriveRoleAndFlags("HR", level);
			expect(result!.role).toBe("hris-hr-manager");
			expect(result!.isHrManager).toBe(true);
		});
	}
});

// â”€â”€ HR + all non-manager levels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("HR department + non-manager-level â†’ hris-hr-user", () => {
	for (const level of ["Senior", "Mid", "Junior", "Entry"]) {
		it(`HR + ${level} â†’ hris-hr-user`, () => {
			const result = deriveRoleAndFlags("HR", level);
			expect(result!.role).toBe("hris-hr-user");
			expect(result!.isHrManager).toBe(false);
		});
	}
});

// â”€â”€ Non-HR + all manager levels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Non-HR department + manager-level â†’ hris-employee-manager", () => {
	for (const level of ["Director", "Senior Manager", "Manager", "Lead"]) {
		it(`Engineering + ${level} â†’ hris-employee-manager`, () => {
			const result = deriveRoleAndFlags("Engineering", level);
			expect(result!.role).toBe("hris-employee-manager");
			expect(result!.isManager).toBe(true);
		});
	}
});

// â”€â”€ Non-HR + all non-manager levels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Non-HR department + non-manager-level â†’ hris-employee", () => {
	for (const level of ["Senior", "Mid", "Junior", "Entry"]) {
		it(`Finance + ${level} â†’ hris-employee`, () => {
			const result = deriveRoleAndFlags("Finance", level);
			expect(result!.role).toBe("hris-employee");
			expect(result!.isManager).toBe(false);
			expect(result!.isHrManager).toBe(false);
		});
	}
});

// â”€â”€ Example mapping verification (from spec) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Example mapping â€” must match spec", () => {
	it("HR + Entry-like (Entry) â†’ hris-hr-user", () => {
		expect(deriveRoleAndFlags("HR", "Entry")!.role).toBe("hris-hr-user");
	});

	it("HR + Manager â†’ hris-hr-manager", () => {
		expect(deriveRoleAndFlags("HR", "Manager")!.role).toBe("hris-hr-manager");
	});

	it("Non-HR + Lead â†’ hris-employee-manager", () => {
		expect(deriveRoleAndFlags("Operations", "Lead")!.role).toBe("hris-employee-manager");
	});

	it("Non-HR + Mid â†’ hris-employee", () => {
		expect(deriveRoleAndFlags("Sales", "Mid")!.role).toBe("hris-employee");
	});
});

// â”€â”€ Mutual exclusivity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isManager and isHrManager are mutually exclusive", () => {
	it("never both true for any valid dept+level combination", () => {
		const departments = ["HR", "IT", "Finance", "sales", "Engineering"];
		for (const dept of departments) {
			for (const level of VALID_LEVELS) {
				const result = deriveRoleAndFlags(dept, level as string);
				if (result) {
					expect(
						result.isManager && result.isHrManager,
						`Both true for dept=${dept} level=${level}`,
					).toBe(false);
				}
			}
		}
	});
});

// â”€â”€ Null / empty input guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Returns null for missing inputs", () => {
	it("returns null when departmentName is empty", () => {
		expect(deriveRoleAndFlags("", "Manager")).toBeNull();
	});

	it("returns null when levelName is empty", () => {
		expect(deriveRoleAndFlags("HR", "")).toBeNull();
	});

	it("returns null when both are empty", () => {
		expect(deriveRoleAndFlags("", "")).toBeNull();
	});

	it("returns null for unknown level", () => {
		expect(deriveRoleAndFlags("IT", "Associate")).toBeNull();
	});
});

// â”€â”€ Case insensitivity (department) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Department name is case-insensitive", () => {
	it("'hr' treated as HR", () => {
		expect(deriveRoleAndFlags("hr", "Entry")!.role).toBe("hris-hr-user");
	});

	it("'Hr' treated as HR", () => {
		expect(deriveRoleAndFlags("Hr", "Manager")!.role).toBe("hris-hr-manager");
	});

	it("'Human Resources' (full db name) â†’ hris-hr-manager for Director", () => {
		const r = deriveRoleAndFlags("Human Resources", "Director");
		expect(r!.role).toBe("hris-hr-manager");
		expect(r!.isHrManager).toBe(true);
		expect(r!.isManager).toBe(false);
	});

	it("'Human Resources' (full db name) â†’ hris-hr-user for Entry", () => {
		expect(deriveRoleAndFlags("Human Resources", "Entry")!.role).toBe("hris-hr-user");
	});

	it("dept code 'HR' overrides unrecognised name", () => {
		expect(deriveRoleAndFlags("People & Culture", "Manager", "HR")!.role).toBe(
			"hris-hr-manager",
		);
	});
});

// â”€â”€ Whitespace trimming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Whitespace is trimmed", () => {
	it("'  HR  ' â†’ treated as HR", () => {
		expect(deriveRoleAndFlags("  HR  ", "Manager")!.role).toBe("hris-hr-manager");
	});

	it("level with spaces '  Manager  ' â†’ manager level", () => {
		expect(deriveRoleAndFlags("IT", "  Manager  ")!.role).toBe("hris-employee-manager");
	});
});

// â”€â”€ roleLabel helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("roleLabel", () => {
	const cases: Array<[HrisRole, string]> = [
		["hris-hr-manager", "HR Manager"],
		["hris-hr-user", "HR User"],
		["hris-employee-manager", "Employee Manager"],
		["hris-line-leader", "Line Leader"],
		["hris-employee", "Employee"],
	];

	for (const [role, label] of cases) {
		it(`${role} â†’ "${label}"`, () => {
			expect(roleLabel(role)).toBe(label);
		});
	}
});

// â”€â”€ isManagerLevel helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isManagerLevel", () => {
	for (const level of ["Director", "Senior Manager", "Manager", "Lead"]) {
		it(`${level} â†’ true`, () => {
			expect(isManagerLevel(level)).toBe(true);
		});
	}

	for (const level of ["Senior", "Mid", "Junior", "Entry"]) {
		it(`${level} â†’ false`, () => {
			expect(isManagerLevel(level)).toBe(false);
		});
	}

	it("unknown level â†’ false", () => {
		expect(isManagerLevel("Associate")).toBe(false);
	});
});

// â”€â”€ isHrDepartment helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isHrDepartment", () => {
	it("'HR' â†’ true", () => expect(isHrDepartment("HR")).toBe(true));
	it("'hr' â†’ true", () => expect(isHrDepartment("hr")).toBe(true));
	it("'Human Resources' (full name) â†’ true", () =>
		expect(isHrDepartment("Human Resources")).toBe(true));
	it("code 'HR' with different name â†’ true", () =>
		expect(isHrDepartment("People & Culture", "HR")).toBe(true));
	it("'IT' â†’ false", () => expect(isHrDepartment("IT")).toBe(false));
	it("'Finance' â†’ false", () => expect(isHrDepartment("Finance")).toBe(false));
});

// â”€â”€ Constant assertions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("Constants", () => {
	it("MANAGER_LEVELS has 4 entries", () => {
		expect(MANAGER_LEVELS).toHaveLength(4);
	});

	it("NON_MANAGER_LEVELS has 4 entries", () => {
		expect(NON_MANAGER_LEVELS).toHaveLength(4);
	});

	it("VALID_LEVELS has 8 entries", () => {
		expect(VALID_LEVELS).toHaveLength(8);
	});
});
