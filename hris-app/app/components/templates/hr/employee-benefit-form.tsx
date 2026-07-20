import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Alert, AlertDescription } from "~/components/atoms/Alert";
import { Button } from "~/components/atoms/Button";
import { DatePicker } from "~/components/atoms/DatePicker";
import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { EmployeeMultiSelectModal } from "~/components/molecules/employee/EmployeeMultiSelectModal";
import { Switch } from "~/components/ui/switch";
import { useBenefitTypes } from "~/lib/hooks/useBenefitTypes";
import {
	queryKeys as employeeBenefitQueryKeys,
	useBulkCreateEmployeeBenefits,
	useEmployeeBenefit,
	useUpdateEmployeeBenefit,
} from "~/lib/hooks/useEmployeeBenefits";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useAuth } from "~/lib/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, formatDateForInput } from "~/lib/utils/text-utils";
import type {
	BulkCreateEmployeeBenefitRequest,
	UpdateEmployeeBenefitRequest,
	BenefitScheduleMode,
} from "~/services/employee-benefit.service";
import type { PayrollPeriod } from "~/services/payroll-periods.service";

/** Deep-link action for the employee picker on `/hr/benefits-management/new`. */
export const SELECT_EMPLOYEES_ACTION = "select-employees";

const BenefitStatusSchema = z.enum([
	"PENDING",
	"APPROVED",
	"ACTIVE",
	"COMPLETED",
	"CANCELLED",
	"DEFAULTED",
]);

const scheduleRefine = (
	data: {
		scheduleMode: string;
		endDate?: string;
		startDate?: string;
		totalInstallments?: number;
		attendanceBased?: boolean;
		attendanceAmountBasis?: string;
	},
	ctx: z.RefinementCtx,
) => {
	if (data.scheduleMode === "TIME_BOUND" && !data.endDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "End date is required for time-bound schedules",
			path: ["endDate"],
		});
	}
	if (
		data.scheduleMode === "FIXED_INSTALLMENTS" &&
		(!Number.isInteger(data.totalInstallments) || (data.totalInstallments || 0) <= 0)
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Installment count must be a positive whole number",
			path: ["totalInstallments"],
		});
	}
	if (
		(data.scheduleMode === "TIME_BOUND" || data.scheduleMode === "RECURRING") &&
		data.endDate
	) {
		const start = new Date(data.startDate || "");
		const end = new Date(data.endDate);
		if (
			!Number.isNaN(start.getTime()) &&
			!Number.isNaN(end.getTime()) &&
			end < start
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "End date cannot be before start date",
				path: ["endDate"],
			});
		}
	}
	if (data.attendanceBased) {
		if (data.attendanceAmountBasis !== "PER_DAY" && data.attendanceAmountBasis !== "PER_CUTOFF") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Choose how the amount is applied to attendance",
				path: ["attendanceAmountBasis"],
			});
		}
	}
};

const EmployeeBenefitFormFieldsSchema = z.object({
	/** Multi-select on create; single id (array length 1) on edit. */
	employeeIds: z.array(z.string().trim().min(1)).min(1, "Select at least one employee"),
	benefitTypeId: z.string().trim().min(1, "Benefit type is required"),
	payrollPeriodId: z.string().trim().optional(),
	name: z.string().trim().min(1, "Name is required").max(160, "Name is too long"),
	description: z.string().trim().max(500, "Description is too long").optional(),
	amount: z.coerce.number().positive("Amount must be greater than zero"),
	startDate: z.string().trim().min(1, "Start date is required"),
	endDate: z.string().trim().optional(),
	scheduleMode: z.enum(["TIME_BOUND", "FIXED_INSTALLMENTS", "RECURRING"]),
	recurrenceFrequency: z.enum(["EVERY_CUTOFF", "MONTHLY", "YEARLY"]).default("EVERY_CUTOFF"),
	totalInstallments: z.coerce.number().optional(),
	attendanceBased: z.boolean().default(false),
	attendanceAmountBasis: z.enum(["PER_DAY", "PER_CUTOFF"]).optional(),
	status: BenefitStatusSchema.default("ACTIVE"),
	isActive: z.boolean().default(true),
	notes: z.string().trim().max(500, "Notes are too long").optional(),
});

export const EmployeeBenefitFormSchema = EmployeeBenefitFormFieldsSchema.superRefine(
	scheduleRefine,
);

export type EmployeeBenefitFormData = z.infer<typeof EmployeeBenefitFormSchema>;

const statusOptions: SelectOption[] = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "PENDING", label: "Pending" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "CANCELLED", label: "Cancelled" },
	{ value: "DEFAULTED", label: "Defaulted" },
];

const scheduleModeOptions: SelectOption[] = [
	{ value: "TIME_BOUND", label: "Time-bound" },
	{ value: "FIXED_INSTALLMENTS", label: "Fixed installments" },
	{ value: "RECURRING", label: "Recurring" },
];

const scheduleModeDescription = (mode: string) => {
	if (mode === "TIME_BOUND") return "Split across payroll periods in a date range";
	if (mode === "FIXED_INSTALLMENTS") return "Split into a fixed number of installments";
	return "Repeat on a chosen payroll cadence until end date or cancelled";
};

