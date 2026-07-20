	import { createHash } from "crypto";
import * as fs from "fs";
import * as readline from "readline";
import { Prisma, PrismaClient } from "../generated/prisma";
import {
	buildZktecoDeviceEventDedupeKey,
	normalizeZktecoPayload,
	parseZktecoEventTime,
	ZKTECO_DEVICE_EVENT_SOURCE,
} from "../helper/zkteco-event-contract.helper";
import { buildPersistedDeviceEventTaxonomy } from "../helper/device-event-taxonomy.helper";

let prisma: PrismaClient;

type ImportArgs = {
	file: string;
	apply: boolean;
	batchSize: number;
	databaseUrl: string;
};

type ExportedZktecoPayload = Record<string, any>;

type PreparedDeviceEvent = {
	organizationId: string;
	deviceId: string;
	employeeId: string | null;
	eventTime: Date;
	employeeNo: string | null;
	status: "MATCHED" | "UNMATCHED";
	eventCategory: string;
	eventAction: string;
	eventLabel: string;
	eventConfidence: string;
	eventType: string | null;
	verifyMode: string | null;
	major: string | null;
	minor: string | null;
	dedupeKey: string;
	payload: ExportedZktecoPayload;
	errorMessage: string | null;
};

export function normalizeJsonlLine(rawLine: string) {
	return rawLine.replace(/^\uFEFF/, "").trim();
}

const zktecoDeviceAddresses = [
	"10.184.38.10",
	"10.184.38.234",
	"10.184.38.235",
	"10.184.38.9",
];

function parseArgs(): ImportArgs {
	const args = process.argv.slice(2);
	const fileFlagIndex = args.findIndex((arg) => arg === "--file");
	const inlineFile = args.find((arg) => arg.startsWith("--file="));
	const file =
		(fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined) ||
		(inlineFile ? inlineFile.slice("--file=".length) : undefined) ||
		args.find((arg) => !arg.startsWith("--")) ||
		process.env.ZKTECO_DEVICE_EVENTS_FILE ||
		"";

	const batchArg = args.find((arg) => arg.startsWith("--batch-size="));
	const batchSize = Math.max(
		1,
		Number(batchArg?.slice("--batch-size=".length) || process.env.ZKTECO_IMPORT_BATCH_SIZE || 1000),
	);
	const databaseUrlFlagIndex = args.findIndex((arg) => arg === "--database-url");
	const inlineDatabaseUrl = args.find((arg) => arg.startsWith("--database-url="));
	const databaseUrl =
		(databaseUrlFlagIndex >= 0 ? args[databaseUrlFlagIndex + 1] : undefined) ||
		(inlineDatabaseUrl ? inlineDatabaseUrl.slice("--database-url=".length) : undefined) ||
		process.env.ZKTECO_IMPORT_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"";

	if (!file) {
		throw new Error("Missing --file <jsonl> or ZKTECO_DEVICE_EVENTS_FILE.");
	}
	if (!databaseUrl) {
		throw new Error("Missing DATABASE_URL, ZKTECO_IMPORT_DATABASE_URL, or --database-url.");
	}

	return {
		file,
		apply: args.includes("--apply") || process.env.ZKTECO_IMPORT_APPLY === "true",
		batchSize: Number.isFinite(batchSize) ? batchSize : 1000,
		databaseUrl,
	};
}

async function readJsonl(filePath: string) {
	const rows: ExportedZktecoPayload[] = [];
	const stream = fs.createReadStream(filePath, { encoding: "utf8" });
	const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
	let lineNo = 0;

	for await (const rawLine of lines) {
		lineNo += 1;
		const line = normalizeJsonlLine(rawLine);
		if (!line) continue;
		try {
			rows.push(JSON.parse(line));
		} catch (error: any) {
			throw new Error(`Invalid JSONL at ${filePath}:${lineNo}: ${error?.message || error}`);
		}
	}

	return rows;
}

async function loadDevices() {
	const devices = await prisma.device.findMany({
		where: {
			isDeleted: false,
			address: { in: zktecoDeviceAddresses },
			port: 4370,
			protocol: "tcp",
		},
		select: {
			id: true,
			organizationId: true,
			address: true,
			port: true,
		},
	});

	return new Map(devices.map((device) => [`${device.address}:${device.port}`, device]));
}

async function loadEmployeesByDeviceEmpId(organizationIds: string[]) {
	const employees = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			organizationId: { in: organizationIds },
			deviceEmpId: { not: null },
		},
		select: {
			id: true,
			organizationId: true,
			deviceEmpId: true,
		},
	});

	return new Map(
		employees.map((employee) => [
			`${employee.organizationId}:${String(employee.deviceEmpId || "").trim()}`,
			employee,
		]),
	);
}

