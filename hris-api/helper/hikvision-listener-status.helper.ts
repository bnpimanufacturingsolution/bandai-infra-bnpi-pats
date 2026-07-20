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
	devices: HikvisionListenerDeviceEvidence[];
};

const RECENT_LISTENER_EVIDENCE_MS = 5 * 60 * 1000;

export type HikvisionListenerDeviceEvidence = {
	deviceId: string | null;
	name: string | null;
	host: string | null;
	sdkPort: string | null;
	lastLogAt: string | null;
	lastLoginAt: string | null;
	lastLoginOk: boolean | null;
	lastLoginError: string | null;
	armed: boolean;
	receivingCallbacks: boolean;
	postingToHris: boolean;
	lastAlarmAt: string | null;
	lastPostAt: string | null;
	lastFailureReason: string | null;
	state: "receiving" | "armed" | "login_failed" | "posting_failed" | "idle" | "unknown";
};

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

const toIso = (date: Date | null) => date?.toISOString() || null;

const getEntryDeviceKey = (entry: Record<string, unknown>) => {
	const id = String(entry.deviceId || entry.sourceDeviceId || "").trim();
	if (id) return `id:${id}`;
	const host = String(entry.host || entry.sourceHost || entry.deviceIP || "").trim();
	if (host) return `host:${host}`;
	return null;
};

