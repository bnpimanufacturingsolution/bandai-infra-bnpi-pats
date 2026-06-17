import { controller } from "../app/requestStepExecution/requestStepExecution.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("RequestStepExecution Controller", () => {
	let requestStepExecutionController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockRequestStepExecution = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration RequestStepExecution",
		description: "RequestStepExecution for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockRequestStepExecutions = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration RequestStepExecution",
			description: "RequestStepExecution for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification RequestStepExecution",
			description: "RequestStepExecution for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing RequestStepExecution",
			description: "RequestStepExecution for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic RequestStepExecution",
			description: "RequestStepExecution without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	beforeEach(() => {
		prisma = {
			requestStepExecution: {
				findMany: async (_params: Prisma.RequestStepExecutionFindManyArgs) => {
					// Return multiple requestStepExecutions for grouping tests
					if (req.query?.groupBy) {
						return mockRequestStepExecutions;
					}
					return [mockRequestStepExecution];
				},
				count: async (_params: Prisma.RequestStepExecutionCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockRequestStepExecutions.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.RequestStepExecutionFindFirstArgs) =>
					params.where?.id === mockRequestStepExecution.id ? mockRequestStepExecution : null,
				findUnique: async (params: Prisma.RequestStepExecutionFindUniqueArgs) =>
					params.where?.id === mockRequestStepExecution.id ? mockRequestStepExecution : null,
				create: async (params: Prisma.RequestStepExecutionCreateArgs) => ({
					...mockRequestStepExecution,
					...params.data,
				}),
				update: async (params: Prisma.RequestStepExecutionUpdateArgs) => ({
					...mockRequestStepExecution,
					...params.data,
				}),
				delete: async (params: Prisma.RequestStepExecutionDeleteArgs) => ({
					...mockRequestStepExecution,
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

		requestStepExecutionController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/requestStepExecution",
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
		it("should return paginated requestStepExecutions", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
		});

		it("should group requestStepExecutions by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await requestStepExecutionController.getAll(req as Request, res, next);
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

		it("should group requestStepExecutions by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "name" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "name");
			expect(sentData.data.grouped).to.have.property("User Registration RequestStepExecution");
			expect(sentData.data.grouped).to.have.property("SMS Notification RequestStepExecution");
		});

		it("should handle requestStepExecutions with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.grouped).to.have.property("unassigned");
			expect(sentData.data.grouped.unassigned).to.be.an("array");
			expect(sentData.data.grouped.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
			expect(sentData.data).to.not.have.property("grouped");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.be.an("array");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { groupBy: "type", page: "1", limit: "10", sort: "name" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("grouped");
			expect(sentData.data).to.have.property("groupBy", "type");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "invalid" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw an error
			prisma.requestStepExecution.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "10" };

			// Mock Prisma to throw a non-Prisma error
			prisma.requestStepExecution.findMany = async () => {
				throw new Error("Internal server error");
			};

			await requestStepExecutionController.getAll(req as Request, res, next);
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
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "2", limit: "5", sort: "name", order: "asc" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { fields: "name,type" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { documents: "true" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { count: "true" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { pagination: "true" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});

	describe(".getById()", () => {
		it("should return a requestStepExecution", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };
			await requestStepExecutionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockRequestStepExecution.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await requestStepExecutionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent requestStepExecution", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await requestStepExecutionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };

			// Mock Prisma to throw an error
			prisma.requestStepExecution.findUnique = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await requestStepExecutionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.requestStepExecution.findUnique = async () => {
				throw new Error("Internal server error");
			};

			await requestStepExecutionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new requestStepExecution", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Contact Form RequestStepExecution",
				description: "RequestStepExecution for contact forms with validation",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new requestStepExecution with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Email RequestStepExecution",
				description: "RequestStepExecution for email notifications",
				type: "email",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "email");
		});

		it("should create a new requestStepExecution without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Generic RequestStepExecution",
				description: "RequestStepExecution without type",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Form RequestStepExecution",
				description: "RequestStepExecution from form data",
				type: "form",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "URL RequestStepExecution",
				description: "RequestStepExecution from URL encoded data",
			};
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "",
				description: "RequestStepExecution with empty name",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test RequestStepExecution",
				description: "RequestStepExecution that will cause Prisma error",
			};
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.requestStepExecution.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Test RequestStepExecution",
				description: "RequestStepExecution that will cause internal error",
			};
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.requestStepExecution.create = async () => {
				throw new Error("Internal server error");
			};

			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update requestStepExecution details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Enhanced Contact Form RequestStepExecution",
				description: "Updated requestStepExecution with additional validation and styling options",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update requestStepExecution type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "sms",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should update multiple requestStepExecution fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Email RequestStepExecution",
				description: "Updated description",
				type: "email",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Form Updated RequestStepExecution",
				description: "Updated from form data",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "URL Updated RequestStepExecution",
				description: "Updated from URL encoded data",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated RequestStepExecution",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "",
				description: "RequestStepExecution with empty name",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent requestStepExecution update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated RequestStepExecution",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test RequestStepExecution",
				description: "RequestStepExecution that will cause Prisma error",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.requestStepExecution.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test RequestStepExecution",
				description: "RequestStepExecution that will cause internal error",
			};
			req.params = { id: mockRequestStepExecution.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.requestStepExecution.update = async () => {
				throw new Error("Internal server error");
			};

			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a requestStepExecution", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };
			await requestStepExecutionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await requestStepExecutionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent requestStepExecution deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await requestStepExecutionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", "NOT_FOUND");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };

			// Mock Prisma to throw an error
			prisma.requestStepExecution.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await requestStepExecutionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.requestStepExecution.delete = async () => {
				throw new Error("Internal server error");
			};

			await requestStepExecutionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long requestStepExecution name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "A".repeat(1000), // Very long name
				description: "RequestStepExecution with very long name",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in requestStepExecution data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "RequestStepExecution with special chars: !@#$%^&*()",
				description: "Description with émojis 🚀 and unicode",
				type: "special-type",
			};
			req.body = createData;
			await requestStepExecutionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = {
				name: "Concurrent RequestStepExecution",
				description: "RequestStepExecution created concurrently",
			};
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => requestStepExecutionController.create(req as Request, res, next));

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
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "999999", limit: "10" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "999999" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "-1", limit: "10" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "1", limit: "-10" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "", limit: "", sort: "", order: "" };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = { page: "   ", limit: "   ", sort: "   " };
			await requestStepExecutionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };
			req.body = {}; // Empty body
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockRequestStepExecution.id };
			req.body = { name: "Only name updated" }; // Only name, no description or type
			await requestStepExecutionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "RequestStepExecution 1", type: "email", category: "marketing" },
		{ id: 2, name: "RequestStepExecution 2", type: "sms", category: "notification" },
		{ id: 3, name: "RequestStepExecution 3", type: "email", category: "marketing" },
		{ id: 4, name: "RequestStepExecution 4", type: null, category: "general" },
		{ id: 5, name: "RequestStepExecution 5", type: "push", category: "notification" },
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
				{ id: 1, name: "RequestStepExecution 1", type: "email" },
				{ id: 2, name: "RequestStepExecution 2" }, // missing type field
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
			expect(result).to.have.property("RequestStepExecution 1");
			expect(result).to.have.property("RequestStepExecution 2");
			expect(result).to.have.property("RequestStepExecution 3");
			expect(result).to.have.property("RequestStepExecution 4");
			expect(result).to.have.property("RequestStepExecution 5");
			expect(result["RequestStepExecution 1"]).to.have.length(1);
		});
	});
});
