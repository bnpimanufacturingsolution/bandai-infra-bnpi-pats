import { describe, expect, it } from "vitest";
import {
	buildAccessUpdatePayload,
	selectionFromExplicit,
	lmsRoleLabel,
	epmrSubroleLabel,
	provisioningLabel,
	provenanceCaption,
} from "./application-access-ui";

const DEFAULTS = ["epmr_ratee", "epmr_rater"];
const EXPLICIT_ONLY = ["epmr_admin", "epmr_qa"];

describe("buildAccessUpdatePayload", () => {
	it("defaults selection (ratee + rater) produces an empty delta", () => {
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: null, epmrSubroles: ["epmr_ratee", "epmr_rater"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload).toEqual({
			lmsRoleOverride: null,
			epmrGrants: [],
			epmrRemovals: [],
		});
	});

	it("adding QA grants only epmr_qa", () => {
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: null, epmrSubroles: ["epmr_ratee", "epmr_rater", "epmr_qa"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload.epmrGrants).toEqual(["epmr_qa"]);
		expect(payload.epmrRemovals).toEqual([]);
	});

	it("removing Rater translates to epmrRemovals", () => {
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: "employee", epmrSubroles: ["epmr_ratee"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload).toEqual({
			lmsRoleOverride: "employee",
			epmrGrants: [],
			epmrRemovals: ["epmr_rater"],
		});
	});

	it("combined QA grant + Rater removal (Phase 3 spec example)", () => {
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: "instructor", epmrSubroles: ["epmr_ratee", "epmr_qa"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload).toEqual({
			lmsRoleOverride: "instructor",
			epmrGrants: ["epmr_qa"],
			epmrRemovals: ["epmr_rater"],
		});
	});

	it("never grants policy defaults explicitly", () => {
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: null, epmrSubroles: ["epmr_ratee", "epmr_rater", "epmr_admin"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload.epmrGrants).toEqual(["epmr_admin"]);
		expect(payload.epmrRemovals).toEqual([]);
	});

	it("Test 8: removing a granted EPMR Admin restores defaults without touching them", () => {
		// Current state: defaults + epmr_admin (granted). Admin deselects Admin.
		const payload = buildAccessUpdatePayload(
			{ lmsRoleOverride: null, epmrSubroles: ["epmr_ratee", "epmr_rater"] },
			EXPLICIT_ONLY,
			DEFAULTS,
		);
		expect(payload).toEqual({
			lmsRoleOverride: null,
			epmrGrants: [],
			epmrRemovals: [],
		});
		// Resolver over this payload yields exactly the defaults (ratee + rater) —
		// no accidental removal of default roles.
	});
});

describe("selectionFromExplicit", () => {
	it("returns defaults when there is no explicit config", () => {
		expect(selectionFromExplicit(null, DEFAULTS)).toEqual(DEFAULTS);
	});

	it("applies removals and grants on top of defaults", () => {
		expect(
			selectionFromExplicit(
				{ lmsRoleOverride: null, epmrGrants: ["epmr_qa"], epmrRemovals: ["epmr_rater"] },
				DEFAULTS,
			),
		).toEqual(["epmr_ratee", "epmr_qa"]);
	});

	it("applies admin grants from backfilled config", () => {
		expect(
			selectionFromExplicit(
				{ lmsRoleOverride: "admin", epmrGrants: ["epmr_admin"], epmrRemovals: [] },
				DEFAULTS,
			),
		).toEqual(["epmr_ratee", "epmr_rater", "epmr_admin"]);
	});
});

describe("display labels", () => {
	it("maps LMS roles and subroles to human labels", () => {
		expect(lmsRoleLabel("employee")).toBe("Employee");
		expect(lmsRoleLabel("instructor")).toBe("Instructor");
		expect(lmsRoleLabel("admin")).toBe("Admin");
		expect(lmsRoleLabel("superadmin")).toBe("Superadmin");
		expect(lmsRoleLabel(null)).toBe("—");
		expect(epmrSubroleLabel("epmr_ratee")).toBe("Ratee");
		expect(epmrSubroleLabel("epmr_rater")).toBe("Rater");
		expect(epmrSubroleLabel("epmr_admin")).toBe("Admin");
		expect(epmrSubroleLabel("epmr_qa")).toBe("QA");
		expect(provisioningLabel("SYNCED")).toBe("Synced");
		expect(provisioningLabel("PENDING")).toBe("Pending");
	});

	it("derives provenance captions", () => {
		expect(provenanceCaption({ eligible: false, inherited: false, hasExplicitConfig: false })).toBe("No access");
		expect(provenanceCaption({ eligible: true, inherited: true, hasExplicitConfig: false })).toBe("System controlled");
		expect(provenanceCaption({ eligible: true, inherited: false, hasExplicitConfig: true })).toBe("Configured");
		expect(provenanceCaption({ eligible: true, inherited: false, hasExplicitConfig: false })).toBe("Default access");
	});
});
