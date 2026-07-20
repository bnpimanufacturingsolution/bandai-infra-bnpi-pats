/**
 * Live proof: pull RAW fingerData for a vendorUserId and store on DeviceUser.
 * Usage: node scripts/prove-raw-fingerprint-capture.cjs [employeeNo=15] [deviceId?]
 */
const path = require("path");
const fs = require("fs");

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;
	const text = fs.readFileSync(filePath, "utf8");
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq < 1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!process.env[key]) process.env[key] = value;
	}
}

function forceLocalDbForward() {
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		const raw = String(process.env[key] || "");
		if (!raw) continue;
		// Prefer host localhost:55435 forward used by local predev.
		process.env[key] = raw
			.replace(/@10\.184\.37\.19:15433\b/g, "@127.0.0.1:55435")
			.replace(/@localhost:15433\b/g, "@127.0.0.1:55435")
			.replace(/@127\.0\.0\.1:15433\b/g, "@127.0.0.1:55435");
	}
}

async function main() {
	const employeeNo = String(process.argv[2] || "15").trim();
	const preferredDeviceId = String(process.argv[3] || "").trim();
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const evidenceDir = path.resolve(__dirname, "..", "..", ".runtime", `raw-fp-live-${stamp}`);
	fs.mkdirSync(evidenceDir, { recursive: true });

	loadEnvFile(path.resolve(__dirname, "..", ".env"));
	forceLocalDbForward();

	require("tsx/cjs");
	const { captureRawFingerprintsForEnrollment } = require("../helper/device-user-raw-fingerprint.helper.ts");
	const { PrismaClient } = require("../generated/prisma");
	const prisma = new PrismaClient();

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
		if (!token) throw new Error("login failed: " + JSON.stringify(loginJson));

		let device = null;
		if (preferredDeviceId) {
			device = await prisma.device.findUnique({ where: { id: preferredDeviceId } });
		}
		if (!device) {
			device = await prisma.device.findFirst({
				where: { address: "192.168.254.102" },
			});
		}
		if (!device) {
			device = await prisma.device.findFirst({
				where: {
					AND: [
						{ name: { equals: "TEST A", mode: "insensitive" } },
						{ NOT: { address: { contains: "deleted" } } },
					],
				},
			});
		}
		if (!device) throw new Error("No live TEST A device found");

		const before = await prisma.deviceUser.findFirst({
			where: {
				deviceId: device.id,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		});

		const organizationId =
			device.organizationId ||
			before?.organizationId ||
			(
				await prisma.deviceUser.findFirst({
					where: { deviceId: device.id },
					select: { organizationId: true },
				})
			)?.organizationId;
		if (!organizationId) throw new Error("Could not resolve organizationId");

		const req = {
			organizationId,
			headers: { authorization: `Bearer ${token}` },
			user: { organizationId },
			userOrganizationId: organizationId,
			io: null,
		};

		const result = await captureRawFingerprintsForEnrollment({
			prisma,
			req,
			organizationId,
			deviceId: device.id,
			employeeNo,
			deviceUserId: before?.id || null,
			eventId: null,
		});

		const after = await prisma.deviceUser.findFirst({
			where: {
				deviceId: device.id,
				OR: [{ vendorUserId: employeeNo }, { employeeNo }],
			},
		});

		const templates =
			after?.vendorMetadata?.rawFingerprints?.templates ||
			after?.rawPayload?._hrisDeviceMetadata?.rawFingerprints?.templates ||
			[];
		const firstData = String(templates[0]?.data || "");
		const summary = {
			result,
			device: {
				id: device.id,
				name: device.name,
				address: device.address,
				port: device.port,
				protocol: device.protocol,
			},
			deviceUserId: after?.id || null,
			rawPresent: Boolean(
				after?.vendorMetadata?.rawFingerprintPresent || templates.length,
			),
			fingerprintCount: templates.length,
			firstTemplateChars: firstData.length,
			firstTemplatePreview: firstData.slice(0, 120),
			isAesEnvelope: Boolean(
				firstData.includes("ciphertext") || firstData.includes("aes-256-gcm"),
			),
			rawPath: "DeviceUser.vendorMetadata.rawFingerprints.templates[].data",
			evidenceDir,
		};

		fs.writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2));
		fs.writeFileSync(
			path.join(evidenceDir, "device-user-after.json"),
			JSON.stringify(
				{
					id: after?.id,
					vendorUserId: after?.vendorUserId,
					employeeNo: after?.employeeNo,
					vendorMetadata: after?.vendorMetadata,
					rawPayloadMeta: after?.rawPayload?._hrisDeviceMetadata || null,
				},
				null,
				2,
			),
		);
		console.log(JSON.stringify(summary, null, 2));
		if (!summary.rawPresent || summary.firstTemplateChars < 8 || summary.isAesEnvelope) {
			process.exitCode = 1;
		}
	} finally {
		await prisma.$disconnect().catch(() => undefined);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
