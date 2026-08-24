// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("~/components/ui/calendar", () => ({
	Calendar: ({
		selected,
		onSelect,
	}: {
		selected?: Date[];
		onSelect?: (dates: Date[] | undefined) => void;
	}) => (
		<input
			aria-label="Selected dates"
			value={(selected || [])
				.map((date) => {
					const year = date.getFullYear();
					const month = String(date.getMonth() + 1).padStart(2, "0");
					const day = String(date.getDate()).padStart(2, "0");
					return `${year}-${month}-${day}`;
				})
				.join(",")}
			onChange={(event) => {
				const dates = event.target.value
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
					.map((value) => {
						const [year, month, day] = value.split("-").map(Number);
						return new Date(year, month - 1, day);
					});
				onSelect?.(dates);
			}}
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

	it("saves hours on multiple dates with a break and does not reset times when dates change", async () => {
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
		fireEvent.change(screen.getByLabelText("Date start"), { target: { value: "09:00" } });
		fireEvent.change(screen.getByLabelText("Date end"), { target: { value: "18:00" } });
		fireEvent.change(screen.getByLabelText("Selected dates"), {
			target: { value: "2026-08-21,2026-08-22" },
		});
		expect(screen.getByLabelText("Date start")).toHaveValue("09:00");
		expect(screen.getByLabelText("Date end")).toHaveValue("18:00");
		fireEvent.click(screen.getByRole("button", { name: /save hours/i }));

		await waitFor(() => expect(overrideMutateAsync).toHaveBeenCalledTimes(2));
		expect(mutateAsync).not.toHaveBeenCalled();
		expect(overrideMutateAsync.mock.calls.map((call) => call[0].date)).toEqual([
			"2026-08-21",
			"2026-08-22",
		]);
		expect(overrideMutateAsync.mock.calls[0][0].shiftSnapshot.timeSlots).toEqual([
			{ type: "work", label: "Morning Work", startTime: "09:00", endTime: "12:00" },
			{ type: "break", label: "Break", startTime: "12:00", endTime: "13:00" },
			{ type: "work", label: "Afternoon Work", startTime: "13:00", endTime: "18:00" },
		]);
	});
});
