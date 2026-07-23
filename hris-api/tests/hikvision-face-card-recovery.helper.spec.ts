import { expect } from "chai";
import {
	HIKVISION_CREDENTIAL_RECOVERY_STAGES,
	HIKVISION_PHYSICAL_BOUNDARY_STAGES,
	assertHikvisionCardInfoWriteAccepted,
	assertHikvisionCardTargetOwnership,
	buildHikvisionCardInfoRecordBody,
	buildHikvisionStoredFaceWritePayload,
	classifyHikvisionFaceCardGapStage,
	classifyHikvisionWriterCapability,
	createHikvisionWriterCapabilityEvidence,
	extractHikvisionCardCustody,
	redactHikvisionWriterCapabilityEvidence,
	resolveHikvisionDeployedBuildAttestation,
	summarizeHikvisionPotentialOperations,
	validateHikvisionSdkFaceCustody,
	verifyHikvisionCardInfoPhysicalReread,
	verifyHikvisionStoredFacePhysicalReread,
} from "../helper/hikvision-face-card-recovery.helper";

const BUILD_SHA = "440951d87392643e52d64f6257d7a056a0c4dc4e";
const IMAGE_DIGEST = `sha256:${"a".repeat(64)}`;
const jpegBase64 = (marker = 0x41) =>
	Buffer.concat([
		Buffer.from([0xff, 0xd8]),
		Buffer.alloc(128, marker),
		Buffer.from([0xff, 0xd9]),
	]).toString("base64");

