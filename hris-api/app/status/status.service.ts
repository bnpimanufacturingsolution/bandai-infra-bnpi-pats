import { PrismaClient } from "../../generated/prisma";
import { config } from "../../config/config";
import fs from "fs";
import path from "path";
import {
	ModuleStatus,
	ModuleStatusItem,
	ModuleUptime,
	StatusIncident,
	StatusIncidentHistoryFilters,
	StatusIncidentHistoryItem,
	StatusTimelineInterval,
	StatusTimelineItem,
	StatusPayload,
} from "./status.types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 7 * DAY_MS;
const REDIS_STATUS_SNAPSHOTS_KEY = "status:snapshots:v1";
const REDIS_STATUS_INCIDENTS_KEY = "status:incidents:v1";
const REDIS_RUNTIME_FAILURES_KEY = "status:runtime-failures:v1";
const REDIS_HTTP_EVENTS_KEY = "status:http-events:v1";
const RUNTIME_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const HTTP_EVENT_WINDOW_MS = 30 * 60 * 1000;
const HTTP_EVENT_LIMIT = 200;
const REDIS_SYNC_INTERVAL_MS = 30 * 1000;
const MODULE_CATALOG_CACHE_MS = 5 * 60 * 1000;
const STATUS_SAMPLER_INTERVAL_MS = 30 * 1000;
const REDIS_PERSIST_LOCK_KEY = "status:persist-lock:v1";
const REDIS_PERSIST_LOCK_TTL_SECONDS = 5;
const STATUS_STATE_KEY = "global-v1";
const DB_PERSIST_FLUSH_INTERVAL_MS = 5000;
const DB_PERSIST_MIN_DEBOUNCE_MS = 1000;
const DB_PERSIST_EVENT_FLUSH_THRESHOLD = 50;

const slugUsesRedis = new Set(["cron", "notification", "device", "hikvision"]);
let moduleCatalogCache: Array<{
	name: string;
	slug: string;
	enabled: () => boolean;
	dependencies: string[];
}> | null = null;
let moduleCatalogCacheAt = 0;

const toDisplayName = (slug: string): string =>
	slug
		.replace(/-/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/\b\w/g, (c) => c.toUpperCase());

const isModuleEnabled = (slug: string): boolean => {
	if (slug === "metrics") return config.enableMetricsServices;
	if (slug === "device" || slug === "hikvision") return config.enableDeviceServices;
	return true;
};

const getModuleDependencies = (slug: string): string[] => {
	if (slug === "docs") return [];
	if (slugUsesRedis.has(slug)) return ["database", "redis"];
	return ["database"];
};

