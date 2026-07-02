// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	useApproveWeeklyAttendance,
	useTeamAttendance,
} from "./useTeamAttendance";

const attendanceServiceMock = vi.hoisted(() => ({
	getTeamWeeklyAttendance: vi.fn(),
	approveWeeklyAttendance: vi.fn(),
	rejectWeeklyAttendance: vi.fn(),
	approveAttendanceRecord: vi.fn(),
	rejectAttendanceRecord: vi.fn(),
}));

vi.mock("~/services/attendance.service", () => ({
	attendanceService: attendanceServiceMock,
}));

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return function Wrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe("useTeamAttendance", () => {
	beforeEach(() => {
		Object.values(attendanceServiceMock).forEach((mock) => mock.mockReset());
	});

	it("returns the weekly attendance array already unwrapped by the service", async () => {
		const weeklyAttendance = [
			{
				employeeId: "employee-1",
				weekStartDate: "2026-06-08",
				weekEndDate: "2026-06-14",
				approvalStatus: "pending",
			},
		];
		attendanceServiceMock.getTeamWeeklyAttendance.mockResolvedValueOnce(weeklyAttendance);

		const { result } = renderHook(
			() => useTeamAttendance("manager-1", "2026-06-08", "2026-06-14"),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(attendanceServiceMock.getTeamWeeklyAttendance).toHaveBeenCalledWith({
			managerId: "manager-1",
			weekStartDate: "2026-06-08",
			weekEndDate: "2026-06-14",
		});
		expect(result.current.data).toBe(weeklyAttendance);
	});
});

describe("team attendance mutations", () => {
	beforeEach(() => {
		Object.values(attendanceServiceMock).forEach((mock) => mock.mockReset());
	});

	it("returns approval payloads already unwrapped by the service", async () => {
		const approvalPayload = { id: "approval-1", status: "approved" };
		attendanceServiceMock.approveWeeklyAttendance.mockResolvedValueOnce(approvalPayload);

		const { result } = renderHook(() => useApproveWeeklyAttendance(), {
			wrapper: createWrapper(),
		});

		const mutationResult = await act(() =>
			result.current.mutateAsync({
				employeeId: "employee-1",
				weekStartDate: "2026-06-08",
				weekEndDate: "2026-06-14",
				notes: "Approved",
			}),
		);

		expect(attendanceServiceMock.approveWeeklyAttendance).toHaveBeenCalledWith(
			"employee-1",
			"2026-06-08",
			"2026-06-14",
			"Approved",
		);
		expect(mutationResult).toBe(approvalPayload);
	});
});
