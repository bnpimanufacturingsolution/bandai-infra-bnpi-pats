/**
 * Multi-env login matrix: HRIS admin + Employee apps on DEV / UAT / PROD public hosts.
 * Uses Cloudflare *.bnpi-hris.tech (reachable from this workstation).
 * Employee kiosk: click "Manual Login" before filling the form.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@bandai.local";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "password123";

/** Documented seed from hris-api generalEmployeeSeeder.shared.ts */
const EMP_SEED_EMAIL = process.env.PLAYWRIGHT_EMP_EMAIL || "employee@seed.local";
const EMP_SEED_PASSWORD = process.env.PLAYWRIGHT_EMP_PASSWORD || "Password123!";
const HR_SEED_EMAIL = process.env.PLAYWRIGHT_HR_EMAIL || "hr-manager@seed.local";
const HR_SEED_PASSWORD = process.env.PLAYWRIGHT_HR_PASSWORD || "Password123!";

const TARGETS = [
	{ env: "dev", base: "https://dev.bnpi-hris.tech", kind: "hris" },
	{ env: "uat", base: "https://uat.bnpi-hris.tech", kind: "hris" },
	{ env: "prod", base: "https://bnpi-hris.tech", kind: "hris" },
	{ env: "dev", base: "https://dev-emp.bnpi-hris.tech", kind: "emp" },
	{ env: "uat", base: "https://uat-emp.bnpi-hris.tech", kind: "emp" },
	{ env: "prod", base: "https://emp.bnpi-hris.tech", kind: "emp" },
] as const;

type Target = (typeof TARGETS)[number];

const evidenceDir =
	process.env.PLAYWRIGHT_EVIDENCE_DIR ||
	path.join(process.cwd(), "..", ".runtime", "lan-cors-playwright-latest");

type LoginResult = {
	consoleErrors: string[];
	pageErrors: string[];
	failedResponses: string[];
	finalUrl: string;
	credentialUsed: string;
	pass: boolean;
	error?: string;
	page: Page;
};

const summaryRows: Array<{
	env: string;
	kind: string;
	url: string;
	pass: string;
	finalUrl: string;
	errors: string;
	credential: string;
}> = [];

async function openManualLoginIfNeeded(page: Page) {
	const emailInput = page.locator('input[type="email"]').first();
	const manual = page.getByRole("button", { name: /manual login/i });
	// Prefer first visible of email form (HRIS) or Manual Login (employee kiosk).
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		if (await emailInput.isVisible().catch(() => false)) return;
		if (await manual.isVisible().catch(() => false)) {
			await manual.click();
			await emailInput.waitFor({ state: "visible", timeout: 10_000 });
			return;
		}
		const altEmail = page
			.getByPlaceholder(/email|EMP-HR|@/i)
			.or(page.locator('input[name="email"]'))
			.first();
		if (await altEmail.isVisible().catch(() => false)) return;
		await page.waitForTimeout(200);
	}
	throw new Error("login form not visible (no email field / Manual Login)");
}

