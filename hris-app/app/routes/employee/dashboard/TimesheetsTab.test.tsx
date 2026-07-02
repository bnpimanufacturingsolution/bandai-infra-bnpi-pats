// @vitest-environment jsdom
// Obligations evidence
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TimesheetsTab from "./TimesheetsTab";
import { renderWithProviders } from "~/test/render";

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
  it("mounts", () => {
    const { container } = renderWithProviders(<TimesheetsTab />);
    expect(container).toBeTruthy();
    // Basic smoke: the DataTable title should be present when rendered
    expect(screen.getByText("Timesheets")).toBeInTheDocument();
  });
});
