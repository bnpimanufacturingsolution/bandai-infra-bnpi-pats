import { expect } from "chai";
import { buildFindManyQuery, getNestedFields } from "../helper/query-builder.helper";
import { groupDataByField } from "../helper/dataGrouping";

describe("applicant grouped job field selection (regression: ambiguous `job` relation)", () => {
	// Root cause pin: `job` is a relation name on both Applicant (-> Job) and
	// CredentialRecoveryTask (-> CredentialRecoveryJob), so the model-free
	// ambiguity registry drops every `job.*` select and groupBy=job collapses
	// all candidates into "unassigned". The fix passes the model name.

	it("drops job.* selection when no model name is provided (documents the hazard)", () => {
		const selection = getNestedFields("id,job.id,job.position.title");

		expect(selection).to.not.have.property("job");
	});

	it("keeps job.* selection when the Applicant model name is provided", () => {
		const selection = getNestedFields("id,job.id,job.position.title", {}, "Applicant");

		expect(selection).to.have.nested.property("job.select.id", true);
		expect(selection).to.have.nested.property("job.select.position.select.title", true);
	});

	it("keeps scalar JSON and other relations unchanged with the model name", () => {
		const selection = getNestedFields(
			"id,person,person.personalInfo.firstName,convertedToEmployee.employeeId",
			{},
			"Applicant",
		);

		expect(selection).to.have.property("person");
		expect(selection).to.have.nested.property("convertedToEmployee.select.employeeId", true);
	});

	it("buildFindManyQuery with Applicant model produces a select the job.id grouper can key", () => {
		const query = buildFindManyQuery(
			{ isDeleted: false, organizationId: "org-1" },
			0,
			10,
			"asc",
			undefined,
			"id,job.id",
			undefined,
			undefined,
			"job.id",
			undefined,
			"Applicant",
		);

		expect(query).to.have.nested.property("select.job.select.id", true);
	});

	it("groupDataByField keys by job id when the projection retained job", () => {
		const rows = [
			{ id: "a1", job: { id: "job-1" } },
			{ id: "a2", job: { id: "job-1" } },
			{ id: "a3", job: { id: "job-2" } },
		];
		const grouped = groupDataByField(rows, "job.id");

		expect(Object.keys(grouped).sort()).to.deep.equal(["job-1", "job-2"]);
		expect(grouped["job-1"]).to.have.length(2);
	});

	it("groupDataByField falls back to unassigned only for jobless applicants", () => {
		const grouped = groupDataByField(
			[
				{ id: "a1", job: { id: "job-1" } },
				{ id: "a2" },
			],
			"job.id",
		);

		expect(Object.keys(grouped).sort()).to.deep.equal(["job-1", "unassigned"]);
	});
});
