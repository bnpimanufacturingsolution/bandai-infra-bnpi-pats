import { expect } from "chai";
import {
	normalizeDocumentFieldValueForValidation,
	validateDocumentFieldValue,
} from "../helper/document-field-validation.helper";

describe("document-field-validation.helper", () => {
	it("accepts SSS numbers with or without hyphens after digit normalization", () => {
		const field = {
			key: "number",
			label: "SSS Number",
			required: true,
			validation: { preset: "PH_SSS", normalize: "digits" as const },
		};

		expect(validateDocumentFieldValue(field, "1234567890").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "12-3456789-0").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "123456789").isValid).to.equal(false);
	});

	it("accepts individual and branch-code TIN values", () => {
		const field = {
			key: "number",
			label: "TIN",
			required: true,
			validation: { preset: "PH_TIN", normalize: "digits" as const },
		};

		expect(validateDocumentFieldValue(field, "123456789").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "123-456-789-001").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "12345678").isValid).to.equal(false);
	});

	it("accepts Pag-IBIG MID values with or without hyphens", () => {
		const field = {
			key: "number",
			label: "Pag-IBIG MID",
			required: true,
			validation: { preset: "PH_PAGIBIG", normalize: "digits" as const },
		};

		expect(validateDocumentFieldValue(field, "123456789012").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "1234-5678-9012").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "12345678901").isValid).to.equal(false);
	});

	it("accepts PhilHealth PIN values with or without hyphens", () => {
		const field = {
			key: "number",
			label: "PhilHealth Number",
			required: true,
			validation: { preset: "PH_PHILHEALTH", normalize: "digits" as const },
		};

		expect(validateDocumentFieldValue(field, "123456789012").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "12-345678901-2").isValid).to.equal(true);
		expect(validateDocumentFieldValue(field, "123123123123123").isValid).to.equal(false);
	});

	it("normalizes only digits when configured", () => {
		expect(normalizeDocumentFieldValueForValidation("12-345 6789-0", "digits")).to.equal(
			"1234567890",
		);
	});
});
