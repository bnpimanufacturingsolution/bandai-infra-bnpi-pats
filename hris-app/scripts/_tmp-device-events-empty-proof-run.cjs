const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const outDir =
	process.argv[2] ||
	path.join(__dirname, "playwright-dev");
const base = process.env.DEVICE_EVENTS_BASE_URL || "https://dev.bnpi-hris.tech";

(async () => {
	fs.mkdirSync(outDir, { recursive: true });
	const browser = await chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
	});
	const page = await browser.newPage({
		ignoreHTTPSErrors: true,
		viewport: { width: 1440, height: 900 },
	});
	const eventsApi = [];
	page.on("response", async (res) => {
		const url = res.url();
		if (
			!url.includes("/api/device/events") ||
			url.includes("live-readiness") ||
			url.includes("reset")
		) {
			return;
		}
		try {
			const json = await res.json();
			const data = json?.data || json;
			eventsApi.push({
				url,
				status: res.status(),
				eventsLen: Array.isArray(data?.events) ? data.events.length : null,
				total: data?.pagination?.total ?? data?.summary?.total ?? null,
			});
		} catch (e) {
			eventsApi.push({
				url,
				status: res.status(),
				error: String(e?.message || e),
			});
		}
	});

	await page.goto(`${base}/auth/login`, {
		waitUntil: "domcontentloaded",
		timeout: 45000,
	});
	// Prefer labeled fields when present
	const emailInput = page
		.locator('input[type="email"], input[name="email"], input[autocomplete="username"]')
		.first();
	if (await emailInput.count()) {
		await emailInput.fill("admin@bandai.local");
	} else {
		await page.locator("input").first().fill("admin@bandai.local");
	}
	await page.locator('input[type="password"]').fill("password123");
	const loginBtn = page.getByRole("button", { name: /sign in|log in|login/i });
	if (await loginBtn.count()) {
		await loginBtn.click();
	} else {
		await page.locator('button[type="submit"]').first().click();
	}
	await page.waitForTimeout(3000);

	await page.goto(`${base}/admin/devices/events?view=saved`, {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});
	// Wait for either rows or pagination text
	await page
		.waitForSelector(
			'[data-datatable-pagination], table tbody tr, text=Saved events',
			{ timeout: 30000 },
		)
		.catch(() => {});
	await page.waitForTimeout(4000);

	const shot = path.join(outDir, "device-events-saved.png");
	await page.screenshot({ path: shot, fullPage: true });

	const bodyRows = await page
		.locator("[data-datatable-row], table tbody tr")
		.count()
		.catch(() => -1);
	const pagination = await page
		.locator("[data-datatable-pagination]")
		.innerText()
		.catch(() => "");
	const summary = await page
		.locator("text=/saved row/i")
		.first()
		.innerText()
		.catch(() => "");
	const bodyViewport = await page
		.locator("[data-datatable-body-viewport]")
		.boundingBox()
		.catch(() => null);

	const result = {
		base,
		url: page.url(),
		bodyRows,
		pagination,
		summary,
		bodyViewportHeight: bodyViewport?.height ?? null,
		eventsApi: eventsApi.slice(0, 10),
		screenshot: shot,
	};
	fs.writeFileSync(path.join(outDir, "proof.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 2));
	await browser.close();
})().catch((e) => {
	console.error("FAIL", e);
	process.exit(1);
});
