/**
 * Live browser proof: real local app (5175) + real local API (3001) + real DEV DB.
 * Logs in as admin, opens /admin/configuration/sections, proves the Line Leaders
 * column renders and the edit modal exposes the Line Leaders multi-select.
 * Screenshot + JSON evidence under .runtime/browser-evidence/sections-line-leaders-live/.
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const APP = "http://localhost:5175";
const OUT = path.resolve(".runtime/browser-evidence/sections-line-leaders-live");
fs.mkdirSync(OUT, { recursive: true });

const timestamp = () => new Date().toISOString();

async function main() {
	const result = { startedAt: timestamp(), steps: [] };
	const browser = await chromium.launch({ headless: true });
	const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
	const consoleErrors = [];
	const failedResponses = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("response", (response) => {
		if (response.status() >= 400) {
			failedResponses.push({ url: response.url(), status: response.status() });
		}
	});

	// Login through the real UI
	await page.goto(`${APP}/auth/login`, { waitUntil: "domcontentloaded" });
	await page.getByPlaceholder(/you@company\.com/i).fill("admin@bandai.local");
	await page.locator('input[type="password"]').fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL(/dashboard|admin|hr/i, { timeout: 30000 });
	result.steps.push({ step: "login", at: timestamp(), url: page.url() });

	// Navigate to sections config
	await page.goto(`${APP}/admin/configuration/sections`, { waitUntil: "domcontentloaded" });
	const table = page.getByRole("table").filter({ hasText: "Import/Export Operations" });
	await table.waitFor({ state: "visible", timeout: 30000 });
	result.steps.push({ step: "sections_page", at: timestamp(), url: page.url() });

	const headers = await page.getByRole("columnheader").allInnerTexts();
	result.headers = headers;
	result.lineLeadersColumnPresent = headers.some((header) => /line leaders/i.test(header));

	// Open Edit on the first row and wait for the form modal
	const firstRow = page.getByRole("row").filter({ hasText: "Import/Export Operations" });
	await firstRow.getByRole("button").first().click();
	await page.getByRole("menuitem", { name: /edit/i }).click();
	const dialog = page.getByRole("dialog");
	await dialog.waitFor({ state: "visible", timeout: 15000 });
	await page.waitForTimeout(3000); // allow section GET + form render
	result.dialogText = (await dialog.innerText().catch(() => "")).slice(0, 800);
	result.lineLeadersFieldPresent = await dialog
		.getByText("Line Leaders (optional)")
		.isVisible()
		.catch(() => false);
	result.addLineLeaderPlaceholder = await dialog
		.getByPlaceholder(/add line leader/i)
		.isVisible()
		.catch(() => false);

	await page.screenshot({
		path: path.join(OUT, "sections-edit-line-leaders.png"),
		fullPage: false,
	});
	result.failedResponses = failedResponses;
	result.consoleErrors = consoleErrors;
	result.finishedAt = timestamp();
	fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 2));
	await browser.close();
}

main().catch((error) => {
	console.error("PROOF_FAILED", error);
	process.exit(1);
});
