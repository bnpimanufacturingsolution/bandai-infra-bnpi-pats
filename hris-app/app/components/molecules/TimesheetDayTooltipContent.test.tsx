// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimesheetDayTooltipContent } from "./TimesheetDayTooltipContent";
import type { TimesheetBreakdown } from "~/services/timesheet.service";

const manilaBusinessDay: TimesheetBreakdown = {
	approvalStatus: "DRAFT",
	date: "2026-06-08T00:00:00.000Z",
	timeIn: "2026-06-08T15:50:00.000Z",
	timeOut: "2026-06-08T15:53:00.000Z",
	hoursWorked: "0:03",
	regularHours: "0:00",
	overtimeHours: "0:03",
	undertimeHours: "0:00",
	lateHours: "22:30",
	earlyOutHours: "0:00",
	status: "PRESENT",
	employeeNotes: null,
	approverNotes: null,
};

describe("TimesheetDayTooltipContent overtime notes", () => {
	it("shows overtime approval and employee reasons when the day is actually approved", () => {
		render(
			<TimesheetDayTooltipContent
				day={{
					...manilaBusinessDay,
					approvalStatus: "APPROVED",
					approverNotes: "Approved for inventory closeout",
					employeeNotes: "Needed extra hour for handoff",
				}}
			/>,
		);

		expect(screen.getByText("Approval reason")).toBeInTheDocument();
		expect(screen.getByText("Approved for inventory closeout")).toBeInTheDocument();
		expect(screen.getByText("Employee note")).toBeInTheDocument();
		expect(screen.getByText("Needed extra hour for handoff")).toBeInTheDocument();
	});

	it("does not claim 'Approval reason' for a day with overtime that has not actually been approved", () => {
		render(
			<TimesheetDayTooltipContent
				day={{
					...manilaBusinessDay,
					approvalStatus: "SUBMITTED",
					approverNotes: "Pending review note",
					employeeNotes: null,
				}}
			/>,
		);

		expect(screen.queryByText("Approval reason")).not.toBeInTheDocument();
		expect(screen.getByText("Approver note")).toBeInTheDocument();
		expect(screen.getByText("Pending review note")).toBeInTheDocument();
	});

	it("falls back to a generic approver note label when there is no overtime", () => {
		render(
			<TimesheetDayTooltipContent
				day={{
					...manilaBusinessDay,
					overtimeHours: "0:00",
					approverNotes: "Excused late arrival",
					employeeNotes: null,
				}}
			/>,
		);

		expect(screen.getByText("Approver note")).toBeInTheDocument();
		expect(screen.getByText("Excused late arrival")).toBeInTheDocument();
		expect(screen.queryByText("Employee note")).not.toBeInTheDocument();
	});

	it("renders nothing extra when no notes are present", () => {
		render(<TimesheetDayTooltipContent day={manilaBusinessDay} />);

		expect(screen.queryByText("Approval reason")).not.toBeInTheDocument();
		expect(screen.queryByText("Approver note")).not.toBeInTheDocument();
		expect(screen.queryByText("Employee note")).not.toBeInTheDocument();
	});
});
