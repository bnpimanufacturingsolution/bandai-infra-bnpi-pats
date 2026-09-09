import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * E2E: line leader files OVERTIME for a section member through the real UI.
 * Uses the "For whom" picker added to AttendanceAdjustmentRequestModal for
 * leaders. Runs against local dev (5175 -> 3001). Evidence lands in .runtime.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/line-leader-ot-on-behalf-proof",
);

test("line leader files overtime for a section member via the UI", async ({
	page,
}, testInfo) => {
	test.setTimeout(300_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = {
		startedAt: new Date().toISOString(),
	};

	const apiBases = ["http://localhost:3001/api"];
	void apiBases;
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
	results.postLoginUrl = page.url();

	// 2) Open Requests hub create flow for overtime (date prefilled via URL param
	//    — the modal maps ?date= to initialDate, avoiding live DatePicker flakiness)
	await page.goto(
		"/employee/requests?action=create&kind=attendance-adjustment&requestKind=OVERTIME&date=2026-09-08",
		{ waitUntil: "domcontentloaded" },
	);
	const modalHeading = page.getByText("Attendance request", { exact: true }).first();
	await expect(modalHeading).toBeVisible({ timeout: 60_000 });

	// 3) The "For whom" picker must appear for the line leader
	const dialog = page.getByRole("dialog", { name: "Attendance request" });
	await expect(dialog).toBeVisible({ timeout: 30_000 });
	await expect(dialog.getByText("For whom")).toBeVisible({ timeout: 30_000 });
	results.forWhomPickerVisible = true;

	// 4) Pick a member via keyboard (Radix Select portals its listbox to body)
	const forWhomTrigger = dialog.getByRole("combobox").nth(1); // [0]=Request type, [1]=For whom
	await forWhomTrigger.click();
	await page.keyboard.press("ArrowDown"); // move to first member (Danica Ebreo 00062)
	await page.keyboard.press("Enter"); // select + close listbox
	await page.waitForTimeout(500);
	const triggerText = (await forWhomTrigger.textContent()) || "";
	results.pickedMember = triggerText.trim();
	results.pickedIsMember = !triggerText.includes("(you)");
	expect(triggerText).not.toContain("(you)");

	// 5) Fill duration + reason and submit; capture the create request POST result
	const hoursInput = dialog.getByRole("spinbutton").first();
	const minutesInput = dialog.getByRole("spinbutton").nth(1);
	await hoursInput.fill("1");
	await minutesInput.fill("0");
	await page
		.getByPlaceholder(/stayed to finish/i)
		.fill("E2E proof: leader-filed OT for member (safe to delete)");
	const createResponsePromise = page
		.waitForResponse(
			(res) =>
				res.url().includes("/api/request") &&
				res.request().method() === "POST" &&
				res.request().postDataJSON()?.type === "OVERTIME",
			{ timeout: 90_000 },
		)
		.catch(() => null);
	await page.getByRole("button", { name: /submit request/i }).click();
	const createResponse = await createResponsePromise;
	results.createRequestStatus = createResponse?.status() ?? null;
	if (createResponse) {
		const body = await createResponse.json().catch(() => null);
		results.createdRequestCode = body?.data?.code ?? null;
		results.createdWorkflow = body?.data?.workflowInstance?.code ?? null;
		if (createResponse.status() >= 400) {
			results.createErrorBody = body ?? (await createResponse.text().catch(() => null));
		}
	}
	results.finishedAt = new Date().toISOString();

	await page.screenshot({
		path: path.join(EVIDENCE_DIR, `leader-ot-modal-${testInfo.status ?? "done"}.png`),
		fullPage: false,
	});

	const status = results.createRequestStatus as number | null;
	results.verdict = status === 200 || status === 201 ? "OT_FILED_FOR_MEMBER" : `status=${status ?? "none"}`;
	writeFileSync(
		path.join(EVIDENCE_DIR, `proof-${testInfo.status ?? "done"}.json`),
		JSON.stringify(results, null, 2),
	);
	expect([200, 201]).toContain(status);
	expect(results.createdWorkflow).toBe("WF-OVERTIME-LEADER-FILED");
});
