import { expect } from "chai";
import express from "express";
import request from "supertest";
import { controller } from "../app/employee/employee.controller";
import { router } from "../app/employee/employee.router";
import { syncPersonBeneficiaries } from "../helper/employee.helper";

describe("Employee Beneficiaries (Children) CRUD Integration & Helper Tests", () => {
	describe("syncPersonBeneficiaries helper", () => {
		it("soft-deletes children not in the provided list and upserts/creates children in the list", async () => {
			const updateManyCalls: any[] = [];
			const updateCalls: any[] = [];
			const createCalls: any[] = [];
			const findUniqueCalls: any[] = [];

			const prismaMock: any = {
				child: {
					updateMany: async (args: any) => {
						updateManyCalls.push(args);
						return { count: 1 };
					},
					update: async (args: any) => {
						updateCalls.push(args);
						return { id: args.where.id, ...args.data };
					},
					create: async (args: any) => {
						createCalls.push(args);
						return { id: "new-child-id", ...args.data };
					},
				},
				person: {
					findUnique: async (args: any) => {
						findUniqueCalls.push(args);
						return { id: args.where.id, organizationId: "org-123" };
					},
				},
			};

			const personId = "person-123";
			const beneficiaries = [
				{
					id: "child-existing",
					firstName: "ChildA",
					middleName: "MiddleA",
					lastName: "Employee",
					dateOfBirth: new Date("2015-03-20T00:00:00.000Z"),
					gender: "male",
					isDependent: true,
				},
				{
					firstName: "ChildC",
					middleName: "MiddleC",
					lastName: "Employee",
					dateOfBirth: new Date("2022-12-25T00:00:00.000Z"),
					gender: "female",
					isDependent: true,
				},
			];

			await syncPersonBeneficiaries(prismaMock, personId, beneficiaries);

			// Check soft-delete call
			expect(updateManyCalls).to.have.length(1);
			expect(updateManyCalls[0].where).to.deep.include({
				parentId: personId,
				isDeleted: false,
			});
			expect(updateManyCalls[0].where.id.notIn).to.deep.equal(["child-existing"]);
			expect(updateManyCalls[0].data).to.deep.equal({ isDeleted: true });

			// Check update call (for existing child)
			expect(updateCalls).to.have.length(1);
			expect(updateCalls[0].where).to.deep.equal({ id: "child-existing" });
			expect(updateCalls[0].data.firstName).to.equal("ChildA");
			expect(updateCalls[0].data.isDeleted).to.equal(false);

			// Check create call (for new child)
			expect(createCalls).to.have.length(1);
			expect(createCalls[0].data.firstName).to.equal("ChildC");
			expect(createCalls[0].data.parentId).to.equal(personId);
			expect(createCalls[0].data.organizationId).to.equal("org-123");
		});

		it("soft-deletes all children when beneficiaries list is empty", async () => {
			const updateManyCalls: any[] = [];
			const prismaMock: any = {
				child: {
					updateMany: async (args: any) => {
						updateManyCalls.push(args);
						return { count: 2 };
					},
				},
			};

			const personId = "person-123";
			await syncPersonBeneficiaries(prismaMock, personId, []);

			expect(updateManyCalls).to.have.length(1);
			expect(updateManyCalls[0].where).to.deep.equal({
				parentId: personId,
				isDeleted: false,
			});
			expect(updateManyCalls[0].data).to.deep.equal({ isDeleted: true });
		});
	});

	describe("Employee Controller & Router integration", () => {
		function buildApp(prismaMock: any) {
			const app = express();
			app.use(express.json());
			app.use((req, _res, next) => {
				(req as any).userId = "user-123";
				(req as any).organizationId = "org-123";
				(req as any).role = "hris-admin";
				next();
			});
			const apiRouter = express.Router();
			router(apiRouter, controller(prismaMock));
			app.use("/api", apiRouter);
			return app;
		}

		it("GET /api/employee/:id returns children (beneficiaries) correctly in default includes", async () => {
			const mockEmployee = {
				id: "emp-123",
				employeeId: "00010",
				personId: "person-123",
				person: {
					id: "person-123",
					personalInfo: {
						firstName: "Beneficiary",
						lastName: "Employee",
					},
					children: [
						{
							id: "child-1",
							firstName: "ChildA",
							lastName: "Employee",
							dateOfBirth: "2015-03-20T00:00:00.000Z",
							gender: "male",
							isDependent: true,
							isDeleted: false,
						},
					],
				},
			};

			const prismaMock: any = {
				employee: {
					findFirst: async () => mockEmployee,
				},
			};

			const app = buildApp(prismaMock);
			const response = await request(app)
				.get("/api/employee/emp-123")
				.expect(200);

			expect(response.body.status).to.equal("success");
			expect(response.body.data.person.children).to.be.an("array").with.length(1);
			expect(response.body.data.person.children[0].firstName).to.equal("ChildA");
		});

		it("PATCH /api/employee/:id validates children array and triggers sync", async () => {
			const updateManyCalls: any[] = [];
			const updateCalls: any[] = [];
			const createCalls: any[] = [];

			const prismaMock: any = {
				employee: {
					findFirst: async () => ({
						id: "emp-123",
						employeeId: "00010",
						personId: "person-123",
						organizationId: "org-123",
					}),
					update: async (args: any) => ({
						id: "emp-123",
						...args.data,
					}),
				},
				person: {
					findUnique: async () => ({ id: "person-123", organizationId: "org-123" }),
					update: async (args: any) => ({
						id: "person-123",
						...args.data,
					}),
				},
				child: {
					updateMany: async (args: any) => {
						updateManyCalls.push(args);
						return { count: 1 };
					},
					update: async (args: any) => {
						updateCalls.push(args);
						return { id: args.where.id, ...args.data };
					},
					create: async (args: any) => {
						createCalls.push(args);
						return { id: "child-new", ...args.data };
					},
				},
				employeeBenefit: {
					findMany: async () => [],
				},
				employeeLoan: {
					findMany: async () => [],
				},
			};

			const app = buildApp(prismaMock);

			// PATCH request updating details and adding/removing beneficiaries
			const response = await request(app)
				.patch("/api/employee/emp-123")
				.send({
					person: {
						personalInfo: {
							firstName: "Beneficiary",
							lastName: "Employee",
						},
						children: [
							{
								firstName: "ChildC",
								dateOfBirth: "2022-12-25",
								gender: "female",
								isDependent: true,
							},
						],
					},
				})
				.expect(200);

			expect(response.body.status).to.equal("success");
			expect(createCalls).to.have.length(1);
			expect(createCalls[0].data.firstName).to.equal("ChildC");
		});
	});
});
