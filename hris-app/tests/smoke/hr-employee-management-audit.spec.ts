import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "employee-mgmt-audit-20260818");

type AuditStatus = "working" | "partial" | "missing" | "blocked";

type AuditRow = {
	id: string;
	sheetLabel: string;
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
	((await page.locator("body").innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 400);

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

const loginAsHrManager = async (page: Page) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.locator("#login-identifier");
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill("hr-manager@seed.local");
	await page.locator("#login-password").fill("Password123!");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
	await visibleAny(page, ["Working Space", "Employees", "Dashboard", "Attendance"], 45_000);
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
		route: row.route,
		hasFeature,
		status,
		proof: found || (broken ? "error page" : "no matching UI"),
		notes: extra?.notes || (await bodyText(page)).slice(0, 180),
		finalUrl: page.url(),
	});
};

test("Employee Management sheet live audit", async ({ page }) => {
	test.setTimeout(420_000);
	mkdirSync(OUT_DIR, { recursive: true });

	await loginAsHrManager(page);
	await dump("00-after-login", page);

	await checkSurface(page, {
		id: "1.1.1",
		sheetLabel: "Employee Masterdata",
		route: "/hr/employees",
		shot: "1.1.1-employees",
		needles: ["Employee Directory", "List View", "No employees found"],
		score: async (found, p) => {
			const rows = await p.locator("tbody tr").count();
			const chrome =
				(await p.getByText("List View").isVisible().catch(() => false)) &&
				(await p.getByText("Organization Chart").isVisible().catch(() => false));
			if (found && chrome && rows > 0) return { status: "working", notes: `rows=${rows} chrome=yes` };
			if (found && chrome) return { status: "partial", notes: `rows=${rows} chrome=yes empty-or-loading` };
			return { status: found ? "partial" : "missing", notes: `rows=${rows} chrome=${chrome}` };
		},
	});

	await checkSurface(page, {
		id: "1.1.2",
		sheetLabel: "Employee Requests",
		route: "/hr/approvals/requests",
		shot: "1.1.2-requests",
		needles: ["Requests", "Submitted", "Approved", "Employee Requests", "My Approvals"],
	});

	await checkSurface(page, {
		id: "1.1.3",
		sheetLabel: "Org Chart",
		route: "/hr/employees?view=organization",
		shot: "1.1.3-org-chart",
		needles: ["Organization Chart", "List View", "Directory"],
		score: async (found, p) => {
			const tabOn = await p.getByRole("button", { name: /organization chart/i }).isVisible().catch(() => false);
			const body = await bodyText(p);
			const hasPeople = /[A-Za-z]{2,} [A-Za-z]{2,}/.test(body);
			if (found && tabOn && hasPeople) return { status: "working", notes: "org tab + people visible" };
			if (found && tabOn) return { status: "partial", notes: "org tab present, people not proven" };
			return { status: "missing", notes: body.slice(0, 140) };
		},
	});

	await checkSurface(page, {
		id: "1.1.4",
		sheetLabel: "Monthly birthday celebrants (employees and kids)",
		route: "/celebrations/birthdays",
		shot: "1.1.4-birthdays",
		needles: ["Monthly Celebrants", "Birthdays", "No celebrants found"],
		score: async (found, p) => {
			const employees = await p.getByText(/employees \(/i).isVisible().catch(() => false);
			const kids = await p.getByText(/kids \(/i).isVisible().catch(() => false);
			if (found && employees && kids) return { status: "working", notes: "employees + kids filters" };
			if (found) return { status: "partial", notes: `employeesFilter=${employees} kidsFilter=${kids}` };
			return { status: "missing", notes: "birthday page missing" };
		},
	});

	await checkSurface(page, {
		id: "1.1.5",
		sheetLabel: "PAN, regularization, exit clearance",
		route: "/hr/employee-status-changes",
		shot: "1.1.5-status-changes",
		needles: ["Regularization", "Employment Eligibility", "Personnel Action", "For Regularization", "Exit"],
	});

	await page.goto("/hr/requests/personnel-action", { waitUntil: "domcontentloaded" });
	results.push({
		id: "1.1.5b",
		sheetLabel: "PAN dedicated route",
		route: "/hr/requests/personnel-action",
		hasFeature: /tickets/.test(page.url()),
		status: /tickets/.test(page.url()) ? "partial" : "working",
		proof: page.url(),
		notes: "personnel-action currently redirects to tickets",
		finalUrl: page.url(),
	});
	await dump("1.1.5b-pan-route", page);

	await checkSurface(page, {
		id: "1.1.6",
		sheetLabel: "201 filing",
		route: "/hr/employee-documents",
		shot: "1.1.6-201",
		needles: ["Employee Document Compliance", "201 Compliance", "Documents"],
	});

	await page.goto("/hr/employees", { waitUntil: "domcontentloaded" });
	await visibleAny(page, ["Employee Directory"], 45_000);
	let tinProof = "no row opened";
	const firstRow = page.locator("tbody tr").first();
	if (await firstRow.isVisible().catch(() => false)) {
		await firstRow.click().catch(() => {});
		tinProof =
			(await visibleAny(page, ["TIN", "Tax Identification", "Government ID", "SSS", "PhilHealth"], 20_000)) ||
			`opened ${page.url()}`;
	}
	await dump("1.1.6-tin-profile", page);
	results.push({
		id: "1.1.6b",
		sheetLabel: "TIN library",
		route: page.url(),
		hasFeature: /TIN|Government ID|SSS|PhilHealth/i.test(tinProof),
		status: /TIN|Government ID|SSS|PhilHealth/i.test(tinProof) ? "working" : "partial",
		proof: tinProof,
		notes: "TIN is on employee identity/documents, not a standalone library page",
		finalUrl: page.url(),
	});

	await checkSurface(page, {
		id: "1.2.1",
		sheetLabel: "Employee Avatar",
		route: "/hr/employees",
		shot: "1.2.1-avatar",
		needles: ["Employee Directory"],
		score: async (found, p) => {
			const count = await p.locator("img, [class*='avatar'], [data-slot='avatar']").count();
			if (found && count > 0) return { status: "working", notes: `avatar-like nodes=${count}` };
			return { status: found ? "partial" : "missing", notes: `avatar-like nodes=${count}` };
		},
	});

	await checkSurface(page, {
		id: "1.2-bda",
		sheetLabel: "Birthday Allowance",
		route: "/hr/benefits-management",
		shot: "1.2-birthday-allowance",
		needles: ["Benefits Management", "Benefit", "Birthday Allowance", "Birthday"],
		score: async (found, p) => {
			const birthday = await visibleAny(p, ["Birthday Allowance", "Birthday"], 8_000);
			if (birthday) return { status: "working", notes: birthday };
			if (found) return { status: "partial", notes: "Benefits page exists; Birthday Allowance not on first paint" };
			return { status: "missing", notes: "benefits page missing" };
		},
	});

	await checkSurface(page, {
		id: "1.2-pfa",
		sheetLabel: "Perfect Attendance",
		route: "/hr/reports/attendance?tab=perfect",
		shot: "1.2-perfect-attendance",
		needles: ["Perfect Attendance Report", "Perfect Attendance"],
	});

	writeFileSync(join(OUT_DIR, "audit.json"), JSON.stringify({ results }, null, 2));
	const lines = [
		"| ID | Sheet | Status | Has feature | Route | Proof |",
		"|---|---|---|---|---|---|",
		...results.map(
			(row) =>
				`| ${row.id} | ${row.sheetLabel} | ${row.status} | ${row.hasFeature} | \`${row.route}\` | ${String(row.proof).replace(/\|/g, "/")} |`,
		),
	];
	writeFileSync(join(OUT_DIR, "audit.md"), `${lines.join("\n")}\n`);

	const missing = results.filter((row) => row.status === "missing" || row.status === "blocked");
	expect(results.length, "audit produced no rows").toBeGreaterThan(0);
	expect(missing.map((row) => row.id), `missing/blocked: ${JSON.stringify(missing)}`).toEqual([]);
});
