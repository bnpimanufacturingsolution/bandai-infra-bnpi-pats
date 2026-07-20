import { PrismaClient } from "../generated/prisma/index.js";

const url = process.env.DATABASE_URL || "";
console.log("urlHas5432", url.includes(":5432"), "urlHas15433", url.includes("15433"));

const p = new PrismaClient({
	datasources: { db: { url } },
});

try {
	const c = await p.device.count({ where: { isDeleted: false } });
	console.log("COUNT=" + c);
	const d = await p.device.findFirst({
		where: { isDeleted: false, address: "192.168.254.189" },
		select: { id: true, name: true, address: true, access: true },
	});
	console.log(
		"DEVICE=" +
			JSON.stringify({
				id: d?.id,
				name: d?.name,
				hasUser: Boolean(d?.access?.username),
				hasPass: Boolean(d?.access?.password),
			}),
	);
} catch (e) {
	console.error("ERR=" + (e?.message || e));
	process.exit(2);
} finally {
	await p.$disconnect();
}
