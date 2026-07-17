import { PrismaClient } from "../hris-api/generated/prisma/index.js";
const p = new PrismaClient();
const deviceId = "cmrlgqsjv000oob01165tbd8n";
const all = await p.deviceUser.count({ where: { deviceId } });
const t18 = await p.deviceUser.findMany({
	where: { deviceId, vendorUserId: { startsWith: "t18" } },
	select: { id: true, vendorUserId: true, status: true, displayName: true },
});
console.log(JSON.stringify({ all, t18Count: t18.length, t18 }, null, 2));
await p.$disconnect();
