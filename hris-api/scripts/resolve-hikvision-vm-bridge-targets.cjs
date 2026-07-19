/**
 * Resolve host-side Hikvision reverse bridge targets from HRIS Device rows,
 * then rank by host reachability so post-reboot predev does not need a manual IP.
 *
 * Source of configuration truth: Device row (address + ssh-reverse-forward).
 * Source of "which reverse target works on this PC right now": short host TCP probes.
 *
 * Env overrides:
 *   HIKVISION_VM_BRIDGE_DEVICE_IP=x.x.x.x  — force a single target (skip rank)
 *   HIKVISION_BRIDGE_PROBE_MS=400          — per-port TCP timeout (default 400)
 *   HIKVISION_BRIDGE_SKIP_PROBE=1          — DB only, no host TCP probes
 */
const net = require("net");
const path = require("path");
const { loadEnvFile } = require("./dev-db-runtime.cjs");

const apiRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(apiRoot, ".env"));
loadEnvFile(path.join(apiRoot, ".env.development.local"), { overwrite: true });

const PROBE_MS = Math.max(
	100,
	Math.min(2000, Number(process.env.HIKVISION_BRIDGE_PROBE_MS || 400) || 400),
);
const SKIP_PROBE = ["1", "true", "yes", "on"].includes(
	String(process.env.HIKVISION_BRIDGE_SKIP_PROBE || "")
		.trim()
		.toLowerCase(),
);

/** Last-known local reverse-path defaults when DB is empty/unavailable. */
const HOST_FALLBACK_IPS = ["192.168.254.102", "192.168.254.189"];

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
	const name = String(device.name || "").toLowerCase();
	return (
		String(config.hikvisionSdkRuntimeTransport || "").toLowerCase() ===
			"ssh-reverse-forward" ||
		String(config.hikvisionSdkRuntimeAddress || "") === "127.0.0.1" ||
		name === "test a" ||
		// Host-local reverse path is only useful for private LAN/site IPs.
		// Keep explicit reverse markers first; name/transport still win.
		Boolean(config.preferHostReverseBridge)
	);
}

function probeTcp(host, port, timeoutMs = PROBE_MS) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let settled = false;
		const finish = (ok) => {
			if (settled) return;
			settled = true;
			try {
				socket.destroy();
			} catch {
				/* ignore */
			}
			resolve(ok);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
		try {
			socket.connect(port, host);
		} catch {
			finish(false);
		}
	});
}

async function probeHostReachability(deviceIp, ports) {
	const uniquePorts = [...new Set(ports.filter((p) => Number.isFinite(p) && p > 0))];
	if (!uniquePorts.length) {
		return { hostReachable: false, openPorts: [], probedPorts: [], probeMs: PROBE_MS };
	}
	const results = await Promise.all(
		uniquePorts.map(async (port) => ({ port, ok: await probeTcp(deviceIp, port) })),
	);
	const openPorts = results.filter((r) => r.ok).map((r) => r.port);
	return {
		hostReachable: openPorts.length > 0,
		openPorts,
		probedPorts: uniquePorts,
		probeMs: PROBE_MS,
	};
}

function scoreTarget(target) {
	// Higher wins. Prefer reverse-configured + host-reachable LAN devices.
	let score = 0;
	if (target.reverseBridge) score += 100;
	if (target.hostReachable) score += 50;
	if (target.openPorts?.includes(target.sdkDevicePort)) score += 20;
	if (target.openPorts?.includes(target.httpDevicePort)) score += 10;
	if (String(target.name || "").toLowerCase() === "test a") score += 5;
	// Prefer more recently updated Device rows when already sorted by updatedAt desc.
	if (typeof target._rank === "number") score += Math.max(0, 3 - target._rank);
	return score;
}

function toTarget(device, index, extras = {}) {
	const config = asObject(device.config);
	const httpDevicePort = asPort(device.port, 443);
	const sdkDevicePort = asPort(config.sdkPort, 8000);
	return {
		deviceId: device.id || null,
		name: device.name || null,
		deviceIp: String(device.address || "").trim(),
		httpDevicePort,
		sdkDevicePort,
		protocol: device.protocol || null,
		reverseBridge: usesReverseBridge(device),
		_rank: index,
		...extras,
	};
}

