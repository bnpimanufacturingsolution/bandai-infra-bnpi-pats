import { controller } from "../app/employeeLoan/employeeLoan.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("EmployeeLoan Controller", () => {
	let employeeLoanController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockEmployeeLoan = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration EmployeeLoan",
		description: "EmployeeLoan for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockEmployeeLoans = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration EmployeeLoan",
			description: "EmployeeLoan for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification EmployeeLoan",
			description: "EmployeeLoan for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing EmployeeLoan",
			description: "EmployeeLoan for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic EmployeeLoan",
			description: "EmployeeLoan without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			employeeLoan: {
				findMany: async (_params: Prisma.EmployeeLoanFindManyArgs) => {
					// Return multiple employeeLoans for grouping tests
					if (req.query?.groupBy) {
						return mockEmployeeLoans;
					}
					return [mockEmployeeLoan];
				},
				count: async (_params: Prisma.EmployeeLoanCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockEmployeeLoans.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.EmployeeLoanFindFirstArgs) =>
					params.where?.id === mockEmployeeLoan.id ? mockEmployeeLoan : null,
				findUnique: async (params: Prisma.EmployeeLoanFindUniqueArgs) =>
					params.where?.id === mockEmployeeLoan.id ? mockEmployeeLoan : null,
				create: async (params: Prisma.EmployeeLoanCreateArgs) => ({
					...mockEmployeeLoan,
					...params.data,
				}),
				update: async (params: Prisma.EmployeeLoanUpdateArgs) => ({
					...mockEmployeeLoan,
					...params.data,
				}),
				delete: async (params: Prisma.EmployeeLoanDeleteArgs) => ({
					...mockEmployeeLoan,
					id: params.where.id,
				}),
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		employeeLoanController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/employeeLoan",
		} as Request;
		res = {
			send: (data: any) => {
				sentData = data;
				return res;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
			end: () => res,
		} as Response;
		next = () => {};
	});

	describe(".getAll()", () => {
		it("should return paginated employeeLoans", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group employeeLoans by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
			expect(sentData.data).to.have.property("totalGroups");
			expect(sentData.data).to.have.property("totalItems");
			expect(sentData.data.grouped).to.have.property("email");
			expect(sentData.data.grouped).to.have.property("sms");
			expect(sentData.data.grouped).to.have.property("unassigned");
		});

		it("should group employeeLoans by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "name");
			expect(sentData.data.grouped).to.have.property("User Registration EmployeeLoan");
			expect(sentData.data.grouped).to.have.property("SMS Notification EmployeeLoan");
		});

		it("should handle employeeLoans with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.grouped).to.have.property("unassigned");
			expect(sentData.data.grouped.unassigned).to.be.an("array");
			expect(sentData.data.grouped.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw an error
			prisma.employeeLoan.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw a non-Prisma error
			prisma.employeeLoan.findMany = async () => {
				throw new Error("Internal server error");
			};

			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle advanced filtering", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				query: "email",
				filter: JSON.stringify([{ field: "type", operator: "equals", value: "email" }]),
			};
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { documents: "true" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a employeeLoan", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };
			await employeeLoanController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockEmployeeLoan.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await employeeLoanController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent employeeLoan", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await employeeLoanController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };

			// Mock Prisma to throw an error
			prisma.employeeLoan.findUnique = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await employeeLoanController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.employeeLoan.findUnique = async () => {
				throw new Error("Internal server error");
			};

			await employeeLoanController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new employeeLoan", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Contact Form EmployeeLoan",
				description: "EmployeeLoan for contact forms with validation",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new employeeLoan with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Email EmployeeLoan",
				description: "EmployeeLoan for email notifications",
				type: "email",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "email");
		});

		it("should create a new employeeLoan without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Generic EmployeeLoan",
				description: "EmployeeLoan without type",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Form EmployeeLoan",
				description: "EmployeeLoan from form data",
				type: "form",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "URL EmployeeLoan",
				description: "EmployeeLoan from URL encoded data",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "",
				description: "EmployeeLoan with empty name",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test EmployeeLoan",
				description: "EmployeeLoan that will cause Prisma error",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.employeeLoan.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test EmployeeLoan",
				description: "EmployeeLoan that will cause internal error",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.employeeLoan.create = async () => {
				throw new Error("Internal server error");
			};

			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update employeeLoan details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Enhanced Contact Form EmployeeLoan",
				description: "Updated employeeLoan with additional validation and styling options",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update employeeLoan type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "sms",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update multiple employeeLoan fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Email EmployeeLoan",
				description: "Updated description",
				type: "email",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Form Updated EmployeeLoan",
				description: "Updated from form data",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "URL Updated EmployeeLoan",
				description: "Updated from URL encoded data",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated EmployeeLoan",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "",
				description: "EmployeeLoan with empty name",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent employeeLoan update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated EmployeeLoan",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test EmployeeLoan",
				description: "EmployeeLoan that will cause Prisma error",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.employeeLoan.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test EmployeeLoan",
				description: "EmployeeLoan that will cause internal error",
			};
			req.params = { id: mockEmployeeLoan.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.employeeLoan.update = async () => {
				throw new Error("Internal server error");
			};

			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a employeeLoan", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };
			await employeeLoanController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await employeeLoanController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent employeeLoan deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await employeeLoanController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };

			// Mock Prisma to throw an error
			prisma.employeeLoan.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await employeeLoanController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.employeeLoan.delete = async () => {
				throw new Error("Internal server error");
			};

			await employeeLoanController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long employeeLoan name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "A".repeat(1000), // Very long name
				description: "EmployeeLoan with very long name",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in employeeLoan data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "EmployeeLoan with special chars: !@#$%^&*()",
				description: "Description with émojis 🚀 and unicode",
				type: "special-type",
			};
			req.body = createData;
			await employeeLoanController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Concurrent EmployeeLoan",
				description: "EmployeeLoan created concurrently",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => employeeLoanController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = {
				page: "1",
				limit: "10",
				filter: "invalid-json",
			};
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await employeeLoanController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };
			req.body = {}; // Empty body
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockEmployeeLoan.id };
			req.body = { name: "Only name updated" }; // Only name, no description or type
			await employeeLoanController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "EmployeeLoan 1", type: "email", category: "marketing" },
		{ id: 2, name: "EmployeeLoan 2", type: "sms", category: "notification" },
		{ id: 3, name: "EmployeeLoan 3", type: "email", category: "marketing" },
		{ id: 4, name: "EmployeeLoan 4", type: null, category: "general" },
		{ id: 5, name: "EmployeeLoan 5", type: "push", category: "notification" },
	];

	describe("groupDataByField()", () => {
		it("should group data by type field", () => {
			const result = groupDataByField(testData, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("sms");
			expect(result).to.have.property("push");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(2);
			expect(result.sms).to.have.length(1);
			expect(result.push).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should group data by category field", () => {
			const result = groupDataByField(testData, "category");
			expect(result).to.have.property("marketing");
			expect(result).to.have.property("notification");
			expect(result).to.have.property("general");
			expect(result.marketing).to.have.length(2);
			expect(result.notification).to.have.length(2);
			expect(result.general).to.have.length(1);
		});

		it("should handle null values by placing them in unassigned group", () => {
			const result = groupDataByField(testData, "type");
			expect(result.unassigned).to.have.length(1);
			expect(result.unassigned[0]).to.deep.include({ id: 4, type: null });
		});

		it("should handle undefined values by placing them in unassigned group", () => {
			const dataWithUndefined = [
				{ id: 1, name: "EmployeeLoan 1", type: "email" },
				{ id: 2, name: "EmployeeLoan 2" }, // missing type field
			];
			const result = groupDataByField(dataWithUndefined, "type");
			expect(result).to.have.property("email");
			expect(result).to.have.property("unassigned");
			expect(result.email).to.have.length(1);
			expect(result.unassigned).to.have.length(1);
		});

		it("should return empty object for empty array", () => {
			const result = groupDataByField([], "type");
			expect(result).to.be.an("object");
			expect(Object.keys(result)).to.have.length(0);
		});

		it("should group by string values correctly", () => {
			const result = groupDataByField(testData, "name");
			expect(result).to.have.property("EmployeeLoan 1");
			expect(result).to.have.property("EmployeeLoan 2");
			expect(result).to.have.property("EmployeeLoan 3");
			expect(result).to.have.property("EmployeeLoan 4");
			expect(result).to.have.property("EmployeeLoan 5");
			expect(result["EmployeeLoan 1"]).to.have.length(1);
		});
	});
});
