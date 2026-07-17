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

/** How often Keep ready auto-runs prove/re-arm when not green. */
export const DEVICE_LIVE_KEEP_READY_INTERVAL_MS = 45_000;
