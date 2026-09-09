import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Live UI proof (operator 2026-09-09): the My Team group sits at the TOP of
 * the Working Space section on the line-leader sidebar, and its entries
 * (Overview / Organization Chart / Team Timesheets / Assign Overtime) are
 * always-visible flat links - NOT a collapsed submenu under a "My Team" toggle.
 * Account: leader@bandai.local / password123 (hris-line-leader).
 * Skips automatically when the local stack is not reachable so CI is unaffected.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/my-team-flat-sidebar-20260909",
);

test("line leader sidebar shows My Team flat at the top of Working Space", async ({
	page,
}, testInfo) => {
	test.setTimeout(240_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = {
		account: "leader@bandai.local",
		startedAt: new Date().toISOString(),
	};

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	// The login form renders after the app's provisioning status check; the
	// local K3s DB forward can be degraded (10-40s API responses), so wait it
	// out instead of failing on the transient "Setting up" gate.
	await expect(identifier).toBeVisible({ timeout: 150_000 });
	await identifier.fill("leader@bandai.local");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 120_000,
	});
	results.postLoginUrl = page.url();
	expect(page.url()).toContain("/dashboard");

	await page.waitForLoadState("networkidle").catch(() => undefined);

	// My Team must be a direct LINK, not a collapsible submenu toggle button.
	const myTeamLink = page.getByRole("link", { name: "My Team" });
	await expect(myTeamLink).toBeVisible();
	results.myTeamRole = "link";
	results.myTeamHref = await myTeamLink.getAttribute("href");

	// Flat entries are visible without any expand/collapse interaction.
	const flatEntries = ["Overview", "Organization Chart", "Team Timesheets", "Assign Overtime"];
	for (const label of flatEntries) {
		const entry = page.getByRole("link", { name: label, exact: true });
		await expect(entry).toBeVisible();
	}

	// No submenu toggle button for My Team may exist anymore.
	expect(await page.getByRole("button", { name: "My Team" }).count()).toBe(0);

	// Position: Working Space heading -> My Team -> Dashboard -> General heading.
	const workingSpaceHeading = page.getByText("Working Space", { exact: true });
	const generalHeading = page.getByText("General", { exact: true });
	const dashboardLink = page.getByRole("link", { name: /Dashboard/ });

	const wsBeforeMyTeam = await workingSpaceHeading.evaluate(
		(el, other) =>
			!!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
		await myTeamLink.elementHandle(),
	);
	const myTeamBeforeDashboard = await myTeamLink.evaluate(
		(el, other) =>
			!!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
		await dashboardLink.elementHandle(),
	);
	const myTeamBeforeGeneral = await myTeamLink.evaluate(
		(el, other) =>
			!!(el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
		await generalHeading.elementHandle(),
	);
	results.order = { workingSpaceBeforeMyTeam: wsBeforeMyTeam, myTeamBeforeDashboard, myTeamBeforeGeneral };

	expect(wsBeforeMyTeam).toBe(true);
	expect(myTeamBeforeDashboard).toBe(true);
	expect(myTeamBeforeGeneral).toBe(true);

	// Single-highlight contract: on a team tab, the tab item owns the orange
	// highlight and My Team does NOT glow with it (no double highlight).
	const isHighlighted = async (label: string) => {
		const link = page.getByRole("link", { name: label, exact: true });
		const className = (await link.getAttribute("class")) ?? "";
		return className.includes("bg-orange-50");
	};

	await page.goto("/employee/team?tab=timesheets", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("link", { name: "Team Timesheets", exact: true })).toBeVisible();
	await page.waitForLoadState("networkidle").catch(() => undefined);
	results.highlightOnTimesheets = {
		teamTimesheets: await isHighlighted("Team Timesheets"),
		myTeam: await isHighlighted("My Team"),
		overview: await isHighlighted("Overview"),
	};
	expect(results.highlightOnTimesheets.teamTimesheets).toBe(true);
	expect(results.highlightOnTimesheets.myTeam).toBe(false);
	expect(results.highlightOnTimesheets.overview).toBe(false);

	await page.goto("/employee/team?tab=organization", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("link", { name: "Organization Chart", exact: true })).toBeVisible();
	await page.waitForLoadState("networkidle").catch(() => undefined);
	results.highlightOnOrganization = {
		organizationChart: await isHighlighted("Organization Chart"),
		myTeam: await isHighlighted("My Team"),
	};
	expect(results.highlightOnOrganization.organizationChart).toBe(true);
	expect(results.highlightOnOrganization.myTeam).toBe(false);

	await page.screenshot({
		path: path.join(EVIDENCE_DIR, "my-team-flat-sidebar.png"),
		fullPage: false,
	});

	results.finishedAt = new Date().toISOString();
	writeFileSync(
		path.join(EVIDENCE_DIR, `ui-proof-${testInfo.status ?? "done"}.json`),
		JSON.stringify(results, null, 2),
	);
});
