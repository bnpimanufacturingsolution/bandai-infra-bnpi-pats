// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimesheetCalendar } from "./TimesheetCalendar";
import { TimesheetDayTooltipContent } from "./TimesheetDayTooltipContent";
import type { TimesheetBreakdown } from "~/services/timesheet.service";

const clockedZeroHourDay: TimesheetBreakdown = {
	approvalStatus: "DRAFT",
	date: "2026-06-08T00:00:00.000Z",
	timeIn: "2026-06-08T15:41:00.000Z",
	timeOut: "2026-06-08T15:47:00.000Z",
	hoursWorked: "0:00",
	regularHours: "0:00",
	overtimeHours: "0:06",
	undertimeHours: "0:00",
	lateHours: "7:30",
	earlyOutHours: "0:00",
	status: "NOT_CLOCKED_IN",
	employeeNotes: null,
	approverNotes: null,
};

const manilaBusinessDayFromUtcTimestamp: TimesheetBreakdown = {
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

const manilaBusinessDayFromUtcOffsetTimestamp: TimesheetBreakdown = {
	...manilaBusinessDayFromUtcTimestamp,
	date: "2026-06-07T16:00:00.000Z",
	metadata: {
		businessDate: "2026-06-08",
	},
};

const openClockDay: TimesheetBreakdown = {
	...manilaBusinessDayFromUtcTimestamp,
	timeIn: "2026-06-08T15:50:00.000Z",
	timeOut: null,
	hoursWorked: "0:00",
	overtimeHours: "0:00",
	lateHours: "0:00",
	status: "INCOMPLETE",
};

const futureScheduledDay: TimesheetBreakdown & { businessDate: string } = {
	approvalStatus: "DRAFT",
	date: "2026-06-10T00:00:00.000Z",
	businessDate: "2026-06-10",
	timeIn: null,
	timeOut: null,
	hoursWorked: "0:00",
	regularHours: "0:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
	status: "SCHEDULED",
	employeeNotes: null,
	approverNotes: null,
};

afterEach(() => {
	vi.useRealTimers();
});

describe("TimesheetCalendar", () => {
	it("does not mark zero-hour days with clock evidence as open shifts", () => {
		render(
			<TimesheetCalendar
				breakdown={[clockedZeroHourDay]}
				payrollPeriodStartDate="2026-06-08"
				payrollPeriodEndDate="2026-06-08"
			/>,
		);

		expect(screen.queryByText("Open Shift")).not.toBeInTheDocument();
		expect(screen.getAllByText("0h 0m").length).toBeGreaterThan(0);
	});

	it("renders UTC timestamps by Manila business date instead of browser timezone", () => {
		render(
			<TimesheetCalendar
				breakdown={[manilaBusinessDayFromUtcTimestamp]}
				payrollPeriodStartDate="2026-06-08"
				payrollPeriodEndDate="2026-06-08"
			/>,
		);

		expect(screen.getByText("Jun 8 - Jun 8")).toBeInTheDocument();
		expect(screen.getByText("8")).toBeInTheDocument();
		expect(screen.queryByText("7")).not.toBeInTheDocument();
	});

	it("prefers explicit businessDate metadata when the timestamp is stored at UTC offset", () => {
		render(
			<TimesheetCalendar
				breakdown={[manilaBusinessDayFromUtcOffsetTimestamp]}
				payrollPeriodStartDate="2026-06-08"
				payrollPeriodEndDate="2026-06-08"
			/>,
		);

		expect(screen.getByText("Jun 8 - Jun 8")).toBeInTheDocument();
		expect(screen.getByText("8")).toBeInTheDocument();
		expect(screen.queryByText("7")).not.toBeInTheDocument();
	});

	it("does not mark open clock evidence as an open shift in the day cell", () => {
		render(
			<TimesheetCalendar
				breakdown={[openClockDay]}
				payrollPeriodStartDate="2026-06-08"
				payrollPeriodEndDate="2026-06-08"
			/>,
		);

		expect(screen.queryByText("Open Shift")).not.toBeInTheDocument();
		expect(screen.getAllByText("0h 0m").length).toBeGreaterThan(0);
	});

	it("shows future scheduled zero-hour days as open shifts", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-09T12:00:00+08:00"));

		render(
			<TimesheetCalendar
				breakdown={[futureScheduledDay]}
				payrollPeriodStartDate="2026-06-10"
				payrollPeriodEndDate="2026-06-10"
			/>,
		);

		expect(screen.getByText("Open Shift")).toBeInTheDocument();
		expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
	});
});

describe("TimesheetDayTooltipContent", () => {
	it("shows recorded time detail instead of open shift when either clock field exists", () => {
		render(<TimesheetDayTooltipContent day={clockedZeroHourDay} />);

		expect(screen.queryByText("Open Shift")).not.toBeInTheDocument();
		expect(screen.getByText("Regular")).toBeInTheDocument();
		expect(screen.getByText("Overtime")).toBeInTheDocument();
	});

	it("uses metadata businessDate for late Manila clock records", () => {
		render(
			<TimesheetDayTooltipContent
				day={{
					...manilaBusinessDayFromUtcOffsetTimestamp,
					metadata: {
						businessDate: "2026-06-08",
					},
				}}
			/>,
		);

		expect(screen.getByText("Mon, Jun 8")).toBeInTheDocument();
		expect(screen.queryByText("Sun, Jun 7")).not.toBeInTheDocument();
	});

	it("shows time-in evidence when clock-out is still missing", () => {
		render(<TimesheetDayTooltipContent day={openClockDay} />);

		expect(screen.getByText("Time In")).toBeInTheDocument();
		expect(screen.getByText("Time Out")).toBeInTheDocument();
		expect(screen.getByText("Not clocked out")).toBeInTheDocument();
	});

	it("shows future scheduled zero-hour tooltip state as open shift", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-09T12:00:00+08:00"));

		render(<TimesheetDayTooltipContent day={futureScheduledDay} />);

		expect(screen.getByText("Open Shift")).toBeInTheDocument();
		expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
	});
});
