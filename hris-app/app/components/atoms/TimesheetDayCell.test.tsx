// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetDayCell } from "./TimesheetDayCell";

describe("TimesheetDayCell", () => {
	it("keeps punch details out of the compact day cell", () => {
		render(
			<TimesheetDayCell
				dayNumber={8}
				kind="hours"
				hoursLabel="0:00"
				timeInLabel="3:50 PM"
			/>,
		);

		expect(screen.getByText("8")).toBeInTheDocument();
		expect(screen.getByText("0:00")).toBeInTheDocument();
		expect(screen.queryByText("In")).not.toBeInTheDocument();
		expect(screen.queryByText("3:50 PM")).not.toBeInTheDocument();
		expect(screen.queryByText("Out")).not.toBeInTheDocument();
		expect(screen.queryByText("Not clocked out")).not.toBeInTheDocument();
	});
});
