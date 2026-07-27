import { describe, expect, it } from "vitest";
import type { Employee } from "~/services/employees.service";
import { buildManpowerDatabank, formatEmploymentTypeLabel, getActiveManpowerEmployees } from "./manpower-databank";

const makeDepartment = () => ({
	id: "dept-1",
	organizationId: "org-1",
	name: "Manufacturing",
	code: "MFG",
	managerId: "manager-1",
	isActive: true,
	isDefault: false,
	isDeleted: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const makeSection = () => ({
	id: "section-1",
	name: "Assembly",
	code: "ASSY",
	departmentId: "dept-1",
});

const makePosition = (id = "position-operator", title = "Operator") => ({
	id,
	organizationId: "org-1",
	title,
	code: "OPR",
	departmentId: "dept-1",
	isActive: true,
	isDeleted: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const makeEmployee = (overrides: Partial<Employee> = {}): Employee =>
	({
		id: overrides.id || "employee-1",
		organizationId: "org-1",
		employeeId: "EMP-001",
		personId: "person-1",
		userId: "user-1",
		employmentHireDate: "2026-01-01",
		employmentStatus: "ACTIVE",
		employmentType: "REGULAR",
		departmentId: "dept-1",
		positionId: "position-operator",
		workLocation: "ONSITE",
		basicSalary: 0,
		currency: "PHP",
		payFrequency: "SEMI_MONTHLY",
		isDeleted: false,
		isTour: false,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		workforceSource: "DIRECT",
		department: makeDepartment(),
		section: makeSection(),
		position: makePosition(),
		...overrides,
	}) as Employee;

describe("formatEmploymentTypeLabel", () => {
	it("converts snake_case to Title Case", () => {
		expect(formatEmploymentTypeLabel("REGULAR")).toBe("Regular");
		expect(formatEmploymentTypeLabel("PART_TIME")).toBe("Part Time");
		expect(formatEmploymentTypeLabel("PROBATIONARY")).toBe("Probationary");
	});

	it("handles null/undefined gracefully", () => {
		expect(formatEmploymentTypeLabel(null)).toBe("Unknown");
		expect(formatEmploymentTypeLabel(undefined)).toBe("Unknown");
	});
});

describe("getActiveManpowerEmployees", () => {
	it("keeps ACTIVE, ONBOARDING, and ON_LEAVE employees", () => {
		const employees = [
			makeEmployee({ id: "a", employmentStatus: "ACTIVE" }),
			makeEmployee({ id: "b", employmentStatus: "ONBOARDING" }),
			makeEmployee({ id: "c", employmentStatus: "ON_LEAVE" }),
			makeEmployee({ id: "d", employmentStatus: "INACTIVE" }),
			makeEmployee({ id: "e", employmentStatus: "TERMINATED" }),
		];
		const active = getActiveManpowerEmployees(employees);
		expect(active.map((e) => e.id)).toEqual(["a", "b", "c"]);
	});
});

describe("buildManpowerDatabank", () => {
	it("builds active-manpower position and employment-type summaries", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "employee-1", employmentType: "REGULAR", workforceSource: "DIRECT" }),
			makeEmployee({ id: "employee-2", employmentType: "PROBATIONARY", workforceSource: "AGENCY" }),
			makeEmployee({
				id: "employee-3",
				positionId: "position-quality",
				position: makePosition("position-quality", "Quality Inspector"),
			}),
			makeEmployee({
				id: "employee-4",
				positionId: "",
				position: undefined,
				employmentType: "CONTRACTUAL",
			}),
			makeEmployee({ id: "employee-5", employmentStatus: "INACTIVE" }),
		]);

		expect(databank.positionRows.map((row) => [row.position, row.headcount])).toEqual([
			["Operator", 2],
			["Quality Inspector", 1],
			["Unassigned position", 1],
		]);

		expect(databank.positionRows[0]).toMatchObject({
			direct: 1,
			agency: 1,
			employmentTypeMix: "Probationary 1, Regular 1",
		});

		expect(
			databank.employmentTypeRows.find((row) => row.employmentType === "REGULAR"),
		).toMatchObject({
			headcount: 2,
			direct: 2,
			agency: 0,
			positions: 2,
		});
	});

	it("marks the unassigned-position row so the UI can render plain text", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "e-1", positionId: "", position: undefined }),
		]);
		const unassigned = databank.positionRows.find((row) => row.isUnassigned);
		expect(unassigned).toBeDefined();
		expect(unassigned?.position).toBe("Unassigned position");
		expect(unassigned?.positionId).toBeNull();
	});

	it("excludes INACTIVE employees from all counts", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "active", employmentStatus: "ACTIVE" }),
			makeEmployee({ id: "inactive", employmentStatus: "INACTIVE" }),
			makeEmployee({ id: "terminated", employmentStatus: "TERMINATED" }),
		]);
		expect(databank.positionRows[0].headcount).toBe(1);
		expect(databank.activeEmployees.map((e) => e.id)).toEqual(["active"]);
	});

	it("returns empty row arrays when all employees are inactive", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ employmentStatus: "INACTIVE" }),
		]);
		expect(databank.positionRows).toHaveLength(0);
		expect(databank.employmentTypeRows).toHaveLength(0);
	});

	it("counts unique departments and sections per position", () => {
		const dept2 = { ...makeDepartment(), id: "dept-2", name: "Engineering" };
		const section2 = { ...makeSection(), id: "section-2", name: "QC" };
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "e-1" }),
			makeEmployee({ id: "e-2", department: dept2, section: section2 }),
		]);
		expect(databank.positionRows[0].departments).toBe(2);
		expect(databank.positionRows[0].sections).toBe(2);
	});

	it("truncates employment-type mix with +N more for three or more types", () => {
		const databank = buildManpowerDatabank([
			makeEmployee({ id: "e-1", employmentType: "REGULAR" }),
			makeEmployee({ id: "e-2", employmentType: "PROBATIONARY" }),
			makeEmployee({ id: "e-3", employmentType: "CONTRACTUAL" }),
		]);
		expect(databank.positionRows[0].employmentTypeMix).toMatch(/\+1 more$/);
	});
});
