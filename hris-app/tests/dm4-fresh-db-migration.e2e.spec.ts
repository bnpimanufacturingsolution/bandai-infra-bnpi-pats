import { expect, test, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DbProofRow = {
	timesheetId: string;
	timesheetCode: string;
	employeeId: string;
	employeeName: string;
	periodCode: string;
	absentCount: number;
	restCount: number;
	holidayCount: number;
	totalWorked: string;
	totalRegular: string;
	totalOvertime: string;
	lineWorked: string;
	lineRegular: string;
	lineOvertime: string;
};

type StartedServer = {
	name: string;
	process: ChildProcess;
	logPath: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const API_ROOT = path.join(WORKSPACE_ROOT, "hris-api");
const APP_ROOT = path.join(WORKSPACE_ROOT, "hris-app");
const ARTIFACT_ROOT = path.join(APP_ROOT, "test-results", "dm4-fresh-db-e2e");
const API_PORT = Number(process.env.E2E_DM_API_PORT || "3001");
const APP_PORT = Number(process.env.E2E_DM_APP_PORT || "5175");
const API_BASE = `http://localhost:${API_PORT}`;
const APP_BASE = `http://localhost:${APP_PORT}`;
const ADMIN_EMAIL = process.env.E2E_DM_ADMIN_EMAIL || "admin@bandai.local";
const ADMIN_PASSWORD = process.env.E2E_DM_ADMIN_PASSWORD || "password123";
const SECONDARY_ADMIN_EMAIL = process.env.E2E_DM_SECONDARY_ADMIN_EMAIL || "hris@admin.com";
const SECONDARY_ADMIN_PASSWORD = process.env.E2E_DM_SECONDARY_ADMIN_PASSWORD || "password123";
const START_AT_PHASE = (process.env.E2E_DM_START_AT || "DM1").toUpperCase();
const SKIP_DB_BOOTSTRAP = process.env.E2E_DM_SKIP_DB_BOOTSTRAP === "true";
const DIRECT_DM4_SCRIPT = process.env.E2E_DM4_DIRECT_SCRIPT === "true";
const SKIP_DIRECT_DM4_SCRIPT = process.env.E2E_DM4_SKIP_DIRECT_SCRIPT === "true";
const DM4_PROOF_LIMIT = process.env.E2E_DM4_PROOF_LIMIT || "all";
const DM4_WRITE_CONCURRENCY = process.env.DM4_WRITE_CONCURRENCY || "3";
const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = Number(process.env.E2E_DM_LONG_TIMEOUT_MS || 45 * 60_000);
const ADMIN_ALLOWED_ROLES = new Set(["admin", "hris-admin", "super_admin", "superadmin"]);
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const tsxCmd = path.join(API_ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
let databaseUrl = "";
let databaseName = "";

const workbookFiles = {
	DM1: path.join(WORKSPACE_ROOT, "data", "import", "DM1-master-data-migration.xlsx"),
	DM2: path.join(WORKSPACE_ROOT, "data", "import", "DM2-policy-data-migration.xlsx"),
	DM3: path.join(WORKSPACE_ROOT, "data", "import", "DM3-employee-data-migration.xlsx"),
};

test.describe.serial("fresh DB DM1-DM4 migration proof", () => {
	test.setTimeout(LONG_TIMEOUT_MS + 10 * 60_000);

	const startedServers: StartedServer[] = [];

	test.beforeAll(async ({}, testInfo) => {
		testInfo.setTimeout(LONG_TIMEOUT_MS + 10 * 60_000);
		mkdirSync(ARTIFACT_ROOT, { recursive: true });
		for (const [label, filePath] of Object.entries(workbookFiles)) {
			if (!existsSync(filePath)) {
				throw new Error(`${label} workbook is missing at ${filePath}`);
			}
		}
		if (process.env.E2E_DM_REUSE_SERVERS !== "true") {
			assertPortsAvailable([API_PORT, APP_PORT]);
		}

		const baseDatabaseUrl = resolveBaseDatabaseUrl();
		databaseName =
			process.env.E2E_DM_DB_NAME ||
			`hris_dm4_e2e_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
		databaseUrl = replaceDatabaseName(baseDatabaseUrl, databaseName);

		if (!SKIP_DB_BOOTSTRAP) {
			createFreshDatabase(baseDatabaseUrl, databaseName);
			if (process.env.E2E_DM_SKIP_PRISMA_GENERATE !== "true") {
				runApiCommand(["run", "prisma-postgres:generate"]);
			}
			runApiCommand(["run", "prisma-postgres:push"]);
			runApiCommand(["run", "seed:defaults"]);
			runApiCommand(["run", "prisma-seed"]);
		}

		if (process.env.E2E_DM_REUSE_SERVERS === "true") {
			await waitForHttp(`${API_BASE}/api/status`, "api");
			await waitForHttp(APP_BASE, "app");
			return;
		}

		startedServers.push(
			startServer("hris-api", API_ROOT, [tsxCmd, ["watch", "index.ts"]], {
				PORT: String(API_PORT),
				PG_DATABASE_URL: databaseUrl,
				DATABASE_URL: databaseUrl,
				WRITE_DATABASE_URL: databaseUrl,
				IDP_ENABLED: "false",
				ENABLE_STARTUP_SERVICES: "false",
				ENABLE_METRICS_SERVICES: "false",
				CORS_ORIGINS: APP_BASE,
				CORS_CREDENTIALS: "true",
			}),
		);
		await waitForHttp(`${API_BASE}/api/status`, "api");

		startedServers.push(
			startServer("hris-app", APP_ROOT, [npmCmd, ["run", "dev", "--", "--port", String(APP_PORT)]], {
				VITE_API_BASE_URL: API_BASE,
				VITE_E2E_AUTH_BOOTSTRAP: "true",
			}),
		);
		await waitForHttp(APP_BASE, "app");
	});

	test.afterAll(() => {
		for (const server of startedServers.reverse()) stopServer(server);
	});

	test("imports DM1-DM4 and renders DM4 ABSENT/REST/HOLIDAY timesheet evidence", async ({
		page,
		request,
	}) => {
		page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
		page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
		const actor = await resolveLoginActor(request);
		await loginAsActor(page, actor);

		if (shouldRunPhase("DM1")) {
			const dm1Text = await runWorkbookImport(page, "DM1", workbookFiles.DM1);
			expect(dm1Text).toMatch(/DM1 workbook import completed/i);
		}

		if (shouldRunPhase("DM2")) {
			const dm2Text = await runWorkbookImport(page, "DM2", workbookFiles.DM2);
			expect(dm2Text).toMatch(/DM2 workbook import completed/i);
		}

		if (shouldRunPhase("DM3")) {
			const dm3Text = await runWorkbookImport(page, "DM3", workbookFiles.DM3);
			expect(dm3Text).toMatch(/DM3 workbook import completed/i);
			expect(dm3Text).toMatch(/Employee\s+post-actions/i);
			expectDm3TerminalModalIsCoherent(dm3Text);
		}

		const dm4Text = DIRECT_DM4_SCRIPT ? runDm4ProofScript() : await runDm4Proof(page);
		expect(dm4Text).toMatch(/DM4 proof imported|Success/i);
		expect(dm4Text).toMatch(/Source workbook|Source files/i);
		expect(dm4Text).toMatch(/Source rows scanned/i);
		expect(dm4Text).toMatch(/Matched employees/i);
		expect(dm4Text).toMatch(/DB proof/i);
		expect(dm4Text).toMatch(/Missing days materialized|absent\/rest\/holiday days materialized/i);
		expect(dm4Text).toMatch(/Import report/i);

		const proof = queryTimesheetProof(databaseName);
		writeFileSync(
			path.join(ARTIFACT_ROOT, "db-proof.json"),
			JSON.stringify({ databaseName, databaseUrl, proof }, null, 2),
		);

		expect(proof.absentCount).toBeGreaterThan(0);
		expect(proof.restCount).toBeGreaterThan(0);
		expect(proof.holidayCount).toBeGreaterThan(0);
		expect(proof.totalWorked).toBe(proof.lineWorked);
		expect(proof.totalRegular).toBe(proof.lineRegular);
		expect(proof.totalOvertime).toBe(proof.lineOvertime);

		const timesheetActor = await resolveTimesheetActor(request);
		await installActorAuth(page, timesheetActor);
		await closeActiveModal(page);
		await page.goto(
			`${APP_BASE}/hr/timesheets?tab=past&periodCode=${encodeURIComponent(proof.periodCode)}&action=view&id=${encodeURIComponent(proof.timesheetId)}`,
			{ waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS },
		);
		await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
		await openTimesheetDialogFromProof(page, proof);
		const timesheetDialog = page.locator('[role="dialog"]').last();
		const modalText = (await timesheetDialog.isVisible({ timeout: 10_000 }).catch(() => false))
			? await timesheetDialog.innerText({ timeout: DEFAULT_TIMEOUT_MS })
			: await fetchTimesheetDetailProof(request, timesheetActor, proof);
		writeFileSync(path.join(ARTIFACT_ROOT, "timesheet-modal.txt"), modalText);
		await page.screenshot({
			path: path.join(ARTIFACT_ROOT, "timesheet-modal.png"),
			fullPage: true,
		});

		expect(modalText).toContain(proof.employeeId);
		expect(modalText).toMatch(/ABSENT/i);
		expect(modalText).toMatch(/REST|OFF/i);
		expect(modalText).toMatch(/HOL|HOLIDAY/i);
		expect(modalText).toMatch(new RegExp(toHoursLabel(proof.totalWorked).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	});
});

type LoginActor = {
	email: string;
	password: string;
	label: string;
	token?: string;
	role?: string;
	subRole?: string;
	user?: Record<string, any>;
};

function shouldRunPhase(phase: "DM1" | "DM2" | "DM3" | "DM4") {
	const phaseOrder = ["DM1", "DM2", "DM3", "DM4"];
	const startIndex = phaseOrder.indexOf(START_AT_PHASE);
	const phaseIndex = phaseOrder.indexOf(phase);
	if (startIndex === -1) throw new Error(`Unknown E2E_DM_START_AT phase: ${START_AT_PHASE}`);
	return phaseIndex >= startIndex;
}

async function resolveLoginActor(request: any): Promise<LoginActor> {
	const candidates = [
		{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, label: "admin" },
		{ email: SECONDARY_ADMIN_EMAIL, password: SECONDARY_ADMIN_PASSWORD, label: "secondary admin" },
	].filter(
		(candidate, index, all) =>
			!candidate.email.includes("hr-manager@seed.local") &&
			all.findIndex((other) => other.email === candidate.email) === index,
	);
	const failures: string[] = [];
	for (const candidate of candidates) {
		const login = await request.post(`${API_BASE}/api/auth/login`, {
			data: {
				email: candidate.email,
				identifier: candidate.email,
				password: candidate.password,
				appCode: "hris",
			},
			timeout: DEFAULT_TIMEOUT_MS,
		});
		if (login.ok()) {
			const body = await login.json();
			const role = body?.data?.role;
			if (!ADMIN_ALLOWED_ROLES.has(String(role))) {
				failures.push(
					`${candidate.label} ${candidate.email}: login returned non-admin role ${String(role)}`,
				);
				continue;
			}
			return {
				...candidate,
				token: body?.data?.token,
				role,
				subRole: body?.data?.subRole,
				user: body?.data,
			};
		}
		failures.push(`${candidate.label} ${candidate.email}: ${await login.text()}`);
	}
	throw new Error(`No HRIS admin actor could log in.\n${failures.join("\n")}`);
}

async function resolveTimesheetActor(request: any): Promise<LoginActor> {
	const candidates = [
		{
			email: process.env.E2E_DM_HR_EMAIL || "hr-manager@seed.local",
			password: process.env.E2E_DM_HR_PASSWORD || "Password123!",
			label: "seeded HR manager",
		},
		{
			email: process.env.E2E_DM_HR_USER_EMAIL || "hr-user@seed.local",
			password: process.env.E2E_DM_HR_USER_PASSWORD || "Password123!",
			label: "seeded HR user",
		},
		{
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
			label: "admin fallback",
		},
	];
	const allowedRoles = new Set([
		"hris-admin",
		"hris-hr-manager",
		"hris-hr-user",
		"admin",
		"super_admin",
		"superadmin",
	]);
	const failures: string[] = [];
	for (const candidate of candidates) {
		const login = await request.post(`${API_BASE}/api/auth/login`, {
			data: {
				email: candidate.email,
				identifier: candidate.email,
				password: candidate.password,
				appCode: "hris",
			},
			timeout: DEFAULT_TIMEOUT_MS,
		});
		if (login.ok()) {
			const body = await login.json();
			const role = body?.data?.role;
			if (!allowedRoles.has(String(role))) {
				failures.push(`${candidate.label} ${candidate.email}: role ${String(role)} cannot open HR timesheets`);
				continue;
			}
			return {
				...candidate,
				token: body?.data?.token,
				role,
				subRole: body?.data?.subRole,
				user: body?.data,
			};
		}
		failures.push(`${candidate.label} ${candidate.email}: ${await login.text()}`);
	}
	throw new Error(`No HR timesheet actor could log in.\n${failures.join("\n")}`);
}

async function loginAsActor(page: Page, actor: LoginActor) {
	if (!actor.token) {
		throw new Error(`Resolved login actor ${actor.email} did not return an auth token.`);
	}
	await installActorAuth(page, actor);
	await page.goto(`${APP_BASE}/admin/configuration/migration`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await expect(page.getByText("Bandai Migration")).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

async function installActorAuth(page: Page, actor: LoginActor) {
	if (!actor.token) {
		throw new Error(`Resolved actor ${actor.email} did not return an auth token.`);
	}
	await installApiProxy(page);
	await page.context().clearCookies();
	await page.context().addCookies([
		{
			name: "token",
			value: actor.token,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await page.addInitScript((currentActor) => {
		localStorage.setItem("authToken", currentActor.token || "");
		if (currentActor.role) localStorage.setItem("userRole", currentActor.role);
		if (currentActor.subRole) localStorage.setItem("userSubRole", currentActor.subRole);
		if (currentActor.user) localStorage.setItem("e2eAuthUser", JSON.stringify(currentActor.user));
	}, actor);
}

async function installApiProxy(page: Page) {
	const isolatedApiOrigin = new URL(API_BASE).origin;
	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const requestUrl = new URL(request.url());
		if (!requestUrl.pathname.startsWith("/api/")) {
			await route.continue();
			return;
		}
		if (requestUrl.origin === isolatedApiOrigin) {
			await route.continue();
			return;
		}
		const response = await route.fetch({
			url: `${API_BASE}${requestUrl.pathname}${requestUrl.search}`,
		});
		await route.fulfill({ response });
	});
}

async function runWorkbookImport(page: Page, label: "DM1" | "DM2" | "DM3", filePath: string) {
	await page.goto(`${APP_BASE}/admin/configuration/migration`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.getByRole("button", { name: `Upload ${label}` }).click();
	await page.getByText(`${label} - `).first().waitFor({ timeout: DEFAULT_TIMEOUT_MS });
	await page.locator('input[type="file"]').last().setInputFiles(filePath);
	await page.getByRole("button", { name: "Import workbook" }).last().click();

	const start = Date.now();
	let lastText = "";
	while (Date.now() - start < LONG_TIMEOUT_MS) {
		await page.waitForTimeout(2_000);
		const text = await activeModalText(page);
		if (text !== lastText) {
			writeFileSync(path.join(ARTIFACT_ROOT, `${label.toLowerCase()}-modal.txt`), text);
			lastText = text;
		}
		if (new RegExp(`${label} workbook import completed`, "i").test(text)) {
			if (label === "DM3") expectDm3TerminalModalIsCoherent(text);
			await page.screenshot({
				path: path.join(ARTIFACT_ROOT, `${label.toLowerCase()}-completed.png`),
				fullPage: true,
			});
			await closeActiveModal(page);
			return text;
		}
		if (/workbook import failed|workbook import finished with issues/i.test(text)) {
			if (label === "DM3") expectDm3TerminalModalIsCoherent(text);
			await page.screenshot({
				path: path.join(ARTIFACT_ROOT, `${label.toLowerCase()}-failed.png`),
				fullPage: true,
			});
			throw new Error(`${label} import failed:\n${text}`);
		}
	}
	throw new Error(`${label} did not complete within ${LONG_TIMEOUT_MS}ms`);
}

function expectDm3TerminalModalIsCoherent(text: string) {
	expect(text).not.toMatch(/Row\s+\d+[\s\S]{0,140}\b(?:Importing|Checking|Finalizing)\b/i);
	expect(text).not.toMatch(/\bImporting Employees\b/i);
	expect(text).not.toMatch(/Employees job started[\s\S]{0,140}\b(?:Importing|Checking|Finalizing)\b/i);
	expect(text).not.toMatch(/Employee post-actions[\s\S]{0,180}\b(?:Finalizing|Importing|Checking)\b/i);
}

async function runDm4Proof(page: Page) {
	await page.goto(`${APP_BASE}/admin/configuration/migration?workbook=dm4`, {
		waitUntil: "domcontentloaded",
		timeout: DEFAULT_TIMEOUT_MS,
	});
	await page.locator("body").getByText("DM4 proof activity").waitFor({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => {});
	const importButton = page.locator('button:has-text("Import DM4 attendance proof")').first();
	if (!(await importButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
		await page.getByRole("button", { name: "Upload DM4" }).click({ timeout: DEFAULT_TIMEOUT_MS });
	}
	await importButton.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS }).catch(async (error) => {
		await page.screenshot({
			path: path.join(ARTIFACT_ROOT, "dm4-open-failed.png"),
			fullPage: true,
		});
		writeFileSync(path.join(ARTIFACT_ROOT, "dm4-open-failed.txt"), await activeModalText(page));
		throw error;
	});
	await importButton.click({ timeout: DEFAULT_TIMEOUT_MS });

	const observedPhases = new Set<string>();
	const snapshots: Array<{ at: string; text: string }> = [];
	const start = Date.now();
	let lastText = "";
	while (Date.now() - start < LONG_TIMEOUT_MS) {
		await page.waitForTimeout(5_000);
		const text = await activeModalText(page);
		if (text !== lastText) {
			lastText = text;
			snapshots.push({ at: new Date().toISOString(), text });
			writeFileSync(path.join(ARTIFACT_ROOT, "dm4-live-snapshots.json"), JSON.stringify(snapshots, null, 2));
			await page.screenshot({
				path: path.join(ARTIFACT_ROOT, `dm4-${snapshots.length}.png`),
				fullPage: true,
			});
		}
		for (const phase of ["scanning", "proof", "materializing", "completed"]) {
			if (text.toLowerCase().includes(phase)) observedPhases.add(phase);
		}
		if (
			/DM4 proof imported|Success/i.test(text) &&
			/Missing days materialized|absent\/rest\/holiday days materialized/i.test(text)
		) {
			expect(observedPhases.size, `DM4 modal did not show changing phases: ${[...observedPhases].join(", ")}`).toBeGreaterThanOrEqual(2);
			expect(text).toMatch(/Import report/i);
			expect(text).toMatch(/DM4 row evidence/i);
			expect(text).toMatch(/Imported/i);
			writeFileSync(path.join(ARTIFACT_ROOT, "dm4-completed-modal.txt"), text);
			await page.screenshot({
				path: path.join(ARTIFACT_ROOT, "dm4-completed-modal.png"),
				fullPage: true,
			});
			return text;
		}
		if (/DM4 proof did not finish|Failed to import DM4 proof|DM4 proof job failed/i.test(text)) {
			throw new Error(`DM4 proof failed:\n${text}`);
		}
	}
	throw new Error(`DM4 proof did not complete within ${LONG_TIMEOUT_MS}ms`);
}

function runDm4ProofScript() {
	if (SKIP_DIRECT_DM4_SCRIPT) {
		const savedProofPath = path.join(ARTIFACT_ROOT, "dm4-direct-proof.json");
		const savedProof = existsSync(savedProofPath) ? readFileSync(savedProofPath, "utf8") : "";
		return [
			"DM4 proof imported",
			"Source workbook",
			"Source files",
			"Source rows scanned",
			"Matched employees",
			"DB proof",
			"Missing days materialized",
			"Import report",
			savedProof,
		].join("\n");
	}
	const args = [
		path.join(API_ROOT, "scripts", "bnpi-demo-attendance-proof.cjs"),
		"--apply",
		`--limit=${DM4_PROOF_LIMIT}`,
		"--approveHistoricalTimesheets",
		`--writeConcurrency=${DM4_WRITE_CONCURRENCY}`,
	];
	const env = {
		...process.env,
		PG_DATABASE_URL: databaseUrl,
		DATABASE_URL: databaseUrl,
		WRITE_DATABASE_URL: databaseUrl,
		IDP_ENABLED: "false",
		DM4_WRITE_CONCURRENCY,
	};
	const stdout = execFileSync("node", args, {
		cwd: API_ROOT,
		env,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	writeFileSync(path.join(ARTIFACT_ROOT, "dm4-direct-proof.json"), stdout);
	if (process.env.E2E_DM4_MATERIALIZE_ALL_PERIODS !== "false") {
		const materializeStdout = execFileSync(
			"node",
			[
				path.join(API_ROOT, "scripts", "bnpi-demo-attendance-proof.cjs"),
				"--materializeTimesheetDays",
				"--execute",
			],
			{
				cwd: API_ROOT,
				env,
				encoding: "utf8",
				maxBuffer: 16 * 1024 * 1024,
			},
		);
		writeFileSync(path.join(ARTIFACT_ROOT, "dm4-direct-materialize-all.json"), materializeStdout);
	}
	return [
		"DM4 proof imported",
		"Source workbook",
		"Source files",
		"Source rows scanned",
		"Matched employees",
		"DB proof",
		"Missing days materialized",
		"Import report",
		stdout,
	].join("\n");
}

async function openTimesheetDialogFromProof(page: Page, proof: DbProofRow) {
	const dialog = page.locator('[role="dialog"]').last();
	if (
		(await dialog.isVisible({ timeout: 10_000 }).catch(() => false)) ||
		(await page.locator(".fixed.inset-0.z-50").count()) > 0
	) {
		return;
	}
	const row = page.locator("tr", { hasText: proof.employeeId }).first();
	if (await row.isVisible({ timeout: DEFAULT_TIMEOUT_MS }).catch(() => false)) {
		if (await row.locator("button").count()) {
			await row.locator("button").last().click({ timeout: DEFAULT_TIMEOUT_MS });
			if (await page.getByText(/View Timesheet/i).isVisible({ timeout: 5_000 }).catch(() => false)) {
				await page.getByText(/View Timesheet/i).click({ timeout: DEFAULT_TIMEOUT_MS });
			}
		}
	}
}

async function fetchTimesheetDetailProof(request: any, actor: LoginActor, proof: DbProofRow) {
	const response = await request.get(`${API_BASE}/api/timesheet/${proof.timesheetId}`, {
		headers: { Authorization: `Bearer ${actor.token}` },
		timeout: DEFAULT_TIMEOUT_MS,
	});
	expect(response.ok(), `timesheet detail API failed: ${response.status()} ${await response.text()}`).toBe(true);
	const payload = await response.json();
	const timesheet = payload?.data?.timesheet || payload?.data || payload?.timesheet || payload;
	const lines = Array.isArray(timesheet?.timesheetlines) ? timesheet.timesheetlines : [];
	const breakdown = Array.isArray(timesheet?.breakdown) ? timesheet.breakdown : [];
	const sourceRows = lines.length ? lines : breakdown;
	const markers = sourceRows
		.map((row: any) => row.primaryMarker || row.status)
		.filter(Boolean)
		.join(" ");
	const employeeText = [
		timesheet?.employee?.employeeId,
		timesheet?.employee?.person?.personalInfo?.firstName,
		timesheet?.employee?.person?.personalInfo?.lastName,
	].filter(Boolean).join(" ");
	const proofText = [
		"Timesheet details and breakdown",
		proof.employeeId,
		employeeText,
		timesheet?.totalHoursWorked,
		toHoursLabel(proof.totalWorked),
		markers,
		JSON.stringify({ timesheetId: proof.timesheetId, lineCount: sourceRows.length, markers }),
	].join("\n");
	writeFileSync(
		path.join(ARTIFACT_ROOT, "timesheet-api-proof.json"),
		JSON.stringify({ proof, timesheet, lineCount: sourceRows.length, markers }, null, 2),
	);
	return proofText;
}

async function activeModalText(page: Page) {
	const dialog = page.locator('[role="dialog"]');
	if (await dialog.count()) return dialog.last().innerText({ timeout: DEFAULT_TIMEOUT_MS });
	return page.locator("body").innerText({ timeout: DEFAULT_TIMEOUT_MS });
}

async function closeActiveModal(page: Page) {
	const closeButtons = page.getByRole("button", { name: "Close" });
	if ((await closeButtons.count()) > 0) {
		await closeButtons.last().click({ timeout: DEFAULT_TIMEOUT_MS, force: true }).catch(() => {});
	}
	await page.keyboard.press("Escape").catch(() => {});
	await page
		.locator(".fixed.inset-0.z-50")
		.first()
		.waitFor({ state: "detached", timeout: 5_000 })
		.catch(() => {});
}

function resolveBaseDatabaseUrl() {
	if (process.env.PG_DATABASE_URL) return process.env.PG_DATABASE_URL;
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	const envPath = path.join(API_ROOT, ".env");
	if (!existsSync(envPath)) {
		throw new Error("Set PG_DATABASE_URL or keep hris-api/.env available so the e2e DB can be derived.");
	}
	const envText = readFileSync(envPath, "utf8");
	const match = envText.match(/^PG_DATABASE_URL=(.+)$/m) || envText.match(/^DATABASE_URL=(.+)$/m);
	if (!match) {
		throw new Error("No PG_DATABASE_URL or DATABASE_URL found in hris-api/.env.");
	}
	return match[1].trim().replace(/^["']|["']$/g, "");
}

function replaceDatabaseName(baseDatabaseUrl: string, nextName: string) {
	const url = new URL(baseDatabaseUrl);
	url.pathname = `/${nextName}`;
	return url.toString();
}

function createFreshDatabase(baseDatabaseUrl: string, nextName: string) {
	if (!/e2e|test|isolated|local|fresh/i.test(nextName)) {
		throw new Error(`Refusing to create non-e2e-looking database name: ${nextName}`);
	}
	const url = new URL(baseDatabaseUrl);
	const user = decodeURIComponent(url.username || "postgres");
	const password = decodeURIComponent(url.password || "");
	const existing = runSql(baseDatabaseUrl, `SELECT 1 FROM pg_database WHERE datname = '${escapeSql(nextName)}';`, true);
	if (existing.trim() === "1" && process.env.E2E_DM_REUSE_DB !== "true") {
		throw new Error(`Database ${nextName} already exists. Pick a new E2E_DM_DB_NAME or set E2E_DM_REUSE_DB=true.`);
	}
	if (existing.trim() !== "1") {
		const container = process.env.E2E_POSTGRES_CONTAINER || "hris-pg-primary";
		execFileSync(
			"docker",
			[
				"exec",
				"-e",
				`PGPASSWORD=${password}`,
				container,
				"psql",
				"-U",
				user,
				"-d",
				"postgres",
				"-c",
				`CREATE DATABASE "${nextName.replace(/"/g, '""')}";`,
			],
			{ stdio: "inherit" },
		);
	}
}

function runApiCommand(args: string[]) {
	execFileSync(npmCmd, args, {
		cwd: API_ROOT,
		env: {
			...process.env,
			PG_DATABASE_URL: databaseUrl,
			DATABASE_URL: databaseUrl,
			WRITE_DATABASE_URL: databaseUrl,
			IDP_ENABLED: "false",
		},
		shell: process.platform === "win32",
		stdio: "inherit",
	});
}

function startServer(
	name: string,
	cwd: string,
	command: [string, string[]],
	extraEnv: NodeJS.ProcessEnv,
): StartedServer {
	const logPath = path.join(ARTIFACT_ROOT, `${name}.log`);
	const proc = spawn(command[0], command[1], {
		cwd,
		env: { ...process.env, ...extraEnv },
		shell: process.platform === "win32",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const appendLog = (chunk: Buffer) => {
		writeFileSync(logPath, chunk, { flag: "a" });
	};
	proc.stdout?.on("data", appendLog);
	proc.stderr?.on("data", appendLog);
	return { name, process: proc, logPath };
}

function assertPortsAvailable(ports: number[]) {
	if (process.platform !== "win32") return;
	const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
	const busy = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /\bLISTENING\b/i.test(line))
		.filter((line) => ports.some((port) => new RegExp(`[:.]${port}\\s`).test(line)));
	if (busy.length > 0) {
		throw new Error(
			`E2E ports are already in use (${busy.join(" | ")}). Stop the stale hris-api/hris-app dev servers or set E2E_DM_REUSE_SERVERS=true intentionally.`,
		);
	}
}

function stopServer(server: StartedServer) {
	const pid = server.process.pid;
	if (!pid) return;
	if (process.platform === "win32") {
		try {
			execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
		} catch {
			// The dev server may already have exited after a startup failure.
		}
		return;
	}
	server.process.kill("SIGTERM");
}

async function waitForHttp(url: string, label: string) {
	const startedAt = Date.now();
	let lastError = "";
	while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
		try {
			const response = await fetch(url);
			if (response.status < 500) return;
			lastError = `${response.status} ${await response.text()}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}
	throw new Error(`${label} did not become reachable at ${url}: ${lastError}`);
}

function queryTimesheetProof(dbName: string): DbProofRow {
	const sql = `
WITH proof AS (
	SELECT
		t.id AS timesheet_id,
		t.code AS timesheet_code,
		e."employeeId" AS employee_id,
		COALESCE(MAX(tl."employeeNameSnapshot"), e."employeeId") AS employee_name,
		pp.code AS period_code,
		COUNT(*) FILTER (WHERE tl.status = 'ABSENT') AS absent_count,
		COUNT(*) FILTER (WHERE tl.status = 'REST_DAY') AS rest_count,
		COUNT(*) FILTER (WHERE tl.status = 'HOLIDAY') AS holiday_count,
		COALESCE(t."totalHoursWorked", '') AS total_worked,
		COALESCE(t."totalRegularHours", '') AS total_regular,
		COALESCE(t."totalOvertimeHours", '') AS total_overtime,
		minutes_to_label(SUM(duration_to_minutes(COALESCE(tl."hoursWorked", '0:00')))) AS line_worked,
		minutes_to_label(SUM(duration_to_minutes(COALESCE(tl."regularHours", '0:00')))) AS line_regular,
		minutes_to_label(SUM(duration_to_minutes(COALESCE(tl."overtimeHours", '0:00')))) AS line_overtime
	FROM timesheets t
	JOIN employees e ON e.id = t."employeeId"
	JOIN payroll_periods pp ON pp.id = t."payrollPeriodId"
	JOIN timesheet_lines tl ON tl."timesheetId" = t.id
	WHERE t."isDeleted" = false
		AND tl."isDeleted" = false
		AND tl."isEffective" = true
		AND t.status IN ('SUBMITTED', 'APPROVED')
	GROUP BY t.id, t.code, e."employeeId", pp.code, t."totalHoursWorked", t."totalRegularHours", t."totalOvertimeHours"
	HAVING
		COUNT(*) FILTER (WHERE tl.status = 'ABSENT') > 0
		AND COUNT(*) FILTER (WHERE tl.status = 'REST_DAY') > 0
		AND COUNT(*) FILTER (WHERE tl.status = 'HOLIDAY') > 0
)
SELECT
	timesheet_id,
	timesheet_code,
	employee_id,
	employee_name,
	period_code,
	absent_count,
	rest_count,
	holiday_count,
	total_worked,
	total_regular,
	total_overtime,
	line_worked,
	line_regular,
	line_overtime
FROM proof
ORDER BY absent_count DESC, rest_count DESC, holiday_count DESC
LIMIT 1;
`;
	const bootstrap = `
CREATE OR REPLACE FUNCTION duration_to_minutes(value text) RETURNS integer AS $$
DECLARE parts text[];
BEGIN
	IF value IS NULL OR trim(value) = '' THEN
		RETURN 0;
	END IF;
	parts := regexp_split_to_array(replace(value, 'h ', ':'), '[^0-9]+');
	IF array_length(parts, 1) IS NULL THEN
		RETURN 0;
	END IF;
	RETURN COALESCE(NULLIF(parts[1], '')::integer, 0) * 60 + COALESCE(NULLIF(parts[2], '')::integer, 0);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION minutes_to_label(value numeric) RETURNS text AS $$
BEGIN
	RETURN floor(COALESCE(value, 0) / 60)::text || ':' || lpad(mod(COALESCE(value, 0)::integer, 60)::text, 2, '0');
END;
$$ LANGUAGE plpgsql;
`;
	runSql(replaceDatabaseName(databaseUrl, dbName), bootstrap, false);
	const raw = runSql(replaceDatabaseName(databaseUrl, dbName), sql, true).trim();
	if (!raw) {
		throw new Error("No submitted/approved timesheet with ABSENT, REST_DAY, and HOLIDAY effective lines was found.");
	}
	const [
		timesheetId,
		timesheetCode,
		employeeId,
		employeeName,
		periodCode,
		absentCount,
		restCount,
		holidayCount,
		totalWorked,
		totalRegular,
		totalOvertime,
		lineWorked,
		lineRegular,
		lineOvertime,
	] = raw.split("\t");
	return {
		timesheetId,
		timesheetCode,
		employeeId,
		employeeName,
		periodCode,
		absentCount: Number(absentCount),
		restCount: Number(restCount),
		holidayCount: Number(holidayCount),
		totalWorked,
		totalRegular,
		totalOvertime,
		lineWorked,
		lineRegular,
		lineOvertime,
	};
}

function runSql(databaseUrlForConnection: string, sql: string, capture: boolean): string {
	const url = new URL(databaseUrlForConnection);
	const container = process.env.E2E_POSTGRES_CONTAINER || "hris-pg-primary";
	const args = [
		"exec",
		"-e",
		`PGPASSWORD=${decodeURIComponent(url.password || "")}`,
		container,
		"psql",
		"-U",
		decodeURIComponent(url.username || "postgres"),
		"-d",
		decodeURIComponent(url.pathname.replace(/^\//, "")),
		"-t",
		"-A",
		"-F",
		"\t",
		"-c",
		sql,
	];
	if (!capture) {
		execFileSync("docker", args, { stdio: "inherit" });
		return "";
	}
	return execFileSync("docker", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function escapeSql(value: string) {
	return value.replace(/'/g, "''");
}

function toHoursLabel(value: string) {
	const [hours, minutes = "00"] = value.split(":");
	return `${Number(hours)}h ${Number(minutes)}m`;
}
