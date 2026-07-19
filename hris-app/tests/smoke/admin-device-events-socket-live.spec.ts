import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Agent-owned proof: Device Events is socket-first.
 * 1) Real websocket connects after login
 * 2) Synthetic device-event:saved inject updates the table WITHOUT page.reload
 */
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const evidenceDir = resolve(
	process.env.DEVICE_SOCKET_PLAYWRIGHT_EVIDENCE_DIR ||
		`../.runtime/device-events-socket-playwright-${stamp}`,
);

test.describe("Device Events socket-first live path", () => {
	test("login → socket connect → inject device-event:saved → row appears without hard refresh", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		mkdirSync(evidenceDir, { recursive: true });

		const consoleLogs: string[] = [];
		const consoleErrors: string[] = [];
		const wsUrls: string[] = [];
		const wsFrames: string[] = [];

		page.on("console", (message) => {
			const text = message.text();
			if (message.type() === "error") consoleErrors.push(text);
			else consoleLogs.push(text);
		});
		page.on("websocket", (ws) => {
			wsUrls.push(ws.url());
			ws.on("framereceived", (frame) => {
				const payload = frame.payload;
				if (typeof payload === "string" && payload.length < 500) {
					wsFrames.push(payload);
				}
			});
		});

		// 1) Login
		await page.goto("/auth/login");
		await page
			.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")
			.fill("admin@bandai.local");
		await page.getByPlaceholder("Enter your password").fill("password123");
		await page.getByRole("button", { name: "Sign In" }).click();
		await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
			timeout: 45_000,
		});

		// 2) Device events saved view
		await page.goto("/admin/configuration/devices/events?view=saved");
		await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible({
			timeout: 30_000,
		});

		// 3) Wait for the HRIS device-events socket. A Vite/HMR websocket is not
		// proof that the page joined the device-events room.
		await expect
			.poll(
				async () => {
					const fromHook = await page.evaluate(() => {
						const fn = (window as any).__ptSocketConnected;
						const inject = (window as any).__ptInjectDeviceEventSaved;
						return typeof fn === "function" && typeof inject === "function"
							? Boolean(fn())
							: false;
					});
					return fromHook;
				},
				{ timeout: 30_000 },
			)
			.toBe(true);

		await page.screenshot({
			path: resolve(evidenceDir, "01-events-socket-ready.png"),
			fullPage: true,
		});

		const room = await page.evaluate(() => (window as any).__ptDeviceEventsRoom || null);
		const injectReady = await page.evaluate(
			() => typeof (window as any).__ptInjectDeviceEventSaved === "function",
		);
		expect(injectReady, "DEV inject hook must be present on Device Events").toBe(true);

		// 4) Capture table text before inject
		const beforeText = await page.locator("body").innerText();
		const markerId = `pw-socket-${Date.now()}`;
		const markerLabel = `PW_SOCKET_TAP_${Date.now().toString(36).toUpperCase()}`;
		const nowIso = new Date().toISOString();

		// 5) Inject synthetic device-event:saved (same handler as real socket)
		const injected = await page.evaluate(
			({ markerId: id, markerLabel: label, nowIso: when, roomInfo }) => {
				const inject = (window as any).__ptInjectDeviceEventSaved;
				if (typeof inject !== "function") return { ok: false, reason: "no_hook" };
				inject({
					eventId: id,
					organizationId: roomInfo?.organizationId || null,
					deviceId: roomInfo?.deviceId || null,
					status: "UNMATCHED",
					source: "EN_HCNETSDK_ALARM",
					eventTime: when,
					receivedAt: when,
					emittedAt: when,
					event: {
						id: id,
						organizationId: roomInfo?.organizationId || null,
						deviceId: roomInfo?.deviceId || null,
						device: {
							id: roomInfo?.deviceId || null,
							name: "TEST A",
							address: "192.168.254.189",
						},
						employee: null,
						employeeId: null,
						attendanceId: null,
						eventTime: when,
						receivedAt: when,
						employeeNo: label,
						source: "EN_HCNETSDK_ALARM",
						status: "UNMATCHED",
						eventType: "ATTENDANCE",
						eventCategory: "ATTENDANCE",
						eventAction: "TAP",
						eventLabel: "Attendance tap",
						eventConfidence: "DIRECT",
						major: "5",
						minor: "75",
						doorNo: "1",
						verifyMode: null,
						dedupeKey: id,
						payload: {
							playwright: true,
							marker: label,
							resolvedDisplayName: "ernest T571774",
						},
						errorMessage: null,
						createdAt: when,
						updatedAt: when,
					},
				});
				return { ok: true };
			},
			{ markerId, markerLabel, nowIso, roomInfo: room },
		);
		expect(injected.ok, "inject must succeed").toBe(true);

		// 6) Row must appear WITHOUT page.reload()
		await expect(page.getByText(markerLabel, { exact: false }).first()).toBeVisible({
			timeout: 10_000,
		});
		// Prefer TAP label if rendered
		await expect(page.getByText(/TAP|Attendance tap|Attendance/i).first()).toBeVisible({
			timeout: 5_000,
		});

		// One physical tap can emit a later controller/open/close row without a
		// person id. That evidence stays in the ledger, but must not replace the
		// person-bearing attendance tap in the watcher headline.
		const followupSignalId = `pw-signal-${Date.now()}`;
		const followupIso = new Date(Date.now() + 5_000).toISOString();
		await page.evaluate(
			({ id, when, roomInfo }) => {
				const inject = (window as any).__ptInjectDeviceEventSaved;
				inject({
					eventId: id,
					organizationId: roomInfo?.organizationId || null,
					deviceId: roomInfo?.deviceId || null,
					status: "IGNORED",
					source: "EN_HCNETSDK_ALARM",
					eventTime: when,
					receivedAt: when,
					emittedAt: when,
					event: {
						id,
						organizationId: roomInfo?.organizationId || null,
						deviceId: roomInfo?.deviceId || null,
						device: {
							id: roomInfo?.deviceId || null,
							name: "TEST A",
							address: "192.168.254.189",
						},
						employee: null,
						employeeId: null,
						attendanceId: null,
						eventTime: when,
						receivedAt: when,
						employeeNo: null,
						source: "EN_HCNETSDK_ALARM",
						status: "IGNORED",
						eventType: null,
						eventCategory: "UNKNOWN_VENDOR",
						eventAction: "UNKNOWN",
						eventLabel: "Access controller event",
						eventConfidence: "DIRECT",
						major: "5",
						minor: "22",
						doorNo: "1",
						verifyMode: null,
						dedupeKey: id,
						payload: { playwright: true, identitySource: "empty" },
						errorMessage: null,
						createdAt: when,
						updatedAt: when,
					},
				});
			},
			{ id: followupSignalId, when: followupIso, roomInfo: room },
		);

		const watcherHeadline = page.getByRole("button", {
			name: "Show latest saved event row",
		});
		await expect(watcherHeadline).toContainText("ernest T571774");
		await expect(watcherHeadline).toContainText("Attendance tap received");

		const afterText = await page.locator("body").innerText();
		expect(afterText.includes(markerLabel), "marker must be in DOM after inject").toBe(true);
		expect(beforeText.includes(markerLabel), "marker must not exist before inject").toBe(
			false,
		);

		// Prove we never reloaded
		expect(page.url()).toContain("/admin/configuration/devices/events");

		await page.screenshot({
			path: resolve(evidenceDir, "02-socket-inject-row-visible.png"),
			fullPage: true,
		});

		const summary = {
			stamp,
			url: page.url(),
			socket: {
				wsUrls,
				consoleConnected: consoleLogs.some((l) => /Socket connected/i.test(l)),
				hookConnected: await page.evaluate(() => {
					const fn = (window as any).__ptSocketConnected;
					return typeof fn === "function" ? Boolean(fn()) : null;
				}),
				room,
			},
			inject: {
				markerId,
				markerLabel,
				rowVisibleWithoutReload: true,
			},
			uiSnippet: {
				hasSafeToTap: /Safe to tap/i.test(afterText),
				hasSocketLive: /Socket live|Socket connected/i.test(afterText),
				hasUpdatingFiltersSpam: /Updating filters/i.test(afterText),
			},
			pass: true,
		};

		writeFileSync(resolve(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2));
		writeFileSync(
			resolve(evidenceDir, "console-logs.json"),
			JSON.stringify(consoleLogs.slice(-80), null, 2),
		);
		writeFileSync(
			resolve(evidenceDir, "console-errors.json"),
			JSON.stringify(consoleErrors, null, 2),
		);
		writeFileSync(resolve(evidenceDir, "ws-urls.json"), JSON.stringify(wsUrls, null, 2));
		writeFileSync(
			resolve(evidenceDir, "ws-frames-sample.json"),
			JSON.stringify(wsFrames.slice(0, 40), null, 2),
		);
		writeFileSync(resolve(evidenceDir, "page-text-after.txt"), afterText);
	});
});
