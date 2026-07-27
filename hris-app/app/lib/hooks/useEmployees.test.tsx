// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEmployees } from "./useEmployees";

const employeesServiceMock = vi.hoisted(() => {
	const chain: any = {};

	chain.clearQueryParams = vi.fn(() => chain);
	chain.select = vi.fn(() => chain);
	chain.search = vi.fn(() => chain);
	chain.paginate = vi.fn(() => chain);
	chain.sort = vi.fn(() => chain);
	chain.setParams = vi.fn(() => chain);
	chain.getEmployees = vi.fn();

	return chain;
});

vi.mock("~/services/employees.service", () => ({
	default: employeesServiceMock,
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe("useEmployees", () => {
	beforeEach(() => {
		(Object.values(employeesServiceMock) as Array<{ mockReset?: () => void }>).forEach(
			(mock) => {
			if (typeof mock?.mockReset === "function") {
				mock.mockReset();
			}
			},
		);

		employeesServiceMock.clearQueryParams.mockImplementation(() => employeesServiceMock);
		employeesServiceMock.select.mockImplementation(() => employeesServiceMock);
		employeesServiceMock.search.mockImplementation(() => employeesServiceMock);
		employeesServiceMock.paginate.mockImplementation(() => employeesServiceMock);
		employeesServiceMock.sort.mockImplementation(() => employeesServiceMock);
		employeesServiceMock.setParams.mockImplementation(() => employeesServiceMock);
	});

	it("requests only valid employee roster fields", async () => {
		employeesServiceMock.getEmployees.mockResolvedValueOnce({
			employees: [],
			pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
		});

		const { result } = renderHook(() => useEmployees({ page: 1, limit: 10 }), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(employeesServiceMock.select).toHaveBeenCalledWith(
			expect.arrayContaining(["id", "role", "userId", "person.personalInfo"]),
		);
		expect(employeesServiceMock.select.mock.calls[0][0]).not.toContain("user.avatar");
		expect(employeesServiceMock.getEmployees).toHaveBeenCalledWith(true);
	});
});
