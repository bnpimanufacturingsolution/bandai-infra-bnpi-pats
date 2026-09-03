require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
function loadEnv() {
	for (const line of fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i < 1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		if (process.env[key])
			process.env[key] = process.env[key].replace(
				/@10\.184\.37\.19:15433\b/g,
				"@127.0.0.1:55435",
			);
	}
}
(async () => {
	loadEnv();
	const p = new PrismaClient();
	const deviceId = "cmrlgqsjv000oob01165tbd8n";
	const events = await p.deviceEvent.findMany({
		where: {
			deviceId,
			eventAction: { in: ["USER_CREATED", "FINGERPRINT_ENROLLED", "SYNC_SIGNAL"] },
			OR: [{ employeeNo: "16" }, { deviceUserId: "cmrrp81rl009z7z04bkn5jbpp" }],
		},
		orderBy: { receivedAt: "desc" },
		take: 8,
	});
	const du = await p.deviceUser.findFirst({
		where: { deviceId, vendorUserId: "16" },
	});
	const out = {
		events: events.map((e) => {
			const payload = e.payload || {};
			return {
				action: e.eventAction,
				employeeNo: e.employeeNo,
				deviceUserId: e.deviceUserId,
				source: e.source,
				receivedAt: e.receivedAt,
				opaque: payload.opaquePersonToken || null,
				resolved: payload.resolvedEmployeeNo || null,
				custody:
					payload.rawFingerprintCustody ||
					payload.enrollmentSnapshot?.biometricCustody ||
					null,
				goalRawExpected: payload.enrollmentGoal?.rawFingerprintExpected,
				goalLocation: payload.enrollmentGoal?.fingerprintTemplateLocation,
				hasFingerDataInEventPayload: JSON.stringify(payload).includes("fingerData"),
			};
		}),
		deviceUser: {
			id: du?.id,
			rawPresent: du?.vendorMetadata?.rawFingerprintPresent,
			tplLen: du?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
			src: du?.vendorMetadata?.rawFingerprints?.source,
			facePresent: du?.vendorMetadata?.rawFacePresent || false,
			numOfFP: du?.rawPayload?.numOfFP,
			numOfFace: du?.rawPayload?.numOfFace,
		},
	};
	console.log(JSON.stringify(out, null, 2));
	await p.$disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
