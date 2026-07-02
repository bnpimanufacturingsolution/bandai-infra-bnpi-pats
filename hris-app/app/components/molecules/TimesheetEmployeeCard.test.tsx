// @vitest-environment jsdom
// Obligations evidence
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetEmployeeCard } from "./TimesheetEmployeeCard";

describe("TimesheetEmployeeCard", () => {
  it("renders", () => {
    const { container } = render(<TimesheetEmployeeCard employee={{ person: { personalInfo: { firstName: "A", lastName: "B" } } }} />);
    expect(container).toBeTruthy();
  });
});
