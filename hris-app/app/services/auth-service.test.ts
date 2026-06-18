import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.hoisted(() => vi.fn());
const apiPatchMock = vi.hoisted(() => vi.fn());
const hrisGetMock = vi.hoisted(() => vi.fn());
const runtimeApiBaseMock = vi.hoisted(() => vi.fn());

vi.mock("~/lib/api-client", () => ({
	apiClient: {
		post: apiPostMock,
		patch: apiPatchMock,
	},
	hrisApiClient: {
		get: hrisGetMock,
	},
}));

vi.mock("~/lib/runtime-api-base", () => ({
	getRuntimeApiBase: runtimeApiBaseMock,
}));

describe("authService client contract", () => {
	beforeEach(() => {
		vi.resetModules();
		apiPostMock.mockReset();
		apiPatchMock.mockReset();
		hrisGetMock.mockReset();
		runtimeApiBaseMock.mockReset();
		runtimeApiBaseMock.mockReturnValue("/api");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("posts login credentials to the app auth endpoint and returns the user payload", async () => {
		const { default: authService } = await import("./auth-service");
		const user = {
			id: "user-1",
			email: "hr@example.test",
			role: "hris-hr-manager",
		};
		apiPostMock.mockResolvedValueOnce({ data: user });

		const result = await authService.login({
			email: "hr@example.test",
			password: "secret",
		});

		expect(apiPostMock).toHaveBeenCalledWith("/auth/login", {
			email: "hr@example.test",
			password: "secret",
		});
		expect(result).toBe(user);
	});

	it("uses /auth/me when the runtime API base already ends with /api", async () => {
		runtimeApiBaseMock.mockReturnValue("https://api.example.test/api");
		const { default: authService } = await import("./auth-service");
		hrisGetMock.mockResolvedValueOnce({
			data: {
				id: "user-2",
				email: "employee@example.test",
				role: "hris-employee",
				organization: { id: "org-1" },
			},
		});

		const user = await authService.getCurrentUser();

		expect(hrisGetMock).toHaveBeenCalledWith("/auth/me");
		expect(user.organizationId).toBe("org-1");
	});

	it("falls back across auth/me endpoint shapes when HRIS base URLs differ", async () => {
		runtimeApiBaseMock.mockReturnValue("https://api.example.test");
		const { default: authService } = await import("./auth-service");
		hrisGetMock
			.mockRejectedValueOnce({ status: 404, message: "Not found" })
			.mockResolvedValueOnce({
				data: {
					id: "user-3",
					email: "manager@example.test",
					role: "hris-employee-manager",
				},
			});

		await authService.getCurrentUser();

		expect(hrisGetMock).toHaveBeenNthCalledWith(1, "/api/auth/me");
		expect(hrisGetMock).toHaveBeenNthCalledWith(2, "/auth/me");
	});

	it("sends password changes to the app auth update endpoint", async () => {
		const { default: authService } = await import("./auth-service");
		apiPatchMock.mockResolvedValueOnce({ data: { ok: true } });

		await authService.updatePassword({
			currentPassword: "old",
			newPassword: "new",
		});

		expect(apiPatchMock).toHaveBeenCalledWith("/auth/update-password", {
			currentPassword: "old",
			newPassword: "new",
		});
	});
});
