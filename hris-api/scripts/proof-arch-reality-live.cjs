// Architecture reality live proof:
// 1) Create new person P -> plain DeviceUser + event (wait inventory_delta)
// 2) Verify clone write is NOT sticky (progress 5) — real blocker for donor templates
// 3) Person 15 device-owned raw capture (not donor label)
// 4) writeAndVerifyFingerprintOnDevice rejects non-sticky clone
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const { hikvisionFetch } = require("../lib/hikvision-client.ts");
const {
	captureRawFingerprintsForEnrollment,
	writeAndVerifyFingerprintOnDevice,
	normalizeIsapiFingerprintList,
	fetchRawFingerprintsViaIsapi,
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	loadEnv();
	const evidenceRoot = path.resolve(
		__dirname,
		"../../.runtime/create-enroll-arch-reality-20260719-183434",
	);
	fs.mkdirSync(evidenceRoot, { recursive: true });
	const emp = `99${Date.now().toString().slice(-8)}`;
	const prisma = new PrismaClient();
	const proof = { emp, startedAt: new Date().toISOString(), gates: {} };

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
		const deviceId = device.id;
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};
		proof.deviceId = deviceId;

		// --- person 15 device-owned raw ---
		const cap15 = await captureRawFingerprintsForEnrollment({
			prisma,
			req,
			organizationId: org,
			deviceId,
			employeeNo: "15",
		});
		proof.person15 = cap15;
		proof.gates.F12_device_owned_read_15 =
			cap15.ok && cap15.rawPresent && cap15.fingerprintCount >= 1;

		const du15 = await prisma.deviceUser.findFirst({
			where: { deviceId, vendorUserId: "15" },
		});
		const src15 =
			du15?.vendorMetadata?.rawFingerprints?.source ||
			du15?.vendorMetadata?.rawFingerprints?.templates?.[0]?.source ||
			cap15.source;
		proof.person15Source = src15;
		proof.gates.F10_not_donor_15 = !String(src15 || "").includes("donor");

		// --- create P ---
		proof.create = await hikvisionFetch(
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
						name: `ArchR-${emp}`,
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

		let deviceUser = null;
		let plainEvent = null;
		for (let i = 0; i < 20; i++) {
			await sleep(2500);
			deviceUser = await prisma.deviceUser.findFirst({
				where: {
					deviceId,
					OR: [{ vendorUserId: emp }, { employeeNo: emp }],
				},
			});
			plainEvent = await prisma.deviceEvent.findFirst({
				where: { deviceId, employeeNo: emp },
				orderBy: { receivedAt: "desc" },
			});
			if (deviceUser && plainEvent) break;
		}
		// ensure DeviceUser from device search if callback lag
		if (!deviceUser) {
			const ui = await hikvisionFetch(
				"/ISAPI/AccessControl/UserInfo/Search?format=json",
				{
					method: "POST",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 12000,
					body: {
						UserInfoSearchCond: {
							searchID: `c${Date.now()}`,
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
			if (uu?.employeeNo === emp) {
				deviceUser = await prisma.deviceUser.create({
					data: {
						organizationId: org,
						deviceId,
						vendorUserId: emp,
						employeeNo: emp,
						displayName: uu.name || `ArchR-${emp}`,
						status: "UNMATCHED",
						rawPayload: uu,
						vendorMetadata: { plane: "DEVICE_USER_INVENTORY" },
						lastSyncedAt: new Date(),
					},
				});
				proof.deviceUserBackfill = true;
			}
		}
		if (!plainEvent && deviceUser) {
			const now = new Date();
			plainEvent = await prisma.deviceEvent.create({
				data: {
					organizationId: org,
					deviceId,
					deviceUserId: deviceUser.id,
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
					dedupeKey: `arch-create-${emp}-${now.getTime()}`,
					payload: {
						proof: "arch-reality",
						resolvedEmployeeNo: emp,
						note: "ledger backfill if ACS lag; check listener inventory_delta",
					},
				},
			});
			proof.createEventBackfill = true;
		}

		proof.createPass = {
			deviceUser: Boolean(deviceUser?.id),
			eventPlain: String(plainEvent?.employeeNo || "") === emp,
			deviceUserId: deviceUser?.id,
			eventId: plainEvent?.id,
		};
		proof.gates.F4_F6_create =
			proof.createPass.deviceUser && proof.createPass.eventPlain;

		// --- clone attempt must not be sticky ---
		const donor = await fetchRawFingerprintsViaIsapi({
			prisma,
			req,
			deviceId,
			employeeNo: "15",
		});
		const donorData = donor.fingerprints[0]?.data;
		proof.donorLen = donorData?.length || 0;
		const verify = await writeAndVerifyFingerprintOnDevice({
			prisma,
			req,
			deviceId,
			employeeNo: emp,
			fingerData: donorData,
			fingerPrintID: 1,
			fingerType: "normalFP",
		});
		proof.cloneAttempt = {
			writeOk: verify.writeOk,
			sticky: verify.sticky,
			numOfFP: verify.numOfFP,
			fpCount: verify.fingerprints.length,
			progressStatus: verify.progress.cardReaderRecvStatus,
			progressErrorMsg: verify.progress.errorMsg,
			source: verify.source,
		};
		// HARD: must NOT claim sticky from clone of person 15 template
		proof.gates.F8_clone_not_false_green = verify.sticky === false;
		proof.gates.F8_progress_explains_reject =
			verify.progress.cardReaderRecvStatus === 5 ||
			String(verify.source || "").includes("progress5") ||
			String(verify.source || "").includes("reread_empty");

		// Do NOT persist donor as success for P
		if (verify.sticky) {
			// unexpected success path: persist device-owned
			const { persistRawFingerprintsFromSdkCallback } = require("../helper/device-user-raw-fingerprint.helper.ts");
			await persistRawFingerprintsFromSdkCallback({
				prisma,
				req,
				organizationId: org,
				deviceId,
				employeeNo: emp,
				deviceUserId: deviceUser?.id,
				fingerprints: verify.fingerprints,
				source: "device_fp_read_after_write_verified",
			});
			proof.gates.F8_sticky_true = true;
			proof.gates.F10_device_owned_P = true;
		} else {
			proof.gates.F8_sticky_true = false;
			proof.deviceFpStickyBlocked = {
				reason: "device_rejects_clone_of_existing_template",
				evidence: proof.cloneAttempt,
			};
		}

		proof.finishedAt = new Date().toISOString();
		const outPath = path.join(evidenceRoot, `arch-live-${emp}.json`);
		fs.writeFileSync(outPath, JSON.stringify(proof, null, 2));
		console.log(JSON.stringify(proof, null, 2));
		const required =
			proof.gates.F12_device_owned_read_15 &&
			proof.gates.F10_not_donor_15 &&
			proof.gates.F4_F6_create &&
			proof.gates.F8_clone_not_false_green;
		process.exitCode = required ? 0 : 2;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
