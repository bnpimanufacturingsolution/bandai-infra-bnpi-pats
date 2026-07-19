/**
 * Resolve host-side Hikvision reverse bridge targets from HRIS Device rows.
 *
 * The bridge is a host-local convenience for devices reachable from Windows
 * but not directly from the VM. Device rows remain the source of truth; env
 * values are only explicit overrides/fallbacks.
 */
const path = require("path");
const { loadEnvFile } = require("./dev-db-runtime.cjs");

const apiRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(apiRoot, ".env"));
loadEnvFile(path.join(apiRoot, ".env.development.local"), { overwrite: true });

function asObject(value) {
	return value && typeof value === "object" ? value : {};
}

function asPort(value, fallback) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isHikvision(device) {
	const config = asObject(device.config);
	return (
		String(config.vendor || "").toLowerCase().includes("hikvision") ||
		String(config.source || "").toLowerCase().includes("hikvision")
	);
}

function usesReverseBridge(device) {
	const config = asObject(device.config);
	return (
		String(config.hikvisionSdkRuntimeTransport || "").toLowerCase() ===
			"ssh-reverse-forward" ||
		String(config.hikvisionSdkRuntimeAddress || "") === "127.0.0.1" ||
		String(device.name || "").toLowerCase() === "test a"
	);
}

async function main() {
	const { PrismaClient } = require("@prisma/client");
	const prisma = new PrismaClient();
	try {
		const devices = await prisma.device.findMany({
			where: { isDeleted: false },
			select: {
				id: true,
				name: true,
				address: true,
				port: true,
				protocol: true,
				config: true,
			},
			orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
		});

		const hikvision = devices.filter(isHikvision);
		const preferred = hikvision.filter(usesReverseBridge);
		const selected = preferred.length ? preferred : hikvision.slice(0, 1);
		const source = preferred.length ? "db-reverse-bridge-devices" : "db-hikvision-fallback";
		const targets = selected.map((device) => {
			const config = asObject(device.config);
			return {
				deviceId: device.id,
				name: device.name,
				deviceIp: device.address,
				httpDevicePort: asPort(device.port, 443),
				sdkDevicePort: asPort(config.sdkPort, 8000),
				protocol: device.protocol,
				source,
			};
		});

		console.log(JSON.stringify({ ok: targets.length > 0, source, targets }, null, 2));
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.log(
		JSON.stringify({
			ok: false,
			source: "db-resolve-error",
			targets: [],
			error: String(error?.message || error),
		}),
	);
	process.exit(0);
});
