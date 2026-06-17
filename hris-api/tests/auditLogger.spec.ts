import { expect } from "chai";
import type { Request } from "express";
import { prisma } from "../config/database";
import { logAudit, shouldSkipAuditLog } from "../utils/auditLogger";

describe("auditLogger", () => {
	const originalEmployeeFindFirst = prisma.employee.findFirst;
	const originalAuditCreate = prisma.auditLogging.create;

	const buildRequest = (overrides: Partial<Request> = {}) =>
		({
			method: "POST",
			originalUrl: "/api/auth/login",
			headers: {
				"user-agent": "audit-test-agent",
			},
			ip: "127.0.0.1",
			socket: {
				remoteAddress: "127.0.0.1",
			},
			get(name: string) {
				const headerValue = this.headers?.[name.toLowerCase() as keyof typeof this.headers];
				return Array.isArray(headerValue) ? headerValue[0] : headerValue;
			},
			...overrides,
		}) as Request;

	afterEach(() => {
		prisma.employee.findFirst = originalEmployeeFindFirst;
		prisma.auditLogging.create = originalAuditCreate;
	});

	it("skips READ audit actions", () => {
		const req = buildRequest();

		expect(
			shouldSkipAuditLog(req, {
				userId: "user-1",
				action: "READ",
				resource: "metrics",
				severity: "LOW",
				entityType: "metrics",
				entityId: "507f1f77bcf86cd799439011",
				changesBefore: null,
				changesAfter: null,
				description: "Read metrics",
			}),
		).to.equal(true);
	});

	it("skips GET request audit entries even when the action is not READ", () => {
		const req = buildRequest({
			method: "GET",
			originalUrl: "/api/employee",
		});

		expect(
			shouldSkipAuditLog(req, {
				userId: "user-1",
				action: "LOGIN",
				resource: "auth",
				severity: "LOW",
				entityType: "user",
				entityId: "507f1f77bcf86cd799439011",
				changesBefore: null,
				changesAfter: null,
				description: "This should not persist",
			}),
		).to.equal(true);
	});

	it("persists auth audit entries for non-GET requests", async () => {
		const req = buildRequest({
			method: "POST",
			originalUrl: "/api/auth/login",
		}) as Request & {
			userId?: string;
			metadata?: {
				employee?: {
					id?: string;
				};
			};
		};
		req.userId = "507f1f77bcf86cd799439012";

		let capturedCreatePayload: any = null;

		prisma.employee.findFirst = (async () => ({
			id: "507f1f77bcf86cd799439013",
		})) as typeof prisma.employee.findFirst;
		prisma.auditLogging.create = (async (payload: any) => {
			capturedCreatePayload = payload;
			return {
				id: "507f1f77bcf86cd799439014",
				...payload.data,
			};
		}) as typeof prisma.auditLogging.create;

		await logAudit(req, {
			userId: "507f1f77bcf86cd799439012",
			action: "LOGIN",
			resource: "auth",
			severity: "LOW",
			entityType: "user",
			entityId: "507f1f77bcf86cd799439012",
			changesBefore: null,
			changesAfter: {
				email: "admin@bandai.local",
				role: "hris-admin",
			},
			description: "Login succeeded",
			organizationId: "507f1f77bcf86cd799439015",
		});

		expect(capturedCreatePayload).to.not.equal(null);
		expect(capturedCreatePayload.data.type).to.equal("LOGIN");
		expect(capturedCreatePayload.data.metadata).to.deep.include({
			method: "POST",
			path: "/api/auth/login",
			ip: "127.0.0.1",
			userAgent: "audit-test-agent",
		});
		expect(capturedCreatePayload.data.payload).to.deep.include({
			resource: "auth",
			organizationId: "507f1f77bcf86cd799439015",
		});
	});
});
