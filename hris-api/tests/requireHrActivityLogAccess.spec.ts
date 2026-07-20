import { expect } from "chai";
import type { NextFunction, Response } from "express";
import requireHrAuditLogAccess, {
	canAccessHrAuditLogs,
} from "../middleware/requireHrAuditLogAccess";

const createResponseMock = () => {
	let statusCode = 200;
	let payload: any;
	const res: Partial<Response> = {
		status(code: number) {
			statusCode = code;
			return res as Response;
		},
		json(data: any) {
			payload = data;
			return res as Response;
		},
	};

	return { res: res as Response, getStatusCode: () => statusCode, getPayload: () => payload };
};

describe("requireHrAuditLogAccess", () => {
	it("allows HR manager and HR user", () => {
		expect(canAccessHrAuditLogs("hris-hr-manager")).to.equal(true);
		expect(canAccessHrAuditLogs("hris-hr-user")).to.equal(true);
	});

	it("denies non-HR roles", () => {
		expect(canAccessHrAuditLogs("admin")).to.equal(false);
		expect(canAccessHrAuditLogs("hris-admin")).to.equal(false);
	});

	it("rejects unauthorized users through the middleware", () => {
		const { res, getStatusCode, getPayload } = createResponseMock();
		let nextCalled = false;

		requireHrAuditLogAccess(
			{ role: "hris-admin" } as any,
			res,
			(() => {
				nextCalled = true;
			}) as NextFunction,
		);

		expect(nextCalled).to.equal(false);
		expect(getStatusCode()).to.equal(403);
		expect(getPayload()).to.include({ status: "error", message: "Not authorized", code: 403 });
	});

	it("allows authorized users through the middleware", () => {
		const { res } = createResponseMock();
		let nextCalled = false;

		requireHrAuditLogAccess(
			{ role: "hris-hr-user" } as any,
			res,
			(() => {
				nextCalled = true;
			}) as NextFunction,
		);

		expect(nextCalled).to.equal(true);
	});
});
