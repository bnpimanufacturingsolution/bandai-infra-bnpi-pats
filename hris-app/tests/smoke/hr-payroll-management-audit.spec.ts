import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "payroll-mgmt-audit-20260819-204314", "ui");

type AuditStatus = "working" | "partial" | "missing" | "blocked";

type AuditRow = {
	id: string;
	sheetLabel: string;
	actor: string;
	route: string;
	hasFeature: boolean;
	status: AuditStatus;
	proof: string;
	notes: string;
	finalUrl: string;
};

const results: AuditRow[] = [];

const dump = (name: string, page: Page) =>
	page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});

const bodyText = async (page: Page) =>
	((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 500);

const visibleAny = async (page: Page, patterns: Array<string | RegExp>, timeoutMs = 8_000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const pattern of patterns) {
			const loc =
				typeof pattern === "string"
					? page.getByText(pattern, { exact: false })
					: page.getByText(pattern);
			if (await loc.first().isVisible().catch(() => false)) {
				return (await loc.first().innerText()).replace(/\s+/g, " ").slice(0, 180);
			}
		}
		await page.waitForTimeout(400);
	}
	return "";
};

const login = async (page: Page, email: string, password: string) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.locator("#login-identifier");
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 90_000 });
	await visibleAny(page, ["Working Space", "Employees", "Dashboard", "Payroll", "Attendance"], 60_000);
};

const checkSurface = async (
	page: Page,
	row: Omit<AuditRow, "finalUrl" | "proof" | "hasFeature" | "status"> & {
		needles: Array<string | RegExp>;
		shot: string;
		waitMs?: number;
		score?: (found: string, page: Page) => Promise<{ status: AuditStatus; notes: string }>;
	},
) => {
	await page.goto(row.route, { waitUntil: "domcontentloaded" });
	const found = await visibleAny(page, row.needles, row.waitMs ?? 45_000);
	await dump(row.shot, page);
	const broken = /page not found|404|something went wrong|application error/i.test(
		await bodyText(page),
	);
	const extra = row.score ? await row.score(found, page) : null;
	const hasFeature = Boolean(found) && !broken;
	const status: AuditStatus = extra?.status
		? extra.status
		: broken
			? "blocked"
			: hasFeature
				? "working"
				: "missing";
	results.push({
		id: row.id,
		sheetLabel: row.sheetLabel,
		actor: row.actor,
		route: row.route,
		hasFeature,
		status,
		proof: found || (broken ? "error page" : "no matching UI"),
		notes: extra?.notes || (await bodyText(page)).slice(0, 220),
		finalUrl: page.url(),
	});
};

