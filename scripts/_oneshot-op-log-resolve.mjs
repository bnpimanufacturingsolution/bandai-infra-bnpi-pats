/**
 * One-shot: pull recent addUserInfo / addFp logSearch rows for TEST A and save lifecycle events.
 * Uses the same helper the SDK callback schedules after major=3 SYNC_SIGNAL.
 */
import { PrismaClient } from "../hris-api/generated/prisma/index.js";
import { scheduleOperationLogResolveAfterSdkSignal } from "../hris-api/helper/device-person-token.helper.ts";

const dbUrl =
	process.env.FORCE_DATABASE_URL ||
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const deviceId = process.env.DEVICE_ID || "cmrlgqsjv000oob01165tbd8n";

const device = await prisma.device.findFirst({
	where: { id: deviceId },
	select: { id: true, organizationId: true, name: true, address: true },
});
if (!device) {
	console.error("device_not_found", deviceId);
	process.exit(1);
}
console.log("device", device.name, device.address, device.organizationId);

scheduleOperationLogResolveAfterSdkSignal({
	prisma,
	req: { organizationId: device.organizationId, io: null },
	deviceId: device.id,
	organizationId: device.organizationId,
	deviceName: device.name,
	deviceAddress: device.address,
	triggerMinor: "manual-oneshot",
	settleMs: 300,
	windowBeforeMs: 24 * 3600 * 1000,
	windowAfterMs: 60_000,
	cooldownMs: 0,
});

await new Promise((r) => setTimeout(r, 28_000));

const events = await prisma.deviceEvent.findMany({
	where: {
		deviceId,
		eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED"] },
		eventTime: { gte: new Date(Date.now() - 48 * 3600 * 1000) },
	},
	orderBy: { eventTime: "desc" },
	take: 20,
	select: {
		employeeNo: true,
		eventAction: true,
		eventLabel: true,
		eventTime: true,
		payload: true,
	},
});

console.log(
	JSON.stringify(
		{
			count: events.length,
			sample: events.map((e) => ({
				a: e.eventAction,
				e: e.employeeNo,
				t: e.eventTime,
				fromSdk: e.payload?.resolvedFromSdkOperationSignal || false,
			})),
		},
		null,
		2,
	),
);

await prisma.$disconnect();
