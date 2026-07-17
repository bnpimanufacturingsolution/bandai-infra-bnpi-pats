/**
 * Truthful live/enroll readiness for Device Events + Sync Center enroll.
 *
 * Important: listener "armed" alone is NOT enough. Host auth + DeviceEvent save
 * need Postgres; live taps need the VM listener path. Operators need RYG that
 * combines those gates so green means "safe to tap/enroll for realtime truth".
 */

export type ReadinessLevel = "green" | "yellow" | "red";

export type ReadinessCheck = {
	id: "database" | "liveCapture" | "eventProof";
	level: ReadinessLevel;
	ok: boolean;
	label: string;
	detail: string;
};

export type DeviceLiveReadiness = {
	checkedAt: string;
	overall: ReadinessLevel;
	headline: string;
	safeToTap: boolean;
	safeToEnroll: boolean;
	reasons: string[];
	checks: ReadinessCheck[];
	database: {
		ok: boolean;
		latencyMs: number | null;
		error: string | null;
	};
	listener: {
		running: boolean;
		armed: boolean;
		receiving: boolean;
		state: string | null;
		lastAlarmAt: string | null;
		lastPostAt: string | null;
	};
	proof: {
		lastSdkEventAt: string | null;
		ageMs: number | null;
		fresh: boolean;
		stale: boolean;
	};
};

const FRESH_PROOF_MS = 2 * 60 * 1000;
const STALE_PROOF_MS = 15 * 60 * 1000;

const ageMs = (iso: string | null | undefined, now: Date): number | null => {
	if (!iso) return null;
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return null;
	return now.getTime() - t;
};

const formatAge = (ms: number | null): string => {
	if (ms === null) return "never";
	if (ms < 60_000) return "just now";
	if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
	return `${Math.max(1, Math.round(ms / 3_600_000))}h ago`;
};

