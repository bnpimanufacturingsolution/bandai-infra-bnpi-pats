import type {
	DeviceLiveReadiness,
	DeviceLiveReadinessLevel,
	HikvisionListenerStatus,
} from "~/services/devices.service";
import { buildDeviceLiveReadiness } from "./device-live-readiness-shared";

/**
 * Build readiness from endpoints that already work on this host:
 * - authenticated events list (proves DB + auth)
 * - hikvision listener status (proves VM live capture)
 *
 * Avoids depending on a new API route that can be swallowed by /device/:id.
 */
export function buildClientDeviceLiveReadiness(input: {
	databaseOk: boolean;
	databaseLatencyMs?: number | null;
	databaseError?: string | null;
	listener?: HikvisionListenerStatus | null;
	listenerError?: string | null;
	lastSdkEventAt?: string | null;
	now?: Date;
}): DeviceLiveReadiness {
	const listener = input.listener;
	return buildDeviceLiveReadiness({
		databaseOk: input.databaseOk,
		databaseLatencyMs: input.databaseLatencyMs,
		databaseError: input.databaseError,
		listenerRunning: Boolean(listener?.running),
		listenerArmed: Boolean(listener?.sdk?.armed),
		listenerReceiving: Boolean(listener?.sdk?.receivingCallbacks),
		listenerState: listener?.sdk?.state || listener?.status || null,
		lastAlarmAt: listener?.sdk?.lastAlarmAt || null,
		lastPostAt: listener?.sdk?.lastPostAt || null,
		lastSdkEventAt:
			input.lastSdkEventAt || listener?.sdk?.lastAlarmAt || listener?.sdk?.lastPostAt || null,
		now: input.now,
	}) as DeviceLiveReadiness;
}

export type { DeviceLiveReadinessLevel };