function buildFallbackDedupeKey(input: {
	deviceId: string;
	eventTime: Date;
	employeeNo: string;
	event: ReturnType<typeof normalizeZktecoPayload>;
}) {
	const basis = [
		input.deviceId,
		ZKTECO_DEVICE_EVENT_SOURCE,
		input.eventTime.toISOString(),
		input.employeeNo,
		input.event.eventType || "",
		input.event.verifyMode || "",
		input.event.attState || "",
		input.event.workCode || "",
		input.event.serialNo || "",
	].join("|");

	return createHash("sha256").update(basis).digest("hex");
}

function prepareRows(
	payloads: ExportedZktecoPayload[],
	devicesByAddress: Awaited<ReturnType<typeof loadDevices>>,
	employeesByDeviceEmpId: Awaited<ReturnType<typeof loadEmployeesByDeviceEmpId>>,
) {
	const prepared: PreparedDeviceEvent[] = [];
	let invalid = 0;
	let missingDevice = 0;

	for (const payload of payloads) {
		const event = normalizeZktecoPayload(payload);
		const deviceIp = String(event.deviceIP || "").trim();
		const devicePort = Number(event.devicePort || 4370);
		const device = devicesByAddress.get(`${deviceIp}:${devicePort}`);
		if (!device) {
			missingDevice += 1;
			continue;
		}

		const employeeNo = String(event.employeeNo || "").trim();
		const eventTime = parseZktecoEventTime(event.time);
		if (!employeeNo || Number.isNaN(eventTime.getTime())) {
			invalid += 1;
			continue;
		}

		const employee = employeesByDeviceEmpId.get(`${device.organizationId}:${employeeNo}`);
		const status = employee ? "MATCHED" : "UNMATCHED";
		const dedupeInput = { deviceId: device.id, eventTime, employeeNo, event };
		let dedupeKey: string;
		try {
			dedupeKey = buildZktecoDeviceEventDedupeKey(dedupeInput);
		} catch {
			dedupeKey = buildFallbackDedupeKey(dedupeInput);
		}

		const evidencePayload = {
			...payload,
			evidenceSource: "ZKTECO_IMPORT",
			directDeviceEvidence: true,
			vendorAction: event.attStateName || event.eventType || event.attState || null,
			vendorCode: event.attState ?? null,
			rawDeviceTime: event.eventTime || null,
			operator: (payload as any).operator || (payload as any).userName || null,
			remoteHost: (payload as any).remoteHost || (payload as any).deviceIP || null,
			rawEvidence: payload,
		};
		const taxonomy = buildPersistedDeviceEventTaxonomy({
			source: ZKTECO_DEVICE_EVENT_SOURCE,
			status,
			eventType: event.eventType || "AttendanceTransaction",
			major: event.attState !== undefined ? String(event.attState) : null,
			minor: event.attStateName || null,
			payload: evidencePayload,
		});
		prepared.push({
			organizationId: device.organizationId,
			deviceId: device.id,
			employeeId: employee?.id || null,
			eventTime,
			employeeNo,
			status,
			...taxonomy,
			eventType: event.eventType || "AttendanceTransaction",
			verifyMode: event.verifyMode || null,
			major: event.attState !== undefined ? String(event.attState) : null,
			minor: event.attStateName || null,
			dedupeKey,
			payload: evidencePayload,
			errorMessage: employee ? null : "employee_not_found",
		});
	}

	return { prepared, invalid, missingDevice };
}

async function countExisting(rows: PreparedDeviceEvent[]) {
	if (rows.length === 0) return 0;
	const jsonRows = JSON.stringify(
		rows.map((row) => ({
			organizationId: row.organizationId,
			dedupeKey: row.dedupeKey,
		})),
	);
	const result = await prisma.$queryRaw<Array<{ count: number }>>`
		with input_rows as (
			select distinct
				row_data->>'organizationId' as "organizationId",
				row_data->>'dedupeKey' as "dedupeKey"
			from jsonb_array_elements(${jsonRows}::jsonb) as input(row_data)
		)
		select count(*)::int as count
		from device_events existing
		join input_rows input
			on input."organizationId" = existing."organizationId"
			and input."dedupeKey" = existing."dedupeKey"
	`;

	return result[0]?.count || 0;
}