export const buildDeviceLiveReadiness = (input: {
	databaseOk: boolean;
	databaseLatencyMs?: number | null;
	databaseError?: string | null;
	listenerRunning?: boolean;
	listenerArmed?: boolean;
	listenerReceiving?: boolean;
	listenerState?: string | null;
	lastAlarmAt?: string | null;
	lastPostAt?: string | null;
	lastSdkEventAt?: string | null;
	now?: Date;
}): DeviceLiveReadiness => {
	const now = input.now || new Date();
	const databaseOk = Boolean(input.databaseOk);
	const databaseLatencyMs =
		typeof input.databaseLatencyMs === "number" && Number.isFinite(input.databaseLatencyMs)
			? input.databaseLatencyMs
			: null;
	const databaseError = input.databaseError ? String(input.databaseError) : null;

	const listenerRunning = Boolean(input.listenerRunning);
	const listenerReceiving = Boolean(input.listenerReceiving);
	const listenerArmed = Boolean(input.listenerArmed) || listenerReceiving;
	const lastAlarmAt = input.lastAlarmAt || null;
	const lastPostAt = input.lastPostAt || null;
	const lastSdkEventAt = input.lastSdkEventAt || lastAlarmAt || lastPostAt || null;
	const proofAge = ageMs(lastSdkEventAt, now);
	const fresh = proofAge !== null && proofAge >= -60_000 && proofAge <= FRESH_PROOF_MS;
	const stale = proofAge === null || proofAge > STALE_PROOF_MS;

	const databaseCheck: ReadinessCheck = databaseOk
		? {
				id: "database",
				level: "green",
				ok: true,
				label: "Database reachable",
				detail:
					databaseLatencyMs !== null
						? `Postgres responded in ${databaseLatencyMs}ms (host tunnel/path is up).`
						: "Postgres responded (host tunnel/path is up).",
			}
		: {
				id: "database",
				level: "red",
				ok: false,
				label: "Database unreachable",
				detail:
					databaseError ||
					"Host API cannot reach Postgres (often local tunnel port 55435). Auth and saved events will fail until restored.",
			};

	// Fresh saved SDK proof means the live path recently delivered events even if
	// the status summarizer is briefly "quiet" / not sticky-armed.
	const livePathProvenByFreshProof = listenerRunning && fresh;

	let liveCaptureCheck: ReadinessCheck;
	if (!listenerRunning) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "red",
			ok: false,
			label: "Live capture offline",
			detail: "VM Hikvision listener is not running. Taps will not stream until Restart listener succeeds.",
		};
	} else if (listenerReceiving) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "green",
			ok: true,
			label: "Live capture receiving",
			detail: "SDK callbacks are arriving now.",
		};
	} else if (livePathProvenByFreshProof) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "green",
			ok: true,
			label: "Live path recently proved",
			detail:
				"Listener is running and a fresh SDK event was saved in HRIS — path works even if status is briefly quiet.",
		};
	} else if (listenerArmed) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "yellow",
			ok: true,
			label: "Live capture armed (quiet)",
			detail:
				"Service is armed but no callback in the last few minutes. Tap once to refresh proof.",
		};
	} else {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "red",
			ok: false,
			label: "Live capture not armed",
			detail: "Listener process may be up but device is not armed for callbacks.",
		};
	}

	let eventProofCheck: ReadinessCheck;
	if (fresh) {
		eventProofCheck = {
			id: "eventProof",
			level: "green",
			ok: true,
			label: "Fresh event proof",
			detail: `Last SDK/saved proof ${formatAge(proofAge)}.`,
		};
	} else if (!stale && lastSdkEventAt) {
		eventProofCheck = {
			id: "eventProof",
			level: "yellow",
			ok: true,
			label: "Proof getting old",
			detail: `Last proof ${formatAge(proofAge)}. Tap once to re-verify the live path before relying on enroll realtime.`,
		};
	} else {
		eventProofCheck = {
			id: "eventProof",
			level: "red",
			ok: false,
			label: "No recent event proof",
			detail: lastSdkEventAt
				? `Last proof ${formatAge(proofAge)} — too old to trust as “live is working now”.`
				: "No SDK proof in listener logs or saved events yet.",
		};
	}

	const checks = [databaseCheck, liveCaptureCheck, eventProofCheck];
	const hasRed = checks.some((c) => c.level === "red");
	const hasYellow = checks.some((c) => c.level === "yellow");

	// Safe to tap: DB up + listener running + (receiving OR fresh proof OR armed+not-stale).
	const safeToTap =
		databaseOk &&
		listenerRunning &&
		(listenerReceiving || livePathProvenByFreshProof || (listenerArmed && !stale));

	// Enroll realtime needs the same live path health (create still uses ISAPI write via API).
	const safeToEnroll = safeToTap;

	// Recompute overall after live-capture may have been upgraded by fresh proof.
	const checksFinal = [databaseCheck, liveCaptureCheck, eventProofCheck];
	const hasRedFinal = checksFinal.some((c) => c.level === "red");
	const hasYellowFinal = checksFinal.some((c) => c.level === "yellow");

	let overall: ReadinessLevel = "green";
	if (!databaseOk || hasRedFinal) overall = "red";
	else if (hasYellowFinal || !safeToTap) overall = "yellow";
	else overall = "green";

	const reasons: string[] = [];
	for (const check of checksFinal) {
		if (check.level !== "green") reasons.push(`${check.label}: ${check.detail}`);
	}
	if (safeToTap && safeToEnroll && overall === "green") {
		reasons.push("DB + live capture + recent proof are all healthy.");
	}

	let headline: string;
	if (overall === "green") {
		headline = "Safe to tap and enroll — realtime path is truthful";
	} else if (!databaseOk) {
		headline = "Not safe — database tunnel/path is down (events/auth will fail)";
	} else if (!listenerRunning) {
		headline = "Not safe for live events — restart Hikvision listener";
	} else if (stale) {
		headline = "Not fully safe yet — re-arm / tap once for fresh proof before enroll";
	} else if (!listenerArmed && !fresh) {
		headline = "Not fully safe yet — re-arm / tap once for fresh proof before enroll";
	} else {
		headline = "Partially ready — quiet armed path; confirm with a tap before critical enroll";
	}

	return {
		checkedAt: now.toISOString(),
		overall,
		headline,
		safeToTap,
		safeToEnroll,
		reasons,
		checks,
		database: {
			ok: databaseOk,
			latencyMs: databaseLatencyMs,
			error: databaseError,
		},
		listener: {
			running: listenerRunning,
			armed: listenerArmed,
			receiving: listenerReceiving,
			state: input.listenerState || null,
			lastAlarmAt,
			lastPostAt,
		},
		proof: {
			lastSdkEventAt,
			ageMs: proofAge,
			fresh,
			stale,
		},
	};
};
