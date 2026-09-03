import { PrismaClient } from "./generated/prisma/index.js";
import { hikvisionFetch } from "./lib/hikvision-client.ts";

const url = process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const device = await prisma.device.findFirst({
  where: { isDeleted: false, address: "192.168.254.189" },
  select: { id: true, name: true, address: true, access: true },
});
if (!device) throw new Error("no device");
let position = 0;
const users = [];
let totalMatches = null;
for (let page = 0; page < 40; page++) {
  const data = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
    method: "POST",
    deviceId: device.id,
    prisma,
    timeoutMs: 20000,
    headers: { "Content-Type": "application/json" },
    body: {
      UserInfoSearchCond: {
        searchID: `inv-${Date.now()}-${page}`,
        searchResultPosition: position,
        maxResults: 30,
      },
    },
  });
  const block = data?.UserInfoSearch || data;
  const list = block?.UserInfo || [];
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  const tm = Number(block?.totalMatches ?? NaN);
  if (Number.isFinite(tm)) totalMatches = tm;
  for (const u of arr) {
    users.push({
      employeeNo: String(u?.employeeNo || "").trim(),
      name: String(u?.name || "").trim(),
      numOfFP: Number(u?.numOfFP ?? 0) || 0,
    });
  }
  if (!arr.length) break;
  position += arr.length;
  if (totalMatches != null && position >= totalMatches) break;
  if (arr.length < 30) break;
}
const withFp = users.filter((u) => u.numOfFP > 0).length;
const plain = users.filter((u) => u.employeeNo && !/[+/=]/.test(u.employeeNo)).length;
console.log(JSON.stringify({ total: users.length, totalMatches, withFp, plainEmployeeNos: plain, noFp: users.filter(u=>u.numOfFP===0).map(u=>u.employeeNo+":"+u.name) }, null, 2));
await prisma.$disconnect();
