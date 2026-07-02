// @vitest-environment jsdom

import React, { type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAttendanceDailyTrendByDepartment } from "./useMetrics";

const metricsServiceMock = vi.hoisted(() => ({
	getAttendanceDailyTrendByDepartment: vi.fn(),
}));

vi.mock("~/services/metrics.service", () => ({
	default: metricsServiceMock,
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

describe("useAttendanceDailyTrendByDepartment", () => {
	beforeEach(() => {
		metricsServiceMock.getAttendanceDailyTrendByDepartment.mockReset();
	});

	it("requests attendance daily trend metrics with the selected filters", async () => {
		metricsServiceMock.getAttendanceDailyTrendByDepartment.mockResolvedValueOnce({
			metrics: {
				attendanceDailyTrendByDepartment: {
					startDate: "2026-06-01T00:00:00.000Z",
					endDate: "2026-06-03T23:59:59.999Z",
					totalDays: 3,
					totalRecords: 8,
					departments: [],
					series: [],
				},
			},
		});

		const { result } = renderHook(
			() =>
				useAttendanceDailyTrendByDepartment(
					"2026-06-01",
					"2026-06-03",
					"Amina",
					"PRESENT",
					"dept-ops",
					"mgr-1",
					"emp-1",
					"DAY",
				),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(metricsServiceMock.getAttendanceDailyTrendByDepartment).toHaveBeenCalledWith(
			"2026-06-01",
			"2026-06-03",
			"Amina",
			"PRESENT",
			"dept-ops",
			"mgr-1",
			"emp-1",
			"DAY",
		);
		expect(result.current.data?.metrics.attendanceDailyTrendByDepartment.totalRecords).toBe(8);
	});
});
