import { expect } from "chai";
import {
	buildCredentialRecoveryExecutionPreview,
	buildCredentialRecoveryPendingTaskWhere,
	buildExpiredCredentialRecoverySourceLeaseWhere,
	buildCredentialRecoveryTaskGraph,
	classifyCredentialRecoveryError,
	classifyCredentialRecoveryWrite,
	describeCredentialRecoveryError,
	isCredentialRecoveryPhysicalStage,
	planCredentialRecoveryWorkerFailure,
	recoveredCustodyCanUnlockWrite,
	remainingCredentialRecoveryWriteAttemptBudget,
	selectCredentialRecoveryReadyWrites,
	selectObsoleteCredentialRecoverySourceTaskIds,
	selectPermanentCredentialRecoveryWriteAttemptKeys,
	summarizeCredentialRecovery,
} from "../helper/hikvision-credential-recovery.helper";

describe("Hikvision credential recovery graph", () => {
	it("freezes deterministic execution preview counts for face and fingerprint canaries", () => {
		const plan = {
			credentialWrites: [
				{
					id: "fp-b-1",
					modality: "fingerprint",
					recommended: true,
					executionEligibility: "ready_from_raw_blob",
					targetDeviceId: "device-b",
					faceAssociationStrategy: null,
				},
				{
					id: "face-a-1",
					modality: "face",
					vendorUserId: "a1",
					recommended: true,
					executionEligibility: "ready_from_raw_blob",
					targetDeviceId: "device-a",
					faceAssociationStrategy: "exact_shared_card",
				},
				{
					id: "face-e-blocked",
					modality: "face",
					recommended: false,
					executionEligibility: "blocked",
					blockingReason: "target_write_unsupported",
					targetDeviceId: "device-e",
				},
				{
					id: "fp-e-scan",
					modality: "fingerprint",
					recommended: false,
					executionEligibility: "blocked",
					blockingReason: "target_owner_scan_incomplete",
					targetDeviceId: "device-e",
				},
			],
		};
		const facePreview = buildCredentialRecoveryExecutionPreview({
			plan,
			canaryModality: "face",
			maxVerifiedWrites: 50,
		});
		expect(facePreview.certainty).to.equal("deterministic_from_plan");
		expect(facePreview.faceReady).to.equal(1);
		expect(facePreview.fingerprintReady).to.equal(1);
		expect(facePreview.wouldWriteCount).to.equal(1);
		expect(facePreview.wouldWriteOperationIds).to.deep.equal(["face-a-1"]);
		expect(facePreview.wouldWriteByTarget[0]).to.include({
			targetDeviceId: "device-a",
			modality: "face",
			count: 1,
		});

		const fpPreview = buildCredentialRecoveryExecutionPreview({
			plan,
			canaryModality: "fingerprint",
			maxVerifiedWrites: 10,
		});
		expect(fpPreview.wouldWriteCount).to.equal(1);
		expect(fpPreview.wouldWriteOperationIds).to.deep.equal(["fp-b-1"]);

		const zeroFp = buildCredentialRecoveryExecutionPreview({
			plan: {
				credentialWrites: plan.credentialWrites.filter(
					(row: any) => row.modality !== "fingerprint" || row.id === "fp-e-scan",
				),
			},
			canaryModality: "fingerprint",
			maxVerifiedWrites: 10,
		});
		expect(zeroFp.wouldWriteCount).to.equal(0);
		expect(zeroFp.blockReasonsWhenZeroReady[0]).to.include({
			reason: "target_owner_scan_incomplete",
			modality: "fingerprint",
		});

		const selected = selectCredentialRecoveryReadyWrites({
			credentialWrites: plan.credentialWrites,
			canaryModality: "face",
			maxVerifiedWrites: 50,
		});
		expect(selected.map((row: any) => row.id)).to.deep.equal(["face-a-1"]);
		expect(facePreview.wouldWriteUniquePeople).to.equal(1);
		// Full-scope certainty contract: not ready-only
		expect(facePreview.fullScope).to.be.an("object");
		expect(facePreview.fullScope.residualOpsTotal).to.equal(4);
		expect(facePreview.fullScope.residualByModality.face).to.equal(2);
		expect(facePreview.fullScope.residualByModality.fingerprint).to.equal(2);
		expect(facePreview.fullScope.uniqueGapPeople.face).to.equal(1);
		expect(facePreview.fullScope.ifYouExecuteNow.wouldWriteCount).to.equal(1);
		expect(facePreview.fullScope.ifYouExecuteNow.willUniqueGapDecrease).to.equal(true);
		expect(facePreview.fullScope.ifYouExecuteNow.willUniqueGapReachZeroInThisWave).to.equal(
			false,
		);
		expect(facePreview.fullScope.unlockChecklist.some((row) => row.id === "READY_QUEUE")).to
			.equal(true);
		expect(facePreview.fullScope.scanExportNeeded).to.be.an("object");
		expect(zeroFp.fullScope.ifYouExecuteNow.wouldWriteCount).to.equal(0);
		expect(zeroFp.fullScope.ifYouExecuteNow.willUniqueGapDecrease).to.equal(false);
		expect(zeroFp.fullScope.ifYouExecuteNow.reason).to.match(/Ready queue empty/i);
		expect(
			zeroFp.fullScope.whyNotReady.some(
				(row) => row.blockingReason === "target_owner_scan_incomplete",
			),
		).to.equal(true);
	});

	it("fullScope marks false-physical source-null+candidates as agent unlock, not true physical", () => {
		const plan = {
			credentialWrites: [
				{
					id: "face-1419-e",
					modality: "face",
					vendorUserId: "1419",
					recommended: false,
					executionEligibility: "blocked",
					blockingReason: "physical_identity_adjudication_required",
					recoveryStage: "physical_identity_action_required",
					sourceDeviceId: null,
					sourceCandidateDeviceIds: ["device-b", "device-a", "device-d"],
					targetDeviceId: "device-e",
				},
			],
		};
		expect(classifyCredentialRecoveryWrite(plan.credentialWrites[0])).to.equal(
			"recovery_needed",
		);
		const preview = buildCredentialRecoveryExecutionPreview({
			plan,
			canaryModality: "face",
			maxVerifiedWrites: 50,
		});
		expect(preview.wouldWriteCount).to.equal(0);
		expect(preview.fullScope.uniqueGapPeople.face).to.equal(1);
		expect(preview.fullScope.ifYouExecuteNow.willUniqueGapDecrease).to.equal(false);
		const why = preview.fullScope.whyNotReady[0];
		expect(why.falsePhysicalSourceNullWithCandidates).to.equal(true);
		expect(why.ownerClass).to.equal("agent_unlock");
		expect(why.neededToEnterReadyQueue.join(" ")).to.match(/richest|candidates|sourceDeviceId/i);
	});

	it("fullScope predicts unique gap can reach zero only when all modality residual is ready", () => {
		const plan = {
			credentialWrites: [
				{
					id: "face-only",
					modality: "face",
					vendorUserId: "99",
					recommended: true,
					executionEligibility: "ready_from_raw_blob",
					targetDeviceId: "device-a",
					faceAssociationStrategy: "exact_shared_card",
				},
			],
		};
		const preview = buildCredentialRecoveryExecutionPreview({
			plan,
			canaryModality: "face",
			maxVerifiedWrites: 50,
		});
		expect(preview.fullScope.ifYouExecuteNow.wouldWriteCount).to.equal(1);
		expect(preview.fullScope.ifYouExecuteNow.willUniqueGapDecrease).to.equal(true);
		expect(preview.fullScope.ifYouExecuteNow.willUniqueGapReachZeroInThisWave).to.equal(true);
		expect(preview.fullScope.ifYouExecuteNow.uniqueGapPeopleAfterBestCase).to.equal(0);
	});

	it("prefers unique people first so one wave touches more people than multi-target spam", () => {
		const credentialWrites = [
			{
				id: "face-p1-t1",
				modality: "face",
				vendorUserId: "1",
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				targetDeviceId: "A",
				faceAssociationStrategy: "exact_shared_card",
			},
			{
				id: "face-p1-t2",
				modality: "face",
				vendorUserId: "1",
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				targetDeviceId: "D",
				faceAssociationStrategy: "exact_shared_card",
			},
			{
				id: "face-p1-t3",
				modality: "face",
				vendorUserId: "1",
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				targetDeviceId: "E",
				faceAssociationStrategy: "exact_shared_card",
			},
			{
				id: "face-p2-t1",
				modality: "face",
				vendorUserId: "2",
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				targetDeviceId: "A",
				faceAssociationStrategy: "exact_shared_card",
			},
			{
				id: "face-p3-t1",
				modality: "face",
				vendorUserId: "3",
				recommended: true,
				executionEligibility: "ready_from_raw_blob",
				targetDeviceId: "F",
				faceAssociationStrategy: "exact_shared_card",
			},
		];
		const selected = selectCredentialRecoveryReadyWrites({
			credentialWrites,
			canaryModality: "face",
			maxVerifiedWrites: 3,
		});
		const people = selected.map((row: any) => String(row.vendorUserId));
		expect(people).to.have.members(["1", "2", "3"]);
		expect(new Set(people).size).to.equal(3);
	});

	it("balances first-pass unique people across targets when each person has multi-target ready ops", () => {
		const credentialWrites = [];
		for (const person of ["10", "11", "12", "13", "14", "15"]) {
			for (const target of ["A", "D", "E"]) {
				credentialWrites.push({
					id: `fp-${person}-${target}`,
					modality: "fingerprint",
					vendorUserId: person,
					recommended: true,
					executionEligibility: "ready_from_raw_blob",
					targetDeviceId: target,
				});
			}
		}
		const selected = selectCredentialRecoveryReadyWrites({
			credentialWrites,
			canaryModality: "fingerprint",
			maxVerifiedWrites: 6,
		});
		expect(selected).to.have.length(6);
		const people = new Set(selected.map((row: any) => String(row.vendorUserId)));
		expect(people.size).to.equal(6);
		const byTarget = selected.reduce((map: Record<string, number>, row: any) => {
			const t = String(row.targetDeviceId);
			map[t] = (map[t] || 0) + 1;
			return map;
		}, {});
		// Not all six on one target — spreads across A/D/E.
		expect(Object.keys(byTarget).length).to.be.at.least(2);
		expect(Math.max(...Object.values(byTarget))).to.be.at.most(3);
	});

	it("keeps single-target ready waves on that target only", () => {
		const credentialWrites = Array.from({ length: 10 }, (_, i) => ({
			id: `fp-e-${i}`,
			modality: "fingerprint",
			vendorUserId: String(100 + i),
			recommended: true,
			executionEligibility: "ready_from_raw_blob",
			targetDeviceId: "E",
		}));
		const selected = selectCredentialRecoveryReadyWrites({
			credentialWrites,
			canaryModality: "fingerprint",
			maxVerifiedWrites: 5,
		});
		expect(selected.every((row: any) => row.targetDeviceId === "E")).to.equal(true);
	});

	it("does not treat retrying transport claims as permanent write-budget consumption", () => {
		const keys = selectPermanentCredentialRecoveryWriteAttemptKeys([
			{ taskKey: "target_write:a", status: "succeeded" },
			{ taskKey: "target_write:b", status: "failed" },
			{ taskKey: "target_write:c", status: "retrying" },
			{ taskKey: "target_write:d", status: "processing" },
			{ taskKey: "target_write:e", status: "pending" },
		]);
		expect(keys).to.deep.equal(["target_write:a", "target_write:b"]);
	});

	it("classifies binary request_timeout_after messages as retryable transport", () => {
		const classified = classifyCredentialRecoveryError(
			"Hikvision binary request failed: request_timeout_after_15000ms",
		);
		expect(classified).to.include({
			code: "device_transport",
			category: "transport",
			retryable: true,
			observabilityDefect: false,
		});
		const planned = planCredentialRecoveryWorkerFailure(
			"Hikvision binary request failed: request_timeout_after_15000ms",
			0,
			5,
		);
		expect(planned.shouldRetry).to.equal(true);
		expect(planned.status).to.equal("retrying");
	});

	it("retains safe Hikvision rejection fields without leaking arbitrary response data", () => {
		const message = describeCredentialRecoveryError({
			status: 400,
			message: "Bad Request",
			data: {
				statusCode: 6,
				statusString: "Invalid Content",
				subStatusCode: "badJsonContent",
				errorCode: 1610612738,
				errorMsg: "request body rejected",
				endpoint: "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
				method: "POST",
				password: "must-not-appear",
				faceURL: "must-not-appear",
			},
		});
		expect(message).to.include("http=400");
		expect(message).to.include("subStatusCode=badJsonContent");
		expect(message).to.include("errorCode=1610612738");
		expect(message).not.to.include("must-not-appear");
		expect(classifyCredentialRecoveryError(message)).to.include({
			code: "device_request_rejected",
			observabilityDefect: false,
		});
	});

	it("reclaims only expired non-writing source leases after a restart", () => {
		const now = new Date("2026-07-24T11:00:00.000Z");
		expect(buildExpiredCredentialRecoverySourceLeaseWhere("job-1", now)).to.deep.equal({
			jobId: "job-1",
			kind: { in: ["source_capture", "target_owner_capture"] },
			status: "processing",
			OR: [{ leaseExpiresAt: { lt: now } }, { leaseExpiresAt: null }],
		});
	});

	it("replans only for custody that can unlock a safe write", () => {
		expect(
			recoveredCustodyCanUnlockWrite("face", {
				faceTemplateSize: 768,
				facePictureSize: 12_000,
				cardOwnerVerified: true,
				identityOwnerVerified: true,
			}),
		).to.equal(true);
		expect(
			recoveredCustodyCanUnlockWrite("face", {
				faceTemplateSize: 0,
				facePictureSize: 12_000,
				cardOwnerVerified: false,
			}),
		).to.equal(false);
		expect(
			recoveredCustodyCanUnlockWrite("fingerprint", { fingerprintCount: 1 }),
		).to.equal(true);
	});

	it("orders fingerprint and proven face associations before speculative recovery", () => {
		const tasks = buildCredentialRecoveryTaskGraph({
			credentialWrites: [
				{
					id: "speculative-face",
					vendorUserId: "1",
					modality: "face",
					sourceDeviceId: "A",
					targetDeviceId: "B",
					blockingReason: "missing_raw_blob",
				},
				{
					id: "canonical-face",
					vendorUserId: "2",
					modality: "face",
					sourceDeviceId: "A",
					targetDeviceId: "B",
					blockingReason: "missing_raw_blob",
					faceAssociationStrategy: "canonical_hris_employee",
				},
				{
					id: "shared-card-face",
					vendorUserId: "3",
					modality: "face",
					sourceDeviceId: "A",
					targetDeviceId: "B",
					blockingReason: "missing_raw_blob",
					faceAssociationStrategy: "exact_shared_card",
				},
				{
					id: "fingerprint",
					vendorUserId: "4",
					modality: "fingerprint",
					sourceDeviceId: "A",
					targetDeviceId: "B",
					blockingReason: "missing_raw_blob",
				},
			],
		});
		expect(tasks.map((task) => task.taskKey)).to.deep.equal([
			"source_capture:A:4:fingerprint",
			"source_capture:A:3:face",
			"source_capture:A:2:face",
			"source_capture:A:1:face",
		]);
	});

	it("exports face source_conflict exporting_source_credential candidates instead of blocked resolution", () => {
		const tasks = buildCredentialRecoveryTaskGraph({
			credentialWrites: [
				{
					id: "face-export-a",
					userKey: "u9",
					vendorUserId: "9",
					modality: "face",
					sourceDeviceId: null,
					targetDeviceId: "B",
					blockingReason: "source_conflict",
					recoveryStage: "exporting_source_credential",
					faceAssociationStrategy: "same_vendor_user_id",
					sourceCandidateDeviceIds: ["A", "D", "F"],
				},
				{
					id: "face-export-b",
					userKey: "u9",
					vendorUserId: "9",
					modality: "face",
					sourceDeviceId: null,
					targetDeviceId: "E",
					blockingReason: "source_conflict",
					recoveryStage: "exporting_source_credential",
					faceAssociationStrategy: "same_vendor_user_id",
					sourceCandidateDeviceIds: ["A", "D", "F"],
				},
				{
					// Legacy comparing_sources label with no selected source is still
					// agent export work — never blocked dual-owner resolution.
					id: "legacy-compare-export",
					userKey: "u10",
					vendorUserId: "10",
					modality: "face",
					sourceDeviceId: null,
					targetDeviceId: "B",
					blockingReason: "source_conflict",
					recoveryStage: "comparing_sources",
					sourceCandidateDeviceIds: ["A", "D"],
				},
				{
					// FP same: no raw richest selected → capture candidates.
					id: "fp-compare-export",
					userKey: "u1524",
					vendorUserId: "1524",
					modality: "fingerprint",
					sourceDeviceId: null,
					targetDeviceId: "B",
					blockingReason: "source_conflict",
					recoveryStage: "comparing_sources",
					sourceCandidateDeviceIds: ["A", "D", "F"],
				},
				{
					// Card / no candidates remains blocked resolution.
					id: "card-compare",
					userKey: "u99",
					vendorUserId: "99",
					modality: "card",
					sourceDeviceId: null,
					targetDeviceId: "B",
					blockingReason: "source_conflict",
					recoveryStage: "comparing_sources",
					sourceCandidateDeviceIds: ["A", "D"],
				},
			],
		});
		const keys = tasks.map((task) => task.taskKey).sort();
		expect(keys).to.deep.equal(
			[
				"source_capture:A:9:face",
				"source_capture:D:9:face",
				"source_capture:F:9:face",
				"source_capture:A:10:face",
				"source_capture:D:10:face",
				"source_capture:A:1524:fingerprint",
				"source_capture:D:1524:fingerprint",
				"source_capture:F:1524:fingerprint",
				"source_resolution:u99:card",
			].sort(),
		);
		const exportCapture = tasks.find(
			(task) => task.taskKey === "source_capture:A:9:face",
		);
		expect(exportCapture?.status).to.equal("pending");
		expect(exportCapture?.unlockCount).to.equal(2);
		const fpCapture = tasks.find(
			(task) => task.taskKey === "source_capture:A:1524:fingerprint",
		);
		expect(fpCapture?.status).to.equal("pending");
		const blocked = tasks.find(
			(task) => task.taskKey === "source_resolution:u99:card",
		);
		expect(blocked?.status).to.equal("blocked");
		expect(blocked?.stage).to.equal("comparing_sources");
	});

	it("prunes only pending source tasks absent from the fresh safe graph", () => {
		expect(
			selectObsoleteCredentialRecoverySourceTaskIds(
				[
					{ id: "keep", taskKey: "source_capture:device-a:1:face" },
					{ id: "prune", taskKey: "source_capture:device-b:2:face" },
				],
				new Set(["source_capture:device-a:1:face"]),
			),
		).to.deep.equal(["prune"]);
	});

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
					"Neither exact shared card custody, the same canonical HRIS employee, nor the same plain vendor person id proves the face association.",
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
					'Target rejected or failed to retain one or more raw fingerprint templates: [{"fingerPrintId":1,"writeOk":true,"sticky":false,"progressStatus":5,"source":"device_fp_write_rejected_progress5:16"}]',
				),
			),
		).to.include({
			code: "device_fp_write_rejected_progress",
			category: "device_apply",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Face peer association is proven by same vendor person id, but neither source nor target yields a card value for the stored-face writer. Capture or enroll one card for this person, then retry.",
				),
			),
		).to.include({
			code: "face_writer_card_missing",
			category: "identity_custody",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"stored_face_sdk_preview_failed exitCode=1: Stored-face SDK preview did not accept the exact custody payload.",
				),
			),
		).to.include({
			code: "stored_face_sdk_failed",
			category: "sdk_runtime",
			retryable: true,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"stored_face_sdk_execute_failed exitCode=1: card_ensure ok=false reason=card_bind_failed | reread writeOk=false failReason=stored_face_card_ensure_failed",
				),
			),
		).to.include({
			code: "face_writer_card_bind_failed",
			category: "identity_custody",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"stored_face_sdk_execute_failed exitCode=1: peer_face_write ok=false failReason=device_face_template_full recvStatus=2",
				),
			),
		).to.include({
			code: "stored_face_device_full",
			category: "device_apply",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"stored_face_sdk_execute_failed exitCode=1: peer_face_write ok=false failReason=device_recv_status_failed recvStatus=0 sendOk=true callbackCompleted=true lastError=0",
				),
			),
		).to.include({
			code: "stored_face_sdk_failed",
			category: "sdk_runtime",
			retryable: true,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"stored_face_sdk_preview_failed exitCode=255: timeout: the monitored command dumped core",
				),
			),
		).to.include({
			code: "stored_face_sdk_crash",
			category: "sdk_runtime",
			retryable: false,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"Credential-only face isolation failed after reread (fingerprint_or_card changed).",
				),
			),
		).to.include({
			code: "face_isolation_after_write",
			category: "safety_gate",
			retryable: true,
			observabilityDefect: false,
		});
		expect(
			classifyCredentialRecoveryError(
				new Error(
					"INFO: hikvision hot-reload LOCAL_API_BASE=http://localhost:3101\nloop[2] find 16 mac and 16 ip",
				),
			),
		).to.include({
			code: "stored_face_sdk_wrapper_noise",
			category: "sdk_runtime",
			retryable: true,
			observabilityDefect: true,
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
					"Hikvision SDK biometric export failed for device/user; reason=source_device_not_armed",
				),
			),
		).to.include({
			code: "sdk_source_device_not_armed",
			category: "sdk_runtime",
			retryable: true,
			observabilityDefect: false,
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

	it("keeps identity linkage and richest-path blocks as agent recovery not red physical", () => {
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "canonical_identity_unproven",
			}),
		).to.equal("recovery_needed");
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "source_conflict",
				recoveryStage: "comparing_sources",
			}),
		).to.equal("recovery_needed");
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "target_write_unsupported",
			}),
		).to.equal("recovery_needed");
	});

	it("marks only true dual-owner / enroll / firmware as physical_action_required", () => {
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "physical_identity_adjudication_required",
			}),
		).to.equal("physical_action_required");
		expect(
			classifyCredentialRecoveryWrite({
				executionEligibility: "blocked",
				blockingReason: "source_conflict",
				recoveryStage: "physical_identity_action_required",
			}),
		).to.equal("physical_action_required");
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
				// Amber agent recovery — not physical enroll.
				{ blockingReason: "canonical_identity_unproven" },
				// True dual-owner / identity conflict — red physical.
				{ blockingReason: "physical_identity_adjudication_required" },
				// Amber export — not physical enroll.
				{ blockingReason: "missing_raw_blob" },
			],
		};
		const summary = summarizeCredentialRecovery(plan, []);
		expect(summary.physicalActionRequired).to.equal(1);
		expect(summary.recoveryNeeded).to.equal(2);
	});
});
