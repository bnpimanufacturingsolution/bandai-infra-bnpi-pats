import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

describe("Benefit attendance eligibility migration", () => {
	const migrationSql = fs.readFileSync(
		path.resolve(
			__dirname,
			"../prisma/schema-postgres/migrations/20260723_add_benefit_attendance_eligibility_fields.sql",
		),
		"utf8",
	);
	const schemaSql = fs.readFileSync(
		path.resolve(__dirname, "../prisma/schema-postgres/employeebenefit.prisma"),
		"utf8",
	);
	const benefitTypeSchemaSql = fs.readFileSync(
		path.resolve(__dirname, "../prisma/schema-postgres/benefitType.prisma"),
		"utf8",
	);
	const employeeControllerSource = fs.readFileSync(
		path.resolve(__dirname, "../app/employee/employee.controller.ts"),
		"utf8",
	);

	it("keeps EmployeeBenefit eligibility fields in the postgres schema source of truth", () => {
		expect(schemaSql).to.contain("enum BenefitEligibilityMode");
		expect(schemaSql).to.contain("ENROLLED_ALWAYS");
		expect(schemaSql).to.contain("ATTENDANCE_QUALIFIED");
		expect(schemaSql).to.contain(
			"eligibilityMode                    BenefitEligibilityMode @default(ENROLLED_ALWAYS)",
		);
		expect(schemaSql).to.contain("eligibilityDisqualifyOnAbsent");
		expect(schemaSql).to.contain("eligibilityDisqualifyOnLate");
		expect(schemaSql).to.contain("eligibilityDisqualifyOnUndertime");
		expect(schemaSql).to.contain("eligibilityDisqualifyOnLeave");
	});

	it("ships an additive idempotent migration for employee_benefits and benefit_types", () => {
		expect(migrationSql).to.contain('CREATE TYPE "BenefitEligibilityMode"');
		expect(migrationSql).to.contain('ALTER TABLE "employee_benefits"');
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "eligibilityMode" "BenefitEligibilityMode" NOT NULL DEFAULT \'ENROLLED_ALWAYS\'',
		);
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnAbsent" BOOLEAN NOT NULL DEFAULT true',
		);
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnLate" BOOLEAN NOT NULL DEFAULT false',
		);
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnUndertime" BOOLEAN NOT NULL DEFAULT false',
		);
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "eligibilityDisqualifyOnLeave" BOOLEAN NOT NULL DEFAULT false',
		);
		expect(migrationSql).to.contain('ALTER TABLE "benefit_types"');
		expect(migrationSql).to.contain(
			'ADD COLUMN IF NOT EXISTS "defaultEligibilityMode" "BenefitEligibilityMode"',
		);
		expect(migrationSql).not.to.match(/DROP\s+TABLE\s+employee_benefits/i);
		expect(migrationSql).not.to.match(/TRUNCATE\s+employee_benefits/i);
	});

	it("keeps BenefitType default eligibility fields aligned with EmployeeBenefit", () => {
		expect(benefitTypeSchemaSql).to.contain("defaultEligibilityMode");
		expect(benefitTypeSchemaSql).to.contain("defaultEligibilityDisqualifyOnAbsent");
		expect(benefitTypeSchemaSql).to.contain("defaultEligibilityDisqualifyOnLate");
		expect(benefitTypeSchemaSql).to.contain("defaultEligibilityDisqualifyOnUndertime");
		expect(benefitTypeSchemaSql).to.contain("defaultEligibilityDisqualifyOnLeave");
	});

	it("expands bare employeeBenefits field selection instead of Prisma true", () => {
		expect(employeeControllerSource).to.contain("applyEmployeeBenefitSelectionDefaults");
		expect(employeeControllerSource).to.contain("EMPLOYEE_BENEFIT_PROFILE_SCALAR_SELECT");
		expect(employeeControllerSource).to.contain(
			"if (fieldSelections.employeeBenefits === true)",
		);
		expect(employeeControllerSource).to.contain("where: { isDeleted: false }");
		// Applied on both getAll and getById select paths.
		const applyCount = employeeControllerSource.split(
			"applyEmployeeBenefitSelectionDefaults(",
		).length;
		expect(applyCount).to.be.greaterThan(2);
	});
});
