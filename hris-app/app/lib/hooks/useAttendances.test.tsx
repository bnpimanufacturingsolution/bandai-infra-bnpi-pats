// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateAttendanceBackfill } from "./useAttendances";

const attendanceServiceMock = vi.hoisted(() => ({
	createAttendanceBackfill: vi.fn(),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("~/services/attendance.service", () => ({
	default: attendanceServiceMock,
	attendanceService: attendanceServiceMock,
}));

vi.mock("sonner", () => ({
	toast: {
		error: toastErrorMock,
	},
}));

function createWrapper(queryClient: QueryClient) {
	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe("useCreateAttendanceBackfill", () => {
	beforeEach(() => {
		attendanceServiceMock.createAttendanceBackfill.mockReset();
		toastErrorMock.mockReset();
	});

	it("creates backfills through the attendance service and invalidates attendance queries", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
		attendanceServiceMock.createAttendanceBackfill.mockResolvedValueOnce({
			id: "attendance-backfill-1",
		});

		const { result } = renderHook(() => useCreateAttendanceBackfill(), {
			wrapper: createWrapper(queryClient),
		});

		const mutationResult = await act(() =>
			result.current.mutateAsync({
				employeeId: "employee-1",
				correctionDate: "2026-06-25",
				status: "PRESENT",
				timeIn: "08:00",
				timeOut: "17:00",
				reasonCategory: "MISSED_PUNCH",
				notes: "Created missing attendance",
			}),
		);

		expect(attendanceServiceMock.createAttendanceBackfill).toHaveBeenCalledWith({
			employeeId: "employee-1",
			correctionDate: "2026-06-25",
			status: "PRESENT",
			timeIn: "08:00",
			timeOut: "17:00",
			reasonCategory: "MISSED_PUNCH",
			notes: "Created missing attendance",
		});
		expect(mutationResult).toEqual({ id: "attendance-backfill-1" });
		expect(invalidateQueriesSpy).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["attendances"] }),
		);
	});

	it("surfaces backfill errors through the shared toast channel", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		attendanceServiceMock.createAttendanceBackfill.mockRejectedValueOnce({
			message: "Attendance already exists",
		});

		const { result } = renderHook(() => useCreateAttendanceBackfill(), {
			wrapper: createWrapper(queryClient),
		});

		await expect(
			act(() =>
				result.current.mutateAsync({
					employeeId: "employee-1",
					correctionDate: "2026-06-25",
					status: "PRESENT",
					reasonCategory: "MISSED_PUNCH",
					notes: "Created missing attendance",
				}),
			),
		).rejects.toMatchObject({ message: "Attendance already exists" });

		expect(toastErrorMock).toHaveBeenCalledWith("Attendance already exists");
	});
});
