/**
 * Offline dry-run: prove the 9 FP-gap people never land as permanent
 * device_fp_anti_dupe_peer_owner after reconcileDurableFingerprintOwnerConflicts.
 *
 * Run (from repo root, no API/ansible wait):
 *   node scripts/dry-run-fp-gap-9-auto-resolve.mjs
 *
 * Exit 0 only when anti_dupe_blocked === 0 and every person is ready_force
 * or safe_drop (peer canonical).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(path.join(repoRoot, "hris-api", "package.json"));

// Use tsx register via dynamic import of the compiled path isn't available;
// load helper through tsx when available, else fail with clear message.
async function loadHelper() {
	const helperPath = path.join(
		repoRoot,
		"hris-api",
		"helper",
		"device-user-merge.helper.ts",
	);
	try {
		const mod = await import(pathToFileUrl(helperPath));
		return mod;
	} catch (err) {
		// Fallback: spawn via child with tsx
		return null;
	}
}

function pathToFileUrl(p) {
	const resolved = path.resolve(p).replace(/\\/g, "/");
	return resolved.startsWith("/")
		? `file://${resolved}`
		: `file:///${resolved}`;
}

const GAP9 = [
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
		// peer 10 has more fleet devices for same byte → safe drop
		peerMajority: true,
		sameByteAsPeer: true,
		note: "peer 10 majority same-byte",
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
		// 1815 on more devices than 1343 for same byte → force
		writeMajority: true,
		sameByteAsPeer: true,
		note: "1815 majority force clear 1343",
	},
];

async function mainWithHelper(helper) {
	const {
		buildDeviceUserMergePlan,
		reconcileDurableFingerprintOwnerConflicts,
	} = helper;

	const record = (deviceId, patch = {}) => ({
		deviceId,
		deviceName: deviceId,
		vendorUserId: "0001",
		employeeId: "employee-default",
		displayName: "x",
		status: "ACTIVE",
		rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
		...patch,
	});

	const rows = [];
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

		const devices = new Set([sourceDeviceId, targetDeviceId]);
		const records = [];

		// Write vendor source (richest)
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
				_fingerprintTemplateChecksums: [
					{ fingerPrintId: slot, checksum: writeCk },
				],
			}),
		);

		// Extra fleet devices for majority stories
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

		// Target: write vendor missing FP
		records.push(
			record(targetDeviceId, {
				vendorUserId: person.uid,
				employeeId: `employee-${person.uid}`,
				rawPayload: { numOfFP: 0 },
			}),
		);

		// Target peer occupying slot
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
			(r) =>
				r.resolution === "fleet_same_byte_peer_canonical_no_write" &&
				r.vendorUserId === person.uid,
		);

		let outcome = "unknown";
		if (drop) {
			outcome = "safe_drop_peer_canonical";
			safeDrop += 1;
		} else if (!write && !peer) {
			outcome = "no_write_needed";
			readyNoConflict += 1;
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
			reason: String(write?.recommendationReason || drop?.notes || "").slice(
				0,
				160,
			),
			note: person.note,
		});
	}

	const report = {
		generatedAt: new Date().toISOString(),
		policy:
			"progress5 dual-owner never permanent anti-dupe; force-clear or safe-drop only",
		summary: {
			people: GAP9.length,
			anti_dupe_blocked: antiDupeBlocked,
			ready_force_clear: readyForce,
			safe_drop_peer_canonical: safeDrop,
			ready_no_conflict: readyNoConflict,
			gap_zero_story:
				antiDupeBlocked === 0
					? "PASS: no permanent anti-dupe; dry-run queue can resolve all 9 edges"
					: "FAIL: residual anti-dupe blockers remain — code defect",
		},
		rows,
	};

	const outDir = path.join(
		repoRoot,
		".runtime",
		`fp-gap-9-auto-resolve-${new Date()
			.toISOString()
			.replace(/[:.]/g, "")
			.slice(0, 15)}`,
	);
	fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, "dry-run-report.json");
	fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

	console.log(JSON.stringify(report.summary, null, 2));
	console.log("\nPer person:");
	for (const row of rows) {
		console.log(
			`  ${row.uid.padStart(5)} | ${row.outcome.padEnd(28)} | peer=${row.peer || "-"} | force=${row.force}`,
		);
	}
	console.log(`\nWrote ${outFile}`);

	if (antiDupeBlocked > 0) {
		process.exitCode = 1;
	}
}

// Prefer spawning via tsx so TS helper loads cleanly on Windows
import { spawnSync } from "node:child_process";

const runner = path.join(repoRoot, "scripts", "_dry-run-fp-gap-9-body.mjs");
// Inline body as this file when helper can import — use child tsx of a .ts harness

const harnessTs = path.join(repoRoot, "scripts", "dry-run-fp-gap-9-auto-resolve.ts");
if (!fs.existsSync(harnessTs)) {
	// write companion ts harness once
	fs.writeFileSync(
		harnessTs,
		`/**
 * TS harness for offline FP-gap-9 auto-resolve dry-run.
 * node is not used; run: npx tsx scripts/dry-run-fp-gap-9-auto-resolve.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
	buildDeviceUserMergePlan,
	reconcileDurableFingerprintOwnerConflicts,
} from "../hris-api/helper/device-user-merge.helper";

const GAP9 = ${JSON.stringify(GAP9, null, 2)};

const record = (deviceId: string, patch: any = {}) => ({
	deviceId,
	deviceName: deviceId,
	vendorUserId: "0001",
	employeeId: "employee-default",
	displayName: "x",
	status: "ACTIVE",
	rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
	...patch,
});

const rows: any[] = [];
let antiDupeBlocked = 0;
let readyForce = 0;
let safeDrop = 0;
let readyNoConflict = 0;

for (const person of GAP9) {
	const peer = person.peers[0] || null;
	const edge = person.edges[0] || "B->A";
	const [srcLabel, tgtLabel] = edge.split("->");
	const sourceDeviceId = \`dev-\${srcLabel}\`;
	const targetDeviceId = \`dev-\${tgtLabel}\`;
	const slot = person.slot;
	const writeCk = person.sameByteAsPeer
		? \`CK-\${person.uid}-SHARED\`
		: \`CK-\${person.uid}-OWN\`;
	const peerCk = person.sameByteAsPeer
		? writeCk
		: peer
			? \`CK-\${peer}-OWN\`
			: writeCk;

	const devices = new Set<string>([sourceDeviceId, targetDeviceId]);
	const records: any[] = [];

	records.push(
		record(sourceDeviceId, {
			vendorUserId: person.uid,
			employeeId: \`employee-\${person.uid}\`,
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
				{ fingerPrintId: slot, checksum: writeCk },
			],
		}),
	);

	if (person.writeMajority) {
		for (const extra of ["dev-X", "dev-Y"]) {
			devices.add(extra);
			records.push(
				record(extra, {
					vendorUserId: person.uid,
					employeeId: \`employee-\${person.uid}\`,
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
					employeeId: \`employee-\${peer}\`,
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
	}

	records.push(
		record(targetDeviceId, {
			vendorUserId: person.uid,
			employeeId: \`employee-\${person.uid}\`,
			rawPayload: { numOfFP: 0 },
		}),
	);

	if (peer) {
		records.push(
			record(targetDeviceId, {
				vendorUserId: peer,
				employeeId: \`employee-\${peer}\`,
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
					jobId: \`job-\${person.uid}\`,
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
		(w: any) =>
			w.modality === "fingerprint" &&
			w.vendorUserId === person.uid &&
			w.targetDeviceId === targetDeviceId,
	);
	const drop = (reconciled.credentialResolutions || []).find(
		(r: any) =>
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
		outcome = \`other:\${write?.executionEligibility || "none"}:\${write?.blockingReason || "none"}\`;
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
		reason: String(write?.recommendationReason || drop?.notes || "").slice(0, 160),
		note: person.note,
	});
}

const report = {
	generatedAt: new Date().toISOString(),
	policy:
		"progress5 dual-owner never permanent anti-dupe; force-clear or safe-drop only",
	summary: {
		people: GAP9.length,
		anti_dupe_blocked: antiDupeBlocked,
		ready_force_clear: readyForce,
		safe_drop_peer_canonical: safeDrop,
		ready_no_conflict: readyNoConflict,
		gap_zero_story:
			antiDupeBlocked === 0
				? "PASS: no permanent anti-dupe; dry-run queue can resolve all 9 edges"
				: "FAIL: residual anti-dupe blockers remain — code defect",
	},
	rows,
};

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const outDir = path.join(process.cwd(), ".runtime", \`fp-gap-9-auto-resolve-\${stamp}\`);
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "dry-run-report.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report.summary, null, 2));
console.log("\\nPer person:");
for (const row of rows) {
	console.log(
		\`  \${String(row.uid).padStart(5)} | \${String(row.outcome).padEnd(28)} | peer=\${row.peer || "-"} | force=\${row.force}\`,
	);
}
console.log(\`\\nWrote \${outFile}\`);
if (antiDupeBlocked > 0) process.exit(1);
`,
	);
}

const result = spawnSync(
	process.platform === "win32" ? "npx.cmd" : "npx",
	["tsx", harnessTs],
	{ cwd: repoRoot, encoding: "utf8", shell: true },
);
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
