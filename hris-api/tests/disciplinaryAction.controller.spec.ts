import { controller } from "../app/disciplinaryAction/disciplinaryAction.controller";
import { expect } from "chai";
import { Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "../generated/prisma";

const TEST_TIMEOUT = 5000;

/**
 * Repo-specific contract for the disciplinary action module (spec gap M3.2).
 * The generated template spec tested a name/description/type model that this
 * module replaced with employeeId/offenseType/severity/status.
 */
describe("DisciplinaryAction Controller", () => {
	let disciplinaryActionController: any;
	let req: Partial<Request>;
	let res: Response;
	let next: NextFunction;
	let prisma: any;
	let sentData: any;
	let statusCode: number;
	let createCalls: any[];
	let updateCalls: any[];

	const mockEmployee = {
		employeeId: "00010",
		person: { personalInfo: { firstName: "Zen", lastName: "Andrei" } },
	};

	const mockDisciplinaryAction = {
		id: "507f1f77bcf86cd799439026",
		employeeId: "cmspnnxot02s5qw01yk7yy2er",
		employeeName: "Zen Andrei",
		offenseType: "TARDINESS",
		offenseDate: new Date("2026-08-25"),
		description: "Late counselling",
		severity: "LOW",
		status: "OPEN",
		organizationId: "org-1",
		isDeleted: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(() => {
		createCalls = [];
		updateCalls = [];
		prisma = {
			employee: {
				findFirst: async (_params: Prisma.EmployeeFindFirstArgs) => mockEmployee,
			},
			disciplinaryAction: {
				findMany: async (_params: Prisma.DisciplinaryActionFindManyArgs) => [mockDisciplinaryAction],
				count: async (_params: Prisma.DisciplinaryActionCountArgs) => 1,
				findFirst: async (params: Prisma.DisciplinaryActionFindFirstArgs) =>
					params.where?.id === mockDisciplinaryAction.id ? mockDisciplinaryAction : null,
				create: async (params: Prisma.DisciplinaryActionCreateArgs) => {
					const row = { ...mockDisciplinaryAction, ...(params.data as any), id: "new-1" };
					createCalls.push(row);
					return row;
				},
				update: async (params: Prisma.DisciplinaryActionUpdateArgs) => {
					const row = { ...mockDisciplinaryAction, ...(params.data as any) };
					updateCalls.push({ where: params.where, data: params.data });
					return row;
				},
			},
			$transaction: async (operations: any) => {
				if (typeof operations === "function") {
					return operations(prisma);
				}
				return await Promise.all(operations);
			},
		};

		disciplinaryActionController = controller(prisma as PrismaClient);
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
			originalUrl: "/api/disciplinaryAction",
			organizationId: "org-1",
			user: { id: "user-1" },
		} as any;
		res = {
			send: (data: any) => {
				sentData = data;
			},
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (data: any) => {
				sentData = data;
				return res;
			},
		} as unknown as Response;
		next = (() => {}) as NextFunction;
	});

	describe(".create()", () => {
		it("rejects missing required fields with 400", async () => {
			req.body = {};
			await disciplinaryActionController.create(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
			expect(sentData.status).to.equal("error");
		});

		it("snapshots employeeName and org-scopes the record", async () => {
			req.body = {
				employeeId: "cmspnnxot02s5qw01yk7yy2er",
				offenseType: "TARDINESS",
				offenseDate: "2026-08-25",
				description: "Late counselling",
				severity: "LOW",
			};
			await disciplinaryActionController.create(req as Request, res as Response, next);
			expect(statusCode).to.equal(201);
			expect(createCalls).to.have.lengthOf(1);
			expect(createCalls[0].employeeName).to.equal("Zen Andrei");
			expect(createCalls[0].organizationId).to.equal("org-1");
			expect(createCalls[0].createdByUserId).to.equal("user-1");
		});

		it("falls back to raw employeeId when the employee lookup misses", async () => {
			prisma.employee.findFirst = async () => null;
			req.body = {
				employeeId: "ghost-id",
				offenseType: "OTHER",
				offenseDate: "2026-08-25",
				description: "Unknown employee path",
			};
			await disciplinaryActionController.create(req as Request, res as Response, next);
			expect(statusCode).to.equal(201);
			expect(createCalls[0].employeeName).to.equal("ghost-id");
		});
	});

	describe(".getAll()", () => {
		it("requires at least one of document/pagination/count flags", async () => {
			req.query = {};
			await disciplinaryActionController.getAll(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
		});

		it("returns count-only payload for count=true", async () => {
			req.query = { count: "true" };
			await disciplinaryActionController.getAll(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.count).to.equal(1);
			expect(sentData.data.disciplinaryActions).to.be.undefined;
		});

		it("returns list payload scoped to organizationId and isDeleted=false", async () => {
			req.query = { document: "true", pagination: "true", page: "1", limit: "10" };
			await disciplinaryActionController.getAll(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.disciplinaryActions).to.have.lengthOf(1);
			expect(sentData.data.pagination).to.exist;
		});
	});

	describe(".getById()", () => {
		it("returns the disciplinary action when found", async () => {
			req.params = { id: mockDisciplinaryAction.id };
			await disciplinaryActionController.getById(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(sentData.data.employeeName).to.equal("Zen Andrei");
		});

		it("returns 404 when not found", async () => {
			req.params = { id: "does-not-exist" };
			await disciplinaryActionController.getById(req as Request, res as Response, next);
			expect(statusCode).to.equal(404);
		});
	});

	describe(".update()", () => {
		it("applies partial updates and stamps updatedByUserId", async () => {
			req.params = { id: mockDisciplinaryAction.id };
			req.body = { severity: "HIGH", resolutionNotes: "Counselled" };
			await disciplinaryActionController.update(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(updateCalls[0].data.severity).to.equal("HIGH");
			expect(updateCalls[0].data.updatedByUserId).to.equal("user-1");
		});

		it("rejects an empty body with 400", async () => {
			req.params = { id: mockDisciplinaryAction.id };
			req.body = {};
			await disciplinaryActionController.update(req as Request, res as Response, next);
			expect(statusCode).to.equal(400);
		});

		it("returns 404 for an unknown or cross-org id", async () => {
			req.params = { id: "other-org-row" };
			req.body = { severity: "HIGH" };
			await disciplinaryActionController.update(req as Request, res as Response, next);
			expect(statusCode).to.equal(404);
		});
	});

	describe(".remove()", () => {
		it("soft-deletes by setting isDeleted plus updatedByUserId", async () => {
			req.params = { id: mockDisciplinaryAction.id };
			await disciplinaryActionController.remove(req as Request, res as Response, next);
			expect(statusCode).to.equal(200);
			expect(updateCalls).to.have.lengthOf(1);
			expect(updateCalls[0].data.isDeleted).to.equal(true);
			expect(updateCalls[0].data.updatedByUserId).to.equal("user-1");
		});

		it("returns 404 when the row is missing", async () => {
			req.params = { id: "missing" };
			await disciplinaryActionController.remove(req as Request, res as Response, next);
			expect(statusCode).to.equal(404);
			expect(updateCalls).to.have.lengthOf(0);
		});
	});
});
