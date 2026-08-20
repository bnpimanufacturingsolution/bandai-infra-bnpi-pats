// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeWeeklyScheduleModal } from "./change-weekly-schedule-modal";

const mutateAsync = vi.fn();
const overrideMutateAsync = vi.fn();

vi.mock("~/lib/hooks", () => ({
	useCreateEmployeeSchedule: () => ({
		mutateAsync,
		isPending: false,
	}),
	useCreateScheduleOverride: () => ({
		mutateAsync: overrideMutateAsync,
		isPending: false,
	}),
}));

vi.mock("~/components/ui/calendar-date-picker", () => ({
	CalendarDatePicker: ({
		value,
		onChange,
	}: {
		value?: string;
		onChange: (value: string) => void;
	}) => (
		<input
			aria-label="Schedule date"
			type="date"
			value={value || ""}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

const employee = {
	id: "emp-zen",
	employeeId: "00010",
	embeddedSchedule: {
		cycleDays: 7,
		pattern: [
			{
				day: 1,
				shiftSnapshot: {
					isOff: false,
					timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
				},
			},
		],
	},
} as any;

describe("ChangeWeeklyScheduleModal", () => {
	beforeEach(() => {
		mutateAsync.mockReset();
		overrideMutateAsync.mockReset();
	});

	it("saves Monday 06:00-15:00 and Tuesday 07:00-16:00 as a weekly pattern", async () => {
		mutateAsync.mockResolvedValue({});
		render(
			<ChangeWeeklyScheduleModal
				open
				onOpenChange={vi.fn()}
				employee={employee}
				employeeName="Zen Andrei"
			/>,
		);

		fireEvent.change(screen.getByLabelText("Mon start"), { target: { value: "06:00" } });
		fireEvent.change(screen.getByLabelText("Mon end"), { target: { value: "15:00" } });
		fireEvent.change(screen.getByLabelText("Tue start"), { target: { value: "07:00" } });
		fireEvent.change(screen.getByLabelText("Tue end"), { target: { value: "16:00" } });

		fireEvent.click(screen.getByRole("button", { name: /save hours/i }));

		expect(mutateAsync).toHaveBeenCalledTimes(1);
		const payload = mutateAsync.mock.calls[0][0];
		expect(payload.employeeId).toBe("emp-zen");
		expect(payload.pattern[0].shiftSnapshot.timeSlots[0]).toEqual({
			type: "work",
			label: "Work",
			startTime: "06:00",
			endTime: "15:00",
		});
		expect(payload.pattern[1].shiftSnapshot.timeSlots[0]).toEqual({
			type: "work",
			label: "Work",
			startTime: "07:00",
			endTime: "16:00",
		});
		expect(overrideMutateAsync).not.toHaveBeenCalled();
	});

	it("saves one calendar date hours without changing the weekday pattern", async () => {
		overrideMutateAsync.mockResolvedValue({});
		render(
			<ChangeWeeklyScheduleModal
				open
				onOpenChange={vi.fn()}
				employee={{ ...employee, organizationId: "org-1" }}
				employeeName="Zen Andrei"
			/>,
		);

		fireEvent.click(screen.getByTestId("schedule-mode-dates"));
		fireEvent.change(screen.getByLabelText("Schedule date"), { target: { value: "2026-08-21" } });
		fireEvent.change(screen.getByLabelText("Date start"), { target: { value: "06:00" } });
		fireEvent.change(screen.getByLabelText("Date end"), { target: { value: "15:00" } });
		fireEvent.click(screen.getByRole("button", { name: /save hours/i }));

		expect(mutateAsync).not.toHaveBeenCalled();
		expect(overrideMutateAsync).toHaveBeenCalledTimes(1);
		expect(overrideMutateAsync.mock.calls[0][0]).toMatchObject({
			employeeId: "emp-zen",
			organizationId: "org-1",
			date: "2026-08-21",
			reason: "date_hours_override",
		});
		expect(overrideMutateAsync.mock.calls[0][0].shiftSnapshot.timeSlots[0]).toEqual({
			type: "work",
			label: "Work",
			startTime: "06:00",
			endTime: "15:00",
		});
	});
});
