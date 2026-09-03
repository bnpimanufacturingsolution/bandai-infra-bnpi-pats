import { expect } from "chai";
import { convertStringBooleans, transformFormDataToObject } from "../../helper/transformObject";
import { isValidEmail, validateEmailOptions } from "../../utils/email.validator";
import { buildPagination } from "../../helper/success-handler.helper";
import { getAnnualizationDivisor, PayrollFrequency } from "../../config/payroll.config";
import { formatPHP, roundToCentavo, roundUpToPeso } from "../../helper/tax-calculator.helper";

describe("convertStringBooleans", () => {
	it("converts plain true string", () => {
		expect(convertStringBooleans("true")).to.equal(true);
	});

	it("converts plain false string", () => {
		expect(convertStringBooleans("false")).to.equal(false);
	});

	it("converts quoted string booleans", () => {
		expect(convertStringBooleans('"true"')).to.equal(true);
		expect(convertStringBooleans("'false'")).to.equal(false);
	});

	it("converts nested object fields", () => {
		expect(convertStringBooleans({ a: "true", b: { c: "false" } })).to.deep.equal({
			a: true,
			b: { c: false },
		});
	});

	it("converts array values recursively", () => {
		expect(convertStringBooleans(["true", "false", "x"])).to.deep.equal([true, false, "x"]);
	});
});

describe("transformFormDataToObject", () => {
	it("returns empty object for invalid input", () => {
		expect(transformFormDataToObject(null)).to.deep.equal({});
	});

	it("maps simple key/value pairs", () => {
		expect(transformFormDataToObject({ name: "alice" })).to.deep.equal({ name: "alice" });
	});

	it("maps nested bracket keys", () => {
		expect(transformFormDataToObject({ "user[name]": "alice", "user[active]": "true" })).to.deep.equal({
			user: { name: "alice", active: true },
		});
	});

	it("maps indexed arrays", () => {
		expect(transformFormDataToObject({ "items[0]": "a", "items[1]": "b" })).to.deep.equal({
			items: ["a", "b"],
		});
	});

	it("converts string booleans after transform", () => {
		expect(transformFormDataToObject({ "flags[enabled]": "false" })).to.deep.equal({
			flags: { enabled: false },
		});
	});
});

describe("isValidEmail", () => {
	it("accepts basic valid email", () => {
		expect(isValidEmail("test@example.com")).to.equal(true);
	});

	it("accepts valid email with dot and plus", () => {
		expect(isValidEmail("first.last+tag@company.org")).to.equal(true);
	});

	it("rejects missing at symbol", () => {
		expect(isValidEmail("test.example.com")).to.equal(false);
	});

	it("rejects missing domain", () => {
		expect(isValidEmail("test@")).to.equal(false);
	});

	it("rejects spaces", () => {
		expect(isValidEmail("test @example.com")).to.equal(false);
	});
});

describe("validateEmailOptions", () => {
	const validBase = {
		to: "test@example.com",
		subject: "Subject",
		text: "hello",
	};

	it("passes for minimal valid options", () => {
		expect(() => validateEmailOptions(validBase)).to.not.throw();
	});

	it("throws when recipient is missing", () => {
		expect(() => validateEmailOptions({ ...validBase, to: "" as unknown as string })).to.throw(
			"Recipient email is required",
		);
	});

	it("throws when subject is missing", () => {
		expect(() => validateEmailOptions({ ...validBase, subject: "" })).to.throw("Email subject is required");
	});

	it("throws when content is missing", () => {
		expect(() => validateEmailOptions({ to: "test@example.com", subject: "x" })).to.throw(
			"Email content (html or text) is required",
		);
	});

	it("throws for invalid recipient in array", () => {
		expect(() => validateEmailOptions({ ...validBase, to: ["ok@example.com", "invalid"] })).to.throw(
			"Invalid email address: invalid",
		);
	});
});

describe("buildPagination", () => {
	it("builds pagination basics", () => {
		expect(buildPagination(100, 1, 10)).to.include({ total: 100, page: 1, limit: 10, totalPages: 10 });
	});

	it("marks hasNext true when more pages exist", () => {
		expect(buildPagination(100, 3, 10).hasNext).to.equal(true);
	});

	it("marks hasNext false at last page", () => {
		expect(buildPagination(100, 10, 10).hasNext).to.equal(false);
	});

	it("marks hasPrev false on first page", () => {
		expect(buildPagination(100, 1, 10).hasPrev).to.equal(false);
	});

	it("marks hasPrev true after first page", () => {
		expect(buildPagination(100, 2, 10).hasPrev).to.equal(true);
	});
});

describe("getAnnualizationDivisor", () => {
	it("returns weekly divisor", () => {
		expect(getAnnualizationDivisor(PayrollFrequency.WEEKLY)).to.equal(52);
	});

	it("returns bi-weekly divisor", () => {
		expect(getAnnualizationDivisor(PayrollFrequency.BI_WEEKLY)).to.equal(26);
	});

	it("returns semi-monthly divisor", () => {
		expect(getAnnualizationDivisor(PayrollFrequency.SEMI_MONTHLY)).to.equal(24);
	});

	it("returns monthly divisor", () => {
		expect(getAnnualizationDivisor(PayrollFrequency.MONTHLY)).to.equal(12);
	});

	it("falls back to monthly divisor for unknown values", () => {
		expect(getAnnualizationDivisor("unknown" as PayrollFrequency)).to.equal(12);
	});
});

describe("roundToCentavo", () => {
	it("rounds down/up to two decimals", () => {
		expect(roundToCentavo(1.234)).to.equal(1.23);
		expect(roundToCentavo(1.235)).to.equal(1.24);
	});

	it("keeps two-decimal input as-is", () => {
		expect(roundToCentavo(10.5)).to.equal(10.5);
	});

	it("handles zero", () => {
		expect(roundToCentavo(0)).to.equal(0);
	});

	it("handles negative values", () => {
		expect(roundToCentavo(-1.236)).to.equal(-1.24);
	});

	it("handles large values", () => {
		expect(roundToCentavo(123456.789)).to.equal(123456.79);
	});
});

describe("roundUpToPeso", () => {
	it("rounds up fractional numbers", () => {
		expect(roundUpToPeso(10.01)).to.equal(11);
	});

	it("keeps whole numbers", () => {
		expect(roundUpToPeso(10)).to.equal(10);
	});

	it("rounds zero", () => {
		expect(roundUpToPeso(0)).to.equal(0);
	});

	it("rounds negative fractions toward zero via ceil", () => {
		expect(roundUpToPeso(-10.2)).to.equal(-10);
	});

	it("rounds negative whole numbers unchanged", () => {
		expect(roundUpToPeso(-10)).to.equal(-10);
	});
});

describe("formatPHP", () => {
	it("formats whole number to php currency", () => {
		expect(formatPHP(1000)).to.contain("₱");
	});

	it("formats with 2 decimal places", () => {
		const value = formatPHP(1000);
		expect(value).to.match(/\.00$/);
	});

	it("formats fractional values to 2 decimals", () => {
		expect(formatPHP(1234.5)).to.match(/1,234\.50|1,234.50/);
	});

	it("formats zero", () => {
		expect(formatPHP(0)).to.contain("0.00");
	});

	it("formats negative values", () => {
		expect(formatPHP(-99.5)).to.contain("99.50");
	});
});
