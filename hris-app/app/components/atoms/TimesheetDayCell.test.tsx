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

	it("renders absent cells with a subtle surface tint instead of a side border", () => {
		const { container } = render(
			<TimesheetDayCell dayNumber={15} kind="absent" />,
		);

		expect(screen.getByText("ABS")).toBeInTheDocument();
		const cell = container.firstChild as HTMLElement;
		expect(cell.className).toContain("bg-rose-50/50");
		expect(cell.className).not.toContain("border-l-2");
		expect(cell.className).not.toContain("border-red-500");
	});

	it("renders past days with a muted gray surface", () => {
		const { container } = render(
			<TimesheetDayCell dayNumber={6} kind="hours" hoursLabel="8:00" isPastDay />,
		);

		const cell = container.firstChild as HTMLElement;
		expect(cell.className).toContain("bg-gray-100");
	});

	it("renders past off days with only the off surface color", () => {
		const { container: futureOff } = render(
			<TimesheetDayCell dayNumber={12} kind="rest" />,
		);
		const { container: pastOff } = render(
			<TimesheetDayCell dayNumber={5} kind="rest" isPastDay />,
		);

		const futureClass = (futureOff.firstChild as HTMLElement).className;
		const pastClass = (pastOff.firstChild as HTMLElement).className;

		expect(futureClass).toContain("bg-gray-200");
		expect(pastClass).toContain("bg-gray-200");
		expect(pastClass).not.toContain("bg-gray-100");
		expect(pastClass).not.toContain("bg-gray-300");
	});

	it("does not render open shift text for pending days", () => {
		render(
			<TimesheetDayCell
				dayNumber={7}
				kind="pending"
				badges={[{ label: "NS", tone: "night" }]}
			/>,
		);

		expect(screen.queryByText("Open Shift")).not.toBeInTheDocument();
		expect(screen.queryByText("NS")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Night shift")).toBeInTheDocument();
	});

	it("styles filed OT (+OT ot-filed) in sky blue distinct from unfiled green", () => {
		render(
			<TimesheetDayCell
				dayNumber={20}
				kind="hours"
				hoursLabel="10:00"
				badges={[{ label: "+OT", tone: "ot-filed" }]}
			/>,
		);

		const badge = screen.getByText("+OT");
		expect(badge.className).toContain("text-sky-600");
		expect(badge.className).not.toContain("text-green-700");
	});
});
