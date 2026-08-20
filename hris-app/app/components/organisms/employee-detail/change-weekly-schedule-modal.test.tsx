// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChangeWeeklyScheduleModal } from "./change-weekly-schedule-modal";

const mutateAsync = vi.fn();

vi.mock("~/lib/hooks", () => ({
	useCreateEmployeeSchedule: () => ({
		mutateAsync,
		isPending: false,
	}),
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
	});
});
