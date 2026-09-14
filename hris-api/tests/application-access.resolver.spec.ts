import { expect } from "chai";
import {
	resolveTrainingPerformanceAccess,
	type TrainingPerformanceAccessConfig,
} from "../lib/application-access/resolver";

const activeEmployee = { employmentStatus: "ACTIVE" };

describe("resolveTrainingPerformanceAccess", () => {
	it("Case 1: employee with no config gets defaults (ratee + rater, LMS employee)", () => {
		const result = resolveTrainingPerformanceAccess(activeEmployee, null);
		expect(result.eligible).to.equal(true);
		expect(result.effectiveLmsRole).to.equal("employee");
		expect(result.effectiveEpmrSubroles).to.deep.equal(["epmr_ratee", "epmr_rater"]);
		expect(result.inherited).to.equal(false);
		expect(result.lmsAccessToken).to.equal("EMPLOYEE");
	});

	it("Case 2: employee + QA grant gets ratee + rater + qa in canonical order", () => {
		const config: TrainingPerformanceAccessConfig = { epmrGrants: ["epmr_qa"] };
		const result = resolveTrainingPerformanceAccess(activeEmployee, config);
		expect(result.effectiveEpmrSubroles).to.deep.equal([
			"epmr_ratee",
			"epmr_rater",
			"epmr_qa",
		]);
	});

	it("Case 3: employee with rater removal gets only ratee", () => {
		const config: TrainingPerformanceAccessConfig = { epmrRemovals: ["epmr_rater"] };
		const result = resolveTrainingPerformanceAccess(activeEmployee, config);
		expect(result.effectiveEpmrSubroles).to.deep.equal(["epmr_ratee"]);
	});

	it("Case 4: employee + epmr_admin grant keeps LMS role employee (no role collapse)", () => {
		const config: TrainingPerformanceAccessConfig = { epmrGrants: ["epmr_admin"] };
		const result = resolveTrainingPerformanceAccess(activeEmployee, config);
		expect(result.effectiveLmsRole).to.equal("employee");
		expect(result.effectiveEpmrSubroles).to.deep.equal([
			"epmr_admin",
			"epmr_ratee",
			"epmr_rater",
		]);
	});

	it("Case 5: superadmin LMS role inherits all four subroles", () => {
		const config: TrainingPerformanceAccessConfig = { lmsRoleOverride: null };
		// Superadmin arises from LMS-side seed data; modeled here via override exemption.
		const result = resolveTrainingPerformanceAccess(activeEmployee, {
			...config,
			// Resolver treats an explicit "superadmin" override as the inheritance trigger.
			lmsRoleOverride: "superadmin",
		} as TrainingPerformanceAccessConfig);
		expect(result.effectiveLmsRole).to.equal("superadmin");
		expect(result.inherited).to.equal(true);
		expect(result.effectiveEpmrSubroles).to.deep.equal([
			"epmr_admin",
			"epmr_ratee",
			"epmr_rater",
			"epmr_qa",
		]);
		expect(result.lmsAccessToken).to.equal("ADMIN");
	});

	it("Case 6: superadmin inheritance outranks removals", () => {
		const result = resolveTrainingPerformanceAccess(activeEmployee, {
			lmsRoleOverride: "superadmin",
			epmrRemovals: ["epmr_rater"],
		} as TrainingPerformanceAccessConfig);
		expect(result.effectiveEpmrSubroles).to.deep.equal([
			"epmr_admin",
			"epmr_ratee",
			"epmr_rater",
			"epmr_qa",
		]);
	});

	it("Case 7: superadmin -> employee drops inherited subroles back to defaults", () => {
		const superadmin = resolveTrainingPerformanceAccess(activeEmployee, {
			lmsRoleOverride: "superadmin",
		} as TrainingPerformanceAccessConfig);
		expect(superadmin.inherited).to.equal(true);

		const demoted = resolveTrainingPerformanceAccess(activeEmployee, null);
		expect(demoted.effectiveLmsRole).to.equal("employee");
		expect(demoted.inherited).to.equal(false);
		expect(demoted.effectiveEpmrSubroles).to.deep.equal(["epmr_ratee", "epmr_rater"]);
	});

	it("Case 8: terminated employee is ineligible with no effective access", () => {
		const result = resolveTrainingPerformanceAccess(
			{ employmentStatus: "TERMINATED" },
			{ epmrGrants: ["epmr_qa"] },
		);
		expect(result.eligible).to.equal(false);
		expect(result.effectiveLmsRole).to.equal(null);
		expect(result.effectiveEpmrSubroles).to.deep.equal([]);
		expect(result.lmsAccessToken).to.equal(null);
	});

	it("Case 9: LMS instructor override keeps defaults", () => {
		const result = resolveTrainingPerformanceAccess(activeEmployee, {
			lmsRoleOverride: "instructor",
		});
		expect(result.effectiveLmsRole).to.equal("instructor");
		expect(result.effectiveEpmrSubroles).to.deep.equal(["epmr_ratee", "epmr_rater"]);
		expect(result.lmsAccessToken).to.equal("INSTRUCTOR");
		expect(result.lmsPersona).to.equal("instructor");
	});

	it("Case 10: blocked lifecycle statuses reuse the existing employee-action-block set", () => {
		for (const status of ["TERMINATED", "RESIGNED", "FORMER_EMPLOYEE", "RETIRED", "INACTIVE"]) {
			const result = resolveTrainingPerformanceAccess({ employmentStatus: status }, null);
			expect(result.eligible, status).to.equal(false);
		}
		for (const status of ["ACTIVE", "ONBOARDING", "ON_LEAVE", "SERVING_NOTICE", "OFFBOARDING"]) {
			const result = resolveTrainingPerformanceAccess({ employmentStatus: status }, null);
			expect(result.eligible, status).to.equal(true);
		}
	});

	it("Case 11: grants and removals are case-insensitive and trimmed", () => {
		const result = resolveTrainingPerformanceAccess(activeEmployee, {
			epmrGrants: [" EPMR_QA "],
			epmrRemovals: ["epmr_rater"],
		});
		expect(result.effectiveEpmrSubroles).to.deep.equal(["epmr_ratee", "epmr_qa"]);
	});

	it("Case 12: provenance reflects DEFAULT / EXPLICIT / INHERITED", () => {
		const defaults = resolveTrainingPerformanceAccess(activeEmployee, null);
		expect(defaults.provenance.epmrSubroles.epmr_ratee).to.equal("DEFAULT");
		const granted = resolveTrainingPerformanceAccess(activeEmployee, { epmrGrants: ["epmr_qa"] });
		expect(granted.provenance.epmrSubroles.epmr_qa).to.equal("EXPLICIT");
		const inherited = resolveTrainingPerformanceAccess(activeEmployee, {
			lmsRoleOverride: "superadmin",
		} as TrainingPerformanceAccessConfig);
		expect(inherited.provenance.epmrSubroles.epmr_admin).to.equal("INHERITED");
	});
});
