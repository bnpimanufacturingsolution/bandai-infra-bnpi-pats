// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTimesheetAction } from "./useTimesheets";

const timesheetServiceMock = vi.hoisted(() => ({
	timesheetAction: vi.fn(),
}));

vi.mock("~/services/timesheet.service", () => ({
	default: timesheetServiceMock,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

function createWrapper(queryClient: QueryClient) {
	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe("useTimesheetAction", () => {
	beforeEach(() => {
		timesheetServiceMock.timesheetAction.mockReset();
	});

	it("invalidates employee and metrics caches alongside timesheets on approval", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
		timesheetServiceMock.timesheetAction.mockResolvedValueOnce({ id: "timesheet-1" });

		const { result } = renderHook(() => useTimesheetAction(), {
			wrapper: createWrapper(queryClient),
		});

		await act(() =>
			result.current.mutateAsync({ id: "timesheet-1", action: { action: "APPROVE" } as any }),
		);

		expect(timesheetServiceMock.timesheetAction).toHaveBeenCalledWith("timesheet-1", {
			action: "APPROVE",
		});
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
