import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * E2E: line leader assigns OT to members via the checkbox screen on My Team.
 * Path: /employee/team -> "Assign Overtime" tab -> tick members -> set hours ->
 * Assign OT -> each POST /api/request is a leader-filed on-behalf OT.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/line-leader-ot-on-behalf-proof",
);

test("line leader assigns overtime via the My Team checkbox screen", async ({
	page,
}, testInfo) => {
	test.setTimeout(300_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const startedAt = new Date().toISOString();
	const results: Record<string, unknown> = {
		startedAt,
	};
	const diagnosticRequests: Array<{ status: number; body: any }> = [];

	// Capture OT create responses for diagnostics (assertions use the awaited
	// responsePromises below).
	page.on("response", async (res) => {
		if (
			res.url().includes("/api/request") &&
			res.request().method() === "POST" &&
			(res.request().postDataJSON() as { type?: string } | null)?.type === "OVERTIME"
		) {
			const body = await res.json().catch(() => null);
			diagnosticRequests.push({ status: res.status(), body });
		}
	});
	page.on("response", (res) => {
		if (res.url().includes("/api/section/led-members")) {
			results.ledMembersStatus = res.status();
		}
	});

	// 1) Login as the line leader
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	await expect(identifier).toBeVisible({ timeout: 30_000 });
	await identifier.fill("leader@bandai.local");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 120_000,
	});

	// 2) Open My Team -> Assign Overtime (sidebar link or tab fallback)
	await page.goto("/employee/team?tab=overtime", { waitUntil: "domcontentloaded" });
	// Sidebar must expose the new entry for the leader
	const sidebarLink = page.getByRole("link", { name: /assign overtime/i }).first();
	await expect(sidebarLink).toBeVisible({ timeout: 60_000 });
	results.sidebarLinkVisible = true;
	const tabButton = page.getByRole("button", { name: /assign overtime/i }).first();
	if (await tabButton.isVisible().catch(() => false)) {
		await tabButton.click();
	}
	await expect(page.getByText(/tick the members who worked overtime|ticked/i).first()).toBeVisible({
		timeout: 60_000,
	});
	results.screenVisible = true;

	// 3) Tick the first two members (checkboxes labelled "Assign overtime to ...")
	const checkboxes = page.getByRole("checkbox", { name: /assign overtime to/i });
	const boxCount = await checkboxes.count();
	results.checkboxCount = boxCount;
	expect(boxCount).toBeGreaterThan(0);
	await checkboxes.nth(0).check();
	await checkboxes.nth(1).check();
	results.ticked = 2;

	// 4) Set distinct durations, default reason already prefilled? set explicitly
	await page.getByLabel(/overtime hours for/i).first().fill("1");
	const minutesInputs = page.getByLabel(/overtime minutes for/i);
	await minutesInputs.first().fill("30");
	await page
		.getByPlaceholder(/line stayed late/i)
		.fill("E2E checkbox-screen proof (safe to delete)");

	// 5) Submit and capture the per-member OT requests.
	// Real response promises (Node side) — the forward can be slow after recovery,
	// so allow one per ticked member with generous timeouts.
	const isOtCreate = (res: { url: () => string; request: () => { method: () => string; postDataJSON: () => unknown } }) =>
		res.url().includes("/api/request") &&
		res.request().method() === "POST" &&
		(res.request().postDataJSON() as { type?: string } | null)?.type === "OVERTIME";
	const responsePromises = [0, 1].map(() =>
		page.waitForResponse((res) => isOtCreate(res as never), { timeout: 240_000 }),
	);
	await page.getByRole("button", { name: /assign ot/i }).click();
	const settled = await Promise.allSettled(responsePromises);
	const fulfilled = settled
		.filter((s): s is PromiseFulfilledResult<any> => s.status === "fulfilled")
		.map((s) => s.value);
	const rejected = settled.filter((s) => s.status === "rejected");
	if (rejected.length > 0) {
		results.waitRejections = rejected.length;
	}
	const createdRequests = await Promise.all(
		fulfilled.map(async (res) => ({
			status: res.status(),
			body: await res.json().catch(() => null),
		})),
	);
	results.finishedAt = new Date().toISOString();

	await page.screenshot({
		path: path.join(EVIDENCE_DIR, `checkbox-screen-${testInfo.status ?? "done"}.png`),
		fullPage: false,
	});

	results.createdCount = createdRequests.length;
	results.statuses = createdRequests.map((entry) => entry.status);
	results.workflows = createdRequests.map(
		(entry) => entry.body?.data?.workflowInstance?.code ?? null,
	);
	results.codes = createdRequests.map((entry) => entry.body?.data?.code ?? null);

	writeFileSync(
		path.join(EVIDENCE_DIR, `checkbox-proof-${testInfo.status ?? "done"}.json`),
		JSON.stringify(results, null, 2),
	);

	expect(createdRequests.length).toBeGreaterThanOrEqual(2);
	for (const entry of createdRequests) {
		expect([200, 201]).toContain(entry.status);
		expect(entry.body?.data?.workflowInstance?.code).toBe("WF-OVERTIME-LEADER-FILED");
	}
});
