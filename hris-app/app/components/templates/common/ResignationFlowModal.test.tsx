// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResignationFlowModal } from "./ResignationFlowModal";

const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock("~/lib/hooks/useRequests", () => ({
	useCreateRequest: () => ({
		mutateAsync: mockMutateAsync,
		isPending: false,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		success: mockToastSuccess,
		error: mockToastError,
	},
}));

vi.mock("~/components/ui/calendar-date-picker", () => ({
	CalendarDatePicker: ({
		value,
		onChange,
		placeholder,
	}: {
		value?: string;
		onChange: (value: string) => void;
		placeholder?: string;
	}) => (
		<input
			aria-label="Last Working Day"
			placeholder={placeholder}
			value={value || ""}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
}));

describe("ResignationFlowModal", () => {
	beforeEach(() => {
		mockMutateAsync.mockReset();
		mockToastSuccess.mockReset();
		mockToastError.mockReset();
		mockMutateAsync.mockResolvedValue(undefined);
	});

	it("submits the employee requester payload through the create request path", async () => {
		const onClose = vi.fn();

		render(
			<ResignationFlowModal
				isOpen
				onClose={onClose}
				employeeId="emp-001"
				organizationId="org-1"
			/>,
		);

		expect(screen.getByText("We're sorry to see you go")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "I understand, continue" }));
		fireEvent.click(screen.getByRole("button", { name: "Better Opportunity" }));
		fireEvent.change(screen.getByPlaceholderText("Please share more details about your decision..."), {
			target: { value: "Found a better long-term fit." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Next Step" }));

		fireEvent.change(screen.getByLabelText("Last Working Day"), {
			target: { value: "2026-07-25" },
		});
		fireEvent.change(
			screen.getByPlaceholderText("Any other details regarding your departure date or handover..."),
			{
				target: { value: "Will complete the handover before leaving." },
			},
		);
		fireEvent.click(screen.getByRole("button", { name: "Review Request" }));

		expect(screen.getByText("Review & Submit")).toBeInTheDocument();
		expect(screen.getByText("Reason Category")).toBeInTheDocument();
		expect(screen.getByText("BETTER OPPORTUNITY")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Submit Resignation" }));

		await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
		expect(mockMutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				requesterId: "emp-001",
				type: "RESIGNATION",
				description: "Voluntary resignation - BETTER OPPORTUNITY",
				metadata: expect.objectContaining({
					reasonCategory: "BETTER_OPPORTUNITY",
					reasonDetails: "Found a better long-term fit.",
					additionalComments: "Will complete the handover before leaving.",
					lastWorkingDay: "2026-07-25",
					noticePeriodDays: 30,
				}),
			}),
		);
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(mockToastSuccess).toHaveBeenCalledWith("Resignation request submitted successfully");
		expect(mockToastError).not.toHaveBeenCalled();
	});
});
