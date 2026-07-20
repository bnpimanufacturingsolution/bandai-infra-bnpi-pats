import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Agent-owned proof that Device Events Keep ready + Prove land green.
 * Requires live local stack (API + app + DB tunnel + Hikvision listener path).
 */
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const evidenceDir = resolve(
	process.env.DEVICE_LIVE_READINESS_EVIDENCE_DIR ||
		`../.runtime/device-live-readiness-playwright-${stamp}`,
);

test.describe("Device live readiness Keep ready + Prove", () => {
	test("login → Device events → Prove green → Keep ready ON · TAP YES · ENROLL YES", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		mkdirSync(evidenceDir, { recursive: true });
		const consoleErrors: string[] = [];
		const failedRequests: Array<{ url: string; status?: number; error?: string | null }> = [];
		const readinessResponses: Array<{
			kind: "get" | "prove";
			status: number;
			overall?: string | null;
			safeToTap?: boolean | null;
			safeToEnroll?: boolean | null;
			proven?: boolean | null;
			headline?: string | null;
			operatorHint?: string | null;
		}> = [];

		page.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});
		page.on("requestfailed", (request) => {
			failedRequests.push({
				url: request.url(),
				error: request.failure()?.errorText || null,
			});
		});
		page.on("response", async (response) => {
			const url = response.url();
			const isGet =
				url.includes("/api/device/events/live-readiness") &&
				!url.includes("/live-readiness/prove");
			const isProve = url.includes("/api/device/events/live-readiness/prove");
			if (!isGet && !isProve) return;
			try {
				const body = await response.json();
				const data = body?.data ?? body;
				const readiness = data?.readiness ?? data;
				readinessResponses.push({
					kind: isProve ? "prove" : "get",
					status: response.status(),
					overall: readiness?.overall ?? null,
					safeToTap: readiness?.safeToTap ?? null,
					safeToEnroll: readiness?.safeToEnroll ?? null,
					proven: data?.proven ?? null,
					headline: readiness?.headline ?? null,
					operatorHint: data?.operatorHint ?? null,
				});
			} catch {
				readinessResponses.push({
					kind: isProve ? "prove" : "get",
					status: response.status(),
				});
			}
		});

		// 1) Login as admin
		await page.goto("/auth/login");
		await page
			.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")
			.fill("admin@bandai.local");
		await page.getByPlaceholder("Enter your password").fill("password123");
		await page.getByRole("button", { name: "Sign In" }).click();
		await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
			timeout: 45_000,
		});

		// 2) Device events (saved view — readiness strip only mounts here for events)
		await page.goto("/admin/configuration/devices/events?view=saved");
		await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible({
			timeout: 30_000,
		});

		// 3) Wait for readiness strip to finish loading
		const strip = page.locator("text=Keep ready").first();
		await expect(strip).toBeVisible({ timeout: 45_000 });
		await page.screenshot({
			path: resolve(evidenceDir, "01-events-after-load.png"),
			fullPage: true,
		});

		// 4) Click Prove / fix now (or Prove live path) and wait for prove network
		const proveButton = page
			.getByRole("button", { name: /Prove(\s*\/\s*fix now|\s+live path)?/i })
			.first();
		await expect(proveButton).toBeVisible({ timeout: 20_000 });

		const proveResponsePromise = page.waitForResponse(
			(response) =>
				response.url().includes("/api/device/events/live-readiness/prove") &&
				response.request().method() === "POST",
			{ timeout: 180_000 },
		);
		await proveButton.click();
		const proveResponse = await proveResponsePromise;
		expect(proveResponse.status(), "prove HTTP status").toBe(200);
		const proveBody = await proveResponse.json();
		const proveData = proveBody?.data ?? proveBody;
		const proveReadiness = proveData?.readiness ?? proveData;

		writeFileSync(
			resolve(evidenceDir, "prove-response.json"),
			JSON.stringify(proveData, null, 2),
		);

		// Truth matrix: green readiness is the pass condition (step noise cannot fail it).
		const readinessGreen =
			proveReadiness?.overall === "green" &&
			proveReadiness?.safeToTap === true &&
			proveReadiness?.safeToEnroll === true;
		expect(readinessGreen || proveData?.proven === true, "prove truth matrix green").toBe(
			true,
		);
		expect(proveReadiness?.overall, "prove.overall").toBe("green");
		expect(proveReadiness?.safeToTap, "prove.safeToTap").toBe(true);
		expect(proveReadiness?.safeToEnroll, "prove.safeToEnroll").toBe(true);

		// 5) UI green badges after prove settles
		await expect(page.getByText(/Safe to tap\s*\/\s*enroll/i).first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByText(/TAP\s+YES/i).first()).toBeVisible({ timeout: 15_000 });
		await expect(page.getByText(/ENROLL\s+YES/i).first()).toBeVisible({ timeout: 15_000 });

		// 6) Keep ready ON (toggle if needed)
		const keepReadyLabel = page.locator("label").filter({ hasText: /Keep ready/i }).first();
		await expect(keepReadyLabel).toBeVisible();
		const keepReadyText = (await keepReadyLabel.innerText()).replace(/\s+/g, " ");
		if (!/Keep ready\s*ON/i.test(keepReadyText)) {
			await keepReadyLabel.locator('button[role="switch"], [role="switch"]').click();
			await expect(keepReadyLabel).toContainText(/Keep ready\s*ON/i, { timeout: 10_000 });
		} else {
			await expect(keepReadyLabel).toContainText(/Keep ready\s*ON/i);
		}

		// 7) Optional: live capture receiving strip when listener is hot
		const bodyText = await page.locator("body").innerText();
		const receivingOrFresh =
			/Live capture receiving|proof fresh|Taps are reaching HRIS|Live receiving/i.test(
				bodyText,
			);
		expect(receivingOrFresh, "UI shows live receiving or fresh proof").toBe(true);

		await page.screenshot({
			path: resolve(evidenceDir, "02-prove-green-keep-ready-on.png"),
			fullPage: true,
		});

		writeFileSync(
			resolve(evidenceDir, "console-errors.json"),
			JSON.stringify(consoleErrors, null, 2),
		);
		writeFileSync(
			resolve(evidenceDir, "failed-requests.json"),
			JSON.stringify(failedRequests, null, 2),
		);
		writeFileSync(
			resolve(evidenceDir, "readiness-network.json"),
			JSON.stringify(readinessResponses, null, 2),
		);
		writeFileSync(resolve(evidenceDir, "page-text.txt"), bodyText);
		writeFileSync(
			resolve(evidenceDir, "summary.json"),
			JSON.stringify(
				{
					stamp,
					url: page.url(),
					prove: {
						// Truth matrix (not intermediate step noise)
						proven: readinessGreen || proveData?.proven === true,
						apiProvenField: proveData?.proven,
						overall: proveReadiness?.overall,
						safeToTap: proveReadiness?.safeToTap,
						safeToEnroll: proveReadiness?.safeToEnroll,
						operatorHint: proveReadiness?.headline || proveData?.operatorHint || null,
					},
					ui: {
						safeToTapEnrollVisible: true,
						tapYes: true,
						enrollYes: true,
						keepReadyOn: true,
						receivingOrFresh,
					},
					pass: true,
				},
				null,
				2,
			),
		);
	});
});