async function attemptLogin(
	page: Page,
	base: string,
	emailVal: string,
	passwordVal: string,
): Promise<LoginResult> {
	const consoleErrors: string[] = [];
	const pageErrors: string[] = [];
	const failedResponses: string[] = [];
	let loginStatus: number | null = null;

	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});
	page.on("pageerror", (err) => pageErrors.push(String(err)));
	page.on("response", (res) => {
		const url = res.url();
		if (url.includes("/api/") && res.status() >= 400) {
			failedResponses.push(`${res.status()} ${url}`);
		}
		if (url.includes("/api/auth/login") && res.request().method() === "POST") {
			loginStatus = res.status();
		}
	});

	try {
		// Avoid networkidle — employee kiosk polls biometrics continuously.
		await page.goto(`${base}/auth/login`, {
			waitUntil: "domcontentloaded",
			timeout: 45_000,
		});
		await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});

		await openManualLoginIfNeeded(page);

		const email = page
			.locator('input[type="email"]')
			.or(page.getByPlaceholder(/email|EMP-HR|employee@|@/i))
			.or(page.locator('input[name="email"]'))
			.first();
		const password = page
			.locator('input[type="password"]')
			.or(page.getByPlaceholder(/password/i))
			.first();
		// Prefer real submit — do NOT match kiosk "Manual Login" button.
		const submit = page.locator('form button[type="submit"], button[type="submit"]').first();

		await email.fill(emailVal);
		await password.fill(passwordVal);
		await submit.click();

		// Wait for either navigation away from login OR a failed login API response
		const deadline = Date.now() + 12_000;
		while (Date.now() < deadline) {
			if (!page.url().includes("/auth/login")) {
				// Settle home shell so screenshots show linked profile (not blank flash).
				await page
					.getByRole("button", { name: /log out/i })
					.waitFor({ state: "visible", timeout: 8_000 })
					.catch(() => {});
				await page.waitForTimeout(400);
				return {
					consoleErrors,
					pageErrors,
					failedResponses,
					finalUrl: page.url(),
					credentialUsed: emailVal,
					pass: true,
					page,
				};
			}
			if (loginStatus !== null && loginStatus >= 400) {
				return {
					consoleErrors,
					pageErrors,
					failedResponses,
					finalUrl: page.url(),
					credentialUsed: emailVal,
					pass: false,
					error: `auth login HTTP ${loginStatus}`,
					page,
				};
			}
			const inlineErr = page.locator(".employee-login-kiosk-error");
			if (await inlineErr.isVisible().catch(() => false)) {
				const text = (await inlineErr.textContent())?.trim() || "inline auth error";
				return {
					consoleErrors,
					pageErrors,
					failedResponses,
					finalUrl: page.url(),
					credentialUsed: emailVal,
					pass: false,
					error: text,
					page,
				};
			}
			await page.waitForTimeout(250);
		}

		return {
			consoleErrors,
			pageErrors,
			failedResponses,
			finalUrl: page.url(),
			credentialUsed: emailVal,
			pass: !page.url().includes("/auth/login"),
			error: page.url().includes("/auth/login")
				? "timeout waiting to leave /auth/login"
				: undefined,
			page,
		};
	} catch (err) {
		return {
			consoleErrors,
			pageErrors,
			failedResponses,
			finalUrl: page.url(),
			credentialUsed: emailVal,
			pass: false,
			error: String(err),
			page,
		};
	}
}

