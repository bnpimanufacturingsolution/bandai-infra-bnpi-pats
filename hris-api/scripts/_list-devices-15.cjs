require("tsx/cjs");
const { PrismaClient } = require("../generated/prisma");
const p = new PrismaClient();
(async () => {
	const rows = await p.device.findMany({
		select: {
			id: true,
			name: true,
			address: true,
			port: true,
			protocol: true,
			organizationId: true,
			config: true,
		},
		take: 40,
		orderBy: { updatedAt: "desc" },
	});
	console.log(
		"DEVICES",
		JSON.stringify(
			rows.map((r) => ({
				id: r.id,
				name: r.name,
				address: r.address,
				port: r.port,
				protocol: r.protocol,
				org: r.organizationId,
			})),
			null,
			2,
		),
	);
	const users = await p.deviceUser.findMany({
		where: { OR: [{ vendorUserId: "15" }, { employeeNo: "15" }] },
		select: {
			id: true,
			deviceId: true,
			vendorUserId: true,
			employeeNo: true,
			organizationId: true,
			vendorMetadata: true,
			displayName: true,
		},
		take: 20,
	});
	console.log(
		"USERS15",
		JSON.stringify(
			users.map((x) => ({
				id: x.id,
				deviceId: x.deviceId,
				v: x.vendorUserId,
				name: x.displayName,
				raw: x.vendorMetadata?.rawFingerprintPresent,
				count: x.vendorMetadata?.rawFingerprintCount,
				org: x.organizationId,
			})),
			null,
			2,
		),
	);
	await p.$disconnect();
})().catch(async (e) => {
	console.error(e);
	await p.$disconnect().catch(() => undefined);
	process.exit(1);
});
