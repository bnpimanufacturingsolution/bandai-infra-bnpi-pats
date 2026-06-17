export type ModuleStatus =
	| "operational"
	| "degraded_performance"
	| "partial_outage"
	| "major_outage";

export type ModuleStatusItem = {
	name: string;
	slug: string;
	status: ModuleStatus;
	dependencies: string[];
	notes?: string;
};

export type StatusSummary = {
	totalModules: number;
	operational: number;
	degraded: number;
	outage: number;
};

export type DependencyStatus = {
	status: "operational" | "major_outage";
	error: string | null;
	latencyMs?: number | null;
};

export type StatusPayloadBody = {
	scope: "global";
	status: ModuleStatus;
	timestamp: string;
	uptimeSeconds: number;
	baseApiPath: string;
	summary: StatusSummary;
	dependencies: {
		database: DependencyStatus;
		redis: DependencyStatus;
	};
	modules: ModuleStatusItem[];
	incidents: StatusIncident[];
	httpEvents: {
		recentClientErrors: Array<{
			moduleSlug: string;
			statusCode: number;
			message: string;
			at: string;
		}>;
		recentServerErrors: Array<{
			moduleSlug: string;
			statusCode: number;
			message: string;
			at: string;
		}>;
	};
	uptime: {
		window24h: ModuleUptime[];
		window7d: ModuleUptime[];
	};
};

export type StatusPayload = {
	httpStatus: number;
	body: StatusPayloadBody;
};

export type StatusIncident = {
	id: string;
	moduleSlug: string;
	moduleName: string;
	status: Exclude<ModuleStatus, "operational">;
	startedAt: string;
	resolvedAt: string | null;
	message: string;
};

export type ModuleUptime = {
	slug: string;
	name: string;
	percentage: number;
	totalSamples: number;
	failedSamples: number;
	sloPercentage?: number;
	observedMs?: number;
	failedMs?: number;
};

export type StatusIncidentHistoryItem = {
	id: string;
	incidentKey: string;
	moduleSlug: string;
	moduleName: string;
	status: string;
	message: string;
	startedAt: string;
	resolvedAt: string | null;
	isResolved: boolean;
	createdAt: string;
	updatedAt: string;
};

export type StatusIncidentHistoryFilters = {
	moduleSlug?: string;
	isResolved?: boolean;
	from?: string;
	to?: string;
};

export type StatusTimelineInterval = "hour" | "day";

export type StatusTimelineItem = {
	startAt: string;
	endAt: string;
	status: ModuleStatus | "unknown";
	color: string;
	samples: number;
	reason?: string | null;
};
