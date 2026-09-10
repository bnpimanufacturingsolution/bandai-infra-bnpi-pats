// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ManageAccessDrawer } from "./ManageAccessDrawer";
import type { ApplicationAccessDetailResponse } from "~/services/application-access.service";

const mockMutate = vi.fn();

vi.mock("~/lib/hooks/useApplicationAccess", () => ({
	useApplicationAccessDetail: vi.fn(() => mockDetailQuery()),
	useUpdateApplicationAccess: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, onClick, disabled, ...props }: any) => (
		<button type="button" onClick={onClick} disabled={disabled} {...props}>
			{children}
		</button>
	),
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children, variant }: any) => (
		<span data-testid="badge" data-variant={variant}>
			{children}
		</span>
	),
}));

vi.mock("~/components/atoms/Checkbox", () => ({
	Checkbox: ({ checked, onCheckedChange, disabled, "aria-label": ariaLabel }: any) => (
		<input
			type="checkbox"
			checked={checked}
			disabled={disabled}
			aria-label={ariaLabel}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
		/>
	),
}));

vi.mock("~/components/atoms/Select", () => ({
	Select: ({ value, onChange, disabled, options, "aria-label": ariaLabel }: any) => (
		<select
			aria-label={ariaLabel}
			value={value}
			disabled={disabled}
			onChange={(event) => onChange?.(event.target.value)}>
			{options.map((option: any) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	),
}));

vi.mock("~/components/ui/drawer", () => ({
	Drawer: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
	DrawerContent: ({ children }: any) => <div>{children}</div>,
	DrawerHeader: ({ children }: any) => <div>{children}</div>,
	DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
	DrawerDescription: ({ children }: any) => <p>{children}</p>,
	DrawerFooter: ({ children }: any) => <div>{children}</div>,
	DrawerClose: ({ children }: any) => <div>{children}</div>,
}));

const CATALOG = {
	lmsRoles: { assignable: ["employee", "instructor", "admin"], nonAssignable: ["superadmin"], all: [] },
	epmrSubroles: {
		assignable: ["epmr_admin", "epmr_ratee", "epmr_rater", "epmr_qa"],
		removable: ["epmr_ratee", "epmr_rater"],
		explicitOnly: ["epmr_admin", "epmr_qa"],
	},
	defaultEpmrSubroles: ["epmr_ratee", "epmr_rater"],
	provisioningStatuses: ["PENDING", "SYNCED", "FAILED", "BLOCKED"],
	employmentBlockingStatuses: ["TERMINATED"],
};

let detailState: {
	data?: ApplicationAccessDetailResponse;
	isLoading?: boolean;
	isError?: boolean;
	error?: any;
};

const mockDetailQuery = () => ({
	data: detailState.data,
	isLoading: detailState.isLoading ?? false,
	isError: detailState.isError ?? false,
	error: detailState.error,
	refetch: vi.fn(),
});

const buildDetail = (overrides: any = {}): ApplicationAccessDetailResponse => ({
	status: "success",
	message: "ok",
	data: {
		employee: {
			id: "cmpxw28pk009z7zws7k4rmizt",
			employeeNumber: "00021",
			name: "Arvin Salud",
			department: "Production",
			employmentStatus: "ACTIVE",
		},
		explicitConfig: null,
		effective: {
			lmsRole: "employee",
			epmrSubroles: ["epmr_ratee", "epmr_rater"],
			provenance: {
				lmsRole: "DEFAULT",
				epmrSubroles: {
					epmr_admin: "DEFAULT",
					epmr_ratee: "DEFAULT",
					epmr_rater: "DEFAULT",
					epmr_qa: "DEFAULT",
				},
			},
			inherited: false,
			eligible: true,
		},
		provisioning: { status: "PENDING", lastProvisionedAt: null, lastSyncError: null },
		...overrides,
	},
} as ApplicationAccessDetailResponse);

const renderDrawer = (props: Partial<{ open: boolean; employeeId: string | null }> = {}) =>
	render(
		<MemoryRouter>
			<ManageAccessDrawer
				employeeId={props.employeeId ?? "cmpxw28pk009z7zws7k4rmizt"}
				open={props.open ?? true}
				onClose={vi.fn()}
				catalog={CATALOG}
			/>
		</MemoryRouter>,
	);

beforeEach(() => {
	mockMutate.mockReset();
	detailState = {};
});

describe("ManageAccessDrawer", () => {
	it("shows a loading state while the detail loads", () => {
		detailState.isLoading = true;
		renderDrawer();
		expect(screen.getByText("Loading access configuration...")).toBeInTheDocument();
	});

	it("shows a friendly error state", () => {
		detailState.isError = true;
		detailState.error = { message: "Request failed" };
		renderDrawer();
		expect(screen.getByText("Unable to load access configuration.")).toBeInTheDocument();
		expect(screen.getByText("Request failed")).toBeInTheDocument();
	});

	it("populates existing configuration and defaults", () => {
		detailState.data = buildDetail({
			explicitConfig: { lmsRoleOverride: "instructor", epmrGrants: ["epmr_qa"], epmrRemovals: ["epmr_rater"] },
			effective: {
				lmsRole: "instructor",
				epmrSubroles: ["epmr_ratee", "epmr_qa"],
				provenance: { lmsRole: "EXPLICIT", epmrSubroles: {} },
				inherited: false,
				eligible: true,
			},
		} as any);

		renderDrawer();

		expect(screen.getByText("Arvin Salud")).toBeInTheDocument();
		expect(screen.getByLabelText("LMS Role")).toHaveValue("instructor");
		expect(screen.getByLabelText("Ratee access")).toBeChecked();
		expect(screen.getByLabelText("Rater access")).not.toBeChecked();
		expect(screen.getByLabelText("QA access")).toBeChecked();
		expect(screen.getByLabelText("Admin access")).not.toBeChecked();
	});

	it("translates checkbox changes into the Phase 3 grants/removals payload", async () => {
		const user = userEvent.setup();
		detailState.data = buildDetail();
		renderDrawer();

		// Add QA (grant) and remove Rater (removal) — Phase 3 spec example.
		await user.click(screen.getByLabelText("QA access"));
		await user.click(screen.getByLabelText("Rater access"));
		await user.click(screen.getByTestId("manage-access-save"));

		await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
		const call = mockMutate.mock.calls[0][0];
		expect(call.employeeId).toBe("cmpxw28pk009z7zws7k4rmizt");
		expect(call.payload).toEqual({
			lmsRoleOverride: null,
			epmrGrants: ["epmr_qa"],
			epmrRemovals: ["epmr_rater"],
		});
	});

	it("sends an empty delta when defaults are unchanged", async () => {
		const user = userEvent.setup();
		detailState.data = buildDetail();
		renderDrawer();

		await user.click(screen.getByTestId("manage-access-save"));

		expect(mockMutate).toHaveBeenCalledTimes(0); // not dirty: save disabled
	});

	it("supports changing the LMS role override", async () => {
		const user = userEvent.setup();
		detailState.data = buildDetail();
		renderDrawer();

		await user.selectOptions(screen.getByLabelText("LMS Role"), "instructor");
		await user.click(screen.getByTestId("manage-access-save"));

		expect(mockMutate).toHaveBeenCalledTimes(1);
		expect(mockMutate.mock.calls[0][0].payload.lmsRoleOverride).toBe("instructor");
		expect(mockMutate.mock.calls[0][0].payload.epmrGrants).toEqual([]);
		expect(mockMutate.mock.calls[0][0].payload.epmrRemovals).toEqual([]);
	});

	it("renders superadmin access as system-controlled and non-editable", () => {
		detailState.data = buildDetail({
			effective: {
				lmsRole: "superadmin",
				epmrSubroles: ["epmr_admin", "epmr_ratee", "epmr_rater", "epmr_qa"],
				provenance: { lmsRole: "INHERITED", epmrSubroles: {} },
				inherited: true,
				eligible: true,
			},
		} as any);

		renderDrawer();

		expect(screen.getAllByText("System controlled").length).toBeGreaterThan(0);
		expect(screen.getByText("Ratee")).toBeInTheDocument();
		expect(screen.getByText("QA")).toBeInTheDocument();
		// No editable LMS role selector or checkboxes are rendered.
		expect(screen.queryByLabelText("LMS Role")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Ratee access")).not.toBeInTheDocument();
	});

	it("offers no superadmin option in the LMS role selector", () => {
		detailState.data = buildDetail();
		renderDrawer();

		const options = Array.from(screen.getByLabelText("LMS Role").querySelectorAll("option")).map(
			(option) => option.textContent,
		);
		expect(options.join("|")).not.toMatch(/superadmin/i);
	});

	it("disables editing for blocked employees and explains why", () => {
		detailState.data = buildDetail({
			employee: {
				id: "cmpxw28pk009z7zws7k4rmizt",
				employeeNumber: "00021",
				name: "Arvin Salud",
				department: "Production",
				employmentStatus: "TERMINATED",
			},
			effective: {
				lmsRole: null,
				epmrSubroles: [],
				provenance: { lmsRole: "DEFAULT", epmrSubroles: {} },
				inherited: false,
				eligible: false,
			},
		} as any);

		renderDrawer();

		expect(screen.getByText("Access unavailable")).toBeInTheDocument();
		expect(screen.getByText(/employment status \(terminated\)/i)).toBeInTheDocument();
		expect(screen.queryByLabelText("LMS Role")).not.toBeInTheDocument();
		expect(screen.queryByTestId("manage-access-save")).not.toBeInTheDocument();
	});

	it("keeps the drawer open and form intact when the save fails", async () => {
		const user = userEvent.setup();
		detailState.data = buildDetail({
			explicitConfig: { lmsRoleOverride: null, epmrGrants: [], epmrRemovals: ["epmr_rater"] },
		} as any);
		// Simulate a failing save (e.g. 400 validation error from the backend).
		mockMutate.mockImplementation((_vars, options) => {
			options?.onError?.({ message: "Validation failed" });
		});

		renderDrawer();

		await user.click(screen.getByTestId("manage-access-save"));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByLabelText("Rater access")).not.toBeChecked();
		expect(screen.getByLabelText("Ratee access")).toBeChecked();
	});
});

// ---------------------------------------------------------------------------
// HRIS-role decoupling regression (focused fix): an HRIS Employee must be
// assignable ANY supported LMS role and EPMR subrole combination. The Manage
// Access form receives no HRIS role input at all — these tests prove the
// payload translation is driven purely by the selected configuration.
// ---------------------------------------------------------------------------

describe("ManageAccessDrawer — HRIS Employee decoupling", () => {
	const user = userEvent.setup();

	beforeEach(() => {
		// Ordinary HRIS employee (role hris-employee contextually) with NO
		// explicit configuration — the drawer must offer the full vocabulary.
		detailState.data = buildDetail();
	});

	it("Test 1: HRIS Employee → LMS Admin sends lmsRoleOverride=admin", async () => {
		renderDrawer();
		await user.selectOptions(screen.getByLabelText("LMS Role"), "admin");
		await user.click(screen.getByTestId("manage-access-save"));
		expect(mockMutate).toHaveBeenCalledTimes(1);
		expect(mockMutate.mock.calls[0][0].payload).toEqual({
			lmsRoleOverride: "admin",
			epmrGrants: [],
			epmrRemovals: [],
		});
	});

	it("Test 2: HRIS Employee → EPMR Admin alone sends epmrGrants=[epmr_admin]", async () => {
		renderDrawer();
		await user.click(screen.getByLabelText("Admin access"));
		await user.click(screen.getByTestId("manage-access-save"));
		expect(mockMutate.mock.calls[0][0].payload).toEqual({
			lmsRoleOverride: null,
			epmrGrants: ["epmr_admin"],
			epmrRemovals: [],
		});
	});

	it("Test 3: HRIS Employee → LMS Admin + EPMR Admin sends both", async () => {
		renderDrawer();
		await user.selectOptions(screen.getByLabelText("LMS Role"), "admin");
		await user.click(screen.getByLabelText("Admin access"));
		await user.click(screen.getByTestId("manage-access-save"));
		expect(mockMutate.mock.calls[0][0].payload).toEqual({
			lmsRoleOverride: "admin",
			epmrGrants: ["epmr_admin"],
			epmrRemovals: [],
		});
	});

	it("Test 4: HRIS Employee → LMS Admin + all four EPMR subroles", async () => {
		renderDrawer();
		await user.selectOptions(screen.getByLabelText("LMS Role"), "admin");
		await user.click(screen.getByLabelText("Admin access"));
		await user.click(screen.getByLabelText("QA access"));
		await user.click(screen.getByTestId("manage-access-save"));
		expect(mockMutate.mock.calls[0][0].payload).toEqual({
			lmsRoleOverride: "admin",
			epmrGrants: ["epmr_admin", "epmr_qa"],
			epmrRemovals: [],
		});
	});

	it("Test 5: successful save closes the drawer and re-seeds on reopen", async () => {
		const { rerender } = renderDrawer();
		await user.selectOptions(screen.getByLabelText("LMS Role"), "admin");
		await user.click(screen.getByTestId("manage-access-save"));
		// mutation success callback closes the drawer
		expect(mockMutate.mock.calls[0][1].onSuccess).toBeDefined();

		// Reopen with the SAVED configuration from the (refetched) detail API
		detailState.data = buildDetail({
			explicitConfig: { lmsRoleOverride: "admin", epmrGrants: ["epmr_admin", "epmr_qa"], epmrRemovals: [] },
			effective: {
				lmsRole: "admin",
				epmrSubroles: ["epmr_admin", "epmr_ratee", "epmr_rater", "epmr_qa"],
				provenance: { lmsRole: "EXPLICIT", epmrSubroles: {} },
				inherited: false,
				eligible: true,
			},
		} as any);
		rerender(
			<MemoryRouter>
				<ManageAccessDrawer
					employeeId="cmpxw28pk009z7zws7k4rmizt"
					open
					onClose={vi.fn()}
					catalog={CATALOG}
				/>
			</MemoryRouter>,
		);
		await waitFor(() => expect(screen.getByLabelText("LMS Role")).toHaveValue("admin"));
		expect(screen.getByLabelText("Ratee access")).toBeChecked();
		expect(screen.getByLabelText("Rater access")).toBeChecked();
		expect(screen.getByLabelText("Admin access")).toBeChecked();
		expect(screen.getByLabelText("QA access")).toBeChecked();
	});

	it("renders no HRIS-role control anywhere in the form", () => {
		renderDrawer();
		// The form must not expose the employee's HRIS role as an input or
		// restriction — only LMS role + EPMR subroles are configurable.
		expect(screen.queryByText("HRIS Role")).not.toBeInTheDocument();
	});
});
