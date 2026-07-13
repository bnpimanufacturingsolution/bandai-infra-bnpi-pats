import { expect } from "chai";
import { applyMergeChoices, buildDeviceUserMergePlan } from "../helper/device-user-merge.helper";

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
		expect(plan.users.find((user) => user.vendorUserIds.includes("0002"))?.missingOnDeviceIds).to.deep.equal(["a"]);
	});

	it("requires an explicit choice and supports A/B all choices", () => {
		const plan = buildDeviceUserMergePlan({ deviceIds: ["a", "b"], records: [record("a"), record("b", { displayName: "E. Ramos" })] });
		expect(plan.counts.conflicts).to.be.greaterThan(0);
		expect(applyMergeChoices(plan).executable).to.equal(false);
		expect(applyMergeChoices(plan, { applyAll: "A" }).executable).to.equal(true);
		expect(applyMergeChoices(plan, { applyAll: "B" }).executable).to.equal(true);
	});

	it("does not treat biometric counts as weaker data", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [record("a", { rawPayload: { numOfFP: 2 } }), record("b", { rawPayload: { numOfFP: 1 } })],
		});
		const fingerprintConflict = plan.users[0].conflicts.find((conflict) => conflict.field === "fingerprint");
		expect(fingerprintConflict?.deviceA.value).to.equal(2);
		expect(fingerprintConflict?.deviceB.value).to.equal(1);
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
			records: [record("a", { employeeId: null, identityCandidates: ["employee-1", "employee-2"] })],
		});
		expect(plan.counts.ambiguous).to.equal(1);
		expect(plan.users).to.have.length(0);
		expect(applyMergeChoices(plan).executable).to.equal(false);
	});

	it("preserves an approved manual link ahead of automatic identity matching", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", { vendorUserId: "vendor-a", employeeId: "employee-1", manualLink: true }),
				record("b", { vendorUserId: "vendor-b", employeeId: "employee-1", manualLink: true, displayName: "Changed" }),
			],
		});
		expect(plan.users).to.have.length(1);
		expect(plan.users[0].employeeId).to.equal("employee-1");
		expect(plan.users[0].vendorUserIds).to.have.members(["vendor-a", "vendor-b"]);
	});

	it("supports keep-existing and clear-choice semantics", () => {
		const plan = buildDeviceUserMergePlan({ deviceIds: ["a", "b"], records: [record("a"), record("b", { displayName: "E. Ramos" })] });
		expect(applyMergeChoices(plan, { choices: { [plan.users[0].key]: { displayName: "KEEP" } as any } }).executable).to.equal(true);
		expect(applyMergeChoices(plan, { choices: { [plan.users[0].key]: {} as any } }).executable).to.equal(false);
	});

	it("compares access, validity, card, face, and fingerprint fields", () => {
		const plan = buildDeviceUserMergePlan({
			deviceIds: ["a", "b"],
			records: [
				record("a", { validFrom: "2026-01-01", validTo: "2026-12-31", doorRight: "1", accessPlan: [{ doorNo: 1 }], rawPayload: { numOfFP: 2, numOfFace: 1, numOfCard: 1 } }),
				record("b", { validFrom: "2027-01-01", validTo: "2027-12-31", doorRight: "2", accessPlan: [{ doorNo: 2 }], rawPayload: { numOfFP: 1, numOfFace: 2, numOfCard: 2 } }),
			],
		});
		expect(plan.users[0].conflicts.map((conflict) => conflict.field)).to.include.members(["validFrom", "validTo", "doorRight", "accessPlan", "face", "fingerprint", "card"]);
	});
});
