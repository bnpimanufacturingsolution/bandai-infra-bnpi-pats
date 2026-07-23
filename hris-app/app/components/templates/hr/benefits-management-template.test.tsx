// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	EmployeeBenefitForm,
	buildAttendancePolicySummary,
	isPerfectAttendanceBenefitTypeCode,
	isPerfectAttendanceToggleOn,
	perfectAttendanceToggleFields,
	proRateAttendanceToggleFields,
	SELECT_EMPLOYEES_ACTION,
} from "./employee-benefit-form";

let activeBenefit: any = undefined;
const bulkCreateMutate = vi.fn();
const updateMutate = vi.fn();
const onCancel = vi.fn();
const onSuccess = vi.fn();

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock("~/components/atoms/DatePicker", () => ({
	DatePicker: ({ value, onChange, placeholder }: any) => {
		const isEnd =
			placeholder === "Select end date" ||
			placeholder === "Leave empty for open-ended";
		return (
			<input
				aria-label={placeholder}
				data-testid={isEnd ? "end-date" : "start-date"}
				value={value || ""}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	},
}));
vi.mock("~/components/atoms/Select", () => ({
	Select: ({ options, value, onChange, disabled }: any) => {
		const testId = options.some((option: any) => option.value === "TIME_BOUND")
			? "schedule-mode"
			: options.some((option: any) => option.value === "benefit-type-1")
				? "benefit-type"
				: "select";
		return (
			<select
				data-testid={testId}
				value={value || ""}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}>
				<option value="" />
				{options.map((option: any) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				))}
			</select>
		);
	},
}));

vi.mock("~/components/molecules/employee/EmployeeMultiSelectModal", () => ({
	EmployeeMultiSelectModal: ({ open, onConfirm, onOpenChange, multi }: any) =>
		open ? (
			<div data-testid="employee-picker-modal">
				<button
					type="button"
					data-testid="mock-pick-employee-1"
					onClick={() => {
						onConfirm(multi === false ? ["employee-1"] : ["employee-1", "employee-2"]);
						onOpenChange?.(false);
					}}>
					Pick employees
				</button>
				<button
					type="button"
					data-testid="mock-close-picker"
					onClick={() => onOpenChange?.(false)}>
					Close
				</button>
			</div>
		) : null,
}));

vi.mock("~/components/ui/switch", () => ({
	Switch: ({ checked, onCheckedChange, ...props }: any) => (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			data-testid={props["data-testid"] || "switch"}
			onClick={() => onCheckedChange?.(!checked)}
		/>
	),
}));

vi.mock("~/lib/hooks/useBenefitTypes", () => ({
	useBenefitTypes: () => ({
		data: {
			benefitTypes: [
				{ id: "benefit-type-1", name: "HMO", code: "HMO", payrollDirection: "DEDUCTION" },
				{
					id: "benefit-type-pfa",
					name: "Performance Bonus",
					code: "PFA",
					payrollDirection: "COMPENSATION",
				},
			],
		},
		isLoading: false,
	}),
}));
vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: () => ({
		data: {
			employees: [
				{ id: "employee-1", employeeId: "EMP-1", person: { personalInfo: { firstName: "Ada", lastName: "Lovelace" } } },
				{ id: "employee-2", employeeId: "EMP-2", person: { personalInfo: { firstName: "Grace", lastName: "Hopper" } } },
			],
		},
		isLoading: false,
	}),
}));
vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollPeriods: () => ({
		data: { payrollPeriods: [
			{ id: "period-1", name: "June first half", startDate: "2026-06-01", endDate: "2026-06-15", status: "OPEN" },
			{ id: "period-2", name: "June second half", startDate: "2026-06-16", endDate: "2026-06-30", status: "OPEN" },
		] },
		isLoading: false,
		isError: false,
	}),
}));
vi.mock("~/lib/hooks/use-auth", () => ({ useAuth: () => ({ user: { organizationId: "org-1" } }) }));
vi.mock("~/lib/hooks/useEmployeeBenefits", () => ({
	queryKeys: { employeeBenefits: { all: ["employee-benefits"] } },
	useEmployeeBenefit: () => ({ data: activeBenefit, isLoading: false }),
	useBulkCreateEmployeeBenefits: () => ({ mutate: bulkCreateMutate, isPending: false }),
	useUpdateEmployeeBenefit: () => ({ mutate: updateMutate, isPending: false }),
}));

