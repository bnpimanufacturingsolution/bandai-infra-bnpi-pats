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
});