const recurrenceFrequencyOptions: SelectOption[] = [
	{ value: "EVERY_CUTOFF", label: "Every payroll period (cutoff)" },
	{ value: "MONTHLY", label: "Monthly (2nd cutoff)" },
	{ value: "YEARLY", label: "Yearly (end of fiscal year)" },
];

const recurrenceFrequencyDescription = (value: string) => {
	if (value === "MONTHLY") {
		return "Pays on period 2 each month. If the organization has only one period that month, that period is used.";
	}
	if (value === "YEARLY") {
		return "Pays on the last period of the fiscal-year-end month (from org payroll cycle annual start month).";
	}
	return "Pays on every eligible payroll period while active.";
};

const attendanceAmountBasisOptions: SelectOption[] = [
	{ value: "PER_DAY", label: "Per present day" },
	{ value: "PER_CUTOFF", label: "Full cut-off (deduct absences)" },
];

/** Bandai Perfect Attendance compensation benefit type code. */
export const PERFECT_ATTENDANCE_BENEFIT_TYPE_CODE = "PFA";

/** data-testid for the PFA + attendance-based product warning banner. */
export const PFA_ATTENDANCE_BASED_WARNING_TEST_ID = "pfa-attendance-based-warning";

/**
 * Whether a benefit type code is Perfect Attendance (PFA).
 * Money path keys on code; seed display name may still be "Performance Bonus".
 */
export function isPerfectAttendanceBenefitTypeCode(code?: string | null): boolean {
	return String(code || "").trim().toUpperCase() === PERFECT_ATTENDANCE_BENEFIT_TYPE_CODE;
}

/**
 * Show the product warning when PFA enrollment has attendance-based amount ON.
 * PFA with attendance off = fixed enrolled amount (all-or-nothing enrollment pay).
 * PFA with attendance on = ABSENT-only pro-rate (still pays with absences).
 */
export function shouldShowPfaAttendanceBasedWarning(params: {
	benefitTypeCode?: string | null;
	attendanceBased?: boolean | null;
}): boolean {
	return (
		params.attendanceBased === true && isPerfectAttendanceBenefitTypeCode(params.benefitTypeCode)
	);
}

export const PFA_ATTENDANCE_BASED_WARNING_TITLE =
	"Perfect Attendance with attendance-based amount";

export const PFA_ATTENDANCE_BASED_WARNING_BODY =
	'With "Compute from attendance" on, this is not an all-or-nothing Perfect Attendance award. ' +
	"Payroll pro-rates the amount from timesheet attendance (ABSENT days only reduce the amount). " +
	"Late, undertime, and leave do not zero the benefit. " +
	"This is not the Perfect Attendance metrics report and does not auto-qualify eligibility. " +
	"Leave the toggle off for a fixed enrolled amount (full amount when due).";

const fieldLabelClass = "mb-1.5 block text-xs font-medium text-neutral-600";
const fieldErrorClass = "mt-1.5 text-xs text-red-600";
const fieldHintClass = "mt-1.5 text-[11px] leading-relaxed text-neutral-400";
const sectionCardClass =
	"space-y-4 rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const sectionTitleClass =
	"text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400";

export const PAYROLL_PERIOD_NONE_VALUE = "__none__";

type PayrollPeriodLabelInput = {
	name?: string | null;
	code?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	status?: PayrollPeriod["status"] | null;
};

export const getPayrollPeriodOptionLabel = (period: PayrollPeriodLabelInput) => {
	const name = String(period.name || period.code || "Payroll period").trim();
	const code = period.code && period.code !== name ? ` (${period.code})` : "";
	const dateRange =
		period.startDate && period.endDate
			? ` - ${formatDate(period.startDate, "short")} to ${formatDate(period.endDate, "short")}`
			: "";
	const status = period.status ? ` - ${period.status}` : "";
	return `${name}${code}${dateRange}${status}`;
};

const getEmployeeName = (employee?: any) => {
	const personalInfo = employee?.person?.personalInfo || {};
	const parts = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
		.map((part) => String(part || "").trim())
		.filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
};

const formatCurrency = (value: number | string | null | undefined) =>
	new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
		maximumFractionDigits: 2,
	}).format(Number(value || 0));