const getModuleCatalog = (): Array<{
	name: string;
	slug: string;
	enabled: () => boolean;
	dependencies: string[];
}> => {
	const now = Date.now();
	if (moduleCatalogCache && now - moduleCatalogCacheAt < MODULE_CATALOG_CACHE_MS) {
		return moduleCatalogCache;
	}

	const candidates = [
		path.resolve(process.cwd(), "app"),
		path.resolve(__dirname, ".."),
		path.resolve(__dirname, "../../app"),
	];

	for (const appDir of candidates) {
		try {
			const slugs = fs
				.readdirSync(appDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.filter((slug) => slug !== "status")
				.sort((a, b) => a.localeCompare(b));

			if (slugs.length === 0) continue;

			moduleCatalogCache = slugs.map((slug) => ({
				name: toDisplayName(slug),
				slug,
				enabled: () => isModuleEnabled(slug),
				dependencies: getModuleDependencies(slug),
			}));
			moduleCatalogCacheAt = now;
			return moduleCatalogCache;
		} catch {
			// try next candidate
		}
	}

	moduleCatalogCache = [];
	moduleCatalogCacheAt = now;
	return moduleCatalogCache;
};

export const getKnownModuleSlugs = (): string[] => getModuleCatalog().map((module) => module.slug);

type Snapshot = {
	at: number;
	moduleStatusBySlug: Record<string, ModuleStatus>;
	moduleReasonBySlug?: Record<string, string | null>;
};
type RuntimeFailure = { at: number; reason: string; statusCode: number };
type HttpEvent = { moduleSlug: string; statusCode: number; message: string; at: number };

const statusSnapshots: Snapshot[] = [];
const incidents: StatusIncident[] = [];
let hydratedFromRedis = false;
let lastRedisSyncMs = 0;
let statusSamplerTimer: NodeJS.Timeout | null = null;
let dbPersistTimer: NodeJS.Timeout | null = null;
let dbPersistIntervalTimer: NodeJS.Timeout | null = null;
let dbPersistDirty = false;
let dbPersistInFlight = false;
let dbPendingEventCount = 0;
const runtimeFailuresBySlug = new Map<string, RuntimeFailure>();
const recentHttpEvents: HttpEvent[] = [];
type IncidentTransitionType = "opened" | "resolved";
type IncidentTransition = {
	type: IncidentTransitionType;
	incident: StatusIncident;
};

const pruneSnapshots = (nowMs: number) => {
	const min = nowMs - HISTORY_RETENTION_MS;
	while (statusSnapshots.length > 0 && statusSnapshots[0].at < min) {
		statusSnapshots.shift();
	}
};

const pruneIncidents = (nowMs: number) => {
	const min = nowMs - HISTORY_RETENTION_MS;
	for (let i = incidents.length - 1; i >= 0; i -= 1) {
		const startedAtMs = new Date(incidents[i].startedAt).getTime();
		if (Number.isNaN(startedAtMs) || startedAtMs < min) {
			incidents.splice(i, 1);
		}
	}
};

const pruneRuntimeFailures = (nowMs: number) => {
	for (const [slug, failure] of runtimeFailuresBySlug.entries()) {
		if (nowMs - failure.at > RUNTIME_FAILURE_WINDOW_MS) {
			runtimeFailuresBySlug.delete(slug);
		}
	}
};

const pruneHttpEvents = (nowMs: number) => {
	const min = nowMs - HTTP_EVENT_WINDOW_MS;
	while (recentHttpEvents.length > 0 && recentHttpEvents[0].at < min) {
		recentHttpEvents.shift();
	}
	while (recentHttpEvents.length > HTTP_EVENT_LIMIT) {
		recentHttpEvents.shift();
	}
};

const mergeStateInMemory = (state: {
	snapshots?: Snapshot[];
	incidents?: StatusIncident[];
	runtimeFailures?: Array<{ slug: string; data: RuntimeFailure }>;
	httpEvents?: HttpEvent[];
}) => {
	if (Array.isArray(state.snapshots)) {
		const map = new Map<number, Snapshot>();
		for (const snapshot of statusSnapshots) map.set(snapshot.at, snapshot);
		for (const snapshot of state.snapshots) {
			if (
				typeof snapshot?.at === "number" &&
				typeof snapshot?.moduleStatusBySlug === "object" &&
				snapshot?.moduleStatusBySlug !== null
			) {
				map.set(snapshot.at, snapshot);
			}
		}
		const merged = Array.from(map.values()).sort((a, b) => a.at - b.at);
		statusSnapshots.splice(0, statusSnapshots.length, ...merged);
	}

	if (Array.isArray(state.incidents)) {
		const map = new Map<string, StatusIncident>();
		for (const incident of incidents) map.set(incident.id, incident);
		for (const incident of state.incidents) {
			if (
				typeof incident?.id === "string" &&
				typeof incident?.moduleSlug === "string" &&
				typeof incident?.startedAt === "string"
			) {
				map.set(incident.id, incident);
			}
		}
		const merged = Array.from(map.values()).sort(
			(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
		);
		incidents.splice(0, incidents.length, ...merged);
	}

	if (Array.isArray(state.runtimeFailures)) {
		const mergedFailures = new Map<string, RuntimeFailure>(runtimeFailuresBySlug.entries());
		for (const entry of state.runtimeFailures) {
			if (!entry || typeof entry.slug !== "string" || !entry.data) continue;
			const local = mergedFailures.get(entry.slug);
			if (!local || entry.data.at >= local.at) {
				mergedFailures.set(entry.slug, entry.data);
			}
		}
		runtimeFailuresBySlug.clear();
		for (const [slug, data] of mergedFailures.entries()) {
			runtimeFailuresBySlug.set(slug, data);
		}
	}

	if (Array.isArray(state.httpEvents)) {
		const map = new Map<string, HttpEvent>();
		const eventKey = (event: HttpEvent) =>
			`${event.moduleSlug}|${event.statusCode}|${event.at}|${event.message}`;
		for (const event of recentHttpEvents) map.set(eventKey(event), event);
		for (const event of state.httpEvents) {
			if (
				typeof event?.moduleSlug === "string" &&
				typeof event?.statusCode === "number" &&
				typeof event?.message === "string" &&
				typeof event?.at === "number"
			) {
				map.set(eventKey(event), event);
			}
		}
		const merged = Array.from(map.values()).sort((a, b) => a.at - b.at);
		recentHttpEvents.splice(0, recentHttpEvents.length, ...merged);
	}

	const now = Date.now();
	pruneSnapshots(now);
	pruneIncidents(now);
	pruneRuntimeFailures(now);
	pruneHttpEvents(now);
};

const loadStateFromDatabase = async () => {
	try {
		const { prisma } = await import("../../config/database.js");
		const row = await (prisma as any).statusState.findUnique({
			where: { stateKey: STATUS_STATE_KEY },
		});
		if (!row) return;
		mergeStateInMemory({
			snapshots: Array.isArray(row.snapshots) ? row.snapshots : [],
			incidents: Array.isArray(row.incidents) ? row.incidents : [],
			runtimeFailures: Array.isArray(row.runtimeData) ? row.runtimeData : [],
			httpEvents: Array.isArray(row.httpEvents) ? row.httpEvents : [],
		});
	} catch {
		// best effort db fallback
	}
};

const persistStateToDatabase = async () => {
	if (dbPersistInFlight) return;
	if (!dbPersistDirty) return;
	dbPersistInFlight = true;
	try {
		const { prisma } = await import("../../config/database.js");
		const runtimeData = Array.from(runtimeFailuresBySlug.entries()).map(([slug, data]) => ({
			slug,
			data,
		}));
		await (prisma as any).statusState.upsert({
			where: { stateKey: STATUS_STATE_KEY },
			update: {
				snapshots: statusSnapshots,
				incidents,
				runtimeData,
				httpEvents: recentHttpEvents,
			},
			create: {
				stateKey: STATUS_STATE_KEY,
				snapshots: statusSnapshots,
				incidents,
				runtimeData,
				httpEvents: recentHttpEvents,
			},
		});
		dbPersistDirty = false;
		dbPendingEventCount = 0;
	} catch {
		// best effort db persistence
	} finally {
		dbPersistInFlight = false;
	}
};

const schedulePersistStateToDatabase = (eventDelta = 0) => {
	dbPersistDirty = true;
	dbPendingEventCount += Math.max(0, eventDelta);

	if (dbPendingEventCount >= DB_PERSIST_EVENT_FLUSH_THRESHOLD) {
		void persistStateToDatabase();
		return;
	}

	if (dbPersistTimer) return;
	dbPersistTimer = setTimeout(() => {
		dbPersistTimer = null;
		void persistStateToDatabase();
	}, DB_PERSIST_MIN_DEBOUNCE_MS);
};

const startDbPersistWriter = () => {
	if (dbPersistIntervalTimer) return;
	dbPersistIntervalTimer = setInterval(() => {
		void persistStateToDatabase();
	}, DB_PERSIST_FLUSH_INTERVAL_MS);
};

const hydrateFromRedisIfNeeded = async () => {
	if (hydratedFromRedis) return;

	try {
		const { redisClient } = await import("../../config/redis.js");
		const snapshots = await redisClient.getJSON<Snapshot[]>(REDIS_STATUS_SNAPSHOTS_KEY);
		const incidentList = await redisClient.getJSON<StatusIncident[]>(
			REDIS_STATUS_INCIDENTS_KEY,
		);
		const runtimeFailureList = await redisClient.getJSON<Array<{ slug: string; data: RuntimeFailure }>>(
			REDIS_RUNTIME_FAILURES_KEY,
		);
		const httpEvents = await redisClient.getJSON<HttpEvent[]>(REDIS_HTTP_EVENTS_KEY);

		mergeStateInMemory({
			snapshots: Array.isArray(snapshots) ? snapshots : [],
			incidents: Array.isArray(incidentList) ? incidentList : [],
			runtimeFailures: Array.isArray(runtimeFailureList) ? runtimeFailureList : [],
			httpEvents: Array.isArray(httpEvents) ? httpEvents : [],
		});
		if (
			statusSnapshots.length === 0 &&
			incidents.length === 0 &&
			runtimeFailuresBySlug.size === 0 &&
			recentHttpEvents.length === 0
		) {
			await loadStateFromDatabase();
		}
		lastRedisSyncMs = Date.now();
	} catch (error) {
		await loadStateFromDatabase();
	} finally {
		hydratedFromRedis = true;
	}
};

const persistToRedis = async () => {
	try {
		const { redisClient } = await import("../../config/redis.js");
		const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const lockAcquired = await redisClient.set(
			REDIS_PERSIST_LOCK_KEY,
			lockToken,
			{ ttl: REDIS_PERSIST_LOCK_TTL_SECONDS, nx: true },
		);
		if (!lockAcquired) {
			schedulePersistStateToDatabase();
			return;
		}

		try {
		const remoteSnapshots =
			(await redisClient.getJSON<Snapshot[]>(REDIS_STATUS_SNAPSHOTS_KEY)) || [];
		const snapshotMap = new Map<number, Snapshot>();
		for (const snapshot of remoteSnapshots) snapshotMap.set(snapshot.at, snapshot);
		for (const snapshot of statusSnapshots) snapshotMap.set(snapshot.at, snapshot);
		const mergedSnapshots = Array.from(snapshotMap.values()).sort((a, b) => a.at - b.at);
		const snapshotMin = Date.now() - HISTORY_RETENTION_MS;
		const prunedMergedSnapshots = mergedSnapshots.filter((snapshot) => snapshot.at >= snapshotMin);

		const remoteIncidents =
			(await redisClient.getJSON<StatusIncident[]>(REDIS_STATUS_INCIDENTS_KEY)) || [];
		const incidentMap = new Map<string, StatusIncident>();
		for (const incident of remoteIncidents) incidentMap.set(incident.id, incident);
		for (const incident of incidents) incidentMap.set(incident.id, incident);
		const mergedIncidents = Array.from(incidentMap.values()).sort(
			(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
		);
		const incidentMin = Date.now() - HISTORY_RETENTION_MS;
		const prunedMergedIncidents = mergedIncidents.filter(
			(incident) => new Date(incident.startedAt).getTime() >= incidentMin,
		);

		const remoteFailureList =
			(await redisClient.getJSON<Array<{ slug: string; data: RuntimeFailure }>>(
				REDIS_RUNTIME_FAILURES_KEY,
			)) || [];
		const mergedFailures = new Map<string, RuntimeFailure>();
		for (const entry of remoteFailureList) {
			if (!entry?.slug || !entry?.data) continue;
			mergedFailures.set(entry.slug, entry.data);
		}
		for (const [slug, data] of runtimeFailuresBySlug.entries()) {
			const remote = mergedFailures.get(slug);
			if (!remote || data.at >= remote.at) {
				mergedFailures.set(slug, data);
			}
		}
		const failureMin = Date.now() - RUNTIME_FAILURE_WINDOW_MS;
		for (const [slug, data] of mergedFailures.entries()) {
			if (data.at < failureMin) mergedFailures.delete(slug);
		}
		const mergedFailureList = Array.from(mergedFailures.entries()).map(([slug, data]) => ({
			slug,
			data,
		}));

		const remoteHttpEvents =
			(await redisClient.getJSON<HttpEvent[]>(REDIS_HTTP_EVENTS_KEY)) || [];
		const eventMap = new Map<string, HttpEvent>();
		const eventKey = (event: HttpEvent) =>
			`${event.moduleSlug}|${event.statusCode}|${event.at}|${event.message}`;
		for (const event of remoteHttpEvents) eventMap.set(eventKey(event), event);
		for (const event of recentHttpEvents) eventMap.set(eventKey(event), event);
		const mergedHttpEvents = Array.from(eventMap.values()).sort((a, b) => a.at - b.at);
		const httpMin = Date.now() - HTTP_EVENT_WINDOW_MS;
		const prunedMergedHttpEvents = mergedHttpEvents
			.filter((event) => event.at >= httpMin)
			.slice(-HTTP_EVENT_LIMIT);

		await redisClient.setJSON(
			REDIS_STATUS_SNAPSHOTS_KEY,
			prunedMergedSnapshots,
			8 * 24 * 60 * 60,
		);
		await redisClient.setJSON(
			REDIS_STATUS_INCIDENTS_KEY,
			prunedMergedIncidents,
			8 * 24 * 60 * 60,
		);
		await redisClient.setJSON(REDIS_RUNTIME_FAILURES_KEY, mergedFailureList, 8 * 24 * 60 * 60);
		await redisClient.setJSON(REDIS_HTTP_EVENTS_KEY, prunedMergedHttpEvents, 8 * 24 * 60 * 60);
		} finally {
			try {
				const currentLockValue = await redisClient.get(REDIS_PERSIST_LOCK_KEY);
				if (currentLockValue === lockToken) {
					await redisClient.del(REDIS_PERSIST_LOCK_KEY);
				}
			} catch {
				// best effort lock cleanup
			}
		}
		schedulePersistStateToDatabase();
	} catch (error) {
		// Ignore persistence failures and continue serving status.
		schedulePersistStateToDatabase();
	}
};

const syncFromRedisIfStale = async () => {
	await hydrateFromRedisIfNeeded();
	if (Date.now() - lastRedisSyncMs < REDIS_SYNC_INTERVAL_MS) return;

	try {
		const { redisClient } = await import("../../config/redis.js");
		const snapshots = await redisClient.getJSON<Snapshot[]>(REDIS_STATUS_SNAPSHOTS_KEY);
		const incidentList = await redisClient.getJSON<StatusIncident[]>(REDIS_STATUS_INCIDENTS_KEY);
		const runtimeFailureList = await redisClient.getJSON<Array<{ slug: string; data: RuntimeFailure }>>(
			REDIS_RUNTIME_FAILURES_KEY,
		);
		const httpEvents = await redisClient.getJSON<HttpEvent[]>(REDIS_HTTP_EVENTS_KEY);

		if (Array.isArray(snapshots)) {
			const map = new Map<number, Snapshot>();
			for (const snapshot of statusSnapshots) map.set(snapshot.at, snapshot);
			for (const snapshot of snapshots) map.set(snapshot.at, snapshot);
			const merged = Array.from(map.values()).sort((a, b) => a.at - b.at);
			statusSnapshots.splice(0, statusSnapshots.length, ...merged);
		}
		if (Array.isArray(incidentList)) {
			const map = new Map<string, StatusIncident>();
			for (const incident of incidents) map.set(incident.id, incident);
			for (const incident of incidentList) map.set(incident.id, incident);
			const merged = Array.from(map.values()).sort(
				(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
			);
			incidents.splice(0, incidents.length, ...merged);
		}
		if (Array.isArray(runtimeFailureList)) {
			const mergedFailures = new Map<string, RuntimeFailure>(runtimeFailuresBySlug.entries());
			for (const entry of runtimeFailureList) {
				if (!entry || typeof entry.slug !== "string" || !entry.data) continue;
				const local = mergedFailures.get(entry.slug);
				if (!local || entry.data.at >= local.at) {
					mergedFailures.set(entry.slug, entry.data);
				}
			}
			runtimeFailuresBySlug.clear();
			for (const [slug, data] of mergedFailures.entries()) {
				runtimeFailuresBySlug.set(slug, data);
			}
		}
		if (Array.isArray(httpEvents)) {
			const map = new Map<string, HttpEvent>();
			const eventKey = (event: HttpEvent) =>
				`${event.moduleSlug}|${event.statusCode}|${event.at}|${event.message}`;
			for (const event of recentHttpEvents) map.set(eventKey(event), event);
			for (const event of httpEvents) map.set(eventKey(event), event);
			const merged = Array.from(map.values()).sort((a, b) => a.at - b.at);
			recentHttpEvents.splice(0, recentHttpEvents.length, ...merged);
		}
		pruneSnapshots(Date.now());
		pruneIncidents(Date.now());
		pruneRuntimeFailures(Date.now());
		pruneHttpEvents(Date.now());
		lastRedisSyncMs = Date.now();
	} catch {
		await loadStateFromDatabase();
	}
};

const toPercent = (total: number, failed: number) => {
	if (total === 0) return 100;
	const value = ((total - failed) / total) * 100;
	return Math.round(value * 100) / 100;
};

const computeUptime = (
	modules: ModuleStatusItem[],
	nowMs: number,
	windowMs: number,
): ModuleUptime[] => {
	const start = nowMs - windowMs;
	const relevant = statusSnapshots.filter((s) => s.at >= start);

	return modules.map((m) => {
		let total = 0;
		let failed = 0;
		for (const sample of relevant) {
			const sampleStatus = sample.moduleStatusBySlug[m.slug];
			if (!sampleStatus) continue;
			total += 1;
			if (sampleStatus !== "operational") failed += 1;
		}
		return {
			slug: m.slug,
			name: m.name,
			percentage: toPercent(total, failed),
			totalSamples: total,
			failedSamples: failed,
		};
	});
};

const computeSloUptime = (
	modules: ModuleStatusItem[],
	nowMs: number,
	windowMs: number,
): Record<string, { percentage: number; observedMs: number; failedMs: number }> => {
	const startMs = nowMs - windowMs;
	const relevant = statusSnapshots
		.filter((s) => s.at >= startMs && s.at <= nowMs)
		.sort((a, b) => a.at - b.at);
	const result: Record<string, { percentage: number; observedMs: number; failedMs: number }> = {};

	for (const module of modules) {
		let observedMs = 0;
		let failedMs = 0;

		for (let i = 0; i < relevant.length; i += 1) {
			const current = relevant[i];
			const nextAt = i < relevant.length - 1 ? relevant[i + 1].at : nowMs;
			const from = Math.max(current.at, startMs);
			const to = Math.min(nextAt, nowMs);
			if (to <= from) continue;

			const status = current.moduleStatusBySlug[module.slug];
			if (!status) continue;
			const span = to - from;
			observedMs += span;
			if (status !== "operational") failedMs += span;
		}

		const percentage =
			observedMs === 0 ? 100 : Math.round((((observedMs - failedMs) / observedMs) * 100) * 100) / 100;
		result[module.slug] = { percentage, observedMs, failedMs };
	}

	return result;
};

const severityRank: Record<ModuleStatus, number> = {
	operational: 0,
	degraded_performance: 1,
	partial_outage: 2,
	major_outage: 3,
};

const statusColor: Record<ModuleStatus, string> = {
	operational: "#14b8a6",
	degraded_performance: "#f59e0b",
	partial_outage: "#f97316",
	major_outage: "#ef4444",
};

const intervalMs = (interval: StatusTimelineInterval) => (interval === "hour" ? 60 * 60 * 1000 : DAY_MS);

const getWorstStatus = (statuses: ModuleStatus[]): ModuleStatus => {
	let worst: ModuleStatus = "operational";
	for (const status of statuses) {
		if (severityRank[status] > severityRank[worst]) worst = status;
	}
	return worst;
};

export const getStatusTimeline = async (
	moduleSlug: string | undefined,
	from: Date,
	to: Date,
	interval: StatusTimelineInterval,
): Promise<StatusTimelineItem[]> => {
	await syncFromRedisIfStale();

	const startMs = from.getTime();
	const endMs = to.getTime();
	const step = intervalMs(interval);

	const relevant = statusSnapshots.filter((s) => s.at >= startMs && s.at <= endMs);
	const buckets = new Map<number, { statuses: ModuleStatus[]; reasons: Array<string | null> }>();

	for (const sample of relevant) {
		const bucketStart = Math.floor(sample.at / step) * step;
		const selectedStatus = moduleSlug
			? sample.moduleStatusBySlug[moduleSlug]
			: getWorstStatus(Object.values(sample.moduleStatusBySlug));
		if (!selectedStatus) continue;

		const bucket = buckets.get(bucketStart) || { statuses: [], reasons: [] };
		bucket.statuses.push(selectedStatus);
		const reason = moduleSlug
			? sample.moduleReasonBySlug?.[moduleSlug] ?? null
			: null;
		bucket.reasons.push(reason);
		buckets.set(bucketStart, bucket);
	}

	const timeline: StatusTimelineItem[] = [];
	for (let t = Math.floor(startMs / step) * step; t <= endMs; t += step) {
		const bucket = buckets.get(t) || { statuses: [], reasons: [] };
		const statuses = bucket.statuses;
		const status = statuses.length > 0 ? getWorstStatus(statuses) : "unknown";
		const reason =
			status === "operational" || status === "unknown"
				? null
				: bucket.reasons.find((value) => typeof value === "string" && value.length > 0) ?? null;
		timeline.push({
			startAt: new Date(t).toISOString(),
			endAt: new Date(Math.min(t + step - 1, endMs)).toISOString(),
			status,
			color: status === "unknown" ? "#94a3b8" : statusColor[status],
			samples: statuses.length,
			reason,
		});
	}

	return timeline;
};

export const getStatusTimelineBatch = async (
	moduleSlugs: string[],
	from: Date,
	to: Date,
	interval: StatusTimelineInterval,
): Promise<Record<string, StatusTimelineItem[]>> => {
	const uniqueSlugs = Array.from(
		new Set(moduleSlugs.map((slug) => String(slug || "").trim()).filter(Boolean)),
	);
	const entries = await Promise.all(
		uniqueSlugs.map(async (slug) => [slug, await getStatusTimeline(slug, from, to, interval)] as const),
	);
	return Object.fromEntries(entries);
};

const syncIncidents = (modules: ModuleStatusItem[], nowIso: string): IncidentTransition[] => {
	const transitions: IncidentTransition[] = [];
	for (const module of modules) {
		if (module.status === "operational") {
			const unresolved = incidents.find(
				(i) => i.moduleSlug === module.slug && i.resolvedAt === null,
			);
			if (unresolved) {
				unresolved.resolvedAt = nowIso;
				transitions.push({ type: "resolved", incident: unresolved });
			}
			continue;
		}

		const unresolved = incidents.find(
			(i) => i.moduleSlug === module.slug && i.resolvedAt === null,
		);
		if (!unresolved) {
			const createdIncident: StatusIncident = {
				id: `${module.slug}-${Date.now()}`,
				moduleSlug: module.slug,
				moduleName: module.name,
				status: module.status,
				startedAt: nowIso,
				resolvedAt: null,
				message:
					module.notes || `Module status changed to ${module.status.replace(/_/g, " ")}`,
			};
			incidents.unshift(createdIncident);
			transitions.push({ type: "opened", incident: createdIncident });
		} else {
			unresolved.status = module.status;
			unresolved.message = module.notes || unresolved.message;
		}
	}
	return transitions;
};

const persistIncidentTransitionsToDb = async (
	prisma: PrismaClient,
	transitions: IncidentTransition[],
) => {
	if (transitions.length === 0) return;

	try {
		for (const transition of transitions) {
			if (transition.type === "opened") {
				await (prisma as any).statusIncident.upsert({
					where: { incidentKey: transition.incident.id },
					update: {
						status: transition.incident.status,
						message: transition.incident.message,
						startedAt: new Date(transition.incident.startedAt),
						resolvedAt: null,
						isResolved: false,
					},
					create: {
						incidentKey: transition.incident.id,
						moduleSlug: transition.incident.moduleSlug,
						moduleName: transition.incident.moduleName,
						status: transition.incident.status,
						message: transition.incident.message,
						startedAt: new Date(transition.incident.startedAt),
						resolvedAt: null,
						isResolved: false,
					},
				});
				continue;
			}

			await (prisma as any).statusIncident.updateMany({
				where: {
					incidentKey: transition.incident.id,
					isResolved: false,
				},
				data: {
					resolvedAt: transition.incident.resolvedAt
						? new Date(transition.incident.resolvedAt)
						: new Date(),
					isResolved: true,
				},
			});
		}
	} catch (error) {
		// Ignore persistence failures and continue serving status.
	}
};

export const getStatusIncidentHistory = async (
	prisma: PrismaClient,
	limit: number,
	filters: StatusIncidentHistoryFilters = {},
): Promise<StatusIncidentHistoryItem[]> => {
	const fromDate = filters.from ? new Date(filters.from) : null;
	const toDate = filters.to ? new Date(filters.to) : null;
	const hasValidFrom = Boolean(fromDate && !Number.isNaN(fromDate.getTime()));
	const hasValidTo = Boolean(toDate && !Number.isNaN(toDate.getTime()));

	try {
		const where: any = {};
		if (filters.moduleSlug) where.moduleSlug = filters.moduleSlug;
		if (typeof filters.isResolved === "boolean") where.isResolved = filters.isResolved;
		if (hasValidFrom || hasValidTo) {
			where.startedAt = {};
			if (hasValidFrom && fromDate) where.startedAt.gte = fromDate;
			if (hasValidTo && toDate) where.startedAt.lte = toDate;
		}

		const rows: any[] = await (prisma as any).statusIncident.findMany({
			where,
			orderBy: { startedAt: "desc" },
			take: limit,
		});

		return rows.map((row: any) => ({
			id: row.id,
			incidentKey: row.incidentKey,
			moduleSlug: row.moduleSlug,
			moduleName: row.moduleName,
			status: row.status,
			message: row.message,
			startedAt: row.startedAt.toISOString(),
			resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
			isResolved: row.isResolved,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		}));
	} catch (error) {
		const filtered = incidents.filter((incident) => {
			if (filters.moduleSlug && incident.moduleSlug !== filters.moduleSlug) return false;
			if (
				typeof filters.isResolved === "boolean" &&
				(incident.resolvedAt !== null) !== filters.isResolved
			) {
				return false;
			}
			if (hasValidFrom && fromDate && new Date(incident.startedAt) < fromDate) return false;
			if (hasValidTo && toDate && new Date(incident.startedAt) > toDate) return false;
			return true;
		});

		return filtered.slice(0, limit).map((incident) => ({
			id: incident.id,
			incidentKey: incident.id,
			moduleSlug: incident.moduleSlug,
			moduleName: incident.moduleName,
			status: incident.status,
			message: incident.message,
			startedAt: incident.startedAt,
			resolvedAt: incident.resolvedAt,
			isResolved: incident.resolvedAt !== null,
			createdAt: incident.startedAt,
			updatedAt: incident.resolvedAt ?? incident.startedAt,
		}));
	}
};

export const getStatusIncidentByKey = async (
	prisma: PrismaClient,
	incidentKey: string,
): Promise<StatusIncidentHistoryItem | null> => {
	try {
		const row = await (prisma as any).statusIncident.findUnique({
			where: { incidentKey },
		});

		if (!row) return null;

		return {
			id: row.id,
			incidentKey: row.incidentKey,
			moduleSlug: row.moduleSlug,
			moduleName: row.moduleName,
			status: row.status,
			message: row.message,
			startedAt: row.startedAt.toISOString(),
			resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
			isResolved: row.isResolved,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	} catch (error) {
		const match = incidents.find((incident) => incident.id === incidentKey);
		if (!match) return null;

		return {
			id: match.id,
			incidentKey: match.id,
			moduleSlug: match.moduleSlug,
			moduleName: match.moduleName,
			status: match.status,
			message: match.message,
			startedAt: match.startedAt,
			resolvedAt: match.resolvedAt,
			isResolved: match.resolvedAt !== null,
			createdAt: match.startedAt,
			updatedAt: match.resolvedAt ?? match.startedAt,
		};
	}
};

export const buildStatusPayload = async (
	prisma: PrismaClient,
	options: { recordSample?: boolean } = {},
): Promise<StatusPayload> => {
	const { recordSample = true } = options;
	const now = new Date();
	const nowIso = now.toISOString();
	const nowMs = now.getTime();
	await syncFromRedisIfStale();
	pruneRuntimeFailures(nowMs);
	pruneHttpEvents(nowMs);

	let dbHealthy = true;
	let redisHealthy = true;
	let redisLatencyMs: number | null = null;
	let dbError: string | null = null;
	let redisError: string | null = null;

	try {
		await prisma.$connect();
	} catch (error) {
		dbHealthy = false;
		dbError = error instanceof Error ? error.message : "Unknown database error";
	}

	try {
		const { redisClient } = await import("../../config/redis.js");
		const start = Date.now();
		await redisClient.ping();
		redisLatencyMs = Date.now() - start;
	} catch (error) {
		redisHealthy = false;
		redisError = error instanceof Error ? error.message : "Unknown redis error";
	}

	const enabledModules = getModuleCatalog().filter((m) => m.enabled());
	const modules: ModuleStatusItem[] = enabledModules.map((module) => {
		const runtimeFailure = runtimeFailuresBySlug.get(module.slug);
		if (runtimeFailure) {
			return {
				name: module.name,
				slug: module.slug,
				status: "major_outage",
				dependencies: module.dependencies,
				notes: runtimeFailure.reason,
			};
		}

		const needsDb = module.dependencies.includes("database");
		const needsRedis = module.dependencies.includes("redis");

		if ((needsDb && !dbHealthy) || (needsRedis && !redisHealthy)) {
			const missingDeps = [
				needsDb && !dbHealthy ? "database" : null,
				needsRedis && !redisHealthy ? "redis" : null,
			].filter(Boolean);
			return {
				name: module.name,
				slug: module.slug,
				status: "major_outage",
				dependencies: module.dependencies,
				notes: `Dependency issue: ${missingDeps.join(", ")}`,
			};
		}

		if (needsRedis && redisLatencyMs !== null && redisLatencyMs > 250) {
			return {
				name: module.name,
				slug: module.slug,
				status: "degraded_performance",
				dependencies: module.dependencies,
				notes: `Redis latency is elevated at ${redisLatencyMs}ms`,
			};
		}

		return {
			name: module.name,
			slug: module.slug,
			status: "operational",
			dependencies: module.dependencies,
		};
	});

	const statusBySlug = modules.reduce<Record<string, ModuleStatus>>((acc, module) => {
		acc[module.slug] = module.status;
		return acc;
	}, {});
	const reasonBySlug = modules.reduce<Record<string, string | null>>((acc, module) => {
		acc[module.slug] = module.notes || null;
		return acc;
	}, {});

	if (recordSample) {
		statusSnapshots.push({
			at: nowMs,
			moduleStatusBySlug: statusBySlug,
			moduleReasonBySlug: reasonBySlug,
		});
		pruneSnapshots(nowMs);
		const transitions = syncIncidents(modules, nowIso);
		pruneIncidents(nowMs);
		void persistToRedis();
		void persistIncidentTransitionsToDb(prisma, transitions);
	}

	const hasMajorOutage = modules.some((m) => m.status === "major_outage");
	const hasDegraded = modules.some((m) => m.status === "degraded_performance");
	const overallStatus: ModuleStatus = hasMajorOutage
		? "major_outage"
		: hasDegraded
			? "degraded_performance"
			: "operational";

	const uptime24h = computeUptime(modules, nowMs, DAY_MS);
	const uptime7d = computeUptime(modules, nowMs, 7 * DAY_MS);
	const slo24h = computeSloUptime(modules, nowMs, DAY_MS);
	const slo7d = computeSloUptime(modules, nowMs, 7 * DAY_MS);
	const uptime24hMerged: ModuleUptime[] = uptime24h.map((row) => ({
		...row,
		sloPercentage: slo24h[row.slug]?.percentage ?? row.percentage,
		observedMs: slo24h[row.slug]?.observedMs ?? 0,
		failedMs: slo24h[row.slug]?.failedMs ?? 0,
	}));
	const uptime7dMerged: ModuleUptime[] = uptime7d.map((row) => ({
		...row,
		sloPercentage: slo7d[row.slug]?.percentage ?? row.percentage,
		observedMs: slo7d[row.slug]?.observedMs ?? 0,
		failedMs: slo7d[row.slug]?.failedMs ?? 0,
	}));

	return {
		httpStatus: hasMajorOutage ? 503 : 200,
		body: {
			scope: "global",
			status: overallStatus,
			timestamp: nowIso,
			uptimeSeconds: process.uptime(),
			baseApiPath: config.baseApiPath,
			summary: {
				totalModules: modules.length,
				operational: modules.filter((m) => m.status === "operational").length,
				degraded: modules.filter((m) => m.status === "degraded_performance").length,
				outage: modules.filter((m) => m.status === "major_outage").length,
			},
			dependencies: {
				database: {
					status: dbHealthy ? "operational" : "major_outage",
					error: dbError,
				},
				redis: {
					status: redisHealthy ? "operational" : "major_outage",
					latencyMs: redisLatencyMs,
					error: redisError,
				},
			},
			modules,
			incidents: incidents.slice(0, 20),
			httpEvents: {
				recentClientErrors: recentHttpEvents
					.filter((event) => event.statusCode >= 400 && event.statusCode < 500)
					.slice(-50)
					.reverse()
					.map((event) => ({
						moduleSlug: event.moduleSlug,
						statusCode: event.statusCode,
						message: event.message,
						at: new Date(event.at).toISOString(),
					})),
				recentServerErrors: recentHttpEvents
					.filter((event) => event.statusCode >= 500)
					.slice(-50)
					.reverse()
					.map((event) => ({
						moduleSlug: event.moduleSlug,
						statusCode: event.statusCode,
						message: event.message,
						at: new Date(event.at).toISOString(),
					})),
			},
			uptime: {
				window24h: uptime24hMerged,
				window7d: uptime7dMerged,
			},
		},
	};
};

export const recordHttpOutcome = (
	moduleSlug: string,
	params: { statusCode: number; message?: string; requestPath?: string },
) => {
	const rawSlug = String(moduleSlug || "").trim();
	if (!rawSlug) return;
	if (params.statusCode < 400) return;
	const requestPath = String(params.requestPath || "").toLowerCase();
	if (requestPath === "/auth/me" || requestPath.startsWith("/auth/me?")) return;
	const catalog = getModuleCatalog();
	const matchedSlug =
		catalog.find((item) => item.slug === rawSlug)?.slug ||
		catalog.find((item) => item.slug.toLowerCase() === rawSlug.toLowerCase())?.slug ||
		rawSlug;

	const message = params.message?.trim() || `HTTP ${params.statusCode} request failed`;
	const now = Date.now();
	recentHttpEvents.push({
		moduleSlug: matchedSlug,
		statusCode: params.statusCode,
		message,
		at: now,
	});
	pruneHttpEvents(now);
	schedulePersistStateToDatabase(1);

	if (params.statusCode >= 500) {
		runtimeFailuresBySlug.set(matchedSlug, {
			at: now,
			reason: message,
			statusCode: params.statusCode,
		});
		schedulePersistStateToDatabase(1);
	}
};

export const startStatusSampler = (prisma: PrismaClient) => {
	if (statusSamplerTimer) return;
	startDbPersistWriter();
	void buildStatusPayload(prisma, { recordSample: true }).catch(() => {
		// best effort initial sample
	});
	statusSamplerTimer = setInterval(() => {
		void buildStatusPayload(prisma, { recordSample: true }).catch(() => {
			// best effort sampler
		});
	}, STATUS_SAMPLER_INTERVAL_MS);
};
