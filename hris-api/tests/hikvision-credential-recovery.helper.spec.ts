import { expect } from "chai";
import {
	buildCredentialRecoveryPendingTaskWhere,
	buildCredentialRecoveryTaskGraph,
	classifyCredentialRecoveryError,
	classifyCredentialRecoveryWrite,
	isCredentialRecoveryPhysicalStage,
	planCredentialRecoveryWorkerFailure,
	remainingCredentialRecoveryWriteAttemptBudget,
	summarizeCredentialRecovery,
} from "../helper/hikvision-credential-recovery.helper";

describe("Hikvision credential recovery graph", () => {
	it("caps a canary by physical write attempts and fail-closes expired physical stages", () => {
		expect(remainingCredentialRecoveryWriteAttemptBudget(1, [])).to.equal(1);
		expect(
			remainingCredentialRecoveryWriteAttemptBudget(1, ["target_write:operation-1"]),
		).to.equal(0);
		expect(
			remainingCredentialRecoveryWriteAttemptBudget(3, [
				"target_write:operation-1",
				"target_write:operation-1",
				"target_write:operation-2",
			]),
		).to.equal(1);
		expect(isCredentialRecoveryPhysicalStage("credential_raw_write_started")).to.equal(
			true,
		);
		expect(isCredentialRecoveryPhysicalStage("reread_started")).to.equal(true);
		expect(isCredentialRecoveryPhysicalStage("recovering_source_custody")).to.equal(
			false,
		);
	});

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

	it("classifies visible device failures without calling them code defects", () => {
		expect(classifyCredentialRecoveryError(new Error("fetch failed"))).to.include({
			code: "device_transport",
			category: "transport",
			retryable: true,
			observabilityDefect: false,
		});
		expect(classifyCredentialRecoveryError(new Error("Unauthorized"))).to.include({
			code: "device_authentication",
			category: "authentication",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Hikvision SDK returned no face bytes; userReadOk=true, cardOwnerVerified=false, faceTemplateSize=0",
				),
			),
		).to.include({
			code: "face_owner_card_association_missing",
			category: "identity_custody",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Neither exact shared card custody nor the same canonical HRIS employee proves the face association.",
				),
			),
		).to.include({
			code: "face_identity_association_unproven",
			category: "identity_custody",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Hikvision SDK export event missing for device/user; exitCode=1, parsedEvents=none",
				),
			),
		).to.include({
			code: "sdk_export_event_missing",
			category: "observability",
			retryable: false,
			observabilityDefect: true,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Credential recovery write-attempt fence refused the canary: claimed 0 of 1 target writes.",
				),
			),
		).to.include({
			code: "worker_fencing",
			category: "concurrency",
			retryable: false,
			observabilityDefect: false,
		});
	});

	it("retries transient database transport loss without retrying forever", () => {
		const error = new Error(
			"Invalid prisma.credentialRecoveryTask.count(): Can't reach database server at hris-postgres:5432",
		);
		expect(classifyCredentialRecoveryError(error)).to.include({
			code: "database_transport",
			category: "persistence",
			retryable: true,
			observabilityDefect: false,
		});
		expect(planCredentialRecoveryWorkerFailure(error, 0)).to.include({
			attempt: 1,
			maxAttempts: 5,
			shouldRetry: true,
			status: "retrying",
		});
		expect(planCredentialRecoveryWorkerFailure(error, 5)).to.include({
			attempt: 6,
			shouldRetry: false,
			status: "failed",
		});
	});

	it("classifies an unexplained failure as an observability defect", () => {
		expect(classifyCredentialRecoveryError(new Error("credential operation failed"))).to.include({
			code: "unclassified",
			category: "observability",
			retryable: false,
			observabilityDefect: true,
		});
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
		expect(tasks[0].status).to.equal("pending");
		expect(tasks[0].stage).to.equal("ready_to_write");
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
