import { expect } from "chai";
import {
	attachIdentityHistoryToApplicants,
	loadPersonIdentityHistory,
	personMatchesNameAndBirthday,
} from "../helper/person-identity-history.helper";

describe("personMatchesNameAndBirthday", () => {
	const dob = "1994-03-12T00:00:00.000Z";

	it("matches first name, last name, and birthday only", () => {
		expect(
			personMatchesNameAndBirthday(
				{
					firstName: "Juan",
					middleName: "Santos",
					lastName: "Dela Cruz",
					dateOfBirth: dob,
				},
				{ firstName: "juan", lastName: "dela cruz", dateOfBirth: "1994-03-12" },
			),
		).to.equal(true);
	});

	it("still matches when middle name differs", () => {
		expect(
			personMatchesNameAndBirthday(
				{
					firstName: "Juan",
					middleName: "Santos",
					lastName: "Dela Cruz",
					dateOfBirth: dob,
				},
				{ firstName: "Juan", lastName: "Dela Cruz", dateOfBirth: dob },
			),
		).to.equal(true);
	});

	it("does not match a different birthday", () => {
		expect(
			personMatchesNameAndBirthday(
				{
					firstName: "Juan",
					lastName: "Dela Cruz",
					dateOfBirth: dob,
				},
				{ firstName: "Juan", lastName: "Dela Cruz", dateOfBirth: "1995-03-12" },
			),
		).to.equal(false);
	});

	it("does not match when birthday is missing", () => {
		expect(
			personMatchesNameAndBirthday(
				{ firstName: "Juan", lastName: "Dela Cruz" },
				{ firstName: "Juan", lastName: "Dela Cruz", dateOfBirth: dob },
			),
		).to.equal(false);
	});
});

describe("loadPersonIdentityHistory", () => {
	it("returns previous rejected application and resigned employee for the same identity", async () => {
		const prisma: any = {
			applicant: {
				findMany: async () => [
					{
						id: "current-app",
						applicantId: "APP-2",
						appliedDate: new Date("2026-08-22T00:00:00.000Z"),
						currentWorkflowStateKey: "APPLIED",
						convertedToEmployeeId: null,
						job: { position: { title: "Technician" } },
						position: null,
						person: {
							personalInfo: {
								firstName: "Juan",
								lastName: "Dela Cruz",
								dateOfBirth: "1994-03-12T00:00:00.000Z",
							},
						},
					},
					{
						id: "old-app",
						applicantId: "APP-1",
						appliedDate: new Date("2024-01-10T00:00:00.000Z"),
						currentWorkflowStateKey: "REJECTED",
						convertedToEmployeeId: null,
						job: { position: { title: "Assembler" } },
						position: null,
						person: {
							personalInfo: {
								firstName: "Juan",
								lastName: "Dela Cruz",
								dateOfBirth: "1994-03-12T00:00:00.000Z",
							},
						},
					},
				],
			},
			employee: {
				findMany: async () => [
					{
						id: "emp-1",
						employeeId: "01234",
						employmentStatus: "RESIGNED",
						employmentHireDate: new Date("2020-02-01T00:00:00.000Z"),
						employmentTerminationDate: new Date("2023-11-30T00:00:00.000Z"),
						position: { title: "Operator" },
						department: { name: "Production" },
						person: {
							personalInfo: {
								firstName: "Juan",
								lastName: "Dela Cruz",
								dateOfBirth: "1994-03-12T00:00:00.000Z",
							},
						},
					},
				],
			},
		};

		const history = await loadPersonIdentityHistory(prisma, {
			organizationId: "org-1",
			firstName: "Juan",
			lastName: "Dela Cruz",
			dateOfBirth: "1994-03-12",
			excludeApplicantId: "current-app",
		});

		expect(history.matched).to.equal(true);
		expect(history.reason).to.equal("matched");
		expect(history.previousApplications).to.have.length(1);
		expect(history.previousApplications[0].id).to.equal("old-app");
		expect(history.previousApplications[0].currentWorkflowStateKey).to.equal("REJECTED");
		expect(history.employees).to.have.length(1);
		expect(history.employees[0].employmentStatus).to.equal("RESIGNED");
		expect(history.summary.previousApplicationCount).to.equal(1);
		expect(history.summary.employeeStatuses).to.deep.equal(["RESIGNED"]);
	});

	it("stamps listed applicants with history without treating the current row as previous", async () => {
		const prisma: any = {
			applicant: {
				findMany: async () => [
					{
						id: "current-app",
						applicantId: "APP-2",
						appliedDate: new Date("2026-08-22T00:00:00.000Z"),
						currentWorkflowStateKey: "APPLIED",
						convertedToEmployeeId: null,
						job: { position: { title: "Technician" } },
						position: null,
						person: {
							personalInfo: {
								firstName: "Juan",
								lastName: "Dela Cruz",
								dateOfBirth: "1994-03-12T00:00:00.000Z",
							},
						},
					},
					{
						id: "old-app",
						applicantId: "APP-1",
						appliedDate: new Date("2024-01-10T00:00:00.000Z"),
						currentWorkflowStateKey: "REJECTED",
						convertedToEmployeeId: null,
						job: { position: { title: "Assembler" } },
						position: null,
						person: {
							personalInfo: {
								firstName: "Juan",
								lastName: "Dela Cruz",
								dateOfBirth: "1994-03-12T00:00:00.000Z",
							},
						},
					},
				],
			},
			employee: {
				findMany: async () => [],
			},
		};

		const listed = [
			{
				id: "current-app",
				person: {
					personalInfo: {
						firstName: "Juan",
						lastName: "Dela Cruz",
						dateOfBirth: "1994-03-12T00:00:00.000Z",
					},
				},
			},
		];

		await attachIdentityHistoryToApplicants(prisma, "org-1", listed);
		expect(listed[0].identityHistory.matched).to.equal(true);
		expect(listed[0].identityHistory.previousApplications).to.have.length(1);
		expect(listed[0].identityHistory.previousApplications[0].id).to.equal("old-app");
	});

	it("returns no_match when name and birthday do not hit applicant or employee rows", async () => {
		const prisma: any = {
			applicant: {
				findMany: async () => [
					{
						id: "other-app",
						applicantId: "APP-9",
						appliedDate: new Date("2024-01-10T00:00:00.000Z"),
						currentWorkflowStateKey: "REJECTED",
						convertedToEmployeeId: null,
						job: { position: { title: "Assembler" } },
						position: null,
						person: {
							personalInfo: {
								firstName: "Maria",
								lastName: "Santos",
								dateOfBirth: "1990-01-01T00:00:00.000Z",
							},
						},
					},
				],
			},
			employee: {
				findMany: async () => [],
			},
		};

		const history = await loadPersonIdentityHistory(prisma, {
			organizationId: "org-1",
			firstName: "Juan",
			lastName: "Dela Cruz",
			dateOfBirth: "1994-03-12",
		});

		expect(history.matched).to.equal(false);
		expect(history.reason).to.equal("no_match");
		expect(history.previousApplications).to.have.length(0);
		expect(history.employees).to.have.length(0);
	});
});