test("Payroll Management sheet live audit", async ({ page }) => {
	test.setTimeout(540_000);
	mkdirSync(OUT_DIR, { recursive: true });

	await login(page, "hr-manager@seed.local", "Password123!");
	await dump("00-hr-after-login", page);

	await checkSurface(page, {
		id: "3.1.1",
		actor: "hr-manager@seed.local",
		sheetLabel: "Payroll processing / payslip generation / last pay",
		route: "/hr/run-payroll",
		shot: "3.1.1-run-payroll",
		needles: ["Run Payroll", "Start Payroll", "Payroll Management", "Preview Payroll", "Special Payroll", "Payroll"],
		score: async (found, p) => {
			const start = await p.getByText(/Start Payroll/i).first().isVisible().catch(() => false);
			const preview = await p.getByText(/Payroll Management|Preview Payroll/i).first().isVisible().catch(() => false);
			const special = await p.getByText(/Special Payroll/i).first().isVisible().catch(() => false);
			const lastPay = await p.getByText(/Last Pay|Final Pay/i).first().isVisible().catch(() => false);
			if (found && (start || preview)) {
				return {
					status: lastPay || special ? "working" : "partial",
					notes: `start=${start} preview=${preview} special=${special} lastPay=${lastPay}`,
				};
			}
			return { status: found ? "partial" : "missing", notes: "run payroll chrome incomplete" };
		},
	});

	await checkSurface(page, {
		id: "3.1.1b",
		actor: "hr-manager@seed.local",
		sheetLabel: "Payroll Records (generated EmployeePayroll)",
		route: "/hr/hr-payroll",
		shot: "3.1.1b-payroll-records",
		needles: ["Payroll", "Net", "Gross", "Employee", "Import"],
		score: async (found, p) => {
			const rows = await p.locator("tbody tr").count();
			return {
				status: found && rows > 0 ? "working" : found ? "partial" : "missing",
				notes: `rows=${rows}`,
			};
		},
	});

	await checkSurface(page, {
		id: "3.1.2",
		actor: "hr-manager@seed.local",
		sheetLabel: "EPP / salary loan / allowance tracking",
		route: "/hr/benefits-management",
		shot: "3.1.2-benefits-management",
		needles: ["Benefits", "Enrolled", "Allowance", "Loan"],
		waitMs: 60_000,
	});

	await checkSurface(page, {
		id: "3.1.3",
		actor: "hr-manager@seed.local",
		sheetLabel: "Mass uploading of compensation and deductions",
		route: "/admin/configuration/migration",
		shot: "3.1.3-mass-upload",
		needles: ["Mass", "Compensation", "Deduction", "Upload", "Migration", "DM3"],
	});

	await checkSurface(page, {
		id: "3.1.4",
		actor: "hr-manager@seed.local",
		sheetLabel: "Uniform deduction / loan reports / payroll summary / labor cost",
		route: "/hr/reports/payroll",
		shot: "3.1.4-payroll-reports",
		needles: ["Payroll", "Uniform", "Loan", "Summary", "Labor"],
		waitMs: 60_000,
	});

	await checkSurface(page, {
		id: "3.1.4b",
		actor: "hr-manager@seed.local",
		sheetLabel: "Direct vs indirect labor",
		route: "/hr/reports/workforce",
		shot: "3.1.4b-workforce-labor",
		needles: ["Direct", "Indirect", "Labor", "Workforce"],
	});

	await checkSurface(page, {
		id: "3.1.5",
		actor: "hr-manager@seed.local",
		sheetLabel: "Overtime summary (Agency & Direct)",
		route: "/hr/reports/attendance?tab=overtime",
		shot: "3.1.5-overtime-summary",
		needles: ["Overtime", "OT", "Agency", "Direct"],
	});

	await checkSurface(page, {
		id: "3.1.6",
		actor: "hr-manager@seed.local",
		sheetLabel: "Adjustments",
		route: "/hr/run-payroll",
		shot: "3.1.6-adjustments",
		needles: ["Adjustment", "Adjustments", "Compensation", "Deduction"],
		score: async (found) => ({
			status: found ? "working" : "partial",
			notes: found ? "adjustments chrome on run payroll" : "no adjustments accordion text",
		}),
	});

	await checkSurface(page, {
		id: "3.2.1",
		actor: "hr-manager@seed.local",
		sheetLabel: "Payroll Correction Request (HR approvals)",
		route: "/hr/approvals/requests",
		shot: "3.2.1-approvals",
		needles: ["Payroll Correction", "My Approvals", "Approvals", "Request"],
	});

	await checkSurface(page, {
		id: "3.2.2",
		actor: "hr-manager@seed.local",
		sheetLabel: "Payroll Correction Approval Workflow",
		route: "/hr/request-process",
		shot: "3.2.2-workflows",
		needles: ["Payroll Correction", "Workflow", "Request Process"],
	});

	// Employee surfaces
	await page.context().clearCookies();
	await login(page, "employee@seed.local", "Password123!");
	await dump("00-employee-after-login", page);

	await checkSurface(page, {
		id: "3.1.1c",
		actor: "employee@seed.local",
		sheetLabel: "Employee My Payroll / payslips",
		route: "/hr/payroll",
		shot: "3.1.1c-employee-payroll",
		needles: ["Payroll", "Payslip", "Net Pay", "Gross"],
	});

	await checkSurface(page, {
		id: "3.1.2b",
		actor: "employee@seed.local",
		sheetLabel: "EPP (employee purchase program)",
		route: "/employee/benefits/epp",
		shot: "3.1.2b-epp",
		needles: ["EPP", "Purchase", "Gundam", "Benefits", "Loan"],
		score: async (found, p) => {
			const merch = await p.getByText(/Gundam|Tamagotchi|Model Kits/i).first().isVisible().catch(() => false);
			if (merch) {
				return { status: "partial", notes: "EPP page is mock merch store, not payroll loan/EPP" };
			}
			return { status: found ? "working" : "missing", notes: found ? "epp chrome" : "no epp ui" };
		},
	});

	await checkSurface(page, {
		id: "3.2.1b",
		actor: "employee@seed.local",
		sheetLabel: "Employee payroll correction from My Requests",
		route: "/employee/requests",
		shot: "3.2.1b-employee-requests",
		needles: ["Payroll Correction", "My Requests", "New Request", "Request"],
	});

	writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
	const working = results.filter((r) => r.status === "working").length;
	const partial = results.filter((r) => r.status === "partial").length;
	const missing = results.filter((r) => r.status === "missing").length;
	const blocked = results.filter((r) => r.status === "blocked").length;
	expect(results.length, "audit rows").toBeGreaterThan(5);
	console.log(
		JSON.stringify({ working, partial, missing, blocked, total: results.length }, null, 2),
	);
});
