import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { useSearchParams } from "react-router";
import { Loader2, Users } from "lucide-react";
import { toast as sonnerToast } from "sonner";
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
		endDate?: string;
		startDate?: string;
		attendanceBased?: boolean;
		attendanceAmountBasis?: string;
	},
	ctx: z.RefinementCtx,
) => {
	if (data.endDate) {
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
	name: z
		.string()
		.trim()
		.min(1, "Enrollment name is required")
		.max(160, "Enrollment name is too long"),
	description: z.string().trim().max(500, "Description is too long").optional(),
	amount: z.coerce.number().positive("Amount must be greater than zero"),
	startDate: z.string().trim().min(1, "Start date is required"),
	endDate: z.string().trim().optional(),
	/** Always recurring for new enrollments (UI no longer offers other modes). */
	scheduleMode: z.literal("RECURRING").default("RECURRING"),
	recurrenceFrequency: z.enum(["EVERY_CUTOFF", "MONTHLY", "YEARLY"]).default("EVERY_CUTOFF"),
	attendanceBased: z.boolean().default(false),
	attendanceAmountBasis: z.enum(["PER_DAY", "PER_CUTOFF"]).optional(),
	eligibilityMode: z.enum(["ENROLLED_ALWAYS", "ATTENDANCE_QUALIFIED"]).default("ENROLLED_ALWAYS"),
	eligibilityDisqualifyOnAbsent: z.boolean().default(true),
	eligibilityDisqualifyOnLate: z.boolean().default(false),
	eligibilityDisqualifyOnUndertime: z.boolean().default(false),
	eligibilityDisqualifyOnLeave: z.boolean().default(false),
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

/** Bandai Perfect Attendance compensation benefit type code. */
export const PERFECT_ATTENDANCE_BENEFIT_TYPE_CODE = "PFA";

/**
 * Whether a benefit type code is Perfect Attendance (PFA).
 * Money path keys on code; seed display name may still be "Performance Bonus".
 */
export function isPerfectAttendanceBenefitTypeCode(code?: string | null): boolean {
	return String(code || "").trim().toUpperCase() === PERFECT_ATTENDANCE_BENEFIT_TYPE_CODE;
}

/** Classic Perfect Attendance: all-or-nothing with fixed full amount when clean. */
export const PFA_ELIGIBILITY_FORM_DEFAULTS = {
	eligibilityMode: "ATTENDANCE_QUALIFIED" as const,
	eligibilityDisqualifyOnAbsent: true,
	eligibilityDisqualifyOnLate: true,
	eligibilityDisqualifyOnUndertime: true,
	eligibilityDisqualifyOnLeave: true,
	attendanceBased: false,
	attendanceAmountBasis: undefined as undefined,
};

/** Perfect Attendance toggle maps to ATTENDANCE_QUALIFIED + classic flags. */
export function isPerfectAttendanceToggleOn(params: {
	eligibilityMode?: string | null;
}): boolean {
	return String(params.eligibilityMode || "").toUpperCase() === "ATTENDANCE_QUALIFIED";
}

/** Form fields when Perfect Attendance toggle turns ON (clears pro-rate). */
export function perfectAttendanceToggleFields(on: boolean) {
	if (on) {
		return {
			eligibilityMode: "ATTENDANCE_QUALIFIED" as const,
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: true,
			eligibilityDisqualifyOnUndertime: true,
			eligibilityDisqualifyOnLeave: true,
			attendanceBased: false,
			attendanceAmountBasis: undefined as undefined,
		};
	}
	return {
		eligibilityMode: "ENROLLED_ALWAYS" as const,
		eligibilityDisqualifyOnAbsent: true,
		eligibilityDisqualifyOnLate: false,
		eligibilityDisqualifyOnUndertime: false,
		eligibilityDisqualifyOnLeave: false,
	};
}

/** Form fields when Pro-rate from attendance turns ON (clears perfect attendance). */
export function proRateAttendanceToggleFields(on: boolean) {
	if (on) {
		return {
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF" as const,
			eligibilityMode: "ENROLLED_ALWAYS" as const,
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: false,
			eligibilityDisqualifyOnUndertime: false,
			eligibilityDisqualifyOnLeave: false,
		};
	}
	return {
		attendanceBased: false,
		attendanceAmountBasis: undefined as undefined,
	};
}

/** Short summary for the two optional toggles. */
export function buildAttendancePolicySummary(params: {
	eligibilityMode?: string | null;
	attendanceBased?: boolean | null;
}): string {
	const perfect = isPerfectAttendanceToggleOn(params);
	const proRate = params.attendanceBased === true;
	if (perfect) {
		return "Perfect Attendance on: full amount only if no absent, late, undertime, or leave; otherwise ₱0.";
	}
	if (proRate) {
		return "Pro-rate on: enrolled amount is reduced for ABSENT days only (still pays if enrolled).";
	}
	return "Both off: normal benefit — full enrolled amount when the schedule is due.";
}

const fieldLabelClass = "mb-1.5 block text-xs font-medium text-neutral-600";
const fieldErrorClass = "mt-1.5 text-xs text-red-600";
const fieldHintClass = "mt-1.5 text-[11px] leading-relaxed text-neutral-400";
const sectionCardClass =
	"space-y-4 rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const sectionTitleClass =
	"text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400";
const toggleRowClass =
	"flex items-start justify-between gap-4 rounded-xl border border-neutral-200/80 bg-neutral-50/50 px-4 py-3.5";

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
	// Local open state is always the source of truth for the picker so a URL/search-param
	// race cannot leave the Select employees dialog closed. Page mode also mirrors to
	// `?action=select-employees` for deep links / back-forward.
	const [localEmployeePickerOpen, setLocalEmployeePickerOpen] = useState(false);
	const urlEmployeePickerOpen =
		isPage && searchParams.get("action") === SELECT_EMPLOYEES_ACTION;
	const employeePickerOpen = localEmployeePickerOpen || urlEmployeePickerOpen;

	// Sync deep-link / drawer navigation that lands with action=select-employees.
	useEffect(() => {
		if (urlEmployeePickerOpen) {
			setLocalEmployeePickerOpen(true);
		}
	}, [urlEmployeePickerOpen]);

	const setEmployeePickerOpen = useCallback(
		(open: boolean) => {
			setLocalEmployeePickerOpen(open);
			if (!isPage) return;
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

	const preselectedBenefitTypeId =
		!isEditing ? searchParams.get("benefitTypeId") || "" : "";

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
			benefitTypeId: preselectedBenefitTypeId,
			payrollPeriodId: payrollPeriodId,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStart || formatDateForInput(new Date()),
			endDate: periodEnd,
			scheduleMode: "RECURRING",
			recurrenceFrequency: "EVERY_CUTOFF",
			attendanceBased: false,
			attendanceAmountBasis: undefined,
			eligibilityMode: "ENROLLED_ALWAYS",
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: false,
			eligibilityDisqualifyOnUndertime: false,
			eligibilityDisqualifyOnLeave: false,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		},
	});

	const watchedBenefitTypeId = watch("benefitTypeId");
	const watchedRecurrenceFrequency = watch("recurrenceFrequency");
	const watchedAmount = watch("amount");
	const watchedStartDate = watch("startDate");
	const watchedEndDate = watch("endDate");
	const watchedAttendanceBased = watch("attendanceBased");
	const watchedEligibilityMode = watch("eligibilityMode");
	const watchedStatus = watch("status");
	const perfectAttendanceOn = isPerfectAttendanceToggleOn({
		eligibilityMode: watchedEligibilityMode,
	});

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
				scheduleMode: "RECURRING",
				recurrenceFrequency:
					activeItem.recurrenceFrequency === "MONTHLY" ||
					activeItem.recurrenceFrequency === "YEARLY" ||
					activeItem.recurrenceFrequency === "EVERY_CUTOFF"
						? activeItem.recurrenceFrequency
						: "EVERY_CUTOFF",
				attendanceBased: activeItem.attendanceBased === true,
				attendanceAmountBasis:
					activeItem.attendanceAmountBasis === "PER_DAY" ||
					activeItem.attendanceAmountBasis === "PER_CUTOFF"
						? activeItem.attendanceAmountBasis
						: undefined,
				eligibilityMode:
					activeItem.eligibilityMode === "ATTENDANCE_QUALIFIED"
						? "ATTENDANCE_QUALIFIED"
						: "ENROLLED_ALWAYS",
				eligibilityDisqualifyOnAbsent: activeItem.eligibilityDisqualifyOnAbsent !== false,
				eligibilityDisqualifyOnLate: activeItem.eligibilityDisqualifyOnLate === true,
				eligibilityDisqualifyOnUndertime:
					activeItem.eligibilityDisqualifyOnUndertime === true,
				eligibilityDisqualifyOnLeave: activeItem.eligibilityDisqualifyOnLeave === true,
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

	// Prefill name/amount/eligibility only when the selected type **id** changes (not when
	// benefitTypes list identity churns from query re-renders), so HR toggles are not reset.
	const lastPrefillBenefitTypeIdRef = useRef<string>("");

	useEffect(() => {
		if (mode !== "create") return;
		reset({
			employeeIds: [],
			benefitTypeId: preselectedBenefitTypeId,
			payrollPeriodId: payrollPeriodId,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStart || formatDateForInput(new Date()),
			endDate: periodEnd,
			scheduleMode: "RECURRING",
			recurrenceFrequency: "EVERY_CUTOFF",
			attendanceBased: false,
			attendanceAmountBasis: undefined,
			eligibilityMode: "ENROLLED_ALWAYS",
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: false,
			eligibilityDisqualifyOnUndertime: false,
			eligibilityDisqualifyOnLeave: false,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		});
		// Allow prefill effect to run for preselected type (name, PFA defaults).
		lastPrefillBenefitTypeIdRef.current = "";
	}, [mode, payrollPeriodId, periodEnd, periodStart, preselectedBenefitTypeId, reset]);

	useEffect(() => {
		if (!watchedBenefitTypeId || isEditing) return;
		const benefitType = benefitTypes.find((item) => item.id === watchedBenefitTypeId);
		if (!benefitType) return;
		if (lastPrefillBenefitTypeIdRef.current === watchedBenefitTypeId) return;
		lastPrefillBenefitTypeIdRef.current = watchedBenefitTypeId;

		setValue("name", benefitType.name, { shouldValidate: true });
		if (benefitType.fixedAmount !== undefined && benefitType.fixedAmount !== null) {
			setValue("amount", Number(benefitType.fixedAmount), { shouldValidate: true });
		}

		// Prefill eligibility from type defaults, else classic PFA product defaults for code PFA.
		const typeMode = benefitType.defaultEligibilityMode;
		const isPfa = isPerfectAttendanceBenefitTypeCode(benefitType.code);
		if (typeMode === "ATTENDANCE_QUALIFIED" || typeMode === "ENROLLED_ALWAYS") {
			setValue("eligibilityMode", typeMode, { shouldValidate: true });
			if (benefitType.defaultEligibilityDisqualifyOnAbsent != null) {
				setValue(
					"eligibilityDisqualifyOnAbsent",
					benefitType.defaultEligibilityDisqualifyOnAbsent === true,
					{ shouldValidate: true },
				);
			}
			if (benefitType.defaultEligibilityDisqualifyOnLate != null) {
				setValue(
					"eligibilityDisqualifyOnLate",
					benefitType.defaultEligibilityDisqualifyOnLate === true,
					{ shouldValidate: true },
				);
			}
			if (benefitType.defaultEligibilityDisqualifyOnUndertime != null) {
				setValue(
					"eligibilityDisqualifyOnUndertime",
					benefitType.defaultEligibilityDisqualifyOnUndertime === true,
					{ shouldValidate: true },
				);
			}
			if (benefitType.defaultEligibilityDisqualifyOnLeave != null) {
				setValue(
					"eligibilityDisqualifyOnLeave",
					benefitType.defaultEligibilityDisqualifyOnLeave === true,
					{ shouldValidate: true },
				);
			}
		} else if (isPfa) {
			const pfa = perfectAttendanceToggleFields(true);
			setValue("eligibilityMode", pfa.eligibilityMode, { shouldValidate: true });
			setValue("eligibilityDisqualifyOnAbsent", pfa.eligibilityDisqualifyOnAbsent, {
				shouldValidate: true,
			});
			setValue("eligibilityDisqualifyOnLate", pfa.eligibilityDisqualifyOnLate!, {
				shouldValidate: true,
			});
			setValue("eligibilityDisqualifyOnUndertime", pfa.eligibilityDisqualifyOnUndertime!, {
				shouldValidate: true,
			});
			setValue("eligibilityDisqualifyOnLeave", pfa.eligibilityDisqualifyOnLeave!, {
				shouldValidate: true,
			});
			setValue("attendanceBased", false, { shouldValidate: true });
			setValue("attendanceAmountBasis", undefined, { shouldValidate: true });
		}
	}, [benefitTypes, isEditing, setValue, watchedBenefitTypeId]);

	const selectedBenefitType =
		benefitTypes.find((item) => item.id === watchedBenefitTypeId) ||
		(isEditing && activeItem?.benefitTypeId === watchedBenefitTypeId
			? activeItem.benefitType
			: undefined);

	const attendancePolicySummary = buildAttendancePolicySummary({
		eligibilityMode: watchedEligibilityMode,
		attendanceBased: watchedAttendanceBased,
	});

	const applyPerfectAttendanceToggle = (on: boolean) => {
		const fields = perfectAttendanceToggleFields(on);
		setValue("eligibilityMode", fields.eligibilityMode, { shouldValidate: true });
		setValue("eligibilityDisqualifyOnAbsent", fields.eligibilityDisqualifyOnAbsent, {
			shouldValidate: true,
		});
		setValue("eligibilityDisqualifyOnLate", fields.eligibilityDisqualifyOnLate ?? false, {
			shouldValidate: true,
		});
		setValue(
			"eligibilityDisqualifyOnUndertime",
			fields.eligibilityDisqualifyOnUndertime ?? false,
			{ shouldValidate: true },
		);
		setValue("eligibilityDisqualifyOnLeave", fields.eligibilityDisqualifyOnLeave ?? false, {
			shouldValidate: true,
		});
		if (on) {
			setValue("attendanceBased", false, { shouldValidate: true });
			setValue("attendanceAmountBasis", undefined, { shouldValidate: true });
		}
	};

	const applyProRateAttendanceToggle = (on: boolean) => {
		const fields = proRateAttendanceToggleFields(on);
		setValue("attendanceBased", fields.attendanceBased, { shouldValidate: true });
		setValue("attendanceAmountBasis", fields.attendanceAmountBasis, {
			shouldValidate: true,
		});
		if (on) {
			setValue("eligibilityMode", fields.eligibilityMode!, { shouldValidate: true });
			setValue(
				"eligibilityDisqualifyOnAbsent",
				fields.eligibilityDisqualifyOnAbsent ?? true,
				{ shouldValidate: true },
			);
			setValue("eligibilityDisqualifyOnLate", fields.eligibilityDisqualifyOnLate ?? false, {
				shouldValidate: true,
			});
			setValue(
				"eligibilityDisqualifyOnUndertime",
				fields.eligibilityDisqualifyOnUndertime ?? false,
				{ shouldValidate: true },
			);
			setValue(
				"eligibilityDisqualifyOnLeave",
				fields.eligibilityDisqualifyOnLeave ?? false,
				{ shouldValidate: true },
			);
		}
	};

	const schedulePreview = useMemo(() => {
		const amount = Number(watchedAmount || 0);
		if (amount <= 0 || !watchedStartDate) return null;
		const start = new Date(watchedStartDate);
		if (Number.isNaN(start.getTime())) return null;

		const cadence =
			watchedRecurrenceFrequency === "MONTHLY"
				? "each month on the 2nd cutoff (or sole monthly period)"
				: watchedRecurrenceFrequency === "YEARLY"
					? "once per fiscal year on the year-end cutoff"
					: "each payroll period";

		const amountPhrase = watchedAttendanceBased
			? `${formatCurrency(amount)} (pro-rated for ABSENT at payroll)`
			: perfectAttendanceOn
				? `${formatCurrency(amount)} when Perfect Attendance qualifies`
				: formatCurrency(amount);

		if (watchedEndDate) {
			const end = new Date(watchedEndDate);
			if (Number.isNaN(end.getTime()) || end < start) return null;
			return `${amountPhrase} ${cadence} from ${formatDate(watchedStartDate, "short")} to ${formatDate(watchedEndDate, "short")}.`;
		}
		return `${amountPhrase} ${cadence} from ${formatDate(watchedStartDate, "short")} until cancelled.`;
	}, [
		perfectAttendanceOn,
		watchedAmount,
		watchedAttendanceBased,
		watchedEndDate,
		watchedRecurrenceFrequency,
		watchedStartDate,
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
			scheduleMode: "RECURRING" as BenefitScheduleMode,
			recurrenceFrequency: data.recurrenceFrequency || "EVERY_CUTOFF",
			attendanceBased: data.attendanceBased === true,
			attendanceAmountBasis:
				data.attendanceBased === true
					? data.attendanceAmountBasis ?? "PER_CUTOFF"
					: null,
			eligibilityMode: data.eligibilityMode || "ENROLLED_ALWAYS",
			eligibilityDisqualifyOnAbsent: data.eligibilityDisqualifyOnAbsent !== false,
			eligibilityDisqualifyOnLate: data.eligibilityDisqualifyOnLate === true,
			eligibilityDisqualifyOnUndertime: data.eligibilityDisqualifyOnUndertime === true,
			eligibilityDisqualifyOnLeave: data.eligibilityDisqualifyOnLeave === true,
			...(normalizeOptional(data.endDate)
				? { endDate: normalizeOptional(data.endDate) }
				: {}),
			status: data.status,
			// Always active unless cancelled; UI no longer exposes isActive.
			isActive: data.status !== "CANCELLED",
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
		submitLabel || (isEditing ? "Save enrollment" : "Enroll employees");

	if (isEditing && isLoadingItem) {
		return (
			<div className="flex h-56 items-center justify-center text-sm text-neutral-500">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Loading enrollment...
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
							<h3 className={sectionTitleClass}>Enrollment</h3>
							{isPage && (
								<p className="mt-1 text-xs text-neutral-400">
									Who is being enrolled, which benefit type applies, and what to call this
									enrollment on payroll.
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
							<label htmlFor="benefit-enrollment-name" className={fieldLabelClass}>
								Enrollment name *
							</label>
							<Input
								id="benefit-enrollment-name"
								className="h-10 rounded-lg border-neutral-200"
								placeholder="e.g. Rice Subsidy"
								{...register("name")}
							/>
							{errors.name && (
								<p className={fieldErrorClass}>{errors.name.message}</p>
							)}
							<p className={fieldHintClass}>
								Shown on payroll and payslips for this enrollment (can differ from the benefit
								type name).
							</p>
						</div>
						<div>
							<label htmlFor="benefit-adjustment-amount" className={fieldLabelClass}>
								{watchedAttendanceBased
									? "Full amount for cut-off *"
									: "Amount per payroll period *"}
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
									Full cut-off amount; payroll reduces for ABSENT days only when Pro-rate
									from attendance is on.
								</p>
							) : perfectAttendanceOn ? (
								<p className={fieldHintClass}>
									Full amount only with perfect attendance this period; otherwise ₱0.
								</p>
							) : (
								<p className={fieldHintClass}>
									Applied on each eligible payroll period for the chosen recurrence
									while active.
								</p>
							)}
						</div>
						</div>
					</div>
				</section>

				<section className={sectionCardClass} data-testid="attendance-rules-section">
					<div>
						<h3 className={sectionTitleClass}>Attendance (optional)</h3>
						<p className="mt-1 text-xs text-neutral-500">
							Leave both off for a normal fixed benefit. Use at most one option — they turn
							each other off.
						</p>
						<p
							className="mt-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-600"
							data-testid="attendance-policy-summary">
							{attendancePolicySummary}
						</p>
					</div>

					<div className={toggleRowClass}>
						<div className="min-w-0 pr-2">
							<p className="text-sm font-semibold text-neutral-900">
								Perfect Attendance
							</p>
							<p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
								All-or-nothing. Full enrolled amount only if the period has no absent,
								late, undertime, or leave — otherwise ₱0.
							</p>
							<p className="mt-1 text-[11px] text-neutral-400">
								Example: ₱1,000 bonus; late once → ₱0 for that cutoff.
							</p>
						</div>
						<Switch
							checked={perfectAttendanceOn}
							data-testid="perfect-attendance-toggle"
							onCheckedChange={(checked) => applyPerfectAttendanceToggle(checked === true)}
							className="mt-0.5 shrink-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-neutral-300"
						/>
					</div>

					<div className={toggleRowClass}>
						<div className="min-w-0 pr-2">
							<p className="text-sm font-semibold text-neutral-900">
								Pro-rate from attendance
							</p>
							<p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
								Still pays when enrolled. Amount is reduced only for ABSENT days (full
								cut-off pro-rate). Late and leave do not zero the benefit.
							</p>
							<p className="mt-1 text-[11px] text-neutral-400">
								Example: ₱500 allowance; 2 of 10 work days absent → about ₱400.
							</p>
						</div>
						{/* Keep data-testid for existing tests */}
						<Switch
							checked={watchedAttendanceBased === true}
							data-testid="attendance-based-toggle"
							onCheckedChange={(checked) =>
								applyProRateAttendanceToggle(checked === true)
							}
							className="mt-0.5 shrink-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-neutral-300"
						/>
					</div>
				</section>

				<section className={sectionCardClass} data-testid="schedule-section">
					<div>
						<h3 className={sectionTitleClass}>Schedule</h3>
						<p className="mt-1 text-xs text-neutral-500">
							Recurring benefit: pays on the cadence below from the start date until
							cancelled or the optional end date.
						</p>
					</div>

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
							<p className={fieldErrorClass}>{errors.recurrenceFrequency.message}</p>
						)}
						<p className={fieldHintClass}>
							Amount is per payment event (not annualized). Payroll creates an installment
							only on eligible periods for this cadence.
						</p>
					</div>

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
						<div>
							<span className={fieldLabelClass}>End date (optional)</span>
							<Controller
								control={control}
								name="endDate"
								render={({ field }) => (
									<DatePicker
										value={field.value}
										onChange={field.onChange}
										placeholder="Leave empty for open-ended"
										className={errors.endDate ? "border-red-300" : ""}
									/>
								)}
							/>
							{errors.endDate && (
								<p className={fieldErrorClass}>{errors.endDate.message}</p>
							)}
							<p className={fieldHintClass}>
								Leave empty to apply until cancelled or deactivated.
							</p>
						</div>
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
								"Enter amount and start date to preview the recurring schedule."}
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

				<div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-xs shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
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
