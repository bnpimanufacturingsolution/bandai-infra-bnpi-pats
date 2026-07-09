import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
	resolve(currentDir, "../routes/admin/devices/events.tsx"),
	"utf8",
);
const modalSource = readFileSync(
	resolve(currentDir, "../components/atoms/Modal.tsx"),
	"utf8",
);

describe("device events page UX contract", () => {
	it("defaults saved events to event time descending so sync/backfill rows keep chronology", () => {
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
		expect(routeSource).to.contain("Device logs scanned");
		expect(routeSource).to.contain("Saved to HRIS");
		expect(routeSource).to.contain("Sync scans device source logs, then classifies each row against HRIS.");
		expect(routeSource).not.to.contain("Missing saved");
		expect(routeSource).not.to.contain("Checking for missing device logs");
		expect(routeSource).to.contain("Ready:");
		expect(routeSource).to.contain("Accordion");
		expect(routeSource).to.contain("Sync logs");
	});

	it("exposes the saved event reset only in the admin debug sync view", () => {
		expect(routeSource).to.contain('searchParams.get("debug") === "true"');
		expect(routeSource).to.contain("canUseDebugReset");
		expect(routeSource).to.contain("Debug reset saved events");
		expect(routeSource).to.contain("Preview reset");
		expect(routeSource).to.contain("Reset scoped data");
		expect(routeSource).to.contain("Export backup and reset");
		expect(routeSource).to.contain("Also delete linked attendance rows");
		expect(routeSource).to.contain('execute: false');
		expect(routeSource).to.contain('execute: true');
		expect(routeSource).to.contain('title="Reset scoped saved events"');
	});

	it("does not render terminal manage deeplinks from saved rows or event details", () => {
		expect(routeSource).not.to.contain("/admin/devices/manage/${item.deviceId}");
		expect(routeSource).not.to.contain("/admin/devices/manage/${activeEvent.deviceId}");
		expect(routeSource).to.contain("Employee record");
	});

	it("keeps runtime details in the event modal instead of the saved events table", () => {
		expect(routeSource).not.to.contain('label: "Source",');
		expect(routeSource).to.contain('next.set("action", "view-event")');
		expect(routeSource).to.contain("formatEventSource(activeEvent.source)");
		expect(routeSource).to.contain("formatEventSourceDetail(activeEvent.source)");
	});

	it("uses human event and HRIS result language instead of raw source/status labels", () => {
		expect(routeSource).to.contain("Device events");
		expect(routeSource).to.contain("All event categories");
		expect(routeSource).to.contain("All event actions");
		expect(routeSource).to.contain('label: "Event"');
		expect(routeSource).to.contain('label: "HRIS result"');
		expect(routeSource).to.contain("event.taxonomy?.eventLabel");
		expect(routeSource).to.contain("activeEvent.eventLabel");
		expect(routeSource).to.contain("activeEvent.eventCategory");
		expect(routeSource).to.contain("activeEvent.eventAction");
		expect(routeSource).to.contain("activeEvent.eventConfidence");
		expect(routeSource).to.contain("All HRIS results");
		expect(routeSource).to.contain("All runtime paths");
		expect(routeSource).to.contain("Hikvision SDK listener");
		expect(routeSource).to.contain("ZKTeco Linux bridge");
		expect(routeSource).to.contain('title="Device event details"');
		expect(routeSource).to.not.contain("Device attendance");
		expect(routeSource).to.not.contain("Punch details");
		expect(routeSource).to.not.contain("All statuses");
		expect(routeSource).to.not.contain("All sources");
	});

	it("keeps device form runtime adapter copy out of raw source wording", () => {
		const manageSource = readFileSync(
			resolve(currentDir, "../routes/admin/devices/manage.tsx"),
			"utf8",
		);

		expect(manageSource).to.contain("Runtime adapter *");
		expect(manageSource).to.contain("Callback path");
		expect(manageSource).to.contain("Internal adapter key");
		expect(manageSource).not.to.contain("Source adapter *");
		expect(manageSource).not.to.contain("Runtime source");
	});

	it("does not treat a connected socket as proof that the Hikvision SDK listener is receiving taps", () => {
		expect(routeSource).to.contain("isSdkAlarmSavedScope");
		expect(routeSource).to.contain("savedEventsRefetchInterval");
		expect(routeSource).to.contain("? 2 * 1000");
		expect(routeSource).to.contain("SDK listener receiving taps");
		expect(routeSource).to.contain("VM listener running");
		expect(routeSource).to.contain("Socket connected, SDK idle");
		expect(routeSource).to.contain("Waiting for next tap");
	});

	it("lets admin recover the VM Hikvision hot-reload listener from the saved SDK view", () => {
		expect(routeSource).to.contain("useHikvisionListenerStatus");
		expect(routeSource).to.contain("useControlHikvisionListener");
		expect(routeSource).to.contain('action === "listener-control"');
		expect(routeSource).to.contain('next.set("action", "listener-control")');
		expect(routeSource).to.contain('title="Hikvision listener"');
		expect(routeSource).to.contain("VM listener running");
		expect(routeSource).to.contain("VM listener stopped");
		expect(routeSource).to.contain("Listener enabled");
		expect(routeSource).to.contain("Check status");
		expect(routeSource).to.contain("Start listener");
		expect(routeSource).to.contain("Restart listener");
		expect(routeSource).to.contain('runHikvisionListenerControl(checked ? "start" : "stop")');
		expect(routeSource).to.contain("refetchHikvisionListenerStatus");
		expect(routeSource).to.contain("Recent listener log");
		expect(routeSource).to.contain("Tap path idle");
	});

	it("keeps shared modals accessible by their visible title", () => {
		expect(modalSource).to.contain("React.useId()");
		expect(modalSource).to.contain("aria-labelledby={title ? titleId : undefined}");
		expect(modalSource).to.contain("aria-describedby={description ? descriptionId : undefined}");
	});
});
