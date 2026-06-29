import { describe, expect, it } from "vitest";
import {
	getDeviceEventsRealtimeStatus,
	getSavedDeviceEventRealtimeBadge,
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
				highlightedSavedEventId: "event-2",
			}),
		).to.equal("Live socket");
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
});
