import { test, expect } from "@playwright/test";

const guestIp = process.env.PROJECT_TRUTH_GUEST_IP || "192.168.100.84";
const evidenceDir =
	process.env.PROJECT_TRUTH_EVIDENCE_DIR ||
	"../.runtime/overnight-dev-current-gcp/20260618-014413/screenshots";

const environments = [
	{ name: "prod", url: `http://${guestIp}:3000/auth/login` },
	{ name: "dev", url: `http://${guestIp}:3100/auth/login` },
	{ name: "uat", url: `http://${guestIp}:3200/auth/login` },
];

for (const env of environments) {
	test(`${env.name} browser login works on imported VirtualBox VM`, async ({ page }) => {
		test.setTimeout(90_000);
		const consoleMessages: string[] = [];
		const failedRequests: string[] = [];

		page.on("console", (message) => {
			if (["error", "warning"].includes(message.type())) {
				consoleMessages.push(`${message.type()}: ${message.text()}`);
			}
		});
		page.on("requestfailed", (request) => {
			failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
		});

		await page.goto(env.url, { waitUntil: "load" });
		await expect(page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")).toBeVisible({
			timeout: 45_000,
		});
		await page.screenshot({ path: `${evidenceDir}/${env.name}-login.png`, fullPage: true });

		await page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local").fill("hr-manager@seed.local");
		await page.getByPlaceholder("Enter your password").fill("Password123!");
		await page.getByRole("button", { name: /sign in/i }).click();

		await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 30_000 });
		await expect(page.getByText("Working Space")).toBeVisible({ timeout: 30_000 });
		await page.screenshot({ path: `${evidenceDir}/${env.name}-dashboard.png`, fullPage: true });

		expect(
			consoleMessages.filter(
				(message) =>
					!message.includes("React Router Future Flag Warning") &&
					!message.includes("Failed to load resource"),
			),
			`console warnings/errors: ${consoleMessages.join("\n")}`,
		).toEqual([]);
		test.info().annotations.push({
			type: "network",
			description: failedRequests.length ? failedRequests.join("\n") : "no failed requests",
		});
	});
}
