import { describe, expect, it } from "vitest";
import {
	getDeviceEventsRealtimeStatus,
	getHighlightedSavedDeviceEventId,
	getSavedDeviceEventRealtimeBadge,
	prependRealtimeSavedRow,
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
});
