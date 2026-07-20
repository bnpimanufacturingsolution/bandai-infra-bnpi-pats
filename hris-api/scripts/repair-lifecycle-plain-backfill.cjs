// Repair USER_CREATED / FINGERPRINT_ENROLLED rows that still lack plain employeeNo
// when SYNC_SIGNAL already resolved plain (UI misleading case).
// Usage: node scripts/repair-lifecycle-plain-backfill.cjs [deviceId] [plainEmployeeNo] [opaqueToken]
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const {
	backfillRecentLifecycleEventsWithPlain,
} = require("../helper/device-person-token.helper.ts");

function loadEnv() {
	const envPath = path.resolve(__dirname, "../.env");
	for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i < 1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		)
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		if (process.env[key]) {
			process.env[key] = process.env[key].replace(
				/@10\.184\.37\.19:15433\b/g,
				"@127.0.0.1:55435",
			);
		}
	}
}

async function main() {
	loadEnv();
	const deviceId = process.argv[2] || "cmrlgqsjv000oob01165tbd8n";
	const plain = process.argv[3] || "16";
	const opaque = process.argv[4] || "Tdrfz7u2qVQz4k7NZORoaA==";
	const prisma = new PrismaClient();
	try {
		const device = await prisma.device.findUnique({ where: { id: deviceId } });
		if (!device) throw new Error("device not found");
		const result = await backfillRecentLifecycleEventsWithPlain({
			prisma,
			organizationId: device.organizationId,
			deviceId,
			plainEmployeeNo: plain,
			opaqueToken: opaque,
			windowMs: 60 * 60 * 1000,
			source: "MANUAL_REPAIR_UI_MISLEAD_FIX",
		});
		const rows = await prisma.deviceEvent.findMany({
			where: {
				deviceId,
				eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED", "SYNC_SIGNAL"] },
				receivedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
			},
			orderBy: { receivedAt: "desc" },
			take: 10,
			select: {
				id: true,
				eventAction: true,
				employeeNo: true,
				deviceUserId: true,
				receivedAt: true,
			},
		});
		const out = { result, rows };
		const dest = path.resolve(
			__dirname,
			"../../.runtime/ui-misleading-events-20260719/repair-result.json",
		);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, JSON.stringify(out, null, 2));
		console.log(JSON.stringify(out, null, 2));
		process.exitCode = result.backfilledEvents > 0 ? 0 : 2;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
