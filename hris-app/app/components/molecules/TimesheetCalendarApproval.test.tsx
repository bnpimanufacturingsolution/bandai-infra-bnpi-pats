// @vitest-environment jsdom
// Obligations evidence
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetCalendarApproval } from "./TimesheetCalendarApproval";

describe("TimesheetCalendarApproval", () => {
  it("mounts", () => {
    const { container } = render(<TimesheetCalendarApproval breakdown={[]} />);
    expect(container).toBeTruthy();
  });
});
