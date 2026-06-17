import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hrisGetMock = vi.hoisted(() => vi.fn());
const hrisPostMock = vi.hoisted(() => vi.fn());
const hrisPatchMock = vi.hoisted(() => vi.fn());
const hrisDeleteMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		get: hrisGetMock,
		post: hrisPostMock,
		patch: hrisPatchMock,
		delete: hrisDeleteMock,
	},
}));

describe("requestsService workflow client contract", () => {
	beforeEach(() => {
		vi.resetModules();
		hrisGetMock.mockReset();
		hrisPostMock.mockReset();
		hrisPatchMock.mockReset();
		hrisDeleteMock.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("derives OPEN when a request has no workflow state", async () => {
		const { getRequestState } = await import("./requests.service");

		expect(getRequestState()).toBe("OPEN");
		expect(getRequestState({ currentWorkflowStateKey: "PENDING_HR_REVIEW" })).toBe(
			"PENDING_HR_REVIEW",
		);
	});

	it("creates requests through the workflow endpoint and unwraps nested API data", async () => {
		const { default: requestsService } = await import("./requests.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					id: "request-1",
					type: "LEAVE",
					currentWorkflowStateKey: "SUBMITTED",
				},
			},
		});
		const payload = {
			organizationId: "org-1",
			requesterId: "emp-1",
			type: "LEAVE" as const,
			description: "Vacation leave",
			metadata: { leaveTypeId: "annual" },
		};

		const result = await requestsService.createRequest(payload);

		expect(hrisPostMock).toHaveBeenCalledWith("/api/request", payload);
		expect(result).toMatchObject({
			id: "request-1",
			currentWorkflowStateKey: "SUBMITTED",
		});
	});

	it("preserves structured create errors for request form handling", async () => {
		const { default: requestsService } = await import("./requests.service");
		hrisPostMock.mockRejectedValueOnce({
			status: 422,
			data: {
				message: "Validation failed",
				errors: [{ field: "startDate", message: "Date is required" }],
			},
		});

		await expect(
			requestsService.createRequest({
				organizationId: "org-1",
				requesterId: "emp-1",
				type: "LEAVE",
				description: "Vacation leave",
			}),
		).rejects.toMatchObject({
			message: "Date is required",
			status: 422,
			errors: [{ field: "startDate", message: "Date is required" }],
		});
	});

	it("submits approve/reject decisions to the approval endpoint", async () => {
		const { default: requestsService } = await import("./requests.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					request: {
						id: "request-2",
						currentWorkflowStateKey: "APPROVED",
					},
				},
			},
		});

		const result = await requestsService.approveRequest(
			"request-2",
			"approve",
			"Approved by manager",
		);

		expect(hrisPostMock).toHaveBeenCalledWith("/api/request/request-2/approval", {
			action: "approve",
			comment: "Approved by manager",
		});
		expect(result).toMatchObject({
			id: "request-2",
			currentWorkflowStateKey: "APPROVED",
		});
	});

	it("delegates the active workflow step to a supervisor using explicit mode and reason", async () => {
		const { default: requestsService } = await import("./requests.service");
		hrisPostMock.mockResolvedValueOnce({
			data: {
				data: {
					requestId: "request-3",
					delegatedTo: "emp-manager-1",
					delegatedToName: "Manager One",
					mode: "TEMPORARY",
				},
			},
		});

		await requestsService.delegateStepToSupervisor(
			"request-3",
			"TEMPORARY",
			"Reviewer is away",
		);

		expect(hrisPostMock).toHaveBeenCalledWith("/api/request/request-3/delegate-step", {
			mode: "TEMPORARY",
			reason: "Reviewer is away",
		});
	});
});
