import { expect } from "chai";
import {
	extractWorkflowConfigs,
	getRequestWorkflowConfig,
	getSeededWorkflowConfigs,
	getWorkflowConfigByCode,
	mergeWithSeededWorkflowConfigs,
	normalizeWorkflowConfigRecord,
	removeWorkflowConfigFromBranding,
	resetWorkflowConfigInBranding,
	seedWorkflowConfigsInBranding,
	setWorkflowConfigInBranding,
} from "../helper/workflow-config.helper";

describe("workflow-config.helper", () => {
	it("normalizes code to uppercase and trims name/description", () => {
		const config = normalizeWorkflowConfigRecord({
			code: " wf-custom ",
			name: "  Custom Workflow  ",
			description: "  desc  ",
		});
		expect(config.code).to.equal("WF-CUSTOM");
		expect(config.name).to.equal("Custom Workflow");
		expect(config.description).to.equal("desc");
	});

	it("uses fallback fields when primary config is partial", () => {
		const config = normalizeWorkflowConfigRecord(
			{ code: "wf-partial" },
			{ name: "Fallback Name", description: "fallback", domain: "REQUEST" as any },
		);
		expect(config.code).to.equal("WF-PARTIAL");
		expect(config.name).to.equal("Fallback Name");
		expect(config.description).to.equal("fallback");
	});

	it("defaults description to null when empty", () => {
		const config = normalizeWorkflowConfigRecord({ code: "WF-EMPTY", description: "" });
		expect(config.description).to.equal(null);
	});

	it("defaults to REQUEST domain when unspecified", () => {
		const config = normalizeWorkflowConfigRecord({ code: "WF-DOMAIN-DEFAULT" });
		expect(config.domain).to.equal("REQUEST");
	});

	it("keeps requisition workflow states canonical", () => {
		const config = normalizeWorkflowConfigRecord({
			code: "WF-RECRUITMENT-REQUISITION-DEFAULT",
			states: [{ key: "HACKED", label: "Hacked", order: 0, isTerminal: false }] as any,
		});
		expect(config.states[0].key).to.equal("OPEN");
		expect(config.states.some((state) => state.key === "COMPLETED")).to.equal(true);
	});

	it("keeps requisition workflow steps canonical", () => {
		const config = normalizeWorkflowConfigRecord({
			code: "WF-RECRUITMENT-REQUISITION-DEFAULT",
			steps: [{ step_name: "Hacked step" }] as any,
		});
		expect(config.steps).to.have.length(3);
		expect(config.steps[0].step_name).to.equal("Requester Submission");
	});

	it("normalizes custom steps and assigns defaults", () => {
		const config = normalizeWorkflowConfigRecord({
			code: "WF-CUSTOM-STEPS",
			steps: [{ step_name: "  A  ", assignee_type: "hr", step_type: "task" }] as any,
		});
		expect(config.steps).to.have.length(1);
		expect(config.steps[0].step_number).to.equal(1);
		expect(config.steps[0].step_name).to.equal("A");
		expect(config.steps[0].assignee_type).to.equal("HR");
		expect(config.steps[0].step_type).to.equal("TASK");
	});

	it("provides seeded lifecycle states when states are missing", () => {
		const config = normalizeWorkflowConfigRecord({
			code: "WF-NO-STATES",
			states: [] as any,
		});
		expect(config.states.length).to.be.greaterThan(0);
	});

	it("returns seeded workflow configs with unique codes", () => {
		const seeded = getSeededWorkflowConfigs();
		const uniqueCodes = new Set(seeded.map((item) => item.code));
		expect(seeded.length).to.be.greaterThan(0);
		expect(uniqueCodes.size).to.equal(seeded.length);
	});

	it("extracts workflow configs from branding provisioning", () => {
		const extracted = extractWorkflowConfigs({
			provisioning: {
				workflowConfigs: [
					{
						code: "wf-extract",
						name: "Extract Me",
						domain: "REQUEST",
						states: [],
						steps: [],
					},
				],
			},
		});
		expect(extracted).to.have.length(1);
		expect(extracted[0].code).to.equal("WF-EXTRACT");
	});

	it("ignores extracted entries with empty code", () => {
		const extracted = extractWorkflowConfigs({
			provisioning: { workflowConfigs: [{ code: "   " }, { code: "WF-KEEP" }] },
		});
		expect(extracted.map((x) => x.code)).to.deep.equal(["WF-KEEP"]);
	});

	it("merges stored overrides with seeded defaults", () => {
		const merged = mergeWithSeededWorkflowConfigs({
			provisioning: {
				workflowConfigs: [
					{
						code: "WF-TIMESHEET-DEFAULT",
						name: "Overridden Timesheet Name",
						domain: "REQUEST",
						requestType: "TIMESHEET",
						states: [],
						steps: [],
					},
				],
			},
		});
		const target = merged.find((item) => item.code === "WF-TIMESHEET-DEFAULT");
		expect(target?.name).to.equal("Overridden Timesheet Name");
	});

	it("keeps custom non-seeded workflows during merge", () => {
		const merged = mergeWithSeededWorkflowConfigs({
			provisioning: {
				workflowConfigs: [
					{
						code: "WF-CUSTOM-NONSEEDED",
						name: "Custom Added",
						domain: "REQUEST",
						states: [],
						steps: [],
					},
				],
			},
		});
		expect(merged.some((item) => item.code === "WF-CUSTOM-NONSEEDED")).to.equal(true);
	});

	it("getWorkflowConfigByCode returns null for blank code", () => {
		expect(getWorkflowConfigByCode({}, "   ")).to.equal(null);
	});

	it("getWorkflowConfigByCode is case-insensitive", () => {
		const config = getWorkflowConfigByCode({}, "wf-timesheet-default");
		expect(config?.code).to.equal("WF-TIMESHEET-DEFAULT");
	});

	it("getRequestWorkflowConfig resolves preferred code first", () => {
		const config = getRequestWorkflowConfig({
			branding: {},
			preferredCode: "WF-TIMESHEET-EDIT-PERMISSION",
			requestType: "TIMESHEET",
		});
		expect(config?.code).to.equal("WF-TIMESHEET-EDIT-PERMISSION");
	});

	it("getRequestWorkflowConfig resolves by requestType when unique", () => {
		const config = getRequestWorkflowConfig({
			branding: {},
			requestType: "REGULARIZATION",
		});
		expect(config?.requestType).to.equal("REGULARIZATION");
	});

	it("setWorkflowConfigInBranding upserts custom workflow", () => {
		const next = setWorkflowConfigInBranding({}, {
			code: "WF-SET-1",
			name: "Set Workflow",
			domain: "REQUEST",
			states: [],
			steps: [],
		});
		const stored = extractWorkflowConfigs(next);
		expect(stored.some((item) => item.code === "WF-SET-1")).to.equal(true);
	});

	it("setWorkflowConfigInBranding replaces existing custom workflow", () => {
		const first = setWorkflowConfigInBranding({}, {
			code: "WF-SET-2",
			name: "Old Name",
			domain: "REQUEST",
			states: [],
			steps: [],
		});
		const second = setWorkflowConfigInBranding(first, {
			code: "WF-SET-2",
			name: "New Name",
			domain: "REQUEST",
			states: [],
			steps: [],
		});
		const stored = extractWorkflowConfigs(second).find((item) => item.code === "WF-SET-2");
		expect(stored?.name).to.equal("New Name");
	});

	it("removeWorkflowConfigFromBranding removes custom config", () => {
		const first = setWorkflowConfigInBranding({}, {
			code: "WF-REMOVE-ME",
			name: "Removable",
			domain: "REQUEST",
			states: [],
			steps: [],
		});
		const second = removeWorkflowConfigFromBranding(first, "WF-REMOVE-ME");
		expect(extractWorkflowConfigs(second).some((item) => item.code === "WF-REMOVE-ME")).to.equal(
			false,
		);
	});

	it("removeWorkflowConfigFromBranding throws for seeded workflow", () => {
		expect(() =>
			removeWorkflowConfigFromBranding({}, "WF-TIMESHEET-DEFAULT"),
		).to.throw("DEFAULT_WORKFLOW_CONFIG_CANNOT_BE_DELETED");
	});

	it("resetWorkflowConfigInBranding throws for unknown non-seeded config", () => {
		expect(() => resetWorkflowConfigInBranding({}, "WF-UNKNOWN")).to.throw(
			"DEFAULT_WORKFLOW_CONFIG_NOT_FOUND",
		);
	});

	it("resetWorkflowConfigInBranding restores seeded workflow", () => {
		const overridden = setWorkflowConfigInBranding({}, {
			code: "WF-TIMESHEET-DEFAULT",
			name: "Mutated Name",
			domain: "REQUEST",
			states: [],
			steps: [],
		});
		const reset = resetWorkflowConfigInBranding(overridden, "WF-TIMESHEET-DEFAULT");
		const found = getWorkflowConfigByCode(reset, "WF-TIMESHEET-DEFAULT");
		expect(found?.name).to.not.equal("Mutated Name");
	});

	it("seedWorkflowConfigsInBranding writes merged workflow configs into branding", () => {
		const seededBranding = seedWorkflowConfigsInBranding({});
		const configs = extractWorkflowConfigs(seededBranding);
		expect(configs.length).to.be.greaterThan(0);
		expect(configs.some((item) => item.code === "WF-TIMESHEET-DEFAULT")).to.equal(true);
	});
});
