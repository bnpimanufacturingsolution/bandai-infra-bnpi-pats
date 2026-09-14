import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * E2E (2026-09-09): line leader files a TIMESHEET (attendance) ADJUSTMENT for
 * a section member through the requests hub "Attendance Request" modal.
 * Proves: "For whom" picker on the Attendance adjustment branch + the
 * right-panel approval flow (tasks laid out before executing) + leader-filed
 * on-behalf create (requester = leader, target = member). The submitted test
 * request is cancelled at the end.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/leader-timesheet-adjustment-browser-proof",
);

test("line leader files a timesheet adjustment for a section member via the requests hub", async ({
	page,
}, testInfo) => {
	test.setTimeout(300_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = { startedAt: new Date().toISOString() };

	// 1) Login as the line leader (retry: local API can be slow/laggy)
	const loginResponses: Array<{ status: number; url: string; body: unknown }> = [];
	page.on("response", async (res) => {
		if (res.url().includes("/api/auth/login")) {
			loginResponses.push({
				status: res.status(),
				url: res.url(),
				body: await res.json().catch(() => null),
			});
		}
	});
	page.on("pageerror", (err) => {
		results.pageErrors = ((results.pageErrors as string[]) || []).concat(String(err));
	});
	let loggedIn = false;
	for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
		results.loginAttempts = attempt;
		await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
		const identifier = page.getByLabel(/employee id or email/i);
		await expect(identifier).toBeVisible({ timeout: 30_000 });
		await identifier.fill("leader@bandai.local");
		await page.getByLabel(/^password$/i).fill("password123");
		await page.getByRole("button", { name: /sign in/i }).click();
		try {
			await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
				timeout: 45_000,
			});
			loggedIn = true;
		} catch {
			// Retry with a fresh page; prior POST evidence stays in loginResponses.
		}
	}
	expect(loggedIn, `login failed after retries; loginResponses=${JSON.stringify(loginResponses)}`).toBe(true);
	results.loggedIn = true;
	results.loginResponses = loginResponses;

	// 2) Requests hub -> New Request -> Attendance Request
	await page.goto("/employee/requests?action=create&kind=attendance-adjustment", {
		waitUntil: "domcontentloaded",
	});
	const modal = page.getByRole("dialog").first();
	await expect(modal).toBeVisible({ timeout: 60_000 });
	results.modalVisible = true;

	// 3) Right-panel approval flow is visible (task laid out before executing)
	const panel = page.getByTestId("approval-flow-panel");
	await expect(panel).toBeVisible({ timeout: 30_000 });
	expect(await panel.innerText()).toMatch(/approval flow/i);
	results.approvalFlowPanelVisible = true;

	// 4) "For whom" picker is offered on the Attendance adjustment branch
	await expect(modal.getByText("For whom", { exact: true })).toBeVisible({
		timeout: 30_000,
	});
	results.forWhomVisibleOnAdjustmentBranch = true;

	// 5) Pick a member via the Radix select (keyboard path)
	// The For-whom select is the second combobox (first = Request type).
	const triggers = modal.locator('[data-slot="select-trigger"], button[role="combobox"]');
	const triggerCount = await triggers.count();
	results.comboboxCount = triggerCount;
	// Radix SelectTrigger renders as button[role="combobox"] in this app
	const forWhomTrigger = modal
		.locator("div")
		.filter({ has: page.getByText("For whom", { exact: true }) })
		.last()
		.locator('button[role="combobox"], [data-slot="select-trigger"]')
		.first();
	await forWhomTrigger.click();
	const memberOption = page.getByRole("option", { name: /00062/i }).first();
	await expect(memberOption).toBeVisible({ timeout: 30_000 });
	await memberOption.click();
	results.memberPicked = true;

	// The right panel must switch to the leader-filed (member) chain.
	await expect(panel).toContainText("Leader submission", { timeout: 15_000 });
	await expect(panel).toContainText("Member's manager approval (final)");
	await expect(panel).toContainText("Applied to their attendance");
	results.memberChainShownInPanel = true;
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "modal-for-whom-member.png") });

	// 6) Fill the adjustment (clock-out correction — one picker keeps the E2E
	// deterministic; the full CLOCK_IN_OUT chain was already proven via API)
	const kindSelect = modal.getByRole("combobox").nth(2); // Request type, For whom, Kind, Reason
	await kindSelect.click();
	await page.getByRole("option", { name: /clock out/i }).first().click();
	results.adjustmentKind = "CLOCK_OUT";

	// Date: CalendarDatePicker input (aria-label "Date", placeholder MM/DD/YYYY).
	const dateBox = modal.getByLabel("Date");
	await expect(dateBox).toBeVisible({ timeout: 15_000 });
	await dateBox.fill("09/09/2026");
	await dateBox.press("Tab");
	results.dateFilled = true;

	// TimePicker is a popover trigger div showing "--:-- --" or a time. With
	// CLOCK_OUT only the Time out picker renders (index 0).
	const timeTrigger = (index: number) =>
		modal.locator("div.cursor-pointer").filter({ hasText: /--:-- --|\d{1,2}:\d{2} (AM|PM)/ }).nth(index);
	const setPickerTime = async (index: number, hour: string, minute: string, ampm: string) => {
		await timeTrigger(index).click();
		const visiblePopper = () =>
			page
				.locator("[data-radix-popper-content-wrapper]")
				.filter({ has: page.locator(":visible") })
				.last();
		await expect(visiblePopper()).toBeVisible({ timeout: 15_000 });
		// The hour/minute lists re-render (scroll-to-center) on each selection,
		// which can detach the button mid-click; retry each pick with a fresh
		// locator and a settle wait.
		const pick = async (name: string) => {
			for (let attempt = 0; attempt < 6; attempt++) {
				try {
					await visiblePopper()
						.getByRole("button", { name, exact: true })
						.first()
						.click({ timeout: 2_500 });
					await page.waitForTimeout(250);
					return;
				} catch {
					await page.waitForTimeout(400);
				}
			}
			throw new Error(`TimePicker pick failed for "${name}"`);
		};
		await pick(hour);
		await pick(minute);
		await pick(ampm);
		// NOTE: do not press Escape here — it bubbles past the popover and
		// closes the whole modal. The next outside click (explanation field)
		// closes the popover instead.
	};
	await setPickerTime(0, "05", "00", "PM");
	results.timesSet = true;

	const explanation = modal.locator("textarea");
	await explanation.click({ timeout: 15_000 }); // outside click closes the popover
	await explanation.fill("Browser proof: leader-filed timesheet adjustment for member.");
	await expect(modal.getByRole("dialog")).toBeTruthy();
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "modal-before-submit.png") });

	// 7) Submit and capture the POST /api/request payload
	const responsePromise = page.waitForResponse(
		(res) =>
			res.url().includes("/api/request") &&
			res.request().method() === "POST" &&
			((res.request().postDataJSON() as { type?: string } | null)?.type ===
				"ATTENDANCE_CORRECTION"),
		{ timeout: 120_000 },
	);
	await modal.getByRole("button", { name: /submit request/i }).click();
	const response = await responsePromise;
	const payload = response.request().postDataJSON() as {
		requesterId?: string;
		targetEmployeeId?: string;
		type?: string;
		metadata?: { requestSource?: string; workflowTarget?: string };
	};
	results.createStatus = response.status();
	results.payload = {
		requesterId: payload.requesterId,
		targetEmployeeId: payload.targetEmployeeId,
		type: payload.type,
		requestSource: payload.metadata?.requestSource,
		workflowTarget: payload.metadata?.workflowTarget,
	};
	// Leader = requester, member = target
	expect(payload.requesterId).toBeTruthy();
	expect(payload.targetEmployeeId).toBeTruthy();
	expect(payload.targetEmployeeId).not.toBe(payload.requesterId);
	expect(payload.metadata?.requestSource).toBe("LINE_LEADER_FILED");
	const created = (await response.json()) as { data?: { id?: string; code?: string } };
	results.createdRequestCode = created?.data?.code;
	results.createdRequestId = created?.data?.id;
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "after-submit.png") });

	// 8) Cleanup: cancel the test request (keeps DEV clean)
	if (created?.data?.id) {
		const cancel = await page.request.patch(
			`/api/request/${created.data.id}/cancel`,
			{ data: { reason: "Browser proof cleanup" } },
		);
		results.cancelStatus = cancel.status();
	}

	results.finishedAt = new Date().toISOString();
	writeFileSync(path.join(EVIDENCE_DIR, "proof.json"), JSON.stringify(results, null, 2));
	expect(results.createStatus).toBe(201);
});
