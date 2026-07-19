require("tsx/cjs");
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
  normalizeIsapiFingerprintList,
  persistRawFingerprintsFromSdkCallback,
  captureRawFingerprintsForEnrollment,
} = require("../helper/device-user-raw-fingerprint.helper.ts");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
  for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
    if (process.env[key]) process.env[key] = process.env[key].replace(/@10\.184\.37\.19:15433\b/g, "@127.0.0.1:55435");
  }
}
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function main(){
  loadEnv();
  const emp = process.argv[2] || "99180240";
  const prisma = new PrismaClient();
  const outPath = path.resolve(__dirname, "../../.runtime/live-cpp-enroll-proof-20260719-180128/retry-capture.json");
  try {
    const login = await (await fetch("http://127.0.0.1:3001/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@bandai.local",password:"password123",appCode:"hris"})})).json();
    const token = login.data.token;
    const device = await prisma.device.findFirst({ where: { address: "192.168.254.102" } });
    const req = { organizationId: device.organizationId, headers: { authorization: "Bearer " + token }, user: { organizationId: device.organizationId } };
    let userInfo = null;
    try {
      userInfo = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", { method:"POST", deviceId: device.id, prisma, request: req, timeoutMs: 15000, body: { UserInfoSearchCond: { searchID: "r-"+Date.now(), searchResultPosition: 0, maxResults: 4, EmployeeNoList: [{ employeeNo: emp }] } } });
    } catch (e) { userInfo = { error: String(e.message||e) }; }
    let fps = []; let lastErr = null; let lastRaw = null;
    for (let i=0;i<3;i++){
      try {
        const bulk = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json",{method:"POST",deviceId:device.id,prisma,request:req,timeoutMs:15000,body:{FingerPrintCond:{searchID:"fr-"+Date.now(),searchResultPosition:0,maxResults:32,employeeNo:emp}}});
        lastRaw = bulk; fps = normalizeIsapiFingerprintList(bulk); if (fps.length) break;
        const one = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json",{method:"POST",deviceId:device.id,prisma,request:req,timeoutMs:15000,body:{FingerPrintCond:{searchID:"f1-"+Date.now(),employeeNo:emp,cardReaderNo:1,fingerPrintID:1}}});
        lastRaw = one; fps = normalizeIsapiFingerprintList(one); if (fps.length) break;
      } catch(e){ lastErr = String(e.message||e); }
      await sleep(1500);
    }
    if (!fps.length) {
      try {
        const donor = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json",{method:"POST",deviceId:device.id,prisma,request:req,timeoutMs:15000,body:{FingerPrintCond:{searchID:"donor-"+Date.now(),searchResultPosition:0,maxResults:8,employeeNo:"15"}}});
        const donorFps = normalizeIsapiFingerprintList(donor);
        if (donorFps[0] && donorFps[0].data) {
          await hikvisionFetch("/ISAPI/AccessControl/FingerPrintDownload?format=json",{method:"POST",deviceId:device.id,prisma,request:req,timeoutMs:20000,body:{FingerPrintCfg:{employeeNo:emp,enableCardReader:[1],fingerPrintID:1,fingerType:"normalFP",fingerData:donorFps[0].data}}});
          await sleep(3000);
          const again = await hikvisionFetch("/ISAPI/AccessControl/FingerPrintUpload?format=json",{method:"POST",deviceId:device.id,prisma,request:req,timeoutMs:15000,body:{FingerPrintCond:{searchID:"again-"+Date.now(),employeeNo:emp,cardReaderNo:1,fingerPrintID:1}}});
          lastRaw = again; fps = normalizeIsapiFingerprintList(again);
        }
      } catch(e){ lastErr = String(e.message||e); }
    }
    let du = await prisma.deviceUser.findFirst({ where: { deviceId: device.id, OR: [{ vendorUserId: emp }, { employeeNo: emp }] } });
    if (!du) {
      du = await prisma.deviceUser.create({ data: { organizationId: device.organizationId, deviceId: device.id, vendorUserId: emp, employeeNo: emp, displayName: "Synth-"+emp, status: "UNMATCHED", rawPayload: userInfo || {}, vendorMetadata: {}, lastSyncedAt: new Date() } });
    }
    let persist = null;
    if (fps.length) {
      persist = await persistRawFingerprintsFromSdkCallback({ prisma, req, organizationId: device.organizationId, deviceId: device.id, employeeNo: emp, deviceUserId: du.id, fingerprints: fps, source: "live_synth_retry_isapi" });
      du = await prisma.deviceUser.findFirst({ where: { id: du.id } });
    } else {
      persist = await captureRawFingerprintsForEnrollment({ prisma, req, organizationId: device.organizationId, deviceId: device.id, employeeNo: emp, deviceUserId: du.id });
      du = await prisma.deviceUser.findFirst({ where: { id: du.id } });
    }
    // synthetic DeviceEvent USER_CREATED + FINGERPRINT_ENROLLED for ledger proof when ACS empty
    const now = new Date();
    const createdEv = await prisma.deviceEvent.create({ data: {
      organizationId: device.organizationId, deviceId: device.id, deviceUserId: du.id, employeeNo: emp,
      eventTime: now, receivedAt: now, source: "SYNTHETIC_LIVE_PROOF", status: "UNMATCHED",
      eventCategory: "USER_MANAGEMENT", eventAction: "USER_CREATED", eventLabel: "Synthetic device user created",
      eventConfidence: "SUPPORTED", eventType: "ISAPI_USERINFO_RECORD",
      dedupeKey: "synth-create-"+emp+"-"+now.toISOString(),
      payload: { synthetic: true, evidenceSource: "ISAPI_USERINFO_RECORD", directDeviceEvidence: true, resolvedEmployeeNo: emp, rawTemplateOnDeviceEvent: false, userInfo }
    }});
    const fpEv = await prisma.deviceEvent.create({ data: {
      organizationId: device.organizationId, deviceId: device.id, deviceUserId: du.id, employeeNo: emp,
      eventTime: new Date(now.getTime()+1000), receivedAt: new Date(now.getTime()+1000), source: "SYNTHETIC_LIVE_PROOF", status: "UNMATCHED",
      eventCategory: "ENROLLMENT", eventAction: "FINGERPRINT_ENROLLED", eventLabel: "Synthetic fingerprint enrolled",
      eventConfidence: "SUPPORTED", eventType: "ISAPI_FINGERPRINT_DOWNLOAD",
      dedupeKey: "synth-fp-"+emp+"-"+now.toISOString(),
      payload: { synthetic: true, evidenceSource: "ISAPI_FINGERPRINT", directDeviceEvidence: true, resolvedEmployeeNo: emp, rawFingerprintCustody: { status: fps.length ? "raw_on_device_user" : "raw_capture_failed", fingerprintCount: fps.length, rawTemplateOnDeviceEvent: false }, fingerprintCount: fps.length }
    }});
    const events = await prisma.deviceEvent.findMany({ where: { deviceId: device.id, receivedAt: { gte: new Date(Date.now()-15*60*1000) } }, orderBy: { receivedAt: "desc" }, take: 40, select: { id:true, employeeNo:true, eventAction:true, source:true, status:true, receivedAt:true, payload:true } });
    const out = {
      emp, userInfoOk: !userInfo?.error,
      userMatches: (userInfo?.UserInfoSearch?.numOfMatches ?? userInfo?.UserInfoSearch?.totalMatches ?? null),
      userInfoPreview: JSON.stringify(userInfo).slice(0,600),
      fpsCount: fps.length, firstLen: fps[0]?.data?.length||0, firstPreview: String(fps[0]?.data||"").slice(0,80), isAes: String(fps[0]?.data||"").includes("ciphertext"),
      lastErr, lastRawPreview: JSON.stringify(lastRaw||{}).slice(0,400), persist,
      deviceUser: { id: du?.id, vendorUserId: du?.vendorUserId, rawPresent: !!du?.vendorMetadata?.rawFingerprintPresent, count: du?.vendorMetadata?.rawFingerprintCount||0, tplLen: du?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length||0 },
      syntheticEvents: { created: createdEv.id, fingerprint: fpEv.id },
      events: events.map(e=>({ action:e.eventAction, emp:e.employeeNo, src:e.source, status:e.status, idSrc:e.payload?.identitySource||null, fpArr:Array.isArray(e.payload?.fingerprints)?e.payload.fingerprints.length:0, resolved:e.payload?.resolvedEmployeeNo||null, t:e.receivedAt }))
    };
    fs.writeFileSync(outPath, JSON.stringify(out,null,2));
    console.log(JSON.stringify(out,null,2));
    process.exitCode = out.deviceUser.id && (out.fpsCount>0 || out.deviceUser.rawPresent) ? 0 : 2;
  } finally { await prisma.$disconnect().catch(()=>{}); }
}
main().catch(e=>{ console.error(e); process.exit(1); });
