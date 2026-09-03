import { expect } from "chai";
import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
const bcrypt = require("bcryptjs");
import { controller } from "../app/auth/auth.controller";
import { config } from "../config/config";
import type { AuthRequest } from "../middleware/verifyToken";

describe("auth.controller audit logging", () => {
	const originalFetch = global.fetch;
	const originalJwtSecret = process.env.JWT_SECRET;
	const originalIdpEnabled = config.idpEnabled;

	const createResponse = () => {
		let statusCode = 200;
		let payload: any;
		const cookies: Array<{ name: string; value: string }> = [];

		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(body: any) {
				payload = body;
				return this;
			},
			cookie(name: string, value: string) {
				cookies.push({ name, value });
				return this;
			},
			clearCookie() {
				return this;
			},
		} as unknown as Response;

		return {
			res,
			getStatusCode: () => statusCode,
			getPayload: () => payload,
			getCookies: () => cookies,
		};
	};

	const createRequest = (body: Record<string, unknown>): AuthRequest =>
		({
			body,
			method: "POST",
			originalUrl: "/api/auth/login",
			headers: {
				"user-agent": "auth-controller-test",
			},
			ip: "127.0.0.1",
			socket: {
				remoteAddress: "127.0.0.1",
			},
			cookies: {},
			get(name: string) {
				const key = name.toLowerCase();
				const headerValue = this.headers?.[key as keyof typeof this.headers];
				return Array.isArray(headerValue) ? headerValue[0] : headerValue;
			},
		}) as AuthRequest;

	beforeEach(() => {
		process.env.JWT_SECRET = "test-secret";
		(config as any).idpEnabled = false;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		process.env.JWT_SECRET = originalJwtSecret;
		(config as any).idpEnabled = originalIdpEnabled;
	});

	it("writes a LOGIN audit log for local login", async () => {
		let capturedAuditCreate: any = null;
		const hashedPassword = await bcrypt.hash("password123", 10);
		const prismaStub: any = {
			user: {
				findFirst: async ({ where }: any) => {
					if (where?.email) {
						return {
							id: "507f1f77bcf86cd799439021",
							email: "admin@bandai.local",
							password: hashedPassword,
							status: "active",
						};
					}

					return null;
				},
				findUnique: async () => ({
					id: "507f1f77bcf86cd799439021",
					email: "admin@bandai.local",
					userName: "Bandai Admin",
					status: "active",
					lastLogin: null,
					loginMethod: "email",
					createdAt: new Date("2026-05-01T00:00:00.000Z"),
					updatedAt: new Date("2026-05-01T00:00:00.000Z"),
					organizationId: "507f1f77bcf86cd799439022",
					role: "hris-admin",
					metadata: {},
				}),
				update: async () => ({
					id: "507f1f77bcf86cd799439021",
					email: "admin@bandai.local",
					userName: "Bandai Admin",
					role: "hris-admin",
					status: "active",
					organizationId: "507f1f77bcf86cd799439022",
					metadata: {},
				}),
			},
			organization: {
				findUnique: async () => ({
					id: "507f1f77bcf86cd799439022",
					name: "Bandai Local",
					code: "BANDAI",
					branding: null,
					description: null,
				}),
			},
			employee: {
				findFirst: async () => ({
					id: "507f1f77bcf86cd799439023",
					organizationId: "507f1f77bcf86cd799439022",
					employeeId: "EMP-001",
					userId: "507f1f77bcf86cd799439021",
					role: "hris-admin",
					isManager: false,
					isHrManager: true,
					employmentStatus: "ACTIVE",
					employmentType: "REGULAR",
					employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
					isTour: false,
					workforceSource: "DIRECT",
					department: null,
					position: null,
					level: null,
					agency: null,
					reportTo: null,
					person: {
						personalInfo: {
							firstName: "Bandai",
							lastName: "Admin",
						},
						contactInfo: {
							email: "admin@bandai.local",
						},
					},
				}),
			},
			auditLogging: {
				create: async (payload: any) => {
					capturedAuditCreate = payload;
					return {
						id: "507f1f77bcf86cd799439024",
						...payload.data,
					};
				},
			},
		};

		const authController = controller(prismaStub);
		const req = createRequest({
			email: "admin@bandai.local",
			password: "password123",
		});
		const { res, getStatusCode, getPayload, getCookies } = createResponse();

		await authController.login(req, res, (() => undefined) as NextFunction);

		expect(getStatusCode()).to.equal(200);
		expect(getPayload()?.message).to.equal("Login successful");
		expect(getCookies()).to.have.length.greaterThan(0);
		expect(capturedAuditCreate?.data?.type).to.equal("LOGIN");
		expect(capturedAuditCreate?.data?.payload?.resource).to.equal("auth");
		expect(capturedAuditCreate?.data?.metadata?.method).to.equal("POST");
	});

	it("writes a local LOGIN audit log after successful IDP login", async () => {
		let capturedAuditCreate: any = null;
		(config as any).idpEnabled = true;
		global.fetch = ((async () => ({
			ok: true,
			status: 200,
			text: async () =>
				JSON.stringify({
					data: {
						id: "idp-user-1",
						email: "admin@bandai.local",
						role: "hris-admin",
						roleId: "hris-admin",
						organizationId: "org-idp-1",
						loginMethod: "email",
					},
				}),
		})) as unknown) as typeof fetch;

		const prismaStub: any = {
			user: {
				findFirst: async () => null,
			},
			auditLogging: {
				create: async (payload: any) => {
					capturedAuditCreate = payload;
					return {
						id: "507f1f77bcf86cd799439025",
						...payload.data,
					};
				},
			},
			employee: {
				findFirst: async () => null,
			},
			organization: {
				findUnique: async () => null,
			},
		};

		const authController = controller(prismaStub);
		const req = createRequest({
			email: "admin@bandai.local",
			password: "password123",
		});
		const { res, getStatusCode } = createResponse();

		await authController.login(req, res, (() => undefined) as NextFunction);

		expect(getStatusCode()).to.equal(200);
		expect(capturedAuditCreate?.data?.type).to.equal("LOGIN");
		expect(capturedAuditCreate?.data?.description).to.equal("User login succeeded via IDP");
		expect(capturedAuditCreate?.data?.changesAfter?.email).to.equal("admin@bandai.local");
	});

	it("writes a LOGOUT audit log when a valid auth token is present", async () => {
		let capturedAuditCreate: any = null;
		const token = jwt.sign(
			{
				userId: "507f1f77bcf86cd799439031",
				role: "hris-admin",
				roleId: "hris-admin",
				organizationId: "507f1f77bcf86cd799439032",
				metadata: {
					employee: {
						id: "507f1f77bcf86cd799439033",
					},
				},
			},
			process.env.JWT_SECRET as string,
			{ expiresIn: "1h" },
		);

		const prismaStub: any = {
			user: {
				findUnique: async () => ({
					id: "507f1f77bcf86cd799439031",
					email: "admin@bandai.local",
					userName: "Bandai Admin",
					status: "active",
					lastLogin: null,
					loginMethod: "email",
					createdAt: new Date("2026-05-01T00:00:00.000Z"),
					updatedAt: new Date("2026-05-01T00:00:00.000Z"),
					organizationId: "507f1f77bcf86cd799439032",
					role: "hris-admin",
					metadata: {
						employee: {
							id: "507f1f77bcf86cd799439033",
						},
					},
				}),
			},
			organization: {
				findUnique: async () => null,
			},
			employee: {
				findFirst: async () => ({
					id: "507f1f77bcf86cd799439033",
					organizationId: "507f1f77bcf86cd799439032",
					employeeId: "EMP-001",
					userId: "507f1f77bcf86cd799439031",
					role: "hris-admin",
					isManager: false,
					isHrManager: true,
					employmentStatus: "ACTIVE",
					employmentType: "REGULAR",
					employmentHireDate: new Date("2026-01-01T00:00:00.000Z"),
					isTour: false,
					workforceSource: "DIRECT",
					department: null,
					position: null,
					level: null,
					agency: null,
					reportTo: null,
					person: {
						personalInfo: {
							firstName: "Bandai",
							lastName: "Admin",
						},
						contactInfo: {
							email: "admin@bandai.local",
						},
					},
				}),
			},
			auditLogging: {
				create: async (payload: any) => {
					capturedAuditCreate = payload;
					return {
						id: "507f1f77bcf86cd799439034",
						...payload.data,
					};
				},
			},
		};

		const authController = controller(prismaStub);
		const req = {
			...createRequest({}),
			method: "POST",
			originalUrl: "/api/auth/logout",
			headers: {
				authorization: `Bearer ${token}`,
				"user-agent": "auth-controller-test",
			},
		} as AuthRequest;
		const { res, getStatusCode } = createResponse();

		await authController.logout(req, res, (() => undefined) as NextFunction);

		expect(getStatusCode()).to.equal(200);
		expect(capturedAuditCreate?.data?.type).to.equal("LOGOUT");
		expect(capturedAuditCreate?.data?.description).to.equal("User logout succeeded");
	});
});
