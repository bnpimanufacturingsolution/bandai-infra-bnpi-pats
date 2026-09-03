import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});

describe("ApiClient", () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("serializes GET query parameters and includes credentials", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));
		const client = new ApiClient("http://localhost:3001/api");

		await client.get("/employee", {
			page: 2,
			limit: 20,
			query: "Ada",
			pagination: true,
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:3001/api/employee?page=2&limit=20&query=Ada&pagination=true",
			expect.objectContaining({
				method: "GET",
				credentials: "include",
				headers: expect.objectContaining({ "Content-Type": "application/json" }),
			}),
		);
	});

	it("avoids duplicate API prefixes in endpoints", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
		const client = new ApiClient("http://localhost:3001/api");

		await client.post("/api/metrics", { model: "Attendance" });

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:3001/api/metrics",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("stringifies JSON POST bodies", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
		const client = new ApiClient("http://localhost:3001/api");

		await client.post("/auth/login", { email: "hr@example.test" });

		expect(fetchMock).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: JSON.stringify({ email: "hr@example.test" }),
				headers: expect.objectContaining({ "Content-Type": "application/json" }),
			}),
		);
	});

	it("does not force Content-Type for FormData bodies", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
		const client = new ApiClient("http://localhost:3001/api");
		const formData = new FormData();
		formData.append("file", new Blob(["test"]), "test.csv");

		await client.post("/employee/import", formData);

		expect(fetchMock).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: formData,
				headers: expect.not.objectContaining({ "Content-Type": "application/json" }),
			}),
		);
	});

	it("throws structured API errors from non-2xx JSON responses", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(
				{ message: "Forbidden", error: "FORBIDDEN" },
				{ status: 403, statusText: "Forbidden" },
			),
		);
		const client = new ApiClient("http://localhost:3001/api");

		await expect(client.get("/secure")).rejects.toMatchObject({
			status: 403,
			message: "Forbidden",
			error: "FORBIDDEN",
		});
	});

	it("normalizes network failures into API client errors", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		const client = new ApiClient("http://localhost:3001/api");

		await expect(client.get("/status")).rejects.toMatchObject({
			status: 0,
			error: "NETWORK_ERROR",
		});
	});
});
