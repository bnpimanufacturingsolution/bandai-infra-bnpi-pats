/**
 * Offline dry-run: prove the 9 FP-gap people never land as permanent
 * device_fp_anti_dupe_peer_owner after reconcile.
 *
 *   npx tsx scripts/dry-run-fp-gap-9-auto-resolve.ts
 *
 * Exit 0 only when anti_dupe_blocked === 0.
 */
import fs from "node:fs";
import path from "node:path";
import {
	buildDeviceUserMergePlan,
	reconcileDurableFingerprintOwnerConflicts,
} from "../hris-api/helper/device-user-merge.helper";

type GapPerson = {
	uid: string;
	class: string;
	edges: string[];
	peers: string[];
	slot: number;
	sameByteAsPeer: boolean;
	writeMajority?: boolean;
	peerMajority?: boolean;
	note: string;
};

const GAP9: GapPerson[] = [
	{
		uid: "10",
		class: "admin_ready",
		edges: ["F->B", "F->A", "F->D", "F->E"],
		peers: ["11", "382", "696"],
		slot: 2,
		sameByteAsPeer: false,
		note: "richest F; progress5 sticky peers",
	},
	{
		uid: "1007",
		class: "prod_ready",
		edges: ["B->A"],
		peers: [],
		slot: 1,
		sameByteAsPeer: false,
		note: "ready elevated stickiness",
	},
	{
		uid: "1751",
		class: "prod_ready",
		edges: ["B->A", "B->D", "B->E"],
		peers: ["1757"],
		slot: 1,
		sameByteAsPeer: false,
		note: "mirror of 1757 different bytes",
	},
	{
		uid: "696",
		class: "was_anti_dupe",
		edges: ["B->F"],
		peers: ["10"],
		slot: 2,
		peerMajority: true,
		sameByteAsPeer: true,
		note: "peer 10 majority same-byte → still FORCE clear (unique gap zero)",
	},
	{
		uid: "976",
		class: "was_anti_dupe",
		edges: ["F->B", "F->A", "F->D"],
		peers: ["945"],
		slot: 1,
		sameByteAsPeer: false,
		note: "force clear peer 945",
	},
	{
		uid: "1715",
		class: "was_anti_dupe",
		edges: ["A->B"],
		peers: ["1544"],
		slot: 2,
		sameByteAsPeer: false,
		note: "force clear peer 1544",
	},
	{
		uid: "1757",
		class: "was_anti_dupe",
		edges: ["A->B"],
		peers: ["1751"],
		slot: 1,
		sameByteAsPeer: false,
		note: "force clear peer 1751",
	},
	{
		uid: "1814",
		class: "was_anti_dupe",
		edges: ["A->B"],
		peers: ["295"],
		slot: 1,
		sameByteAsPeer: false,
		note: "force clear peer 295",
	},
	{
		uid: "1815",
		class: "was_anti_dupe",
		edges: ["F->B", "F->A", "F->D"],
		peers: ["1343"],
		slot: 1,
		writeMajority: true,
		sameByteAsPeer: true,
		note: "1815 majority force clear 1343",
	},
];

const record = (deviceId: string, patch: Record<string, unknown> = {}) => ({
	deviceId,
	deviceName: deviceId,
	vendorUserId: "0001",
	employeeId: "employee-default",
	displayName: "x",
	status: "ACTIVE",
	rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
	...patch,
});

const rows: Array<Record<string, unknown>> = [];
let antiDupeBlocked = 0;
let readyForce = 0;
let safeDrop = 0;
let readyNoConflict = 0;

