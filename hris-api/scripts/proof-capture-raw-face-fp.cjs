// Capture raw FP (+ optional face picture meta) for device person and print modal-ready shape
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const {
	captureRawFingerprintsForEnrollment,
} = require("../helper/device-user-raw-fingerprint.helper.ts");
const { hikvisionFetch, hikvisionFetchBinary } = require("../lib/hikvision-client.ts");

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
	const emp = process.argv[3] || "16";
	const prisma = new PrismaClient();
	const out = { deviceId, emp, startedAt: new Date().toISOString() };
	try {
		const login = await (
			await fetch("http://127.0.0.1:3001/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@bandai.local",
					password: "password123",
					appCode: "hris",
				}),
			})
		).json();
		const token = login?.data?.token;
		if (!token) throw new Error("login failed: " + JSON.stringify(login));
		const device = await prisma.device.findUnique({ where: { id: deviceId } });
		if (!device) throw new Error("device missing");
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};

		const before = await prisma.deviceUser.findFirst({
			where: { deviceId, OR: [{ vendorUserId: emp }, { employeeNo: emp }] },
		});
		out.before = {
			id: before?.id,
			rawPresent: before?.vendorMetadata?.rawFingerprintPresent,
			tplLen: before?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			faceUrl: before?.rawPayload?.faceURL || before?.rawPayload?.UserInfo?.faceURL || null,
			facePicPresent: Boolean(
				before?.vendorMetadata?.rawFace?.present ||
					before?.rawPayload?._hrisDeviceMetadata?.rawFace?.present,
			),
		};

		const fp = await captureRawFingerprintsForEnrollment({
			prisma,
			req,
			organizationId: org,
			deviceId,
			employeeNo: emp,
			deviceUserId: before?.id || null,
		});
		out.fpCapture = fp;

		// Face: read UserInfo faceURL and store base64 snapshot on DeviceUser when available
		let faceResult = { ok: false, reason: "no_face_url" };
		try {
			const ui = await hikvisionFetch(
				"/ISAPI/AccessControl/UserInfo/Search?format=json",
				{
					method: "POST",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 15000,
					body: {
						UserInfoSearchCond: {
							searchID: `face-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 2,
							EmployeeNoList: [{ employeeNo: emp }],
						},
					},
				},
			);
			const uu = Array.isArray(ui?.UserInfoSearch?.UserInfo)
				? ui.UserInfoSearch.UserInfo[0]
				: ui?.UserInfoSearch?.UserInfo;
			const faceURL = String(uu?.faceURL || "").trim();
			out.userInfo = {
				employeeNo: uu?.employeeNo,
				numOfFP: uu?.numOfFP,
				numOfFace: uu?.numOfFace,
				faceURL: faceURL ? faceURL.slice(0, 120) : null,
			};
			if (faceURL) {
				// Prefer relative path fetch via hikvision client when same host
				let picPath = faceURL;
				try {
					const u = new URL(faceURL);
					picPath = `${u.pathname}${u.search}`;
				} catch {
					/* keep */
				}
				let binary = null;
				try {
					binary = await hikvisionFetchBinary(picPath, {
						method: "GET",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 20000,
					});
				} catch (e) {
					faceResult = { ok: false, reason: String(e?.message || e) };
				}
				if (binary?.buffer || binary?.data || Buffer.isBuffer(binary)) {
					const buf = Buffer.isBuffer(binary)
						? binary
						: Buffer.isBuffer(binary.buffer)
							? binary.buffer
							: Buffer.from(binary.data || binary.body || []);
					const b64 = buf.toString("base64");
					const contentType =
						binary.contentType || binary.headers?.["content-type"] || "image/jpeg";
					const row = await prisma.deviceUser.findFirst({
						where: {
							deviceId,
							OR: [{ vendorUserId: emp }, { employeeNo: emp }],
						},
					});
					if (row) {
						const priorVm = row.vendorMetadata || {};
						const priorRaw = row.rawPayload || {};
						const rawFace = {
							schema: "project-truth.hikvision-face-raw.v1",
							present: b64.length > 32,
							capturedAt: new Date().toISOString(),
							source: "isapi_faceURL_download",
							contentType,
							byteLength: buf.length,
							base64: b64,
							faceURL,
						};
						const vendorMetadata = {
							...priorVm,
							rawFace,
							rawFacePresent: true,
							credentialSummary: {
								...(priorVm.credentialSummary || {}),
								hasFace: true,
								faceCount: Math.max(
									Number(priorVm.credentialSummary?.faceCount || 0) || 0,
									1,
								),
							},
						};
						const rawPayload = {
							...priorRaw,
							...uu,
							faceURL,
							_hrisDeviceMetadata: {
								...(priorRaw._hrisDeviceMetadata || {}),
								rawFace,
							},
						};
						await prisma.deviceUser.update({
							where: { id: row.id },
							data: { vendorMetadata, rawPayload, lastSyncedAt: new Date() },
						});
						faceResult = {
							ok: true,
							byteLength: buf.length,
							b64Len: b64.length,
							contentType,
						};
					}
				}
			}
		} catch (e) {
			faceResult = { ok: false, reason: String(e?.message || e) };
		}
		out.faceCapture = faceResult;

		const after = await prisma.deviceUser.findFirst({
			where: { deviceId, OR: [{ vendorUserId: emp }, { employeeNo: emp }] },
		});
		out.after = {
			rawPresent: after?.vendorMetadata?.rawFingerprintPresent,
			fpCount: after?.vendorMetadata?.rawFingerprintCount,
			tplLen: after?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			tplPreview: String(
				after?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data || "",
			).slice(0, 80),
			fpSource: after?.vendorMetadata?.rawFingerprints?.source,
			facePresent: Boolean(after?.vendorMetadata?.rawFacePresent),
			faceBytes: after?.vendorMetadata?.rawFace?.byteLength || 0,
			faceB64Len: after?.vendorMetadata?.rawFace?.base64?.length || 0,
			credentialSummary: after?.vendorMetadata?.credentialSummary,
		};

		// API list shape (what modal loads)
		const api = await (
			await fetch(
				`http://127.0.0.1:3001/api/device/${deviceId}/users?vendorUserId=${emp}`,
				{ headers: { Authorization: `Bearer ${token}` } },
			)
		).json();
		const apiU = api?.data?.deviceUsers?.[0];
		out.api = {
			rawPresent: apiU?.vendorMetadata?.rawFingerprintPresent,
			tplLen: apiU?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			facePresent: apiU?.vendorMetadata?.rawFacePresent,
			faceB64Len: apiU?.vendorMetadata?.rawFace?.base64?.length || 0,
		};

		const dir = path.resolve(__dirname, "../../.runtime/user16-raw-fp-journey");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, `capture-fp-face-${emp}.json`),
			JSON.stringify(out, null, 2),
		);
		console.log(JSON.stringify(out, null, 2));
		process.exitCode =
			out.after.rawPresent && out.after.tplLen >= 8 && out.api.tplLen >= 8 ? 0 : 2;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
