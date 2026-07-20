/**
 * Live synthetic proof: create device user + copy fingerprint template from donor.
 * Then query DeviceEvents/DeviceUsers and dump listener log markers.
 *
 * Usage: node scripts/live-synthetic-enroll-proof.cjs [newEmployeeNo] [donorEmployeeNo=15]
 */
const path = require("path");
const fs = require("fs");

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq < 1) continue;
		const k = t.slice(0, eq).trim();
		let v = t.slice(eq + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
}
function forceLocalDb() {
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
	const newEmp = String(process.argv[2] || `99${Date.now().toString().slice(-4)}`).trim();
	const donorEmp = String(process.argv[3] || "15").trim();
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const evidenceDir = path.resolve(__dirname, "..", "..", ".runtime", `live-synth-enroll-${stamp}`);
	fs.mkdirSync(evidenceDir, { recursive: true });

	loadEnvFile(path.resolve(__dirname, "..", ".env"));
	forceLocalDb();
	require("tsx/cjs");
	const { PrismaClient } = require("../generated/prisma");
	const { hikvisionFetch } = require("../lib/hikvision-client.ts");
	const {
		captureRawFingerprintsForEnrollment,
		normalizeIsapiFingerprintList,
	} = require("../helper/device-user-raw-fingerprint.helper.ts");

	const prisma = new PrismaClient();
	const summary = {
		newEmp,
		donorEmp,
		evidenceDir,
		steps: [],
	};

	try {
		const loginRes = await fetch("http://127.0.0.1:3001/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "admin@bandai.local",
				password: "password123",
				appCode: "hris",
			}),
		});
		const loginJson = await loginRes.json();
		const token = loginJson?.data?.token;
		if (!token) throw new Error("login failed");

		const device = await prisma.device.findFirst({
			where: { address: "192.168.254.102" },
		});
		if (!device) throw new Error("TEST A device not found");
		const deviceId = device.id;
		const organizationId = device.organizationId;
		const req = {
			organizationId,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId },
			userOrganizationId: organizationId,
		};
		summary.device = { id: deviceId, name: device.name, address: device.address };

		// Snapshot events before
		const beforeEvents = await prisma.deviceEvent.findMany({
			where: { deviceId },
			orderBy: { receivedAt: "desc" },
			take: 5,
			select: {
				id: true,
				employeeNo: true,
				eventAction: true,
				source: true,
				receivedAt: true,
				payload: true,
			},
		});
		fs.writeFileSync(
			path.join(evidenceDir, "events-before.json"),
			JSON.stringify(beforeEvents, null, 2),
		);

		// 1) Create user via ISAPI UserInfo/Record
		summary.steps.push({ step: "create_user", at: new Date().toISOString() });
		try {
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
							employeeNo: newEmp,
							name: `Synth-${newEmp}`,
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
			summary.createUser = { ok: true, response: createRes };
		} catch (e) {
			summary.createUser = { ok: false, error: String(e?.message || e) };
		}
		fs.writeFileSync(
			path.join(evidenceDir, "create-user.json"),
			JSON.stringify(summary.createUser, null, 2),
		);

		// Wait for ACS / listener / multipass
		await sleep(4000);

		// 2) Read donor fingerprint template (ISAPI)
		summary.steps.push({ step: "read_donor_fp", at: new Date().toISOString() });
		let donorTemplates = [];
		try {
			const bulk = await hikvisionFetch(
				"/ISAPI/AccessControl/FingerPrintUpload?format=json",
				{
					method: "POST",
					deviceId,
					prisma,
					request: req,
					timeoutMs: 15000,
					body: {
						FingerPrintCond: {
							searchID: `synth-donor-${Date.now()}`,
							searchResultPosition: 0,
							maxResults: 32,
							employeeNo: donorEmp,
						},
					},
				},
			);
			donorTemplates = normalizeIsapiFingerprintList(bulk);
			summary.donorTemplates = {
				count: donorTemplates.length,
				firstLen: donorTemplates[0]?.data?.length || 0,
				preview: String(donorTemplates[0]?.data || "").slice(0, 60),
			};
		} catch (e) {
			summary.donorTemplates = { error: String(e?.message || e) };
		}

		// 3) Synthetic enroll: write donor fingerData onto newEmp
		summary.steps.push({ step: "write_fp_to_new", at: new Date().toISOString() });
		if (donorTemplates.length) {
			const fp = donorTemplates[0];
			try {
				const writeRes = await hikvisionFetch(
					"/ISAPI/AccessControl/FingerPrintDownload?format=json",
					{
						method: "POST",
						deviceId,
						prisma,
						request: req,
						timeoutMs: 20000,
						body: {
							FingerPrintCfg: {
								employeeNo: newEmp,
								enableCardReader: [1],
								fingerPrintID: Number(fp.fingerPrintId || 1),
								fingerType: "normalFP",
								fingerData: fp.data,
							},
						},
					},
				);
				summary.writeFp = { ok: true, response: writeRes };
			} catch (e) {
				summary.writeFp = { ok: false, error: String(e?.message || e) };
			}
		} else {
			summary.writeFp = { ok: false, error: "no_donor_template" };
		}
		fs.writeFileSync(
			path.join(evidenceDir, "write-fp.json"),
			JSON.stringify(summary.writeFp, null, 2),
		);

		// Wait for listener ACS + enrich + HRIS
		await sleep(8000);

		// 4) Also force HRIS raw capture for newEmp (proves ISAPI path even if ACS empty)
		summary.steps.push({ step: "hris_raw_capture", at: new Date().toISOString() });
		try {
			summary.hrisRawCapture = await captureRawFingerprintsForEnrollment({
				prisma,
				req,
				organizationId,
				deviceId,
				employeeNo: newEmp,
				eventId: null,
			});
		} catch (e) {
			summary.hrisRawCapture = { ok: false, error: String(e?.message || e) };
		}

		// 5) Read DeviceUser + recent events for newEmp
		const deviceUser = await prisma.deviceUser.findFirst({
			where: {
				deviceId,
				OR: [{ vendorUserId: newEmp }, { employeeNo: newEmp }],
			},
		});
		const events = await prisma.deviceEvent.findMany({
			where: {
				deviceId,
				OR: [
					{ employeeNo: newEmp },
					{ receivedAt: { gte: new Date(Date.now() - 3 * 60_000) } },
				],
			},
			orderBy: { receivedAt: "desc" },
			take: 20,
			select: {
				id: true,
				employeeNo: true,
				eventAction: true,
				eventCategory: true,
				source: true,
				status: true,
				receivedAt: true,
				payload: true,
				deviceUserId: true,
			},
		});

		const rawFp =
			deviceUser?.vendorMetadata?.rawFingerprints ||
			deviceUser?.rawPayload?._hrisDeviceMetadata?.rawFingerprints ||
			null;
		const templates = rawFp?.templates || [];

		summary.result = {
			deviceUserId: deviceUser?.id || null,
			vendorUserId: deviceUser?.vendorUserId || null,
			rawFingerprintPresent: Boolean(
				deviceUser?.vendorMetadata?.rawFingerprintPresent || templates.length,
			),
			rawFingerprintCount: templates.length || 0,
			firstTemplateChars: String(templates[0]?.data || "").length,
			isAes: String(templates[0]?.data || "").includes("ciphertext"),
			recentEvents: events.map((e) => ({
				id: e.id,
				action: e.eventAction,
				employeeNo: e.employeeNo,
				source: e.source,
				status: e.status,
				identitySource: e.payload?.identitySource || e.payload?.rawEvidence?.identitySource || null,
				resolved: e.payload?.resolvedEmployeeNo || null,
				opaque: Boolean(e.payload?.opaquePersonToken),
				fingerprintCountOnPayload: e.payload?.fingerprintCount ?? null,
				hasFingerprintsArray: Array.isArray(e.payload?.fingerprints)
					? e.payload.fingerprints.length
					: 0,
				receivedAt: e.receivedAt,
			})),
		};

		fs.writeFileSync(
			path.join(evidenceDir, "device-user-after.json"),
			JSON.stringify(
				{
					id: deviceUser?.id,
					vendorUserId: deviceUser?.vendorUserId,
					vendorMetadata: deviceUser?.vendorMetadata,
					rawMeta: deviceUser?.rawPayload?._hrisDeviceMetadata || null,
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(evidenceDir, "events-after.json"),
			JSON.stringify(events, null, 2),
		);
		fs.writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2));
		console.log(JSON.stringify(summary, null, 2));

		const ok =
			summary.createUser?.ok &&
			(summary.result.rawFingerprintPresent || summary.writeFp?.ok) &&
			summary.result.deviceUserId;
		process.exitCode = ok ? 0 : 1;
	} finally {
		await prisma.$disconnect().catch(() => undefined);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
