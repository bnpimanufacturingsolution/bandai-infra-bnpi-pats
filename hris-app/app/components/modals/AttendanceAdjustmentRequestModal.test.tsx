// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttendanceAdjustmentRequestModal } from "./AttendanceAdjustmentRequestModal";

const onBehalfOptions = [
	{ id: "emp-leader", label: "Myself", isSelf: true },
	{ id: "emp-member-a", label: "Danica Ebreo (00062)", isSelf: false },
	{ id: "emp-member-b", label: "Zen Andrei (00010)", isSelf: false },
];

describe("AttendanceAdjustmentRequestModal (line-leader timesheet adjustment, 2026-09-09)", () => {
	it("shows the For whom picker on the ATTENDANCE_ADJUSTMENT branch when on-behalf options are provided", () => {
		render(
			<AttendanceAdjustmentRequestModal
				isOpen
				onClose={() => {}}
				onSubmit={vi.fn()}
				initialRequestKind="ATTENDANCE_ADJUSTMENT"
				onBehalfOptions={onBehalfOptions}
			/>,
		);
		expect(screen.getByText("For whom")).toBeTruthy();
		expect(screen.getByText("Myself (you)")).toBeTruthy();
	});

	it("lays the self-filed adjustment chain out on the right approval-flow panel by default", () => {
		render(
			<AttendanceAdjustmentRequestModal
				isOpen
				onClose={() => {}}
				onSubmit={vi.fn()}
				initialRequestKind="ATTENDANCE_ADJUSTMENT"
				onBehalfOptions={onBehalfOptions}
			/>,
		);
		const panel = screen.getByTestId("approval-flow-panel");
		// Default selection is the leader themself → self chain (supervisor → HR).
		expect(panel.textContent).toContain("Your submission");
		expect(panel.textContent).toContain("Manager approval");
		expect(panel.textContent).toContain("HR review");
		expect(panel.textContent).toContain("Applied to your attendance");
		expect(panel.textContent).toContain(
			"Nothing is applied until every approval step above is done.",
		);
	});

	it("renders the right approval-flow panel for overtime too and keeps the chain honest per kind", () => {
		render(
			<AttendanceAdjustmentRequestModal
				isOpen
				onClose={() => {}}
				onSubmit={vi.fn()}
				initialRequestKind="OVERTIME"
				onBehalfOptions={onBehalfOptions}
			/>,
		);
		const panel = screen.getByTestId("approval-flow-panel");
		expect(panel.textContent).toContain("HR approval");
		expect(panel.textContent).toContain("Applied to your timesheet");
	});

	it("does not render the For whom picker for plain employees (no on-behalf options)", () => {
		render(
			<AttendanceAdjustmentRequestModal
				isOpen
				onClose={() => {}}
				onSubmit={vi.fn()}
				initialRequestKind="ATTENDANCE_ADJUSTMENT"
			/>,
		);
		expect(screen.queryByText("For whom")).toBeNull();
		const panel = screen.getByTestId("approval-flow-panel");
		expect(panel.textContent).toContain("Your submission");
	});
});
