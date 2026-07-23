import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type CredentialDeviceLeaseMetadata = {
	schema: "project-truth.credential-device-lease.v1";
	organizationId: string;
	deviceId: string;
	ownerId: string;
	jobId: string;
	scopeHash: string;
	acquiredAt: string;
	heartbeatAt: string;
	expiresAt: string;
};

type LeaseOptions = {
	rootDir: string;
	organizationId: string;
	deviceIds: string[];
	ownerId: string;
	jobId: string;
	scopeHash: string;
	ttlMs?: number;
	waitTimeoutMs?: number;
	pollMs?: number;
	now?: () => number;
};

const leaseName = (organizationId: string, deviceId: string) =>
	createHash("sha256")
		.update(`${organizationId}\0${deviceId}`)
		.digest("hex");

const readMetadata = async (leaseDir: string) => {
	try {
		return JSON.parse(
			await fs.readFile(path.join(leaseDir, "lease.json"), "utf8"),
		) as CredentialDeviceLeaseMetadata;
	} catch {
		return null;
	}
};

const writeMetadata = async (
	leaseDir: string,
	metadata: CredentialDeviceLeaseMetadata,
) => {
	const temporary = path.join(leaseDir, `lease-${randomUUID()}.tmp`);
	await fs.writeFile(temporary, JSON.stringify(metadata, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
	await fs.rename(temporary, path.join(leaseDir, "lease.json"));
};

const delay = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, Math.max(1, ms)));

export const withCredentialDeviceLeases = async <T>(
	options: LeaseOptions,
	work: () => Promise<T>,
): Promise<T> => {
	const now = options.now || Date.now;
	const ttlMs = Math.max(300, options.ttlMs || 120_000);
	const waitTimeoutMs = Math.max(0, options.waitTimeoutMs ?? 180_000);
	const pollMs = Math.max(10, options.pollMs || 250);
	const requestedDeviceIds = [
		...new Set(options.deviceIds.map(String).filter(Boolean)),
	].sort();
	if (
		!options.organizationId ||
		!options.ownerId ||
		!options.jobId ||
		!options.scopeHash ||
		requestedDeviceIds.length === 0
	) {
		throw new Error("Credential device lease requires organization, devices, owner, job, and scope");
	}
	await fs.mkdir(options.rootDir, { recursive: true, mode: 0o700 });
	const deviceIds = ["$organization", ...requestedDeviceIds];
	const acquired: Array<{ deviceId: string; leaseDir: string }> = [];
	const deadline = now() + waitTimeoutMs;

	const acquire = async (deviceId: string) => {
		const leaseDir = path.join(
			options.rootDir,
			leaseName(options.organizationId, deviceId),
		);
		while (true) {
			try {
				await fs.mkdir(leaseDir, { mode: 0o700 });
				const timestamp = now();
				await writeMetadata(leaseDir, {
					schema: "project-truth.credential-device-lease.v1",
					organizationId: options.organizationId,
					deviceId,
					ownerId: options.ownerId,
					jobId: options.jobId,
					scopeHash: options.scopeHash,
					acquiredAt: new Date(timestamp).toISOString(),
					heartbeatAt: new Date(timestamp).toISOString(),
					expiresAt: new Date(timestamp + ttlMs).toISOString(),
				});
				acquired.push({ deviceId, leaseDir });
				return;
			} catch (error: any) {
				if (error?.code !== "EEXIST") throw error;
				const existing = await readMetadata(leaseDir);
				const expired =
					!existing ||
					!Number.isFinite(Date.parse(existing.expiresAt)) ||
					Date.parse(existing.expiresAt) <= now();
				if (expired) {
					const staleDir = `${leaseDir}.stale-${randomUUID()}`;
					try {
						await fs.rename(leaseDir, staleDir);
						await fs.rm(staleDir, { recursive: true, force: true });
						continue;
					} catch (staleError: any) {
						if (!["ENOENT", "EEXIST"].includes(staleError?.code)) {
							throw staleError;
						}
					}
				}
				if (now() >= deadline) {
					throw new Error(
						`Credential device lease busy for ${deviceId}; owner=${existing?.ownerId || "unknown"} job=${existing?.jobId || "unknown"}`,
					);
				}
				await delay(pollMs);
			}
		}
	};

	let heartbeat: NodeJS.Timeout | null = null;
	let heartbeatError: unknown = null;
	let heartbeatInFlight: Promise<void> = Promise.resolve();
	try {
		for (const deviceId of deviceIds) await acquire(deviceId);
		heartbeat = setInterval(() => {
			heartbeatInFlight = heartbeatInFlight
				.then(async () => {
					await Promise.all(
						acquired.map(async ({ leaseDir }) => {
							const existing = await readMetadata(leaseDir);
							if (existing?.ownerId !== options.ownerId) return;
							const timestamp = now();
							await writeMetadata(leaseDir, {
								...existing,
								heartbeatAt: new Date(timestamp).toISOString(),
								expiresAt: new Date(timestamp + ttlMs).toISOString(),
							});
						}),
					);
				})
				.catch((error) => {
					heartbeatError = error;
				});
		}, Math.max(100, Math.floor(ttlMs / 3)));
		heartbeat.unref?.();
		return await work();
	} finally {
		if (heartbeat) clearInterval(heartbeat);
		await heartbeatInFlight;
		for (const { leaseDir } of acquired.reverse()) {
			const existing = await readMetadata(leaseDir);
			if (existing?.ownerId === options.ownerId) {
				await fs.rm(leaseDir, { recursive: true, force: true });
			}
		}
		if (heartbeatError) throw heartbeatError;
	}
};
