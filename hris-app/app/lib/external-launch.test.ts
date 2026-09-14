import { describe, expect, it } from "vitest";
import { resolveExternalLaunchDecision } from "./external-launch";

describe("resolveExternalLaunchDecision", () => {
	it("navigates on the canonical HRIS success payload (status: success + launchUrl)", () => {
		const decision = resolveExternalLaunchDecision(
			{
				status: "success",
				message: "External LMS launch URL generated successfully",
				data: { launchUrl: "http://localhost:5173/auth/bridge?token=abc&orgCode=bnei", app: "lms" },
				code: 200,
				timestamp: "2026-09-07T00:00:00.000Z",
			},
			"lms",
		);

		expect(decision.navigate).toBe(true);
		expect(decision.launchUrl).toBe("http://localhost:5173/auth/bridge?token=abc&orgCode=bnei");
	});

	it("accepts legacy success payloads using success: true", () => {
		const decision = resolveExternalLaunchDecision(
			{ success: true, message: "ok", data: { launchUrl: "https://lms.example.com/auth/bridge?token=t" } },
			"lms",
		);

		expect(decision.navigate).toBe(true);
		expect(decision.launchUrl).toBe("https://lms.example.com/auth/bridge?token=t");
	});

	it("does not navigate when launchUrl is missing despite success", () => {
		const decision = resolveExternalLaunchDecision(
			{ status: "success", message: "ok", data: { app: "lms" } },
			"lms",
		);

		expect(decision.navigate).toBe(false);
		expect(decision.launchUrl).toBeUndefined();
		expect(decision.errorMessage).toContain("LMS");
	});

	it("does not navigate when launchUrl is empty or whitespace", () => {
		const decision = resolveExternalLaunchDecision(
			{ status: "success", message: "ok", data: { launchUrl: "   " } },
			"epmr",
		);

		expect(decision.navigate).toBe(false);
		expect(decision.errorMessage).toContain("EPMR");
	});

	it("does not navigate on error responses and surfaces the server message", () => {
		const decision = resolveExternalLaunchDecision(
			{ status: "error", message: "LMS external-handoff failed: 401", code: 401 },
			"lms",
		);

		expect(decision.navigate).toBe(false);
		expect(decision.errorMessage).toBe("LMS external-handoff failed: 401");
	});

	it("does not navigate when launchUrl is not an http(s) URL", () => {
		const decision = resolveExternalLaunchDecision(
			{ status: "success", message: "ok", data: { launchUrl: "javascript:alert(1)" } },
			"lms",
		);

		expect(decision.navigate).toBe(false);
		expect(decision.errorMessage).toBeDefined();
	});

	it("does not navigate for relative launch URLs (external apps must be absolute)", () => {
		const decision = resolveExternalLaunchDecision(
			{ status: "success", message: "ok", data: { launchUrl: "/dashboard" } },
			"lms",
		);

		expect(decision.navigate).toBe(false);
	});

	it("falls back to a generic error message for malformed responses", () => {
		expect(resolveExternalLaunchDecision(null, "lms").navigate).toBe(false);
		expect(resolveExternalLaunchDecision(undefined, "epmr").navigate).toBe(false);
		expect(resolveExternalLaunchDecision(null, "lms").errorMessage).toContain("LMS");
		expect(resolveExternalLaunchDecision(undefined, "epmr").errorMessage).toContain("EPMR");
	});
});
