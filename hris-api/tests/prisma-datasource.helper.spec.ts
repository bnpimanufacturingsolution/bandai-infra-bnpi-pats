import { expect } from "chai";
import {
	assertValidPrismaDatasourceUrl,
	PrismaDatasourceConfigError,
	validatePrismaDatasourceUrl,
} from "../helper/prisma-datasource.helper";

describe("Prisma Datasource Helper", () => {
	it("accepts mongodb datasource URLs", () => {
		const result = validatePrismaDatasourceUrl("mongodb://localhost:27017/hris");

		expect(result.valid).to.equal(true);
		expect(result.displayValue).to.equal("mongodb://localhost:27017/hris");
	});

	it("accepts mongodb+srv datasource URLs", () => {
		const result = validatePrismaDatasourceUrl("mongodb+srv://cluster.example.com/hris");

		expect(result.valid).to.equal(true);
		expect(result.displayValue).to.equal("mongodb+srv://cluster.example.com/hris");
	});

	it("accepts postgresql datasource URLs", () => {
		const result = validatePrismaDatasourceUrl("postgresql://postgres:secret@localhost:5432/hris");

		expect(result.valid).to.equal(true);
		expect(result.displayValue).to.equal("postgresql://localhost:5432/hris");
	});

	it("accepts postgres datasource URLs", () => {
		const result = validatePrismaDatasourceUrl("postgres://postgres:secret@localhost:5432/hris");

		expect(result.valid).to.equal(true);
		expect(result.displayValue).to.equal("postgres://localhost:5432/hris");
	});

	it("rejects prisma datasource URLs and redacts credentials", () => {
		const result = validatePrismaDatasourceUrl(
			"prisma://user:secret@accelerate.example.com/?api_key=top-secret",
		);

		expect(result.valid).to.equal(false);
		expect(result.displayValue).to.equal("prisma://accelerate.example.com/");
		expect(result.reason).to.include("mongodb://");
		expect(result.reason).to.include("postgresql://");
		expect(result.reason).to.include("dotenv.config()");
	});

	it("throws a configuration error for invalid effective datasource URLs", () => {
		expect(() =>
			assertValidPrismaDatasourceUrl({
				context: "test.datasource",
				rawValue: "prisma://accelerate.example.com",
			}),
		).to.throw(PrismaDatasourceConfigError);
	});
});
