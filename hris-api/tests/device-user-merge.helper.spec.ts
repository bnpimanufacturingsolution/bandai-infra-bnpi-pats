import { expect } from "chai";
import {
	applyMergeChoices,
	buildDeviceUserMergePlan,
	classifyFaceCustody,
	extractProgress5OwnerConflictsFromWriteError,
	fingerprintCustodyMatchesReview,
	proveCanonicalDeviceIdentity,
	proveFingerprintPhysicalReread,
	reconcileDurableFingerprintOwnerConflicts,
	resolveFaceAssociationStrategy,
	resolveFingerprintCredentialSource,
	serializeDeviceUserMergePlanForReview,
} from "../helper/device-user-merge.helper";

const record = (deviceId: string, patch: any = {}) => ({
	deviceId,
	deviceName: deviceId === "a" ? "Device A" : "Device B",
	vendorUserId: "0001",
	employeeId: "employee-1",
	displayName: "Ernest",
	status: "ACTIVE",
	rawPayload: { numOfFP: 1, numOfFace: 1, numOfCard: 1 },
	...patch,
});

describe("device user union merge", () => {
	it("resolves face association via same vendor person id without inventing dual-owner", () => {
		const peer = resolveFaceAssociationStrategy({
			vendorUserId: "15",
			source: { vendorUserId: "15", employeeId: null, _cardNo: null },
			target: { vendorUserId: "15", employeeId: null, _cardNo: null },
		});
		expect(peer.strategy).to.equal("same_vendor_user_id");
		expect(peer.blockingReason).to.equal(null);
		expect(peer.sameVendorPeer).to.equal(true);

		const card = resolveFaceAssociationStrategy({
			vendorUserId: "15",
			source: { vendorUserId: "15", _cardNo: "CARD-1" },
			target: { vendorUserId: "15", _cardNo: "CARD-1" },
		});
		expect(card.strategy).to.equal("exact_shared_card");

		const employee = resolveFaceAssociationStrategy({
			vendorUserId: "15",
			source: { vendorUserId: "15", employeeId: "emp-a" },
			target: { vendorUserId: "15", employeeId: "emp-a" },
		});
		expect(employee.strategy).to.equal("canonical_hris_employee");

		const conflict = resolveFaceAssociationStrategy({
			vendorUserId: "15",
			source: { vendorUserId: "15", employeeId: "emp-a" },
			target: { vendorUserId: "15", employeeId: "emp-b" },
		});
		expect(conflict.strategy).to.equal(null);
		expect(conflict.blockingReason).to.equal(
			"physical_identity_adjudication_required",
		);
		expect(conflict.employeeConflict).to.equal(true);

		const identity = proveCanonicalDeviceIdentity({
			vendorUserId: "8",
			source: { vendorUserId: "8", employeeId: null },
			target: { vendorUserId: "8", employeeId: null },
		});
		expect(identity.proven).to.equal(true);
		expect(identity.via).to.equal("same_vendor_user_id");
	});

	it("classifies face custody without treating a picture as an SDK template", () => {
		expect(
			classifyFaceCustody({ faceTemplate: "template", facePicture: "picture" }),
		).to.include({
			kind: "sdk_template_and_picture",
			hasTemplate: true,
			hasPicture: true,
		});
		expect(classifyFaceCustody({ facePicture: "picture" })).to.include({
			kind: "picture_only_not_writable",
			fdlibCapabilitySupported: false,
		});
		expect(
			classifyFaceCustody({
				facePicture: "picture",
				fdlibCapabilitySupported: true,
			}),
		).to.include({
			kind: "fdlib_picture",
			fdlibCapabilitySupported: true,
		});
		expect(classifyFaceCustody({ faceTemplate: "template" })).to.include({
			kind: "missing",
			hasTemplate: true,
			hasPicture: false,
		});
		expect(classifyFaceCustody({})).to.include({
			kind: "missing",
			hasTemplate: false,
			hasPicture: false,
		});
	});

	it("builds a union and preserves a user found on one device", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [record("a"), record("b", { vendorUserId: "0002", employeeId: null })],
		});
		expect(plan.counts.unionUsers).to.equal(2);
		expect(
			plan.users.find((user) => user.vendorUserIds.includes("0002"))?.missingOnDeviceIds,
		).to.deep.equal(["a"]);
	});

	it("does not treat a failed device read as zero IDs with all unique IDs missing", () => {
		// Device c was selected but inventory read failed: no records, excluded from validDeviceIds.
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			validDeviceIds: ["a", "b"],
			records: [
				record("a", { vendorUserId: "21", rawPayload: { numOfFP: 2, numOfFace: 1 } }),
				record("b", { vendorUserId: "21", rawPayload: { numOfFP: 1, numOfFace: 0 } }),
				record("a", { vendorUserId: "32", rawPayload: { numOfFP: 0, numOfFace: 0 } }),
			],
		});
		expect(plan.counts.unionUsers).to.equal(2);
		expect(plan.failedDeviceIds).to.deep.equal(["c"]);
		expect(plan.validDeviceIds).to.deep.equal(["a", "b"]);
		expect(plan.idsReadByDevice.a).to.equal(2);
		expect(plan.idsReadByDevice.b).to.equal(1);
		expect(plan.idsReadByDevice.c || 0).to.equal(0);
		// Missing only among successfully read devices, never the failed panel.
		for (const user of plan.users) {
			expect(user.missingOnDeviceIds).to.not.include("c");
			expect(user.targetDeviceIds).to.not.include("c");
		}
		const serialized = serializeDeviceUserMergePlanForReview({
			...plan,
			devices: [
				{ id: "a", name: "A", readStatus: "ok", idsRead: 2 },
				{ id: "b", name: "B", readStatus: "ok", idsRead: 1 },
				{
					id: "c",
					name: "E",
					readStatus: "failed",
					readError: "Unauthorized",
					idsRead: null,
				},
			],
			errors: [{ deviceId: "c", deviceName: "E", error: "Unauthorized" }],
		});
		expect(serialized.failedDeviceIds).to.deep.equal(["c"]);
		expect(serialized.devices.find((device: any) => device.id === "c")?.readStatus).to.equal(
			"failed",
		);
	});

	it("requires an explicit choice and supports A/B all choices", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [record("a"), record("b", { displayName: "E. Ramos" })],
		});
		expect(plan.counts.conflicts).to.be.greaterThan(0);
		expect(applyMergeChoices(plan).executable).to.equal(false);
		expect(applyMergeChoices(plan, { applyAll: "A" }).executable).to.equal(true);
		expect(applyMergeChoices(plan, { applyAll: "B" }).executable).to.equal(true);
	});

	it("does not treat biometric counts as weaker data", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", { rawPayload: { numOfFP: 2 } }),
				record("b", { rawPayload: { numOfFP: 1 } }),
			],
		});
		const fingerprintConflict = plan.users[0].conflicts.find(
			(conflict) => conflict.field === "fingerprint",
		);
		expect(fingerprintConflict?.deviceA.value).to.equal(2);
		expect(fingerprintConflict?.deviceB.value).to.equal(1);
	});

	it("blocks count-only credential gaps until portable bytes are reviewed", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "missing_raw_blob",
							reportedCount: 2,
							rawBlobCount: 0,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 1, numOfFace: 1, numOfCard: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "missing_raw_blob",
							reportedCount: 1,
							rawBlobCount: 0,
						},
						face: {
							status: "missing_raw_blob",
							reportedCount: 1,
							rawBlobPresent: false,
						},
					},
				}),
				record("c", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobCount: 0,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
				}),
			],
		});

		const fingerprintWrites = plan.credentialWrites.filter(
			(write) => write.modality === "fingerprint",
		);
		const faceWrites = plan.credentialWrites.filter((write) => write.modality === "face");
		expect(plan.plannedWrites).to.have.length(0);
		expect(fingerprintWrites).to.have.length(2);
		expect(fingerprintWrites.every((write) => write.sourceDeviceId === "a")).to.equal(true);
		expect(
			fingerprintWrites.every(
				(write) =>
					write.executionEligibility === "blocked" &&
					write.blockingReason === "missing_raw_blob" &&
					write.recommended === false,
			),
		).to.equal(true);
		expect(faceWrites).to.have.length(2);
		expect(faceWrites.every((write) => write.sourceDeviceId === "b")).to.equal(true);
		expect(plan.counts.actionableCredentialWrites).to.equal(0);
		expect(plan.counts.blockedCredentialWrites).to.equal(4);
	});

	it("selects only raw fingerprint custody and blocks stored faces without a write path", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 2, numOfFace: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobPresent: true,
						},
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 0, numOfFace: 0 },
					biometricEvidence: {
						fingerprint: { status: "not_enrolled", reportedCount: 0, rawBlobCount: 0 },
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
				}),
			],
		});
		const fingerprint = plan.credentialWrites.find((write) => write.modality === "fingerprint");
		const face = plan.credentialWrites.find((write) => write.modality === "face");
		expect(fingerprint?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(fingerprint?.recommended).to.equal(true);
		expect(face?.executionEligibility).to.equal("blocked");
		expect(face?.blockingReason).to.equal("target_write_unsupported");
		expect(face?.recommended).to.equal(false);
		expect(plan.counts.actionableCredentialWrites).to.equal(1);
		expect(plan.counts.blockedCredentialWrites).to.equal(1);
	});

	it("keeps every classified face custody kind blocked while its writer is unavailable", () => {
		for (const faceEvidence of [
			{
				custodyKind: "sdk_template_and_picture",
				fdlibCapabilitySupported: false,
			},
			{
				custodyKind: "fdlib_picture",
				fdlibCapabilitySupported: true,
			},
			{
				custodyKind: "picture_only_not_writable",
				fdlibCapabilitySupported: false,
			},
		] as const) {
			const plan = buildDeviceUserMergePlan({
				deviceIds: ["a", "b"],
				records: [
					record("a", {
						rawPayload: { numOfFP: 0, numOfFace: 1 },
						biometricEvidence: {
							fingerprint: {
								status: "not_enrolled",
								reportedCount: 0,
								rawBlobCount: 0,
							},
							face: {
								status: "raw_blob_present",
								reportedCount: 1,
								rawBlobPresent: true,
								...faceEvidence,
								writerAvailable: false,
							},
						},
					}),
					record("b", {
						rawPayload: { numOfFP: 0, numOfFace: 0 },
						biometricEvidence: {
							fingerprint: {
								status: "not_enrolled",
								reportedCount: 0,
								rawBlobCount: 0,
							},
							face: {
								status: "not_enrolled",
								reportedCount: 0,
								rawBlobPresent: false,
								custodyKind: "missing",
								writerAvailable: false,
							},
						},
					}),
				],
			});
			const face = plan.credentialWrites.find((write) => write.modality === "face");
			expect(face?.executionEligibility).to.equal("blocked");
			expect(face?.blockingReason).to.equal("target_write_unsupported");
			expect(face?.recommended).to.equal(false);
			expect(plan.counts.actionableCredentialWrites).to.equal(0);
		}
	});

	it("does not accept FDLib picture custody without affirmative capability evidence", () => {
		const classified = classifyFaceCustody({
			facePicture: "picture",
			fdlibCapabilitySupported: false,
		});
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 0, numOfFace: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobCount: 0,
						},
						face: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobPresent: true,
							custodyKind: classified.kind,
							fdlibCapabilitySupported: classified.fdlibCapabilitySupported,
							// Even a future writer flag cannot upgrade unproven capability.
							writerAvailable: true,
						},
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 0, numOfFace: 0 },
				}),
			],
		});
		const face = plan.credentialWrites.find((write) => write.modality === "face");
		expect(classified.kind).to.equal("picture_only_not_writable");
		expect(face?.executionEligibility).to.equal("blocked");
		expect(face?.blockingReason).to.equal("target_write_unsupported");
	});

	it("blocks tied count-only sources instead of choosing by device order", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", { rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 } }),
				record("b", { rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 } }),
				record("c", { rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 } }),
			],
		});

		const write = plan.credentialWrites.find(
			(item) => item.modality === "fingerprint" && item.targetDeviceId === "c",
		);
		expect(write?.sourceDeviceId).to.equal(null);
		expect(write?.sourceCandidateDeviceIds).to.have.members(["a", "b"]);
		expect(write?.executionEligibility).to.equal("blocked");
		expect(write?.blockingReason).to.equal("source_conflict");
		// No raw richest selected → agent export stage (not dual-owner compare).
		expect(write?.recoveryStage).to.equal("exporting_source_credential");
	});

	it("uses a stable representative when tied raw fingerprint checksum sets are equal", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["b", "a", "c"],
			records: [
				record("b", {
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 2, checksum: "beta" },
						{ fingerPrintId: 1, checksum: "alpha" },
					],
				}),
				record("a", {
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "alpha" },
						{ fingerPrintId: 2, checksum: "beta" },
					],
				}),
				record("c", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 },
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) => item.modality === "fingerprint" && item.targetDeviceId === "c",
		);
		expect(write?.sourceDeviceId).to.equal("a");
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recommendationReason).to.include("equal checksum sets");
		expect(write?.sourceFingerprintTemplateChecksums).to.deep.equal([
			{ fingerPrintId: 1, checksum: "alpha" },
			{ fingerPrintId: 2, checksum: "beta" },
		]);
		expect(write?.physicalRereadRequired).to.equal(true);
	});

	it("rejects changed fingerprint slot/checksum custody after review", () => {
		const reviewed = [
			{ fingerPrintId: 2, checksum: "BETA" },
			{ fingerPrintId: 1, checksum: "alpha" },
		];
		expect(
			fingerprintCustodyMatchesReview(reviewed, [
				{ fingerPrintId: 1, checksum: "alpha" },
				{ fingerPrintId: 2, checksum: "beta" },
			]),
		).to.equal(true);
		expect(
			fingerprintCustodyMatchesReview(reviewed, [
				{ fingerPrintId: 1, checksum: "different" },
				{ fingerPrintId: 2, checksum: "beta" },
			]),
		).to.equal(false);
		expect(
			fingerprintCustodyMatchesReview(reviewed, [
				{ fingerPrintId: 2, checksum: "alpha" },
				{ fingerPrintId: 1, checksum: "beta" },
			]),
		).to.equal(false);
	});

	it("selects the only strict fingerprint checksum superset", () => {
		const records = [
			record("a", {
				rawPayload: { numOfFP: 1 },
				biometricEvidence: {
					fingerprint: {
						status: "raw_blob_present",
						reportedCount: 1,
						rawBlobCount: 1,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
				_fingerprintTemplateChecksums: [{ fingerPrintId: 1, checksum: "alpha" }],
			}),
			record("b", {
				rawPayload: { numOfFP: 2 },
				biometricEvidence: {
					fingerprint: {
						status: "raw_blob_present",
						reportedCount: 2,
						rawBlobCount: 2,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
				_fingerprintTemplateChecksums: [
					{ fingerPrintId: 1, checksum: "alpha" },
					{ fingerPrintId: 2, checksum: "beta" },
				],
			}),
			record("c", {
				rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 },
			}),
		];
		const source = resolveFingerprintCredentialSource(records.slice(0, 2));
		expect(source.source?.deviceId).to.equal("b");
		expect(source.reason).to.equal("strict_checksum_superset");
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records,
		});
		const write = plan.credentialWrites.find(
			(item) => item.modality === "fingerprint" && item.targetDeviceId === "c",
		);
		expect(write?.sourceDeviceId).to.equal("b");
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recommendationReason).to.include("strict superset");
	});

	it("picks richest fingerprint source and allows overwrite when target has different checksums", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "alpha" },
						{ fingerPrintId: 2, checksum: "beta" },
					],
				}),
				record("b", {
					rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "different-person-or-finger" },
					],
				}),
			],
		});
		const write = plan.credentialWrites.find((item) => item.modality === "fingerprint");
		expect(write?.sourceDeviceId).to.equal("a");
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recommended).to.equal(true);
		expect(write?.blockingReason).to.equal(null);
		expect(write?.recoveryStage).to.equal("ready_to_write");
		expect(write?.recommendationReason).to.include("RICHEST SOURCE OVERWRITE");
	});

	it("picks a stable richest fingerprint source when tied max counts disagree on checksums", () => {
		const resolution = resolveFingerprintCredentialSource([
			record("b", {
				rawPayload: { numOfFP: 2 },
				biometricEvidence: {
					fingerprint: {
						status: "raw_blob_present",
						reportedCount: 2,
						rawBlobCount: 2,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
				_fingerprintTemplateChecksums: [
					{ fingerPrintId: 1, checksum: "one" },
					{ fingerPrintId: 2, checksum: "two" },
				],
			}),
			record("a", {
				rawPayload: { numOfFP: 2 },
				biometricEvidence: {
					fingerprint: {
						status: "raw_blob_present",
						reportedCount: 2,
						rawBlobCount: 2,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
				_fingerprintTemplateChecksums: [
					{ fingerPrintId: 1, checksum: "alpha" },
					{ fingerPrintId: 2, checksum: "beta" },
				],
			}),
		]);
		expect(resolution.reason).to.equal("richest_count_default_overwrite");
		// Stable deviceId among equal counts.
		expect(resolution.source?.deviceId).to.equal("a");
	});

	it("identifies real card custody but keeps it blocked until a credential-only writer exists", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					_cardNo: "sensitive-card-number",
					rawPayload: {
						numOfFP: 0,
						numOfFace: 0,
						numOfCard: 1,
						cardNo: "CARD-001",
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 },
				}),
			],
		});
		const write = plan.credentialWrites.find((item) => item.modality === "card");
		expect(write?.sourceDeviceId).to.equal("a");
		expect(write?.sourceEvidenceStatus).to.equal("raw_blob_present");
		expect(write?.executionEligibility).to.equal("blocked");
		expect(write?.blockingReason).to.equal("credential_only_card_not_supported");
		expect(write?.physicalRereadRequired).to.equal(true);
	});

	it("makes exact card custody actionable only when the dormant writer is explicitly enabled", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1 },
					_cardNo: "CARD-001",
					biometricEvidence: {
						fingerprint: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobCount: 0,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
						card: {
							status: "raw_blob_present",
							cardNoPresent: true,
							writerAvailable: true,
						},
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobCount: 0,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
						card: {
							status: "not_enrolled",
							cardNoPresent: false,
							writerAvailable: true,
						},
					},
				}),
			],
		});
		const write = plan.credentialWrites.find((item) => item.modality === "card");
		expect(write?.sourceDeviceId).to.equal("a");
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recoveryStage).to.equal("ready_to_write");
		expect(write?.blockingReason).to.equal(null);
		expect(write?.recommended).to.equal(true);
		expect(write?.physicalRereadRequired).to.equal(true);
	});

	it("keeps a durable SDK progress-5 duplicate owner from returning unsafe-ready", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "source-slot-1" },
						{ fingerPrintId: 2, checksum: "source-slot-2" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
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
						{ fingerPrintId: 1, checksum: "source-slot-1" },
					],
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "employee-8",
					rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
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
						{ fingerPrintId: 2, checksum: "source-slot-2" },
					],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "physical-job",
				vendorUserId: "1",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "8",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		// Admin 1 vs admin 8: force-clear path, not permanent dual-owner RED.
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.blockingReason).to.equal(null);
		expect(write?.adminSandboxForceOverwrite).to.equal(true);
		expect(write?.adminSandboxConflictingOwners).to.deep.equal(["8"]);
		expect(write?.recommendationReason).to.include("ADMIN_SANDBOX_FORCE_OVERWRITE");
	});

	it("allows per-identity fingerprint writes when this person has proven custody even if fleet owner scan is incomplete", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "one" },
						{ fingerPrintId: 2, checksum: "two" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "employee-8",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "missing_raw_blob",
							reportedCount: 1,
							rawBlobCount: 0,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		// Person 1 has complete source custody and empty target FP — ready.
		// Person 8 missing export remains fleet-scan evidence, not a hard block.
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recommended).to.equal(true);
		expect(write?.blockingReason).to.not.equal("target_owner_scan_incomplete");
		expect(write?.canonicalIdentityProven).to.equal(true);
		expect(write?.targetOwnerScanComplete).to.equal(false);
		expect(write?.targetOwnerScanMissingCount).to.equal(1);
		expect(write?.targetOwnerScanMissingVendorUserIdSample).to.deep.equal(["8"]);
		expect(write?.targetOwnerScanEvidenceHash).to.match(/^[a-f0-9]{64}$/);
		expect(plan.fingerprintTargetOwnerScans).to.deep.include({
			targetDeviceId: "target",
			complete: false,
			missingCount: 1,
			evidenceHash: write?.targetOwnerScanEvidenceHash,
			missingVendorUserIds: ["8"],
		});
		expect(write?.recommendationReason).to.include("fleet scan incomplete");
	});

	it("still blocks fingerprint write when this target owner lacks checksum custody", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
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
						{ fingerPrintId: 1, checksum: "one" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "missing_raw_blob",
							reportedCount: 1,
							rawBlobCount: 0,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		// When target already has enrolled FP without checksums, block until export.
		// (May also be classified earlier as missing/gap rather than ready-then-gated.)
		if (write?.executionEligibility === "ready_from_raw_blob") {
			expect(write.blockingReason).to.equal("target_owner_scan_incomplete");
			expect(write.recoveryStage).to.equal("exporting_source_credential");
		} else {
			expect(write?.executionEligibility).to.not.equal("ready_from_raw_blob");
		}
	});

	it("allows fingerprint readiness for same vendor person id even when target HRIS link is missing", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
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
						{ fingerPrintId: 1, checksum: "one" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: null,
					rawPayload: { numOfFP: 0 },
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) => item.modality === "fingerprint",
		);
		// Peer copy on vendor person "1" is proven; missing target HRIS link is not dual-owner.
		expect(write?.blockingReason).to.not.equal("canonical_identity_unproven");
		expect(write?.canonicalIdentityProven).to.equal(true);
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
	});

	it("rejects a fingerprint write when another fleet record maps the same vendor id to a different employee", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target", "peer"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
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
						{ fingerPrintId: 1, checksum: "one" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 0 },
				}),
				record("peer", {
					vendorUserId: "1",
					employeeId: "employee-2",
					rawPayload: { numOfFP: 0 },
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.targetDeviceId === "target",
		);
		expect(write?.blockingReason).to.equal("canonical_identity_unproven");
		expect(write?.recoveryStage).to.equal("comparing_sources");
	});

	it("allows fingerprint readiness after canonical identity and the full target owner scan are complete", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "one" },
						{ fingerPrintId: 2, checksum: "two" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "employee-8",
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
						{ fingerPrintId: 4, checksum: "other-owner" },
					],
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.recoveryStage).to.equal("ready_to_write");
		expect(write?.canonicalIdentityProven).to.equal(true);
		expect(write?.targetOwnerScanComplete).to.equal(true);
		expect(write?.targetOwnerScanMissingCount).to.equal(0);
		expect(write?.targetOwnerScanMissingVendorUserIdSample).to.deep.equal([]);
	});

	it("stores complete target-owner recovery IDs once instead of repeating them per write", () => {
		const actionableRecords = Array.from({ length: 40 }, (_, index) => {
			const vendorUserId = `ready-${String(index).padStart(3, "0")}`;
			const employeeId = `employee-ready-${index}`;
			return [
				record("source", {
					vendorUserId,
					employeeId,
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
						{ fingerPrintId: 1, checksum: `checksum-${index}` },
					],
				}),
				record("target", {
					vendorUserId,
					employeeId,
					rawPayload: { numOfFP: 0 },
				}),
			];
		}).flat();
		const unknownOwnerRecords = Array.from({ length: 120 }, (_, index) =>
			record("target", {
				vendorUserId: `unknown-${String(index).padStart(3, "0")}`,
				employeeId: `employee-unknown-${index}`,
				rawPayload: { numOfFP: 1 },
				biometricEvidence: {
					fingerprint: {
						status: "missing_raw_blob",
						reportedCount: 1,
						rawBlobCount: 0,
					},
					face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
				},
			}),
		);
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [...actionableRecords, ...unknownOwnerRecords],
		});
		const readyWrites = plan.credentialWrites.filter(
			(write) =>
				write.modality === "fingerprint" &&
				write.targetDeviceId === "target" &&
				write.executionEligibility === "ready_from_raw_blob" &&
				write.recommended === true,
		);
		const guardedWrites = plan.credentialWrites.filter(
			(write) =>
				write.modality === "fingerprint" &&
				write.targetDeviceId === "target" &&
				write.blockingReason === "target_owner_scan_incomplete",
		);
		// Ready people keep per-identity write eligibility; fleet unknowns stay export-only.
		expect(readyWrites).to.have.length(40);
		expect(guardedWrites).to.have.length(0);
		expect(
			readyWrites.every(
				(write) =>
					write.targetOwnerScanComplete === false &&
					write.targetOwnerScanMissingCount === 120 &&
					write.targetOwnerScanMissingVendorUserIdSample?.length === 3 &&
					!("targetOwnerScanMissingVendorUserIds" in write),
			),
		).to.equal(true);
		const summary = plan.fingerprintTargetOwnerScans.find(
			(scan) => scan.targetDeviceId === "target",
		);
		expect(summary?.missingCount).to.equal(120);
		expect(summary?.missingVendorUserIds).to.have.length(120);
		expect(plan.fingerprintTargetOwnerScans).to.have.length(1);
		const serializedWrites = JSON.stringify(readyWrites);
		expect(serializedWrites).not.to.include("unknown-119");
		expect(JSON.stringify(summary)).to.include("unknown-119");
	});

	it("resolves a durable owner collision as a safe no-write only for canonical identity and checksum equality", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "canonical-employee",
					rawPayload: { numOfFP: 2, numOfFace: 0, numOfCard: 0 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: {
							status: "not_enrolled",
							reportedCount: 0,
							rawBlobPresent: false,
						},
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "source-slot-1" },
						{ fingerPrintId: 2, checksum: "same-physical-finger" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "canonical-employee",
					rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
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
						{ fingerPrintId: 1, checksum: "source-slot-1" },
					],
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "canonical-employee",
					rawPayload: { numOfFP: 1, numOfFace: 0, numOfCard: 0 },
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
						{ fingerPrintId: 2, checksum: "same-physical-finger" },
					],
				}),
			],
		});
		const originalWrite = plan.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target" &&
				item.executionEligibility === "ready_from_raw_blob",
		);
		expect(originalWrite?.executionEligibility).to.equal("ready_from_raw_blob");
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "physical-job",
				vendorUserId: "1",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "8",
			},
		]);
		expect(
			reconciled.credentialWrites.some((item) => item.id === originalWrite?.id),
		).to.equal(false);
		expect(reconciled.credentialResolutions).to.deep.include({
			writeId: originalWrite?.id,
			modality: "fingerprint",
			resolution: "equivalent_owner_safe_no_write",
			vendorUserId: "1",
			targetDeviceId: "target",
			conflictingVendorUserIds: ["8"],
			jobIds: ["physical-job"],
			physicalRereadRequired: true,
		});
	});

	it("carries durable duplicate-owner evidence across richest-source replans", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["new-richest", "target"],
			records: [
				record("new-richest", {
					vendorUserId: "1",
					employeeId: "employee-1",
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
						{ fingerPrintId: 2, checksum: "collision-checksum" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "employee-8",
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
						{ fingerPrintId: 2, checksum: "collision-checksum" },
					],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "earlier-job",
				vendorUserId: "1",
				sourceDeviceId: "old-source-no-longer-selected",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "8",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		// Both vendor 1 and conflicting owner 8 are admin-sandbox (1–20): force overwrite.
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.blockingReason).to.equal(null);
		expect(write?.adminSandboxForceOverwrite).to.equal(true);
		expect(write?.adminSandboxConflictingOwners).to.deep.equal(["8"]);
		expect(write?.recommendationReason || "").to.include(
			"ADMIN_SANDBOX_FORCE_OVERWRITE",
		);
	});

	it("keeps dual-owner fail-closed when conflicting owner is PROD vendor 21+", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "employee-1",
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
						{ fingerPrintId: 2, checksum: "collision-checksum" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "employee-1",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "900",
					employeeId: "employee-prod",
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
						{ fingerPrintId: 2, checksum: "collision-checksum" },
					],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "earlier-job",
				vendorUserId: "1",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "900",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		expect(write?.executionEligibility).to.equal("blocked");
		expect(write?.blockingReason).to.equal("device_fp_anti_dupe_peer_owner");
		expect(write?.adminSandboxForceOverwrite).to.not.equal(true);
		expect(write?.recommendationReason || "").to.match(
			/anti-dupe|progressStatus=5|never auto-clear/i,
		);
	});

	it("does not discard uncollided pending slots when only one duplicate-owner slot is equivalent", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1",
					employeeId: "canonical",
					rawPayload: { numOfFP: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "one" },
						{ fingerPrintId: 2, checksum: "two" },
					],
				}),
				record("target", {
					vendorUserId: "1",
					employeeId: "canonical",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "8",
					employeeId: "canonical",
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
						{ fingerPrintId: 1, checksum: "one" },
					],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "earlier-job",
				vendorUserId: "1",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 1,
				conflictingVendorUserId: "8",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1" &&
				item.targetDeviceId === "target",
		);
		// Vendor 1 vs owner 8 are both admin-sandbox: force overwrite rather than
		// permanent dual-owner RED, even when only one of two pending slots collided.
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.adminSandboxForceOverwrite).to.equal(true);
		expect(
			reconciled.credentialResolutions.some(
				(item: any) => item.writeId === write?.id,
			),
		).to.equal(false);
	});

	it("extracts progress5 peer owner from recovery write diagnostics (PROD 1751 vs 1757 shape)", () => {
		const message =
			'Target rejected or failed to retain one or more raw fingerprint templates: [{"fingerPrintId":1,"writeOk":true,"sticky":false,"progressStatus":5,"progressErrorMsg":"1757","numOfFP":0,"source":"device_fp_write_rejected_progress5:1757"},{"fingerPrintId":2,"writeOk":true,"sticky":false,"progressStatus":5,"progressErrorMsg":"1757","numOfFP":0,"source":"device_fp_write_rejected_progress5:1757"}]';
		const evidence = extractProgress5OwnerConflictsFromWriteError({
			jobId: "cms2nvakw02xykx01js2756i3",
			vendorUserId: "1751",
			sourceDeviceId: "cmpxw13hx002h7zwso7dyedrn",
			targetDeviceId: "cmripjwkw00ffl0013lfxcbxw",
			error: message,
			observedAt: "2026-07-27T03:23:35.113Z",
		});
		expect(evidence).to.have.length(2);
		expect(evidence[0]).to.include({
			vendorUserId: "1751",
			conflictingVendorUserId: "1757",
			fingerPrintId: 1,
			targetDeviceId: "cmripjwkw00ffl0013lfxcbxw",
		});
		expect(evidence[1].fingerPrintId).to.equal(2);
	});

	it("reclassifies PROD progress5 peer as device_fp_anti_dupe_peer_owner not ready", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "target"],
			records: [
				record("source", {
					vendorUserId: "1751",
					employeeId: "employee-1751",
					rawPayload: { numOfFP: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "fp-1751-1" },
						{ fingerPrintId: 2, checksum: "fp-1751-2" },
					],
				}),
				record("target", {
					vendorUserId: "1751",
					employeeId: "employee-1751",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "1757",
					employeeId: "employee-1757",
					rawPayload: { numOfFP: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 2,
							rawBlobCount: 2,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 1, checksum: "fp-1757-1" },
						{ fingerPrintId: 2, checksum: "fp-1757-2" },
					],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "recovery-job",
				vendorUserId: "1751",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 1,
				conflictingVendorUserId: "1757",
			},
			{
				jobId: "recovery-job",
				vendorUserId: "1751",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "1757",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1751" &&
				item.targetDeviceId === "target",
		);
		expect(write?.executionEligibility).to.equal("blocked");
		expect(write?.recommended).to.equal(false);
		expect(write?.blockingReason).to.equal("device_fp_anti_dupe_peer_owner");
		expect(write?.adminSandboxForceOverwrite).to.not.equal(true);
	});

	it("fleet same-byte majority unlocks PROD write when write vendor holds checksum on more devices", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["sourceA", "sourceB", "sourceC", "target"],
			records: [
				record("sourceA", {
					vendorUserId: "1815",
					employeeId: "employee-1815",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 1, checksum: "SAME-BYTE" }],
				}),
				record("sourceB", {
					vendorUserId: "1815",
					employeeId: "employee-1815",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 1, checksum: "SAME-BYTE" }],
				}),
				record("sourceC", {
					vendorUserId: "1815",
					employeeId: "employee-1815",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 1, checksum: "SAME-BYTE" }],
				}),
				record("target", {
					vendorUserId: "1815",
					employeeId: "employee-1815",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "1343",
					employeeId: "employee-1343",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 1, checksum: "SAME-BYTE" }],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "job-1",
				vendorUserId: "1815",
				sourceDeviceId: "sourceA",
				targetDeviceId: "target",
				fingerPrintId: 1,
				conflictingVendorUserId: "1343",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "1815" &&
				item.targetDeviceId === "target",
		);
		expect(write?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(write?.fleetSameByteMajorityForceOverwrite).to.equal(true);
		expect(write?.fleetSameByteMajorityConflictingOwners).to.deep.equal(["1343"]);
		expect(write?.blockingReason).to.equal(null);
	});

	it("fleet same-byte majority drops write when peer is canonical holder of same checksum", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["source", "peerA", "peerB", "target"],
			records: [
				record("source", {
					vendorUserId: "696",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 2, checksum: "FLEET-CK" }],
				}),
				record("peerA", {
					vendorUserId: "10",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 2, checksum: "FLEET-CK" }],
				}),
				record("peerB", {
					vendorUserId: "10",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 2, checksum: "FLEET-CK" }],
				}),
				record("target", {
					vendorUserId: "696",
					rawPayload: { numOfFP: 0 },
				}),
				record("target", {
					vendorUserId: "10",
					rawPayload: { numOfFP: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: { status: "not_enrolled", reportedCount: 0, rawBlobPresent: false },
					},
					_fingerprintTemplateChecksums: [{ fingerPrintId: 2, checksum: "FLEET-CK" }],
				}),
			],
		});
		const reconciled = reconcileDurableFingerprintOwnerConflicts(plan, [
			{
				jobId: "job-2",
				vendorUserId: "696",
				sourceDeviceId: "source",
				targetDeviceId: "target",
				fingerPrintId: 2,
				conflictingVendorUserId: "10",
			},
		]);
		const write = reconciled.credentialWrites.find(
			(item) =>
				item.modality === "fingerprint" &&
				item.vendorUserId === "696" &&
				item.targetDeviceId === "target",
		);
		expect(write).to.equal(undefined);
		expect(
			(reconciled.credentialResolutions as any[]).some(
				(item) =>
					item.resolution === "fleet_same_byte_peer_canonical_no_write" &&
					item.vendorUserId === "696",
			),
		).to.equal(true);
	});

	it("proves physical retention only from exact target slots and a target-wide owner scan", () => {
		const intended = record("target", {
			vendorUserId: "1",
			rawPayload: { numOfFP: 2 },
			_fingerprintTemplateChecksums: [
				{ fingerPrintId: 1, checksum: "ALPHA" },
				{ fingerPrintId: 2, checksum: "beta" },
			],
		});
		const proof = proveFingerprintPhysicalReread({
			targetDeviceId: "target",
			vendorUserId: "1",
			reviewedTemplates: [
				{ fingerPrintId: 1, checksum: "alpha" },
				{ fingerPrintId: 2, checksum: "beta" },
			],
			targetRecords: [intended],
		});
		expect(proof.physicallyRetained).to.equal(true);
		expect(proof.reason).to.equal("physically_retained");

		const collision = proveFingerprintPhysicalReread({
			targetDeviceId: "target",
			vendorUserId: "1",
			reviewedTemplates: [{ fingerPrintId: 2, checksum: "beta" }],
			targetRecords: [
				intended,
				record("target", {
					vendorUserId: "8",
					rawPayload: { numOfFP: 1 },
					_fingerprintTemplateChecksums: [
						{ fingerPrintId: 4, checksum: "beta" },
					],
				}),
			],
		});
		expect(collision.physicallyRetained).to.equal(false);
		expect(collision.reason).to.equal("different_target_owner_detected");
		expect(collision.conflictingOwners[0]?.vendorUserId).to.equal("8");
	});

	it("does not choose between different tied card values", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1, cardNo: "CARD-A" },
				}),
				record("b", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1, cardNo: "CARD-B" },
				}),
				record("c", {
					rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 0 },
				}),
			],
		});
		const write = plan.credentialWrites.find(
			(item) => item.modality === "card" && item.targetDeviceId === "c",
		);
		expect(write?.sourceDeviceId).to.equal(null);
		expect(write?.sourceCandidateDeviceIds).to.have.members(["a", "b"]);
		expect(write?.executionEligibility).to.equal("blocked");
		expect(write?.blockingReason).to.equal("source_conflict");
		expect(write?.recommendationReason).to.include("card-value equality");
	});

	it("uses the richest device record as the merge source", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", { rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1 } }),
				record("b", {
					rawPayload: { numOfFP: 3, numOfFace: 1, numOfCard: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 3,
							rawBlobCount: 3,
						},
						face: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobPresent: true,
						},
					},
				}),
			],
		});
		expect(plan.users[0].sourceDeviceId).to.equal("b");
		// Device a already has the ID. Only the evidenced missing record on c is a write.
		expect(plan.users[0].targetDeviceIds).to.deep.equal(["c"]);
	});

	it("does not use enrollment counts as portable biometric custody evidence", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", {
					displayName: null,
					rawPayload: { numOfFP: 9, numOfFace: 2 },
					biometricEvidence: {
						fingerprint: {
							status: "missing_raw_blob",
							reportedCount: 9,
							rawBlobCount: 0,
						},
						face: {
							status: "missing_raw_blob",
							reportedCount: 2,
							rawBlobPresent: false,
						},
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 1, numOfFace: 1 },
					biometricEvidence: {
						fingerprint: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobCount: 1,
						},
						face: {
							status: "raw_blob_present",
							reportedCount: 1,
							rawBlobPresent: true,
						},
					},
				}),
			],
		});

		expect(plan.users[0].sourceDeviceId).to.equal("b");
		expect(plan.users[0].targetDeviceIds).to.deep.equal(["c"]);
	});

	it("is idempotent for identical repeated reads", () => {
		const records = [record("a"), record("b")];
		const first = buildDeviceUserMergePlan({ deviceIds: ["a", "b"], records });
		const second = buildDeviceUserMergePlan({ deviceIds: ["a", "b"], records });
		expect(second).to.deep.equal(first);
	});

	it("surfaces ambiguous identity candidates without merging them", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", { employeeId: null, identityCandidates: ["employee-1", "employee-2"] }),
			],
		});
		expect(plan.counts.ambiguous).to.equal(1);
		expect(plan.users).to.have.length(0);
		expect(applyMergeChoices(plan).executable).to.equal(false);
	});

	it("does not collapse different vendor user ids just because they share an HRIS manual link", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					vendorUserId: "vendor-a",
					employeeId: "employee-1",
					manualLink: true,
				}),
				record("b", {
					vendorUserId: "vendor-b",
					employeeId: "employee-1",
					manualLink: true,
					displayName: "Changed",
				}),
			],
		});
		expect(plan.users).to.have.length(2);
		expect(plan.users.map((user) => user.vendorUserIds[0])).to.have.members([
			"vendor-a",
			"vendor-b",
		]);
		expect(plan.users.every((user) => user.employeeId === "employee-1")).to.equal(true);
	});

	it("keeps one merge identity for the same vendor user id even when one row is manually linked", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", {
					vendorUserId: "21",
					employeeId: "employee-21",
					manualLink: true,
					rawPayload: { numOfFP: 1, numOfFace: 1 },
				}),
				record("b", {
					vendorUserId: "21",
					employeeId: null,
					manualLink: false,
					rawPayload: { numOfFP: 0, numOfFace: 0 },
				}),
			],
		});

		expect(plan.users).to.have.length(1);
		expect(plan.users[0].key).to.equal("vendor:21");
		expect(plan.users[0].vendorUserIds).to.deep.equal(["21"]);
		expect(plan.counts.unionUsers).to.equal(1);
	});

	it("collapses duplicate source rows for the same device and vendor id before counting unique IDs", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					vendorUserId: "32",
					rawPayload: { numOfFP: 0, numOfFace: 0 },
				}),
				record("a", {
					vendorUserId: "32",
					rawPayload: { numOfFP: 1, numOfFace: 1 },
				}),
				record("b", {
					vendorUserId: "32",
					rawPayload: { numOfFP: 1, numOfFace: 1 },
				}),
			],
		});

		expect(plan.users).to.have.length(1);
		expect(plan.users[0].records).to.have.length(2);
		expect(plan.users[0].sourceRows).to.equal(3);
		expect(plan.users[0].duplicateSourceRows).to.have.length(1);
		expect(plan.users[0].duplicateSourceRows[0].sourceRows).to.equal(2);
		expect(plan.users[0].duplicateSourceRows[0].differingFields).to.include.members([
			"fingerprint",
			"face",
		]);
		expect(plan.counts.unionUsers).to.equal(1);
		expect((plan.counts as any).sourceRows).to.equal(3);
		expect((plan.counts as any).dedupedDeviceRecords).to.equal(2);
		expect((plan.counts as any).duplicateSourceRows).to.equal(1);
	});

	it("supports keep-existing and clear-choice semantics", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [record("a"), record("b", { displayName: "E. Ramos" })],
		});
		expect(
			applyMergeChoices(plan, {
				choices: { [plan.users[0].key]: { displayName: "KEEP" } as any },
			}).executable,
		).to.equal(true);
		expect(
			applyMergeChoices(plan, { choices: { [plan.users[0].key]: {} as any } }).executable,
		).to.equal(false);
	});

	it("applies only selected unique IDs when a merge preview is scoped", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", { vendorUserId: "0001" }),
				record("b", { vendorUserId: "0001" }),
				record("a", { vendorUserId: "0002", employeeId: "employee-2" }),
			],
		});
		const selected = plan.users.find((user) => user.vendorUserIds.includes("0002"));
		const excluded = plan.users.find((user) => user.vendorUserIds.includes("0001"));
		const applied = applyMergeChoices(plan, { selectedUserKeys: [selected!.key] });

		expect(applied.executable).to.equal(true);
		expect(applied.users.map((user) => user.key)).to.deep.equal([selected!.key]);
		expect(applied.plannedWrites.map((write) => write.userKey)).to.not.include(excluded!.key);
		expect(applied.counts.unionUsers).to.equal(1);
	});

	it("compares access, validity, card, face, and fingerprint fields", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					validFrom: "2026-01-01",
					validTo: "2026-12-31",
					doorRight: "1",
					accessPlan: [{ doorNo: 1 }],
					rawPayload: { numOfFP: 2, numOfFace: 1, numOfCard: 1 },
				}),
				record("b", {
					validFrom: "2027-01-01",
					validTo: "2027-12-31",
					doorRight: "2",
					accessPlan: [{ doorNo: 2 }],
					rawPayload: { numOfFP: 1, numOfFace: 2, numOfCard: 2 },
				}),
			],
		});
		expect(plan.users[0].conflicts.map((conflict) => conflict.field)).to.include.members([
			"validFrom",
			"validTo",
			"doorRight",
			"accessPlan",
			"face",
			"fingerprint",
			"card",
		]);
	});

	it("serializes a compact review plan without SDK biometric payloads or duplicate aliases", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", {
					rawPayload: {
						numOfFP: 2,
						numOfFace: 1,
						numOfCard: 1,
						fingerprints: ["sensitive-template"],
						faceData: "sensitive-face",
					},
				}),
			],
		});
		const review = serializeDeviceUserMergePlanForReview(plan) as any;

		expect(review).not.to.have.property("unionUsers");
		expect(review).not.to.have.property("onlyOnOneDevice");
		expect(review).not.to.have.property("missingHrisLinks");
		expect(review).to.have.property("potentialOperations");
		expect(review.users[0].rawPayload).to.equal(undefined);
		expect(review.users[0].records[0].rawPayload).to.deep.equal({
			numOfFP: 2,
			numOfFace: 1,
			numOfCard: 1,
		});
		expect(JSON.stringify(review)).not.to.include("sensitive-template");
		expect(JSON.stringify(review)).not.to.include("sensitive-face");
		expect(JSON.stringify(review)).not.to.include("sensitive-card-number");
	});
});
