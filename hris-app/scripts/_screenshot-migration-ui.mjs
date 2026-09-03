import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const base = process.env.APP_BASE || "http://localhost:5176";
const apiBase = process.env.API_BASE || "http://localhost:3001";
const out = path.resolve(process.cwd(), "..", ".runtime", "migration-ui-ux-20260723");
fs.mkdirSync(out, { recursive: true });

const loginRes = await fetch(`${apiBase}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
		email: "admin@bandai.local",
		password: "password123",
		appCode: "hris",
	}),
});
const loginJson = await loginRes.json();
const user = loginJson?.data || loginJson;
if (!user?.token) {
	console.error("API login failed", loginJson);
	process.exit(1);
}

const browser = await chromium.launch({
	headless: true,
	args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const log = [];

try {
	await page.goto(`${base}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
	await page.evaluate(
		({ userData }) => {
			localStorage.setItem("authToken", userData.token);
			localStorage.setItem("e2eAuthUser", JSON.stringify(userData));
			if (userData.role) localStorage.setItem("userRole", userData.role);
		},
		{ userData: user },
	);

	await page.goto(`${base}/admin/configuration/migration`, {
		waitUntil: "networkidle",
		timeout: 60_000,
	});
	await page.waitForTimeout(2000);
	await page.screenshot({ path: path.join(out, "01-hub.png"), fullPage: true });
	log.push({
		step: "hub",
		url: page.url(),
		headings: await page.locator("h1,h2,h3").allInnerTexts(),
		text: (await page.locator("body").innerText()).slice(0, 3500),
	});

	await page.goto(`${base}/admin/configuration/migration?workbook=dm3`, {
		waitUntil: "networkidle",
		timeout: 60_000,
	});
	await page.waitForTimeout(2500);
	await page.screenshot({ path: path.join(out, "02-dm3-workbook-page.png"), fullPage: true });
	log.push({
		step: "dm3",
		url: page.url(),
		headings: await page.locator("h1,h2,h3").allInnerTexts(),
		buttons: await page.locator("button").evaluateAll((els) =>
			els
				.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
				.filter(Boolean)
				.slice(0, 50),
		),
		text: (await page.locator("body").innerText()).slice(0, 6000),
	});

	const uploadBtn = page.getByRole("button", { name: /upload workbook/i });
	if (await uploadBtn.count()) {
		await uploadBtn.first().click();
		await page.waitForTimeout(800);
		await page.screenshot({ path: path.join(out, "03-dm3-upload-modal.png"), fullPage: true });
		log.push({ step: "dm3-upload-modal", open: true });
		await page.keyboard.press("Escape");
		await page.waitForTimeout(400);
	}

	await page.goto(`${base}/admin/configuration/migration?workbook=dm4`, {
		waitUntil: "networkidle",
		timeout: 60_000,
	});
	await page.waitForTimeout(2500);
	await page.screenshot({ path: path.join(out, "04-dm4-workbook-page.png"), fullPage: true });
	log.push({
		step: "dm4",
		url: page.url(),
		headings: await page.locator("h1,h2,h3").allInnerTexts(),
		buttons: await page.locator("button").evaluateAll((els) =>
			els
				.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
				.filter(Boolean)
				.slice(0, 50),
		),
		text: (await page.locator("body").innerText()).slice(0, 6000),
	});

	fs.writeFileSync(path.join(out, "ui-proof.json"), JSON.stringify(log, null, 2));
	console.log("OK", out);
} catch (error) {
	await page.screenshot({ path: path.join(out, "error.png"), fullPage: true }).catch(() => {});
	fs.writeFileSync(
		path.join(out, "error.json"),
		JSON.stringify({ message: String(error), stack: error?.stack, url: page.url() }, null, 2),
	);
	console.error("FAIL", error);
	process.exitCode = 1;
} finally {
	await browser.close();
}
