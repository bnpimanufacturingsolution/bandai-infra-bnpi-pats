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
			'const sort = searchParams.get("sort") || "receivedAt";',
		);
	});

	it("filters event action options by selected event category", () => {
		expect(routeSource).to.contain("EVENT_ACTIONS_BY_CATEGORY");
		expect(routeSource).to.contain("getSavedActionOptionsForCategory");
		expect(routeSource).to.contain("getSavedActionOptionsForCategory(eventCategory)");
		// Attendance must not list User created / enroll actions.
		expect(routeSource).to.contain('ATTENDANCE: ["TAP", "TAP_REJECTED"]');
		expect(routeSource).to.contain('USER_MANAGEMENT: ["USER_CREATED", "USER_UPDATED", "USER_DELETED"]');
	});

	it("opens Sync logs as a modal journey with device counts and sync status", () => {
		expect(routeSource).to.contain('next.set("action", "sync-logs")');
		expect(routeSource).to.contain('searchParams.get("debug") === "true"');
		expect(routeSource).to.contain('next.delete("debug")');
		expect(routeSource).to.contain('title="Sync device logs"');
		expect(routeSource).to.contain('title="Device sync status"');
		expect(routeSource).to.contain("useDeviceSyncPreview");
		// Unreachable peers sort last; partial readiness stays actionable.
		expect(routeSource).to.contain("Partial — some devices unreachable");
		expect(routeSource).to.contain("Ready / partial devices first");
		expect(routeSource).to.contain("setShowImportProgressModal(true)");
		expect(routeSource).to.contain("Refresh");
		expect(routeSource).to.contain("device-events-sync-preflight");
		expect(routeSource).to.contain("Sync preflight is unavailable");
		expect(routeSource).to.contain("Syncing device logs");
		expect(routeSource).to.contain("Preview only — nothing is saved until you confirm");
		expect(routeSource).to.contain("Sync ${formatCount(syncDryRunEstimate)} log");
		expect(routeSource).to.contain("targetImportCount: scopedTotal");
		expect(routeSource).to.contain("getScopedSyncWillAddBreakdown");
		expect(routeSource).to.contain("Syncing estimated unsaved logs");
		expect(routeSource).to.contain("Rows scanned this pass");
		expect(routeSource).to.contain("Preview estimate");
		expect(routeSource).to.contain("Device total");
		expect(routeSource).to.contain("No unsaved device logs found");
		expect(routeSource).to.contain("Progress is available from Sync logs.");
		expect(routeSource).not.to.contain("Progress is shown below the toolbar");
		expect(routeSource).not.to.contain("Sync in progress");
		expect(routeSource).to.contain("Will add to Device Events");
		expect(routeSource).to.contain("Event to add");
		expect(routeSource).to.contain("Already in HRIS");
		expect(routeSource).to.contain("Source proof");
		expect(routeSource).to.contain("Business area");
		expect(routeSource).to.contain("Where to find it");
		expect(routeSource).to.contain("Nothing is saved yet. This preview shows what HRIS can add to Device Events after you confirm.");
		expect(routeSource).to.contain("Rows scanned this pass");
		expect(routeSource).to.contain("Saved to HRIS");
		expect(routeSource).to.contain("Sync scans device source logs, then classifies each row against HRIS.");
		expect(routeSource).not.to.contain("Missing saved");
		expect(routeSource).not.to.contain("Checking for missing device logs");
		expect(routeSource).to.contain("Ready source checks");
		expect(routeSource).to.contain("syncReadySourceChecks");
		expect(routeSource).to.contain("Devices ready:");
		expect(routeSource).to.contain("Already saved:");
		expect(routeSource).to.contain("deviceIsBlocked");
		expect(routeSource).to.contain("Fingerprint enrolled");
		expect(routeSource).to.contain("Operation logs");
		expect(routeSource).to.contain("Attendance/access events");
		expect(routeSource).to.contain("Sync logs");
		// One compact single-line table: short Category tokens (ENROLLMENT / USER MGMT / …).
		expect(routeSource).to.contain('data-testid="sync-logs-event-table"');
		expect(routeSource).to.contain("getSyncCategoryToken");
		expect(routeSource).to.contain("sortSyncEventRows");
		expect(routeSource).to.contain("getSyncEventLabelCompact");
		// Sync must let admins choose attendance vs user/enrollment and a time window.
		expect(routeSource).to.contain('data-testid="sync-logs-scope-controls"');
		expect(routeSource).to.contain('data-testid="sync-include-attendance"');
		expect(routeSource).to.contain('data-testid="sync-include-operations"');
		expect(routeSource).to.contain('data-testid="sync-time-window"');
		expect(routeSource).to.contain("getScopedSyncWillAddBreakdown");
		expect(routeSource).to.contain("targetOperationsCount");
		expect(routeSource).to.contain("User &amp; enrollment activity");
		expect(routeSource).to.contain("Attendance taps");
		// Opaque Hikvision person tokens must not show as "No. base64…".
		expect(routeSource).to.contain("isOpaqueDevicePersonToken");
		expect(routeSource).to.contain("formatDeviceEventPersonRef");
		expect(routeSource).to.contain("Device person token (not a readable employee no.)");
		expect(routeSource).to.contain("Rows scanned this pass");
		expect(routeSource).to.contain("Preview estimate");
		expect(routeSource).to.contain(">Event</th>");
		expect(routeSource).to.contain(">Business area</th>");
		expect(routeSource).to.contain(">Will add</th>");
		expect(routeSource).to.contain(">Saved</th>");
		expect(routeSource).to.contain(">Status</th>");
		expect(routeSource).to.contain("ENROLLMENT");
		expect(routeSource).to.contain("USER MGMT");
		expect(routeSource).not.to.contain(">Where to find it</th>");
		expect(routeSource).not.to.contain(">Already saved</th>");
		expect(routeSource).not.to.contain(">Source proof</th>");
		expect(routeSource).not.to.contain(">Filter after sync</th>");
		expect(routeSource).not.to.contain("groupSyncRowsByBusinessArea");
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

	it("keeps raw runtime detail in the drawer while exposing operational evidence in the table", () => {
		expect(routeSource).not.to.contain('label: "Source",');
		expect(routeSource).to.contain('label: "Evidence"');
		expect(routeSource).to.contain('label: "Confidence"');
		expect(routeSource).to.contain('next.set("action", "view-event")');
		expect(routeSource).to.contain("formatEventSource(activeEvent.source)");
		expect(routeSource).to.contain("formatEventSourceDetail(activeEvent.source)");
	});

	it("uses human event and HRIS result language instead of raw source/status labels", () => {
		expect(routeSource).to.contain("Device events");
		expect(routeSource).to.contain("Any event category");
		expect(routeSource).to.contain("Any event action");
		expect(routeSource).to.contain('label: "Category"');
		expect(routeSource).to.contain('label: "Action"');
		expect(routeSource).to.contain('label: "HRIS result"');
		expect(routeSource).to.contain("event.taxonomy?.eventLabel");
		expect(routeSource).to.contain("activeEvent.eventLabel");
		expect(routeSource).to.contain("activeEvent.eventCategory");
		expect(routeSource).to.contain("activeEvent.eventAction");
		expect(routeSource).to.contain("activeEvent.capabilityConfidence");
		// Misleading advanced filters removed from the toolbar (runtime path / HRIS result / evidence / confidence).
		expect(routeSource).to.not.contain('label: "Runtime path"');
		expect(routeSource).to.not.contain('label: "Evidence source"');
		expect(routeSource).to.not.contain('placeholder="Confidence"');
		expect(routeSource).to.contain("Hikvision SDK listener");
		expect(routeSource).to.contain("ZKTeco Linux bridge");
		expect(routeSource).to.contain('title="Device event details"');
		expect(routeSource).to.not.contain("Device attendance");
		expect(routeSource).to.not.contain("Punch details");
		expect(routeSource).to.not.contain("All statuses");
		expect(routeSource).to.not.contain("All sources");
	});

	it("keeps device runtime fields scoped to the device form runtime tab", () => {
		const manageSource = readFileSync(
			resolve(currentDir, "../routes/admin/devices/manage.tsx"),
			"utf8",
		);

		expect(manageSource).to.contain("Device vendor");
		expect(manageSource).to.contain("HRIS applies the correct runtime settings automatically.");
		expect(manageSource).to.contain("Runtime config");
		expect(manageSource).to.contain("Runtime path");
		expect(manageSource).to.contain("Auto local bridge");
		expect(manageSource).to.contain("Direct device only");
		expect(manageSource).to.contain("buildHikvisionRuntimeConfig");
		expect(manageSource).to.contain('data-field-path="config.vendor"');
		expect(manageSource).not.to.contain("Runtime adapter *");
		expect(manageSource).not.to.contain("Callback path");
		expect(manageSource).not.to.contain("Internal adapter key");
		expect(manageSource).not.to.contain("Vendor and runtime routing");
		expect(manageSource).not.to.contain("Source adapter *");
		expect(manageSource).not.to.contain("Runtime source");
		expect(manageSource).to.contain("Checking device connection…");
		expect(manageSource).to.contain("Reading users from device…");
	});

	it("does not treat a connected socket as proof that live capture is receiving taps", () => {
		expect(routeSource).to.contain("isSdkAlarmSavedScope");
		expect(routeSource).to.contain("savedEventsRefetchInterval");
		expect(routeSource).to.contain("? 2_000");
		expect(routeSource).to.contain("Browser online · no new live events");
		expect(routeSource).to.contain("Live capture has recent event proof.");
		expect(routeSource).to.contain("Live capture running · waiting for first tap");
		expect(routeSource).to.contain("Ready for tap proof");
		expect(routeSource).to.contain("Reachability is separate from listener armed state and tap proof.");
		expect(routeSource).to.contain("useDeviceHealthMap");
		expect(routeSource).to.contain("quick: true");
		expect(routeSource).not.to.contain("Socket connected, SDK idle");
		// Primary badges/banners must not lead with VM jargon.
		expect(routeSource).not.to.contain("VM listener unknown");
		expect(routeSource).not.to.contain("VM listener stopped");
		expect(routeSource).not.to.contain("Checking VM listener");
		expect(routeSource).not.to.contain("VM listener status unavailable");
	});

	it("renders saved DeviceEvent rows only and keeps practical toolbar filters only", () => {
		expect(routeSource).to.contain('const viewMode = "saved" as EventViewMode');
		expect(routeSource).to.contain("The operational ledger renders only persisted DeviceEvent rows");
		// Practical filters remain available in the toolbar.
		expect(routeSource).to.contain('setFilter("deviceId", value)');
		expect(routeSource).to.contain('setFilter("window", value)');
		// Category uses updateSearchParams so mismatched action is cleared in one URL write.
		expect(routeSource).to.contain('next.set("eventCategory", value)');
		expect(routeSource).to.contain('next.set("eventAction", value)');
		// Advanced/internal filters were removed from the toolbar because they mislead operators.
		expect(routeSource).not.to.contain('setFilter("source", value)');
		expect(routeSource).not.to.contain('setFilter("status", value)');
		expect(routeSource).not.to.contain('setFilter("evidenceSource", value)');
		expect(routeSource).not.to.contain('setFilter("eventConfidence", value)');
		expect(routeSource).to.contain("Saved event ledger");
		expect(routeSource).not.to.contain("Current inventory");
		expect(routeSource).not.to.contain("Needs reverify");
		expect(routeSource).to.contain("Will add to Device Events");
		expect(routeSource).to.contain("Activity in selected window");
		expect(routeSource).to.contain("Raw payload");
		expect(routeSource).to.contain("FACE_ENROLLED");
		expect(routeSource).not.to.contain('const viewMode = (searchParams.get("view")');
		expect(routeSource).to.contain("Loading saved events…");
	});

	it("lets admin recover the live capture listener from the saved SDK view", () => {
		expect(routeSource).to.contain("useHikvisionListenerStatus");
		expect(routeSource).to.contain("useControlHikvisionListener");
		expect(routeSource).to.contain('action === "listener-control"');
		expect(routeSource).to.contain('next.set("action", "listener-control")');
		// Listener modal must fetch even when opened, and not blank on refresh.
		expect(routeSource).to.contain('viewMode === "saved" && isSdkAlarmSavedScope');
		expect(routeSource).to.contain(
			"isHikvisionListenerStatusPending && !hikvisionListenerStatus",
		);
		expect(routeSource).to.contain("SDK via reverse tunnel");
		expect(routeSource).to.contain("configuredAddress");
		expect(routeSource).to.contain('title="Hikvision listener"');
		expect(routeSource).to.contain("Live capture receiving taps");
		expect(routeSource).to.contain("Live capture running · waiting for first tap");
		expect(routeSource).to.contain("Live capture stopped");
		expect(routeSource).to.contain("Service enabled");
		expect(routeSource).to.contain("SDK state");
		expect(routeSource).to.contain("Last callback");
		expect(routeSource).to.contain("Check status");
		expect(routeSource).to.contain("Start listener");
		expect(routeSource).to.contain("Restart listener");
		expect(routeSource).to.contain('runHikvisionListenerControl(checked ? "start" : "stop")');
		expect(routeSource).to.contain("refetchHikvisionListenerStatus");
		expect(routeSource).to.contain("Recent listener log");
		expect(routeSource).to.contain("No recent SDK event saved");
	});

	it("keeps shared modals accessible by their visible title", () => {
		expect(modalSource).to.contain("React.useId()");
		expect(modalSource).to.contain("aria-labelledby={title ? titleId : undefined}");
		expect(modalSource).to.contain("aria-describedby={description ? descriptionId : undefined}");
	});
});
