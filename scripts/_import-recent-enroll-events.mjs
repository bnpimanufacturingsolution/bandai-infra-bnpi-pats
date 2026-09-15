﻿import { PrismaClient } from "../bnpi-pats-api/generated/prisma/index.js";
import { hikvisionFetch } from "../bnpi-pats-api/lib/hikvision-client.js";
import {
  buildHikvisionLogSearchXml,
  normalizeHikvisionLogSearchRow,
  parseHikvisionLogSearchResponse,
  isOpaqueHikvisionPersonToken,
} from "../bnpi-pats-api/helper/hikvision-event-contract.helper.js";
import {
  applyDevicePersonTokenToEvidence,
  formatHikvisionPlus08,
  upsertDeviceUserInventoryStub,
  upsertDevicePersonToken,
} from "../bnpi-pats-api/helper/device-person-token.helper.js";
import { hikvisionEndpoint } from "../bnpi-pats-api/config/hikvision.endpoint.js";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.FORCE_DATABASE_URL } } });
const deviceId = "cmrlgqsjv000oob01165tbd8n";
const device = await prisma.device.findFirst({ where: { id: deviceId }, select: { id: true, organizationId: true, name: true, address: true } });
const request = { organizationId: device.organizationId };
const orgId = device.organizationId;

// 1) Search device for recent demo users and upsert inventory
const targets = ["19", "10", "t18stay63721", "t18rt124015"];
const found = [];
for (const emp of targets) {
  try {
    const search = await hikvisionFetch(hikvisionEndpoint.accessControl.userInfo.search + "?format=json", {
      method: "POST", deviceId, prisma, request, timeoutMs: 15000, ensureJsonFormat: false,
      headers: { "Content-Type": "application/json" },
      body: { UserInfoSearchCond: { searchID: "s"+emp, searchResultPosition: 0, maxResults: 5, EmployeeNoList: [{ employeeNo: emp }] } }
    });
    const list = search?.UserInfoSearch?.UserInfo || [];
    const rows = Array.isArray(list) ? list : list ? [list] : [];
    const num = Number(search?.UserInfoSearch?.numOfMatches || rows.length || 0);
    if (num < 1 && !rows.length) { found.push({ emp, onDevice: false }); continue; }
    const u = rows[0] || {};
    const name = String(u.name || emp);
    const du = await upsertDeviceUserInventoryStub(prisma, {
      organizationId: orgId, deviceId, employeeNo: emp, displayName: name, opaqueToken: null
    });
    // bump lastSyncedAt explicitly
    if (du?.id) {
      await prisma.deviceUser.update({ where: { id: du.id }, data: { lastSyncedAt: new Date(), displayName: name, employeeNo: emp } });
    }
    found.push({ emp, onDevice: true, name, deviceUserId: du?.id, numOfFP: u.numOfFP ?? u.numOfFingerPrint });
  } catch (e) {
    found.push({ emp, onDevice: false, error: String(e?.message || e).slice(0, 120) });
  }
}