describe("Hikvision face/card recovery contract", () => {
	it("publishes the exact executable recovery-stage taxonomy and only three physical boundaries", () => {
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
		expect(HIKVISION_PHYSICAL_BOUNDARY_STAGES).to.deep.equal([
			"physical_identity_action_required",
			"physical_reenrollment_required",
			"device_firmware_unsupported",
		]);
	});

	it("derives deployed build truth from image metadata and ignores manual writer toggles", () => {
		const result = resolveHikvisionDeployedBuildAttestation({
			PROJECT_TRUTH_DEPLOYED_COMMIT: BUILD_SHA,
			PROJECT_TRUTH_IMAGE_DIGEST: IMAGE_DIGEST,
			HIKVISION_STORED_FACE_WRITER_BUILD_ATTESTATION: "manual-value",
			HIKVISION_ENABLE_STORED_FACE_WRITE: "1",
		});
		expect(result).to.deep.equal({
			exactBuildSha: BUILD_SHA,
			imageDigest: IMAGE_DIGEST,
			source: "PROJECT_TRUTH_DEPLOYED_COMMIT",
		});
		expect(() =>
			resolveHikvisionDeployedBuildAttestation({
				HIKVISION_STORED_FACE_WRITER_BUILD_ATTESTATION: BUILD_SHA,
			}),
		).to.throw("missing from image/commit metadata");
	});

	it("persists exact safe capability evidence and enables only its proven model/firmware/build tuple", () => {
		const build = resolveHikvisionDeployedBuildAttestation({
			PROJECT_TRUTH_DEPLOYED_COMMIT: BUILD_SHA,
			PROJECT_TRUTH_IMAGE_DIGEST: IMAGE_DIGEST,
		});
		const evidence = createHikvisionWriterCapabilityEvidence({
			deviceId: "device-b",
			model: "DS-K1T",
			firmware: "V3.2.1",
			endpoint: "/ISAPI/AccessControl/CardInfo/Record?format=json",
			responseStatus: 1,
			responseBody: {
				ResponseStatus: { statusCode: 1 },
				cardNo: "must-never-persist",
				token: "must-never-persist",
			},
			testedWriter: "card_info_record",
			build,
			canaryUserId: "13",
			canaryTargetDeviceId: "device-b",
			canaryRetainedChecksum: "b".repeat(64),
			physicallyRetained: true,
			timestamp: "2026-07-23T12:00:00.000Z",
		});
		const safe = redactHikvisionWriterCapabilityEvidence(evidence);
		expect(safe).to.include({
			deviceId: "device-b",
			model: "DS-K1T",
			firmware: "V3.2.1",
			testedWriter: "card_info_record",
			exactBuildSha: BUILD_SHA,
			canaryUserId: "13",
			canaryTargetDeviceId: "device-b",
			physicallyRetained: true,
		});
		expect(safe.responseBodyChecksum).to.match(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(safe)).not.to.include("must-never-persist");
		expect(
			classifyHikvisionWriterCapability({
				evidence,
				deviceId: "device-e",
				model: "DS-K1T",
				firmware: "V3.2.1",
				writer: "card_info_record",
				build,
			}),
		).to.include({
			actionable: true,
			reason: "ready_from_physically_proven_tuple",
		});
		expect(
			classifyHikvisionWriterCapability({
				evidence,
				deviceId: "device-b",
				model: "DS-K1T",
				firmware: "different",
				writer: "card_info_record",
				build,
			}),
		).to.include({ actionable: false, reason: "device_tuple_mismatch" });
		expect(() =>
			createHikvisionWriterCapabilityEvidence({
				deviceId: "device-b",
				model: "DS-K1T",
				firmware: "V3.2.1",
				endpoint: "/endpoint",
				responseStatus: 1,
				responseBody: {},
				testedWriter: "card_info_record",
				build,
				canaryUserId: "13",
				canaryTargetDeviceId: "device-f",
				canaryRetainedChecksum: "b".repeat(64),
				physicallyRetained: true,
			}),
		).to.throw("physical reread proof");
	});

	it("requires a fresh SDK face template+picture export and exact isolated physical reread", () => {
		const now = Date.parse("2026-07-23T12:00:30.000Z");
		const custody = validateHikvisionSdkFaceCustody({
			vendorUserId: "13",
			sourceDeviceId: "device-a",
			exportedAt: "2026-07-23T12:00:00.000Z",
			templateBase64: Buffer.alloc(128, 0x33).toString("base64"),
			pictureBase64: jpegBase64(),
			cardOwnerVerified: true,
			now,
		});
		expect(custody.templateSha256).to.match(/^[a-f0-9]{64}$/);
		expect(custody.pictureSha256).to.match(/^[a-f0-9]{64}$/);
		expect(
			buildHikvisionStoredFaceWritePayload({
				custody,
				targetDeviceId: "device-b",
				cardNo: "000013",
			}),
		).to.include({
			targetDeviceId: "device-b",
			employeeNo: "13",
			cardNo: "000013",
		});
		expect(
			verifyHikvisionStoredFacePhysicalReread({
				custody,
				targetDeviceId: "device-b",
				vendorUserId: "13",
				templateBase64: custody.templateBase64,
				pictureBase64: custody.pictureBase64,
				faceCount: 1,
				identityDigestBefore: "identity",
				identityDigestAfter: "identity",
				fingerprintDigestBefore: "finger",
				fingerprintDigestAfter: "finger",
				cardDigestBefore: "card",
				cardDigestAfter: "card",
			}),
		).to.include({ physicallyRetained: true });
		expect(() =>
			verifyHikvisionStoredFacePhysicalReread({
				custody,
				targetDeviceId: "device-b",
				vendorUserId: "13",
				templateBase64: custody.templateBase64,
				pictureBase64: jpegBase64(0x42),
				faceCount: 1,
				identityDigestBefore: "identity",
				identityDigestAfter: "identity",
				fingerprintDigestBefore: "finger",
				fingerprintDigestAfter: "finger",
				cardDigestBefore: "card",
				cardDigestAfter: "card",
			}),
		).to.throw("exact template+picture retention");
		expect(() =>
			validateHikvisionSdkFaceCustody({
				vendorUserId: "13",
				sourceDeviceId: "device-a",
				exportedAt: "2026-07-23T11:00:00.000Z",
				templateBase64: Buffer.alloc(128).toString("base64"),
				pictureBase64: jpegBase64(),
				cardOwnerVerified: true,
				now,
			}),
		).to.throw("stale");
		expect(() =>
			validateHikvisionSdkFaceCustody({
				vendorUserId: "13",
				sourceDeviceId: "device-a",
				exportedAt: "2026-07-23T12:00:00.000Z",
				templateBase64: Buffer.alloc(128).toString("base64"),
				pictureBase64: jpegBase64(),
				cardOwnerVerified: false,
				now,
			}),
		).to.throw("employee-owned CardInfo");
	});

	it("extracts exact CardInfo custody, refuses another owner/overwrite, and requires reciprocal reread", () => {
		const custody = extractHikvisionCardCustody({
			response: {
				CardInfoSearch: {
					CardInfo: [{ employeeNo: "13", cardNo: "000013" }],
				},
			},
			vendorUserId: "13",
			sourceDeviceId: "device-a",
			capturedAt: "2026-07-23T12:00:00.000Z",
		});
		expect(custody.cardSha256).to.match(/^[a-f0-9]{64}$/);
		expect(buildHikvisionCardInfoRecordBody(custody)).to.deep.equal({
			CardInfo: {
				employeeNo: "13",
				cardNo: "000013",
				cardType: "normalCard",
				checkCardNo: true,
			},
		});
		expect(() =>
			assertHikvisionCardTargetOwnership({
				custody,
				targetVendorUserId: "13",
				targetCardSearchResponse: {
					CardInfoSearch: {
						CardInfo: [{ employeeNo: "88", cardNo: "000013" }],
					},
				},
			}),
		).to.throw("another physical target identity");
		expect(() =>
			assertHikvisionCardTargetOwnership({
				custody,
				targetVendorUserId: "13",
				targetCardSearchResponse: {
					CardInfoSearch: {
						CardInfo: [{ employeeNo: "13", cardNo: "different" }],
					},
				},
			}),
		).to.throw("overwrite is refused");
		expect(
			assertHikvisionCardInfoWriteAccepted({
				ResponseStatus: { statusCode: 1, statusString: "OK" },
			}),
		).to.deep.equal({ statusCode: 1, statusText: "ok" });
		expect(
			verifyHikvisionCardInfoPhysicalReread({
				custody,
				targetDeviceId: "device-b",
				rereadResponse: {
					CardInfoSearch: {
						CardInfo: [{ employeeNo: "13", cardNo: "000013" }],
					},
				},
				identityDigestBefore: "identity",
				identityDigestAfter: "identity",
				fingerprintDigestBefore: "finger",
				fingerprintDigestAfter: "finger",
				faceDigestBefore: "face",
				faceDigestAfter: "face",
			}),
		).to.include({
			physicallyRetained: true,
			vendorUserId: "13",
			targetDeviceId: "device-b",
		});
	});

	it("counts every unconverged difference as potential regardless of recovery stage", () => {
		const summary = summarizeHikvisionPotentialOperations([
			{
				operationId: "fp-1",
				modality: "fingerprint",
				recoveryStage: "ready_to_write",
			},
			{
				operationId: "face-1",
				modality: "face",
				recoveryStage: "probing_target_capability",
			},
			{
				operationId: "face-2",
				modality: "face",
				recoveryStage: "queued_source_custody_recovery",
			},
			{
				operationId: "card-1",
				modality: "card",
				recoveryStage: "physical_reenrollment_required",
			},
			{
				operationId: "done-1",
				modality: "card",
				recoveryStage: "physically_retained",
				alreadyConverged: true,
			},
		]);
		expect(summary).to.deep.include({
			totalPotentialOperations: 4,
			byModality: { fingerprint: 1, face: 2, card: 1 },
			alreadyConverged: 1,
			physicalBoundaryOperations: 1,
		});
		expect(summary.byRecoveryStage.probing_target_capability).to.equal(1);
		expect(summary.byRecoveryStage.queued_source_custody_recovery).to.equal(1);
		expect(() =>
			summarizeHikvisionPotentialOperations([
				{
					operationId: "same",
					modality: "face",
					recoveryStage: "ready_to_write",
				},
				{
					operationId: "same",
					modality: "card",
					recoveryStage: "ready_to_write",
				},
			]),
		).to.throw("unique durable operation IDs");
	});

	it("turns missing custody and unproven writers into executable stages, not generic blockers", () => {
		expect(
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: false,
				targetWriterActionable: false,
			}),
		).to.equal("queued_source_custody_recovery");
		expect(
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: true,
				targetWriterActionable: false,
			}),
		).to.equal("probing_target_capability");
		expect(
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: true,
				targetWriterActionable: true,
			}),
		).to.equal("preparing_writer");
		expect(
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: true,
				targetWriterActionable: true,
				writerPrepared: true,
			}),
		).to.equal("ready_to_write");
		expect(() =>
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: false,
				targetWriterActionable: false,
				physicalBoundary: {
					stage: "physical_reenrollment_required",
					namedCause: "",
					attemptedPaths: [],
				},
			}),
		).to.throw("named cause and completed attempted paths");
		expect(() =>
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: true,
				targetWriterActionable: false,
				physicalBoundary: {
					stage: "device_firmware_unsupported",
					namedCause: "FaceDataRecord capability explicitly unsupported",
					attemptedPaths: ["FaceDataRecord/capabilities"],
				},
			}),
		).to.throw("current capability response evidence");
		expect(
			classifyHikvisionFaceCardGapStage({
				rawCustodyPresent: true,
				targetWriterActionable: false,
				physicalBoundary: {
					stage: "device_firmware_unsupported",
					namedCause: "FaceDataRecord capability explicitly unsupported",
					attemptedPaths: ["FaceDataRecord/capabilities"],
					capabilityEvidenceChecksum: "c".repeat(64),
				},
			}),
		).to.equal("device_firmware_unsupported");
	});

	it("preserves the starting 3,498 potential-operation truth while rows are still recovering", () => {
		const operations = [
			...Array.from({ length: 744 }, (_, index) => ({
				operationId: `fingerprint-${index}`,
				modality: "fingerprint" as const,
				recoveryStage:
					index < 668
						? ("ready_to_write" as const)
						: ("resolving_richest_source" as const),
			})),
			...Array.from({ length: 2_631 }, (_, index) => ({
				operationId: `face-${index}`,
				modality: "face" as const,
				recoveryStage:
					index < 2_510
						? ("probing_target_capability" as const)
						: ("queued_source_custody_recovery" as const),
			})),
			...Array.from({ length: 123 }, (_, index) => ({
				operationId: `card-${index}`,
				modality: "card" as const,
				recoveryStage: "queued_source_custody_recovery" as const,
			})),
		];
		const summary = summarizeHikvisionPotentialOperations(operations);
		expect(summary.totalPotentialOperations).to.equal(3_498);
		expect(summary.byModality).to.deep.equal({
			fingerprint: 744,
			face: 2_631,
			card: 123,
		});
		expect(summary.byRecoveryStage.probing_target_capability).to.equal(2_510);
		expect(summary.byRecoveryStage.queued_source_custody_recovery).to.equal(244);
	});
});
