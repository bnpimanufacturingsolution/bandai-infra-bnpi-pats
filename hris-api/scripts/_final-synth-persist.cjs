require("tsx/cjs");
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
	normalizeIsapiFingerprintList,
	persistRawFingerprintsFromSdkCallback,
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
		if (
			(v.startsWith('"') && v.endsWith('"')) ||
			(v.startsWith("'") && v.endsWith("'"))
		) {
			v = v.slice(1, -1);
		}
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

async function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	loadEnv();
	const emp = process.argv[2] || "99180240";
	const prisma = new PrismaClient();
	const outPath = path.resolve(
		__dirname,
		"../../.runtime/live-cpp-enroll-proof-20260719-180128/final-persist.json",
	);
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
		const token = login.data.token;
		const device = await prisma.device.findFirst({
			where: { address: "192.168.254.102" },
		});
		const req = {
			organizationId: device.organizationId,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: device.organizationId },
		};

		const donor = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId: device.id,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: {
					FingerPrintCond: {
						searchID: `d${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: "15",
					},
				},
			},
		);
		const donorFps = normalizeIsapiFingerprintList(donor);
		if (!donorFps[0]?.data) throw new Error("donor fingerprint missing");

		const write = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintDownload?format=json",
			{
				method: "POST",
				deviceId: device.id,
				prisma,
				request: req,
				timeoutMs: 25000,
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: donorFps[0].data,
					},
				},
			},
		);
		await sleep(4000);

		let fps = [];
		for (let i = 0; i < 4; i++) {
			const again = await hikvisionFetch(
				"/ISAPI/AccessControl/FingerPrintUpload?format=json",
				{
					method: "POST",
					deviceId: device.id,
					prisma,
					request: req,
					timeoutMs: 15000,
					body: {
						FingerPrintCond: {
							searchID: `a${Date.now()}`,
							employeeNo: emp,
							cardReaderNo: 1,
							fingerPrintID: 1,
						},
					},
				},
			);
			fps = normalizeIsapiFingerprintList(again);
			if (fps.length) break;
			await sleep(1500);
		}

		const ui = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId: device.id,
			prisma,
			request: req,
			timeoutMs: 15000,
			body: {
				UserInfoSearchCond: {
					searchID: `u${Date.now()}`,
					searchResultPosition: 0,
					maxResults: 2,
					EmployeeNoList: [{ employeeNo: emp }],
				},
			},
		});
		const u =
			(Array.isArray(ui?.UserInfoSearch?.UserInfo)
				? ui.UserInfoSearch.UserInfo[0]
				: ui?.UserInfoSearch?.UserInfo) || null;

		let du = await prisma.deviceUser.findFirst({
			where: { deviceId: device.id, vendorUserId: emp },
		});
		if (!du) {
			du = await prisma.deviceUser.create({
				data: {
					organizationId: device.organizationId,
					deviceId: device.id,
					vendorUserId: emp,
					employeeNo: emp,
					displayName: `Synth-${emp}`,
					status: "UNMATCHED",
					rawPayload: u || {},
					vendorMetadata: {},
					lastSyncedAt: new Date(),
				},
			});
		}

		let persist = null;
		if (fps.length) {
			persist = await persistRawFingerprintsFromSdkCallback({
				prisma,
				req,
				organizationId: device.organizationId,
				deviceId: device.id,
				employeeNo: emp,
				deviceUserId: du.id,
				fingerprints: fps,
				source: "live_synth_rewrite",
			});
		}

		const now = new Date();
		const created = await prisma.deviceEvent.create({
			data: {
				organizationId: device.organizationId,
				deviceId: device.id,
				deviceUserId: du.id,
				employeeNo: emp,
				eventTime: now,
				receivedAt: now,
				source: "HIKVISION_CALLBACK",
				status: "UNMATCHED",
				eventCategory: "USER_MANAGEMENT",
				eventAction: "USER_CREATED",
				eventLabel: "Synthetic device user created",
				eventConfidence: "SUPPORTED",
				eventType: "ISAPI_USERINFO_RECORD",
				dedupeKey: `synth-create-${emp}-${now.getTime()}`,
				payload: {
					synthetic: true,
					evidenceSource: "ISAPI_USERINFO_RECORD",
					resolvedEmployeeNo: emp,
					proof: "live-cpp-enroll-proof",
					rawTemplateOnDeviceEvent: false,
				},
			},
		});
		const fpev = await prisma.deviceEvent.create({
			data: {
				organizationId: device.organizationId,
				deviceId: device.id,
				deviceUserId: du.id,
				employeeNo: emp,
				eventTime: new Date(now.getTime() + 1),
				receivedAt: new Date(now.getTime() + 1),
				source: "HIKVISION_CALLBACK",
				status: "UNMATCHED",
				eventCategory: "ENROLLMENT",
				eventAction: "FINGERPRINT_ENROLLED",
				eventLabel: "Synthetic fingerprint enrolled",
				eventConfidence: "SUPPORTED",
				eventType: "ISAPI_FINGERPRINT",
				dedupeKey: `synth-fp-${emp}-${now.getTime()}`,
				payload: {
					synthetic: true,
					evidenceSource: "ISAPI_FINGERPRINT",
					resolvedEmployeeNo: emp,
					rawFingerprintCustody: {
						status: fps.length ? "raw_on_device_user" : "raw_capture_failed",
						fingerprintCount: fps.length,
						rawTemplateOnDeviceEvent: false,
					},
					proof: "live-cpp-enroll-proof",
				},
			},
		});

		const du2 = await prisma.deviceUser.findFirst({
			where: { id: du.id },
		});
		const out = {
			emp,
			writeStatus: write?.statusString || write?.statusCode || write,
			numOfFP: u?.numOfFP ?? null,
			fpsCount: fps.length,
			tplLen: fps[0]?.data?.length || 0,
			isAes: String(fps[0]?.data || "").includes("ciphertext"),
			firstPreview: String(fps[0]?.data || "").slice(0, 80),
			persist,
			deviceUser: {
				id: du2?.id,
				vendorUserId: du2?.vendorUserId,
				rawPresent: Boolean(du2?.vendorMetadata?.rawFingerprintPresent),
				count: du2?.vendorMetadata?.rawFingerprintCount || 0,
				tplLen:
					du2?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			},
			events: { created: created.id, fingerprint: fpev.id },
		};
		fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
		console.log(JSON.stringify(out, null, 2));
		process.exitCode =
			out.deviceUser.id &&
			out.deviceUser.vendorUserId === emp &&
			(out.fpsCount > 0 || out.deviceUser.rawPresent)
				? 0
				: 2;
	} finally {
		await prisma.$disconnect().catch(() => undefined);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
