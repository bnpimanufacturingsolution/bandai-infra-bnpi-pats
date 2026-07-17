import { PrismaClient } from "../hris-api/generated/prisma/index.js";
import { hikvisionFetch } from "../hris-api/lib/hikvision-client.js";
import { hikvisionEndpoint } from "../hris-api/config/hikvision.endpoint.js";
import { captureOpaqueTokenAfterUserWrite } from "../hris-api/helper/device-person-token.helper.js";

const emp = process.argv[2];
const prisma = new PrismaClient({ datasources: { db: { url: process.env.FORCE_DATABASE_URL } } });
const deviceId = "cmrlgqsjv000oob01165tbd8n";
const device = await prisma.device.findFirst({ where: { id: deviceId }, select: { organizationId: true } });
const request = { organizationId: device.organizationId };
const writeMs = Date.now();
await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.record + "?format=json", {
  method: "POST", deviceId, prisma, request, timeoutMs: 25000, ensureJsonFormat: false,
  headers: { "Content-Type": "application/json" },
  body: { deviceId, UserInfo: { employeeNo: emp, name: "RT-" + emp, userType: "normal",
    Valid: { enable: true, beginTime: "2026-01-01T00:00:00", endTime: "2036-12-31T23:59:59", timeType: "local" },
    doorRight: "1", RightPlan: [{ doorNo: 1, planTemplateNo: "1" }] } }
});
const cap = await captureOpaqueTokenAfterUserWrite({
  prisma, req: request, deviceId, organizationId: device.organizationId,
  plainEmployeeNo: emp, displayName: "RT-" + emp, source: "USER_INFO_RECORD", writeMs, settleMs: 1200
});
console.log(JSON.stringify({ emp, captureOk: cap.ok, opaque: cap.opaqueToken }));
await prisma.$disconnect();
