// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetDayCell } from "./TimesheetDayCell";

describe("TimesheetDayCell", () => {
	it("renders clock-in evidence and missing clock-out text directly in the cell", () => {
		render(
			<TimesheetDayCell
				dayNumber={8}
				kind="hours"
				hoursLabel="0:00"
				timeInLabel="3:50 PM"
			/>,
		);

		expect(screen.getByText("In")).toBeInTheDocument();
		expect(screen.getByText("3:50 PM")).toBeInTheDocument();
		expect(screen.getByText("Out")).toBeInTheDocument();
		expect(screen.getByText("Not clocked out")).toBeInTheDocument();
	});
});
