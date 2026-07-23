import { expect } from "chai";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withCredentialDeviceLeases } from "../helper/credential-device-lease.helper";

const leaseDirectory = (root: string, organizationId: string, deviceId: string) =>
	path.join(
		root,
		createHash("sha256")
			.update(`${organizationId}\0${deviceId}`)
			.digest("hex"),
	);

describe("credential device lease", () => {
	it("serializes competing owners and records scoped lease evidence", async () => {
		const rootDir = path.join(os.tmpdir(), `credential-lease-${randomUUID()}`);
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = withCredentialDeviceLeases(
			{
				rootDir,
				organizationId: "org-1",
				deviceIds: ["device-b", "device-a"],
				ownerId: "owner-1",
				jobId: "job-1",
				scopeHash: "scope-1",
				ttlMs: 5_000,
			},
			async () => blocked,
		);
		const metadataPath = path.join(
			leaseDirectory(rootDir, "org-1", "device-a"),
			"lease.json",
		);
		for (let attempt = 0; attempt < 50; attempt += 1) {
			try {
				await fs.access(metadataPath);
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
		const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
		expect(metadata).to.include({
			organizationId: "org-1",
			deviceId: "device-a",
			ownerId: "owner-1",
			jobId: "job-1",
			scopeHash: "scope-1",
		});
		let competingError = "";
		try {
			await withCredentialDeviceLeases(
				{
					rootDir,
					organizationId: "org-1",
					deviceIds: ["device-b"],
					ownerId: "owner-2",
					jobId: "job-2",
					scopeHash: "scope-2",
					waitTimeoutMs: 30,
					pollMs: 10,
				},
				async () => undefined,
			);
		} catch (error: any) {
			competingError = String(error?.message || error);
		}
		expect(competingError).to.include("owner=owner-1 job=job-1");
		await withCredentialDeviceLeases(
			{
				rootDir,
				organizationId: "org-2",
				deviceIds: ["device-a"],
				ownerId: "owner-other-org",
				jobId: "job-other-org",
				scopeHash: "scope-other-org",
			},
			async () => undefined,
		);
		release();
		await first;
		let released = false;
		try {
			await fs.access(path.dirname(metadataPath));
		} catch {
			released = true;
		}
		expect(released).to.equal(true);
		await fs.rm(rootDir, { recursive: true, force: true });
	});

	it("heartbeats the organization sentinel and awaits cleanup", async () => {
		const rootDir = path.join(os.tmpdir(), `credential-lease-${randomUUID()}`);
		const sentinelDir = leaseDirectory(rootDir, "org-1", "$organization");
		let firstHeartbeat = "";
		let laterHeartbeat = "";
		await withCredentialDeviceLeases(
			{
				rootDir,
				organizationId: "org-1",
				deviceIds: ["device-a"],
				ownerId: "heartbeat-owner",
				jobId: "heartbeat-job",
				scopeHash: "heartbeat-scope",
				ttlMs: 300,
			},
			async () => {
				firstHeartbeat = JSON.parse(
					await fs.readFile(path.join(sentinelDir, "lease.json"), "utf8"),
				).heartbeatAt;
				await new Promise((resolve) => setTimeout(resolve, 180));
				laterHeartbeat = JSON.parse(
					await fs.readFile(path.join(sentinelDir, "lease.json"), "utf8"),
				).heartbeatAt;
			},
		);
		expect(Date.parse(laterHeartbeat)).to.be.greaterThan(Date.parse(firstHeartbeat));
		let released = false;
		try {
			await fs.access(sentinelDir);
		} catch {
			released = true;
		}
		expect(released).to.equal(true);
		await fs.rm(rootDir, { recursive: true, force: true });
	});

	it("atomically recovers an expired lease", async () => {
		const rootDir = path.join(os.tmpdir(), `credential-lease-${randomUUID()}`);
		const leaseDir = leaseDirectory(rootDir, "org-1", "device-a");
		await fs.mkdir(leaseDir, { recursive: true });
		await fs.writeFile(
			path.join(leaseDir, "lease.json"),
			JSON.stringify({
				schema: "project-truth.credential-device-lease.v1",
				organizationId: "org-1",
				deviceId: "device-a",
				ownerId: "dead-owner",
				jobId: "dead-job",
				scopeHash: "dead-scope",
				acquiredAt: "2020-01-01T00:00:00.000Z",
				heartbeatAt: "2020-01-01T00:00:00.000Z",
				expiresAt: "2020-01-01T00:00:01.000Z",
			}),
		);
		let observedOwner = "";
		await withCredentialDeviceLeases(
			{
				rootDir,
				organizationId: "org-1",
				deviceIds: ["device-a"],
				ownerId: "recovered-owner",
				jobId: "recovered-job",
				scopeHash: "recovered-scope",
			},
			async () => {
				const current = JSON.parse(
					await fs.readFile(path.join(leaseDir, "lease.json"), "utf8"),
				);
				observedOwner = current.ownerId;
			},
		);
		expect(observedOwner).to.equal("recovered-owner");
		await fs.rm(rootDir, { recursive: true, force: true });
	});
});
