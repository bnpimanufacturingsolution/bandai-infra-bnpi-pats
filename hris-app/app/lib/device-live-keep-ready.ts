/** Persisted across refreshes / tabs so operator does not need AI each time path goes red. */
export const DEVICE_LIVE_KEEP_READY_STORAGE_KEY = "project-truth.device-live-keep-ready";

export const readDeviceLiveKeepReady = (): boolean => {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(DEVICE_LIVE_KEEP_READY_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
};

export const writeDeviceLiveKeepReady = (on: boolean) => {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(DEVICE_LIVE_KEEP_READY_STORAGE_KEY, on ? "1" : "0");
		window.dispatchEvent(
			new CustomEvent("project-truth:device-live-keep-ready", { detail: { on } }),
		);
	} catch {
		// ignore quota / private mode
	}
};

/** Minimum delay between automatic repair attempts while a real dependency is down. */
export const DEVICE_LIVE_KEEP_READY_INTERVAL_MS = 120_000;

export type DeviceLiveKeepReadySnapshot = {
	databaseOk: boolean;
	listenerRunning: boolean;
	listenerReceiving: boolean;
	listenerArmed: boolean;
	listenerState?: string | null;
};

export type DeviceLiveKeepReadyDecision = {
	shouldRepair: boolean;
	forceReArm: boolean;
};

/** Preserve a healthy SDK attachment while it quietly waits for the next event. */
export const decideDeviceLiveKeepReadyRepair = (
	snapshot: DeviceLiveKeepReadySnapshot,
): DeviceLiveKeepReadyDecision => {
	const state = String(snapshot.listenerState || "").toLowerCase();
	const listenerFailed = !snapshot.listenerRunning || state === "login_failed";
	const listenerStable =
		snapshot.listenerRunning &&
		state !== "login_failed" &&
		(snapshot.listenerReceiving || snapshot.listenerArmed);

	if (snapshot.databaseOk && listenerStable) {
		return { shouldRepair: false, forceReArm: false };
	}

	return {
		shouldRepair: true,
		forceReArm: listenerFailed || !snapshot.listenerArmed,
	};
};
