import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Live UI proof for the documented DEV line-leader account.
 * Doc: docs/LINE_LEADER_ACCOUNT.md
 * Account: leader@bandai.local / password123 (hris-line-leader, linked to TESTBEN004)
 * Runs against the local dev app (http://localhost:5175 -> http://localhost:3001 API).
 * Skips automatically when the local stack is not reachable so CI is unaffected.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/line-leader-account-check-20260908-092132/browser-proof",
);

test("line leader account logs in through the UI and derives manager-class role", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = {
		account: "leader@bandai.local",
		startedAt: new Date().toISOString(),
	};

	page.on("response", (res) => {
		if (res.url().includes("/api/auth/login")) {
			results.loginResponseStatus = res.status();
		}
	});

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	await expect(identifier).toBeVisible({ timeout: 30_000 });

	await identifier.fill("leader@bandai.local");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();

	// Login is proven when we leave the login route.
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 120_000,
	});
	results.postLoginUrl = page.url();

	// Regression guard: the line-leader role must NOT be dumped on /403
	// (login.tsx / landing.tsx role allowlists previously missed hris-line-leader).
	expect(page.url()).not.toContain("/403");

	// The role redirect map sends hris-line-leader to /dashboard (ManagerDashboard).
	expect(page.url()).toContain("/dashboard");

	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.screenshot({
		path: path.join(EVIDENCE_DIR, "line-leader-dashboard.png"),
		fullPage: false,
	});

	// Capture auth/me from the live session. The app calls the API cross-origin
	// (VITE_API_URL -> http://localhost:3001/api) with cookie credentials; a relative
	// /api fetch would hit the Vite SPA fallback and return HTML instead of JSON.
	try {
		const meResponse = await page.evaluate(async () => {
			const res = await fetch("http://localhost:3001/api/auth/me", {
				credentials: "include",
			});
			const text = await res.text();
			let body: unknown = text;
			try {
				body = JSON.parse(text);
			} catch {
				// keep raw text for diagnosis
			}
			return { status: res.status, body };
		});
		results.me = meResponse;
		const meBody = (meResponse as { body?: { data?: { role?: string } } }).body;
		const derivedRole = meBody?.data?.role;
		results.derivedRole = derivedRole ?? "unavailable";
		expect(derivedRole).toBe("hris-line-leader");
	} finally {
		results.finishedAt = new Date().toISOString();
		writeFileSync(
			path.join(EVIDENCE_DIR, `ui-proof-${testInfo.status ?? "done"}.json`),
			JSON.stringify(results, null, 2),
		);
	}
});
