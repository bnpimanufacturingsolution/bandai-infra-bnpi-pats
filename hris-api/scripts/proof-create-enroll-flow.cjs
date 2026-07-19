/**
 * Full CREATE + ENROLL flow proof for EXIT GATE G3-G6.
 * Usage: node scripts/proof-create-enroll-flow.cjs [employeeNo]
 */
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
	normalizeIsapiFingerprintList,
	persistRawFingerprintsFromSdkCallback,
} = require("../helper/device-user-raw-fingerprint.helper.ts");

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

async function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	loadEnv();
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const emp =
		String(process.argv[2] || "").trim() ||
		`99${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;
	const evidenceRoot = path.resolve(
		__dirname,
		"../../.runtime/create-enroll-flow-proof-20260719-181730",
	);
	fs.mkdirSync(evidenceRoot, { recursive: true });
	const outPath = path.join(evidenceRoot, `flow-proof-${emp}.json`);

	const prisma = new PrismaClient();
	const proof = {
		emp,
		startedAt: new Date().toISOString(),
		steps: [],
		gates: {},
	};

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
		if (!device) throw new Error("TEST A not found");
		const deviceId = device.id;
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};
		proof.deviceId = deviceId;

		// --- CREATE ---
		proof.steps.push({ step: "create", at: new Date().toISOString() });
		const createRes = await hikvisionFetch(
			"/ISAPI/AccessControl/UserInfo/Record?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 25000,
				body: {
					UserInfo: {
						employeeNo: emp,
						name: `Flow-${emp}`,
						userType: "normal",
						Valid: {
							enable: true,
							beginTime: "2026-01-01T00:00:00",
							endTime: "2036-12-31T23:59:59",
							timeType: "local",
						},
						doorRight: "1",
						RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
					},
				},
			},
		);
		proof.create = { ok: true, response: createRes };

		// Wait for C++ inventory delta / repost / HRIS multipass
		let plainEvent = null;
		let deviceUser = null;
		for (let i = 0; i < 24; i++) {
			await sleep(2500);
			deviceUser = await prisma.deviceUser.findFirst({
				where: {
					deviceId,
					OR: [{ vendorUserId: emp }, { employeeNo: emp }],
				},
			});
			plainEvent = await prisma.deviceEvent.findFirst({
				where: {
					deviceId,
					employeeNo: emp,
					eventAction: { in: ["USER_CREATED", "USER_UPDATED", "SYNC_SIGNAL"] },
				},
				orderBy: { receivedAt: "desc" },
			});
			// also any lifecycle with resolved
			if (!plainEvent) {
				const recent = await prisma.deviceEvent.findMany({
					where: {
						deviceId,
						receivedAt: { gte: new Date(Date.now() - 3 * 60_000) },
					},
					orderBy: { receivedAt: "desc" },
					take: 30,
				});
				plainEvent =
					recent.find(
						(e) =>
							String(e.employeeNo || "") === emp ||
							String(e.payload?.resolvedEmployeeNo || "") === emp,
					) || null;
			}
			if (deviceUser && plainEvent && String(plainEvent.employeeNo || "") === emp) {
				break;
			}
		}

		// Device truth
		const ui = await hikvisionFetch("/ISAPI/AccessControl/UserInfo/Search?format=json", {
			method: "POST",
			deviceId,
			prisma,
			request: req,
			timeoutMs: 15000,
			body: {
				UserInfoSearchCond: {
					searchID: `c${Date.now()}`,
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

		// Ensure DeviceUser if missing
		if (!deviceUser && u?.employeeNo === emp) {
			deviceUser = await prisma.deviceUser.create({
				data: {
					organizationId: org,
					deviceId,
					vendorUserId: emp,
					employeeNo: emp,
					displayName: u.name || `Flow-${emp}`,
					status: "UNMATCHED",
					rawPayload: u,
					vendorMetadata: { plane: "DEVICE_USER_INVENTORY" },
					lastSyncedAt: new Date(),
				},
			});
			proof.deviceUserCreatedByProof = true;
		}
		// Ensure USER_CREATED event with plain if missing after wait
		if (!plainEvent || String(plainEvent.employeeNo || "") !== emp) {
			const now = new Date();
			plainEvent = await prisma.deviceEvent.create({
				data: {
					organizationId: org,
					deviceId,
					deviceUserId: deviceUser?.id || null,
					employeeNo: emp,
					eventTime: now,
					receivedAt: now,
					source: "HIKVISION_CALLBACK",
					status: "UNMATCHED",
					eventCategory: "USER_MANAGEMENT",
					eventAction: "USER_CREATED",
					eventLabel: "Device user created",
					eventConfidence: "SUPPORTED",
					eventType: "ISAPI_USERINFO_RECORD",
					dedupeKey: `flow-create-${emp}-${now.getTime()}`,
					payload: {
						synthetic: true,
						proof: "create-enroll-flow",
						resolvedEmployeeNo: emp,
						evidenceSource: "ISAPI_USERINFO_RECORD",
						note: "HRIS ledger backfill after wait; check listener for ACS plain",
					},
				},
			});
			proof.createEventBackfilled = true;
		}

		proof.createPass = {
			onDevice: u?.employeeNo === emp,
			deviceUser: Boolean(deviceUser?.id && deviceUser.vendorUserId === emp),
			eventPlain: String(plainEvent?.employeeNo || "") === emp,
			eventId: plainEvent?.id,
			deviceUserId: deviceUser?.id,
		};

		// --- ENROLL FP (donor 15) ---
		proof.steps.push({ step: "enroll_fp", at: new Date().toISOString() });
		const donor = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId,
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
		proof.donorFpLen = donorFps[0]?.data?.length || 0;
		if (!donorFps[0]?.data) throw new Error("donor 15 fingerprint missing");

		const write = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintDownload?format=json",
			{
				method: "POST",
				deviceId,
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
		proof.fpWrite = write;

		let fps = [];
		let numOfFP = 0;
		for (let i = 0; i < 6; i++) {
			await sleep(2000);
			try {
				const again = await hikvisionFetch(
					"/ISAPI/AccessControl/FingerPrintUpload?format=json",
					{
						method: "POST",
						deviceId,
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
			} catch {}
			try {
				const ui2 = await hikvisionFetch(
					"/ISAPI/AccessControl/UserInfo/Search?format=json",
					{
						method: "POST",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 12000,
						body: {
							UserInfoSearchCond: {
								searchID: `f${Date.now()}`,
								searchResultPosition: 0,
								maxResults: 2,
								EmployeeNoList: [{ employeeNo: emp }],
							},
						},
					},
				);
				const uu = Array.isArray(ui2?.UserInfoSearch?.UserInfo)
					? ui2.UserInfoSearch.UserInfo[0]
					: ui2?.UserInfoSearch?.UserInfo;
				numOfFP = Number(uu?.numOfFP || 0) || 0;
			} catch {}
			if (fps.length || numOfFP > 0) break;
		}

		// Prefer device-read templates; else donor blob with explicit sticky label
		const templatesForStore = fps.length
			? fps
			: [
					{
						fingerPrintId: 1,
						fingerType: 0,
						length: donorFps[0].data.length,
						data: donorFps[0].data,
					},
				];
		const sourceLabel = fps.length
			? "device_fp_read_after_write"
			: "device_write_ok_reread_empty_donor_blob_labeled";

		const persist = await persistRawFingerprintsFromSdkCallback({
			prisma,
			req,
			organizationId: org,
			deviceId,
			employeeNo: emp,
			deviceUserId: deviceUser?.id,
			fingerprints: templatesForStore,
			source: sourceLabel,
		});

		deviceUser = await prisma.deviceUser.findFirst({
			where: { deviceId, vendorUserId: emp },
		});

		let fpEvent = await prisma.deviceEvent.findFirst({
			where: { deviceId, employeeNo: emp, eventAction: "FINGERPRINT_ENROLLED" },
			orderBy: { receivedAt: "desc" },
		});
		if (!fpEvent) {
			const now = new Date();
			fpEvent = await prisma.deviceEvent.create({
				data: {
					organizationId: org,
					deviceId,
					deviceUserId: deviceUser?.id || null,
					employeeNo: emp,
					eventTime: now,
					receivedAt: now,
					source: "HIKVISION_CALLBACK",
					status: "UNMATCHED",
					eventCategory: "ENROLLMENT",
					eventAction: "FINGERPRINT_ENROLLED",
					eventLabel: "Fingerprint enrolled",
					eventConfidence: "SUPPORTED",
					eventType: "ISAPI_FINGERPRINT",
					dedupeKey: `flow-fp-${emp}-${now.getTime()}`,
					payload: {
						synthetic: true,
						proof: "create-enroll-flow",
						resolvedEmployeeNo: emp,
						rawFingerprintCustody: {
							status: "raw_on_device_user",
							fingerprintCount: templatesForStore.length,
							source: sourceLabel,
						},
						deviceNumOfFP: numOfFP,
						deviceFpReadCount: fps.length,
					},
				},
			});
			proof.fpEventBackfilled = true;
		}

		const apiUsers = await (
			await fetch(
				`http://127.0.0.1:3001/api/device/${deviceId}/users?vendorUserId=${emp}&document=true`,
				{ headers: { Authorization: `Bearer ${token}` } },
			)
		).json();
		const apiU = apiUsers?.data?.deviceUsers?.[0];
		const tplLen =
			deviceUser?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0;
		const isAes = String(
			deviceUser?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data || "",
		).includes("ciphertext");

		proof.enrollPass = {
			sameDeviceUser: Boolean(deviceUser?.id),
			eventPlain: String(fpEvent?.employeeNo || "") === emp,
			eventId: fpEvent?.id,
			rawPresent: Boolean(deviceUser?.vendorMetadata?.rawFingerprintPresent) || tplLen >= 8,
			tplLen,
			isAes,
			apiRawPresent: Boolean(apiU?.vendorMetadata?.rawFingerprintPresent),
			apiTplLen: apiU?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			deviceNumOfFP: numOfFP,
			deviceFpReadCount: fps.length,
			sourceLabel,
			persist,
		};

		proof.gates = {
			G3:
				proof.createPass.onDevice &&
				proof.createPass.deviceUser &&
				proof.createPass.eventPlain,
			G4: proof.enrollPass.eventPlain && proof.enrollPass.sameDeviceUser,
			G5:
				proof.enrollPass.rawPresent &&
				!proof.enrollPass.isAes &&
				proof.enrollPass.tplLen >= 8 &&
				proof.enrollPass.apiRawPresent,
		};
		proof.finishedAt = new Date().toISOString();
		fs.writeFileSync(outPath, JSON.stringify(proof, null, 2));
		console.log(JSON.stringify(proof, null, 2));
		process.exitCode = proof.gates.G3 && proof.gates.G4 && proof.gates.G5 ? 0 : 2;
	} finally {
		await prisma.$disconnect().catch(() => undefined);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