type CreateFormProps = Partial<{
	payrollPeriodId: string;
	periodCode: string;
	periodStart: string;
	periodEnd: string;
}>;

const renderCreateForm = (
	props: CreateFormProps = {},
	initialEntry = "/hr/benefits-management/new",
) =>
	render(
		<MemoryRouter initialEntries={[initialEntry]}>
			<EmployeeBenefitForm
				mode="create"
				presentation="page"
				onCancel={onCancel}
				onSuccess={onSuccess}
				{...props}
			/>
		</MemoryRouter>,
	);

const selectEmployees = () => {
	fireEvent.click(screen.getByTestId("select-employees-button"));
	fireEvent.click(screen.getByTestId("mock-pick-employee-1"));
};

const fillRequiredFields = () => {
	selectEmployees();
	fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
	fireEvent.change(screen.getByLabelText("Enrollment name *"), { target: { value: "HMO" } });
	fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
		target: { value: "1000" },
	});
	fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
};

describe("EmployeeBenefitForm schedule (recurring-only)", () => {
	beforeEach(() => {
		activeBenefit = undefined;
		bulkCreateMutate.mockReset();
		updateMutate.mockReset();
		onCancel.mockReset();
		onSuccess.mockReset();
	});

	it("defaults new adjustments to recurring with every-cutoff recurrence", () => {
		renderCreateForm();
		expect(screen.getByTestId("recurrence-frequency")).toHaveValue("EVERY_CUTOFF");
		expect(screen.queryByTestId("schedule-mode")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Amount per payroll period *")).toBeInTheDocument();
		expect(screen.getByTestId("end-date")).toBeInTheDocument();
	});

	it("requires employees before submit", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), { target: { value: "benefit-type-1" } });
		fireEvent.change(screen.getByLabelText("Enrollment name *"), { target: { value: "HMO" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "1000" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() =>
			expect(screen.getByText("Select at least one employee")).toBeInTheDocument(),
		);
	});

	it("does not render selected employee chips on the create page after picking employees", () => {
		renderCreateForm();
		selectEmployees();
		expect(screen.getByTestId("selected-employee-count")).toHaveTextContent(
			"2 employees selected",
		);
		expect(screen.getByTestId("select-employees-button")).toHaveTextContent(
			"Edit employees",
		);
		expect(screen.queryByTestId("selected-employee-chips")).not.toBeInTheDocument();
	});

	it("prefills the payroll period from the payroll route context", async () => {
		renderCreateForm({ payrollPeriodId: "period-2" });
		await waitFor(() =>
			expect(
				screen.getAllByTestId("select").some(
					(element) => (element as HTMLSelectElement).value === "period-2",
				),
			).toBe(true),
		);
	});

	it("loads edit as recurring with optional end date", async () => {
		activeBenefit = {
			id: "benefit-1",
			employeeId: "employee-1",
			benefitTypeId: "benefit-type-1",
			name: "HMO",
			amount: 1200,
			startDate: "2026-06-01",
			endDate: "2026-06-30",
			isActive: true,
			status: "ACTIVE",
			recurrenceFrequency: "MONTHLY",
		};
		render(
			<MemoryRouter>
				<EmployeeBenefitForm
					mode="edit"
					presentation="modal"
					benefitId="benefit-1"
					onCancel={onCancel}
					onSuccess={onSuccess}
				/>
			</MemoryRouter>,
		);
		await waitFor(() =>
			expect(screen.getByTestId("recurrence-frequency")).toHaveValue("MONTHLY"),
		);
		expect(screen.getByTestId("end-date")).toHaveValue("2026-06-30");
		expect(screen.getByTestId("selected-employee-count")).toHaveTextContent(
			"1 employee selected",
		);
	});

	it("previews an open-ended recurring schedule", () => {
		renderCreateForm();
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		expect(
			screen.getByText(/₱500\.00 each payroll period from .* until cancelled\./),
		).toBeInTheDocument();
	});

	it("previews monthly and yearly recurring cadence", () => {
		renderCreateForm();
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "MONTHLY" },
		});
		expect(
			screen.getByText(/₱500\.00 each month on the 2nd cutoff.*until cancelled\./),
		).toBeInTheDocument();
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "YEARLY" },
		});
		expect(
			screen.getByText(/₱500\.00 once per fiscal year on the year-end cutoff.*until cancelled\./),
		).toBeInTheDocument();
	});

	it("allows submitting a recurring benefit without an end date for multiple employees", async () => {
		renderCreateForm();
		fillRequiredFields();
		fireEvent.change(screen.getByLabelText("Enrollment name *"), { target: { value: "Monthly allowance" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			scheduleMode: "RECURRING",
			recurrenceFrequency: "EVERY_CUTOFF",
			amount: 500,
			startDate: "2026-06-01",
			employeeIds: ["employee-1", "employee-2"],
		});
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("endDate");
		expect(bulkCreateMutate.mock.calls[0][0]).not.toHaveProperty("totalInstallments");
	});

	it("submits MONTHLY and YEARLY recurrenceFrequency on create", async () => {
		renderCreateForm();
		fillRequiredFields();
		fireEvent.change(screen.getByLabelText("Enrollment name *"), { target: { value: "Yearly bonus" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "1000" },
		});
		fireEvent.change(screen.getByTestId("recurrence-frequency"), {
			target: { value: "YEARLY" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			scheduleMode: "RECURRING",
			recurrenceFrequency: "YEARLY",
			amount: 1000,
		});
	});

	it("includes an optional end date on create payload", async () => {
		renderCreateForm();
		fillRequiredFields();
		fireEvent.change(screen.getByLabelText("Enrollment name *"), { target: { value: "Monthly allowance" } });
		fireEvent.change(screen.getByLabelText("Amount per payroll period *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("end-date"), { target: { value: "2026-12-31" } });
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			scheduleMode: "RECURRING",
			endDate: "2026-12-31",
			employeeIds: ["employee-1", "employee-2"],
		});
	});

	it("opens the employee picker from a select-employees deep link", () => {
		renderCreateForm(
			{},
			`/hr/benefits-management/new?action=${SELECT_EMPLOYEES_ACTION}`,
		);
		expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument();
	});

	it("writes action=select-employees when opening the employee picker", async () => {
		renderCreateForm({}, "/hr/benefits-management/new?payrollPeriodId=period-1");
		expect(screen.queryByTestId("employee-picker-modal")).not.toBeInTheDocument();
		fireEvent.click(screen.getByTestId("select-employees-button"));
		await waitFor(() =>
			expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument(),
		);
	});

	it("clears the select-employees deep link when the picker closes", async () => {
		renderCreateForm(
			{},
			`/hr/benefits-management/new?action=${SELECT_EMPLOYEES_ACTION}&payrollPeriodId=period-1`,
		);
		expect(screen.getByTestId("employee-picker-modal")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("mock-close-picker"));
		await waitFor(() =>
			expect(screen.queryByTestId("employee-picker-modal")).not.toBeInTheDocument(),
		);
	});
});

