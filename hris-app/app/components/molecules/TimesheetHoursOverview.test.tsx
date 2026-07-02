// @vitest-environment jsdom
// Obligations evidence
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetHoursOverview } from "./TimesheetHoursOverview";

describe("TimesheetHoursOverview", () => {
  it("renders", () => {
    render(<TimesheetHoursOverview hours={{ totalHoursWorked: "40:00" }} />);
    expect(screen.getByText("40h 0m")).toBeInTheDocument();
  });
});
