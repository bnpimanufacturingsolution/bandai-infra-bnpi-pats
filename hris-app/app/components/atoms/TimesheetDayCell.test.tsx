// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetDayCell } from "./TimesheetDayCell";

describe("TimesheetDayCell", () => {
	it("renders a hours day cell (In/Out details moved to hover tooltip)", () => {
		render(
			<TimesheetDayCell
				dayNumber={8}
				kind="hours"
				hoursLabel="1:23"
			/>,
		);

		expect(screen.getByText("1:23")).toBeInTheDocument();
	});
});
