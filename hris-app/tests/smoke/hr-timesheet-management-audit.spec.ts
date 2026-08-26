import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "timesheet-mgmt-audit-20260818");

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
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
	await visibleAny(page, ["Working Space", "Employees", "Dashboard", "Attendance", "Timesheet"], 45_000);
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
		notes: extra?.notes || (await bodyText(page)).slice(0, 220),
		finalUrl: page.url(),
	});
};

test("Timesheet Management sheet live audit", async ({ page }) => {
	test.setTimeout(540_000);
	mkdirSync(OUT_DIR, { recursive: true });

	await login(page, "hr-manager@seed.local", "Password123!");
	await dump("00-hr-after-login", page);

	await checkSurface(page, {
		id: "2.1.1",
		sheetLabel: "Attendance / Online",
		route: "/hr/attendance",
		shot: "2.1.1-attendance-online",
		needles: ["Attendance", "Clocked In", "Utilization", "Attendance Records", "Not Clocked"],
		score: async (found, p) => {
			const late = await p.getByText(/^Late$/i).first().isVisible().catch(() => false);
			const ut = await p.getByText(/^UT$/i).first().isVisible().catch(() => false);
			const rows = await p.locator("tbody tr").count();
			if (found && (late || ut || rows > 0)) {
				return { status: "working", notes: `overview chrome rows=${rows} lateCol=${late} utCol=${ut}` };
			}
			return { status: found ? "partial" : "missing", notes: `rows=${rows}` };
		},
	});

	await checkSurface(page, {
		id: "2.1.1b",
		sheetLabel: "Attendance / Online (my attendance)",
		route: "/hr/my-attendance",
		shot: "2.1.1b-my-attendance",
		needles: ["Attendance", "Clock", "Timesheet", "My Attendance"],
	});

	await checkSurface(page, {
		id: "2.1.3",
		sheetLabel: "Overtime",
		route: "/hr/reports/attendance?tab=overtime",
		shot: "2.1.3-overtime-report",
		needles: ["Overtime", "overtime hours", "No overtime", "Total Overtime"],
		score: async (found, p) => {
			const tab = await p.getByRole("tab", { name: /overtime/i }).isVisible().catch(() => false);
			if (found && tab) return { status: "working", notes: "OT report tab visible" };
			if (tab) return { status: "partial", notes: "tab present, body not matched" };
			return { status: found ? "partial" : "missing", notes: "OT tab missing from reports" };
		},
	});

	await checkSurface(page, {
		id: "2.1.4",
		sheetLabel: "Undertime",
		route: "/hr/reports/attendance?tab=tardiness",
		shot: "2.1.4-tardiness-undertime",
		needles: ["Tardiness", "Undertime", "Late"],
		score: async (found, p) => {
			const tab = await p.getByRole("tab", { name: /tardiness/i }).isVisible().catch(() => false);
			if (found && tab) return { status: "working", notes: "tardiness & undertime report tab" };
			return { status: found ? "partial" : "missing", notes: `tab=${tab}` };
		},
	});

	await checkSurface(page, {
		id: "2.1.5",
		sheetLabel: "Adjustments",
		route: "/hr/time-corrections",
		shot: "2.1.5-time-corrections",
		needles: ["Correction", "Time Correction", "Attendance Correction", "Missed Punch"],
	});

	await checkSurface(page, {
		id: "2.1.6",
		sheetLabel: "Monthly/annual perfect attendance reports",
		route: "/hr/reports/attendance?tab=perfect",
		shot: "2.1.6-perfect-attendance",
		needles: ["Perfect Attendance", "perfect attendance"],
	});

	await checkSurface(page, {
		id: "2.1.7a",
		sheetLabel: "Tardiness / UT / OT details",
		route: "/hr/reports/attendance?tab=tardiness",
		shot: "2.1.7-tardiness-details",
		needles: ["Tardiness", "Undertime"],
	});

	await checkSurface(page, {
		id: "2.1.7b",
		sheetLabel: "Direct vs indirect labor reports",
		route: "/hr/reports/workforce?tab=direct-indirect",
		shot: "2.1.7b-direct-indirect",
		needles: ["Direct vs Indirect Labor Report", "Labor Type", "Direct Employees"],
		score: async (found, p) => {
			const title = await p
				.getByText("Direct vs Indirect Labor Report")
				.first()
				.isVisible()
				.catch(() => false);
			const tabState = await p
				.getByRole("tab", { name: /direct vs indirect/i })
				.getAttribute("data-state")
				.catch(() => "");
			const laborType = await p.getByText("Labor Type").first().isVisible().catch(() => false);
			if (title && tabState === "active" && laborType) {
				return { status: "working", notes: "direct vs indirect labor report tab active" };
			}
			if (found) {
				return {
					status: "partial",
					notes: `title=${title} tab=${tabState} laborType=${laborType}`,
				};
			}
			return { status: "missing", notes: (await bodyText(p)).slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.1.8",
		sheetLabel: "Leave tardiness/UT monitoring, leave balance, manhour",
		route: "/hr/reports/attendance?tab=leave",
		shot: "2.1.8-leave-balance",
		needles: ["Leave Balance", "leave", "Balance"],
	});

	await checkSurface(page, {
		id: "2.1.9a",
		sheetLabel: "Agency attendance summary",
		route: "/hr/reports/workforce?tab=agency",
		shot: "2.1.9-agency-attendance",
		needles: ["Agency Attendance", "Agency"],
	});

	await checkSurface(page, {
		id: "2.1.9b",
		sheetLabel: "Daily active manpower / no-work report",
		route: "/hr/dashboard",
		shot: "2.1.9-dashboard-nowork",
		needles: ["No Work", "No-work", "Manpower", "Attendance"],
		score: async (found, p) => {
			const body = await bodyText(p);
			const noWork = /no[\s-]?work/i.test(body);
			if (noWork) return { status: "working", notes: "dashboard no-work chrome" };
			if (found) return { status: "partial", notes: "dashboard open; dedicated no-work / daily manpower report tab is not routed" };
			return { status: "missing", notes: body.slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.1.10",
		sheetLabel: "Leave conversion, annual leave credit uploads",
		route: "/hr/requests/personnel-action",
		shot: "2.1.10-leave-conversion",
		needles: ["Leave Conversion", "Personnel Action", "PAN", "Tickets"],
		score: async (found, p) => {
			const body = await bodyText(p);
			if (/leave conversion/i.test(body)) return { status: "working", notes: "LEAVE_CONVERSION in PAN UI" };
			if (found) return { status: "partial", notes: "PAN/tickets surface; leave-conversion label not proven on this hop" };
			return { status: "missing", notes: body.slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.1.12",
		sheetLabel: "Lists of pregnant and no-work employees",
		route: "/hr/reports/workforce?tab=labor",
		shot: "2.1.12-pregnant-nowork",
		needles: ["Pregnant", "No Work", "Manpower Databank", "Manpower"],
		score: async (found, p) => {
			const body = await bodyText(p);
			const pregnant = /pregnant/i.test(body);
			const noWork = /no[\s-]?work/i.test(body);
			if (pregnant && noWork) return { status: "working", notes: "pregnant + no-work lists" };
			if (found) {
				return {
					status: "partial",
					notes: `pregnant=${pregnant} noWork=${noWork}; manpower page exists, dedicated pregnant/no-work lists not proven`,
				};
			}
			return { status: "missing", notes: body.slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.2.1",
		sheetLabel: "Lock Timesheet Correction Request",
		route: "/hr/timesheets",
		shot: "2.2.1-timesheets-lock",
		needles: ["Timesheet", "Lock Period", "Lock", "Draft", "Approved"],
		score: async (found, p) => {
			const lock = await p.getByRole("button", { name: /lock period/i }).isVisible().catch(() => false);
			if (found && lock) return { status: "working", notes: "Timesheets page + Lock Period" };
			if (found) return { status: "partial", notes: "timesheet list exists; Lock Period button not visible" };
			return { status: "missing", notes: await bodyText(p) };
		},
	});

	// Admin surfaces need admin login
	await page.context().clearCookies();
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	await login(page, "admin@bandai.local", "password123");
	await dump("00-admin-after-login", page);

	await checkSurface(page, {
		id: "2.1.2",
		sheetLabel: "Attendance / Biometrics",
		route: "/admin/configuration/devices/events",
		shot: "2.1.2-device-events",
		needles: ["Device Event", "Saved Events", "Attendance", "Sync"],
		score: async (found, p) => {
			const body = await bodyText(p);
			if (found) return { status: "working", notes: "device events ledger (biometric attendance source)" };
			if (/403|not authorized|forbidden/i.test(body)) return { status: "blocked", notes: "admin surface denied" };
			return { status: "missing", notes: body.slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.1.11",
		sheetLabel: "Disciplinary action monitoring, late attendance tracking",
		route: "/admin/disciplinary-action",
		shot: "2.1.11-disciplinary",
		needles: ["Disciplinary", "Tardiness", "Attendance"],
		score: async (found, p) => {
			const body = await bodyText(p);
			const mockish = /verbal warning|mock/i.test(body);
			if (found && mockish) return { status: "partial", notes: "disciplinary page uses in-page mock rules, not live employee cases" };
			if (found) return { status: "working", notes: "disciplinary page" };
			return { status: "missing", notes: body.slice(0, 160) };
		},
	});

	await checkSurface(page, {
		id: "2.2.1b",
		sheetLabel: "Lock timesheet on cutoff (rules)",
		route: "/admin/rules-policies/timesheet",
		shot: "2.2.1b-timesheet-rules",
		needles: ["Timesheet", "Lock", "cutoff", "Payroll lock", "Correction"],
	});

	writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
	expect(results.length).toBeGreaterThan(8);
});