describe("Attendance toggle helpers", () => {
	it("recognizes PFA benefit type codes case-insensitively", () => {
		expect(isPerfectAttendanceBenefitTypeCode("PFA")).toBe(true);
		expect(isPerfectAttendanceBenefitTypeCode("pfa")).toBe(true);
		expect(isPerfectAttendanceBenefitTypeCode("HMO")).toBe(false);
	});

	it("maps Perfect Attendance toggle to classic all-or-nothing fields", () => {
		expect(isPerfectAttendanceToggleOn({ eligibilityMode: "ATTENDANCE_QUALIFIED" })).toBe(
			true,
		);
		const on = perfectAttendanceToggleFields(true);
		expect(on.eligibilityMode).toBe("ATTENDANCE_QUALIFIED");
		expect(on.eligibilityDisqualifyOnLate).toBe(true);
		expect(on.attendanceBased).toBe(false);
		const off = perfectAttendanceToggleFields(false);
		expect(off.eligibilityMode).toBe("ENROLLED_ALWAYS");
	});

	it("maps Pro-rate toggle to PER_CUTOFF and clears perfect attendance", () => {
		const on = proRateAttendanceToggleFields(true);
		expect(on.attendanceBased).toBe(true);
		expect(on.attendanceAmountBasis).toBe("PER_CUTOFF");
		expect(on.eligibilityMode).toBe("ENROLLED_ALWAYS");
		expect(proRateAttendanceToggleFields(false).attendanceBased).toBe(false);
	});

	it("builds a short attendance policy summary for the form", () => {
		expect(
			buildAttendancePolicySummary({
				eligibilityMode: "ENROLLED_ALWAYS",
				attendanceBased: false,
			}),
		).toMatch(/both off/i);
		expect(
			buildAttendancePolicySummary({
				eligibilityMode: "ATTENDANCE_QUALIFIED",
				attendanceBased: false,
			}),
		).toMatch(/perfect attendance on/i);
		expect(
			buildAttendancePolicySummary({
				eligibilityMode: "ENROLLED_ALWAYS",
				attendanceBased: true,
			}),
		).toMatch(/pro-rate on/i);
	});
});

