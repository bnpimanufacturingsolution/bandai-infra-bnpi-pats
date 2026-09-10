import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireIntegrationApiKey } from "../middleware/integrationApiKey";
import { config } from "../config/config";

const buildReq = (headers: Record<string, string> = {}): Request =>
	({
		headers,
		get: (name: string) => {
			const normalized = name.toLowerCase();
			const match = Object.entries(headers).find(
				([key]) => key.toLowerCase() === normalized,
			);
			return match ? match[1] : undefined;
		},
	}) as unknown as Request;

const buildRes = () => {
	const state = { status: 200, body: null as any };
	const response = {
		status(code: number) {
			state.status = code;
			return response;
		},
		json(body: unknown) {
			state.body = body;
			return response;
		},
	};
	return { response: response as unknown as Response, state };
};

const withKeys = (keys: string | undefined, fn: () => void | Promise<void>) => {
	const original = config.integrationApiKeys;
	config.integrationApiKeys = keys as any;
	return Promise.resolve(fn()).finally(() => {
		config.integrationApiKeys = original;
	});
};

describe("integration API key middleware", () => {
	it("allows a request carrying a valid X-API-Key header", async () => {
		await withKeys("key-one, key-two", async () => {
			const req = buildReq({ "X-API-Key": "key-two" });
			const { response } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, true);
		});
	});

	it("rejects an invalid key with 401 and does not call next", async () => {
		await withKeys("key-one", async () => {
			const req = buildReq({ "X-API-Key": "wrong-key" });
			const { response, state } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, false);
			assert.equal(state.status, 401);
		});
	});

	it("rejects a missing key header with 401 when keys are configured", async () => {
		await withKeys("key-one", async () => {
			const req = buildReq({});
			const { response, state } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, false);
			assert.equal(state.status, 401);
			assert.match(String(state.body?.message), /X-API-Key/);
		});
	});

	it("fails closed with 503 when no keys are configured", async () => {
		await withKeys("", async () => {
			const req = buildReq({ "X-API-Key": "key-one" });
			const { response, state } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, false);
			assert.equal(state.status, 503);
			assert.match(String(state.body?.message), /not configured/i);
		});
	});

	it("fails closed with 503 when the config value is undefined", async () => {
		await withKeys(undefined, async () => {
			const req = buildReq({ "X-API-Key": "key-one" });
			const { response, state } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, false);
			assert.equal(state.status, 503);
		});
	});

	it("skips the key gate when a JWT auth context is already attached", async () => {
		await withKeys("", async () => {
			const req = buildReq({}) as Request & { userId?: string };
			(req as any).userId = "user-123";
			const { response } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, true);
		});
	});

	it("does not treat a JWT Bearer token as an API key", async () => {
		await withKeys("real-integration-key", async () => {
			const jwtLike = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig";
			const req = buildReq({ Authorization: `Bearer ${jwtLike}` });
			const { response, state } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, false);
			assert.equal(state.status, 401);
		});
	});

	it("matches keys among several configured entries with surrounding whitespace", async () => {
		await withKeys(" alpha , beta ,gamma", async () => {
			const req = buildReq({ "X-API-Key": "beta" });
			const { response } = buildRes();
			let nextCalled = false;
			requireIntegrationApiKey(req, response, () => {
				nextCalled = true;
			});
			assert.equal(nextCalled, true);
		});
	});
});
