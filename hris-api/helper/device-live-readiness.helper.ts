/**
 * Truthful live/enroll readiness for Device Events + Sync Center enroll.
 *
 * Green means the FULL realtime path is healthy:
 *   host Postgres + VM listener armed/receiving + VM→host callback post path
 *   (typically VM :53001 reverse → host :3001).
 *
 * ACS "receiving" alone is NOT enough for green enroll — if :53001 is down,
 * taps may never hit HRIS even while SDK alarms look alive.
 */

export type ReadinessLevel = "green" | "yellow" | "red";

export type ReadinessCheck = {
	id: "database" | "liveCapture" | "eventProof" | "callbackPost";
	level: ReadinessLevel;
	ok: boolean;
	label: string;
	detail: string;
};

export type DeviceLiveReadiness = {
	checkedAt: string;
	overall: ReadinessLevel;
	/**
	 * G1 infrastructure green: DB + listener armed/running + callback path not hard-down.
	 * True at boot without requiring a human tap. Does not mean enroll/receiving green.
	 */
	pathReady: boolean;
	/** G2 live green: receiving + post path healthy (same as overall green enroll path). */
	liveReceiving: boolean;
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
	callbackPost: {
		pathOk: boolean | null;
		lastPostAt: string | null;
		postFresh: boolean;
	};
	proof: {
		lastSdkEventAt: string | null;
		ageMs: number | null;
		fresh: boolean;
		stale: boolean;
	};
};

