import { expect } from "chai";
import {
	buildHikvisionCredentialOperationTelemetry,
	HIKVISION_CREDENTIAL_RECOVERY_STAGES,
} from "../helper/hikvision-credential-operation-telemetry.helper";

describe("Hikvision credential operation telemetry", () => {
	it("publishes the exact executable recovery-stage contract", () => {
		expect(HIKVISION_CREDENTIAL_RECOVERY_STAGES).to.deep.equal([
			"queued_source_custody_recovery",
			"exporting_source_credential",
			"comparing_sources",
			"resolving_richest_source",
			"probing_target_capability",
			"preparing_writer",
			"ready_to_write",
			"writing",
			"rereading_target",
			"physically_retained",
			"retrying_recoverable_failure",
			"physical_identity_action_required",
			"physical_reenrollment_required",
			"device_firmware_unsupported",
		]);
	});

	it("creates a correlated safe envelope without carrying credential bytes or card values", () => {
		const telemetry = buildHikvisionCredentialOperationTelemetry(
			{
				requestId: "request-1",
				jobId: "job-1",
				planId: "plan-1",
				scopeHash: "scope-1",
				organizationId: "org-1",
				buildAttestation: "a".repeat(40),
			},
			{
				id: "write-1",
				vendorUserId: "9",
				modality: "face",
				sourceDeviceId: "source",
				sourceDeviceAddress: "10.184.37.20",
				targetDeviceId: "target",
				targetDeviceAddress: "10.184.37.21",
				writerStrategy: "sdk_face_template_writer",
				recoveryStage: "rereading_target",
				capabilityEvidenceSha256: "b".repeat(64),
				targetReportedCount: 0,
				actualCount: 1,
				faceTemplate: "must-not-leak",
				facePicture: "must-not-leak",
				cardNo: "must-not-leak",
				token: "must-not-leak",
			},
		);

		expect(telemetry).to.include({
			requestId: "request-1",
			jobId: "job-1",
			planId: "plan-1",
			scopeHash: "scope-1",
			organization: "org-1",
			vendorUserId: "9",
			modality: "face",
			sourcePhysicalTarget: "10.184.37.20",
			targetPhysicalTarget: "10.184.37.21",
			stage: "rereading_target",
			preWriteCount: 0,
			postWriteCount: 1,
			executionLocation: "vm-container",
		});
		expect(telemetry.operationId).to.match(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(telemetry)).not.to.include("must-not-leak");
	});
});
