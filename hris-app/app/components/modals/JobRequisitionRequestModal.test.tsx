// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { JobRequisitionRequestModal } from "./JobRequisitionRequestModal";
import type { WorkforceRecruitmentRequestContext } from "~/services/workforce-recruitment-settings.service";

const mockUsePositions = vi.fn();
const mockUseLevels = vi.fn();
const mockUseWorkforceRecruitmentRequestContext = vi.fn();

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: (...args: unknown[]) => mockUsePositions(...args),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: (...args: unknown[]) => mockUseLevels(...args),
}));

vi.mock("~/lib/hooks/useWorkforceRecruitmentSettings", () => ({
	useWorkforceRecruitmentRequestContext: (...args: unknown[]) =>
		mockUseWorkforceRecruitmentRequestContext(...args),
}));

const positions = [
	{
		id: "position-designer",
		title: "Product Designer",
		sectionId: "section-people",
		section: {
			id: "section-people",
			name: "People Design",
			departmentId: "department-people",
		},
		levels: [{ levelId: "level-senior" }],
	},
	{
		id: "position-hidden",
		title: "Hidden Finance Role",
		section: {
			id: "section-finance",
			name: "Finance",
			departmentId: "department-finance",
		},
		levels: [{ levelId: "level-senior" }],
	},
];

const levels = [
	{ id: "level-senior", name: "Senior" },
	{ id: "level-junior", name: "Junior" },
];

const createRequestContext = (
	limitBehavior: "WARN" | "BLOCK",
	overrides?: Partial<WorkforceRecruitmentRequestContext>,
): WorkforceRecruitmentRequestContext => ({
	settings: {
		isEnabled: true,
		enforceDepartmentManagerScope: true,
		defaultWorkflowCode: "WF-REQ-001",
		requestSubtype: "DEPARTMENT_JOB_REQUISITION",
		autoCreateJobOnApproval: false,
	},
	requester: {
		id: "user-1",
		role: "manager",
		departmentId: "department-people",
		departmentName: "People",
		sectionId: "section-people",
		sectionName: "People Design",
		isDepartmentManager: true,
		positionId: "position-designer",
		positionTitle: "Product Designer",
		levelId: "level-senior",
		levelName: "Senior",
	},
	scope: {
		department: { id: "department-people", name: "People", managerId: "user-1" },
		section: { id: "section-people", name: "People Design" },
		position: { id: "position-designer", title: "Product Designer" },
		level: { id: "level-senior", name: "Senior" },
		description: "People recruitment",
	},
	policy: {
		id: "policy-1",
		departmentId: "department-people",
		sectionId: "section-people",
		positionId: "position-designer",
		levelId: "level-senior",
		targetHeadcount: 4,
		limitBehavior,
		defaultWorkflowCode: "WF-REQ-001",
		autoCreateJobOnApproval: false,
		jobType: "FULL_TIME",
		jobLocation: "REMOTE",
		jobTags: ["React", "TypeScript"],
		jobDescriptionTemplate: "Build internal tooling",
		isActive: true,
		currentHeadcount: 1,
		availableHeadcount: 3,
	},
	headcount: {
		currentHeadcount: 1,
		availableHeadcount: 3,
	},
	permissions: {
		canSubmit: true,
		reason: null,
	},
	...overrides,
});

const renderModal = (onSubmit = vi.fn()) =>
	render(
		<JobRequisitionRequestModal
			isOpen
			onClose={vi.fn()}
			departmentId="department-people"
			departmentName="People"
			onSubmit={onSubmit}
		/>,
	);

beforeAll(() => {
	if (!window.PointerEvent) {
		vi.stubGlobal("PointerEvent", MouseEvent);
	}

	Object.defineProperties(HTMLElement.prototype, {
		hasPointerCapture: {
			configurable: true,
			value: () => false,
		},
		releasePointerCapture: {
			configurable: true,
			value: () => undefined,
		},
		scrollIntoView: {
			configurable: true,
			value: () => undefined,
		},
	});
});

