import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildJobDisplayCodes } from "../../app/lib/utils/recruitment-job-code";

const API = "http://localhost:3001";
const EVIDENCE_DIR = join(process.cwd(), "..", ".runtime", "recruitment-filter-proof");

async function login(page: Page, email: string, password: string) {
	await page.goto("/auth/login");
	await page.locator("#login-identifier").fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 90_000 });
}

const fullName = (applicant: any) =>
	[
		applicant?.person?.personalInfo?.firstName || "",
		applicant?.person?.personalInfo?.lastName || "",
	]
		.join(" ")
		.trim();

test("recruitment candidates group into their job kanban sections and the search filter narrows both views", async ({
	page,
	request,
}) => {
	test.slow();
	mkdirSync(EVIDENCE_DIR, { recursive: true });

	const adminLogin = await request.post(`${API}/api/auth/login`, {
		data: { email: "admin@bandai.local", password: "password123", appCode: "hris" },
	});
	expect(adminLogin.ok()).toBeTruthy();
	const adminToken = (await adminLogin.json()).data.token;
	const headers = { Authorization: `Bearer ${adminToken}` };

	const groupedBody = await (
		await request.get(
			`${API}/api/applicant?page=1&limit=1000&groupBy=job&document=true&fields=id,jobId,job.id,job.position.title,job.level.name,person,currentWorkflowStateKey&filter=${encodeURIComponent(
				'{"isDeleted":false}',
			)}`,
			{ headers },
		)
	).json();
	const groups: Record<string, any[]> = groupedBody.data.applicants;
	const groupKeys = Object.keys(groups);

	// API regression gate: candidates must key by job id (never "unassigned"
	// while every applicant has a job) and carry job.* fields.
	expect(groupKeys).not.toContain("unassigned");
	const firstGrouped = groupKeys.flatMap((k) => groups[k])[0];
	expect(firstGrouped.job?.id).toBeTruthy();
	expect(fullName(firstGrouped)).not.toBe("Unknown Applicant");

	const jobsBody = await (
		await request.get(
			`${API}/api/job?page=1&limit=1000&document=true&sort=createdAt&order=desc&fields=id,position.id,position.code,position.title,level.name,headcountRequested,createdAt&filter=${encodeURIComponent(
				'{"isDeleted":false}',
			)}`,
			{ headers },
		)
	).json();
	const jobs: any[] = jobsBody.data.jobs || jobsBody.data.data || [];
	// Same input order the board uses (useJobs sort=createdAt desc) so the
	// collision suffixes computed here match the page's rendered codes.
	const expectedCodes = buildJobDisplayCodes(
		jobs.map((job: any) => ({
			id: job?.id,
			positionTitle: job?.position?.title,
			positionCode: job?.position?.code,
			createdAt: job?.createdAt,
		})),
	);
	const labelFor = (jobId: string) => {
		const job = jobs.find((j) => j.id === jobId);
		const position = job?.position?.title || jobId;
		return job?.level?.name ? `${job.level.name} - ${position}` : position;
	};

	// Pick a section whose label is unique on the board and has >= 2 candidates.
	const labelCounts: Record<string, number> = {};
	for (const job of jobs) labelCounts[labelFor(job.id)] = (labelCounts[labelFor(job.id)] || 0) + 1;
	const target = groupKeys
		.filter((k) => k !== "unassigned")
		.filter((k) => groups[k].length >= 2)
		.sort((a, b) => groups[b].length - groups[a].length)
		.find((k) => labelCounts[labelFor(k)] === 1);
	expect(target, "expected a uniquely-labelled job with 2+ candidates").toBeTruthy();

	const sectionLabel = labelFor(target!);
	const candidates = groups[target!];
	const names = candidates.map(fullName);
	const searcher = names[0].split(" ")[0];
	const otherNames = names.slice(1);
	writeFileSync(
		join(EVIDENCE_DIR, "api-grouped-proof.json"),
		JSON.stringify(
			{
				groupKeys,
				groupSizes: Object.fromEntries(groupKeys.map((k) => [k, groups[k].length])),
				jobDisplayCodes: expectedCodes,
				targetSection: { jobId: target, label: sectionLabel, names },
			},
			null,
			2,
		),
	);

	const consoleErrors: string[] = [];
	const failedApi: { url: string; status: number }[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") consoleErrors.push(msg.text());
	});
	page.on("response", (res) => {
		if (res.url().includes("/api/applicant") && res.status() >= 400) {
			failedApi.push({ url: res.url(), status: res.status() });
		}
	});

	await login(page, "admin@bandai.local", "password123");
	const groupedPromise = page.waitForResponse(
		(r) => r.url().includes("/api/applicant") && r.url().includes("groupBy=job") && r.status() === 200,
		{ timeout: 60_000 },
	);
	await page.goto("/hr/recruitment");
	await groupedPromise;
	await expect(page.getByRole("heading", { name: "Recruitment" })).toBeVisible();

	await expect(page.getByText("unassigned", { exact: true })).toHaveCount(0);

	// Open the target job section and prove its kanban holds the candidates.
	const section = page.locator("section", { has: page.getByRole("heading", { name: sectionLabel, exact: true }) });
	await expect(section).toHaveCount(1);
	if (!(await section.getByText(names[0]).first().isVisible().catch(() => false))) {
		await section.getByRole("heading", { name: sectionLabel, exact: true }).click();
	}
	await expect(section.getByText(names[0]).first()).toBeVisible({ timeout: 30_000 });
	for (const name of names) {
		await expect(section.getByText(name).first()).toBeVisible();
	}
	await page.screenshot({ path: join(EVIDENCE_DIR, "01-kanban-section-populated.png"), fullPage: false });

	// Job display-code badges: every job section header carries the derived
	// code (initials + MMDDYYYY, -2/-3 suffix on same title + same day).
	const targetCode = expectedCodes[target!];
	expect(targetCode).toMatch(/^[A-Z0-9][A-Z0-9-]*-\d{8}(-\d+)?$/);
	await expect(
		section.getByTestId("job-display-code").filter({ hasText: new RegExp(`^${targetCode}$`) }),
	).toHaveCount(1);
	const allBadges = page.getByTestId("job-display-code");
	const renderedCodes = (await allBadges.allTextContents()).map((t) => t.trim());
	// Every job section (populated or not) gets its code badge.
	expect(renderedCodes.sort()).toEqual(Object.values(expectedCodes).sort());
	// Same-title Factory Manager openings must not look duplicated.
	const fmCodes = jobs
		.filter((j) => j?.position?.title === "Factory Manager")
		.map((j) => expectedCodes[j.id])
		.filter(Boolean);
	expect(fmCodes.length).toBeGreaterThanOrEqual(2);
	expect(new Set(fmCodes).size).toBe(fmCodes.length);
	// Level-less jobs must show the plain title (no dangling " - " prefix).
	for (const heading of await page.locator("section h2").allTextContents()) {
		expect(heading.trim()).not.toMatch(/^[-•|]/);
	}
	await page.screenshot({ path: join(EVIDENCE_DIR, "01b-job-code-badges.png"), fullPage: false });

	// Kanban search: narrowing works.
	const search = page.getByPlaceholder("Search applicants...");
	await search.fill(searcher);
	await expect(section.getByText(names[0]).first()).toBeVisible();
	for (const other of otherNames) {
		if (other.split(" ")[0] !== searcher) {
			await expect(section.getByText(other)).toHaveCount(0);
		}
	}
	await page.screenshot({ path: join(EVIDENCE_DIR, "02-kanban-search-narrowed.png") });
	await search.fill("zzqxv-noneleft");
	await expect(section.getByText(names[0])).toHaveCount(0);
	await search.fill("");
	await expect(section.getByText(names[0]).first()).toBeVisible();

	// Table view: same candidate set + search narrowing.
	await page.getByRole("button", { name: /^Table$/ }).click();
	await expect(page.getByRole("columnheader", { name: "Candidate" })).toBeVisible();
	await expect(section.locator("table tbody tr")).toHaveCount(candidates.length);
	for (const name of names) {
		await expect(section.getByRole("cell", { name: new RegExp(name) }).first()).toBeVisible();
	}
	await page.screenshot({ path: join(EVIDENCE_DIR, "03-table-all-candidates.png") });
	await search.fill(searcher);
	const rowsAfter = section.locator("table tbody tr");
	const matchedNames = names.filter((n) => n.includes(searcher));
	await expect(rowsAfter).toHaveCount(matchedNames.length);
	await expect(rowsAfter.first()).toContainText(matchedNames[0]);
	await search.fill("zzqxv-noneleft");
	await expect(section.getByText("No applicants in this workflow yet.")).toBeVisible();
	await page.screenshot({ path: join(EVIDENCE_DIR, "04-table-search-empty-state.png") });
	await search.fill("");

	// Manage Jobs list shows the same code badges (one source of truth).
	await page.getByRole("button", { name: /manage jobs/i }).click();
	await expect(page.getByText("Job Openings").first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('[data-testid="job-display-code"]').first()).toBeVisible({
		timeout: 30_000,
	});
	await expect(
		page.locator('[data-testid="job-display-code"]', { hasText: new RegExp(`^${targetCode}$`) }).first(),
	).toBeVisible();
	await page.screenshot({ path: join(EVIDENCE_DIR, "05-manage-jobs-code-badges.png") });

	writeFileSync(
		join(EVIDENCE_DIR, "browser-proof-summary.json"),
		JSON.stringify(
			{
				sectionLabel,
				candidateNames: names,
				searcher,
				consoleErrors: consoleErrors.filter((e) => !/favicon|Download the React DevTools/i.test(e)),
				failedApi,
			},
			null,
			2,
		),
	);
	expect(failedApi).toEqual([]);
});
