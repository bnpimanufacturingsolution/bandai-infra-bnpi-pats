import { expect } from "chai";
import express, { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { router as systemProvisioningRouter } from "../app/systemProvisioning/systemProvisioning.router";
import {
	__resetVerifyTokenDependenciesForTests,
	__setVerifyTokenDependenciesForTests,
	AuthRequest,
} from "../middleware/verifyToken";

describe("System Provisioning Optional Auth", () => {
	const originalJwtSecret = process.env.JWT_SECRET;
	const originalDatabaseUrl = process.env.DATABASE_URL;

	const buildApp = () => {
		const app = express();
		const baseRouter = express.Router();
		const controller = {
			getStatus: async (req: Request, res: Response, _next: NextFunction) => {
				const authReq = req as AuthRequest;
				res.status(200).json({
					userId: authReq.userId || null,
					organizationId: authReq.organizationId || null,
				});
			},
			getPreview: async (_req: Request, res: Response) => res.status(200).json({ ok: true }),
			initialize: async (_req: Request, res: Response) => res.status(200).json({ ok: true }),
			bootstrapAdmin: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			getTimesheetSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			updateTimesheetSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			getPayrollSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			updatePayrollSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			createPayrollPeriod: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			getLeaveSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			updateLeaveSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			updateHrSettings: async (_req: Request, res: Response) =>
				res.status(200).json({ ok: true }),
			activate: async (_req: Request, res: Response) => res.status(200).json({ ok: true }),
		};

		app.use(express.json());
		app.use("/api", systemProvisioningRouter(baseRouter, controller));
		return app;
	};

	beforeEach(() => {
		process.env.JWT_SECRET = "test-secret";
		process.env.DATABASE_URL = "mongodb://localhost:27017/hris";
		__setVerifyTokenDependenciesForTests({
			prisma: {
				employee: {
					findFirst: async () => ({
						id: "emp-1",
						employmentStatus: "ACTIVE",
					}),
				},
			},
		});
	});

	afterEach(() => {
		__resetVerifyTokenDependenciesForTests();
		process.env.JWT_SECRET = originalJwtSecret;
		process.env.DATABASE_URL = originalDatabaseUrl;
	});

	it("allows guest access when no token is provided", async () => {
		const response = await request(buildApp()).get("/api/system-provisioning/status").expect(200);

		expect(response.body).to.deep.equal({
			userId: null,
			organizationId: null,
		});
	});

	it("attaches auth context when a valid token is provided", async () => {
		const token = jwt.sign(
			{
				userId: "user-1",
				role: "hris-admin",
				roleId: "role-1",
				organizationId: "org-1",
			},
			process.env.JWT_SECRET as string,
			{ expiresIn: "1h" },
		);

		const response = await request(buildApp())
			.get("/api/system-provisioning/status")
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		expect(response.body).to.deep.equal({
			userId: "user-1",
			organizationId: "org-1",
		});
	});

	it("falls back to guest access when the token is malformed", async () => {
		const response = await request(buildApp())
			.get("/api/system-provisioning/status")
			.set("Authorization", "Bearer malformed-token")
			.expect(200);

		expect(response.body).to.deep.equal({
			userId: null,
			organizationId: null,
		});
	});

	it("falls back to guest access when datasource validation fails", async () => {
		process.env.DATABASE_URL = "prisma://accelerate.example.com";
		const token = jwt.sign(
			{
				userId: "user-1",
				role: "hris-admin",
				roleId: "role-1",
				organizationId: "org-1",
			},
			process.env.JWT_SECRET as string,
			{ expiresIn: "1h" },
		);

		const response = await request(buildApp())
			.get("/api/system-provisioning/status")
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		expect(response.body).to.deep.equal({
			userId: null,
			organizationId: null,
		});
	});
});