describe("JobRequisitionRequestModal", () => {
	beforeEach(() => {
		mockUsePositions.mockReturnValue({
			data: { positions },
			isLoading: false,
		});
		mockUseLevels.mockReturnValue({
			data: { levels },
			isLoading: false,
		});
		mockUseWorkforceRecruitmentRequestContext.mockImplementation(() => ({
			data: createRequestContext("WARN"),
			isLoading: false,
		}));
	});

	it("allows selecting position and level dropdown options before submitting their ids", async () => {
		const user = userEvent.setup();
		const handleSubmit = vi.fn();

		renderModal(handleSubmit);

		expect(screen.getByText("People department request")).toBeInTheDocument();
		expect(screen.getByText("Request review")).toBeInTheDocument();
		expect(screen.getByText("Available")).toBeInTheDocument();
		expect(screen.getByText("3")).toBeInTheDocument();

		await user.click(screen.getByRole("combobox", { name: "Position" }));
		expect(screen.queryByRole("option", { name: "Hidden Finance Role" })).not.toBeInTheDocument();
		await user.click(await screen.findByRole("option", { name: "Product Designer" }));

		await user.click(screen.getByRole("combobox", { name: "Level" }));
		await user.click(await screen.findByRole("option", { name: "Senior" }));

		expect(
			screen.getByText("1 headcount Senior Product Designer in People Design for People"),
		).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Justification"), {
			target: { value: "Backfill a critical open role." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Submit Requisition" }));

		await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
		expect(handleSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				positionId: "position-designer",
				levelId: "level-senior",
			}),
		);
	}, 30_000);

	it("prefills policy metadata fields and allows warn-only over-capacity requisitions", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const warnBasePolicy = createRequestContext("WARN").policy!;
		mockUseWorkforceRecruitmentRequestContext.mockImplementation(() => ({
			data: createRequestContext("WARN", {
				policy: {
					...warnBasePolicy,
					currentHeadcount: 2,
					availableHeadcount: 1,
					targetHeadcount: 3,
				},
				headcount: {
					currentHeadcount: 2,
					availableHeadcount: 1,
				},
			}),
			isLoading: false,
		}));

		renderModal(onSubmit);

		await waitFor(() => {
			expect(screen.getByDisplayValue("FULL_TIME")).toBeInTheDocument();
		});
		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: "Position" })).toHaveTextContent(
				"Product Designer",
			);
		});
		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: "Level" })).toHaveTextContent("Senior");
		});

		expect(screen.getByDisplayValue("REMOTE")).toBeInTheDocument();
		expect(screen.getByDisplayValue("React, TypeScript")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Build internal tooling")).toBeInTheDocument();
		expect(screen.getByText("Warn when target would be exceeded.")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Request Headcount"), {
			target: { value: "2" },
		});
		expect(
			screen.getByText(
				"This request exceeds the available target, but the policy allows HR to continue with a warning.",
			),
		).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Justification"), {
			target: { value: "Need another engineer" },
		});
		fireEvent.change(screen.getByLabelText("Job Type"), {
			target: { value: "CONTRACT" },
		});
		fireEvent.change(screen.getByLabelText("Job Location"), {
			target: { value: "HYBRID" },
		});
		fireEvent.change(screen.getByLabelText("Job Tags"), {
			target: { value: "React, TypeScript, Remote" },
		});
		fireEvent.change(screen.getByLabelText("Job Description"), {
			target: { value: "Support the platform squad." },
		});

		fireEvent.click(screen.getByRole("button", { name: "Submit Requisition" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});

		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				positionId: "position-designer",
				sectionId: "section-people",
				levelId: "level-senior",
				requestedHeadcount: 2,
				justification: "Need another engineer",
				jobType: "CONTRACT",
				jobLocation: "HYBRID",
				jobTags: ["React", "TypeScript", "Remote"],
				jobDescription: "Support the platform squad.",
				workflowCode: "WF-REQ-001",
			}),
		);
	}, 30_000);

	it("blocks over-capacity submissions when the policy is BLOCK", async () => {
		const blockBasePolicy = createRequestContext("BLOCK").policy!;
		mockUseWorkforceRecruitmentRequestContext.mockImplementation(() => ({
			data: createRequestContext("BLOCK", {
				policy: {
					...blockBasePolicy,
					currentHeadcount: 2,
					availableHeadcount: 1,
					targetHeadcount: 3,
				},
				headcount: {
					currentHeadcount: 2,
					availableHeadcount: 1,
				},
			}),
			isLoading: false,
		}));

		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderModal(onSubmit);

		await waitFor(() => {
			expect(screen.getByText("Block when target would be exceeded.")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByLabelText("Request Headcount"), {
			target: { value: "2" },
		});
		fireEvent.change(screen.getByLabelText("Justification"), {
			target: { value: "Need another engineer" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Submit Requisition" }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(
			screen.getByText("Only 1 headcount slot is available for this policy."),
		).toBeInTheDocument();
		expect(
			screen.getByText("This request is above the available target and will be blocked on submit."),
		).toBeInTheDocument();
	}, 15_000);

	it("resets entered values when the modal closes and reopens", async () => {
		function Harness() {
			const [isOpen, setIsOpen] = useState(true);

			return (
				<>
					<button type="button" onClick={() => setIsOpen(true)}>
						Reopen modal
					</button>
					<JobRequisitionRequestModal
						isOpen={isOpen}
						onClose={() => setIsOpen(false)}
						departmentId="department-people"
						departmentName="People"
						onSubmit={vi.fn()}
					/>
				</>
			);
		}

		render(<Harness />);

		await waitFor(() => {
			expect(screen.getByDisplayValue("FULL_TIME")).toBeInTheDocument();
		});

		fireEvent.change(screen.getByLabelText("Request Headcount"), {
			target: { value: "4" },
		});
		fireEvent.change(screen.getByLabelText("Justification"), {
			target: { value: "Temporary backlog support" },
		});
		fireEvent.change(screen.getByLabelText("Job Type"), {
			target: { value: "PART_TIME" },
		});
		fireEvent.change(screen.getByLabelText("Job Location"), {
			target: { value: "ONSITE" },
		});
		fireEvent.change(screen.getByLabelText("Job Tags"), {
			target: { value: "Contractor, Backfill" },
		});
		fireEvent.change(screen.getByLabelText("Job Description"), {
			target: { value: "Temporary support for the quarter." },
		});

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		fireEvent.click(screen.getByRole("button", { name: "Reopen modal" }));

		await waitFor(() => {
			expect(screen.getByLabelText("Request Headcount")).toHaveValue("1");
		});

		expect(screen.getByLabelText("Justification")).toHaveValue("");
		expect(screen.getByLabelText("Job Type")).toHaveValue("FULL_TIME");
		expect(screen.getByLabelText("Job Location")).toHaveValue("REMOTE");
		expect(screen.getByLabelText("Job Tags")).toHaveValue("React, TypeScript");
		expect(screen.getByLabelText("Job Description")).toHaveValue("Build internal tooling");
	}, 15_000);
});
