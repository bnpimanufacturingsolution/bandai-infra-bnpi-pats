const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const evidenceDir = process.argv[2];
const targetUrl =
	"http://localhost:5175/admin/configuration/devices/events?view=saved&query=17&page=1";
const apiBase = "http://localhost:3001";

if (!evidenceDir) {
	throw new Error("Usage: node playwright-saved-events-category-action-proof.cjs <evidence-dir>");
}

fs.mkdirSync(evidenceDir, { recursive: true });

const isMainEventsResponse = (response, expected) => {
	if (response.request().method() !== "GET" || response.status() !== 200) return false;
	const url = new URL(response.url());
	if (url.pathname !== "/api/device/events" || url.searchParams.get("limit") !== "10") {
		return false;
	}
	return Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
};

const readVisibleTable = async (page) => {
	const rows = page.locator("[data-datatable-body-viewport] tbody tr:not(.animate-pulse)");
	await rows.first().waitFor({ state: "visible", timeout: 30_000 });
	return {
		count: await rows.count(),
		rows: await rows.allInnerTexts(),
		summary: await page
			.getByText(/saved rows? for this filter/i)
			.first()
			.innerText(),
	};
};

const selectFilter = async (page, comboboxIndex, optionName, expectedQuery) => {
	const responsePromise = page.waitForResponse(
		(response) => isMainEventsResponse(response, expectedQuery),
		{ timeout: 30_000 },
	);
	await page.getByRole("combobox").nth(comboboxIndex).click();
	await page.getByRole("option", { name: optionName }).click();
	const response = await responsePromise;
	const json = await response.json();
	await page.waitForFunction(
		({ category, action }) => {
			const url = new URL(window.location.href);
			return (
				(!category || url.searchParams.get("eventCategory") === category) &&
				(!action || url.searchParams.get("eventAction") === action) &&
				url.searchParams.get("page") === "1"
			);
		},
		{ category: expectedQuery.eventCategory, action: expectedQuery.eventAction },
	);
	return { response, json };
};

(async () => {
	const loginRes = await fetch(`${apiBase}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			email: "admin@bandai.local",
			identifier: "admin@bandai.local",
			password: "password123",
			appCode: "hris",
		}),
	});
	const loginJson = await loginRes.json();
	const token = loginJson?.data?.token;
	if (!loginRes.ok || !token) throw new Error(`login failed ${loginRes.status}`);

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		baseURL: "http://localhost:5175",
	});
	await context.addCookies([
		{ name: "token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
	]);
	await context.addInitScript(
		(actor) => {
			localStorage.setItem("authToken", actor.token);
			localStorage.setItem("userRole", actor.role || "hris-admin");
			if (actor.subRole) localStorage.setItem("userSubRole", actor.subRole);
			localStorage.setItem("e2eAuthUser", JSON.stringify(actor.user || {}));
		},
		{
			token,
			role: loginJson?.data?.role,
			subRole: loginJson?.data?.subRole,
			user: loginJson?.data,
		},
	);

	const page = await context.newPage();
	const consoleMessages = [];
	page.on("console", (message) =>
		consoleMessages.push({ type: message.type(), text: message.text() }),
	);

	try {
		const initialResponsePromise = page.waitForResponse(
			(response) => isMainEventsResponse(response, {}),
			{ timeout: 45_000 },
		);
		await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
		await initialResponsePromise;
		await page.getByRole("heading", { name: "Device events" }).waitFor({ timeout: 30_000 });
		const initial = await readVisibleTable(page);
		await page.screenshot({
			path: path.join(evidenceDir, "01-initial-query-17.png"),
			fullPage: true,
		});

		const categoryResult = await selectFilter(
			page,
			2,
			/^Enrollment(?:\s|$)/,
			{ eventCategory: "ENROLLMENT" },
		);
		const category = await readVisibleTable(page);
		await page.screenshot({
			path: path.join(evidenceDir, "02-category-enrollment.png"),
			fullPage: true,
		});

		const actionResult = await selectFilter(
			page,
			3,
			/^Fingerprint enrolled(?:\s|$)/,
			{ eventCategory: "ENROLLMENT", eventAction: "FINGERPRINT_ENROLLED" },
		);
		const action = await readVisibleTable(page);
		await page.screenshot({
			path: path.join(evidenceDir, "03-action-fingerprint-enrolled.png"),
			fullPage: true,
		});

		const categoryEvents = categoryResult.json?.data?.events || [];
		const actionEvents = actionResult.json?.data?.events || [];
		const assertions = {
			categoryUrlUpdated: new URL(categoryResult.response.url()).searchParams.get("eventCategory") === "ENROLLMENT",
			categoryResponseOnlyEnrollment:
				categoryEvents.length > 0 && categoryEvents.every((event) => event.eventCategory === "ENROLLMENT"),
			categoryTableRowsChanged: JSON.stringify(initial.rows) !== JSON.stringify(category.rows),
			actionUrlUpdated:
				new URL(actionResult.response.url()).searchParams.get("eventAction") === "FINGERPRINT_ENROLLED",
			actionResponseOnlyFingerprintEnrolled:
				actionEvents.length > 0 &&
				actionEvents.every((event) => event.eventAction === "FINGERPRINT_ENROLLED"),
			actionTableRowsChanged: JSON.stringify(category.rows) !== JSON.stringify(action.rows),
			finalBrowserUrlHasBothFilters:
				new URL(page.url()).searchParams.get("eventCategory") === "ENROLLMENT" &&
				new URL(page.url()).searchParams.get("eventAction") === "FINGERPRINT_ENROLLED",
		};
		const failed = Object.entries(assertions).filter(([, passed]) => !passed);

		const proof = {
			targetUrl,
			capturedAt: new Date().toISOString(),
			finalUrl: page.url(),
			initial,
			category: {
				...category,
				requestUrl: categoryResult.response.url(),
				apiTotal: categoryResult.json?.data?.pagination?.total,
				apiCategories: [...new Set(categoryEvents.map((event) => event.eventCategory))],
			},
			action: {
				...action,
				requestUrl: actionResult.response.url(),
				apiTotal: actionResult.json?.data?.pagination?.total,
				apiActions: [...new Set(actionEvents.map((event) => event.eventAction))],
			},
			assertions,
			consoleErrors: consoleMessages.filter((message) => message.type === "error"),
		};
		fs.writeFileSync(
			path.join(evidenceDir, "saved-events-category-action-proof.json"),
			JSON.stringify(proof, null, 2),
		);

		if (failed.length > 0) {
			throw new Error(`Playwright assertions failed: ${failed.map(([name]) => name).join(", ")}`);
		}
		process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
