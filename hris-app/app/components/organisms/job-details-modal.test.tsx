// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetailsModal } from "./job-details-modal";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

describe("JobDetailsModal", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
	});

	it("closes the modal before navigating to the public apply route", async () => {
		const events: string[] = [];
		const onClose = vi.fn(() => {
			events.push("close");
		});

		mockNavigate.mockImplementation(() => {
			events.push("navigate");
		});

		render(
			<JobDetailsModal
				isOpen
				onClose={onClose}
				job={{
					id: "job-1",
					positionId: "position-1",
					title: "QA Engineer",
					company: "Bandai Namco",
					time: "today",
					salary: "PHP 30,000 - PHP 50,000",
					tags: ["QA"],
					description: "Test our internal tools.",
					jobType: "FULL_TIME",
					location: "REMOTE",
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /apply now/i }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith("/jobs/job-1/apply");
		expect(events).toEqual(["close", "navigate"]);
	});

	it("only closes when the dialog actually dismisses", async () => {
		const onClose = vi.fn();

		render(
			<JobDetailsModal
				isOpen
				onClose={onClose}
				job={{
					id: "job-1",
					positionId: "position-1",
					title: "QA Engineer",
					company: "Bandai Namco",
					time: "today",
					salary: "PHP 30,000 - PHP 50,000",
					tags: ["QA"],
					description: "Test our internal tools.",
					jobType: "FULL_TIME",
					location: "REMOTE",
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(mockNavigate).not.toHaveBeenCalled();
	});
});