/** Fresh saved/alarm proof window (quiet path). */
const FRESH_PROOF_MS = 10 * 60 * 1000;
/** Stale: too old to claim current receiving proof without a re-tap. */
const STALE_PROOF_MS = 30 * 60 * 1000;
/** Successful C++ → HRIS post must be this fresh for full green enroll. */
const FRESH_POST_MS = 10 * 60 * 1000;

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
	/** VM loopback :53001 → host API reverse is healthy (curl /health). null = not probed. */
	callbackPostPathOk?: boolean | null;
	now?: Date;
}): DeviceLiveReadiness => {
	const now = input.now || new Date();
	const databaseOk = Boolean(input.databaseOk);
	const databaseLatencyMs =
		typeof input.databaseLatencyMs === "number" && Number.isFinite(input.databaseLatencyMs)
			? input.databaseLatencyMs
			: null;
	const databaseError = input.databaseError ? String(input.databaseError) : null;

	const listenerReceiving = Boolean(input.listenerReceiving);
	const listenerRunning =
		Boolean(input.listenerRunning) || listenerReceiving || Boolean(input.listenerArmed);
	const listenerArmed = Boolean(input.listenerArmed) || listenerReceiving;
	const lastAlarmAt = input.lastAlarmAt || null;
	const lastPostAt = input.lastPostAt || null;
	const lastSdkEventAt = newestIso(input.lastSdkEventAt, lastAlarmAt, lastPostAt);
	const proofAge = ageMs(lastSdkEventAt, now);
	const postAge = ageMs(lastPostAt, now);
	const postFresh =
		postAge !== null && postAge >= -60_000 && postAge <= FRESH_POST_MS;
	const callbackPostPathOk =
		input.callbackPostPathOk === undefined ? null : input.callbackPostPathOk;
	// Path healthy if reverse probe ok OR we have a recent successful post log.
	const callbackPathHealthy =
		callbackPostPathOk === true || (callbackPostPathOk !== false && postFresh);
	const callbackPathDown = callbackPostPathOk === false;
	const timedFresh =
		proofAge !== null && proofAge >= -60_000 && proofAge <= FRESH_PROOF_MS;
	const fresh =
		(timedFresh || (listenerRunning && listenerReceiving)) &&
		(callbackPathHealthy || postFresh);
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
			detail: "SDK callbacks are arriving now (receiving count >= 1).",
		};
	} else if (listenerArmed) {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "yellow",
			ok: true,
			label: "Live capture armed (not receiving)",
			detail:
				"Armed and waiting for the next physical device signal. No listener restart is needed.",
		};
	} else {
		liveCaptureCheck = {
			id: "liveCapture",
			level: "red",
			ok: false,
			label: "Live capture not armed",
			detail: "Listener process may be up but no device is armed for callbacks.",
		};
	}

	// Callback post path: C++ must reach host API via VM :53001 (or equivalent).
	let callbackPostCheck: ReadinessCheck;
	if (callbackPathDown) {
		callbackPostCheck = {
			id: "callbackPost",
			level: "red",
			ok: false,
			label: "HRIS callback path down",
			detail:
				"VM :53001 does not reach host API (reverse tunnel 53001→3001). Device signals may still appear in logs, but rows will not land in HRIS until the reverse is restored.",
		};
	} else if (postFresh) {
		callbackPostCheck = {
			id: "callbackPost",
			level: "green",
			ok: true,
			label: "HRIS callback posts OK",
			detail: `Last successful C++→HRIS post ${formatAge(postAge)}.`,
		};
	} else if (callbackPostPathOk === true) {
		callbackPostCheck = {
			id: "callbackPost",
			level: "yellow",
			ok: true,
			label: "Callback path open (no recent post)",
			detail:
				"VM :53001 health is OK, but no recent successful post log yet. Tap once to prove end-to-end save.",
		};
	} else if (lastPostAt) {
		callbackPostCheck = {
			id: "callbackPost",
			level: "yellow",
			ok: false,
			label: "HRIS callback posts stale",
			detail: `Last post ${formatAge(postAge)}. Re-check reverse 53001→3001 and restart listener if needed.`,
		};
	} else {
		callbackPostCheck = {
			id: "callbackPost",
			level: "yellow",
			ok: false,
			label: "No HRIS callback post proof",
			detail:
				"No recent hikvision_callback_post success. Ensure predev reverse 53001→host:3001 is up before trusting green.",
		};
	}

	let eventProofCheck: ReadinessCheck;
	if (listenerReceiving && listenerRunning && callbackPathHealthy && postFresh) {
		eventProofCheck = {
			id: "eventProof",
			level: "green",
			ok: true,
			label: "Live path proving now",
			detail: `SDK receiving + HRIS post fresh (last post ${formatAge(postAge)}).`,
		};
	} else if (listenerReceiving && listenerRunning && !callbackPathHealthy) {
		eventProofCheck = {
			id: "eventProof",
			level: "yellow",
			ok: false,
			label: "Device signal only — HRIS path weak",
			detail:
				"SDK is receiving on the VM, but HRIS callback post proof is missing/stale. Do not treat empty Sync Signal rows as named attendance.",
		};
	} else if (listenerReceiving && listenerRunning) {
		eventProofCheck = {
			id: "eventProof",
			level: "yellow",
			ok: true,
			label: "Receiving — await post proof",
			detail: lastSdkEventAt
				? `SDK receiving (last alarm ${formatAge(proofAge)}); need a successful post to fully green enroll.`
				: "SDK receiving; need a successful C++→HRIS post.",
		};
	} else if (timedFresh) {
		eventProofCheck = {
			id: "eventProof",
			level: "yellow",
			ok: true,
			label: "Proof recent but not receiving",
			detail: `Last proof ${formatAge(proofAge)}. The listener is quiet; tap once to refresh receiving proof.`,
		};
	} else if (!stale && lastSdkEventAt) {
		eventProofCheck = {
			id: "eventProof",
			level: "yellow",
			ok: true,
			label: "Proof getting old",
			detail: `Last proof ${formatAge(proofAge)}. Path is quiet; tap once to refresh receiving proof.`,
		};
	} else {
		eventProofCheck = {
			id: "eventProof",
			level: listenerArmed ? "yellow" : "red",
			ok: Boolean(listenerArmed),
			label: listenerArmed ? "Ready for tap proof" : "No recent event proof",
			detail: lastSdkEventAt
				? `Last proof ${formatAge(proofAge)}. Listener is armed; tap once to refresh receiving proof.`
				: listenerArmed
					? "Listener is armed; tap once to create current SDK proof."
					: "No SDK proof in listener logs or saved events yet.",
		};
	}

	// Tap: need DB + listener armed/running + not callback path hard-down. A quiet
	// armed listener is a yellow "tap to prove" state, not a red failure.
	const safeToTap =
		databaseOk &&
		listenerRunning &&
		!callbackPathDown &&
		(listenerReceiving || listenerArmed);
	// Enroll green: DB + receiving + healthy post path (probe or fresh post).
	const safeToEnroll =
		databaseOk &&
		listenerRunning &&
		listenerReceiving &&
		callbackPathHealthy &&
		(postFresh || callbackPostPathOk === true);

	// G1: infrastructure ready without requiring a human tap.
	const pathReady =
		databaseOk &&
		listenerRunning &&
		listenerArmed &&
		!callbackPathDown &&
		// Prefer explicit path probe; if not probed, still pathReady when armed+DB
		// so boot is not stuck yellow solely because pathOk was never set.
		(callbackPostPathOk === true || callbackPostPathOk === null || postFresh);

	const liveReceiving =
		listenerReceiving && callbackPathHealthy && (postFresh || callbackPostPathOk === true);

	const checksFinal = [databaseCheck, liveCaptureCheck, callbackPostCheck, eventProofCheck];
	const hasRedFinal = checksFinal.some((c) => c.level === "red");
	const allGreen = checksFinal.every((c) => c.level === "green");

	let overall: ReadinessLevel = "yellow";
	if (!databaseOk || !listenerRunning || hasRedFinal) overall = "red";
	else if (allGreen && listenerReceiving && callbackPathHealthy) overall = "green";
	// G1 overall: services up + path not hard-down + armed quiet with path probe OK
	// is path-green (not enroll-green). Operators asked for all-green on startup when
	// services are healthy — surface that as overall green when pathReady and no reds.
	else if (pathReady && callbackPostPathOk === true && !listenerReceiving) {
		overall = "green";
	} else overall = "yellow";

	const reasons: string[] = [];
	for (const check of checksFinal) {
		if (check.level !== "green") reasons.push(`${check.label}: ${check.detail}`);
	}
	if (overall === "green" && liveReceiving) {
		reasons.push(
			"DB ok + SDK receiving + HRIS callback post path healthy — safe for realtime truth.",
		);
	} else if (overall === "green" && pathReady) {
		reasons.push(
			"Path ready at boot: DB + listener armed + callback path open. Tap once for live receiving / enroll green.",
		);
	}

	let headline: string;
	if (overall === "green" && liveReceiving) {
		headline = "Safe to tap and enroll — live path is receiving and posting";
	} else if (overall === "green" && pathReady) {
		headline =
			"Services path green — listener armed, callback path open (tap once for live receiving)";
	} else if (!databaseOk) {
		headline = "Not safe — database tunnel/path is down (events/auth will fail)";
	} else if (callbackPathDown) {
		headline = "Not safe — VM:53001 callback reverse is down (posts cannot reach host API)";
	} else if (!listenerRunning) {
		headline = "Not safe for live events — restart Hikvision listener";
	} else if (listenerReceiving && !callbackPathHealthy) {
		headline =
			"Device signals OK but HRIS post path weak — fix reverse 53001→3001 before trusting enroll";
	} else if (!listenerReceiving && listenerArmed) {
		headline = "Ready for tap proof — listener armed, waiting for a fresh tap";
	} else if (stale && listenerArmed) {
		headline = "Ready for tap proof — listener armed, waiting for a fresh tap";
	} else if (stale) {
		headline = "Not fully safe yet — restart listener or tap once for fresh proof";
	} else {
		headline = "Partially ready — need receiving + successful HRIS post before full green";
	}

	return {
		checkedAt: now.toISOString(),
		overall,
		pathReady,
		liveReceiving,
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
		callbackPost: {
			pathOk: callbackPostPathOk,
			lastPostAt,
			postFresh,
		},
		proof: {
			lastSdkEventAt,
			ageMs: proofAge,
			fresh,
			stale,
		},
	};
};
