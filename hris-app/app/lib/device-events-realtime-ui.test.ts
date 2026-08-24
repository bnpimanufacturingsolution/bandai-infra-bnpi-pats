import { describe, expect, it } from "vitest";
import {
	getDeviceEventsRealtimeStatus,
	getHighlightedSavedDeviceEventId,
	getSavedDeviceEventProcessingLabel,
	getSavedDeviceEventRealtimeBadge,
	prependRealtimeSavedRow,
	prependRealtimeSavedRows,
	resolveActiveSavedDeviceEvent,
	savedDeviceEventMatchesScope,
	selectWatcherHeadlineEvent,
	shouldRefreshSavedEventsAfterSocketEvent,
} from "./device-events-realtime-ui";

describe("device events realtime UI", () => {
	it("shows an active listening state when the socket is connected and scoped", () => {
		const status = getDeviceEventsRealtimeStatus({
			isConnected: true,
			organizationId: "org-1",
			liveDeviceId: null,
			deviceId: "all",
		});

		expect(status).to.include({
			isListening: true,
			scopeLabel: "All devices",
			statusLabel: "Saved-row updates on",
			rowUpdateLabel: "Saved rows update live",
		});
	});

	it("distinguishes a connected socket from a joined realtime device-events room", () => {
		const status = getDeviceEventsRealtimeStatus({
			isConnected: true,
			organizationId: null,
			liveDeviceId: null,
			deviceId: "all",
		});

		expect(status).to.include({
			isListening: false,
			isScoped: false,
			scopeLabel: "All devices",
			statusLabel: "Socket connected",
			rowUpdateLabel: "Refresh needed",
		});
	});

	it("treats a URL-selected device id as a scoped realtime room before devices finish loading", () => {
		const status = getDeviceEventsRealtimeStatus({
			isConnected: true,
			organizationId: null,
			liveDeviceId: null,
			deviceId: "device-from-url",
		});

		expect(status).to.include({
			isListening: true,
			isScoped: true,
			scopeLabel: "Selected device",
			statusLabel: "Saved-row updates on",
		});
	});

	it("marks the exact saved row that arrived through the socket", () => {
		expect(
			getSavedDeviceEventRealtimeBadge({
				viewMode: "saved",
				itemId: "event-1",
				latestRealtimeEventId: "event-1",
				highlightedSavedEventId: "event-1",
			}),
		).to.equal("Live socket");
	});

	it("labels the exact socket row as saved now when source is not the SDK listener", () => {
		expect(
			getSavedDeviceEventProcessingLabel({
				itemId: "event-1",
				latestRealtimeEventId: "event-1",
				eventTime: "2026-07-02T02:20:00.000Z",
				receivedAt: "2026-07-02T02:20:02.000Z",
			}),
		).to.equal("Saved now");
	});

	it("labels a non-listener socket row as saved now even when a source is present", () => {
		expect(
			getSavedDeviceEventProcessingLabel({
				itemId: "event-1",
				latestRealtimeEventId: "event-1",
				eventTime: "2026-07-02T02:20:00.000Z",
				receivedAt: "2026-07-02T02:20:02.000Z",
				source: "HIKVISION_CALLBACK",
			}),
		).to.equal("Saved now");
	});

	it("labels the exact SDK listener socket row as a listener save", () => {
		expect(
			getSavedDeviceEventProcessingLabel({
				itemId: "event-1",
				latestRealtimeEventId: "event-1",
				eventTime: "2026-07-02T02:20:00.000Z",
				receivedAt: "2026-07-02T02:20:02.000Z",
				source: "EN_HCNETSDK_ALARM",
			}),
		).to.equal("Listener save");
	});

	it("labels old punch times saved later as synced saves", () => {
		expect(
			getSavedDeviceEventProcessingLabel({
				itemId: "event-1",
				latestRealtimeEventId: null,
				eventTime: "2026-07-02T00:14:00.000Z",
				receivedAt: "2026-07-02T02:20:00.000Z",
			}),
		).to.equal("Synced save");
	});

	it("labels rows without a processing delay as historical punches", () => {
		expect(
			getSavedDeviceEventProcessingLabel({
				itemId: "event-1",
				latestRealtimeEventId: null,
				eventTime: "2026-07-02T02:20:00.000Z",
				receivedAt: "2026-07-02T02:20:30.000Z",
			}),
		).to.equal("Historical punch");
	});

	it("keeps realtime overlays inside the selected device and source scope", () => {
		expect(
			savedDeviceEventMatchesScope(
				{ deviceId: "hikvision-main", source: "HIKVISION_CALLBACK", status: "MATCHED" },
				{ deviceId: "hikvision-main", source: "HIKVISION_CALLBACK", status: "all" },
			),
		).to.equal(true);

		expect(
			savedDeviceEventMatchesScope(
				{ deviceId: "zkteco-1", source: "ZKTECO_EVENT", status: "MATCHED" },
				{ deviceId: "hikvision-main", source: "HIKVISION_CALLBACK", status: "all" },
			),
		).to.equal(false);
	});

	it("keeps the newest saved punch highlighted when a socket event points at an older deduped row", () => {
		expect(
			getHighlightedSavedDeviceEventId({
				latestSavedEventId: "new-event",
				latestRealtimeEventId: "older-deduped-event",
				isLatestSavedFresh: true,
			}),
		).to.equal("new-event");

		expect(
			getSavedDeviceEventRealtimeBadge({
				viewMode: "saved",
				itemId: "older-deduped-event",
				latestRealtimeEventId: "older-deduped-event",
				highlightedSavedEventId: "new-event",
			}),
		).to.equal(null);
	});

	it("does not add realtime row badges in live device-read mode", () => {
		expect(
			getSavedDeviceEventRealtimeBadge({
				viewMode: "live",
				itemId: "event-1",
				latestRealtimeEventId: "event-1",
				highlightedSavedEventId: "event-1",
			}),
		).to.equal(null);
	});

	it("prepends a realtime saved row even when the current sorted page did not include it", () => {
		const rows = [{ id: "employee-1-old" }, { id: "employee-2-old" }];
		const merged = prependRealtimeSavedRow({
			rows,
			realtimeRow: { id: "latest-socket-event" },
		});

		expect(merged.map((row) => row.id)).to.deep.equal([
			"latest-socket-event",
			"employee-1-old",
			"employee-2-old",
		]);
	});

	it("dedupes a realtime saved row that is already in the current page", () => {
		const rows = [{ id: "latest-socket-event" }, { id: "employee-1-old" }];
		const merged = prependRealtimeSavedRow({
			rows,
			realtimeRow: { id: "latest-socket-event" },
		});

		expect(merged.map((row) => row.id)).to.deep.equal([
			"latest-socket-event",
			"employee-1-old",
		]);
	});

	it("stacks multiple realtime saved rows ahead of the server page", () => {
		const rows = [{ id: "employee-1-old" }, { id: "employee-2-old" }];
		const merged = prependRealtimeSavedRows({
			rows,
			realtimeRows: [
				{ id: "tap-3" },
				{ id: "tap-2" },
				{ id: "tap-1" },
			],
		});

		expect(merged.map((row) => row.id)).to.deep.equal([
			"tap-3",
			"tap-2",
			"tap-1",
			"employee-1-old",
			"employee-2-old",
		]);
	});

	it("dedupes realtime rows against the server page while preserving socket order", () => {
		const rows = [{ id: "tap-2" }, { id: "employee-1-old" }];
		const merged = prependRealtimeSavedRows({
			rows,
			realtimeRows: [{ id: "tap-3" }, { id: "tap-2" }],
		});

		expect(merged.map((row) => row.id)).to.deep.equal([
			"tap-3",
			"tap-2",
			"employee-1-old",
		]);
	});

	it("resolves a view-event deeplink from a dedicated fetch when the row is not on this page", () => {
		const fetched = { id: "cmsr688py002xvxwwttxhdsal" };
		const active = resolveActiveSavedDeviceEvent({
			action: "view-event",
			eventId: "cmsr688py002xvxwwttxhdsal",
			pageRows: [{ id: "page-row-1" }, { id: "page-row-2" }],
			fetchedEvent: fetched,
		});
		expect(active).to.equal(fetched);
	});

	it("ignores a leftover fetched event when the deeplink id has changed", () => {
		const leftover = { id: "old-event" };
		const active = resolveActiveSavedDeviceEvent({
			action: "view-event",
			eventId: "cmsr688py002xvxwwttxhdsal",
			pageRows: [{ id: "page-row-1" }],
			fetchedEvent: leftover,
		});
		expect(active).to.equal(null);
	});

	it("prefers the current table row when the view-event id is already on the page", () => {
		const pageRow = { id: "cmsr688py002xvxwwttxhdsal" };
		const active = resolveActiveSavedDeviceEvent({
			action: "view-event",
			eventId: "cmsr688py002xvxwwttxhdsal",
			pageRows: [pageRow],
			fetchedEvent: { id: "cmsr688py002xvxwwttxhdsal" },
		});
		expect(active).to.equal(pageRow);
	});

	it("keeps the realtime overlay bounded to the requested size", () => {
		const merged = prependRealtimeSavedRows({
			rows: [{ id: "server-row" }],
			realtimeRows: [
				{ id: "tap-4" },
				{ id: "tap-3" },
				{ id: "tap-2" },
				{ id: "tap-1" },
			],
			maxRealtimeRows: 2,
		});

		expect(merged.map((row) => row.id)).to.deep.equal([
			"tap-4",
			"tap-3",
			"server-row",
		]);
	});

	it("keeps a person-bearing tap in the watcher headline when a no-person signal follows", () => {
		const selected = selectWatcherHeadlineEvent([
			{
				id: "door-close",
				deviceId: "test-a",
				eventAction: "UNKNOWN",
				employeeNo: null,
				receivedAt: "2026-07-19T14:26:45.000Z",
			},
			{
				id: "ernest-tap",
				deviceId: "test-a",
				eventAction: "TAP",
				employeeNo: "1",
				employeeName: "Ernst tey Malasa",
				receivedAt: "2026-07-19T14:26:39.000Z",
			},
		]);

		expect(selected?.id).to.equal("ernest-tap");
	});

	it("does not replace a no-person headline with an old or different-device tap", () => {
		const selected = selectWatcherHeadlineEvent([
			{
				id: "current-signal",
				deviceId: "test-a",
				eventAction: "SYNC_SIGNAL",
				receivedAt: "2026-07-19T14:26:45.000Z",
			},
			{
				id: "other-device-tap",
				deviceId: "test-b",
				eventAction: "TAP",
				employeeNo: "1",
				receivedAt: "2026-07-19T14:26:40.000Z",
			},
			{
				id: "old-test-a-tap",
				deviceId: "test-a",
				eventAction: "TAP",
				employeeNo: "1",
				receivedAt: "2026-07-19T14:20:00.000Z",
			},
		]);

		expect(selected?.id).to.equal("current-signal");
	});

	it("trusts socket-carried saved rows without forcing an immediate saved-list refetch", () => {
		expect(
			shouldRefreshSavedEventsAfterSocketEvent({
				viewMode: "saved",
				hasRealtimeEventRow: true,
			}),
		).to.equal(false);

		expect(
			shouldRefreshSavedEventsAfterSocketEvent({
				viewMode: "saved",
				hasRealtimeEventRow: false,
			}),
		).to.equal(true);

		expect(
			shouldRefreshSavedEventsAfterSocketEvent({
				viewMode: "live",
				hasRealtimeEventRow: true,
			}),
		).to.equal(true);
	});
});
