// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: /employee/:id profile fetch must not request bare `employeeBenefits`.
 * Bare relation selection expands to every Prisma scalar and returns 500 when the
 * DB is missing newer benefit columns (eligibilityMode).
 */
describe("useEmployee profile field selection", () => {
	const source = readFileSync(path.join(__dirname, "useEmployees.ts"), "utf8");

	const defaultFieldsBlock = source.slice(
		source.indexOf("const defaultFields = ["),
		source.indexOf("const selectedFields = fields || defaultFields;"),
	);

	it("does not request bare employeeBenefits on the default profile field set", () => {
		expect(defaultFieldsBlock).to.match(/"employeeBenefits\./);
		expect(defaultFieldsBlock).not.to.match(/^\s*"employeeBenefits",\s*$/m);
		expect(defaultFieldsBlock).not.to.contain('"employeeBenefits",');
	});

	it("requests only stable benefit scalars needed by employee profile surfaces", () => {
		for (const field of [
			"employeeBenefits.id",
			"employeeBenefits.name",
			"employeeBenefits.status",
			"employeeBenefits.isActive",
			"employeeBenefits.totalAmount",
			"employeeBenefits.currency",
		]) {
			expect(defaultFieldsBlock).to.contain(`"${field}"`);
		}
		// Do not force newer eligibility columns on the profile default payload.
		expect(defaultFieldsBlock).not.to.contain('"employeeBenefits.eligibilityMode"');
	});
});
