import { describe, expect, it, vi } from "vitest";
import onboardingService from "./onboarding.service";
import { hrisApiClient } from "../lib/api-client";

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
	},
}));

const envelope = <T,>(data: T) => ({
	status: "success",
	message: "ok",
	data,
	code: 200,
	timestamp: new Date().toISOString(),
});

describe("OnboardingService", () => {
	it("fetches the department-filtered visible checklist", async () => {
		vi.mocked(hrisApiClient.get).mockResolvedValue(
			envelope({ checklist: { id: "chk-1", sections: [] } }) as any,
		);

		const result = await onboardingService.getVisibleChecklist("chk-1");
		expect(hrisApiClient.get).toHaveBeenCalledWith("/api/onboarding/checklists/chk-1/visible");
		expect(result.checklist.id).to.equal("chk-1");
	});

	it("signs an item with password + remarks via the dedicated sign route", async () => {
		vi.mocked(hrisApiClient.post).mockResolvedValue(
			envelope({ item: { id: "i1", status: "COMPLETED" }, signature: {}, checklist: {} }) as any,
		);

		const result = await onboardingService.signItem("i1", {
			password: "secret",
			remarks: "handed over",
		});
		expect(hrisApiClient.post).toHaveBeenCalledWith("/api/onboarding/items/i1/sign", {
			password: "secret",
			remarks: "handed over",
		});
		expect((result.item as any).status).to.equal("COMPLETED");
	});

	it("saves the full builder tree via PUT .../tree", async () => {
		vi.mocked(hrisApiClient.put).mockResolvedValue(
			envelope({ template: { id: "t1", sections: [] } }) as any,
		);

		const result = await onboardingService.replaceTemplateTree("t1", {
			name: "Standard",
			sections: [],
		});
		expect(hrisApiClient.put).toHaveBeenCalledWith("/api/onboarding/templates/t1/tree", {
			name: "Standard",
			sections: [],
		});
		expect(result.template.id).to.equal("t1");
	});

	it("creates a checklist instance for an employee from a template", async () => {
		vi.mocked(hrisApiClient.post).mockResolvedValue(
			envelope({ checklist: { id: "chk-2" } }) as any,
		);

		await onboardingService.createChecklist({
			employeeId: "emp-1",
			templateId: "tpl-1",
		});
		expect(hrisApiClient.post).toHaveBeenCalledWith("/api/onboarding/checklists", {
			employeeId: "emp-1",
			templateId: "tpl-1",
		});
	});
});