// 2) Pull recent operation logs (last 24h) for addUserInfo + addFp
const start = formatHikvisionPlus08(Date.now() - 24 * 3600 * 1000);
const end = formatHikvisionPlus08(Date.now() + 120000);
const metaIds = [
  "log.hikvision.com/Information/addUserInfo",
  "log.hikvision.com/Information/addFpByEmployeeNo",
];
const saved = [];
for (const metaId of metaIds) {
  const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
    method: "POST", deviceId, prisma, request, timeoutMs: 25000, ensureJsonFormat: false, rawResponse: true,
    headers: { Accept: "application/xml, text/xml, */*", "Content-Type": "application/xml; charset=UTF-8" },
    body: buildHikvisionLogSearchXml({
      searchId: "import-" + Date.now(),
      startTime: start, endTime: end, maxResults: 50, searchResultPosition: 0, metaId,
    }),
  });
  const parsed = parseHikvisionLogSearchResponse(String(response.raw || ""));
  for (const row of parsed.rows || []) {
    const evidence = normalizeHikvisionLogSearchRow(row, device);
    const applied = await applyDevicePersonTokenToEvidence(prisma, { organizationId: orgId, deviceId, evidence });
    const isFp = metaId.includes("addFp");
    const eventAction = isFp ? "FINGERPRINT_ENROLLED" : "USER_CREATED";
    const eventLabel = isFp ? "Fingerprint enrolled" : "Device user created";
    const minor = isFp ? "addFpByEmployeeNo" : "addUserInfo";
    let employeeNo = String(applied.employeeNo || evidence.employeeNo || "").trim();
    const opaque = applied.opaquePersonToken || (isOpaqueHikvisionPersonToken(employeeNo) ? employeeNo : null);
    // If still opaque, try match known tokens table
    if (employeeNo && isOpaqueHikvisionPersonToken(employeeNo)) {
      const tok = await prisma.devicePersonToken.findFirst({ where: { deviceId, opaqueToken: employeeNo } });
      if (tok?.employeeNo) employeeNo = tok.employeeNo;
    }
    const personKey = employeeNo || opaque || "unknown";
    const dedupeKey = `import|${deviceId}|${eventAction}|${applied.time || row.time}|${personKey}`;
    const exists = await prisma.deviceEvent.findFirst({ where: { organizationId: orgId, dedupeKey } });
    if (exists) { saved.push({ skip: true, eventAction, personKey }); continue; }
    const created = await prisma.deviceEvent.create({
      data: {
        organizationId: orgId, deviceId,
        eventTime: new Date(applied.time || Date.now()),
        employeeNo: isOpaqueHikvisionPersonToken(employeeNo) ? null : employeeNo,
        source: "HIKVISION_CALLBACK", status: "UNMATCHED",
        eventCategory: isFp ? "ENROLLMENT" : "USER_MANAGEMENT",
        eventAction, eventLabel, eventConfidence: "PROVEN",
        eventType: "ISAPI_LOGSEARCH", major: "Information", minor,
        dedupeKey,
        payload: {
          evidenceSource: "ISAPI_LOGSEARCH", directDeviceEvidence: true,
          liveEnrollWatch: false, importProof: true,
          personTokenResolved: Boolean(employeeNo && !isOpaqueHikvisionPersonToken(employeeNo) && opaque),
          opaquePersonToken: opaque,
          resolvedEmployeeNo: isOpaqueHikvisionPersonToken(employeeNo) ? null : employeeNo,
          notBnpiPatsEmployee: true, plane: "DEVICE_USER",
          rawEvidence: applied.rawEvidence || evidence,
        },
      },
    });
    if (employeeNo && !isOpaqueHikvisionPersonToken(employeeNo)) {
      await upsertDeviceUserInventoryStub(prisma, {
        organizationId: orgId, deviceId, employeeNo,
        displayName: null, opaqueToken: opaque,
      }).catch(() => null);
    }
    saved.push({ id: created.id, eventAction, employeeNo, opaque });
  }
}

// 3) list recent events for targets
const events = await prisma.deviceEvent.findMany({
  where: {
    deviceId,
    OR: [
      { employeeNo: { in: targets } },
      { eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED"] }, eventTime: { gte: new Date(Date.now() - 24*3600*1000) } },
    ],
  },
  orderBy: { eventTime: "desc" },
  take: 20,
  select: { id: true, employeeNo: true, eventAction: true, eventTime: true },
});
const dus = await prisma.deviceUser.findMany({
  where: { deviceId, vendorUserId: { in: targets } },
  select: { vendorUserId: true, displayName: true, lastSyncedAt: true, status: true },
});
console.log(JSON.stringify({ found, savedCount: saved.filter(s=>s.id).length, savedSample: saved.filter(s=>s.id).slice(0,10), events, dus }, null, 2));
await prisma.$disconnect();
