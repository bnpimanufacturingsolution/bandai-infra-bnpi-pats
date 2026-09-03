// proof-fp-stickiness-matrix.cjs - FP stickiness matrix for create-enroll architecture reality
// Usage: node scripts/proof-fp-stickiness-matrix.cjs [employeeNo]
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	loadEnv();
	const evidenceRoot = path.resolve(
		__dirname,
		"../../.runtime/create-enroll-arch-reality-20260719-183434",
	);
	const matrixDir = path.join(evidenceRoot, "fp-matrix");
	fs.mkdirSync(matrixDir, { recursive: true });

	const emp =
		String(process.argv[2] || "").trim() ||
		`99${Date.now().toString().slice(-8)}`;
	const prisma = new PrismaClient();
	const out = { emp, startedAt: new Date().toISOString(), attempts: [], winner: null };

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
		if (!login?.data?.token) throw new Error("login failed");
		const token = login.data.token;
		const device = await prisma.device.findFirst({
			where: { address: "192.168.254.102" },
		});
		if (!device) throw new Error("TEST A device not found");
		const deviceId = device.id;
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};
		out.deviceId = deviceId;

		const control = await hikvisionFetch(
			"/ISAPI/AccessControl/FingerPrintUpload?format=json",
			{
				method: "POST",
				deviceId,
				prisma,
				request: req,
				timeoutMs: 15000,
				body: {
					FingerPrintCond: {
						searchID: `ctl${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 8,
						employeeNo: "15",
					},
				},
			},
		);
		const controlFps = normalizeIsapiFingerprintList(control);
		out.controlPerson15 = {
			fpCount: controlFps.length,
			firstLen: controlFps[0]?.data?.length || 0,
			fingerPrintId: controlFps[0]?.fingerPrintId,
			fingerType: controlFps[0]?.fingerType,
		};
		fs.writeFileSync(
			path.join(matrixDir, "control-person15.json"),
			JSON.stringify({ control: out.controlPerson15, raw: control }, null, 2),
		);
		if (!controlFps[0]?.data) throw new Error("control person 15 has no FP");

		const donorData = controlFps[0].data;
		const donorMeta = controlFps[0];

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
						name: `Arch-${emp}`,
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
		out.create = createRes;
		await sleep(1500);

		const cardNo = `9${emp.slice(-8)}`.slice(0, 10);
		try {
			out.cardWrite = await hikvisionFetch(
				"/ISAPI/AccessControl/CardInfo/Record?format=json",
				{
					method: "POST",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 20000,
					body: {
						CardInfo: {
							employeeNo: emp,
							cardNo,
							cardType: "normalCard",
						},
					},
				},
			);
		} catch (e) {
			out.cardWrite = { error: String(e?.message || e) };
		}

		async function reRead() {
			let fps = [];
			let numOfFP = 0;
			let uploadRaw = null;
			let userRaw = null;
			try {
				uploadRaw = await hikvisionFetch(
					"/ISAPI/AccessControl/FingerPrintUpload?format=json",
					{
						method: "POST",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 15000,
						body: {
							FingerPrintCond: {
								searchID: `r${Date.now()}`,
								searchResultPosition: 0,
								maxResults: 10,
								employeeNo: emp,
							},
						},
					},
				);
				fps = normalizeIsapiFingerprintList(uploadRaw);
			} catch (e) {
				uploadRaw = { error: String(e?.message || e) };
			}
			try {
				userRaw = await hikvisionFetch(
					"/ISAPI/AccessControl/UserInfo/Search?format=json",
					{
						method: "POST",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 12000,
						body: {
							UserInfoSearchCond: {
								searchID: `u${Date.now()}`,
								searchResultPosition: 0,
								maxResults: 2,
								EmployeeNoList: [{ employeeNo: emp }],
							},
						},
					},
				);
				const uu = Array.isArray(userRaw?.UserInfoSearch?.UserInfo)
					? userRaw.UserInfoSearch.UserInfo[0]
					: userRaw?.UserInfoSearch?.UserInfo;
				numOfFP = Number(uu?.numOfFP || 0) || 0;
			} catch (e) {
				userRaw = { error: String(e?.message || e) };
			}
			return { fps, numOfFP, uploadRaw, userRaw };
		}

		const strategies = [
			{
				id: "A_isapi_string_normalFP_id1",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: "normalFP",
						fingerData: donorData,
					},
				},
			},
			{
				id: "B_isapi_numeric_type0_id1",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "B2_isapi_cardReaderNo_type0",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						cardReaderNo: 1,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "C_isapi_type0_id1_with_cardNo",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						cardNo,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "D_isapi_type0_id2",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 2,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "E_isapi_type0_id1_no_cardReader",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						fingerPrintID: 1,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "F_isapi_mirror_donor_meta",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: Number(donorMeta.fingerPrintId || 1),
						fingerType:
							donorMeta.fingerType != null ? donorMeta.fingerType : 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "G_isapi_cardReader_1_and_2",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1, 2],
						fingerPrintID: 1,
						fingerType: 0,
						fingerData: donorData,
					},
				},
			},
			{
				id: "H_isapi_leaderFP_type",
				body: {
					FingerPrintCfg: {
						employeeNo: emp,
						enableCardReader: [1],
						fingerPrintID: 1,
						fingerType: "leaderFP",
						fingerData: donorData,
					},
				},
			},
		];

		for (const strat of strategies) {
			const attempt = {
				id: strat.id,
				at: new Date().toISOString(),
				write: null,
				reads: [],
				sticky: false,
			};
			try {
				attempt.write = await hikvisionFetch(
					"/ISAPI/AccessControl/FingerPrintDownload?format=json",
					{
						method: "POST",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 25000,
						body: strat.body,
					},
				);
			} catch (e) {
				attempt.write = { error: String(e?.message || e) };
			}

			const waitSteps = [1000, 2000, 5000, 7000];
			const waitTotals = [1000, 3000, 8000, 15000];
			for (let wi = 0; wi < waitSteps.length; wi++) {
				await sleep(waitSteps[wi]);
				const r = await reRead();
				attempt.reads.push({
					waitMs: waitTotals[wi],
					numOfFP: r.numOfFP,
					fpCount: r.fps.length,
					firstLen: r.fps[0]?.data?.length || 0,
				});
				if (r.fps.length > 0 || r.numOfFP > 0) {
					attempt.sticky = true;
					attempt.winningRead = {
						numOfFP: r.numOfFP,
						fps: r.fps.map((f) => ({
							fingerPrintId: f.fingerPrintId,
							fingerType: f.fingerType,
							length: f.data?.length || 0,
						})),
						templates: r.fps,
					};
					break;
				}
			}

			fs.writeFileSync(
				path.join(matrixDir, `${strat.id}.json`),
				JSON.stringify(attempt, null, 2),
			);
			out.attempts.push({
				id: attempt.id,
				writeOk:
					attempt.write?.statusCode === 1 ||
					attempt.write?.statusString === "OK" ||
					attempt.write?.subStatusCode === "ok",
				write: attempt.write,
				reads: attempt.reads,
				sticky: attempt.sticky,
			});
			console.error(
				`[matrix] ${strat.id} sticky=${attempt.sticky} lastNum=${attempt.reads.at(-1)?.numOfFP} fpCount=${attempt.reads.at(-1)?.fpCount}`,
			);

			if (attempt.sticky) {
				out.winner = {
					strategy: strat.id,
					numOfFP: attempt.winningRead.numOfFP,
					fpCount: attempt.winningRead.fps.length,
					firstLen: attempt.winningRead.templates[0]?.data?.length || 0,
				};
				let deviceUser = await prisma.deviceUser.findFirst({
					where: {
						deviceId,
						OR: [{ vendorUserId: emp }, { employeeNo: emp }],
					},
				});
				if (!deviceUser) {
					deviceUser = await prisma.deviceUser.create({
						data: {
							organizationId: org,
							deviceId,
							vendorUserId: emp,
							employeeNo: emp,
							displayName: `Arch-${emp}`,
							status: "UNMATCHED",
							vendorMetadata: { plane: "DEVICE_USER_INVENTORY" },
							lastSyncedAt: new Date(),
						},
					});
				}
				out.persist = await persistRawFingerprintsFromSdkCallback({
					prisma,
					req,
					organizationId: org,
					deviceId,
					employeeNo: emp,
					deviceUserId: deviceUser.id,
					fingerprints: attempt.winningRead.templates,
					source: `device_fp_read_after_write:${strat.id}`,
				});
				break;
			}
		}

		const finalRead = await reRead();
		out.finalRead = {
			numOfFP: finalRead.numOfFP,
			fpCount: finalRead.fps.length,
			firstLen: finalRead.fps[0]?.data?.length || 0,
		};

		let deviceUser = await prisma.deviceUser.findFirst({
			where: { deviceId, vendorUserId: emp },
		});
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
							searchID: `f${Date.now()}`,
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
						displayName: uu.name || `Arch-${emp}`,
						status: "UNMATCHED",
						rawPayload: uu,
						vendorMetadata: { plane: "DEVICE_USER_INVENTORY" },
						lastSyncedAt: new Date(),
					},
				});
			}
		}
		out.deviceUserId = deviceUser?.id || null;
		out.finishedAt = new Date().toISOString();
		out.exitMatrix = out.winner ? "STICKY_OK" : "ALL_STRATEGIES_NUMOFP_ZERO";
		fs.writeFileSync(
			path.join(matrixDir, "matrix-summary.json"),
			JSON.stringify(out, null, 2),
		);
		console.log(JSON.stringify(out, null, 2));
		process.exitCode = out.winner ? 0 : 3;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
