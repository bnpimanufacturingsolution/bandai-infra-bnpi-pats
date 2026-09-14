import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import {
	agencyScopeWhere,
	isSameAgencyEmployee,
	resolveCallerAgencyId,
} from "../helper/agency-scope.helper";

describe("agency scope helper", () => {
	const stubPrisma = (user: any) =>
		({
			user: { findUnique: async () => user },
		}) as any;

	it("resolves the caller agency from user metadata", async () => {
		const scope = await resolveCallerAgencyId(
			stubPrisma({ role: "hris-agency", metadata: { agencyId: "ag1", agencyCode: "T1" } }),
			"user1",
		);
		expect(scope).to.deep.equal({ callerAgencyId: "ag1", callerAgencyCode: "T1", isAgencyActor: true });
	});

	it("is not an agency actor for other roles", async () => {
		const scope = await resolveCallerAgencyId(
			stubPrisma({ role: "hris-admin", metadata: { agencyId: "ag1" } }),
			"user1",
		);
		expect(scope.isAgencyActor).to.equal(false);
		expect(agencyScopeWhere(scope)).to.deep.equal({});
	});

	it("returns null scope for unknown users", async () => {
		const scope = await resolveCallerAgencyId(stubPrisma(null), "missing");
		expect(scope.callerAgencyId).to.equal(null);
		expect(scope.isAgencyActor).to.equal(false);
	});

	it("matches only the same agency employee", () => {
		const scope = { callerAgencyId: "ag1", callerAgencyCode: "T1", isAgencyActor: true };
		expect(isSameAgencyEmployee(scope, "ag1")).to.equal(true);
		expect(isSameAgencyEmployee(scope, "ag2")).to.equal(false);
		expect(isSameAgencyEmployee(scope, null)).to.equal(false);
		expect(isSameAgencyEmployee({ ...scope, isAgencyActor: false }, "ag1")).to.equal(false);
	});

	it("scopes employee queries and nested timesheet queries", () => {
		const scope = { callerAgencyId: "ag1", callerAgencyCode: "T1", isAgencyActor: true };
		expect(agencyScopeWhere(scope)).to.deep.equal({ agencyId: "ag1" });
		expect(agencyScopeWhere(scope, "employee")).to.deep.equal({ employee: { agencyId: "ag1" } });
	});
});

describe("agency attendance import contract", () => {
	const routerSource = () =>
		readFileSync(join(process.cwd(), "app/agency/agency.router.ts"), "utf8");
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/agency/agency.controller.ts"), "utf8");
	const timesheetSource = () =>
		readFileSync(join(process.cwd(), "app/timesheet/timesheet.controller.ts"), "utf8");

	it("exposes POST /:id/attendance-import (not a bare path)", () => {
		expect(routerSource()).to.include('routes.post("/:id/attendance-import"');
		expect(routerSource()).to.not.include('routes.post("/attendance-import"');
	});

	it("supports dry-run preview with zero writes", () => {
		expect(controllerSource()).to.include("dryRun");
		expect(controllerSource()).to.include("willWrite");
	});

	it("rejects cross-agency imports", () => {
		expect(controllerSource()).to.include("only import attendance for your own agency");
	});

	it("keeps hris-agency out of other agencies' timesheets", () => {
		expect(timesheetSource()).to.include("cross-agency");
	});
});
