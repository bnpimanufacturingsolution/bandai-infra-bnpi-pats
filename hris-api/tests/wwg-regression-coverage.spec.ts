import { expect } from "chai";
import {
	getSeededWorkflowConfigs,
	getWorkflowConfigByCode,
	mergeWithSeededWorkflowConfigs,
} from "../helper/workflow-config.helper";
import {
	PrismaDatasourceConfigError,
	assertValidPrismaDatasourceUrl,
	validatePrismaDatasourceUrl,
} from "../helper/prisma-datasource.helper";
import {
	buildEmployeeActionBlockedPayload,
	getEmployeeActionBlock,
} from "../helper/employee-action-block.helper";
import { validateDocumentFieldValue } from "../helper/document-field-validation.helper";

describe("WWG regression coverage", () => {
	it("Onboarding validation regression: applicant workflow includes ONBOARDING_READY state", () => {
		const applicant = getSeededWorkflowConfigs().find(
			(config) => config.code === "WF-RECRUITMENT-APPLICANT-DEFAULT",
		);
		expect(applicant).to.not.equal(undefined);
		expect(applicant?.states.some((state) => state.key === "ONBOARDING_READY")).to.equal(true);
	});

	it("Onboarding progress regression: workflow preserves transition into ONBOARDING_READY", () => {
		const applicant = getWorkflowConfigByCode({}, "WF-RECRUITMENT-APPLICANT-DEFAULT");
		const transitionStep = applicant?.steps.find(
			(step) => step.state_on_enter === "OFFER_SENT" && step.state_on_complete === "ONBOARDING_READY",
		);
		expect(transitionStep).to.not.equal(undefined);
	});

	it("Dashboard empty-state regression: unknown workflow code returns null instead of throwing", () => {
		expect(getWorkflowConfigByCode({}, "WF-DOES-NOT-EXIST")).to.equal(null);
	});

	it("Persistence migration regression: stored custom workflow survives seeded merge", () => {
		const merged = mergeWithSeededWorkflowConfigs({
			provisioning: {
				workflowConfigs: [
					{
						code: "WF-CUSTOM-PERSISTENCE",
						name: "Custom Persistence Workflow",
						domain: "REQUEST",
						requestType: "OTHER",
						states: [{ key: "OPEN", label: "Open", order: 0, isTerminal: false }],
						steps: [],
						isActive: true,
						isDefault: false,
					},
				],
			},
		});
		expect(merged.some((config) => config.code === "WF-CUSTOM-PERSISTENCE")).to.equal(true);
	});

	it("Auth/security failure-state regression: blocked employment returns deactivation payload", () => {
		const block = getEmployeeActionBlock({ employmentStatus: "TERMINATED" });
		const payload = buildEmployeeActionBlockedPayload(block);
		expect(block.blocked).to.equal(true);
		expect(payload.error).to.equal("EMPLOYEE_SELF_SERVICE_BLOCKED");
		expect(payload.data.employmentStatus).to.equal("TERMINATED");
	});

	it("Parsing invalid-input regression: invalid PH_SSS number fails validation", () => {
		const result = validateDocumentFieldValue(
			{
				label: "SSS Number",
				required: true,
				validation: { preset: "PH_SSS", normalize: "digits" },
			},
			"12-345",
		);
		expect(result.isValid).to.equal(false);
		expect(String(result.message || "").length).to.be.greaterThan(0);
	});

	it("API/client integration seam regression: datasource assertion fails with typed config error", () => {
		expect(() =>
			assertValidPrismaDatasourceUrl({
				context: "regression.auth.datasource",
				rawValue: "prisma://accelerate.example.com",
			}),
		).to.throw(PrismaDatasourceConfigError);
	});

	it("Client error-handling regression: invalid datasource includes redacted display value", () => {
		const result = validatePrismaDatasourceUrl("prisma://user:pass@host:5432/db");
		expect(result.valid).to.equal(false);
		expect(result.displayValue).to.include("prisma://");
		expect(result.displayValue).to.not.include("user:pass");
	});
});