async function insertBatch(rows: PreparedDeviceEvent[]) {
	if (rows.length === 0) return 0;
	const jsonRows = JSON.stringify(
		rows.map((row) => ({
			organizationId: row.organizationId,
			deviceId: row.deviceId,
			employeeId: row.employeeId,
			attendanceId: null,
			eventTime: row.eventTime.toISOString(),
			employeeNo: row.employeeNo,
			source: ZKTECO_DEVICE_EVENT_SOURCE,
			status: row.status,
			eventCategory: row.eventCategory,
			eventAction: row.eventAction,
			eventLabel: row.eventLabel,
			eventConfidence: row.eventConfidence,
			eventType: row.eventType,
			verifyMode: row.verifyMode,
			major: row.major,
			minor: row.minor,
			doorNo: null,
			dedupeKey: row.dedupeKey,
			payload: row.payload,
			errorMessage: row.errorMessage,
		})),
	);

	return prisma.$executeRaw(
		Prisma.sql`
			insert into device_events (
				id,
				"organizationId",
				"deviceId",
				"employeeId",
				"attendanceId",
				"eventTime",
				"employeeNo",
				source,
				status,
				"eventCategory",
				"eventAction",
				"eventLabel",
				"eventConfidence",
				"eventType",
				"verifyMode",
				major,
				minor,
				"doorNo",
				"dedupeKey",
				payload,
				"errorMessage",
				"createdAt",
				"updatedAt"
			)
			select
				concat('zkteco_', md5((row_data->>'organizationId') || ':' || (row_data->>'dedupeKey'))) as id,
				row_data->>'organizationId',
				row_data->>'deviceId',
				nullif(row_data->>'employeeId', ''),
				null,
				(row_data->>'eventTime')::timestamp,
				nullif(row_data->>'employeeNo', ''),
				(row_data->>'source')::"DeviceEventSource",
				(row_data->>'status')::"DeviceEventStatus",
				(row_data->>'eventCategory')::"DeviceEventCategory",
				(row_data->>'eventAction')::"DeviceEventAction",
				nullif(row_data->>'eventLabel', ''),
				(row_data->>'eventConfidence')::"DeviceEventConfidence",
				nullif(row_data->>'eventType', ''),
				nullif(row_data->>'verifyMode', ''),
				nullif(row_data->>'major', ''),
				nullif(row_data->>'minor', ''),
				nullif(row_data->>'doorNo', ''),
				row_data->>'dedupeKey',
				row_data->'payload',
				nullif(row_data->>'errorMessage', ''),
				now(),
				now()
			from jsonb_array_elements(${jsonRows}::jsonb) as input(row_data)
			on conflict ("organizationId", "dedupeKey") do update
			set
				"employeeId" = excluded."employeeId",
				"attendanceId" = null,
				status = excluded.status,
				"eventCategory" = excluded."eventCategory",
				"eventAction" = excluded."eventAction",
				"eventLabel" = excluded."eventLabel",
				"eventConfidence" = excluded."eventConfidence",
				payload = excluded.payload,
				"errorMessage" = excluded."errorMessage",
				"updatedAt" = now()
		`,
	);
}

async function main() {
	const args = parseArgs();
	prisma = new PrismaClient({ datasources: { db: { url: args.databaseUrl } } });
	const before = {
		attendances: await prisma.attendance.count(),
		obligations: await prisma.attendanceObligation.count(),
		timesheets: await prisma.timesheet.count(),
	};
	const payloads = await readJsonl(args.file);
	const devicesByAddress = await loadDevices();
	const organizationIds = [...new Set([...devicesByAddress.values()].map((device) => device.organizationId))];
	const employeesByDeviceEmpId = await loadEmployeesByDeviceEmpId(organizationIds);
	const { prepared, invalid, missingDevice } = prepareRows(
		payloads,
		devicesByAddress,
		employeesByDeviceEmpId,
	);
	const existing = await countExisting(prepared);
	const matched = prepared.filter((row) => row.status === "MATCHED").length;
	const unmatched = prepared.length - matched;

	console.log("[zkteco-device-events] file:", args.file);
	console.log("[zkteco-device-events] database:", args.databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"));
	console.log("[zkteco-device-events] mode:", args.apply ? "apply" : "dry-run");
	console.log("[zkteco-device-events] rows read:", payloads.length);
	console.log("[zkteco-device-events] rows valid:", prepared.length);
	console.log("[zkteco-device-events] rows missing device:", missingDevice);
	console.log("[zkteco-device-events] rows invalid:", invalid);
	console.log("[zkteco-device-events] existing dedupe matches:", existing);
	console.log("[zkteco-device-events] would insert:", Math.max(prepared.length - existing, 0));
	console.log("[zkteco-device-events] would update:", existing);
	console.log("[zkteco-device-events] would match:", matched);
	console.log("[zkteco-device-events] would unmatch:", unmatched);

	let touched = 0;
	if (args.apply) {
		for (let index = 0; index < prepared.length; index += args.batchSize) {
			touched += await insertBatch(prepared.slice(index, index + args.batchSize));
		}
		console.log("[zkteco-device-events] rows touched:", touched);
	} else {
		console.log("[zkteco-device-events] dry-run only; pass --apply to write device_events.");
	}

	const after = {
		attendances: await prisma.attendance.count(),
		obligations: await prisma.attendanceObligation.count(),
		timesheets: await prisma.timesheet.count(),
	};
	console.log("[zkteco-device-events] guard counts before:", before);
	console.log("[zkteco-device-events] guard counts after:", after);
	if (
		before.attendances !== after.attendances ||
		before.obligations !== after.obligations ||
		before.timesheets !== after.timesheets
	) {
		throw new Error("Guard table counts changed; device-event import must not mutate attendance workflow tables.");
	}
}

if (require.main === module) {
	main()
		.catch((error) => {
			console.error("[zkteco-device-events] failed:", error);
			process.exitCode = 1;
		})
		.finally(async () => {
			await prisma?.$disconnect();
		});
}