async function loginWithFallback(
	context: BrowserContext,
	target: Target,
): Promise<LoginResult> {
	// HRIS admin app: admin only. Employee kiosk: prefer employee seed first
	// (admin often lands with "No employee profile linked" / role-blocked).
	const attempts: Array<{ email: string; password: string }> =
		target.kind === "emp"
			? [
					{ email: EMP_SEED_EMAIL, password: EMP_SEED_PASSWORD },
					{ email: HR_SEED_EMAIL, password: HR_SEED_PASSWORD },
					{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				]
			: [{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }];

	const failures: LoginResult[] = [];
	for (const cred of attempts) {
		const page = await context.newPage();
		const result = await attemptLogin(page, target.base, cred.email, cred.password);
		if (result.pass) {
			for (const f of failures) {
				await f.page.close().catch(() => {});
			}
			return result;
		}
		failures.push(result);
	}

	const last = failures[failures.length - 1]!;
	for (const f of failures.slice(0, -1)) {
		await f.page.close().catch(() => {});
	}
	const tried = attempts.map((a) => a.email).join("|");
	const detail = failures
		.map((f) => `${f.credentialUsed}:${f.error || "fail"}`)
		.join("; ");
	return {
		...last,
		pass: false,
		credentialUsed: tried,
		error:
			target.kind === "emp"
				? `All documented credentials failed for employee app (${tried}). ` +
					`detail=[${detail}]. Residual: seeds may be absent on env; admin may be role-blocked. ` +
					`failedApi=${JSON.stringify(last.failedResponses.slice(0, 5))}`
				: `login failed with ${ADMIN_EMAIL}. detail=[${detail}] ` +
					`failedApi=${JSON.stringify(last.failedResponses.slice(0, 5))}`,
	};
}

function writeSummary() {
	const lines = [
		"# Multi-env login matrix (Playwright)",
		"",
		`Stamp evidence dir: \`${evidenceDir}\``,
		`Generated: ${new Date().toISOString()}`,
		"",
		"| env | kind | url | pass/fail | finalUrl | credential | errors |",
		"|-----|------|-----|-----------|----------|------------|--------|",
	];
	for (const row of summaryRows) {
		const err = (row.errors || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 280);
		const final = (row.finalUrl || "").replace(/\|/g, "\\|").slice(0, 140);
		lines.push(
			`| ${row.env} | ${row.kind} | ${row.url} | ${row.pass} | ${final} | ${row.credential} | ${err} |`,
		);
	}
	const passed = summaryRows.filter((r) => r.pass === "pass").length;
	const total = summaryRows.length;
	lines.push("");
	lines.push(`**Pass count: ${passed} / ${total}**`);
	lines.push("");
	lines.push("## Screenshots");
	for (const row of summaryRows) {
		lines.push(`- \`login-${row.kind}-${row.env}.png\``);
	}
	lines.push("");
	lines.push("## Residual notes");
	lines.push(
		"- Employee app uses kiosk landing; Manual Login must be clicked before form fields appear.",
	);
	lines.push(
		"- Emp credential order: `employee@seed.local` / `Password123!` first, then `hr-manager@seed.local`, then admin fallback.",
	);
	lines.push(
		"- Admin on emp app often shows **No employee profile linked** (optional_product); seed lands on linked employee home (e.g. Juan Mendoza).",
	);
	lines.push(
		"- Pre-login `GET /api/auth/me` 401 (no token) is expected noise before login completes.",
	);
	fs.mkdirSync(evidenceDir, { recursive: true });
	fs.writeFileSync(path.join(evidenceDir, "playwright-summary.md"), lines.join("\n"), "utf8");
}

test.describe("multi-env login matrix (public tunnel)", () => {
	test.beforeAll(() => {
		fs.mkdirSync(evidenceDir, { recursive: true });
	});

	test.afterAll(() => {
		if (summaryRows.length > 0) writeSummary();
	});

	for (const target of TARGETS) {
		test(`${target.kind} ${target.env} login @ ${target.base}`, async ({ browser }) => {
			test.setTimeout(150_000);
			const context = await browser.newContext();
			let result: LoginResult | undefined;
			try {
				result = await loginWithFallback(context, target);
			} catch (err) {
				const page = await context.newPage().catch(() => null);
				result = {
					consoleErrors: [],
					pageErrors: [],
					failedResponses: [],
					finalUrl: page ? page.url() : target.base,
					credentialUsed: ADMIN_EMAIL,
					pass: false,
					error: `uncaught: ${String(err)}`,
					page: page || (await context.newPage()),
				};
			}
			try {
				// Let dashboard/home paint after redirect (avoid blank loading screenshots)
				if (result.pass) {
					await result.page
						.waitForLoadState("domcontentloaded", { timeout: 10_000 })
						.catch(() => {});
					await result.page.waitForTimeout(2_500);
					// Prefer settled UI over Loading screen
					await result.page
						.getByText(/dashboard|log out|no employee profile|attendance|home/i)
						.first()
						.waitFor({ state: "visible", timeout: 12_000 })
						.catch(() => {});
				}
				const shot = path.join(evidenceDir, `login-${target.kind}-${target.env}.png`);
				await result.page.screenshot({ path: shot, fullPage: true }).catch(() => {});
				fs.writeFileSync(
					path.join(evidenceDir, `login-${target.kind}-${target.env}.json`),
					JSON.stringify(
						{
							target,
							result: {
								consoleErrors: result.consoleErrors,
								pageErrors: result.pageErrors,
								failedResponses: result.failedResponses,
								finalUrl: result.finalUrl,
								credentialUsed: result.credentialUsed,
								pass: result.pass,
								error: result.error,
							},
							shot,
						},
						null,
						2,
					),
				);

				// Pre-login /api/auth/me 401 is expected (no token yet) — not a login failure.
				const noise = (s: string) =>
					/\/api\/auth\/me/.test(s) ||
					/Unauthorized - No token provided/i.test(s) ||
					/Error (getting|fetching) current user/i.test(s);
				const errParts = [
					...(result.error ? [result.error] : []),
					...result.pageErrors.filter((e) => !noise(e)).slice(0, 3),
					...result.failedResponses.filter((e) => !noise(e)).slice(0, 5),
					...result.consoleErrors.filter((e) => !noise(e)).slice(0, 3),
				];
				summaryRows.push({
					env: target.env,
					kind: target.kind,
					url: target.base,
					pass: result.pass ? "pass" : "fail",
					finalUrl: result.finalUrl,
					errors: errParts.join("; ") || "",
					credential: result.credentialUsed,
				});
				writeSummary();

				// Hard-pass for both surfaces: leaving /auth/login is the finish line.
				// Emp may still show "No employee profile linked" for admin; seed is preferred.
				expect(result.pass, result.error || "should leave login page").toBe(true);
				expect(result.finalUrl).not.toContain("/auth/login");
				expect(result.pageErrors).toEqual([]);
			} finally {
				await context.close().catch(() => {});
			}
		});
	}
});
