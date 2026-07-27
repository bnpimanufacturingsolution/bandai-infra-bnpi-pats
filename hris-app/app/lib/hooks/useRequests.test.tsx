// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApproveRequest } from "./useRequests";

const requestsServiceMock = vi.hoisted(() => ({
	approveRequest: vi.fn(),
}));

vi.mock("~/services/requests.service", () => ({
	default: requestsServiceMock,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

function createWrapper(queryClient: QueryClient) {
	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe("useApproveRequest", () => {
	beforeEach(() => {
		requestsServiceMock.approveRequest.mockReset();
	});

	it("invalidates employee and metrics caches alongside requests and timesheets on approval", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
		requestsServiceMock.approveRequest.mockResolvedValueOnce({ id: "request-1" });

		const { result } = renderHook(() => useApproveRequest(), {
			wrapper: createWrapper(queryClient),
		});

		await act(() =>
			result.current.mutateAsync({ id: "request-1", action: "approve", comment: "Approved" }),
		);

		expect(requestsServiceMock.approveRequest).toHaveBeenCalledWith(
			"request-1",
			"approve",
			"Approved",
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["requests"] }),
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["timesheets"] }),
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["employees"] }),
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["metrics"] }),
		);
	});
});
