import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma";
import { controller } from "../app/celebrations/celebrations.controller";

describe("Celebrations Controller", () => {
	let celebrationsController: any;
	let req: Partial<Request> & { organizationId?: string };
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	let employeeRows: any[];
	let childRows: any[];
	let employeeAggregateArgs: any;
	let childAggregateArgs: any;

	beforeEach(() => {
		employeeRows = [];
		childRows = [];
		employeeAggregateArgs = null;
		childAggregateArgs = null;

		prisma = {
			employee: {
				aggregateRaw: async (args: any) => {
					employeeAggregateArgs = args;
					return employeeRows;
				},
			},
			person: {
				aggregateRaw: async (args: any) => {
					childAggregateArgs = args;
					return childRows;
				},
			},
		};

		celebrationsController = controller(prisma as PrismaClient);

		statusCode = 200;
		sentData = undefined;
		req = {
			query: {
				month: "3",
				year: "2026",
				type: "ALL",
				search: "",
			},
			organizationId: "65f0c7f6b9f7a8d5e2c12345",
		};

		res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as Response;

		next = () => {};
	});

	it("should return NO_ORG state when organization is missing", async () => {
		req.organizationId = undefined;

		await celebrationsController.getBirthdays(req as any, res, next);

		expect(statusCode).to.equal(200);
		expect(sentData.status).to.equal("success");
		expect(sentData.data.state).to.equal("NO_ORG");
		expect(sentData.data.message).to.equal("No organization assigned.");
		expect(sentData.data.items).to.deep.equal([]);
		expect(sentData.data.groups).to.deep.equal([]);
	});

	it("should return normalized celebrants grouped and sorted by day then name", async () => {
		employeeRows = [
			{
				personId: { $oid: "person_emp_2" },
				employeeId: { $oid: "employee_2" },
				firstName: "Ana",
				middleName: "",
				lastName: "Zulu",
				month: 3,
				day: 15,
				department: "Sales",
			},
			{
				personId: { $oid: "person_emp_1" },
				employeeId: { $oid: "employee_1" },
				firstName: "Bob",
				middleName: "Cruz",
				lastName: "Alpha",
				month: 3,
				day: 12,
				department: "Engineering",
			},
		];

		childRows = [
			{
				parentPersonId: { $oid: "person_emp_2" },
				parentEmployeeId: { $oid: "employee_2" },
				childIndex: 0,
				childFirstName: "Noah",
				childLastName: null,
				parentFirstName: "Ana",
				parentMiddleName: null,
				parentLastName: "Zulu",
				month: 3,
				day: 11,
				department: "Sales",
			},
			{
				parentPersonId: { $oid: "person_emp_1" },
				parentEmployeeId: { $oid: "employee_1" },
				childIndex: 1,
				childFirstName: "Liam",
				childLastName: "alpha",
				parentFirstName: "Bob",
				parentMiddleName: "Cruz",
				parentLastName: "Alpha",
				month: 3,
				day: 12,
				department: "Engineering",
			},
		];

		await celebrationsController.getBirthdays(req as any, res, next);

		expect(statusCode).to.equal(200);
		expect(sentData.data.state).to.equal("OK");
		expect(sentData.data.counts).to.deep.equal({ employees: 2, kids: 2, total: 4 });
		expect(sentData.data.items).to.have.length(4);
		expect(sentData.data.items[0].day).to.equal(11);
		expect(sentData.data.items[0].displayName).to.equal("Noah");
		expect(sentData.data.items[1].day).to.equal(12);
		expect(sentData.data.items[1].displayName).to.equal("Bob Cruz Alpha");
		expect(sentData.data.items[2].day).to.equal(12);
		expect(sentData.data.items[2].displayName).to.equal("Liam A.");
		expect(sentData.data.items[3].day).to.equal(15);
		expect(sentData.data.items[3].displayName).to.equal("Ana Zulu");
		expect(sentData.data.items[0]).to.not.have.property("dateOfBirth");
		expect(sentData.data.groups.map((group: any) => group.day)).to.deep.equal([11, 12, 15]);
	});

	it("should filter by type and search", async () => {
		employeeRows = [
			{
				personId: { $oid: "person_emp_1" },
				employeeId: { $oid: "employee_1" },
				firstName: "Bob",
				lastName: "Alpha",
				month: 3,
				day: 12,
				department: "Engineering",
			},
		];

		childRows = [
			{
				parentPersonId: { $oid: "person_emp_1" },
				parentEmployeeId: { $oid: "employee_1" },
				childIndex: 1,
				childFirstName: "Liam",
				childLastName: "alpha",
				parentFirstName: "Bob",
				parentLastName: "Alpha",
				month: 3,
				day: 12,
				department: "Engineering",
			},
		];

		req.query = {
			month: "3",
			year: "2026",
			type: "KIDS",
			search: "bob",
		};

		await celebrationsController.getBirthdays(req as any, res, next);

		expect(statusCode).to.equal(200);
		expect(sentData.data.items).to.have.length(1);
		expect(sentData.data.items[0].type).to.equal("CHILD_BIRTHDAY");
		expect(sentData.data.items[0].parentDisplayName).to.contain("Bob");
		expect(sentData.data.counts).to.deep.equal({ employees: 0, kids: 1, total: 1 });
	});

	it("should validate required query params", async () => {
		req.query = {
			month: "14",
			year: "2026",
		};

		await celebrationsController.getBirthdays(req as any, res, next);

		expect(statusCode).to.equal(400);
		expect(sentData.status).to.equal("error");
	});

	it("should build aggregate pipelines with org and month constraints", async () => {
		await celebrationsController.getBirthdays(req as any, res, next);

		expect(statusCode).to.equal(200);
		expect(employeeAggregateArgs).to.have.property("pipeline");
		expect(childAggregateArgs).to.have.property("pipeline");
		expect(JSON.stringify(employeeAggregateArgs.pipeline)).to.contain(
			"person.personalInfo.dateOfBirth",
		);
		expect(JSON.stringify(childAggregateArgs.pipeline)).to.contain("children.dateOfBirth");
		expect(JSON.stringify(employeeAggregateArgs.pipeline)).to.contain(
			"65f0c7f6b9f7a8d5e2c12345",
		);
		expect(JSON.stringify(childAggregateArgs.pipeline)).to.contain(
			"65f0c7f6b9f7a8d5e2c12345",
		);
	});
});
