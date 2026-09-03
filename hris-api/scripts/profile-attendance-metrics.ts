import "dotenv/config";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "../generated/prisma";
import { calculateAttendanceMetricsDetailed } from "../helper/attendance-metrics-detailed.helper";
import { calculateAttendanceTodayOpsSummary } from "../helper/attendance-metrics-detailed.helper";

type CliOptions = {
	baseUrl: string;
	cookie?: string;
	origin: string;
	model: "Attendance";
	metric: "attendanceMetricsDetailed";
	orgId?: string;
	dateFrom: string;
	dateTo: string;
	status?: string;
	departmentId?: string;
	reportToId?: string;
	employeeId?: string;
	search?: string;
	page: number;
	limit: number;
	callApi: boolean;
	explain: boolean;
};

const prisma = new PrismaClient({
	log: [{ emit: "event", level: "query" }, "info", "warn", "error"],
});

prisma.$on("query", (event) => {
	const duration = typeof event.duration === "number" ? `${event.duration}ms` : "n/a";
	console.log(`\n[prisma-query] ${duration}`);
	console.log(event.query);
	if ("params" in event && event.params) {
		console.log(`[params] ${event.params}`);
	}
});

function getArgValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index === -1) return undefined;
	return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

function getTodayInManila(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function parseNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOptions(): CliOptions {
	const today = getTodayInManila();
	return {
		baseUrl: getArgValue("--baseUrl") || "http://localhost:3001",
		cookie: getArgValue("--cookie"),
		origin: getArgValue("--origin") || "http://localhost:5175",
		model: "Attendance",
		metric: "attendanceMetricsDetailed",
		orgId: getArgValue("--orgId"),
		dateFrom: getArgValue("--dateFrom") || today,
		dateTo: getArgValue("--dateTo") || today,
		status: getArgValue("--status"),
		departmentId: getArgValue("--departmentId"),
		reportToId: getArgValue("--reportToId") || getArgValue("--managerId"),
		employeeId: getArgValue("--employeeId"),
		search: getArgValue("--search"),
		page: parseNumber(getArgValue("--page"), 1),
		limit: parseNumber(getArgValue("--limit"), 10),
		callApi: hasFlag("--call-api"),
		explain: hasFlag("--explain"),
	};
}

function summarizeFilter(options: CliOptions) {
	return {
		dateFrom: options.dateFrom,
		dateTo: options.dateTo,
		status: options.status || null,
		departmentId: options.departmentId || null,
		reportToId: options.reportToId || null,
		employeeId: options.employeeId || null,
		search: options.search || null,
		page: options.page,
		limit: options.limit,
	};
}

function toExtendedJsonDate(value: Date) {
	return { $date: value.toISOString() };
}

async function timeStep<T>(label: string, work: () => Promise<T>) {
	const startedAt = performance.now();
	const result = await work();
	const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
	console.log(`\n[time] ${label}: ${elapsedMs}ms`);
	return result;
}

async function resolveOrganizationId(explicitOrgId?: string) {
	if (explicitOrgId) return explicitOrgId;
	const employee = await prisma.employee.findFirst({
		where: { isDeleted: false },
		select: { organizationId: true },
	});
	if (!employee?.organizationId) {
		throw new Error("Unable to resolve organizationId. Pass --orgId explicitly.");
	}
	return employee.organizationId;
}

async function profileHelperQuery(options: CliOptions, organizationId: string) {
	const startDate = new Date(`${options.dateFrom}T00:00:00.000Z`);
	const endDate = new Date(`${options.dateTo}T23:59:59.999Z`);

	return timeStep("helper.calculateAttendanceMetricsDetailed", async () =>
		calculateAttendanceMetricsDetailed(
			prisma,
			organizationId,
			startDate,
			endDate,
			options.limit,
			options.page,
			options.search,
			options.status,
			options.departmentId,
			undefined,
			undefined,
			undefined,
			options.reportToId,
			options.employeeId,
		),
	);
}

async function profileTodayOpsSummary(options: CliOptions, organizationId: string) {
	const targetDate = new Date(`${options.dateFrom}T00:00:00.000Z`);
	const result = await timeStep("helper.calculateAttendanceTodayOpsSummary", async () =>
		calculateAttendanceTodayOpsSummary(
			prisma,
			organizationId,
			targetDate,
			options.search,
			options.departmentId,
			undefined,
			undefined,
			undefined,
			options.reportToId,
			options.employeeId,
		),
	);

	console.log("\n[today-ops-summary]");
	console.dir(result, { depth: null });
}

function buildAttendanceMatch(options: CliOptions, organizationId: string) {
	const match: Record<string, unknown> = {
		organizationId,
		isDeleted: false,
		date: {
			$gte: toExtendedJsonDate(new Date(`${options.dateFrom}T00:00:00.000Z`)),
			$lte: toExtendedJsonDate(new Date(`${options.dateTo}T23:59:59.999Z`)),
		},
	};

	if (options.employeeId) {
		match.employeeId = { $oid: options.employeeId };
	}
	if (options.departmentId) {
		match.departmentIdSnapshot = { $oid: options.departmentId };
	}
	if (options.reportToId) {
		match.reportToIdSnapshot = { $oid: options.reportToId };
	}
	if (options.status && options.status !== "NOT_CLOCKED_IN") {
		match.status = options.status.toUpperCase();
	}

	return match;
}

async function profileRawAttendanceAggregation(options: CliOptions, organizationId: string) {
	const pipeline = [
		{ $match: buildAttendanceMatch(options, organizationId) },
		{ $sort: { date: 1, updatedAt: -1, createdAt: -1 } },
		{
			$group: {
				_id: {
					employeeId: "$employeeId",
					date: "$date",
				},
				row: { $first: "$$ROOT" },
			},
		},
		{ $replaceRoot: { newRoot: "$row" } },
		{
			$group: {
				_id: null,
				totalPersistedRows: { $sum: 1 },
				totalPresent: {
					$sum: {
						$cond: [{ $in: ["$status", ["PRESENT", "INCOMPLETE"]] }, 1, 0],
					},
				},
				totalAbsent: {
					$sum: {
						$cond: [{ $eq: ["$status", "ABSENT"] }, 1, 0],
					},
				},
				totalOnLeave: {
					$sum: {
						$cond: [{ $eq: ["$status", "LEAVE"] }, 1, 0],
					},
				},
				totalRestDay: {
					$sum: {
						$cond: [{ $eq: ["$status", "REST_DAY"] }, 1, 0],
					},
				},
				totalLateRows: {
					$sum: {
						$cond: [{ $gt: [{ $ifNull: ["$lateMinutes", 0] }, 0] }, 1, 0],
					},
				},
				totalMinutesWorked: { $sum: { $ifNull: ["$totalMinutesWorked", 0] } },
				totalOvertimeMinutes: { $sum: { $ifNull: ["$overtimeMinutes", 0] } },
				totalUndertimeMinutes: { $sum: { $ifNull: ["$undertimeMinutes", 0] } },
				totalLateMinutes: { $sum: { $ifNull: ["$lateMinutes", 0] } },
			},
		},
	];

	const result = await timeStep("attendance.aggregateRaw baseline", async () =>
		prisma.attendance.aggregateRaw({
			pipeline,
		}),
	);

	console.log("\n[raw-baseline]");
	console.dir(result, { depth: null });

	if (options.explain) {
		const explainResult = await timeStep("runCommandRaw explain(aggregate)", async () =>
			prisma.$runCommandRaw({
				explain: {
					aggregate: "attendances",
					pipeline,
					cursor: {},
				},
				verbosity: "executionStats",
			}),
		);
		console.log("\n[raw-explain]");
		console.dir(explainResult, { depth: 5 });
	}
}

async function callMetricsApi(options: CliOptions) {
	if (!options.callApi) return;

	const filter: Record<string, unknown> = {
		dateFrom: options.dateFrom,
		dateTo: options.dateTo,
		page: options.page,
		limit: options.limit,
	};

	if (options.status) filter.status = options.status;
	if (options.departmentId) filter.departmentId = options.departmentId;
	if (options.reportToId) filter.reportToId = options.reportToId;
	if (options.employeeId) filter.employeeId = options.employeeId;
	if (options.search) filter.search = options.search;

	const headers: Record<string, string> = {
		Accept: "application/json",
		"Content-Type": "application/json",
		Origin: options.origin,
		Referer: `${options.origin}/`,
	};

	if (options.cookie) {
		headers.Cookie = options.cookie;
	}

	const body = {
		model: options.model,
		data: [options.metric],
		filter,
	};

	const response = await timeStep("POST /api/metrics", async () =>
		fetch(`${options.baseUrl}/api/metrics`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		}),
	);

	const payload = await response.json();
	console.log(`\n[api] status=${response.status}`);
	console.dir(payload, { depth: 5 });
}

async function main() {
	const options = buildOptions();
	console.log("[profile-options]");
	console.dir(summarizeFilter(options), { depth: null });

	const organizationId = await resolveOrganizationId(options.orgId);
	console.log(`\n[organizationId] ${organizationId}`);

	const helperResult = await profileHelperQuery(options, organizationId);
	console.log("\n[helper-summary]");
	console.dir(
		{
			totalRecords: helperResult.totalRecords,
			dateRange: helperResult.dateRange,
			metrics: helperResult.metrics,
			firstRecord: helperResult.records[0] || null,
		},
		{ depth: 5 },
	);

	await profileTodayOpsSummary(options, organizationId);
	await profileRawAttendanceAggregation(options, organizationId);
	await callMetricsApi(options);
}

main()
	.catch((error) => {
		console.error("\n[profile-error]");
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
