import { expect } from "chai";
import jwt from "jsonwebtoken";
import { NextFunction, Response } from "express";
import verifyToken, {
	__resetVerifyTokenDependenciesForTests,
	__setVerifyTokenDependenciesForTests,
	AuthRequest,
} from "../middleware/verifyToken";

describe("verifyToken middleware", () => {
	const originalJwtSecret = process.env.JWT_SECRET;
	const originalDatabaseUrl = process.env.DATABASE_URL;

	const createResponse = () => {
		let statusCode = 200;
		let payload: any;

		const res = {
			status: (code: number) => {
				statusCode = code;
				return res;
			},
			json: (body: any) => {
				payload = body;
				return res;
			},
		} as Response;

		return {
			res,
			getStatusCode: () => statusCode,
			getPayload: () => payload,
		};
	};

	const createRequest = (token?: string) =>
		({
			method: "GET",
			originalUrl: "/api/employee",
			url: "/api/employee",
			headers: token ? { authorization: `Bearer ${token}` } : {},
			cookies: {},
			body: {},
		}) as AuthRequest;

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
			} as any,
		});
	});

	afterEach(() => {
		__resetVerifyTokenDependenciesForTests();
		process.env.JWT_SECRET = originalJwtSecret;
		process.env.DATABASE_URL = originalDatabaseUrl;
	});

	it("returns 401 for malformed tokens on strict routes", async () => {
		const req = createRequest("malformed-token");
		const { res, getStatusCode, getPayload } = createResponse();
		let nextCalled = false;

		await verifyToken(req, res, (() => {
			nextCalled = true;
		}) as NextFunction);

		expect(nextCalled).to.equal(false);
		expect(getStatusCode()).to.equal(401);
		expect(getPayload()).to.deep.equal({
			message: "Invalid token",
		});
	});

	it("returns 500 for datasource configuration failures before employee lookup", async () => {
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
		const req = createRequest(token);
		const { res, getStatusCode, getPayload } = createResponse();
		let nextCalled = false;
		let findFirstCalled = 0;

		__setVerifyTokenDependenciesForTests({
			prisma: {
				employee: {
					findFirst: async () => {
						findFirstCalled += 1;
						return null;
					},
				},
			} as any,
		});

		await verifyToken(req, res, (() => {
			nextCalled = true;
		}) as NextFunction);

		expect(nextCalled).to.equal(false);
		expect(findFirstCalled).to.equal(0);
		expect(getStatusCode()).to.equal(500);
		expect(getPayload()).to.deep.equal({
			message: "Authentication is temporarily unavailable",
		});
	});

	it("returns 403 for deactivated employees on strict routes", async () => {
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
		const req = createRequest(token);
		const { res, getStatusCode, getPayload } = createResponse();
		let nextCalled = false;

		__setVerifyTokenDependenciesForTests({
			prisma: {
				employee: {
					findFirst: async () => ({
						id: "emp-1",
						employmentStatus: "TERMINATED",
					}),
				},
			} as any,
		});

		await verifyToken(req, res, (() => {
			nextCalled = true;
		}) as NextFunction);

		expect(nextCalled).to.equal(false);
		expect(getStatusCode()).to.equal(403);
		expect(getPayload()).to.deep.equal({
			message:
				"Your account has been deactivated due to termination or resignation. Please contact HR for further assistance.",
			error: "ACCOUNT_DEACTIVATED",
			data: {
				employmentStatus: "TERMINATED",
			},
		});
	});
});
