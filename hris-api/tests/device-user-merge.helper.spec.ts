import { expect } from "chai";
import {
	applyMergeChoices,
	buildDeviceUserMergePlan,
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
				{ id: "c", name: "E", readStatus: "failed", readError: "Unauthorized", idsRead: null },
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
						fingerprint: { status: "raw_blob_present", reportedCount: 2, rawBlobCount: 2 },
						face: { status: "raw_blob_present", reportedCount: 1, rawBlobPresent: true },
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
		const fingerprint = plan.credentialWrites.find(
			(write) => write.modality === "fingerprint",
		);
		const face = plan.credentialWrites.find((write) => write.modality === "face");
		expect(fingerprint?.executionEligibility).to.equal("ready_from_raw_blob");
		expect(fingerprint?.recommended).to.equal(true);
		expect(face?.executionEligibility).to.equal("blocked");
		expect(face?.blockingReason).to.equal("target_write_unsupported");
		expect(face?.recommended).to.equal(false);
		expect(plan.counts.actionableCredentialWrites).to.equal(1);
		expect(plan.counts.blockedCredentialWrites).to.equal(1);
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
	});

	it("uses the richest device record as the merge source", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b", "c"],
			records: [
				record("a", { rawPayload: { numOfFP: 0, numOfFace: 0, numOfCard: 1 } }),
				record("b", {
					rawPayload: { numOfFP: 3, numOfFace: 1, numOfCard: 1 },
					biometricEvidence: {
						fingerprint: { status: "raw_blob_present", reportedCount: 3, rawBlobCount: 3 },
						face: { status: "raw_blob_present", reportedCount: 1, rawBlobPresent: true },
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
						fingerprint: { status: "missing_raw_blob", reportedCount: 9, rawBlobCount: 0 },
						face: { status: "missing_raw_blob", reportedCount: 2, rawBlobPresent: false },
					},
				}),
				record("b", {
					rawPayload: { numOfFP: 1, numOfFace: 1 },
					biometricEvidence: {
						fingerprint: { status: "raw_blob_present", reportedCount: 1, rawBlobCount: 1 },
						face: { status: "raw_blob_present", reportedCount: 1, rawBlobPresent: true },
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
		expect(applied.plannedWrites.map((write) => write.userKey)).to.not.include(
			excluded!.key,
		);
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
		expect(review.users[0].rawPayload).to.equal(undefined);
		expect(review.users[0].records[0].rawPayload).to.deep.equal({
			numOfFP: 2,
			numOfFace: 1,
			numOfCard: 1,
		});
		expect(JSON.stringify(review)).not.to.include("sensitive-template");
		expect(JSON.stringify(review)).not.to.include("sensitive-face");
	});
});
