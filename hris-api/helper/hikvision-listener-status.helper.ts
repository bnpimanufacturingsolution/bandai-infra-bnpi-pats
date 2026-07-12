export type HikvisionListenerLogEvidence = {
	receivingCallbacks: boolean;
	postingToHris: boolean;
	armed: boolean;
	lastAlarmAt: string | null;
	lastPostAt: string | null;
	lastLoginAt: string | null;
	lastLoginOk: boolean | null;
	lastLoginError: string | null;
	lastError: string | null;
	lastTargetHost: string | null;
	lastFailureReason: string | null;
	diagnosis: string | null;
	state: "receiving" | "armed" | "login_failed" | "posting_failed" | "idle" | "unknown";
};

const RECENT_LISTENER_EVIDENCE_MS = 5 * 60 * 1000;

const parseJsonLine = (line: string) => {
	try {
		return JSON.parse(line) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const getTimestamp = (entry: Record<string, unknown>) => {
	const raw = String(entry.ts || entry.time || "").trim();
	if (!raw) return null;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isRecent = (date: Date | null, now: Date) =>
	Boolean(date && now.getTime() - date.getTime() <= RECENT_LISTENER_EVIDENCE_MS);

export const summarizeHikvisionListenerLogs = (
	lines: string[],
	now = new Date(),
): HikvisionListenerLogEvidence => {
	let lastAlarmAt: Date | null = null;
	let lastPostAt: Date | null = null;
	let lastLoginAt: Date | null = null;
	let lastLoginOk: boolean | null = null;
	let lastLoginError: string | null = null;
	let lastError: string | null = null;
	let lastTargetHost: string | null = null;
	let lastFailureReason: string | null = null;
	let sawCallbackRegisterOk = false;
	let sawPostFailure = false;

	for (const line of lines) {
		const entry = parseJsonLine(line);
		if (!entry) continue;
		const event = String(entry.event || "").trim();
		const okText = String(entry.ok ?? "").trim().toLowerCase();
		const ok = okText === "true" ? true : okText === "false" ? false : null;
		const ts = getTimestamp(entry);

		if (event === "sdk_login") {
			lastLoginAt = ts;
			lastLoginOk = ok;
			lastTargetHost = String(entry.host || entry.deviceIP || "").trim() || null;
			const errorText = String(entry.lastError || entry.error || "").trim();
			lastLoginError = ok === false ? errorText || "SDK login failed" : null;
			if (lastLoginError) lastError = lastLoginError;
		}

		if (event === "service_start_failed") {
			lastFailureReason = String(entry.reason || entry.error || "").trim() || "service_start_failed";
		}

		if (event === "sdk_callback_register" && ok !== false) {
			sawCallbackRegisterOk = true;
		}

		if (event === "acs_alarm_received") {
			lastAlarmAt = ts;
		}

		if (event === "hikvision_callback_post_result" && ok !== false) {
			lastPostAt = ts;
		}

		if ((event === "hikvision_callback_post" || event === "hikvision_callback_post_result") && ok === false) {
			sawPostFailure = true;
			lastError = String(entry.error || entry.stderr || "HRIS callback post failed").trim();
		}
	}

	const receivingCallbacks = isRecent(lastAlarmAt, now);
	const postingToHris = isRecent(lastPostAt, now);
	const armed = receivingCallbacks || (lastLoginOk === true && sawCallbackRegisterOk);
	const state = receivingCallbacks
		? "receiving"
		: armed
			? "armed"
			: lastLoginOk === false
				? "login_failed"
				: sawPostFailure
					? "posting_failed"
					: lines.length
						? "idle"
						: "unknown";
	const diagnosis =
		lastLoginOk === false
			? lastLoginError === "7"
				? lastFailureReason === "no_armed_devices"
					? `SDK login to ${lastTargetHost || "the configured device"} is failing with code 7, so the listener never arms a device. Likely device-LAN reachability or device-side login/network state is still failing. If the central VM is off-LAN, use a Linux site agent beside the device with HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api.`
					: `SDK login to ${lastTargetHost || "the configured device"} is failing with code 7. Likely device-LAN reachability or device-side login/network state is still failing.`
				: `SDK login to ${lastTargetHost || "the configured device"} failed${lastLoginError ? ` with code ${lastLoginError}` : ""}.`
			: sawPostFailure
				? "The listener is receiving device-side signals, but posting back to HRIS is failing."
				: null;

	return {
		receivingCallbacks,
		postingToHris,
		armed,
		lastAlarmAt: lastAlarmAt?.toISOString() || null,
		lastPostAt: lastPostAt?.toISOString() || null,
		lastLoginAt: lastLoginAt?.toISOString() || null,
		lastLoginOk,
		lastLoginError,
		lastError,
		lastTargetHost,
		lastFailureReason,
		diagnosis,
		state,
	};
};
