import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { DatePicker } from "~/components/atoms/DatePicker";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	HrDataTableManagerFilter,
	hrDataTableDepartmentFilterClass,
	hrDataTableFilterClass,
} from "~/components/molecules/HrDataTableFilters";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useBenefitTypes } from "~/lib/hooks/useBenefitTypes";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useSections } from "~/lib/hooks/useSections";
import {
	queryKeys as employeeBenefitQueryKeys,
	useCreateEmployeeBenefit,
	useDeleteEmployeeBenefit,
	useEmployeeBenefit,
	useEmployeeBenefits,
	useUpdateEmployeeBenefit,
} from "~/lib/hooks/useEmployeeBenefits";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useAuth } from "~/lib/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, formatDateForInput } from "~/lib/utils/text-utils";
import type {
	EmployeeBenefit,
	CreateEmployeeBenefitRequest,
	UpdateEmployeeBenefitRequest,
} from "~/services/employee-benefit.service";
import type { Employee } from "~/services/employees.service";
import type { PayrollPeriod } from "~/services/payroll-periods.service";

interface BenefitsManagementProps {
	title?: string;
	description?: string;
}

const BenefitStatusSchema = z.enum([
	"PENDING",
	"APPROVED",
	"ACTIVE",
	"COMPLETED",
	"CANCELLED",
	"DEFAULTED",
]);

const EmployeeBenefitFormSchema = z
	.object({
		employeeId: z.string().trim().min(1, "Employee is required"),
		benefitTypeId: z.string().trim().min(1, "Benefit type is required"),
		payrollPeriodId: z.string().trim().optional(),
		name: z.string().trim().min(1, "Name is required").max(160, "Name is too long"),
		description: z.string().trim().max(500, "Description is too long").optional(),
		amount: z.coerce.number().positive("Amount must be greater than zero"),
		startDate: z.string().trim().min(1, "Start date is required"),
		endDate: z.string().trim().optional(),
		status: BenefitStatusSchema.default("ACTIVE"),
		isActive: z.boolean().default(true),
		notes: z.string().trim().max(500, "Notes are too long").optional(),
	})
	.superRefine((data, ctx) => {
		if (!data.endDate) return;
		const start = new Date(data.startDate);
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
	});

type EmployeeBenefitFormData = z.infer<typeof EmployeeBenefitFormSchema>;

const statusOptions: SelectOption[] = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "PENDING", label: "Pending" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "CANCELLED", label: "Cancelled" },
	{ value: "DEFAULTED", label: "Defaulted" },
];

const PAYROLL_PERIOD_NONE_VALUE = "__none__";
const BENEFIT_CODE_PRESETS: Record<string, string[]> = {
	attendance: ["PFA"],
	allowance: ["DMA", "HYS", "LLA", "LVP", "MLA", "OBA", "OTM", "TSA"],
	deduction: ["MHDMF2", "UFD"],
	overtime: ["AON"],
};
const sourceCategoryLabels: Record<string, string> = {
	attendance: "Attendance",
	allowance: "Allowances",
	deduction: "Deductions",
	overtime: "OT",
};

const getEmployeeName = (employee?: any) => {
	const personalInfo = employee?.person?.personalInfo || {};
	const parts = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
		.map((part) => String(part || "").trim())
		.filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
};