const getOrCreateDeviceEvidence = (
	devicesByKey: Map<string, HikvisionListenerDeviceEvidence & { _lastAlarmAt?: Date | null; _lastPostAt?: Date | null }>,
	key: string,
) => {
	let device = devicesByKey.get(key);
	if (!device) {
		device = {
			deviceId: null,
			name: null,
			host: null,
			sdkPort: null,
			lastLogAt: null,
			lastLoginAt: null,
			lastLoginOk: null,
			lastLoginError: null,
			armed: false,
			receivingCallbacks: false,
			postingToHris: false,
			lastAlarmAt: null,
			lastPostAt: null,
			lastFailureReason: null,
			state: "unknown",
			_lastAlarmAt: null,
			_lastPostAt: null,
		};
		devicesByKey.set(key, device);
	}
	return device;
};

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
	const devicesByKey = new Map<
		string,
		HikvisionListenerDeviceEvidence & { _lastAlarmAt?: Date | null; _lastPostAt?: Date | null }
	>();

	for (const line of lines) {
		const entry = parseJsonLine(line);
		if (!entry) continue;
		const event = String(entry.event || "").trim();
		const okText = String(entry.ok ?? "").trim().toLowerCase();
		const ok = okText === "true" ? true : okText === "false" ? false : null;
		const ts = getTimestamp(entry);
		const deviceKey = getEntryDeviceKey(entry);
		const device = deviceKey ? getOrCreateDeviceEvidence(devicesByKey, deviceKey) : null;

		if (device) {
			// A new configuration load starts a new SDK attempt for this device. Do
			// not let an armed event from an older daemon cycle mask a current login
			// failure when the evidence window contains more than one cycle.
			if (event === "device_config_loaded") {
				device.lastLoginAt = null;
				device.lastLoginOk = null;
				device.lastLoginError = null;
				device.armed = false;
				device.lastFailureReason = null;
				device._lastAlarmAt = null;
				device._lastPostAt = null;
				device.lastAlarmAt = null;
				device.lastPostAt = null;
			}
			device.deviceId = String(entry.deviceId || entry.sourceDeviceId || device.deviceId || "").trim() || null;
			device.name = String(entry.deviceName || entry.name || device.name || "").trim() || null;
			device.host =
				String(entry.host || entry.sourceHost || entry.deviceIP || device.host || "").trim() || null;
			device.sdkPort = String(entry.sdkPort || device.sdkPort || "").trim() || null;
			device.lastLogAt = toIso(ts) || device.lastLogAt;
		}

		if (event === "sdk_login") {
			lastLoginAt = ts;
			lastLoginOk = ok;
			lastTargetHost = String(entry.host || entry.deviceIP || "").trim() || null;
			const errorText = String(entry.lastError || entry.error || "").trim();
			lastLoginError = ok === false ? errorText || "SDK login failed" : null;
			if (lastLoginError) lastError = lastLoginError;
			if (device) {
				device.lastLoginAt = toIso(ts);
				device.lastLoginOk = ok;
				device.lastLoginError = ok === false ? errorText || "SDK login failed" : null;
			}
		}

		if (event === "service_start_failed") {
			lastFailureReason = String(entry.reason || entry.error || "").trim() || "service_start_failed";
		}

		if (event === "device_arming_failed_after_retries" && device) {
			device.lastFailureReason =
				String(entry.reason || entry.error || "device_arming_failed_after_retries").trim() ||
				"device_arming_failed_after_retries";
		}

		if (event === "device_login_locked_backoff" && device) {
			const lockReason = "device_login_locked_backoff";
			device.lastFailureReason = lockReason;
			lastFailureReason = lockReason;
			lastError = String(entry.lastError || "153").trim();
		}

		if (event === "device_login_auth_failed_backoff" && device) {
			const authReason = "device_login_auth_failed_backoff";
			device.lastFailureReason = authReason;
			lastFailureReason = authReason;
			lastError = String(entry.lastError || "1").trim();
		}

		if (event === "sdk_callback_register" && ok !== false) {
			sawCallbackRegisterOk = true;
		}

		if ((event === "sdk_alarm_arm" || event === "device_armed") && device && ok !== false) {
			device.armed = true;
		}

		if (event === "acs_alarm_received") {
			lastAlarmAt = ts;
			if (device) {
				device._lastAlarmAt = ts;
				device.lastAlarmAt = toIso(ts);
			}
		}

		if (event === "hikvision_callback_post_result" && ok !== false) {
			lastPostAt = ts;
			if (device) {
				device._lastPostAt = ts;
				device.lastPostAt = toIso(ts);
			}
		}

		if ((event === "hikvision_callback_post" || event === "hikvision_callback_post_result") && ok === false) {
			sawPostFailure = true;
			lastError = String(entry.error || entry.stderr || "HRIS callback post failed").trim();
			if (device) {
				device.lastFailureReason = lastError;
			}
		}
	}

	const receivingCallbacks = isRecent(lastAlarmAt, now);
	const postingToHris = isRecent(lastPostAt, now);
	// "Receiving" requires a fresh alarm (5 min). "Armed" stays sticky after any
	// proven alarm/post/register in the log sample so a quiet device does not look
	// broken (0 armed / Idle) while the systemd service is still watching.
	const provenPathWithoutLoginFailure =
		lastLoginOk !== false &&
		(Boolean(lastAlarmAt) || Boolean(lastPostAt) || sawCallbackRegisterOk || lastLoginOk === true);
	const armed =
		receivingCallbacks ||
		(lastLoginOk === true && sawCallbackRegisterOk) ||
		provenPathWithoutLoginFailure;
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
				: lastLoginError === "1"
					? `SDK login to ${lastTargetHost || "the configured device"} is failing with code 1, so HRIS is backing off to avoid locking the device account. Verify the device admin credential and DEV_MANAGE/SDK access on the terminal.`
				: `SDK login to ${lastTargetHost || "the configured device"} failed${lastLoginError ? ` with code ${lastLoginError}` : ""}.`
			: sawPostFailure
				? "The listener is receiving device-side signals, but posting back to HRIS is failing."
				: null;
	const devices = Array.from(devicesByKey.values())
		.map((device) => {
			const deviceReceivingCallbacks = isRecent(device._lastAlarmAt || null, now);
			const devicePostingToHris = isRecent(device._lastPostAt || null, now);
			const deviceProven =
				device.lastLoginOk !== false &&
				(Boolean(device._lastAlarmAt) ||
					Boolean(device._lastPostAt) ||
					device.armed ||
					device.lastLoginOk === true);
			// Keep armed sticky after a quiet gap so per-device rows do not flip to
			// "0 armed / Idle" while the VM listener is still watching the terminal.
			const deviceArmed = deviceReceivingCallbacks || device.armed || deviceProven;
			const deviceState: HikvisionListenerDeviceEvidence["state"] = deviceReceivingCallbacks
				? "receiving"
				: deviceArmed
					? "armed"
					: device.lastLoginOk === false
						? "login_failed"
						: device.lastFailureReason
							? "posting_failed"
							: device.lastLogAt
								? "idle"
								: "unknown";
			const { _lastAlarmAt, _lastPostAt, ...publicDevice } = device;
			return {
				...publicDevice,
				armed: deviceArmed,
				receivingCallbacks: deviceReceivingCallbacks,
				postingToHris: devicePostingToHris,
				state: deviceState,
			};
		})
		.sort((a, b) => {
			const aHot = a.receivingCallbacks ? 0 : a.armed ? 1 : a.state === "login_failed" ? 2 : 3;
			const bHot = b.receivingCallbacks ? 0 : b.armed ? 1 : b.state === "login_failed" ? 2 : 3;
			if (aHot !== bHot) return aHot - bHot;
			return String(a.name || a.host || "").localeCompare(String(b.name || b.host || ""));
		});

	// Overall truth is the BEST live device, not the last log line.
	// 1 receiving + 6 login_failed (LAN) must be overall "receiving", not "login_failed".
	const anyDeviceReceiving = devices.some((d) => d.receivingCallbacks);
	const anyDeviceArmed = devices.some((d) => d.armed && d.state !== "login_failed");
	const loginFailedCount = devices.filter((d) => d.state === "login_failed").length;
	const overallReceiving = receivingCallbacks || anyDeviceReceiving;
	const overallArmed = overallReceiving || armed || anyDeviceArmed;
	const overallState: HikvisionListenerLogEvidence["state"] = overallReceiving
		? "receiving"
		: overallArmed
			? "armed"
			: lastLoginOk === false || loginFailedCount > 0
				? "login_failed"
				: sawPostFailure
					? "posting_failed"
					: lines.length
						? "idle"
						: "unknown";
	const overallDiagnosis =
		overallReceiving || overallArmed
			? loginFailedCount > 0
				? `${loginFailedCount} other device(s) SDK login failed (often off-LAN). Live path uses the receiving/armed device(s) — not those failures.`
				: null
			: diagnosis;

	return {
		receivingCallbacks: overallReceiving,
		postingToHris,
		armed: overallArmed,
		lastAlarmAt: lastAlarmAt?.toISOString() || null,
		lastPostAt: lastPostAt?.toISOString() || null,
		lastLoginAt: lastLoginAt?.toISOString() || null,
		lastLoginOk,
		lastLoginError,
		lastError,
		lastTargetHost,
		lastFailureReason,
		diagnosis: overallDiagnosis,
		state: overallState,
		devices,
	};
};
