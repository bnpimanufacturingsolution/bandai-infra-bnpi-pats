// @vitest-environment jsdom
// Obligations evidence
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import TimesheetsTab from "./TimesheetsTab";
import { renderWithProviders } from "~/test/render";
import { useTimesheets } from "~/lib/hooks/useTimesheets";

vi.mock("~/components/molecules/EmployeeTableCell", () => ({
  EmployeeTableCell: () => <span>Employee</span>,
}));

// Mock auth (TimesheetViewModal calls useAuth unconditionally even when closed)
vi.mock("~/lib/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      metadata: {
        employee: { id: "test-emp" },
      },
    },
  }),
}));

// Mock all hooks from useTimesheets so we never execute real queries/mutations
vi.mock("~/lib/hooks/useTimesheets", () => ({
  useTimesheets: vi.fn(() => ({
    data: { timesheets: [], pagination: undefined },
    isLoading: false,
    error: null,
  })),
  useTimesheet: vi.fn(() => ({
    data: null,
    isLoading: false,
  })),
  useTimesheetAction: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useUpdateTimesheet: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useRequestTimesheetEditPermission: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useNormalizeTimesheetBreakdownPreview: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  })),
}));

describe("TimesheetsTab", () => {
  beforeEach(() => {
    vi.mocked(useTimesheets).mockReturnValue({
      data: { timesheets: [], pagination: undefined },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTimesheets>);
  });

  it("mounts", () => {
    const { container } = renderWithProviders(<TimesheetsTab />);
    expect(container).toBeTruthy();
    expect(screen.getByText("Timesheets")).toBeInTheDocument();
  });

  it("renders a dash for timesheets without a submitted date", () => {
    vi.mocked(useTimesheets).mockReturnValue({
      data: {
        timesheets: [
          {
            id: "ts-1",
            status: "DRAFT",
            submittedAt: null,
            totalHoursWorked: "0:00",
            totalRegularHours: "0:00",
            totalOvertimeHours: "0:00",
            employee: {
              id: "emp-1",
              employeeId: "E001",
              person: {
                personalInfo: { firstName: "Jane", lastName: "Doe" },
              },
            },
            payrollPeriod: {
              name: "June 2026",
              startDate: "2026-06-01",
              endDate: "2026-06-30",
            },
          },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTimesheets>);

    renderWithProviders(<TimesheetsTab />);

    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText(/â/)).not.toBeInTheDocument();
  });
});