const getEmployeeLabel = (employee: Employee) => {
	const name = getEmployeeName(employee);
	const position = employee.position?.title ? ` - ${employee.position.title}` : "";
	return `${name} (${employee.employeeId})${position}`;
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

type PayrollPeriodLabelInput = {
	name?: string | null;
	code?: string | null;
	startDate?: string | null;
	endDate?: string | null;
	status?: PayrollPeriod["status"] | null;
};

const getPayrollPeriodOptionLabel = (period: PayrollPeriodLabelInput) => {
	const name = String(period.name || period.code || "Payroll period").trim();
	const code = period.code && period.code !== name ? ` (${period.code})` : "";
	const dateRange =
		period.startDate && period.endDate
			? ` - ${formatDate(period.startDate, "short")} to ${formatDate(period.endDate, "short")}`
			: "";
	const status = period.status ? ` - ${period.status}` : "";
	return `${name}${code}${dateRange}${status}`;
};

export function BenefitsManagement({
	title = "Benefits Management",
	description = "Manage employee payroll benefits and adjustments",
}: BenefitsManagementProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { user } = useAuth();

	const searchQuery = searchParams.get("search") || "";
	const statusFilter = searchParams.get("status") || "";
	const departmentFilter = searchParams.get("departmentId") || "";
	const sectionFilter = searchParams.get("sectionId") || "";
	const managerFilter = searchParams.get("managerId") || "";
	const payrollPeriodIdParam = searchParams.get("payrollPeriodId") || "";
	const periodCodeParam = searchParams.get("periodCode") || "";
	const periodViewParam = searchParams.get("periodView") || "";
	const periodStartParam = searchParams.get("periodStart") || "";
	const periodEndParam = searchParams.get("periodEnd") || "";
	const adjustmentFilterParam = searchParams.get("adjustment") || "";
	const sourceCategoryParam =
		searchParams.get("sourceCategory") || adjustmentFilterParam || "";
	const codeParam =
		searchParams.get("code") ||
		(BENEFIT_CODE_PRESETS[sourceCategoryParam]?.join(",") ?? "");
	const rawDirectionParam = (searchParams.get("direction") || "").toUpperCase();
	const directionParam =
		rawDirectionParam === "COMPENSATION" || rawDirectionParam === "DEDUCTION"
			? rawDirectionParam
			: "";
	const returnToParam = searchParams.get("returnTo") || "";
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const activeId = action === "edit" || action === "view" || action === "delete" ? id : null;
	const isEditing = action === "edit";
	const isCreateOrEdit = action === "create" || action === "edit";

	const benefitFilterParts = [
		departmentFilter ? `employee.departmentId:${departmentFilter}` : "",
		sectionFilter ? `employee.sectionId:${sectionFilter}` : "",
		managerFilter ? `employee.reportToId:${managerFilter}` : "",
		statusFilter ? `status:${statusFilter}` : "",
		payrollPeriodIdParam ? `payrollPeriodId:${payrollPeriodIdParam}` : "",
		!payrollPeriodIdParam && periodCodeParam
			? `payrollPeriod.code:${periodCodeParam}`
			: "",
		...codeParam
			.split(",")
			.map((code) => code.trim().toUpperCase())
			.filter(Boolean)
			.map((code) => `benefitType.code:${code}`),
		directionParam ? `benefitType.payrollDirection:${directionParam}` : "",
	].filter(Boolean);

	const { data: benefitsData, isLoading } = useEmployeeBenefits({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: benefitFilterParts.join(",") || undefined,
		sort: "createdAt",
		order: "desc",
		count: true,
	});
	const { data: activeItem, isLoading: isLoadingItem } = useEmployeeBenefit(activeId || "");
	const { data: benefitTypesData, isLoading: benefitTypesLoading } = useBenefitTypes({
		page: 1,
		limit: 500,
		filter: "isActive:true",
		sort: "name",
		order: "asc",
		count: true,
	});
	const { data: employeesData, isLoading: employeesLoading } = useEmployees({
		page: 1,
		limit: 1000,
		sort: "employeeId",
		order: "asc",
		count: true,
	});
	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 100,
		sort: "name",
		order: "asc",
	});
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
		count: true,
	});
	const {
		data: payrollPeriodsData,
		isLoading: payrollPeriodsLoading,
		isError: payrollPeriodsError,
	} = usePayrollPeriods(
		{
			page: 1,
			limit: 1000,
			sort: "startDate",
			order: "desc",
			count: true,
		},
		isCreateOrEdit,
	);

	const createMutation = useCreateEmployeeBenefit();
	const updateMutation = useUpdateEmployeeBenefit();
	const deleteMutation = useDeleteEmployeeBenefit();

	const benefitTypes = useMemo(
		() => benefitTypesData?.benefitTypes || [],
		[benefitTypesData?.benefitTypes],
	);
	const employees = useMemo<Employee[]>(
		() => (employeesData as any)?.employees || [],
		[employeesData],
	);
	const departments = useMemo(
		() => (departmentsData as any)?.departments || [],
		[departmentsData],
	);
	const sections = useMemo(
		() => (sectionsData as any)?.sections || [],
		[sectionsData],
	);
	const payrollPeriods = useMemo<PayrollPeriod[]>(() => {
		const payload = payrollPeriodsData as any;
		return payload?.payrollPeriods || payload?.data?.payrollPeriods || [];
	}, [payrollPeriodsData]);

	const employeeOptions = useMemo<SelectOption[]>(
		() =>
			(employees as Employee[]).map((employee) => ({
				value: employee.id,
				label: getEmployeeLabel(employee),
			})),
		[employees],
	);

	const benefitTypeOptions = useMemo<SelectOption[]>(
		() =>
			benefitTypes.map((benefitType) => ({
				value: benefitType.id,
				label: `${benefitType.name}${benefitType.code ? ` (${benefitType.code})` : ""}`,
			})),
		[benefitTypes],
	);
	const benefitCodeOptions = useMemo<SelectOption[]>(
		() => [
			{ value: "all", label: "All sources" },
			...Array.from(
				new Map(
					benefitTypes
						.filter((benefitType) => benefitType.code)
						.map((benefitType) => [
							String(benefitType.code).toUpperCase(),
							{
								value: String(benefitType.code).toUpperCase(),
								label: `${benefitType.code} - ${benefitType.name}`,
							},
						]),
				).values(),
			),
		],
		[benefitTypes],
	);
	const directionOptions: SelectOption[] = [
		{ value: "all", label: "All directions" },
		{ value: "COMPENSATION", label: "Compensation" },
		{ value: "DEDUCTION", label: "Deductions" },
	];
	const benefitAdvancedFilters = [
		{
			key: "code",
			label: "Source",
			options: benefitCodeOptions.filter((option) => option.value !== "all"),
		},
		{
			key: "direction",
			label: "Direction",
			options: directionOptions.filter((option) => option.value !== "all"),
		},
		{
			key: "status",
			label: "Status",
			options: statusOptions,
		},
	];
	const benefitAdvancedFilterValues = {
		code: codeParam && !codeParam.includes(",") ? codeParam.toUpperCase() : "",
		direction: directionParam || "",
		status: statusFilter || "",
	};

	const managerOptions = useMemo<SelectOption[]>(
		() => {
			const managerIds = new Set(
				(employees as Employee[])
					.map((employee) => employee.reportToId)
					.filter((id): id is string => Boolean(id)),
			);
			return [
				{ value: "all", label: "All Manager" },
				...(employees as Employee[])
					.filter((employee) => managerIds.has(employee.id) || Boolean(employee.isManager))
					.map((employee) => ({
						value: employee.id,
						label: getEmployeeLabel(employee),
					})),
			];
		},
		[employees],
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

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const closeModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

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
			employeeId: "",
			benefitTypeId: "",
			payrollPeriodId: payrollPeriodIdParam,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStartParam || formatDateForInput(new Date()),
			endDate: periodEndParam,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		},
	});

	const watchedBenefitTypeId = watch("benefitTypeId");
	const watchedPayrollPeriodId = watch("payrollPeriodId");
	const watchedStatus = watch("status");
	const watchedIsActive = watch("isActive");

	useEffect(() => {
		if (isEditing && !isLoadingItem && activeItem) {
			reset({
				employeeId: activeItem.employeeId || "",
				benefitTypeId: activeItem.benefitTypeId || "",
				payrollPeriodId: activeItem.payrollPeriodId || payrollPeriodIdParam,
				name: activeItem.name || activeItem.benefitType?.name || "",
				description: activeItem.description || "",
				amount: Number(activeItem.amount || 0),
				startDate:
					formatDateForInput(activeItem.startDate) ||
					periodStartParam ||
					formatDateForInput(new Date()),
				endDate: formatDateForInput(activeItem.endDate) || "",
				status: (activeItem.status as EmployeeBenefitFormData["status"]) || "ACTIVE",
				isActive: activeItem.isActive ?? true,
				notes: activeItem.notes || "",
			});
		}
	}, [activeItem, isEditing, isLoadingItem, payrollPeriodIdParam, periodStartParam, reset]);

	useEffect(() => {
		if (action !== "create") return;
		reset({
			employeeId: "",
			benefitTypeId: "",
			payrollPeriodId: payrollPeriodIdParam,
			name: "",
			description: "",
			amount: 0,
			startDate: periodStartParam || formatDateForInput(new Date()),
			endDate: periodEndParam,
			status: "ACTIVE",
			isActive: true,
			notes: "",
		});
	}, [action, payrollPeriodIdParam, periodEndParam, periodStartParam, reset]);

	useEffect(() => {
		if (!watchedBenefitTypeId || isEditing) return;
		const benefitType = benefitTypes.find((item) => item.id === watchedBenefitTypeId);
		if (!benefitType) return;
		setValue("name", benefitType.name, { shouldValidate: true });
		if (benefitType.fixedAmount !== undefined && benefitType.fixedAmount !== null) {
			setValue("amount", Number(benefitType.fixedAmount), { shouldValidate: true });
		}
	}, [benefitTypes, isEditing, setValue, watchedBenefitTypeId]);

	const selectedBenefitType = benefitTypes.find((item) => item.id === watchedBenefitTypeId);
	const selectedActiveItem = activeItem || null;
	const selectedPayrollPeriod =
		payrollPeriods.find((period) => String(period.id) === String(watchedPayrollPeriodId)) ||
		selectedActiveItem?.payrollPeriod ||
		null;
	const periodContext =
		(selectedPayrollPeriod ? getPayrollPeriodOptionLabel(selectedPayrollPeriod) : "") ||
		periodCodeParam ||
		(watchedPayrollPeriodId ? "Selected payroll period" : "No payroll period selected");
	const runPayrollReturnUrl = useMemo(() => {
		const params = new URLSearchParams();
		if (periodCodeParam) params.set("periodCode", periodCodeParam);
		if (periodViewParam) params.set("periodView", periodViewParam);
		if (departmentFilter) params.set("departmentId", departmentFilter);
		if (sectionFilter) params.set("sectionId", sectionFilter);
		if (adjustmentFilterParam) params.set("adjustment", adjustmentFilterParam);
		return `/hr/run-payroll${params.toString() ? `?${params.toString()}` : ""}`;
	}, [
		adjustmentFilterParam,
		departmentFilter,
		periodCodeParam,
		periodViewParam,
		sectionFilter,
	]);

	const openCreate = () => {
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", item.id);
		});
	};

	const openView = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const openDelete = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const onSubmit = (data: EmployeeBenefitFormData) => {
		const payload = {
			employeeId: data.employeeId,
			benefitTypeId: data.benefitTypeId,
			payrollPeriodId:
				data.payrollPeriodId === PAYROLL_PERIOD_NONE_VALUE
					? undefined
					: normalizeOptional(data.payrollPeriodId),
			name: data.name.trim(),
			description: normalizeOptional(data.description),
			amount: Number(data.amount),
			startDate: data.startDate,
			endDate: normalizeOptional(data.endDate),
			status: data.status,
			isActive: data.isActive,
			notes: normalizeOptional(data.notes),
		};

		if (isEditing && activeItem) {
			updateMutation.mutate(
				{ id: activeItem.id, data: payload as UpdateEmployeeBenefitRequest },
				{
					onSuccess: () => {
						queryClient.invalidateQueries({
							queryKey: employeeBenefitQueryKeys.employeeBenefits.all,
						});
						closeModal();
					},
				},
			);
			return;
		}

		if (!user?.organizationId) {
			sonnerToast.error("Organization not found. Please refresh.");
			return;
		}

		createMutation.mutate(
			{
				...payload,
				organizationId: user.organizationId,
			} as CreateEmployeeBenefitRequest,
			{
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: employeeBenefitQueryKeys.employeeBenefits.all,
				});
				closeModal();
			},
			},
		);
	};

	const confirmDelete = () => {
		if (!activeItem) return;
		deleteMutation.mutate(activeItem.id, {
			onSuccess: () => closeModal(),
		});
	};

	const columns: Column<EmployeeBenefit>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "240px",
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-gray-900">
						{getEmployeeName(item.employee)}
					</p>
					<p className="truncate text-xs text-gray-500">
						{(item.employee as any)?.employeeId || item.employeeId || "-"}
					</p>
				</div>
			),
		},
		{
			key: "benefitType",
			label: "Benefit Type",
			width: "220px",
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-gray-900">
						{item.benefitType?.name || item.name || "Benefit"}
					</p>
					<p className="truncate text-xs text-gray-500">
						{item.benefitType?.code || item.benefitType?.category || "-"}
					</p>
				</div>
			),
		},
		{
			key: "payrollPeriod",
			label: "Payroll Period",
			width: "180px",
			render: (_value, item) => (
				<div className="min-w-0">
					<p className="truncate text-sm text-gray-900">
						{item.payrollPeriod?.code || item.payrollPeriod?.name || "-"}
					</p>
					{item.payrollPeriod?.startDate && (
						<p className="truncate text-xs text-gray-500">
							{formatDate(item.payrollPeriod.startDate, "short")} -{" "}
							{formatDate(item.payrollPeriod.endDate, "short")}
						</p>
					)}
				</div>
			),
		},
		{
			key: "amount",
			label: "Amount",
			width: "130px",
			render: (value, item) => {
				const isDeduction = item.benefitType?.payrollDirection === "DEDUCTION";
				return (
					<span className="font-semibold tabular-nums text-gray-900">
						{isDeduction ? "-" : "+"}
						{formatCurrency(value as number)}
					</span>
				);
			},
		},
		{
			key: "status",
			label: "Status",
			width: "120px",
			render: (value, item) => (
				<div className="flex flex-wrap gap-1">
					<StatusBadge status={String(value || "PENDING")} />
					{!item.isActive && <Badge variant="secondary">Inactive</Badge>}
				</div>
			),
		},
		{
			key: "notes",
			label: "Notes",
			width: "220px",
			render: (value) => (
				<span className="block max-w-[220px] truncate text-sm text-gray-600" title={String(value || "")}>
					{value ? String(value) : "-"}
				</span>
			),
		},
	];

	const renderActions = (item: EmployeeBenefit) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-8 w-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => openView(item)}>
					<Eye className="mr-2 h-4 w-4" />
					View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="mr-2 h-4 w-4" />
					Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => openDelete(item)} className="text-red-600">
					<Trash2 className="mr-2 h-4 w-4" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const isMutationPending =
		createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
	const modalTitle = isEditing ? "Edit Payroll Adjustment" : "Add Payroll Adjustment";
	const activeSourceLabel =
		sourceCategoryLabels[sourceCategoryParam] ||
		(codeParam ? codeParam.toUpperCase() : "");

	return (
		<div className="space-y-6">
			{returnToParam === "run-payroll" && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						navigate(runPayrollReturnUrl);
					}}
					className="h-9">
					<ArrowLeft className="h-4 w-4" />
					Back to Run Payroll
				</Button>
			)}

			{(activeSourceLabel || directionParam || periodCodeParam || payrollPeriodIdParam) && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
					<span className="font-medium text-gray-800">Filtered source</span>
					{activeSourceLabel && <Badge variant="secondary">{activeSourceLabel}</Badge>}
					{codeParam && <Badge variant="outline">{codeParam.toUpperCase()}</Badge>}
					{directionParam && <Badge variant="outline">{directionParam}</Badge>}
					{(periodCodeParam || payrollPeriodIdParam) && (
						<Badge variant="outline">{periodCodeParam || payrollPeriodIdParam}</Badge>
					)}
				</div>
			)}

			<DataTable
				title={title}
				description={description}
				data={benefitsData?.employeeBenefits || []}
				columns={columns}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No payroll benefits found"
				emptyDescription="Add a payroll-period benefit or adjustment to make it available to Run Payroll."
				searchWidth="w-80"
				searchPlaceholder="Search employees or benefits..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={benefitsData?.pagination?.total || 0}
				searchValue={searchQuery}
				onSearch={(query) => {
					updateSearchParams((next) => {
						if (query) {
							next.set("search", query);
						} else {
							next.delete("search");
						}
						next.set("page", "1");
					});
				}}
				onPageChange={(page) => {
					updateSearchParams((next) => next.set("page", String(page)));
				}}
				filters={benefitAdvancedFilters}
				filterValues={benefitAdvancedFilterValues}
				filterButtonLabel="Advanced Filters"
				onFilterChange={(filters) => {
					updateSearchParams((next) => {
						const keys = ["code", "direction", "status"] as const;
						keys.forEach((key) => {
							const value = filters[key];
							if (!value || value === "all") {
								next.delete(key);
							} else {
								next.set(key, value);
							}
						});
						next.set("page", "1");
					});
				}}
				onAdd={openCreate}
				addButtonLabel="Add Adjustment"
				addButtonClassName="bg-orange-600 hover:bg-orange-700 text-white"
				customFilters={
					<>
						<div className={hrDataTableDepartmentFilterClass}>
							<DepartmentSectionPicker
								variant="datatable"
								departments={departments}
								sections={sections}
								departmentId={departmentFilter}
								sectionId={sectionFilter}
								className="w-full sm:w-full"
								onDepartmentChange={(value) => {
									updateSearchParams((next) => {
										if (value === "all") {
											next.delete("departmentId");
											next.delete("sectionId");
										} else {
											next.set("departmentId", value);
											next.delete("sectionId");
										}
										next.set("page", "1");
									});
								}}
								onSectionChange={(departmentId, sectionId) => {
									updateSearchParams((next) => {
										next.set("departmentId", departmentId);
										next.set("sectionId", sectionId);
										next.set("page", "1");
									});
								}}
							/>
						</div>
						<div className={hrDataTableFilterClass}>
							<HrDataTableManagerFilter
								value={managerFilter || "all"}
								onValueChange={(value) => {
									updateSearchParams((next) => {
										if (value === "all") {
											next.delete("managerId");
										} else {
											next.set("managerId", value);
										}
										next.set("page", "1");
									});
								}}
								options={managerOptions}
								dataUi="timesheet-manager-trigger"
							/>
						</div>
					</>
				}
			/>

			<Modal
				open={isCreateOrEdit}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title={modalTitle}
				description={periodContext}
				className="max-h-[min(88vh,760px)] w-[calc(100vw-1rem)] max-w-3xl overflow-hidden p-0 [&>div:first-child]:px-6 [&>div:first-child]:pb-3 [&>div:first-child]:pt-5 [&>div:first-child]:pr-14">
				{isEditing && isLoadingItem ? (
					<div className="flex h-56 items-center justify-center text-sm text-gray-500">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Loading adjustment...
					</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-col">
						<div className="max-h-[calc(min(88vh,760px)-9rem)] space-y-4 overflow-y-auto px-6 py-4 pr-8">
							{payrollPeriodIdParam && (
								<div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
									This adjustment will be linked to payroll period{" "}
									<span className="font-semibold">
										{periodCodeParam || payrollPeriodIdParam}
									</span>
									.
								</div>
							)}

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Employee *
									</span>
									<Controller
										control={control}
										name="employeeId"
										render={({ field }) => (
											<Select
												options={employeeOptions}
												value={field.value}
												onChange={field.onChange}
												placeholder={
													employeesLoading ? "Loading employees..." : "Select employee"
												}
												error={!!errors.employeeId}
												disabled={employeesLoading || isEditing}
											/>
										)}
									/>
									{errors.employeeId && (
										<p className="mt-1 text-xs text-red-600">
											{errors.employeeId.message}
										</p>
									)}
								</div>
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Benefit Type *
									</span>
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
										<p className="mt-1 text-xs text-red-600">
											{errors.benefitTypeId.message}
										</p>
									)}
								</div>
								<div>
									<label
										htmlFor="benefit-adjustment-name"
										className="mb-1 block text-sm font-medium text-gray-700">
										Name *
									</label>
									<Input
										id="benefit-adjustment-name"
										className="h-10"
										placeholder="e.g. De Minimis Allowance"
										{...register("name")}
									/>
									{errors.name && (
										<p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
									)}
								</div>
								<div>
									<label
										htmlFor="benefit-adjustment-amount"
										className="mb-1 block text-sm font-medium text-gray-700">
										Amount *
									</label>
									<Input
										id="benefit-adjustment-amount"
										className="h-10"
										type="number"
										min="0"
										step="0.01"
										placeholder="0.00"
										{...register("amount")}
									/>
									{errors.amount && (
										<p className="mt-1 text-xs text-red-600">
											{errors.amount.message}
										</p>
									)}
								</div>
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Start Date *
									</span>
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
										<p className="mt-1 text-xs text-red-600">
											{errors.startDate.message}
										</p>
									)}
								</div>
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										End Date
									</span>
									<Controller
										control={control}
										name="endDate"
										render={({ field }) => (
											<DatePicker
												value={field.value}
												onChange={field.onChange}
												placeholder="Select end date"
												className={errors.endDate ? "border-red-300" : ""}
											/>
										)}
									/>
									{errors.endDate && (
										<p className="mt-1 text-xs text-red-600">
											{errors.endDate.message}
										</p>
									)}
								</div>
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Status *
									</span>
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
								</div>
								<div>
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Payroll Period
									</span>
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
														: "Select payroll period"
												}
												disabled={payrollPeriodsLoading}
												error={!!errors.payrollPeriodId}
											/>
										)}
									/>
									{payrollPeriodsError && (
										<p className="mt-1 text-xs text-red-600">
											Payroll periods could not be loaded.
										</p>
									)}
									{errors.payrollPeriodId && (
										<p className="mt-1 text-xs text-red-600">
											{errors.payrollPeriodId.message}
										</p>
									)}
								</div>
								<div className="md:col-span-2">
									<label
										htmlFor="benefit-adjustment-description"
										className="mb-1 block text-sm font-medium text-gray-700">
										Description
									</label>
									<Input
										id="benefit-adjustment-description"
										className="h-10"
										placeholder="Optional source or payroll context"
										{...register("description")}
									/>
									{errors.description && (
										<p className="mt-1 text-xs text-red-600">
											{errors.description.message}
										</p>
									)}
								</div>
								<div className="md:col-span-2">
									<label
										htmlFor="benefit-adjustment-notes"
										className="mb-1 block text-sm font-medium text-gray-700">
										Notes
									</label>
									<textarea
										id="benefit-adjustment-notes"
										className="min-h-[76px] w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
										placeholder="Optional payroll note"
										{...register("notes")}
									/>
									{errors.notes && (
										<p className="mt-1 text-xs text-red-600">{errors.notes.message}</p>
									)}
								</div>
							</div>

							<div className="grid gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:grid-cols-3">
								<div className="min-w-0">
									<span className="block text-gray-500">Direction</span>
									<span className="truncate font-medium text-gray-900">
										{selectedBenefitType?.payrollDirection || "From benefit type"}
									</span>
								</div>
								<div className="min-w-0">
									<span className="block text-gray-500">Status</span>
									<span className="truncate font-medium text-gray-900">
										{watchedStatus}
									</span>
								</div>
								<div className="min-w-0">
									<span className="block text-gray-500">Active</span>
									<span className="truncate font-medium text-gray-900">
										{watchedIsActive ? "Yes" : "No"}
									</span>
								</div>
							</div>
						</div>
						<div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 pr-7">
							<Button
								type="button"
								variant="outline"
								onClick={closeModal}
								disabled={isMutationPending}>
								Cancel
							</Button>
							<Button
								type="submit"
								className="bg-orange-600 text-white hover:bg-orange-700"
								disabled={isMutationPending}>
								{isMutationPending ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										Saving
									</>
								) : isEditing ? (
									"Update Adjustment"
								) : (
									"Add Adjustment"
								)}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Payroll Adjustment Details"
				description={activeItem?.payrollPeriod?.code || periodContext}
				className="max-h-[min(86vh,680px)] overflow-hidden">
				{isLoadingItem ? (
					<div className="flex h-40 items-center justify-center text-sm text-gray-500">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Loading adjustment...
					</div>
				) : activeItem ? (
					<div className="max-h-[calc(min(86vh,680px)-7rem)] space-y-4 overflow-y-auto pr-1">
						<div className="grid gap-3 sm:grid-cols-2">
							{[
								["Employee", getEmployeeName(activeItem.employee)],
								["Employee ID", (activeItem.employee as any)?.employeeId || activeItem.employeeId],
								["Benefit type", activeItem.benefitType?.name || activeItem.name],
								["Amount", formatCurrency(activeItem.amount)],
								["Payroll period", activeItem.payrollPeriod?.code || activeItem.payrollPeriodId || "-"],
								["Status", activeItem.status || "PENDING"],
							].map(([label, value]) => (
								<div key={label} className="min-w-0 rounded-md border border-gray-200 bg-gray-50 p-3">
									<p className="text-xs text-gray-500">{label}</p>
									<p className="mt-1 truncate text-sm font-medium text-gray-900" title={String(value)}>
										{value}
									</p>
								</div>
							))}
						</div>
						{activeItem.notes && (
							<div className="rounded-md border border-gray-200 bg-gray-50 p-3">
								<p className="text-xs text-gray-500">Notes</p>
								<p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">
									{activeItem.notes}
								</p>
							</div>
						)}
						<div className="flex justify-end gap-3">
							<Button type="button" variant="outline" onClick={closeModal}>
								Close
							</Button>
							<Button type="button" onClick={() => activeItem && openEdit(activeItem)}>
								Edit
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-sm text-gray-500">
						Adjustment not found.
					</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Delete Payroll Adjustment"
				description="Remove this EmployeeBenefit source row from payroll adjustment reads.">
				<div className="space-y-4">
					<p className="text-sm text-gray-600">
						Delete{" "}
						<span className="font-medium text-gray-900">
							{activeItem?.name || activeItem?.benefitType?.name || "this adjustment"}
						</span>
						?
					</p>
					<div className="flex justify-end gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={closeModal}
							disabled={deleteMutation.isPending}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteMutation.isPending}>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