describe("EmployeeBenefitForm attendance toggles", () => {
	beforeEach(() => {
		activeBenefit = undefined;
		bulkCreateMutate.mockReset();
		updateMutate.mockReset();
		onCancel.mockReset();
		onSuccess.mockReset();
	});

	it("prefills Perfect Attendance on when type is PFA", async () => {
		renderCreateForm();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		await waitFor(() =>
			expect(screen.getByTestId("perfect-attendance-toggle")).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
		expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
			"aria-checked",
			"false",
		);
	});

	it("makes Perfect Attendance and Pro-rate mutually exclusive", async () => {
		renderCreateForm();
		fireEvent.click(screen.getByTestId("perfect-attendance-toggle"));
		await waitFor(() =>
			expect(screen.getByTestId("perfect-attendance-toggle")).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		await waitFor(() =>
			expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
		expect(screen.getByTestId("perfect-attendance-toggle")).toHaveAttribute(
			"aria-checked",
			"false",
		);
		fireEvent.click(screen.getByTestId("perfect-attendance-toggle"));
		await waitFor(() =>
			expect(screen.getByTestId("perfect-attendance-toggle")).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
		expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
			"aria-checked",
			"false",
		);
	});

	it("submits Perfect Attendance payload for PFA with pro-rate off", async () => {
		renderCreateForm();
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-pfa" },
		});
		await waitFor(() =>
			expect(screen.getByLabelText("Enrollment name *")).toHaveValue("Performance Bonus"),
		);
		fireEvent.change(screen.getByLabelText("Enrollment name *"), {
			target: { value: "Perfect Attendance" },
		});
		fireEvent.change(screen.getByLabelText(/Amount per payroll period/i), {
			target: { value: "200" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			benefitTypeId: "benefit-type-pfa",
			attendanceBased: false,
			attendanceAmountBasis: null,
			eligibilityMode: "ATTENDANCE_QUALIFIED",
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: true,
			amount: 200,
			scheduleMode: "RECURRING",
			employeeIds: ["employee-1", "employee-2"],
		});
	});

	it("submits pro-rate payload with PER_CUTOFF and enrolled-always", async () => {
		renderCreateForm();
		selectEmployees();
		fireEvent.change(screen.getByTestId("benefit-type"), {
			target: { value: "benefit-type-1" },
		});
		await waitFor(() => expect(screen.getByLabelText("Enrollment name *")).toHaveValue("HMO"));
		fireEvent.click(screen.getByTestId("attendance-based-toggle"));
		await waitFor(() =>
			expect(screen.getByTestId("attendance-based-toggle")).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
		fireEvent.change(screen.getByLabelText("Full amount for cut-off *"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByTestId("start-date"), { target: { value: "2026-06-01" } });
		fireEvent.click(screen.getByRole("button", { name: "Enroll employees" }));
		await waitFor(() => expect(bulkCreateMutate).toHaveBeenCalledTimes(1));
		expect(bulkCreateMutate.mock.calls[0][0]).toMatchObject({
			benefitTypeId: "benefit-type-1",
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF",
			eligibilityMode: "ENROLLED_ALWAYS",
			amount: 500,
			scheduleMode: "RECURRING",
		});
	});
});