for (const person of GAP9) {
	const peer = person.peers[0] || null;
	const edge = person.edges[0] || "B->A";
	const [srcLabel, tgtLabel] = edge.split("->");
	const sourceDeviceId = `dev-${srcLabel}`;
	const targetDeviceId = `dev-${tgtLabel}`;
	const slot = person.slot;
	const writeCk = person.sameByteAsPeer
		? `CK-${person.uid}-SHARED`
		: `CK-${person.uid}-OWN`;
	const peerCk = person.sameByteAsPeer
		? writeCk
		: peer
			? `CK-${peer}-OWN`
			: writeCk;

	const devices = new Set<string>([sourceDeviceId, targetDeviceId]);
	const records: ReturnType<typeof record>[] = [];

	records.push(
		record(sourceDeviceId, {
			vendorUserId: person.uid,
			employeeId: `employee-${person.uid}`,
			rawPayload: { numOfFP: 1 },
			biometricEvidence: {
				fingerprint: {
					status: "raw_blob_present",
					reportedCount: 1,
					rawBlobCount: 1,
				},
				face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
			},
			_fingerprintTemplateChecksums: [{ fingerPrintId: slot, checksum: writeCk }],
		}),
	);

	if (person.writeMajority) {
		for (const extra of ["dev-X", "dev-Y"]) {
			devices.add(extra);
			records.push(
				record(extra, {
					vendorUserId: person.uid,
					employeeId: `employee-${person.uid}`,
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: slot, checksum: writeCk },
					],
				}),
			);
		}
	}
	if (person.peerMajority && peer) {
		for (const extra of ["dev-P1", "dev-P2"]) {
			devices.add(extra);
			records.push(
				record(extra, {
					vendorUserId: peer,
					employeeId: `employee-${peer}`,
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: slot, checksum: peerCk },
					],
				}),
			);
		}
	}

	records.push(
		record(targetDeviceId, {
			vendorUserId: person.uid,
			employeeId: `employee-${person.uid}`,
			rawPayload: { numOfFP: 0 },
		}),
	);

	if (peer) {
		records.push(
			record(targetDeviceId, {
				vendorUserId: peer,
				employeeId: `employee-${peer}`,
				rawPayload: { numOfFP: 1 },
				biometricEvidence: {
					fingerprint: {
						status: "raw_blob_present",
						reportedCount: 1,
						rawBlobCount: 1,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
				_fingerprintTemplateChecksums: [
					{ fingerPrintId: slot, checksum: peerCk },
				],
			}),
		);
	}

	const plan = buildDeviceUserMergePlan({
		deviceIds: [...devices],
		records,
	});

	const evidence = peer
		? [
				{
					jobId: `job-${person.uid}`,
					vendorUserId: person.uid,
					sourceDeviceId,
					targetDeviceId,
					fingerPrintId: slot,
					conflictingVendorUserId: peer,
				},
			]
		: [];

	const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, evidence);
	const write = reconciled.credentialWrites.find(
		(w) =>
			w.modality === "fingerprint" &&
			w.vendorUserId === person.uid &&
			w.targetDeviceId === targetDeviceId,
	);
	const drop = (reconciled.credentialResolutions || []).find(
		(r: { resolution?: string; vendorUserId?: string }) =>
			r.resolution === "fleet_same_byte_peer_canonical_no_write" &&
			r.vendorUserId === person.uid,
	);

	let outcome = "unknown";
	if (drop) {
		outcome = "safe_drop_peer_canonical";
		safeDrop += 1;
	} else if (
		write?.executionEligibility === "ready_from_raw_blob" &&
		write?.blockingReason == null
	) {
		if (
			write.fleetSameByteMajorityForceOverwrite ||
			write.adminSandboxForceOverwrite
		) {
			outcome = "ready_force_clear_peer";
			readyForce += 1;
		} else {
			outcome = "ready_no_conflict";
			readyNoConflict += 1;
		}
	} else if (write?.blockingReason === "device_fp_anti_dupe_peer_owner") {
		outcome = "ANTI_DUPE_BLOCKED_DEFECT";
		antiDupeBlocked += 1;
	} else if (!write && !peer) {
		outcome = "no_write_needed";
		readyNoConflict += 1;
	} else {
		outcome = `other:${write?.executionEligibility || "none"}:${write?.blockingReason || "none"}`;
		if (write?.blockingReason) antiDupeBlocked += 1;
	}

	rows.push({
		uid: person.uid,
		class: person.class,
		edge,
		peer: peer || "",
		outcome,
		force: Boolean(write?.fleetSameByteMajorityForceOverwrite),
		adminForce: Boolean(write?.adminSandboxForceOverwrite),
		blockingReason: write?.blockingReason || null,
		reason: String(
			write?.recommendationReason ||
				(Array.isArray((drop as { notes?: string[] })?.notes)
					? (drop as { notes: string[] }).notes.join("; ")
					: ""),
		).slice(0, 160),
		note: person.note,
	});
}

const report = {
	generatedAt: new Date().toISOString(),
	policy:
		"unique FP gap → 0: progress5 dual-owner always force-clear + write (never ban/wait)",
	summary: {
		people: GAP9.length,
		unique_fp_gap_people: GAP9.length,
		unique_fp_can_close_this_wave: readyForce + readyNoConflict,
		anti_dupe_blocked: antiDupeBlocked,
		ready_force_clear: readyForce,
		safe_drop_peer_canonical: safeDrop,
		ready_no_conflict: readyNoConflict,
		gap_zero_story:
			antiDupeBlocked === 0 && safeDrop === 0 && readyForce + readyNoConflict === GAP9.length
				? `PASS: all ${GAP9.length} unique FP people auto-ready (force or no-conflict); unique_fp can go 9→0 when execute sticks`
				: antiDupeBlocked === 0
					? `PARTIAL: anti_dupe=0 but force=${readyForce} drop=${safeDrop} ready=${readyNoConflict}`
					: "FAIL: residual anti-dupe blockers remain — code defect",
	},
	rows,
};

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const outDir = path.join(process.cwd(), ".runtime", `fp-gap-9-auto-resolve-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "dry-run-report.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report.summary, null, 2));
console.log("\nPer person:");
for (const row of rows) {
	console.log(
		`  ${String(row.uid).padStart(5)} | ${String(row.outcome).padEnd(28)} | peer=${row.peer || "-"} | force=${row.force}`,
	);
}
console.log(`\nWrote ${outFile}`);
if (antiDupeBlocked > 0) process.exit(1);
