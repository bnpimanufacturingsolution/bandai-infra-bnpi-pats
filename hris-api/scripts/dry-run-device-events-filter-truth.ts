import { Prisma, PrismaClient } from "../generated/prisma";
import { parseHikvisionBusinessDateBound } from "../helper/hikvision-event-contract.helper";

const prisma = new PrismaClient();

const windows: Record<string, { from?: string; to?: string }> = {
	today: { from: "2026-06-26", to: "2026-06-26" },
	yesterday: { from: "2026-06-25", to: "2026-06-25" },
	last2: { from: "2026-06-25", to: "2026-06-26" },
	last7: { from: "2026-06-20", to: "2026-06-26" },
	all: {},
};

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

const getCount = async (options: {
	window: string;
	status?: string;
	source?: string;
	deviceId?: string;
	joinDevice: boolean;
}) => {
	const conditions: Prisma.Sql[] = [];
	const window = windows[options.window];

	if (window?.from) {
		const fromDate = parseHikvisionBusinessDateBound(window.from);
		if (fromDate) conditions.push(Prisma.sql`de."eventTime" >= ${fromDate}`);
	}

	if (window?.to) {
		const toDate = parseHikvisionBusinessDateBound(window.to, true);
		if (toDate) conditions.push(Prisma.sql`de."eventTime" <= ${toDate}`);
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

	const whereSql = conditions.length
		? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
		: Prisma.empty;
	const fromSql = options.joinDevice
		? Prisma.sql`FROM device_events de INNER JOIN "Device" d ON d.id = de."deviceId"`
		: Prisma.sql`FROM device_events de`;

	const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
		Prisma.sql`SELECT COUNT(*)::bigint AS total ${fromSql} ${whereSql}`,
	);

	return Number(rows[0]?.total || 0);
};

const main = async () => {
	const device = await prisma.device.findFirst({
		where: { address: "10.184.38.9", port: 4370, isDeleted: false },
		select: { id: true, name: true, address: true, port: true },
	});

	console.log("[device-events-filter-truth] zkteco device:", device || "not found");

	for (const window of Object.keys(windows)) {
		const noJoinAll = await getCount({ window, joinDevice: false });
		const joinAll = await getCount({ window, joinDevice: true });
		const zktecoDevice = device
			? await getCount({ window, deviceId: device.id, joinDevice: true })
			: 0;

		console.log(
			JSON.stringify({
				window,
				allDevices: { noJoinAll, joinAll, drift: noJoinAll - joinAll },
				zktecoDevice,
			}),
		);
	}

	for (const window of Object.keys(windows)) {
		for (const source of sources) {
			const total = await getCount({ window, source, joinDevice: true });
			if (total) console.log(JSON.stringify({ window, source, total }));
		}
	}

	for (const window of Object.keys(windows)) {
		const statusCounts: Record<string, number> = {};
		for (const status of statuses) {
			const total = await getCount({ window, status, joinDevice: true });
			if (total) statusCounts[status] = total;
		}
		console.log(JSON.stringify({ window, statusCounts }));
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
