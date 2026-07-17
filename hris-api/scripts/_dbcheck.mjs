import { PrismaClient } from "../generated/prisma/index.js";
const p = new PrismaClient();
try {
  const c = await p.device.count({ where: { isDeleted: false } });
  console.log("COUNT=" + c);
  const d = await p.device.findFirst({
    where: { isDeleted: false, address: "192.168.254.189" },
    select: { id: true, name: true, address: true, access: true },
  });
  console.log("DEVICE=" + JSON.stringify({ id: d?.id, name: d?.name, hasUser: !!d?.access?.username, hasPass: !!d?.access?.password }));
} catch (e) {
  console.error("ERR=" + e.message);
  process.exit(2);
} finally {
  await p.$disconnect();
}
