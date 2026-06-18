import { expect } from "chai";
import { getOrganizationId, runWithTenantContext, tenantContext } from "../../utils/tenantContext";
import { tenantContextMiddleware } from "../../middleware/tenant";
import { enforceTenant } from "../../middleware/tenantEnforce";
import { requestTimeout } from "../../middleware/requestTimeout";

describe("getOrganizationId", () => {
	it("returns undefined outside tenant context", () => {
		expect(getOrganizationId()).to.equal(undefined);
	});

	it("returns organization id inside context", () => {
		const out = runWithTenantContext({ organizationId: "org-1" }, () => getOrganizationId());
		expect(out).to.equal("org-1");
	});

	it("handles context without organization id", () => {
		const out = runWithTenantContext({ userId: "u1" }, () => getOrganizationId());
		expect(out).to.equal(undefined);
	});

	it("supports nested callback reads", () => {
		const out = runWithTenantContext({ organizationId: "org-2" }, () => {
			return getOrganizationId();
		});
		expect(out).to.equal("org-2");
	});

	it("reads latest active context value", () => {
		const first = runWithTenantContext({ organizationId: "org-a" }, () => getOrganizationId());
		const second = runWithTenantContext({ organizationId: "org-b" }, () => getOrganizationId());
		expect(first).to.equal("org-a");
		expect(second).to.equal("org-b");
	});
});

describe("tenantContext", () => {
	it("stores and retrieves current store", () => {
		const store = runWithTenantContext({ organizationId: "o1", userId: "u1" }, () =>
			tenantContext.getStore(),
		);
		expect(store?.organizationId).to.equal("o1");
		expect(store?.userId).to.equal("u1");
	});

	it("returns undefined store outside run", () => {
		expect(tenantContext.getStore()).to.equal(undefined);
	});

	it("supports context with only user id", () => {
		const store = runWithTenantContext({ userId: "user-only" }, () => tenantContext.getStore());
		expect(store?.userId).to.equal("user-only");
	});

	it("supports context with only organization id", () => {
		const store = runWithTenantContext({ organizationId: "org-only" }, () =>
			tenantContext.getStore(),
		);
		expect(store?.organizationId).to.equal("org-only");
	});

	it("isolates sequential runs", () => {
		const a = runWithTenantContext({ organizationId: "a" }, () => tenantContext.getStore());
		const b = runWithTenantContext({ organizationId: "b" }, () => tenantContext.getStore());
		expect(a?.organizationId).to.equal("a");
		expect(b?.organizationId).to.equal("b");
	});
});

describe("tenantContextMiddleware", () => {
	it("calls next once", () => {
		let called = 0;
		tenantContextMiddleware({} as any, {} as any, () => {
			called += 1;
		});
		expect(called).to.equal(1);
	});

	it("propagates organizationId into context for next", () => {
		let seen: string | undefined;
		tenantContextMiddleware({ organizationId: "org-1" } as any, {} as any, () => {
			seen = getOrganizationId();
		});
		expect(seen).to.equal("org-1");
	});

	it("handles missing organizationId", () => {
		let called = false;
		tenantContextMiddleware({} as any, {} as any, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});

	it("propagates userId in context store", () => {
		let seen: string | undefined;
		tenantContextMiddleware({ organizationId: "org-1", userId: "u-1" } as any, {} as any, () => {
			seen = tenantContext.getStore()?.userId;
		});
		expect(seen).to.equal("u-1");
	});

	it("returns middleware callback result", () => {
		const out = tenantContextMiddleware({ organizationId: "org-2" } as any, {} as any, () => "ok");
		expect(out).to.equal("ok");
	});
});

describe("enforceTenant", () => {
	it("responds 401 when organizationId is missing", () => {
		let statusCode = 0;
		let payload: any;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(body: any) {
				payload = body;
				return this;
			},
		};
		let called = false;
		enforceTenant({} as any, res as any, () => {
			called = true;
		});
		expect(statusCode).to.equal(401);
		expect(payload?.message).to.contain("Missing organizationId");
		expect(called).to.equal(false);
	});

	it("calls next when organizationId exists", () => {
		let called = false;
		enforceTenant({ organizationId: "org-1" } as any, {} as any, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});

	it("sets userOrganizationId on request", () => {
		const req: any = { organizationId: "org-2" };
		enforceTenant(req, {} as any, () => undefined);
		expect(req.userOrganizationId).to.equal("org-2");
	});

	it("treats empty organizationId as missing", () => {
		let statusCode = 0;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(_body: any) {
				return this;
			},
		};
		enforceTenant({ organizationId: "" } as any, res as any, () => undefined);
		expect(statusCode).to.equal(401);
	});

	it("includes error status in payload", () => {
		let payload: any;
		const res = {
			status(_code: number) {
				return this;
			},
			json(body: any) {
				payload = body;
				return this;
			},
		};
		enforceTenant({} as any, res as any, () => undefined);
		expect(payload.status).to.equal("error");
	});
});

describe("requestTimeout", () => {
	it("returns middleware function", () => {
		const mw = requestTimeout({ timeoutMs: 1000 });
		expect(typeof mw).to.equal("function");
	});

	it("sets timeout on request and response", () => {
		let reqSet = 0;
		let resSet = 0;
		const req = {
			method: "GET",
			originalUrl: "/x",
			setTimeout(_ms: number, _cb: () => void) {
				reqSet += 1;
			},
		} as any;
		const res = {
			setTimeout(_ms: number, _cb: () => void) {
				resSet += 1;
			},
		} as any;
		requestTimeout({ timeoutMs: 1000 })(req, res, () => undefined);
		expect(reqSet).to.equal(1);
		expect(resSet).to.equal(1);
	});

	it("calls next after wiring timeout", () => {
		let called = false;
		const req = { method: "GET", originalUrl: "/x", setTimeout: () => undefined } as any;
		const res = { setTimeout: () => undefined } as any;
		requestTimeout({ timeoutMs: 1000 })(req, res, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});

	it("uses request url when label is not provided", () => {
		let callbackSeen = false;
		const req = {
			method: "GET",
			originalUrl: "/fallback",
			setTimeout(_ms: number, cb: () => void) {
				callbackSeen = typeof cb === "function";
			},
		} as any;
		const res = { setTimeout: () => undefined } as any;
		requestTimeout({ timeoutMs: 1000 })(req, res, () => undefined);
		expect(callbackSeen).to.equal(true);
	});

	it("accepts custom label", () => {
		let called = false;
		const req = { method: "GET", originalUrl: "/x", setTimeout: () => undefined } as any;
		const res = { setTimeout: () => undefined } as any;
		requestTimeout({ timeoutMs: 1000, label: "custom-label" })(req, res, () => {
			called = true;
		});
		expect(called).to.equal(true);
	});
});