const normalizeOptional = (value?: string | null) => {
	const trimmed = String(value || "").trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export type EmployeeBenefitFormProps = {
	mode: "create" | "edit";
	/** Page uses full-width layout; modal keeps compact scroll + sticky footer. */
	presentation?: "page" | "modal";
	benefitId?: string | null;
	payrollPeriodId?: string;
	periodCode?: string;
	periodStart?: string;
	periodEnd?: string;
	onCancel: () => void;
	onSuccess: () => void;
	submitLabel?: string;
	cancelLabel?: string;
};

export function EmployeeBenefitForm({
	mode,
	presentation = "page",
	benefitId,
	payrollPeriodId = "",
	periodCode = "",
	periodStart = "",
	periodEnd = "",
	onCancel,
	onSuccess,
	submitLabel,
	cancelLabel = "Cancel",
}: EmployeeBenefitFormProps) {
	const queryClient = useQueryClient();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const isEditing = mode === "edit";
	const isPage = presentation === "page";
	// Local open state for modal presentation (edit flow); page create uses URL deep link.
	const [localEmployeePickerOpen, setLocalEmployeePickerOpen] = useState(false);

	const employeePickerOpen = isPage
		? searchParams.get("action") === SELECT_EMPLOYEES_ACTION
		: localEmployeePickerOpen;

	const setEmployeePickerOpen = useCallback(
		(open: boolean) => {
			if (!isPage) {
				setLocalEmployeePickerOpen(open);
				return;
			}
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (open) {
						next.set("action", SELECT_EMPLOYEES_ACTION);
					} else if (next.get("action") === SELECT_EMPLOYEES_ACTION) {
						next.delete("action");
					}
					return next;
				},
				{ replace: true },
			);
		},
		[isPage, setSearchParams],
	);

	const { data: activeItem, isLoading: isLoadingItem } = useEmployeeBenefit(
		isEditing ? benefitId || "" : "",
	);
	const { data: benefitTypesData, isLoading: benefitTypesLoading } = useBenefitTypes({
		page: 1,
		limit: 500,
		filter: "isActive:true",
		sort: "name",
		order: "asc",
		count: true,
	});
	const {
		data: payrollPeriodsData,
		isLoading: payrollPeriodsLoading,
		isError: payrollPeriodsError,
	} = usePayrollPeriods({
		page: 1,
		limit: 1000,
		sort: "startDate",
		order: "desc",
		count: true,
	});

	const bulkCreateMutation = useBulkCreateEmployeeBenefits();
	const updateMutation = useUpdateEmployeeBenefit();

	const benefitTypes = useMemo(
		() => benefitTypesData?.benefitTypes || [],
		[benefitTypesData?.benefitTypes],
	);
	const payrollPeriods = useMemo<PayrollPeriod[]>(() => {
		const payload = payrollPeriodsData as any;
		return payload?.payrollPeriods || payload?.data?.payrollPeriods || [];
	}, [payrollPeriodsData]);

	const benefitTypeOptions = useMemo<SelectOption[]>(
		() =>
			benefitTypes.map((benefitType) => ({
				value: benefitType.id,
				label: `${benefitType.name}${benefitType.code ? ` (${benefitType.code})` : ""}`,
			})),
		[benefitTypes],
	);

	const payrollPeriodOptions = useMemo<SelectOption[]>(
		() => [
			{ value: PAYROLL_PERIOD_NONE_VALUE, label: "Date range only" },
			...payrollPeriods.map((period) => ({
				value: period.id,
				label: getPayrollPeriodOptionLabel(period),
			})),
		],
		[payrollPeriods],
	);

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		control,
		watch,
		formState: { errors },
	} = useForm<EmployeeBenefitFormData>({
		resolver: zodResolver(EmployeeBenefitFormSchema) as Resolver<EmployeeBenefitFormData>,
		defaultValues: {
			employeeIds: [],
			benefitTypeId: "",
			payrollPeriodId: payrollPeriodId,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStart || formatDateForInput(new Date()),
			endDate: periodEnd,
			scheduleMode: "TIME_BOUND",
			recurrenceFrequency: "EVERY_CUTOFF",
			totalInstallments: undefined,
			attendanceBased: false,
			attendanceAmountBasis: undefined,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		},
	});

	const watchedBenefitTypeId = watch("benefitTypeId");
	const watchedScheduleMode = watch("scheduleMode");
	const watchedRecurrenceFrequency = watch("recurrenceFrequency");
	const watchedAmount = watch("amount");
	const watchedStartDate = watch("startDate");
	const watchedEndDate = watch("endDate");
	const watchedTotalInstallments = watch("totalInstallments");
	const watchedAttendanceBased = watch("attendanceBased");
	const watchedAttendanceAmountBasis = watch("attendanceAmountBasis");
	const watchedStatus = watch("status");
	const watchedIsActive = watch("isActive");

	useEffect(() => {
		if (isEditing && !isLoadingItem && activeItem) {
			reset({
				employeeIds: activeItem.employeeId ? [activeItem.employeeId] : [],
				benefitTypeId: activeItem.benefitTypeId || "",
				payrollPeriodId: activeItem.payrollPeriodId || payrollPeriodId,
				name: activeItem.name || activeItem.benefitType?.name || "",
				description: activeItem.description || "",
				amount: Number(activeItem.amount || 0),
				startDate:
					formatDateForInput(activeItem.startDate) ||
					periodStart ||
					formatDateForInput(new Date()),
				endDate: formatDateForInput(activeItem.endDate) || "",
				scheduleMode:
					(activeItem.scheduleMode as BenefitScheduleMode | undefined) || "TIME_BOUND",
				recurrenceFrequency:
					activeItem.recurrenceFrequency === "MONTHLY" ||
					activeItem.recurrenceFrequency === "YEARLY" ||
					activeItem.recurrenceFrequency === "EVERY_CUTOFF"
						? activeItem.recurrenceFrequency
						: "EVERY_CUTOFF",
				totalInstallments: activeItem.totalInstallments || undefined,
				attendanceBased: activeItem.attendanceBased === true,
				attendanceAmountBasis:
					activeItem.attendanceAmountBasis === "PER_DAY" ||
					activeItem.attendanceAmountBasis === "PER_CUTOFF"
						? activeItem.attendanceAmountBasis
						: undefined,
				status: (activeItem.status as EmployeeBenefitFormData["status"]) || "ACTIVE",
				isActive: activeItem.isActive ?? true,
				notes: activeItem.notes || "",
			});
		}
	}, [
		activeItem,
		isEditing,
		isLoadingItem,
		payrollPeriodId,
		periodStart,
		reset,
	]);

	useEffect(() => {
		if (mode !== "create") return;
		reset({
			employeeIds: [],
			benefitTypeId: "",
			payrollPeriodId: payrollPeriodId,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStart || formatDateForInput(new Date()),
			endDate: periodEnd,
			scheduleMode: "TIME_BOUND",
			recurrenceFrequency: "EVERY_CUTOFF",
			totalInstallments: undefined,
			attendanceBased: false,
			attendanceAmountBasis: undefined,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		});
	}, [mode, payrollPeriodId, periodEnd, periodStart, reset]);

	useEffect(() => {
		if (!watchedBenefitTypeId || isEditing) return;
		const benefitType = benefitTypes.find((item) => item.id === watchedBenefitTypeId);
		if (!benefitType) return;
		setValue("name", benefitType.name, { shouldValidate: true });
		if (benefitType.fixedAmount !== undefined && benefitType.fixedAmount !== null) {
			setValue("amount", Number(benefitType.fixedAmount), { shouldValidate: true });
		}
	}, [benefitTypes, isEditing, setValue, watchedBenefitTypeId]);

	const selectedBenefitType =
		benefitTypes.find((item) => item.id === watchedBenefitTypeId) ||
		(isEditing && activeItem?.benefitTypeId === watchedBenefitTypeId
			? activeItem.benefitType
			: undefined);

	const showPfaAttendanceBasedWarning = shouldShowPfaAttendanceBasedWarning({
		benefitTypeCode: selectedBenefitType?.code,
		attendanceBased: watchedAttendanceBased,
	});

	const schedulePreview = useMemo(() => {
		const amount = Number(watchedAmount || 0);
		if (watchedAttendanceBased) {
			if (amount <= 0) return null;
			if (watchedAttendanceAmountBasis === "PER_DAY") {
				return `${formatCurrency(amount)} × present days each eligible payroll period. Final amount is computed at payroll from attendance (ABSENT days only reduce pay).`;
			}
			if (watchedAttendanceAmountBasis === "PER_CUTOFF") {
				return `${formatCurrency(amount)} full cut-off amount, pro-rated for ABSENT days only. Final amount is computed at payroll.`;
			}
			return "Choose an amount basis to preview attendance-based computation.";
		}
		if (watchedScheduleMode === "FIXED_INSTALLMENTS") {
			const installments = Number(watchedTotalInstallments || 0);
			if (!Number.isInteger(installments) || installments <= 0 || amount <= 0) return null;
			const totalCentavos = Math.round(amount * 100);
			const baseCentavos = Math.floor(totalCentavos / installments);
			const remainderCentavos = totalCentavos - baseCentavos * installments;
			const finalCentavos = baseCentavos + remainderCentavos;
			return `Estimated ${installments} installments at ${formatCurrency(baseCentavos / 100)} per installment${
				remainderCentavos > 0
					? `; final installment ${formatCurrency(finalCentavos / 100)}`
					: ""
			}.`;
		}

		if (watchedScheduleMode === "RECURRING") {
			if (amount <= 0 || !watchedStartDate) return null;
			const start = new Date(watchedStartDate);
			if (Number.isNaN(start.getTime())) return null;
			const cadence =
				watchedRecurrenceFrequency === "MONTHLY"
					? "each month on the 2nd cutoff (or sole monthly period)"
					: watchedRecurrenceFrequency === "YEARLY"
						? "once per fiscal year on the year-end cutoff"
						: "each payroll period";
			if (watchedEndDate) {
				const end = new Date(watchedEndDate);
				if (Number.isNaN(end.getTime()) || end < start) return null;
				return `${formatCurrency(amount)} ${cadence} from ${formatDate(watchedStartDate, "short")} to ${formatDate(watchedEndDate, "short")}.`;
			}
			return `${formatCurrency(amount)} ${cadence} from ${formatDate(watchedStartDate, "short")} until cancelled.`;
		}

		if (!watchedStartDate || !watchedEndDate) return null;
		const start = new Date(watchedStartDate);
		const end = new Date(watchedEndDate);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
		const installments = payrollPeriods.filter((period) => {
			const periodStartDate = new Date(period.startDate);
			const periodEndDate = new Date(period.endDate);
			return periodStartDate <= end && periodEndDate >= start;
		}).length;
		return `Estimated ${installments} payroll-period installment${installments === 1 ? "" : "s"}.`;
	}, [
		payrollPeriods,
		watchedAmount,
		watchedAttendanceAmountBasis,
		watchedAttendanceBased,
		watchedEndDate,
		watchedRecurrenceFrequency,
		watchedScheduleMode,
		watchedStartDate,
		watchedTotalInstallments,
	]);

	const onSubmit = (data: EmployeeBenefitFormData) => {
		const sharedPayload = {
			benefitTypeId: data.benefitTypeId,
			payrollPeriodId:
				data.payrollPeriodId === PAYROLL_PERIOD_NONE_VALUE
					? undefined
					: normalizeOptional(data.payrollPeriodId),
			name: data.name.trim(),
			description: normalizeOptional(data.description),
			amount: Number(data.amount),
			startDate: data.startDate,
			scheduleMode: data.scheduleMode,
			recurrenceFrequency:
				data.scheduleMode === "RECURRING"
					? data.recurrenceFrequency || "EVERY_CUTOFF"
					: null,
			attendanceBased: data.attendanceBased === true,
			attendanceAmountBasis:
				data.attendanceBased === true ? data.attendanceAmountBasis ?? null : null,
			...(data.scheduleMode === "TIME_BOUND"
				? { endDate: normalizeOptional(data.endDate) }
				: data.scheduleMode === "FIXED_INSTALLMENTS"
					? { totalInstallments: data.totalInstallments }
					: {
							...(normalizeOptional(data.endDate)
								? { endDate: normalizeOptional(data.endDate) }
								: {}),
						}),
			status: data.status,
			isActive: data.isActive,
			notes: normalizeOptional(data.notes),
		};

		if (isEditing && activeItem) {
			const employeeId = data.employeeIds[0];
			if (!employeeId) {
				sonnerToast.error("Select an employee.");
				return;
			}
			updateMutation.mutate(
				{
					id: activeItem.id,
					data: {
						...sharedPayload,
						employeeId,
					} as UpdateEmployeeBenefitRequest,
				},
				{
					onSuccess: () => {
						queryClient.invalidateQueries({
							queryKey: employeeBenefitQueryKeys.employeeBenefits.all,
						});
						onSuccess();
					},
				},
			);
			return;
		}

		if (!user?.organizationId) {
			sonnerToast.error("Organization not found. Please refresh.");
			return;
		}

		bulkCreateMutation.mutate(
			{
				...sharedPayload,
				organizationId: user.organizationId,
				employeeIds: data.employeeIds,
			} as BulkCreateEmployeeBenefitRequest,
			{
				onSuccess: (result) => {
					queryClient.invalidateQueries({
						queryKey: employeeBenefitQueryKeys.employeeBenefits.all,
					});
					if ((result.created?.length || 0) > 0) {
						onSuccess();
					}
				},
			},
		);
	};

	const isMutationPending = bulkCreateMutation.isPending || updateMutation.isPending;
	const resolvedSubmitLabel =
		submitLabel || (isEditing ? "Save benefit" : "Add benefit");

	if (isEditing && isLoadingItem) {
		return (
			<div className="flex h-56 items-center justify-center text-sm text-neutral-500">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Loading benefit...
			</div>
		);
	}

	return (
		<form
			noValidate
			onSubmit={handleSubmit(onSubmit)}
			className={isPage ? "space-y-5" : "flex min-h-0 flex-col"}>
			<div
				className={
					isPage
						? "space-y-5"
						: "max-h-[calc(min(90vh,820px)-9.5rem)] space-y-4 overflow-y-auto bg-neutral-50/40 px-6 py-5 modern-scroll"
				}>
				{payrollPeriodId && (
					<div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs leading-relaxed text-neutral-700">
						Linked to payroll period{" "}
						<span className="font-semibold text-neutral-900">
							{periodCode || payrollPeriodId}
						</span>
					</div>
				)}

				<section className={sectionCardClass}>
					<div className="flex items-center justify-between gap-3">
						<div>
							<h3 className={sectionTitleClass}>Assignment</h3>
							{isPage && (
								<p className="mt-1 text-xs text-neutral-400">
									Who receives this payroll adjustment and which benefit type applies.
								</p>
							)}
						</div>
						{selectedBenefitType?.payrollDirection && (
							<span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
								{selectedBenefitType.payrollDirection}
							</span>
						)}
					</div>
					<div className="space-y-4">
						<div>
							<span className={fieldLabelClass}>
								{isEditing ? "Employee *" : "Employees *"}
							</span>
							<Controller
								control={control}
								name="employeeIds"
								render={({ field }) => {
									const selectedCount = field.value.length;
									const hasSelection = selectedCount > 0;
									const buttonLabel = isEditing
										? hasSelection
											? "Change employee"
											: "Select employee"
										: hasSelection
											? "Edit employees"
											: "Select employees";
									return (
										<div className="space-y-1.5">
											<div className="flex flex-wrap items-center gap-2">
												<Button
													type="button"
													variant="outline"
													className="h-10 rounded-lg border-neutral-200"
													onClick={() => setEmployeePickerOpen(true)}
													data-testid="select-employees-button">
													<Users className="mr-2 h-4 w-4" />
													{buttonLabel}
												</Button>
												{hasSelection && (
													<span
														className="text-xs font-medium text-neutral-600"
														data-testid="selected-employee-count">
														{isEditing
															? "1 employee selected"
															: selectedCount === 1
																? "1 employee selected"
																: `${selectedCount} employees selected`}
													</span>
												)}
											</div>
											{hasSelection && !isEditing && (
												<p className="text-xs text-neutral-400">
													Open the picker to review or change the selection.
												</p>
											)}
											{/* Selection is edited only in the modal — no chips on the form. */}
											<EmployeeMultiSelectModal
												open={employeePickerOpen}
												onOpenChange={setEmployeePickerOpen}
												selectedIds={field.value}
												onConfirm={(ids) => field.onChange(ids)}
												multi={!isEditing}
											/>
										</div>
									);
								}}
							/>
							{errors.employeeIds && (
								<p className={fieldErrorClass}>{errors.employeeIds.message as string}</p>
							)}
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<span className={fieldLabelClass}>Benefit type *</span>
							<Controller
								control={control}
								name="benefitTypeId"
								render={({ field }) => (
									<Select
										options={benefitTypeOptions}
										value={field.value}
										onChange={field.onChange}
										placeholder={
											benefitTypesLoading
												? "Loading benefit types..."
												: "Select benefit type"
										}
										error={!!errors.benefitTypeId}
										disabled={benefitTypesLoading}
									/>
								)}
							/>
							{errors.benefitTypeId && (
								<p className={fieldErrorClass}>{errors.benefitTypeId.message}</p>
							)}
						</div>
						<div>
							<label htmlFor="benefit-adjustment-name" className={fieldLabelClass}>
								Name *
							</label>
							<Input
								id="benefit-adjustment-name"
								className="h-10 rounded-lg border-neutral-200"
								placeholder="e.g. De Minimis Allowance"
								{...register("name")}
							/>
							{errors.name && (
								<p className={fieldErrorClass}>{errors.name.message}</p>
							)}
						</div>
						<div>
							<label htmlFor="benefit-adjustment-amount" className={fieldLabelClass}>
								{watchedAttendanceBased
									? watchedAttendanceAmountBasis === "PER_DAY"
										? "Rate per present day *"
										: watchedAttendanceAmountBasis === "PER_CUTOFF"
											? "Full amount for cut-off *"
											: "Amount *"
									: watchedScheduleMode === "RECURRING"
										? "Amount per payroll period *"
										: "Amount *"}
							</label>
							<Input
								id="benefit-adjustment-amount"
								className="h-10 rounded-lg border-neutral-200"
								type="number"
								min="0"
								step="0.01"
								placeholder="0.00"
								{...register("amount")}
							/>
							{errors.amount && (
								<p className={fieldErrorClass}>{errors.amount.message}</p>
							)}
							{watchedAttendanceBased ? (
								<p className={fieldHintClass}>
									{watchedAttendanceAmountBasis === "PER_DAY"
										? "Payroll multiplies this rate by present days (scheduled work days minus ABSENT)."
										: watchedAttendanceAmountBasis === "PER_CUTOFF"
											? "Payroll pro-rates this full cut-off amount for ABSENT days only."
											: "Select an attendance amount basis below."}
								</p>
							) : (
								watchedScheduleMode === "RECURRING" && (
									<p className={fieldHintClass}>
										Applied in full on each eligible payroll period while active.
									</p>
								)
							)}
						</div>
						</div>
					</div>

					<div className="space-y-3 border-t border-neutral-100 pt-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className={fieldLabelClass}>Compute from attendance</p>
								<p className={fieldHintClass}>
									When on, the payslip amount is calculated from timesheet attendance at
									payroll run.
								</p>
							</div>
							<Controller
								control={control}
								name="attendanceBased"
								render={({ field }) => (
									<Switch
										checked={field.value === true}
										data-testid="attendance-based-toggle"
										onCheckedChange={(checked) => {
											field.onChange(checked);
											if (!checked) {
												setValue("attendanceAmountBasis", undefined, {
													shouldValidate: true,
												});
											} else if (!watchedAttendanceAmountBasis) {
												setValue("attendanceAmountBasis", "PER_CUTOFF", {
													shouldValidate: true,
												});
											}
										}}
										className="mt-0.5 shrink-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-neutral-300"
									/>
								)}
							/>
						</div>
						{watchedAttendanceBased && (
							<div>
								<span className={fieldLabelClass}>Amount basis *</span>
								<Controller
									control={control}
									name="attendanceAmountBasis"
									render={({ field }) => (
										<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											{attendanceAmountBasisOptions.map((option) => {
												const selected = field.value === option.value;
												return (
													<button
														key={option.value}
														type="button"
														onClick={() => field.onChange(option.value)}
														className={[
															"rounded-xl border px-3.5 py-3 text-left transition-all",
															selected
																? "border-neutral-900 bg-neutral-50 shadow-sm ring-1 ring-neutral-200"
																: "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 hover:bg-white",
														].join(" ")}>
														<span
															className={[
																"block text-sm font-medium",
																selected ? "text-neutral-900" : "text-neutral-800",
															].join(" ")}>
															{option.label}
														</span>
														<span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
															{option.value === "PER_DAY"
																? "Enter a daily rate; paid = rate × present days"
																: "Enter full cut-off amount; reduced for each ABSENT day"}
														</span>
													</button>
												);
											})}
										</div>
									)}
								/>
								{errors.attendanceAmountBasis && (
									<p className={fieldErrorClass}>
										{errors.attendanceAmountBasis.message}
									</p>
								)}
							</div>
						)}
						{showPfaAttendanceBasedWarning && (
							<div data-testid={PFA_ATTENDANCE_BASED_WARNING_TEST_ID}>
								<Alert variant="warning" className="mt-1">
									<p className="text-sm font-semibold text-yellow-900">
										{PFA_ATTENDANCE_BASED_WARNING_TITLE}
									</p>
									<AlertDescription className="mt-1 text-yellow-900/90">
										{PFA_ATTENDANCE_BASED_WARNING_BODY}
									</AlertDescription>
								</Alert>
							</div>
						)}
					</div>
				</section>

				<section className={sectionCardClass}>
					<div>
						<h3 className={sectionTitleClass}>Schedule</h3>
						<p className="mt-1 text-xs text-neutral-400">
							Choose how installments are generated. The API confirms the final schedule.
						</p>
					</div>

					<div>
						<span className={fieldLabelClass}>Schedule mode *</span>
						<Controller
							control={control}
							name="scheduleMode"
							render={({ field }) => {
								const applyScheduleMode = (value: BenefitScheduleMode) => {
									field.onChange(value);
									if (value === "FIXED_INSTALLMENTS") {
										setValue("endDate", "", { shouldValidate: true });
										setValue("recurrenceFrequency", "EVERY_CUTOFF", {
											shouldValidate: true,
										});
									} else if (value === "RECURRING") {
										setValue("totalInstallments", undefined, {
											shouldValidate: true,
										});
										if (!watchedRecurrenceFrequency) {
											setValue("recurrenceFrequency", "EVERY_CUTOFF", {
												shouldValidate: true,
											});
										}
									} else {
										setValue("totalInstallments", undefined, {
											shouldValidate: true,
										});
										setValue("recurrenceFrequency", "EVERY_CUTOFF", {
											shouldValidate: true,
										});
									}
								};
								return (
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
										{scheduleModeOptions.map((option) => {
											const selected = field.value === option.value;
											return (
												<button
													key={option.value}
													type="button"
													onClick={() =>
														applyScheduleMode(option.value as BenefitScheduleMode)
													}
													className={[
														"rounded-xl border px-3.5 py-3 text-left transition-all",
														selected
															? "border-neutral-900 bg-neutral-50 shadow-sm ring-1 ring-neutral-200"
															: "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 hover:bg-white",
													].join(" ")}>
													<span
														className={[
															"block text-sm font-medium",
															selected ? "text-neutral-900" : "text-neutral-800",
														].join(" ")}>
														{option.label}
													</span>
													<span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
														{scheduleModeDescription(option.value)}
													</span>
												</button>
											);
										})}
										<select
											data-testid="schedule-mode"
											className="sr-only"
											aria-hidden="true"
											tabIndex={-1}
											value={field.value}
											onChange={(event) =>
												applyScheduleMode(
													event.target.value as BenefitScheduleMode,
												)
											}>
											{scheduleModeOptions.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								);
							}}
						/>
						{errors.scheduleMode && (
							<p className={fieldErrorClass}>{errors.scheduleMode.message}</p>
						)}
					</div>

					{watchedScheduleMode === "RECURRING" && (
						<div>
							<span className={fieldLabelClass}>Recurrence *</span>
							<Controller
								control={control}
								name="recurrenceFrequency"
								render={({ field }) => (
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
										{recurrenceFrequencyOptions.map((option) => {
											const selected = field.value === option.value;
											return (
												<button
													key={option.value}
													type="button"
													onClick={() => field.onChange(option.value)}
													className={[
														"rounded-xl border px-3.5 py-3 text-left transition-all",
														selected
															? "border-neutral-900 bg-neutral-50 shadow-sm ring-1 ring-neutral-200"
															: "border-neutral-200 bg-neutral-50/50 hover:border-neutral-300 hover:bg-white",
													].join(" ")}>
													<span
														className={[
															"block text-sm font-medium",
															selected ? "text-neutral-900" : "text-neutral-800",
														].join(" ")}>
														{option.label}
													</span>
													<span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
														{recurrenceFrequencyDescription(option.value)}
													</span>
												</button>
											);
										})}
										<select
											data-testid="recurrence-frequency"
											className="sr-only"
											aria-hidden="true"
											tabIndex={-1}
											value={field.value || "EVERY_CUTOFF"}
											onChange={(event) => field.onChange(event.target.value)}>
											{recurrenceFrequencyOptions.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								)}
							/>
							{errors.recurrenceFrequency && (
								<p className={fieldErrorClass}>
									{errors.recurrenceFrequency.message}
								</p>
							)}
							<p className={fieldHintClass}>
								Amount is per payment event (not annualized). Payroll creates an
								installment only on eligible periods for this cadence.
							</p>
						</div>
					)}

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<span className={fieldLabelClass}>Start date *</span>
							<Controller
								control={control}
								name="startDate"
								render={({ field }) => (
									<DatePicker
										value={field.value}
										onChange={field.onChange}
										placeholder="Select start date"
										className={errors.startDate ? "border-red-300" : ""}
									/>
								)}
							/>
							{errors.startDate && (
								<p className={fieldErrorClass}>{errors.startDate.message}</p>
							)}
						</div>
						{watchedScheduleMode === "FIXED_INSTALLMENTS" ? (
							<div>
								<label
									htmlFor="benefit-adjustment-installments"
									className={fieldLabelClass}>
									Installment Count *
								</label>
								<Input
									id="benefit-adjustment-installments"
									className="h-10 rounded-lg border-neutral-200"
									type="number"
									min="1"
									step="1"
									placeholder="e.g. 6"
									{...register("totalInstallments")}
								/>
								{errors.totalInstallments && (
									<p className={fieldErrorClass}>
										{errors.totalInstallments.message}
									</p>
								)}
								<p className={fieldHintClass}>
									Positive whole number. Remainder goes to the final installment.
								</p>
							</div>
						) : (
							<div>
								<span className={fieldLabelClass}>
									{watchedScheduleMode === "TIME_BOUND"
										? "End date *"
										: "End date (optional)"}
								</span>
								<Controller
									control={control}
									name="endDate"
									render={({ field }) => (
										<DatePicker
											value={field.value}
											onChange={field.onChange}
											placeholder={
												watchedScheduleMode === "RECURRING"
													? "Leave empty for open-ended"
													: "Select end date"
											}
											className={errors.endDate ? "border-red-300" : ""}
										/>
									)}
								/>
								{errors.endDate && (
									<p className={fieldErrorClass}>{errors.endDate.message}</p>
								)}
								<p className={fieldHintClass}>
									{watchedScheduleMode === "TIME_BOUND"
										? "One installment per overlapping payroll period."
										: "Leave empty to apply every payroll period until cancelled or deactivated."}
								</p>
							</div>
						)}
					</div>

					<div
						className={[
							"rounded-xl border px-3.5 py-3 text-sm",
							schedulePreview
								? "border-neutral-200 bg-neutral-50 text-neutral-800"
								: "border-dashed border-neutral-200 bg-neutral-50/80 text-neutral-400",
						].join(" ")}>
						<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
							Schedule preview
						</p>
						<p className="mt-1 text-sm font-medium leading-relaxed">
							{schedulePreview ||
								(watchedScheduleMode === "TIME_BOUND"
									? "Select a start and end date to estimate payroll periods."
									: watchedScheduleMode === "RECURRING"
										? "Enter amount and start date to preview the recurring schedule."
										: "Enter amount and installment count to estimate per-period amounts.")}
						</p>
					</div>
				</section>

				<section className={sectionCardClass}>
					<h3 className={sectionTitleClass}>Payroll & status</h3>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<span className={fieldLabelClass}>Payroll period</span>
							<Controller
								control={control}
								name="payrollPeriodId"
								render={({ field }) => (
									<Select
										options={payrollPeriodOptions}
										value={field.value || PAYROLL_PERIOD_NONE_VALUE}
										onChange={(value) => {
											field.onChange(
												value === PAYROLL_PERIOD_NONE_VALUE ? "" : value,
											);
										}}
										placeholder={
											payrollPeriodsLoading
												? "Loading payroll periods..."
												: "Optional period link"
										}
										disabled={payrollPeriodsLoading}
										error={!!errors.payrollPeriodId}
									/>
								)}
							/>
							{payrollPeriodsError && (
								<p className={fieldErrorClass}>
									Payroll periods could not be loaded.
								</p>
							)}
							{errors.payrollPeriodId && (
								<p className={fieldErrorClass}>
									{errors.payrollPeriodId.message}
								</p>
							)}
							<p className={fieldHintClass}>
								Optional link to a payroll run context. Not the schedule itself.
							</p>
						</div>
						<div>
							<span className={fieldLabelClass}>Status *</span>
							<Controller
								control={control}
								name="status"
								render={({ field }) => (
									<Select
										options={statusOptions}
										value={field.value}
										onChange={(value) => {
											field.onChange(value);
											setValue("isActive", value !== "CANCELLED");
										}}
										error={!!errors.status}
									/>
								)}
							/>
							<p className={fieldHintClass}>
								Active/Approved generate scheduled installments.
							</p>
						</div>
					</div>
				</section>

				<section className={sectionCardClass}>
					<h3 className={sectionTitleClass}>Notes</h3>
					<div className="space-y-4">
						<div>
							<label
								htmlFor="benefit-adjustment-description"
								className={fieldLabelClass}>
								Description
							</label>
							<Input
								id="benefit-adjustment-description"
								className="h-10 rounded-lg border-neutral-200"
								placeholder="Optional source or payroll context"
								{...register("description")}
							/>
							{errors.description && (
								<p className={fieldErrorClass}>{errors.description.message}</p>
							)}
						</div>
						<div>
							<label htmlFor="benefit-adjustment-notes" className={fieldLabelClass}>
								Notes
							</label>
							<textarea
								id="benefit-adjustment-notes"
								className="min-h-[84px] w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
								placeholder="Optional payroll note"
								{...register("notes")}
							/>
							{errors.notes && (
								<p className={fieldErrorClass}>{errors.notes.message}</p>
							)}
						</div>
					</div>
				</section>

				<div className="grid grid-cols-3 gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-xs shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
					<div className="min-w-0">
						<span className="block text-[11px] text-neutral-400">Direction</span>
						<span className="mt-0.5 block truncate font-medium text-neutral-800">
							{selectedBenefitType?.payrollDirection || "From type"}
						</span>
					</div>
					<div className="min-w-0">
						<span className="block text-[11px] text-neutral-400">Status</span>
						<span className="mt-0.5 block truncate font-medium text-neutral-800">
							{watchedStatus}
						</span>
					</div>
					<div className="min-w-0">
						<span className="block text-[11px] text-neutral-400">Active</span>
						<span className="mt-0.5 block truncate font-medium text-neutral-800">
							{watchedIsActive ? "Yes" : "No"}
						</span>
					</div>
				</div>
			</div>

			<div
				className={
					isPage
						? "flex items-center justify-end gap-2.5 border-t border-neutral-100 pt-5"
						: "flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-white px-6 py-4"
				}>
				<Button
					type="button"
					variant="outline"
					className="rounded-lg border-neutral-200"
					onClick={onCancel}
					disabled={isMutationPending}>
					{cancelLabel}
				</Button>
				<Button
					type="submit"
					className="rounded-lg bg-neutral-900 text-white shadow-sm hover:bg-neutral-800"
					disabled={isMutationPending}>
					{isMutationPending ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Saving
						</>
					) : (
						resolvedSubmitLabel
					)}
				</Button>
			</div>
		</form>
	);
}
