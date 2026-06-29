import { Prisma, PrismaClient } from "../generated/prisma";
import { parseHikvisionBusinessDateBound } from "../helper/hikvision-event-contract.helper";

const prisma = new PrismaClient();
const PH_TIME_ZONE = "Asia/Manila";
const ZKTECO_ADDRESSES = ["10.184.38.10", "10.184.38.234", "10.184.38.235", "10.184.38.9"];

const statuses = [
	"all",
	"MATCHED",
	"RECEIVED",
	"ATTENDANCE_CREATED",
	"ATTENDANCE_UPDATED",
	"UNMATCHED",
	"IGNORED",
	"FAILED",
] as const;

const sources = [
	"all",
	"ZKTECO_EVENT",
	"HIKVISION_CALLBACK",
	"EN_HCNETSDK_ALARM",
] as const;

type DateField = "receivedAt" | "eventTime";
type WindowKey = "today" | "yesterday" | "last2" | "last7" | "all";

const getDateKey = (date: Date) => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: PH_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value || "";
	const month = parts.find((part) => part.type === "month")?.value || "";
	const day = parts.find((part) => part.type === "day")?.value || "";
	return `${year}-${month}-${day}`;
};

const subtractDays = (date: Date, days: number) =>
	new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

const buildWindows = () => {
	const today = new Date();
	const todayKey = getDateKey(today);
	const yesterdayKey = getDateKey(subtractDays(today, 1));
	return {
		today: { from: todayKey, to: todayKey },
		yesterday: { from: yesterdayKey, to: yesterdayKey },
		last2: { from: yesterdayKey, to: todayKey },
		last7: { from: getDateKey(subtractDays(today, 6)), to: todayKey },
		all: {},
	} satisfies Record<WindowKey, { from?: string; to?: string }>;
};

const columnForDateField = (dateField: DateField) =>
	dateField === "receivedAt" ? Prisma.sql`de."receivedAt"` : Prisma.sql`de."eventTime"`;

const buildWhere = (options: {
	window: WindowKey;
	dateField: DateField;
	status?: string;
	source?: string;
	deviceId?: string;
	organizationId?: string;
}) => {
	const conditions: Prisma.Sql[] = [];
	const windows = buildWindows();
	const window = windows[options.window];
	const dateColumn = columnForDateField(options.dateField);

	if (options.organizationId) {
		conditions.push(Prisma.sql`de."organizationId" = ${options.organizationId}`);
	}

	if (window?.from) {
		const fromDate = parseHikvisionBusinessDateBound(window.from);
		if (fromDate) conditions.push(Prisma.sql`${dateColumn} >= ${fromDate}`);
	}

	if (window?.to) {
		const toDate = parseHikvisionBusinessDateBound(window.to, true);
		if (toDate) conditions.push(Prisma.sql`${dateColumn} <= ${toDate}`);
	}

	if (options.status && options.status !== "all") {
		conditions.push(Prisma.sql`de."status" = ${options.status}::"DeviceEventStatus"`);
	}

	if (options.source && options.source !== "all") {
		conditions.push(Prisma.sql`de."source" = ${options.source}::"DeviceEventSource"`);
	}

	if (options.deviceId) {
		conditions.push(Prisma.sql`de."deviceId" = ${options.deviceId}`);
	}

	return conditions.length
		? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
		: Prisma.empty;
};

const getCount = async (options: {
	window: WindowKey;
	dateField: DateField;
	status?: string;
	source?: string;
	deviceId?: string;
	organizationId?: string;
	joinDevice?: boolean;
}) => {
	const whereSql = buildWhere(options);
	const fromSql = options.joinDevice
		? Prisma.sql`FROM device_events de INNER JOIN "Device" d ON d.id = de."deviceId"`
		: Prisma.sql`FROM device_events de`;

	const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
		Prisma.sql`SELECT COUNT(*)::bigint AS total ${fromSql} ${whereSql}`,
	);

	return Number(rows[0]?.total || 0);
};

