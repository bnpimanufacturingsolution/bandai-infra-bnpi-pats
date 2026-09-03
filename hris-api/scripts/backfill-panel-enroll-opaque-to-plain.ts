/**
 * Map panel-enroll opaque log token → plain device person no and backfill
 * USER_CREATED / FINGERPRINT_ENROLLED DeviceEvents so the ledger shows "User 14"
 * and Device user deep-links work.
 *
 * Usage (from hris-api, with DB tunnel on 55435):
 *   npx tsx scripts/backfill-panel-enroll-opaque-to-plain.ts \
 *     --deviceId cmrlgqsjv000oob01165tbd8n \
 *     --opaque yPFUNQTscAXEP8dc9bpbBw== \
 *     --employeeNo 14
 */
import path from "path";
import { loadEnvFile } from "./dev-db-runtime.cjs";

const apiRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(apiRoot, ".env"));
loadEnvFile(path.join(apiRoot, ".env.development.local"), { overwrite: true });
if (!process.env.DATABASE_URL?.includes("127.0.0.1:55435")) {
	process.env.DATABASE_URL =
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
}

const arg = (name: string, fallback = "") => {
	const idx = process.argv.indexOf(`--${name}`);
	if (idx >= 0 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim();
	return fallback;
};

async function main() {
	const { PrismaClient } = require("../generated/prisma");
	const {
		upsertDevicePersonToken,
		upsertDeviceUserInventoryStub,
		enrichEnrollmentLifecycleEvent,
	} = require("../helper/device-person-token.helper");

	const deviceId = arg("deviceId", "cmrlgqsjv000oob01165tbd8n");
	const opaque = arg("opaque", "yPFUNQTscAXEP8dc9bpbBw==");
	const employeeNo = arg("employeeNo", "14");
	const displayName = arg("displayName", "") || null;

	const prisma = new PrismaClient();
	try {
		const device = await prisma.device.findFirst({
			where: { id: deviceId, isDeleted: false },
			select: { id: true, organizationId: true, name: true },
		});
		if (!device) throw new Error(`Device not found: ${deviceId}`);
		const organizationId = device.organizationId;

		await upsertDevicePersonToken(prisma, {
			organizationId,
			deviceId,
			opaqueToken: opaque,
			employeeNo,
			displayName,
			source: "PANEL_INVENTORY_DELTA",
		});

		const deviceUser = await upsertDeviceUserInventoryStub(prisma, {
			organizationId,
			deviceId,
			employeeNo,
			displayName,
			opaqueToken: opaque,
		});

		const events = await prisma.deviceEvent.findMany({
			where: {
				organizationId,
				deviceId,
				OR: [
					{ payload: { path: ["opaquePersonToken"], equals: opaque } },
					{ employeeNo: opaque },
				],
				eventAction: {
					in: [
						"USER_CREATED",
						"USER_UPDATED",
						"FINGERPRINT_ENROLLED",
						"FINGERPRINT_UPDATED",
						"CARD_ENROLLED",
					],
				},
			},
			orderBy: { receivedAt: "desc" },
			take: 40,
		});

		const updatedIds: string[] = [];
		for (const event of events) {
			const payload = (event.payload as any) || {};
			const nextPayload = {
				...payload,
				opaquePersonToken: opaque,
				resolvedEmployeeNo: employeeNo,
				resolvedDisplayName: displayName || payload.resolvedDisplayName || null,
				personTokenResolved: true,
				personTokenSource: "PANEL_ENROLL_BACKFILL",
			};
			await prisma.deviceEvent.update({
				where: { id: event.id },
				data: {
					employeeNo,
					deviceUserId: deviceUser?.id || event.deviceUserId || null,
					status: deviceUser?.employeeId ? "MATCHED" : "UNMATCHED",
					payload: nextPayload,
				},
			});
			await enrichEnrollmentLifecycleEvent({
				prisma,
				req: null,
				organizationId,
				deviceId,
				eventId: event.id,
				eventAction: event.eventAction,
				plainEmployeeNo: employeeNo,
				displayName,
				opaqueToken: opaque,
				deviceUserId: deviceUser?.id || null,
				linkedEmployeeId: deviceUser?.employeeId || null,
			}).catch((error: any) => {
				console.warn("enrich failed", event.id, error?.message || error);
			});
			updatedIds.push(event.id);
		}

		console.log(
			JSON.stringify(
				{
					ok: true,
					deviceId,
					deviceName: device.name,
					opaque,
					employeeNo,
					deviceUserId: deviceUser?.id || null,
					eventsUpdated: updatedIds.length,
					eventIds: updatedIds,
				},
				null,
				2,
			),
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