async function enrichWithProbes(targets) {
	if (SKIP_PROBE || !targets.length) {
		return targets.map((t) => ({
			...t,
			hostReachable: SKIP_PROBE ? null : false,
			openPorts: [],
			probedPorts: [],
			probeMs: PROBE_MS,
			score: scoreTarget({ ...t, hostReachable: false, openPorts: [] }),
		}));
	}

	const enriched = await Promise.all(
		targets.map(async (target) => {
			const probe = await probeHostReachability(target.deviceIp, [
				target.sdkDevicePort,
				target.httpDevicePort,
				443,
				80,
				8000,
			]);
			const next = { ...target, ...probe };
			next.score = scoreTarget(next);
			return next;
		}),
	);
	return enriched;
}

function pickTargets(candidates) {
	const ranked = [...candidates]
		.filter((t) => t.deviceIp)
		.sort((a, b) => (b.score || 0) - (a.score || 0));
	if (!ranked.length) return [];

	// Prefer reverse-bridge + host-reachable. If none reachable, still return
	// best reverse-bridge candidates so cold path can attempt tunnel setup.
	const reverseReachable = ranked.filter((t) => t.reverseBridge && t.hostReachable);
	if (reverseReachable.length) return reverseReachable;

	const reverseOnly = ranked.filter((t) => t.reverseBridge);
	if (reverseOnly.length) return reverseOnly;

	const reachable = ranked.filter((t) => t.hostReachable);
	if (reachable.length) return reachable.slice(0, 1);

	return ranked.slice(0, 1);
}

async function resolveFromDb() {
	const { PrismaClient } = require("../generated/prisma");
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

		const hikvision = devices.filter(isHikvision).filter((d) => String(d.address || "").trim());
		const reverse = hikvision.filter(usesReverseBridge);
		const pool = reverse.length ? reverse : hikvision;
		const candidates = pool.map((device, index) => toTarget(device, index));
		const probed = await enrichWithProbes(candidates);
		const selected = pickTargets(probed);
		const source = reverse.length
			? selected.some((t) => t.hostReachable)
				? "db-reverse-bridge-host-reachable"
				: "db-reverse-bridge-devices"
			: selected.some((t) => t.hostReachable)
				? "db-hikvision-host-reachable"
				: "db-hikvision-fallback";

		return {
			ok: selected.length > 0,
			source,
			targets: selected.map(({ _rank, ...rest }) => rest),
			candidates: probed.map(({ _rank, ...rest }) => rest),
		};
	} finally {
		await prisma.$disconnect();
	}
}

async function resolveFallbackOnly() {
	const candidates = await enrichWithProbes(
		HOST_FALLBACK_IPS.map((deviceIp, index) => ({
			deviceId: null,
			name: null,
			deviceIp,
			httpDevicePort: 443,
			sdkDevicePort: 8000,
			protocol: "https",
			reverseBridge: true,
			_rank: index,
		})),
	);
	const selected = pickTargets(candidates);
	return {
		ok: selected.length > 0,
		source: selected.some((t) => t.hostReachable)
			? "host-fallback-reachable"
			: "host-fallback",
		targets: selected.map(({ _rank, ...rest }) => rest),
		candidates: candidates.map(({ _rank, ...rest }) => rest),
	};
}

async function main() {
	const explicit = String(process.env.HIKVISION_VM_BRIDGE_DEVICE_IP || "").trim();
	if (explicit) {
		const probed = await enrichWithProbes([
			{
				deviceId: null,
				name: null,
				deviceIp: explicit,
				httpDevicePort: asPort(process.env.HIKVISION_VM_BRIDGE_HTTP_DEVICE_PORT, 443),
				sdkDevicePort: asPort(process.env.HIKVISION_VM_BRIDGE_SDK_DEVICE_PORT, 8000),
				protocol: "https",
				reverseBridge: true,
				_rank: 0,
			},
		]);
		const target = probed[0];
		console.log(
			JSON.stringify(
				{
					ok: true,
					source: "env:HIKVISION_VM_BRIDGE_DEVICE_IP",
					targets: [target],
					candidates: probed,
				},
				null,
				2,
			),
		);
		return;
	}

	try {
		const fromDb = await resolveFromDb();
		if (fromDb.ok && fromDb.targets.length) {
			console.log(JSON.stringify(fromDb, null, 2));
			return;
		}
	} catch (error) {
		const fallback = await resolveFallbackOnly();
		console.log(
			JSON.stringify(
				{
					...fallback,
					error: String(error?.message || error),
				},
				null,
				2,
			),
		);
		return;
	}

	const fallback = await resolveFallbackOnly();
	console.log(JSON.stringify(fallback, null, 2));
}

main().catch((error) => {
	console.log(
		JSON.stringify({
			ok: false,
			source: "db-resolve-error",
			targets: [],
			candidates: [],
			error: String(error?.message || error),
		}),
	);
	process.exit(0);
});