const getGroups = async (
	options: {
		window: WindowKey;
		dateField: DateField;
		source?: string;
		organizationId?: string;
	},
	groupBy: "status" | "source",
) => {
	const whereSql = buildWhere(options);
	const columnSql = groupBy === "status" ? Prisma.sql`de.status` : Prisma.sql`de.source`;
	const rows = await prisma.$queryRaw<Array<{ key: string; count: bigint | number }>>(
		Prisma.sql`
			SELECT ${columnSql}::text AS key, COUNT(*)::bigint AS count
			FROM device_events de
			${whereSql}
			GROUP BY ${columnSql}
			ORDER BY COUNT(*) DESC
		`,
	);
	return Object.fromEntries(rows.map((row) => [row.key, Number(row.count || 0)]));
};

const main = async () => {
	const windows = buildWindows();
	const devices = await prisma.device.findMany({
		where: {
			isDeleted: false,
			OR: [
				{ address: { in: ZKTECO_ADDRESSES } },
				{ name: { contains: "ZKTeco", mode: "insensitive" } },
			],
		},
		select: { id: true, name: true, address: true, port: true, organizationId: true },
		orderBy: [{ address: "asc" }],
	});
	const organizationIds = Array.from(new Set(devices.map((device) => device.organizationId)));
	const organizationId = organizationIds.length === 1 ? organizationIds[0] : undefined;

	console.log(
		JSON.stringify(
			{
				report: "device-events-filter-truth",
				timeZone: PH_TIME_ZONE,
				windows,
				organizationId: organizationId || "multiple-or-unknown",
				zktecoDevices: devices,
			},
			null,
			2,
		),
	);

	for (const window of Object.keys(windows) as WindowKey[]) {
		for (const dateField of ["receivedAt", "eventTime"] as DateField[]) {
			const all = await getCount({ window, dateField, organizationId, joinDevice: true });
			const zkteco = await getCount({
				window,
				dateField,
				source: "ZKTECO_EVENT",
				organizationId,
				joinDevice: true,
			});
			const byStatus = await getGroups(
				{ window, dateField, source: "ZKTECO_EVENT", organizationId },
				"status",
			);
			const bySource = await getGroups({ window, dateField, organizationId }, "source");

			console.log(JSON.stringify({ window, dateField, all, zkteco, bySource, zktecoByStatus: byStatus }));
		}
	}

	for (const device of devices) {
		const counts: Record<string, number> = {};
		for (const window of Object.keys(windows) as WindowKey[]) {
			counts[`${window}:receivedAt`] = await getCount({
				window,
				dateField: "receivedAt",
				deviceId: device.id,
				source: "ZKTECO_EVENT",
				organizationId,
				joinDevice: true,
			});
			counts[`${window}:eventTime`] = await getCount({
				window,
				dateField: "eventTime",
				deviceId: device.id,
				source: "ZKTECO_EVENT",
				organizationId,
				joinDevice: true,
			});
		}
		console.log(JSON.stringify({ device, counts }));
	}

	for (const window of Object.keys(windows) as WindowKey[]) {
		const statusCounts: Record<string, number> = {};
		for (const status of statuses) {
			const total = await getCount({
				window,
				dateField: "receivedAt",
				status,
				organizationId,
				joinDevice: true,
			});
			if (total) statusCounts[status] = total;
		}
		const sourceCounts: Record<string, number> = {};
		for (const source of sources) {
			const total = await getCount({
				window,
				dateField: "receivedAt",
				source,
				organizationId,
				joinDevice: true,
			});
			if (total) sourceCounts[source] = total;
		}
		console.log(JSON.stringify({ window, savedPageExpectedFilters: { statusCounts, sourceCounts } }));
	}
};

main()
	.catch((error) => {
		console.error("[device-events-filter-truth] failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
