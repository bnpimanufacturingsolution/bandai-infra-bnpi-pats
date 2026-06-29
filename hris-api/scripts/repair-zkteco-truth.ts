import { Prisma, PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const zktecoDevices = [
	"10.184.38.10",
	"10.184.38.234",
	"10.184.38.235",
	"10.184.38.9",
] as const;

const port = 4370;

const normalizedDeviceEmpIdSql = Prisma.sql`
	case
		when "employeeId" ~ '^[0-9]+$'
			then coalesce(nullif(regexp_replace("employeeId", '^0+', ''), ''), '0')
		else "employeeId"
	end
`;

async function main() {
	const organizations = await prisma.organization.findMany({
		where: { isDeleted: false },
		select: { id: true, code: true, name: true },
		orderBy: { createdAt: "asc" },
	});

	if (organizations.length === 0) {
		throw new Error("No live organizations found. Run base seed/provisioning first.");
	}

	let deviceUpserts = 0;
	for (const organization of organizations) {
		for (const address of zktecoDevices) {
			await prisma.device.upsert({
				where: {
					organizationId_address_port: {
						organizationId: organization.id,
						address,
						port,
					},
				},
				update: {
					name: `ZKTeco Device ${address}`,
					protocol: "tcp",
					access: {},
					config: {
						vendor: "ZKTeco",
						source: "vendor/zkteco-sdk",
						webhookPath: "/api/zkteco/events",
					},
					isDeleted: false,
				},
				create: {
					organizationId: organization.id,
					name: `ZKTeco Device ${address}`,
					address,
					port,
					protocol: "tcp",
					access: {},
					config: {
						vendor: "ZKTeco",
						source: "vendor/zkteco-sdk",
						webhookPath: "/api/zkteco/events",
					},
				},
			});
			deviceUpserts += 1;
		}
	}

	const staleZktecoDevices = await prisma.$executeRaw`
		update "Device"
		set "isDeleted" = true, "updatedAt" = now()
		where "isDeleted" = false
			and port = ${port}
			and protocol = 'tcp'::"Protocol"
			and address not in (${Prisma.join([...zktecoDevices])})
			and (
				config->>'vendor' = 'ZKTeco'
				or name ilike '%ZKTeco%'
			)
	`;

	const syncedDeviceEmpIds = await prisma.$executeRaw`
		update employees
		set "deviceEmpId" = ${normalizedDeviceEmpIdSql}, "updatedAt" = now()
		where "isDeleted" = false
			and ("deviceEmpId" is null or "deviceEmpId" <> ${normalizedDeviceEmpIdSql})
	`;

	const rematchedZktecoEvents = await prisma.$executeRaw`
		with candidates as (
			select distinct on (de.id)
				de.id as "eventId",
				emp.id as "employeeId"
			from device_events de
			join employees emp
				on emp."organizationId" = de."organizationId"
				and emp."isDeleted" = false
				and de."employeeNo" is not null
				and btrim(de."employeeNo") <> ''
				and (
					emp."deviceEmpId" = btrim(de."employeeNo")
					or emp."employeeId" in (
						btrim(de."employeeNo"),
						case
							when btrim(de."employeeNo") ~ '^[0-9]+$'
							then coalesce(nullif(regexp_replace(btrim(de."employeeNo"), '^0+', ''), ''), '0')
							else btrim(de."employeeNo")
						end,
						case
							when btrim(de."employeeNo") ~ '^[0-9]+$'
							then lpad(
								coalesce(nullif(regexp_replace(btrim(de."employeeNo"), '^0+', ''), ''), '0'),
								5,
								'0'
							)
							else btrim(de."employeeNo")
						end
					)
				)
			where de.source = 'ZKTECO_EVENT'::"DeviceEventSource"
				and de.status = 'UNMATCHED'::"DeviceEventStatus"
				and de."attendanceId" is null
				and de."employeeId" is null
			order by
				de.id,
				case when emp."deviceEmpId" = btrim(de."employeeNo") then 0 else 1 end,
				emp."employeeId"
		)
		update device_events de
		set
			"employeeId" = candidates."employeeId",
			status = 'MATCHED'::"DeviceEventStatus",
			"errorMessage" = null,
			"updatedAt" = now()
		from candidates
		where de.id = candidates."eventId"
	`;

	const [deviceCount, employeeDeviceIdCount, eventCounts] = await Promise.all([
		prisma.device.count({
			where: {
				isDeleted: false,
				address: { in: [...zktecoDevices] },
				port,
				protocol: "tcp",
			},
		}),
		prisma.employee.count({
			where: {
				isDeleted: false,
				deviceEmpId: { not: null },
			},
		}),
		prisma.deviceEvent.groupBy({
			by: ["source", "status"],
			where: { source: "ZKTECO_EVENT" },
			_count: { _all: true },
			orderBy: [{ source: "asc" }, { status: "asc" }],
		}),
	]);

	console.log("[zkteco-truth] organizations:", organizations.length);
	console.log("[zkteco-truth] device upserts:", deviceUpserts);
	console.log("[zkteco-truth] stale ZKTeco devices soft-deleted:", staleZktecoDevices);
	console.log("[zkteco-truth] live ZKTeco device rows:", deviceCount);
	console.log("[zkteco-truth] employee deviceEmpId rows:", employeeDeviceIdCount);
	console.log("[zkteco-truth] employee deviceEmpId repaired:", syncedDeviceEmpIds);
	console.log("[zkteco-truth] existing ZKTeco event rows rematched:", rematchedZktecoEvents);
	console.log("[zkteco-truth] real ZKTeco event counts:");
	for (const row of eventCounts) {
		console.log(`  ${row.source}/${row.status}: ${row._count._all}`);
	}
	if (eventCounts.length === 0) {
		console.log("  none yet; wait for real bridge callbacks or log backfill.");
	}
}

main()
	.catch((error) => {
		console.error("[zkteco-truth] failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
