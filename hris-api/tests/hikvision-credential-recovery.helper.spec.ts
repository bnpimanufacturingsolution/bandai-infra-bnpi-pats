import { expect } from "chai";
import {
	buildCredentialRecoveryPendingTaskWhere,
	buildCredentialRecoveryTaskGraph,
	classifyCredentialRecoveryWrite,
	summarizeCredentialRecovery,
} from "../helper/hikvision-credential-recovery.helper";

describe("Hikvision credential recovery graph", () => {
	it("constrains source recovery to the requested canary modality", () => {
		expect(
			buildCredentialRecoveryPendingTaskWhere("job-1", "fingerprint"),
		).to.deep.equal({
			jobId: "job-1",
			status: { in: ["pending", "retrying"] },
			kind: { in: ["source_capture", "target_owner_capture"] },
			modality: "fingerprint",
		});
		expect(buildCredentialRecoveryPendingTaskWhere("job-1", "unknown")).to.not.have.property(
			"modality",
		);
	});

	it("does not classify planner recovery as a running queue", () => {
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "missing_raw_blob",
			}),
		).to.equal("recovery_needed");
	});

	it("deduplicates one source capture that unlocks multiple target operations", () => {
		const plan = {
			credentialWrites: ["B", "D", "E"].map((targetDeviceId) => ({
				id: `op-${targetDeviceId}`,
				userKey: "vendor:151",
				vendorUserId: "151",
				modality: "face",
				sourceDeviceId: "A",
				targetDeviceId,
				executionEligibility: "blocked",
				blockingReason: "missing_raw_blob",
			})),
		};
		const tasks = buildCredentialRecoveryTaskGraph(plan);
		expect(tasks).to.have.length(1);
		expect(tasks[0]).to.include({
			taskKey: "source_capture:A:151:face",
			unlockCount: 3,
		});
		expect(tasks[0].payload.operationIds).to.deep.equal(["op-B", "op-D", "op-E"]);
	});

	it("keeps writes and rereads separate and freezes a reviewed-byte hash", () => {
		const plan = {
			credentialWrites: [
				{
					id: "op-1",
					userKey: "vendor:1",
					vendorUserId: "1",
					modality: "fingerprint",
					sourceDeviceId: "A",
					targetDeviceId: "B",
					recommended: true,
					executionEligibility: "ready_from_raw_blob",
					sourceFingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "abc" },
					],
				},
			],
		};
		const tasks = buildCredentialRecoveryTaskGraph(plan);
		expect(tasks.map((task) => task.kind)).to.have.members([
			"target_write",
			"physical_reread",
		]);
		expect(tasks[0].reviewedByteHash).to.match(/^[a-f0-9]{64}$/);
		expect(tasks[1].payload.dependsOn).to.equal("target_write:op-1");
	});

	it("uses one backend classification for physical-action totals", () => {
		const plan = {
			credentialWrites: [
				{ blockingReason: "canonical_identity_unproven" },
				{ blockingReason: "physical_identity_adjudication_required" },
				{ blockingReason: "missing_raw_blob" },
			],
		};
		expect(summarizeCredentialRecovery(plan, []).physicalActionRequired).to.equal(2);
	});
});
