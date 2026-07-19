// Capture + prove raw fingerprint for device person 16 on TEST A
require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
const {
	captureRawFingerprintsForEnrollment,
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

async function main() {
	loadEnv();
	const evidence = path.resolve(
		__dirname,
		"../../.runtime/user16-raw-fp-journey",
	);
	fs.mkdirSync(evidence, { recursive: true });
	const deviceId = process.argv[2] || "cmrlgqsjv000oob01165tbd8n";
	const emp = process.argv[3] || "16";
	const prisma = new PrismaClient();
	const out = { emp, deviceId, startedAt: new Date().toISOString() };

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
		const device = await prisma.device.findUnique({ where: { id: deviceId } });
		if (!device) throw new Error("device missing");
		const org = device.organizationId;
		const req = {
			organizationId: org,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId: org },
		};

		const before = await prisma.deviceUser.findFirst({
			where: {
				deviceId,
				OR: [{ vendorUserId: emp }, { employeeNo: emp }],
			},
		});
		out.before = {
			id: before?.id || null,
			vendorUserId: before?.vendorUserId,
			rawPresent: Boolean(before?.vendorMetadata?.rawFingerprintPresent),
			tplLen:
				before?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length ||
				0,
			source: before?.vendorMetadata?.rawFingerprints?.source || null,
			numOfFP: before?.rawPayload?.numOfFP ?? before?.rawPayload?.UserInfo?.numOfFP,
			vmKeys: before?.vendorMetadata
				? Object.keys(before.vendorMetadata)
				: [],
		};

		const isapi = await fetchRawFingerprintsViaIsapi({
			prisma,
			req,
			deviceId,
			employeeNo: emp,
		});
		out.isapiRead = {
			count: isapi.fingerprints.length,
			firstLen: isapi.fingerprints[0]?.data?.length || 0,
			fingerPrintId: isapi.fingerprints[0]?.fingerPrintId,
			fingerType: isapi.fingerprints[0]?.fingerType,
			attempts: isapi.attempts,
			lastError: isapi.lastError || null,
			isAes: String(isapi.fingerprints[0]?.data || "").includes("ciphertext"),
		};

		const capture = await captureRawFingerprintsForEnrollment({
			prisma,
			req,
			organizationId: org,
			deviceId,
			employeeNo: emp,
			deviceUserId: before?.id || null,
		});
		out.capture = capture;

		const after = await prisma.deviceUser.findFirst({
			where: {
				deviceId,
				OR: [{ vendorUserId: emp }, { employeeNo: emp }],
			},
		});
		const tpl = after?.vendorMetadata?.rawFingerprints?.templates?.[0];
		const tpl2 =
			after?.rawPayload?._hrisDeviceMetadata?.rawFingerprints?.templates?.[0];
		out.after = {
			id: after?.id || null,
			rawPresent: Boolean(after?.vendorMetadata?.rawFingerprintPresent),
			fingerprintCount: after?.vendorMetadata?.rawFingerprintCount,
			source: after?.vendorMetadata?.rawFingerprints?.source,
			tplLen: tpl?.data?.length || 0,
			tplPreview: String(tpl?.data || "").slice(0, 120),
			isAes: String(tpl?.data || "").includes("ciphertext"),
			rawPayloadTplLen: tpl2?.data?.length || 0,
			credentialSummary:
				after?.vendorMetadata?.credentialSummary ||
				after?.rawPayload?._hrisDeviceMetadata?.credentialSummary ||
				null,
		};

		// API shape the modal uses
		const api = await (
			await fetch(
				`http://127.0.0.1:3001/api/device/${deviceId}/users?vendorUserId=${emp}&document=true`,
				{ headers: { Authorization: `Bearer ${token}` } },
			)
		).json();
		const list =
			api?.data?.deviceUsers ||
			api?.data?.users ||
			api?.data?.items ||
			[];
		const apiU = Array.isArray(list)
			? list.find(
					(x) =>
						String(x.vendorUserId || x.employeeNo || "") === emp ||
						String(x.vendorUserId || "") === emp,
				) || list[0]
			: null;
		out.api = {
			status: api?.status,
			listLen: Array.isArray(list) ? list.length : 0,
			dataKeys: api?.data ? Object.keys(api.data) : [],
			rawPresent: Boolean(apiU?.vendorMetadata?.rawFingerprintPresent),
			tplLen:
				apiU?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			source: apiU?.vendorMetadata?.rawFingerprints?.source || null,
			preview: String(
				apiU?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data || "",
			).slice(0, 80),
		};

		out.gates = {
			deviceHasFp: out.isapiRead.count >= 1 && out.isapiRead.firstLen >= 8,
			storedRaw: out.after.rawPresent && out.after.tplLen >= 8 && !out.after.isAes,
			apiReturnsRaw: out.api.rawPresent && out.api.tplLen >= 8,
		};
		out.finishedAt = new Date().toISOString();
		fs.writeFileSync(
			path.join(evidence, `user${emp}-raw-proof.json`),
			JSON.stringify(out, null, 2),
		);
		console.log(JSON.stringify(out, null, 2));
		process.exitCode =
			out.gates.deviceHasFp && out.gates.storedRaw && out.gates.apiReturnsRaw
				? 0
				: 2;
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
