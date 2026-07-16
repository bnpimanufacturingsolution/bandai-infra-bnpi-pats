import { describe, expect, it } from "vitest";
import {
	buildDeviceReachabilitySummary,
	getDeviceReachabilityLabel,
	resolveDeviceReachabilityStatus,
} from "./device-reachability";

describe("device reachability helpers", () => {
	it("maps health summary and loading states for IT-facing labels", () => {
		expect(resolveDeviceReachabilityStatus({ summaryStatus: "online" })).toBe("online");
		expect(resolveDeviceReachabilityStatus({ summaryStatus: "offline" })).toBe("offline");
		expect(resolveDeviceReachabilityStatus({ summaryStatus: "degraded" })).toBe("degraded");
		expect(resolveDeviceReachabilityStatus({ isLoading: true })).toBe("checking");
		expect(resolveDeviceReachabilityStatus({ isError: true })).toBe("unknown");
		expect(getDeviceReachabilityLabel("online")).toBe("Online");
		expect(getDeviceReachabilityLabel("offline")).toBe("Offline");
	});

	it("builds a simple online/offline summary for table and filter UI", () => {
		const online = buildDeviceReachabilitySummary({
			summaryStatus: "online",
			checkedAt: "2026-07-16T15:00:00.000Z",
		});
		expect(online.status).toBe("online");
		expect(online.label).toBe("Online");
		expect(online.detail).toMatch(/reachable/i);

		const offline = buildDeviceReachabilitySummary({
			summaryStatus: "offline",
			networkOk: false,
		});
		expect(offline.status).toBe("offline");
		expect(offline.label).toBe("Offline");
		expect(offline.detail).toMatch(/unreachable/i);
	});
});
