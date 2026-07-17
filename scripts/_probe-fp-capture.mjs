import { PrismaClient } from "../hris-api/generated/prisma/index.js";
import { hikvisionFetch } from "../hris-api/lib/hikvision-client.js";

const prisma = new PrismaClient();
const deviceId = "cmrlgqsjv000oob01165tbd8n";
const device = await prisma.device.findFirst({ where: { id: deviceId }, select: { organizationId: true, address: true, name: true } });
const request = { organizationId: device.organizationId };
const endpoints = [
  "/ISAPI/AccessControl/FingerPrint/SetUp/capabilities?format=json",
  "/ISAPI/AccessControl/CaptureFingerPrint/capabilities?format=json",
  "/ISAPI/AccessControl/CaptureFingerPrint?format=json",
  "/ISAPI/AccessControl/FingerPrintUpload?format=json",
  "/ISAPI/AccessControl/FingerPrintCfg/capabilities?format=json",
];
const out = { device, probes: [] };
for (const ep of endpoints) {
  try {
    const method = ep.includes("CaptureFingerPrint?") && !ep.includes("capabilities") ? "POST" : "GET";
    const body = method === "POST" ? {
      CaptureFingerPrintCond: { employeeNo: "t18stay63721", fingerNo: 1 }
    } : undefined;
    const r = await hikvisionFetch(ep, {
      method, deviceId, prisma, request, timeoutMs: 12000, ensureJsonFormat: false,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body,
    });
    out.probes.push({ ep, method, ok: true, sample: JSON.stringify(r).slice(0, 400) });
  } catch (e) {
    out.probes.push({ ep, ok: false, error: String(e?.message || e).slice(0, 300) });
  }
}
// also search stay user fp count
try {
  const search = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
    method: "POST", deviceId, prisma, request, timeoutMs: 15000, ensureJsonFormat: false,
    headers: { "Content-Type": "application/json" },
    body: { UserInfoSearchCond: { searchID: "fp", searchResultPosition: 0, maxResults: 5, EmployeeNoList: [{ employeeNo: "t18stay63721" }] } }
  });
  out.stayUser = search?.UserInfoSearch || search;
} catch (e) {
  out.stayUserError = String(e?.message || e);
}
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
