// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingChecklistPanel from "./onboarding-checklist-panel";

const mockAuth = vi.hoisted(() => ({ role: "hris-hr-manager" }));
const mockSign = vi.hoisted(() => ({
	mutateAsync: vi.fn() as (...args: unknown[]) => Promise<unknown>,
}));
const mockVisibleLoading = vi.hoisted(() => ({ value: false }));

const visibleFixture = {
	checklist: {
		id: "chk-1",
		title: "Onboarding Checklist - Char Aznable",
		status: "ACTIVE",
		completionPercentage: 25,
		startDate: "2026-09-09",
		targetDate: null,
		employee: { id: "emp-a", employeeNumber: "EMP3338", name: "Char Aznable", department: "GA/HR" },
		view: "full",
		viewer: { department: "HR", isAdmin: false, isHr: true },
		sections: [
			{
				id: "sec-1",
				title: "Section 1: Pre-Onboarding",
				order: 1,
				items: [
					{
						id: "item-1",
						number: "1",
						title: "Device",
						parentId: null,
						sectionId: "sec-1",
						responsibleDepartmentId: null,
						responsibleDepartmentName: null,
						order: 1,
						status: "PENDING",
						completedDate: null,
						completedByEmployeeId: null,
						signedByName: null,
						remarks: null,
						canSign: false,
						isContextOnly: false,
						children: [
							{
								id: "item-1-1",
								number: "1.1",
								title: "Laptop/PC provisioned",
								parentId: "item-1",
								sectionId: "sec-1",
								responsibleDepartmentId: "dept-it",
								responsibleDepartmentName: "IT",
								order: 1,
								status: "PENDING",
								completedDate: null,
								completedByEmployeeId: null,
								signedByName: null,
								remarks: null,
								canSign: true,
								isContextOnly: false,
								children: [],
							},
							{
								id: "item-1-2",
								number: "1.2",
								title: "Mouse",
								parentId: "item-1",
								sectionId: "sec-1",
								responsibleDepartmentId: "dept-ga",
								responsibleDepartmentName: "GA",
								order: 2,
								status: "COMPLETED",
								completedDate: "2026-09-10T00:00:00.000Z",
								completedByEmployeeId: "emp-ga",
								signedByName: "GA Agent",
								remarks: "issued",
								canSign: false,
								isContextOnly: false,
								children: [],
							},
						],
					},
				],
			},
		],
	},
};

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({ user: { role: mockAuth.role } }),
}));

vi.mock("~/lib/hooks/useOnboarding", () => ({
	useOnboardingChecklistsForEmployee: () => ({
		data: { checklists: [{ id: "chk-1" }] },
		isLoading: false,
	}),
	useOnboardingRosterForEmployee: () => ({ data: { employees: [] }, isLoading: false }),
	useOnboardingVisibleChecklist: () => ({
		data: mockVisibleLoading.value ? undefined : visibleFixture,
		isLoading: mockVisibleLoading.value,
	}),
	useCreateOnboardingChecklist: () => ({ mutate: vi.fn(), isPending: false }),
	useSignOnboardingItem: () => ({
		mutateAsync: (...args: unknown[]) => mockSign.mutateAsync(...args),
		isPending: false,
	}),
	useUnsignOnboardingItem: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

const employee = { id: "emp-a", employeeNumber: "EMP3338", name: "Char Aznable" };

describe("OnboardingChecklistPanel", () => {
	beforeEach(() => {
		mockAuth.role = "hris-hr-manager";
		mockSign.mutateAsync = vi.fn().mockResolvedValue({});
		mockVisibleLoading.value = false;
	});

	it("renders the checklist tree with signatures and progress", () => {
		render(<OnboardingChecklistPanel employee={employee} />);

		expect(screen.getByText("Section 1: Pre-Onboarding")).toBeInTheDocument();
		expect(screen.getByText("Device")).toBeInTheDocument();
		expect(screen.getByText("Laptop/PC provisioned")).toBeInTheDocument();
		expect(screen.getByText(/GA Agent — issued/)).toBeInTheDocument();
		expect(screen.getByText("25%")).toBeInTheDocument();
		expect(screen.queryByText("unassigned")).not.toBeInTheDocument();
	});

	it("sign dialog shows instructions + password, sends credentials, closes on success", async () => {
		render(<OnboardingChecklistPanel employee={employee} />);

		fireEvent.click(screen.getByRole("button", { name: /sign item 1\.1 laptop/i }));
		const dialog = await screen.findByRole("dialog");
		expect(
			dialog.textContent?.includes("Enter your account password to confirm"),
		).toBe(true);
		expect(dialog.querySelector("input[type='password']")).toBeTruthy();

		const signButton = screen.getByRole("button", { name: "Sign" });
		expect(signButton).toBeDisabled();

		fireEvent.change(dialog.querySelector("input[type='password']") as HTMLElement, {
			target: { value: "password123" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign" }));

		await waitFor(() =>
			expect(mockSign.mutateAsync).toHaveBeenCalledWith({
				itemId: "item-1-1",
				payload: { password: "password123", remarks: null },
			}),
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("keeps the dialog open with an inline error on wrong password", async () => {
		mockSign.mutateAsync = vi.fn().mockRejectedValue(new Error("Invalid password"));
		render(<OnboardingChecklistPanel employee={employee} />);

		fireEvent.click(screen.getByRole("button", { name: /sign item 1\.1 laptop/i }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(dialog.querySelector("input[type='password']") as HTMLElement, {
			target: { value: "nope" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Sign" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).to.equal("Invalid password");
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("renders no-department items as blank section rows: no checkbox, no labels", () => {
		const { container } = render(<OnboardingChecklistPanel employee={employee} />);
		expect(
			screen.queryByRole("button", { name: /sign item 1 device/i }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("—")).not.toBeInTheDocument();
		expect(screen.queryByText("unassigned")).not.toBeInTheDocument();
		const sectionRow = container.querySelector("tbody tr");
		expect(sectionRow?.textContent).toBe("1Device");
	});

	it("hides the provision action for non-managers (never shown when checklist exists either way)", () => {
		mockAuth.role = "hris-employee";
		render(<OnboardingChecklistPanel employee={employee} />);
		expect(screen.queryByRole("button", { name: /provision checklist/i })).not.toBeInTheDocument();
		expect(screen.getByText("Laptop/PC provisioned")).toBeInTheDocument();
	});

	it("renders skeleton blocks while the checklist loads", () => {
		mockVisibleLoading.value = true;
		const { container } = render(<OnboardingChecklistPanel employee={employee} />);
		expect(container.querySelectorAll(".animate-pulse").length).to.be.greaterThan(4);
		expect(screen.queryByText("Laptop/PC provisioned")).not.toBeInTheDocument();
	});
});
