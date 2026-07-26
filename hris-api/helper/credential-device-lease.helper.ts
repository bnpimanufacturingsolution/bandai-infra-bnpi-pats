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
	// Parent can disappear under concurrent cleanup/stale reclaim (ENOENT on rename).
	// Always re-create the lease directory before the atomic write.
	await fs.mkdir(leaseDir, { recursive: true, mode: 0o700 });
	const temporary = path.join(leaseDir, `lease-${randomUUID()}.tmp`);
	const target = path.join(leaseDir, "lease.json");
	const payload = JSON.stringify(metadata, null, 2);
	const writeOnce = async () => {
		await fs.writeFile(temporary, payload, {
			encoding: "utf8",
			mode: 0o600,
		});
		await fs.rename(temporary, target);
	};
	try {
		await writeOnce();
	} catch (error: any) {
		if (error?.code !== "ENOENT") throw error;
		// One retry after another process raced the directory away.
		await fs.mkdir(leaseDir, { recursive: true, mode: 0o700 });
		await writeOnce();
	} finally {
		await fs.rm(temporary, { force: true }).catch(() => undefined);
	}
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

	const ensureLeaseRoot = async () => {
		await fs.mkdir(options.rootDir, { recursive: true, mode: 0o700 });
	};

	const acquire = async (deviceId: string) => {
		const leaseDir = path.join(
			options.rootDir,
			leaseName(options.organizationId, deviceId),
		);
		while (true) {
			try {
				// Exclusive create: non-recursive so an existing lease remains EEXIST.
				// If the parent root was reclaimed, mkdir returns ENOENT — recreate root.
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
				if (error?.code === "ENOENT") {
					// Parent lease root vanished under concurrent cleanup/volume churn.
					await ensureLeaseRoot();
					if (now() >= deadline) {
						throw new Error(
							`Credential device lease root missing for ${deviceId} after recreate attempts`,
						);
					}
					await delay(pollMs);
					continue;
				}
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
							try {
								await writeMetadata(leaseDir, {
									...existing,
									heartbeatAt: new Date(timestamp).toISOString(),
									expiresAt: new Date(timestamp + ttlMs).toISOString(),
								});
							} catch (error: any) {
								// Stale reclaim / concurrent cleanup must not fail a healthy write wave.
								if (error?.code === "ENOENT") return;
								throw error;
							}
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
		await heartbeatInFlight.catch(() => undefined);
		for (const { leaseDir } of acquired.reverse()) {
			const existing = await readMetadata(leaseDir);
			if (existing?.ownerId === options.ownerId) {
				await fs.rm(leaseDir, { recursive: true, force: true });
			}
		}
		// Prefer successful physical work over a late heartbeat race; only surface
		// non-ENOENT lease defects when the work itself already failed.
		if (heartbeatError) {
			const code = (heartbeatError as any)?.code;
			if (code !== "ENOENT") throw heartbeatError;
		}
	}
};
