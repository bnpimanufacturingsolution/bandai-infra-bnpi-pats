/**
 * Truthful live/enroll readiness for Device Events + Sync Center enroll.
 *
 * Important: listener "armed" alone is NOT enough. Host auth + DeviceEvent save
 * need Postgres; live taps need the VM listener path. Operators need RYG that
 * combines those gates so green means "safe to tap/enroll for realtime truth".
 *
 * Critical UX: while Live is actively receiving, overall must stay green.
 * "Proof aging" is only for quiet armed path — never demote a receiving path
 * just because the last saved row crossed a short timer.
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

/** Fresh saved/alarm proof window (quiet path). Receiving overrides this. */
const FRESH_PROOF_MS = 10 * 60 * 1000;
/** Stale: too old to trust quiet armed path without a re-tap. */
const STALE_PROOF_MS = 30 * 60 * 1000;

const ageMs = (iso: string | null | undefined, now: Date): number | null => {
	if (!iso) return null;
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return null;
	return now.getTime() - t;
};

const newestIso = (...candidates: Array<string | null | undefined>): string | null => {
	let best: string | null = null;
	let bestMs = Number.NEGATIVE_INFINITY;
	for (const c of candidates) {
		if (!c) continue;
		const t = new Date(c).getTime();
		if (!Number.isFinite(t)) continue;
		if (t > bestMs) {
			bestMs = t;
			best = c;
		}
	}
	return best;
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

	// systemd "running" can lag; recent receive/arm evidence means the path is alive.
	const listenerReceiving = Boolean(input.listenerReceiving);
	const listenerRunning =
		Boolean(input.listenerRunning) || listenerReceiving || Boolean(input.listenerArmed);
	const listenerArmed = Boolean(input.listenerArmed) || listenerReceiving;
	const lastAlarmAt = input.lastAlarmAt || null;
	const lastPostAt = input.lastPostAt || null;
	// Use newest of saved SDK row + listener alarm/post clocks (not first non-null only).
	const lastSdkEventAt = newestIso(input.lastSdkEventAt, lastAlarmAt, lastPostAt);
	const proofAge = ageMs(lastSdkEventAt, now);
	const timedFresh =
		proofAge !== null && proofAge >= -60_000 && proofAge <= FRESH_PROOF_MS;
	// Live receiving IS current proof — do not flip yellow mid-stream after a timer.
	const fresh = timedFresh || (listenerRunning && listenerReceiving);
	const stale =
		!listenerReceiving && (proofAge === null || proofAge > STALE_PROOF_MS);

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

	const livePathProvenByFreshProof = listenerRunning && timedFresh;

	let liveCaptureCheck: ReadinessCheck;
	if (!listenerRunning) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "red",
			ok: false,
			label: "Live capture offline",
			detail:
				"VM Hikvision listener is not running. Taps will not stream until Restart listener succeeds.",
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
	if (listenerReceiving && listenerRunning) {
		eventProofCheck = {
			id: "eventProof",
			level: "green",
			ok: true,
			label: "Live path proving now",
			detail: lastSdkEventAt
				? `SDK is receiving callbacks now (last proof ${formatAge(proofAge)}).`
				: "SDK is receiving callbacks now.",
		};
	} else if (timedFresh) {
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
			detail: `Last proof ${formatAge(proofAge)}. Path is quiet — tap once if you need a fresh realtime confirmation before a critical enroll.`,
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

	const safeToTap =
		databaseOk &&
		listenerRunning &&
		(listenerReceiving || livePathProvenByFreshProof || (listenerArmed && !stale));

	const safeToEnroll = safeToTap;

	const checksFinal = [databaseCheck, liveCaptureCheck, eventProofCheck];
	const hasRedFinal = checksFinal.some((c) => c.level === "red");
	const hasYellowFinal = checksFinal.some((c) => c.level === "yellow");

	// Receiving (or fresh proof) + DB must win overall green — never yellow from aging while live.
	let overall: ReadinessLevel = "green";
	if (!databaseOk || hasRedFinal) overall = "red";
	else if (safeToTap && (listenerReceiving || timedFresh)) overall = "green";
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
		checks: checksFinal,
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
