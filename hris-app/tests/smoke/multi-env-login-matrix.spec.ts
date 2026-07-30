/**
 * Multi-env login matrix: HRIS admin + Employee apps on DEV / UAT / PROD public hosts.
 * Uses Cloudflare *.bnpi-hris.tech (reachable from this workstation).
 * LAN *.bnpi-hris.lan is proven separately on-VM when L3 path is unavailable.
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
	badApi: string[];
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

async function fillAndSubmit(page: Page, emailVal: string, passwordVal: string) {
	const email = page
		.getByPlaceholder(/email|EMP-HR|@/i)
		.or(page.locator('input[type="email"]'))
		.or(page.locator('input[name="email"]'))
		.first();
	const password = page
		.getByPlaceholder(/password/i)
		.or(page.locator('input[type="password"]'))
		.first();
	const submit = page
		.getByRole("button", { name: /sign in|log in|login|continue/i })
		.or(page.locator('button[type="submit"]'))
		.first();

	await email.waitFor({ state: "visible", timeout: 30_000 });
	await email.fill(emailVal);
	await password.fill(passwordVal);
	await submit.click();
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

	const onConsole = (msg: { type: () => string; text: () => string }) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	};
	const onPageError = (err: Error) => pageErrors.push(String(err));
	const onResponse = (res: { status: () => number; url: () => string }) => {
		if (res.status() >= 400 && res.url().includes("/api/")) {
			failedResponses.push(`${res.status()} ${res.url()}`);
		}
	};

	page.on("console", onConsole);
	page.on("pageerror", onPageError);
	page.on("response", onResponse);

	try {
		await page.goto(`${base}/auth/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
		await fillAndSubmit(page, emailVal, passwordVal);

		try {
			await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
				timeout: 45_000,
			});
			const badApi = failedResponses.filter(
				(line) => / (5\d\d|0) /.test(line) || line.includes("CORS"),
			);
			return {
				consoleErrors,
				pageErrors,
				failedResponses,
				badApi,
				finalUrl: page.url(),
				credentialUsed: emailVal,
				pass: true,
				page,
			};
		} catch (err) {
			const badApi = failedResponses.filter(
				(line) => / (5\d\d|0) /.test(line) || line.includes("CORS"),
			);
			return {
				consoleErrors,
				pageErrors,
				failedResponses,
				badApi,
				finalUrl: page.url(),
				credentialUsed: emailVal,
				pass: false,
				error: String(err),
				page,
			};
		}
	} finally {
		page.off("console", onConsole);
		page.off("pageerror", onPageError);
		page.off("response", onResponse);
	}
}

async function loginWithFallback(
	context: BrowserContext,
	target: Target,
): Promise<LoginResult> {
	const attempts: Array<{ email: string; password: string }> = [
		{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
	];
	if (target.kind === "emp") {
		attempts.push(
			{ email: EMP_SEED_EMAIL, password: EMP_SEED_PASSWORD },
			{ email: HR_SEED_EMAIL, password: HR_SEED_PASSWORD },
		);
	}

	const failures: LoginResult[] = [];
	for (const cred of attempts) {
		const page = await context.newPage();
		const result = await attemptLogin(page, target.base, cred.email, cred.password);
		if (result.pass) {
			// Close failed attempt pages
			for (const f of failures) {
				await f.page.close().catch(() => {});
			}
			return result;
		}
		failures.push(result);
	}

	// All failed — keep last page for screenshot
	const last = failures[failures.length - 1]!;
	for (const f of failures.slice(0, -1)) {
		await f.page.close().catch(() => {});
	}
	const tried = attempts.map((a) => a.email).join("|");
	return {
		...last,
		pass: false,
		credentialUsed: tried,
		error:
			target.kind === "emp"
				? `All documented credentials failed for employee app (${tried}). ` +
					`Residual: admin role may be rejected; seeds may not exist on this env. ` +
					`failedApi=${JSON.stringify(last.failedResponses)}`
				: `login did not leave /auth/login with ${ADMIN_EMAIL}. ` +
					`failedApi=${JSON.stringify(last.failedResponses)}`,
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
		const err = (row.errors || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 240);
		const final = (row.finalUrl || "").replace(/\|/g, "\\|").slice(0, 120);
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
			test.setTimeout(180_000);
			const context = await browser.newContext();
			let result: LoginResult | undefined;
			try {
				result = await loginWithFallback(context, target);
				const shot = path.join(evidenceDir, `login-${target.kind}-${target.env}.png`);
				await result.page.screenshot({ path: shot, fullPage: true }).catch(() => {});
				fs.writeFileSync(
					path.join(evidenceDir, `login-${target.kind}-${target.env}.json`),
					JSON.stringify(
						{
							target,
							result: {
								...result,
								page: undefined,
							},
							shot,
						},
						null,
						2,
					),
				);

				const errParts = [
					...(result.error ? [result.error] : []),
					...result.pageErrors.slice(0, 3),
					...result.failedResponses.slice(0, 5),
					...result.consoleErrors.slice(0, 3),
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

				expect(result.pass, result.error || "should leave login page").toBe(true);
				expect(result.finalUrl, "should leave login page").not.toContain("/auth/login");
				expect(result.pageErrors, "no page errors").toEqual([]);
			} finally {
				await context.close().catch(() => {});
			}
		});
	}
});
