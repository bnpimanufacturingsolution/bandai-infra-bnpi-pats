import { describe, expect, it } from "vitest";
import {
	getDeviceEventsRealtimeStatus,
	getHighlightedSavedDeviceEventId,
	getSavedDeviceEventRealtimeBadge,
	prependRealtimeSavedRow,
	prependRealtimeSavedRows,
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
			scopeLabel: "All organization devices",
			statusLabel: "Realtime listening",
			rowUpdateLabel: "Live updates visible in rows",
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
			scopeLabel: "All devices",
			statusLabel: "Socket connected",
			rowUpdateLabel: "Rows update after refresh",
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
});
