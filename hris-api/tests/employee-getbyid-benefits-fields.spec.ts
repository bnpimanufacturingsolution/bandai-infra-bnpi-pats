import { expect } from "chai";
import {
	getNestedFields,
	normalizeAndValidateFieldSelection,
} from "../helper/query-builder.helper";

/**
 * Regression: admin employee profile deep-link calls GET /api/employee/:id with
 * default useEmployee fields that historically included bare `employeeBenefits`.
 * Bare relation selection expands to every Prisma scalar and 500s when the DB is
 * behind additive benefit eligibility migrations.
 */
describe("Employee getById benefit field selection contract", () => {
	const EMPLOYEE_FIELD_ALIASES: Record<string, string> = {
		activeSchedule: "embeddedSchedule",
	};

	const stripFieldSelectionRoot = (fields: string | undefined, root: string) => {
		if (typeof fields !== "string") return undefined;
		const kept = fields
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
			.filter((item) => item !== root && !item.startsWith(`${root}.`));
		return kept.length > 0 ? kept.join(",") : undefined;
	};

	const profileDefaultFields = [
		"id",
		"employeeId",
		"organizationId",
		"personId",
		"userId",
		"person.personalInfo",
		"department.id",
		"department.name",
		"documents",
		"activeSchedule",
		"schedules.id",
		"employeeBenefits.id",
		"employeeBenefits.name",
		"employeeBenefits.status",
		"employeeBenefits.isActive",
		"employeeBenefits.totalAmount",
		"employeeBenefits.currency",
	].join(",");

	it("accepts the employee profile field set used by hris-app useEmployee defaults", () => {
		const fieldsWithoutSchedules = stripFieldSelectionRoot(profileDefaultFields, "schedules");
		const { normalizedFields, errors } = normalizeAndValidateFieldSelection(
			"Employee",
			fieldsWithoutSchedules,
			EMPLOYEE_FIELD_ALIASES,
			{ derivedRoots: ["activeSchedule"] },
		);

		expect(errors).to.deep.equal([]);
		expect(normalizedFields).to.be.a("string");
		expect(normalizedFields).to.contain("employeeBenefits.id");
		expect(normalizedFields).to.contain("employeeBenefits.status");
		expect(normalizedFields).not.to.match(/(^|,)employeeBenefits(,|$)/);
	});

	it("builds nested select for explicit employeeBenefits scalars without bare true", () => {
		const fieldsWithoutSchedules = stripFieldSelectionRoot(profileDefaultFields, "schedules");
		const { normalizedFields, errors } = normalizeAndValidateFieldSelection(
			"Employee",
			fieldsWithoutSchedules,
			EMPLOYEE_FIELD_ALIASES,
			{ derivedRoots: ["activeSchedule"] },
		);
		expect(errors).to.deep.equal([]);

		const select = getNestedFields(
			normalizedFields,
			EMPLOYEE_FIELD_ALIASES,
			"Employee",
		) as Record<string, any>;

		expect(select.employeeBenefits).to.be.an("object");
		expect(select.employeeBenefits).not.to.equal(true);
		expect(select.employeeBenefits.select).to.include({
			id: true,
			name: true,
			status: true,
			isActive: true,
			totalAmount: true,
			currency: true,
		});
		// Nested select must not request eligibility columns unless the client asked.
		expect(select.employeeBenefits.select.eligibilityMode).to.not.equal(true);
	});

	it("still validates bare employeeBenefits as a legal Employee field", () => {
		const { normalizedFields, errors } = normalizeAndValidateFieldSelection(
			"Employee",
			"id,employeeBenefits",
			EMPLOYEE_FIELD_ALIASES,
			{ derivedRoots: ["activeSchedule"] },
		);

		expect(errors).to.deep.equal([]);
		expect(normalizedFields).to.equal("id,employeeBenefits");

		const select = getNestedFields(
			normalizedFields,
			EMPLOYEE_FIELD_ALIASES,
			"Employee",
		) as Record<string, any>;
		// getNestedFields itself still emits true; controller expands this before Prisma.
		expect(select.employeeBenefits).to.equal(true);
	});
});
