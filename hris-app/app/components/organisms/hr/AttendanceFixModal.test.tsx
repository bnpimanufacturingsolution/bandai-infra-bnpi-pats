// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceFixModal } from "./AttendanceFixModal";

const mockCreateCorrection = vi.hoisted(() => vi.fn());
const mockCreateBackfill = vi.hoisted(() => vi.fn());
const mockCreateCorrectionState = vi.hoisted(() => ({ isPending: false }));
const mockCreateBackfillState = vi.hoisted(() => ({ isPending: false }));

vi.mock("~/lib/hooks/useAttendances", () => ({
	useCreateAttendanceCorrection: () => ({
		mutateAsync: mockCreateCorrection,
		isPending: mockCreateCorrectionState.isPending,
	}),
	useCreateAttendanceBackfill: () => ({
		mutateAsync: mockCreateBackfill,
		isPending: mockCreateBackfillState.isPending,
	}),
}));

describe("AttendanceFixModal", () => {
	beforeEach(() => {
		mockCreateCorrection.mockReset().mockResolvedValue(undefined);
		mockCreateBackfill.mockReset().mockResolvedValue(undefined);
		mockCreateCorrectionState.isPending = false;
		mockCreateBackfillState.isPending = false;
	});

	it("opens in backfill mode for missing attendance rows", () => {
		render(
			<AttendanceFixModal
				open
				onOpenChange={vi.fn()}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId={null}
			/>,
		);

		expect(screen.getByText("Fix Attendance — Create Missing Record")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save Missing Record" })).toBeInTheDocument();
	});

	it("opens in correction mode and prefills the original worked window", () => {
		render(
			<AttendanceFixModal
				open
				onOpenChange={vi.fn()}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId="attendance-1"
				originalStatus="PRESENT"
				originalTimeIn="08:00"
				originalTimeOut="17:00"
			/>,
		);

		expect(screen.getByText("Fix Attendance — Correct Attendance")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save Correction" })).toBeInTheDocument();
	});

	it("blocks submit and shows a validation error when the explanation is missing", () => {
		render(
			<AttendanceFixModal
				open
				onOpenChange={vi.fn()}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId={null}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Save Missing Record" }));

		expect(
			screen.getByText("Explanation is required for attendance corrections."),
		).toBeInTheDocument();
		expect(mockCreateBackfill).not.toHaveBeenCalled();
	});

	it("submits a backfill with the absent default status once justified", async () => {
		const onOpenChange = vi.fn();
		render(
			<AttendanceFixModal
				open
				onOpenChange={onOpenChange}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId={null}
			/>,
		);

		fireEvent.change(
			screen.getByPlaceholderText("e.g., Employee forgot to clock out after the client meeting..."),
			{ target: { value: "No badge swipe recorded for this day." } },
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Missing Record" }));

		await vi.waitFor(() => expect(mockCreateBackfill).toHaveBeenCalledTimes(1));
		expect(mockCreateBackfill).toHaveBeenCalledWith(
			expect.objectContaining({
				employeeId: "profile-1",
				correctionDate: "2026-06-25",
				status: "ABSENT",
				notes: "No badge swipe recorded for this day.",
			}),
		);
		await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("submits a correction with the existing attendanceId once justified", async () => {
		const onOpenChange = vi.fn();
		render(
			<AttendanceFixModal
				open
				onOpenChange={onOpenChange}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId="attendance-1"
				originalStatus="PRESENT"
				originalTimeIn="08:00"
				originalTimeOut="17:00"
			/>,
		);

		fireEvent.change(
			screen.getByPlaceholderText("e.g., Employee forgot to clock out after the client meeting..."),
			{ target: { value: "Employee forgot to clock out after the client meeting." } },
		);
		fireEvent.click(screen.getByRole("button", { name: "Save Correction" }));

		await vi.waitFor(() => expect(mockCreateCorrection).toHaveBeenCalledTimes(1));
		expect(mockCreateCorrection).toHaveBeenCalledWith(
			expect.objectContaining({
				attendanceId: "attendance-1",
				employeeId: "profile-1",
				correctionDate: "2026-06-25",
				status: "PRESENT",
				timeIn: "08:00",
				timeOut: "17:00",
			}),
		);
		await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
	});

	it("shows the locked-period exception instead of the edit form", () => {
		render(
			<AttendanceFixModal
				open
				onOpenChange={vi.fn()}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId="attendance-1"
				isLocked
			/>,
		);

		expect(screen.getByText("Payroll Locked")).toBeInTheDocument();
		expect(screen.getByText(/The employee must submit a Time Adjustment request/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Create Time Adjustment Request" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save Correction" })).not.toBeInTheDocument();
	});
	it("visually distinguishes INCOMPLETE from PRESENT using aria-pressed", () => {
		render(
			<AttendanceFixModal
				open
				onOpenChange={vi.fn()}
				employeeId="profile-1"
				employeeName="Amina Reyes"
				employeeCode="EMP-001"
				date="2026-06-25"
				attendanceId="attendance-1"
				originalStatus="PRESENT"
				originalTimeIn="08:00"
				originalTimeOut="17:00"
			/>,
		);

		const workDayBtn = screen.getByRole("button", { name: /Work Day/i });
		const incompleteBtn = screen.getByRole("button", { name: /Incomplete/i });

		expect(workDayBtn).toHaveAttribute("aria-pressed", "true");
		expect(incompleteBtn).toHaveAttribute("aria-pressed", "false");

		fireEvent.click(incompleteBtn);

		expect(workDayBtn).toHaveAttribute("aria-pressed", "false");
		expect(incompleteBtn).toHaveAttribute("aria-pressed", "true");
	});
});
