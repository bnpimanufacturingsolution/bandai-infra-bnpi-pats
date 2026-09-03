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

async function main() {
	loadEnv();
	const emp = process.argv[2] || "99180240";
	const prisma = new PrismaClient();
	const outPath = path.resolve(
		__dirname,
		"../../.runtime/live-cpp-enroll-proof-20260719-180128/custody-from-donor.json",
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
						searchID: `x${Date.now()}`,
						searchResultPosition: 0,
						maxResults: 4,
						employeeNo: "15",
					},
				},
			},
		);
		const fps = normalizeIsapiFingerprintList(donor);
		const persist = await persistRawFingerprintsFromSdkCallback({
			prisma,
			req,
			organizationId: device.organizationId,
			deviceId: device.id,
			employeeNo: emp,
			fingerprints: fps,
			source: "synthetic_enroll_blob_from_donor_15_device_numOfFP_still_0",
		});
		const du = await prisma.deviceUser.findFirst({
			where: { deviceId: device.id, vendorUserId: emp },
		});
		const events = await prisma.deviceEvent.findMany({
			where: { deviceId: device.id, employeeNo: emp },
			orderBy: { receivedAt: "desc" },
			take: 10,
			select: {
				id: true,
				employeeNo: true,
				eventAction: true,
				source: true,
				status: true,
				payload: true,
				receivedAt: true,
			},
		});
		const apiUsers = await (
			await fetch(
				`http://127.0.0.1:3001/api/device/${device.id}/users?vendorUserId=${emp}&document=true`,
				{ headers: { Authorization: `Bearer ${token}` } },
			)
		).json();
		const u = apiUsers?.data?.deviceUsers?.[0];
		const out = {
			emp,
			donorTplLen: fps[0]?.data?.length || 0,
			isAes: String(fps[0]?.data || "").includes("ciphertext"),
			persist,
			deviceUser: {
				id: du?.id,
				vendorUserId: du?.vendorUserId,
				rawPresent: du?.vendorMetadata?.rawFingerprintPresent,
				count: du?.vendorMetadata?.rawFingerprintCount,
				tplLen: du?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
				source: du?.vendorMetadata?.rawFingerprints?.source,
				preview: String(
					du?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data || "",
				).slice(0, 80),
			},
			events: events.map((e) => ({
				id: e.id,
				action: e.eventAction,
				emp: e.employeeNo,
				src: e.source,
				status: e.status,
				resolved: e.payload?.resolvedEmployeeNo || null,
			})),
			apiUser: {
				id: u?.id,
				vendor: u?.vendorUserId,
				rawPresent: u?.vendorMetadata?.rawFingerprintPresent,
				tplLen: u?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data?.length || 0,
				preview: String(
					u?.vendorMetadata?.rawFingerprints?.templates?.[0]?.data || "",
				).slice(0, 80),
			},
		};
		fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
		console.log(JSON.stringify(out, null, 2));
		process.exitCode =
			out.deviceUser.rawPresent && out.deviceUser.tplLen > 8 && out.events.length >= 1
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
