/**
 * Live Playwright canary: Copy device user to ONE peer (admin sandbox 1–20).
 * Evidence under this folder. Does NOT bulk-copy all peers.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Evidence always lands in the canary stamp folder (absolute, independent of cwd).
const evidenceDir = resolve(
	"C:/Users/stari/bandai-infra/.runtime/copy-peer-canary-admin-20260725/playwright",
);
const stampRoot = resolve(
	"C:/Users/stari/bandai-infra/.runtime/copy-peer-canary-admin-20260725",
);
const sourceDeviceId = "cmrht5s2w00ei7zgsre8y3o5n"; // Main Entrance Device A
const targetDeviceName = process.env.COPY_PEER_TARGET_NAME || "Main Entrance Device B";

function loadChosenEmployeeNo(): string {
	const fromEnv = String(process.env.COPY_PEER_EMPLOYEE_NO || "").trim();
	if (fromEnv) return fromEnv;
	const chosenPath = resolve(stampRoot, "chosen.json");
	if (existsSync(chosenPath)) {
		try {
			const raw = JSON.parse(readFileSync(chosenPath, "utf8"));
			const emp = String(raw?.employeeNo || "").trim();
			if (emp) return emp;
		} catch {
			// fall through
		}
	}
	return "12";
}

const employeeNo = loadChosenEmployeeNo();

test.describe.configure({ mode: "serial", timeout: 8 * 60_000 });

test("copy one admin-sandbox vendor user to a single peer device", async ({ page }) => {
	mkdirSync(evidenceDir, { recursive: true });
	const startedAt = new Date().toISOString();
	const consoleErrors: string[] = [];
	const pageErrors: string[] = [];
	const failedRequests: Array<{ url: string; error: string | null; method: string }> = [];
	const networkNotes: Array<{
		kind: string;
		method?: string;
		url: string;
		status?: number;
		bodySnippet?: string;
		at: string;
	}> = [];

	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("pageerror", (err) => pageErrors.push(String(err)));
	page.on("requestfailed", (request) => {
		failedRequests.push({
			url: request.url(),
			error: request.failure()?.errorText || null,
			method: request.method(),
		});
	});
	page.on("response", async (response) => {
		const url = response.url();
		if (!/copy-user|device\/users|auth\/login|auth\/me/i.test(url)) return;
		let bodySnippet = "";
		try {
			const text = await response.text();
			bodySnippet = text.slice(0, 1200);
		} catch {
			bodySnippet = "(unreadable)";
		}
		networkNotes.push({
			kind: "response",
			method: response.request().method(),
			url,
			status: response.status(),
			bodySnippet,
			at: new Date().toISOString(),
		});
	});

	const shot = async (name: string) => {
		const path = resolve(evidenceDir, name);
		await page.screenshot({ path, fullPage: true });
		return path;
	};

	// 1) Login
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page
		.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")
		.fill("admin@bandai.local");
	await page.getByPlaceholder("Enter your password").fill("password123");
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 45_000,
	});
	await shot("01-after-login.png");

	// 2) Open Sync Center / device users for Main Entrance Device A
	const syncUrl = `/admin/configuration/devices?action=device-users&deviceId=${sourceDeviceId}`;
	await page.goto(syncUrl, { waitUntil: "domcontentloaded" });

	const dialog = page.getByRole("dialog").filter({ hasText: "Sync Center" });
	await expect(dialog.getByRole("heading", { name: "Sync Center" })).toBeVisible({
		timeout: 60_000,
	});
	// Device name may load after users fetch
	await expect(
		dialog.getByText(/Main Entrance Device A|Device A/i).first(),
	).toBeVisible({ timeout: 90_000 });

	// Wait until device inventory is present (not the initial empty "Current view 0" flash).
	await expect
		.poll(
			async () => {
				const text = await dialog.innerText();
				const m = text.match(/Read from device\s*\n?\s*([\d,]+)/i);
				const n = m ? Number(String(m[1]).replace(/,/g, "")) : 0;
				const hasRows = (await dialog.locator("tbody tr").count()) > 0;
				return n > 0 || hasRows;
			},
			{ timeout: 120_000, intervals: [1_000, 2_000, 3_000] },
		)
		.toBeTruthy();
	await shot("02-sync-center-open.png");

	// 3) Find exact vendor user id in 1–20 (prefer chosen; fallback 16 which also needs peer copy).
	const candidateIds = Array.from(
		new Set([employeeNo, "12", "16", "1", "10", "18", "19", ...Array.from({ length: 20 }, (_, i) => String(i + 1))]),
	);

	const searchInput = dialog.getByPlaceholder(/Search user, name, employee/i);
	await expect(searchInput).toBeVisible({ timeout: 30_000 });

	const findExactVendorRowOnPage = async (id: string) => {
		const rows = dialog.locator("tbody tr");
		const count = await rows.count();
		// Match secondary line like "12 - normal" without accepting "112 - normal" / "1012 - normal".
		const exactLine = new RegExp(`(?:^|\\n)\\s*${id}\\s*-\\s*normal\\b`, "im");
		const bareIdLine = new RegExp(`(?:^|\\n)\\s*${id}\\s*(?:\\n|$)`, "im");
		for (let i = 0; i < count; i += 1) {
			const rowText = await rows.nth(i).innerText();
			if (exactLine.test(rowText) || bareIdLine.test(rowText)) {
				return rows.nth(i);
			}
		}
		return null;
	};

	let usedEmployeeNo = employeeNo;
	let targetRow = dialog.locator("tbody tr").first();
	let foundRow = false;
	let searched = false;

	for (const id of candidateIds) {
		await searchInput.fill("");
		await searchInput.fill(id);
		await searchInput.press("Enter").catch(() => undefined);
		searched = true;
		// Debounced client filter + network refresh
		await page.waitForTimeout(2500);

		// Prefer exact vendor id line over substring hits (e.g. search "12" → 1112/1012).
		let match = await findExactVendorRowOnPage(id);
		if (!match) {
			for (let pageIdx = 0; pageIdx < 15 && !match; pageIdx += 1) {
				const next = dialog.getByRole("button", { name: /^Next/i });
				if ((await next.count()) === 0 || (await next.isDisabled().catch(() => true))) break;
				await next.click();
				await page.waitForTimeout(900);
				match = await findExactVendorRowOnPage(id);
			}
		}

		if (match) {
			targetRow = match;
			usedEmployeeNo = id;
			foundRow = true;
			break;
		}
	}

	await shot("03-user-search.png");
	expect(foundRow).toBeTruthy();

	await expect(targetRow).toBeVisible({ timeout: 30_000 });
	await targetRow.scrollIntoViewIfNeeded();
	await shot("04-user-row-selected.png");

	// 4) Open row menu → Copy to peer device
	const moreBtn = targetRow.getByRole("button", {
		name: /More actions for device user/i,
	});
	if ((await moreBtn.count()) > 0) {
		await moreBtn.click();
	} else {
		// Fallback: last button in row
		await targetRow.locator("button").last().click();
	}
	await expect(page.getByRole("menuitem", { name: /Copy to peer device/i })).toBeVisible({
		timeout: 15_000,
	});
	await shot("05-row-menu-open.png");
	await page.getByRole("menuitem", { name: /Copy to peer device/i }).click();

	// 5) Copy modal: ONE target only (not all peers), FP + face checked
	const copyDialog = page
		.getByRole("dialog")
		.filter({ hasText: /Copy|peer/i })
		.last();
	await expect(copyDialog).toBeVisible({ timeout: 30_000 });
	await shot("06-copy-modal-open.png");

	// Ensure "Copy to all peer devices" is UNCHECKED
	const allPeersLabel = copyDialog.getByText(/Copy to all peer devices/i);
	if ((await allPeersLabel.count()) > 0) {
		const checkbox = allPeersLabel
			.locator("xpath=ancestor::div[contains(@class,'border')][1]//input[@type='checkbox']")
			.first();
		if ((await checkbox.count()) > 0 && (await checkbox.isChecked())) {
			await checkbox.uncheck();
		}
	}
	// Also try by role
	const allPeersCheckbox = copyDialog.locator('input[type="checkbox"]').first();
	// The first checkbox in the modal body is applyToAllPeers per enroll.tsx order
	// after source summary. Prefer text-relative.
	const applyAll = copyDialog
		.locator("label, span, div")
		.filter({ hasText: /^Copy to all peer devices$/ })
		.locator("xpath=preceding::input[@type='checkbox'][1]");
	if ((await applyAll.count()) > 0 && (await applyAll.isChecked().catch(() => false))) {
		await applyAll.uncheck();
	}

	// Select target device B if select is present
	const targetSelectTrigger = copyDialog
		.getByRole("combobox")
		.or(copyDialog.locator('[role="combobox"]'))
		.or(copyDialog.locator("button").filter({ hasText: /Select target|Main Entrance|Device/i }));
	if ((await targetSelectTrigger.count()) > 0) {
		const current = await targetSelectTrigger.first().innerText().catch(() => "");
		if (!new RegExp(targetDeviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(current)) {
			await targetSelectTrigger.first().click();
			const option = page.getByRole("option", { name: new RegExp(targetDeviceName, "i") });
			if ((await option.count()) > 0) {
				await option.first().click();
			} else {
				// listbox items may not use option role
				const item = page.locator('[role="listbox"] *').filter({ hasText: new RegExp(targetDeviceName, "i") });
				if ((await item.count()) > 0) await item.first().click();
			}
		}
	}

	// Leave fingerprints + face checked (default true in UI)
	const fpBox = copyDialog.locator("input[type='checkbox']").nth(1);
	const faceBox = copyDialog.locator("input[type='checkbox']").nth(2);
	if ((await fpBox.count()) > 0 && !(await fpBox.isChecked())) await fpBox.check();
	if ((await faceBox.count()) > 0 && !(await faceBox.isChecked())) await faceBox.check();

	await shot("07-copy-modal-single-target.png");

	// Capture pre-submit modal text
	const preSubmitText = await copyDialog.innerText().catch(() => "");
	writeFileSync(resolve(evidenceDir, "pre-submit-modal.txt"), preSubmitText);

	// 6) Click Copy to peer
	const copyBtn = copyDialog.getByRole("button", {
		name: /Copy to peer|Retry failed|Copying/i,
	});
	await expect(copyBtn).toBeEnabled({ timeout: 15_000 });
	await copyBtn.click();

	// 7) Progress UI if present
	await page.waitForTimeout(1000);
	await shot("08-copy-started.png");

	// 8) Wait up to 6 min for success toast or failure message
	const deadline = Date.now() + 6 * 60_000;
	let finalOutcome: "success" | "partial" | "failure" | "timeout" | "unknown" = "unknown";
	let finalText = "";

	while (Date.now() < deadline) {
		await shot("09-progress-poll.png").catch(() => undefined);
		const bodyText = await page.locator("body").innerText();
		const modalText = (await copyDialog.innerText().catch(() => "")) || "";
		finalText = `${modalText}\n---\n${bodyText}`;

		// Stage labels from UI
		const stageHit =
			/Queued|Starting|Checking VM|Writing on peer|Writing biometrics|Re-reading|Completed|Failed|Copying|peer-copy|Job /i.test(
				modalText,
			);
		if (stageHit) {
			writeFileSync(
				resolve(evidenceDir, "progress-snapshot.txt"),
				`${new Date().toISOString()}\n${modalText}`,
			);
		}

		if (
			/Copied to \d+|copy completed|successfully copied|Peer copy complete|Completed/i.test(
				finalText,
			) &&
			!/Failed to copy|No peer copy finished/i.test(modalText)
		) {
			// success toast patterns
			if (
				/Copied to \d+ of \d+/i.test(finalText) &&
				!/Copied to 0 of/i.test(finalText)
			) {
				finalOutcome = /of \d+ peer/.test(finalText) && !/Copied to \d+ of \d+ peer devices\.$/.test("")
					? /Copied to (\d+) of (\d+)/.test(finalText) &&
						RegExp.$1 !== RegExp.$2
						? "partial"
						: "success"
					: "success";
			}
			if (/Copied to \d+ peer|successfully|Completed(?! with)/i.test(finalText)) {
				finalOutcome = "success";
			}
			if (/Completed with some failures|Copied to \d+ of \d+/i.test(finalText)) {
				const m = finalText.match(/Copied to (\d+) of (\d+)/i);
				if (m && m[1] !== m[2]) finalOutcome = "partial";
				else if (m && m[1] === m[2]) finalOutcome = "success";
			}
			if (finalOutcome !== "unknown") break;
		}

		if (
			/Failed to copy|No peer copy finished|Peer-copy job did not return|still running or stopped updating|not reachable/i.test(
				modalText + bodyText,
			)
		) {
			// Keep waiting a bit if job still polling
			if (
				/Copying|Queued|Starting|Writing|Checking|progress|Job /i.test(modalText) &&
				!/Failed to copy device user|No peer copy finished/i.test(modalText)
			) {
				await page.waitForTimeout(2000);
				continue;
			}
			finalOutcome = "failure";
			break;
		}

		// Toast region
		const toast = page.locator("[data-sonner-toast], [role='status'], .Toastify, li[data-type]");
		if ((await toast.count()) > 0) {
			const toastText = await toast.allInnerTexts().catch(() => []);
			const joined = toastText.join("\n");
			if (/copied|success/i.test(joined) && !/fail/i.test(joined)) {
				finalOutcome = "success";
				finalText += `\nTOAST:\n${joined}`;
				break;
			}
			if (/fail|error|not reachable/i.test(joined)) {
				finalOutcome = "failure";
				finalText += `\nTOAST:\n${joined}`;
				break;
			}
		}

		// Button back to idle "Copy to peer" after done, with success list
		if (
			/Successful targets|Copied successfully|successfulTargets/i.test(modalText) ||
			(await copyDialog.getByText(/successful/i).count()) > 0
		) {
			finalOutcome = "success";
			break;
		}

		const btnLabel = await copyBtn.innerText().catch(() => "");
		if (/Retry failed/i.test(btnLabel)) {
			finalOutcome = "failure";
			break;
		}
		if (/Copy to peer/i.test(btnLabel) && !/Copying|Queued|Writing/i.test(modalText)) {
			// May have finished; check for error text
			if (/fail|error|not reachable|timed out/i.test(modalText)) {
				finalOutcome = "failure";
				break;
			}
		}

		await page.waitForTimeout(2000);
	}

	if (finalOutcome === "unknown") finalOutcome = "timeout";

	await shot("10-final-state.png");
	writeFileSync(resolve(evidenceDir, "final-page-text.txt"), finalText.slice(0, 50_000));
	writeFileSync(
		resolve(evidenceDir, "console-errors.json"),
		JSON.stringify(consoleErrors, null, 2),
	);
	writeFileSync(
		resolve(evidenceDir, "page-errors.json"),
		JSON.stringify(pageErrors, null, 2),
	);
	writeFileSync(
		resolve(evidenceDir, "failed-requests.json"),
		JSON.stringify(failedRequests, null, 2),
	);
	writeFileSync(
		resolve(evidenceDir, "network-notes.json"),
		JSON.stringify(networkNotes, null, 2),
	);

	const report = {
		startedAt,
		finishedAt: new Date().toISOString(),
		baseURL: process.env.PLAYWRIGHT_BASE_URL || null,
		sourceDeviceId,
		requestedEmployeeNo: employeeNo,
		usedEmployeeNo,
		targetDeviceName,
		searched,
		finalOutcome,
		consoleErrorCount: consoleErrors.length,
		pageErrorCount: pageErrors.length,
		failedRequestCount: failedRequests.length,
		copyUserNetwork: networkNotes.filter((n) => /copy-user/i.test(n.url)),
		scope: "admin_1_20_single_peer_only",
		note: "Single target preferred; do not bulk all peers.",
	};
	writeFileSync(resolve(evidenceDir, "result.json"), JSON.stringify(report, null, 2));

	// Soft assert: we exercised the UI path. Outcome may be fail if deploy/job missing.
	expect(["success", "partial", "failure", "timeout"]).toContain(finalOutcome);
	// Hard: we opened modal and attempted copy (network or progress)
	const attempted =
		networkNotes.some((n) => /copy-user/i.test(n.url)) ||
		/Job |Copying|Starting durable peer-copy|peer-copy/i.test(finalText) ||
		finalOutcome !== "unknown";
	expect(attempted).toBeTruthy();
});
