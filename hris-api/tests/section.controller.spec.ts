import { controller } from "../app/section/section.controller";
import { groupDataByField } from "../helper/dataGrouping";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

describe("Section Controller", () => {
	let sectionController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	const mockSection = {
		id: "507f1f77bcf86cd799439026",
		name: "User Registration Section",
		description: "Section for user registration forms",
		type: "email",
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockSections = [
		{
			id: "507f1f77bcf86cd799439026",
			name: "User Registration Section",
			description: "Section for user registration forms",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439027",
			name: "SMS Notification Section",
			description: "Section for SMS notifications",
			type: "sms",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439028",
			name: "Email Marketing Section",
			description: "Section for email marketing campaigns",
			type: "email",
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "507f1f77bcf86cd799439029",
			name: "Generic Section",
			description: "Section without type",
			type: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	const mockOrganizationId = "507f1f77bcf86cd799439030";
	const mockDepartmentId = "507f1f77bcf86cd799439031";
	const buildListQuery = (query: Record<string, string> = {}) => ({
		document: "true",
		count: "true",
		...query,
	});
	const buildPaginationQuery = (query: Record<string, string> = {}) => ({
		document: "true",
		count: "true",
		pagination: "true",
		...query,
	});
	const buildCreateSectionData = (overrides: Record<string, any> = {}) => ({
		code: "SEC-001",
		departmentId: mockDepartmentId,
		isActive: true,
		...overrides,
	});

	beforeEach(() => {
		prisma = {
			section: {
				findMany: async (_params: Prisma.SectionFindManyArgs) => {
					// Return multiple sections for grouping tests
					if (req.query?.groupBy) {
						return mockSections;
					}
					return [mockSection];
				},
				count: async (_params: Prisma.SectionCountArgs) => {
					// Return count based on whether grouping is requested
					if (req.query?.groupBy) {
						return mockSections.length;
					}
					return 1;
				},
				findFirst: async (params: Prisma.SectionFindFirstArgs) =>
					params.where?.id === mockSection.id ? mockSection : null,
				findUnique: async (params: Prisma.SectionFindUniqueArgs) =>
					params.where?.id === mockSection.id ? mockSection : null,
				create: async (params: Prisma.SectionCreateArgs) => ({
					...mockSection,
					...params.data,
				}),
				update: async (params: Prisma.SectionUpdateArgs) => ({
					...mockSection,
					...params.data,
				}),
				delete: async (params: Prisma.SectionDeleteArgs) => ({
					...mockSection,
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

		sectionController = controller(prisma as PrismaClient);
		sentData = undefined;
		statusCode = 200;
		req = {
			query: {},
			params: {},
			body: {},
			organizationId: mockOrganizationId,
			get: (header: string) => {
				if (header === "Content-Type") {
					return "application/json";
				}
				return undefined;
			},
			originalUrl: "/api/section",
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
		it("should return paginated sections", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildPaginationQuery({ page: "1", limit: "10" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sections).to.be.an("array");
			expect(sentData.data).to.have.property("count", 1);
			expect(sentData.data).to.have.property("pagination");
		});

		it("should group sections by type field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ groupBy: "type" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.sections).to.have.property("email");
			expect(sentData.data.sections).to.have.property("sms");
			expect(sentData.data.sections).to.have.property("unassigned");
			expect(sentData.data.count).to.equal(mockSections.length);
		});

		it("should group sections by name field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ groupBy: "name" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("groupedBy", "name");
			expect(sentData.data.sections).to.have.property("User Registration Section");
			expect(sentData.data.sections).to.have.property("SMS Notification Section");
		});

		it("should handle sections with null values in grouping field", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ groupBy: "type" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.sections).to.have.property("unassigned");
			expect(sentData.data.sections.unassigned).to.be.an("array");
			expect(sentData.data.sections.unassigned.length).to.be.greaterThan(0);
		});

		it("should return normal response when groupBy is not provided", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "1", limit: "10" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sections).to.be.an("array");
			expect(sentData.data).to.not.have.property("groupedBy");
		});

		it("should handle empty groupBy parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ groupBy: "" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should combine grouping with other query parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ groupBy: "type", page: "1", limit: "10", sort: "name" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("groupedBy", "type");
			expect(sentData.data.sections).to.have.property("email");
		});

		it("should handle query validation failure", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "invalid" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "1", limit: "10" });

			// Mock Prisma to throw an error
			prisma.section.findMany = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "1", limit: "10" });

			// Mock Prisma to throw a non-Prisma error
			prisma.section.findMany = async () => {
				throw new Error("Internal server error");
			};

			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle advanced filtering", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({
				page: "1",
				limit: "10",
				query: "email",
				filter: JSON.stringify([{ field: "type", operator: "equals", value: "email" }]),
			});
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sections).to.be.an("array");
		});

		it("should handle pagination parameters", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildPaginationQuery({ page: "2", limit: "5", sort: "name", order: "asc" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.pagination).to.have.property("page", 2);
			expect(sentData.data.pagination).to.have.property("limit", 5);
		});

		it("should handle field selection", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ fields: "name,type" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sections).to.be.an("array");
		});

		it("should handle documents parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery();
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data.sections).to.be.an("array");
		});

		it("should handle count parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ count: "true" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("count", 1);
		});

		it("should handle pagination parameter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildPaginationQuery();
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData.data).to.have.property("pagination");
		});
	});

	describe(".getById()", () => {
		it("should return a section", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };
			await sectionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.deep.include({ id: mockSection.id });
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await sectionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent section", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await sectionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };

			// Mock Prisma to throw an error
			prisma.section.findFirst = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sectionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.section.findFirst = async () => {
				throw new Error("Internal server error");
			};

			await sectionController.getById(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".create()", () => {
		it("should create a new section", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Contact Form Section",
				description: "Section for contact forms with validation",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should create a new section with type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Email Section",
				description: "Section for email notifications",
				type: "email",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
			expect(sentData.data).to.have.property("type", "email");
		});

		it("should create a new section without type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Generic Section",
				description: "Section without type",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Form Section",
				description: "Section from form data",
				type: "form",
			});
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "URL Section",
				description: "Section from URL encoded data",
			});
			req.body = createData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "",
				description: "Section with empty name",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Test Section",
				description: "Section that will cause Prisma error",
			});
			req.body = createData;

			// Mock Prisma to throw an error
			prisma.section.create = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Test Section",
				description: "Section that will cause internal error",
			});
			req.body = createData;

			// Mock Prisma to throw a non-Prisma error
			prisma.section.create = async () => {
				throw new Error("Internal server error");
			};

			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".update()", () => {
		it("should update section details", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Enhanced Contact Form Section",
				description: "Updated section with additional validation and styling options",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("section");
			expect(sentData.data.section).to.have.property("id");
		});

		it("should update section type field", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				type: "sms",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("section");
			expect(sentData.data.section).to.have.property("id");
		});

		it("should update multiple section fields including type", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Email Section",
				description: "Updated description",
				type: "email",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
			expect(sentData).to.have.property("data");
			expect(sentData.data).to.have.property("section");
			expect(sentData.data.section).to.have.property("id");
		});

		it("should handle form data (multipart/form-data)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Form Updated Section",
				description: "Updated from form data",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "multipart/form-data";
				}
				return undefined;
			};
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle form data (application/x-www-form-urlencoded)", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "URL Updated Section",
				description: "Updated from URL encoded data",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			(req as any).get = (header: string) => {
				if (header === "Content-Type") {
					return "application/x-www-form-urlencoded";
				}
				return undefined;
			};
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Section",
			};
			req.params = { id: "invalid-id" };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle validation errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "",
				description: "Section with empty name",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent section update", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Updated Section",
			};
			req.params = { id: "507f1f77bcf86cd799439099" };
			req.body = updateData;
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test Section",
				description: "Section that will cause Prisma error",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;

			// Mock Prisma to throw an error
			prisma.section.update = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			const updateData = {
				name: "Test Section",
				description: "Section that will cause internal error",
			};
			req.params = { id: mockSection.id };
			req.body = updateData;

			// Mock Prisma to throw a non-Prisma error
			prisma.section.update = async () => {
				throw new Error("Internal server error");
			};

			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe(".remove()", () => {
		it("should delete a section", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };
			await sectionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle invalid ID format", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "invalid-id" };
			await sectionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle non-existent section deletion", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: "507f1f77bcf86cd799439099" };
			await sectionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(404);
			expect(sentData).to.have.property("status", "error");
			expect(sentData).to.have.property("code", 404);
		});

		it("should handle Prisma errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };

			// Mock Prisma to throw an error
			prisma.section.delete = async () => {
				const error = new Error("Database connection failed") as any;
				error.name = "PrismaClientKnownRequestError";
				error.code = "P1001";
				throw error;
			};

			await sectionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle internal errors", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };

			// Mock Prisma to throw a non-Prisma error
			prisma.section.delete = async () => {
				throw new Error("Internal server error");
			};

			await sectionController.remove(req as Request, res, next);
			expect(statusCode).to.equal(500);
			expect(sentData).to.have.property("status", "error");
		});
	});

	describe("Edge Cases and Integration", () => {
		it("should handle empty request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = {};
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle null request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = null;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle undefined request body", async function () {
			this.timeout(TEST_TIMEOUT);
			req.body = undefined;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle very long section name", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "A".repeat(1000), // Very long name
				description: "Section with very long name",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle special characters in section data", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Section with special chars: !@#$%^&*()",
				description: "Description with émojis 🚀 and unicode",
				type: "special-type",
			});
			req.body = createData;
			await sectionController.create(req as Request, res, next);
			expect(statusCode).to.equal(201);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle concurrent requests", async function () {
			this.timeout(TEST_TIMEOUT);
			const createData = buildCreateSectionData({
				name: "Concurrent Section",
				description: "Section created concurrently",
			});
			req.body = createData;

			// Simulate concurrent requests
			const promises = Array(5)
				.fill(null)
				.map(() => sectionController.create(req as Request, res, next));

			const results = await Promise.all(promises);
			expect(results).to.have.length(5);
		});

		it("should handle malformed JSON in filter", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({
				page: "1",
				limit: "10",
				filter: "invalid-json",
			});
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "999999", limit: "10" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle very large limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "1", limit: "999999" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});

		it("should handle negative page numbers", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "-1", limit: "10" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle negative limit values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "1", limit: "-10" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle empty string values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "", limit: "", sort: "", order: "" });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle whitespace-only values", async function () {
			this.timeout(TEST_TIMEOUT);
			req.query = buildListQuery({ page: "   ", limit: "   ", sort: "   " });
			await sectionController.getAll(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle missing required fields in update", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };
			req.body = {}; // Empty body
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(400);
			expect(sentData).to.have.property("status", "error");
		});

		it("should handle partial updates correctly", async function () {
			this.timeout(TEST_TIMEOUT);
			req.params = { id: mockSection.id };
			req.body = { name: "Only name updated" }; // Only name, no description or type
			await sectionController.update(req as Request, res, next);
			expect(statusCode).to.equal(200);
			expect(sentData).to.have.property("status", "success");
		});
	});
});

describe("Data Grouping Helper", () => {
	const testData = [
		{ id: 1, name: "Section 1", type: "email", category: "marketing" },
		{ id: 2, name: "Section 2", type: "sms", category: "notification" },
		{ id: 3, name: "Section 3", type: "email", category: "marketing" },
		{ id: 4, name: "Section 4", type: null, category: "general" },
		{ id: 5, name: "Section 5", type: "push", category: "notification" },
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
				{ id: 1, name: "Section 1", type: "email" },
				{ id: 2, name: "Section 2" }, // missing type field
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
			expect(result).to.have.property("Section 1");
			expect(result).to.have.property("Section 2");
			expect(result).to.have.property("Section 3");
			expect(result).to.have.property("Section 4");
			expect(result).to.have.property("Section 5");
			expect(result["Section 1"]).to.have.length(1);
		});
	});
});
