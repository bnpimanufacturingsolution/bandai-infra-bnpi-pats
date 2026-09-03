import { expect } from "chai";
import {
	convertFormDataTypes,
	convertWithPreset,
	filterDatabaseFields,
} from "../../utils/formDataHelper";
import { validateQueryParams } from "../../helper/validation-helper";

describe("convertFormDataTypes", () => {
	it("converts numeric fields", () => {
		const out = convertFormDataTypes({ salary: "1234.50" }, { numericFields: ["salary"] });
		expect(out.salary).to.equal(1234.5);
	});

	it("converts integer fields", () => {
		const out = convertFormDataTypes({ count: "42" }, { integerFields: ["count"] });
		expect(out.count).to.equal(42);
	});

	it("converts boolean fields", () => {
		const out = convertFormDataTypes(
			{ isActive: "yes", isDeleted: "false" },
			{ booleanFields: ["isActive", "isDeleted"] },
		);
		expect(out.isActive).to.equal(true);
		expect(out.isDeleted).to.equal(false);
	});

	it("parses json fields", () => {
		const out = convertFormDataTypes({ metadata: '{"a":1}' }, { jsonFields: ["metadata"] });
		expect(out.metadata).to.deep.equal({ a: 1 });
	});

	it("keeps invalid conversions as original value", () => {
		const out = convertFormDataTypes({ salary: "abc" }, { numericFields: ["salary"] });
		expect(out.salary).to.equal("abc");
	});
});

describe("convertWithPreset", () => {
	it("applies user preset numeric conversion", () => {
		const out = convertWithPreset({ age: "30" }, "user");
		expect(out.age).to.equal(30);
	});

	it("applies user preset boolean conversion", () => {
		const out = convertWithPreset({ isActive: "1", emailVerified: "no" }, "user");
		expect(out.isActive).to.equal(true);
		expect(out.emailVerified).to.equal(false);
	});

	it("applies user preset json conversion", () => {
		const out = convertWithPreset({ preferences: '{"theme":"dark"}' }, "user");
		expect(out.preferences).to.deep.equal({ theme: "dark" });
	});

	it("applies organization preset json conversion", () => {
		const out = convertWithPreset({ branding: '{"name":"ACME"}' }, "organization");
		expect(out.branding).to.deep.equal({ name: "ACME" });
	});

	it("throws for unknown preset", () => {
		expect(() => convertWithPreset({}, "unknown" as never)).to.throw("Unknown preset");
	});
});

describe("filterDatabaseFields", () => {
	it("removes single field", () => {
		const out = filterDatabaseFields({ a: 1, b: 2 }, ["a"]);
		expect(out).to.deep.equal({ b: 2 });
	});

	it("removes multiple fields", () => {
		const out = filterDatabaseFields({ a: 1, b: 2, c: 3 }, ["a", "c"]);
		expect(out).to.deep.equal({ b: 2 });
	});

	it("ignores non-existing fields", () => {
		const out = filterDatabaseFields({ a: 1 }, ["x"]);
		expect(out).to.deep.equal({ a: 1 });
	});

	it("returns shallow copy", () => {
		const input = { a: 1, b: 2 };
		const out = filterDatabaseFields(input, []);
		expect(out).to.not.equal(input);
		expect(out).to.deep.equal(input);
	});

	it("does not mutate original object", () => {
		const input = { a: 1, b: 2 };
		filterDatabaseFields(input, ["a"]);
		expect(input).to.deep.equal({ a: 1, b: 2 });
	});
});

describe("validateQueryParams", () => {
	const createLogger = () =>
		({
			error: () => undefined,
			info: () => undefined,
			warn: () => undefined,
			debug: () => undefined,
		}) as any;

	it("returns valid result for standard query", () => {
		const req = {
			query: { document: "true", pagination: "true", count: "false", page: "2", limit: "10" },
		} as any;
		const out = validateQueryParams(req, createLogger());
		expect(out.isValid).to.equal(true);
		expect(out.validatedParams?.skip).to.equal(10);
	});

	it("rejects when all flags are false", () => {
		const req = { query: { document: "false", pagination: "false", count: "false" } } as any;
		const out = validateQueryParams(req, createLogger());
		expect(out.isValid).to.equal(false);
	});

	it("rejects pagination true while document false", () => {
		const req = { query: { document: "false", pagination: "true", count: "true" } } as any;
		const out = validateQueryParams(req, createLogger());
		expect(out.isValid).to.equal(false);
	});

	it("rejects invalid order", () => {
		const req = {
			query: { document: "true", pagination: "false", count: "true", order: "sideways" },
		} as any;
		const out = validateQueryParams(req, createLogger());
		expect(out.isValid).to.equal(false);
	});

	it("normalizes aggregateBy and countBy when valid", () => {
		const req = {
			query: {
				document: "true",
				pagination: "false",
				count: "true",
				aggregateBy: "  department.employees, attendances ",
				countBy: " status ",
			},
		} as any;
		const out = validateQueryParams(req, createLogger());
		expect(out.isValid).to.equal(true);
		expect(out.validatedParams?.aggregateBy).to.equal("department.employees,attendances");
		expect(out.validatedParams?.countBy).to.equal("status");
	});
});
