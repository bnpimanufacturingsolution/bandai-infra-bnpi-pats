// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTimesheet, useTimesheetAction, useEnsureAutoApprovedTimesheets } from "./useTimesheets";

const useQueryMock = vi.hoisted(() => vi.fn());
const timesheetServiceMock = vi.hoisted(() => ({
	timesheetAction: vi.fn(),
	clearQueryParams: vi.fn(),
	select: vi.fn(),
	getTimesheetById: vi.fn(),
	ensureAutoApprovedTimesheets: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
		"@tanstack/react-query",
	);
	return {
		...actual,
		useQuery: (...args: unknown[]) => useQueryMock(...args),
	};
});

vi.mock("~/services/timesheet.service", () => ({
	default: {
		timesheetAction: timesheetServiceMock.timesheetAction,
		clearQueryParams: timesheetServiceMock.clearQueryParams,
		ensureAutoApprovedTimesheets: timesheetServiceMock.ensureAutoApprovedTimesheets,
	},
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
		useQueryMock.mockReset();
		timesheetServiceMock.timesheetAction.mockReset();
		timesheetServiceMock.clearQueryParams.mockReset();
		timesheetServiceMock.select.mockReset();
		timesheetServiceMock.getTimesheetById.mockReset();
		timesheetServiceMock.clearQueryParams.mockReturnValue({
			select: timesheetServiceMock.select,
		});
		timesheetServiceMock.select.mockReturnValue({
			getTimesheetById: timesheetServiceMock.getTimesheetById,
		});
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

describe("useTimesheet", () => {
	it("requests effective timesheet lines in the detail field selection", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		useQueryMock.mockImplementation((options: any) => {
			void options.queryFn();
			return {
				data: undefined,
				error: null,
				isLoading: false,
				isFetching: false,
				refetch: vi.fn(),
			} as any;
		});
		timesheetServiceMock.getTimesheetById.mockResolvedValueOnce({ id: "timesheet-1" });

		renderHook(() => useTimesheet("timesheet-1"), {
			wrapper: createWrapper(queryClient),
		});

		expect(timesheetServiceMock.getTimesheetById).toHaveBeenCalledWith("timesheet-1");
		expect(timesheetServiceMock.select).toHaveBeenCalledWith(
			expect.arrayContaining(["timesheetlines.isEffective"]),
		);
	});
});

describe("useEnsureAutoApprovedTimesheets", () => {
	beforeEach(() => {
		timesheetServiceMock.ensureAutoApprovedTimesheets.mockReset();
	});

	it("generates auto-approved timesheets and invalidates timesheet caches", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
		timesheetServiceMock.ensureAutoApprovedTimesheets.mockResolvedValueOnce({
			payrollPeriodId: "period-1",
			eligibleEmployees: 3,
			created: 1,
			autoApproved: 2,
			refreshedLines: 20,
			preservedManual: 0,
			skippedLocked: 0,
			skippedPaid: 0,
			remainingToPrepare: 0,
			createLimit: 500,
			errors: [],
		});

		const { result } = renderHook(() => useEnsureAutoApprovedTimesheets(), {
			wrapper: createWrapper(queryClient),
		});

		await act(() =>
			result.current.mutateAsync({ payrollPeriodId: "period-1", createLimit: 500 }),
		);

		expect(timesheetServiceMock.ensureAutoApprovedTimesheets).toHaveBeenCalledWith(
			"period-1",
			{ createLimit: 500 },
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["timesheets"] }),
		);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["timesheetlines"] }),
		);
	});
});
