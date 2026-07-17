/**
 * Export TEST A device.spec for SDK probe (credentials from device.access).
 * Does not print password. Writes:
 *   .runtime/opaque-id-sdk-probe/device.spec
 *   .runtime/opaque-id-sdk-probe/device.meta.json
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const prismaPath = path.join(repoRoot, "hris-api/generated/prisma");
const { PrismaClient } = require(prismaPath);

const databaseUrl = String(process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const prisma = new PrismaClient(
	databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);

const deviceId = process.env.HIKVISION_DEVICE_ID || "cmrlgqsjv000oob01165tbd8n";

function pickAccess(access) {
	const value = access && typeof access === "object" ? access : {};
	return {
		username: String(value.username || value.userName || value.user || "").trim(),
		password: String(value.password || value.pass || "").trim(),
	};
}

(async () => {
	const d = await prisma.device.findFirst({
		where: { id: deviceId, isDeleted: false },
		select: {
			id: true,
			organizationId: true,
			name: true,
			address: true,
			port: true,
			protocol: true,
			config: true,
			access: true,
		},
	});
	if (!d) throw new Error(`device not found: ${deviceId}`);

	const cfg = d.config && typeof d.config === "object" ? d.config : {};
	const access = pickAccess(d.access);
	const sdkPort = Number(cfg.sdkPort || cfg.sdk_port || 8000) || 8000;

	const outDir = path.join(repoRoot, ".runtime", "opaque-id-sdk-probe");
	fs.mkdirSync(outDir, { recursive: true });

	// id|org|name|host|sdkPort|user|pass|false
	const spec = [
		d.id,
		d.organizationId,
		d.name,
		d.address,
		String(sdkPort),
		access.username,
		access.password,
		"false",
	].join("|");
	fs.writeFileSync(path.join(outDir, "device.spec"), spec, { encoding: "utf8", mode: 0o600 });
	fs.writeFileSync(
		path.join(outDir, "device.meta.json"),
		JSON.stringify(
			{
				id: d.id,
				name: d.name,
				address: d.address,
				port: d.port,
				protocol: d.protocol,
				sdkPort,
				hasUser: Boolean(access.username),
				hasPass: Boolean(access.password),
				userLen: access.username.length,
				passLen: access.password.length,
				cfgKeys: Object.keys(cfg),
			},
			null,
			2,
		),
	);
	console.log(
		JSON.stringify(
			{
				ok: true,
				outDir,
				address: d.address,
				sdkPort,
				hasUser: Boolean(access.username),
				hasPass: Boolean(access.password),
			},
			null,
			2,
		),
	);
	await prisma.$disconnect();
})().catch(async (error) => {
	console.error(error);
	try {
		await prisma.$disconnect();
	} catch {}
	process.exit(1);
});
