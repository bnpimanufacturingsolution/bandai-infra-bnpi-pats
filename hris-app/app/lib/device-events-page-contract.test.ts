import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
	resolve(currentDir, "../routes/admin/devices/events.tsx"),
	"utf8",
);

describe("device events page UX contract", () => {
	it("defaults saved events to punch time descending so sync/backfill rows keep punch chronology", () => {
		expect(routeSource).to.contain(
			'const sort = searchParams.get("sort") || "eventTime";',
		);
	});

	it("opens Sync logs as a modal journey with device counts and sync status", () => {
		expect(routeSource).to.contain('next.set("action", "sync-logs")');
		expect(routeSource).to.contain('searchParams.get("debug") === "true"');
		expect(routeSource).to.contain('next.delete("debug")');
		expect(routeSource).to.contain('title="Sync device logs"');
		expect(routeSource).to.contain('title="Device sync status"');
		expect(routeSource).to.contain("useDeviceSyncPreview");
		expect(routeSource).to.contain("setShowImportProgressModal(true)");
		expect(routeSource).to.contain("Refresh");
		expect(routeSource).to.contain("device-events-sync-preflight");
		expect(routeSource).to.contain("Sync preflight is unavailable");
		expect(routeSource).to.contain("Syncing device logs");
		expect(routeSource).to.contain("sync reads the latest device logs first and stops after the estimate when possible.");
		expect(routeSource).to.contain("Sync ${formatCount(syncDryRunEstimate)} log");
		expect(routeSource).to.contain("targetImportCount: getSyncProjectedSaveCount(startableRow, skipMissingEmployeeNo)");
		expect(routeSource).to.contain("Syncing estimated unsaved logs");
		expect(routeSource).to.contain("Latest rows checked");
		expect(routeSource).to.contain("Target estimate");
		expect(routeSource).to.contain("Device total");
		expect(routeSource).to.contain("No unsaved device logs found");
		expect(routeSource).to.contain("Progress is available from Sync logs.");
		expect(routeSource).not.to.contain("Progress is shown below the toolbar");
		expect(routeSource).not.to.contain("Sync in progress");
		expect(routeSource).to.contain("Device logs");
		expect(routeSource).to.contain("HRIS events");
		expect(routeSource).to.contain("Estimated unsaved");
		expect(routeSource).to.contain("Will skip");
		expect(routeSource).to.contain("Source logs scanned");
		expect(routeSource).to.contain("Saved to HRIS");
		expect(routeSource).to.contain("Sync scans device source logs, then classifies each row against HRIS.");
		expect(routeSource).not.to.contain("Missing saved");
		expect(routeSource).not.to.contain("Checking for missing device logs");
		expect(routeSource).to.contain("Ready:");
		expect(routeSource).to.contain("Accordion");
		expect(routeSource).to.contain("Sync logs");
	});

	it("exposes the saved punch reset only in the admin debug sync view", () => {
		expect(routeSource).to.contain('searchParams.get("debug") === "true"');
		expect(routeSource).to.contain("canUseDebugReset");
		expect(routeSource).to.contain("Debug reset saved punches");
		expect(routeSource).to.contain("Preview reset");
		expect(routeSource).to.contain("Reset scoped data");
		expect(routeSource).to.contain("Export backup and reset");
		expect(routeSource).to.contain("Also delete linked attendance rows");
		expect(routeSource).to.contain('execute: false');
		expect(routeSource).to.contain('execute: true');
		expect(routeSource).to.contain('title="Reset scoped saved punches"');
	});

	it("does not render terminal manage deeplinks from saved rows or punch details", () => {
		expect(routeSource).not.to.contain("/admin/devices/manage/${item.deviceId}");
		expect(routeSource).not.to.contain("/admin/devices/manage/${activeEvent.deviceId}");
		expect(routeSource).to.contain("Employee record");
	});

	it("keeps source details in the event modal instead of the saved punches table", () => {
		expect(routeSource).not.to.contain('label: "Source",');
		expect(routeSource).to.contain('next.set("action", "view-event")');
		expect(routeSource).to.contain("formatEventSource(activeEvent.source)");
		expect(routeSource).to.contain("formatEventSourceDetail(activeEvent.source)");
	});

	it("does not treat a connected socket as proof that the Hikvision SDK listener is receiving taps", () => {
		expect(routeSource).to.contain("isSdkAlarmSavedScope");
		expect(routeSource).to.contain("savedEventsRefetchInterval");
		expect(routeSource).to.contain("? 2 * 1000");
		expect(routeSource).to.contain("SDK listener receiving taps");
		expect(routeSource).to.contain("SDK listener not recently proven");
		expect(routeSource).to.contain("Socket connected, SDK idle");
		expect(routeSource).to.contain("Waiting for SDK rows");
	});
});
