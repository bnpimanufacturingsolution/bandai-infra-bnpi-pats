import { expect } from "chai";
import { appendAndConditions, buildFilterConditions } from "../helper/query-builder.helper";

describe("employee organization reporting query contract", () => {
	it("filters employees without an immediate supervisor through reportToId:null", () => {
		expect(buildFilterConditions("Employee", "reportToId:null")).to.deep.equal([
			{ reportToId: null },
		]);
	});

	it("filters supervisors with direct reports through directReports:exists", () => {
		expect(buildFilterConditions("Employee", "directReports:exists")).to.deep.equal([
			{ directReports: { some: {} } },
		]);
	});

	it("combines reporting gap filters with department scope", () => {
		expect(
			buildFilterConditions("Employee", "reportToId:null,departmentId:dept-1"),
		).to.deep.equal([{ reportToId: null }, { departmentId: "dept-1" }]);
	});

	it("combines manager/direct-report counts with department scope", () => {
		expect(
			buildFilterConditions("Employee", "directReports:exists,departmentId:dept-1"),
		).to.deep.equal([{ directReports: { some: {} } }, { departmentId: "dept-1" }]);
	});

	it("filters direct employees through workforceSource:DIRECT", () => {
		expect(buildFilterConditions("Employee", "workforceSource:DIRECT")).to.deep.equal([
			{ workforceSource: "DIRECT" },
		]);
	});

	it("filters agency employees through workforce source and agency id", () => {
		expect(
			buildFilterConditions("Employee", "workforceSource:AGENCY,agencyId:agency-1"),
		).to.deep.equal([{ workforceSource: "AGENCY" }, { agencyId: "agency-1" }]);
	});

	it("keeps existing employee search terms when agency filters are appended", () => {
		const where = {
			isDeleted: false,
			AND: [
				{
					OR: [
						{ employeeId: { contains: "Juan", mode: "insensitive" } },
						{
							person: {
								is: {
									personalInfo: {
										path: ["firstName"],
										string_contains: "Juan",
										mode: "insensitive",
									},
								},
							},
						},
					],
				},
			],
		};
		const result = appendAndConditions(
			where,
			buildFilterConditions("Employee", "workforceSource:AGENCY,agencyId:agency-1"),
		);

		expect(result.AND).to.have.length(3);
		expect(result.AND[0]).to.deep.equal(where.AND[0]);
		expect(result.AND[1]).to.deep.equal({ workforceSource: "AGENCY" });
		expect(result.AND[2]).to.deep.equal({ agencyId: "agency-1" });
	});
});
