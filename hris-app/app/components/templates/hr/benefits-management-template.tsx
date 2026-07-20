import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { type SelectOption } from "~/components/atoms/Select";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import {
	HrDataTableManagerFilter,
	hrDataTablePopoverSelectTriggerClass,
} from "~/components/molecules/HrDataTableFilters";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	EmployeeBenefitForm,
	getPayrollPeriodOptionLabel,
} from "~/components/templates/hr/employee-benefit-form";
import { useBenefitTypes } from "~/lib/hooks/useBenefitTypes";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useSections } from "~/lib/hooks/useSections";
import {
	useDeleteEmployeeBenefit,
	useEmployeeBenefit,
	useEmployeeBenefits,
} from "~/lib/hooks/useEmployeeBenefits";
import { formatDate } from "~/lib/utils/text-utils";
import type { EmployeeBenefit } from "~/services/employee-benefit.service";
import type { Employee } from "~/services/employees.service";

interface BenefitsManagementProps {
	title?: string;
	description?: string;
}

const statusOptions: SelectOption[] = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "PENDING", label: "Pending" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "CANCELLED", label: "Cancelled" },
	{ value: "DEFAULTED", label: "Defaulted" },
];

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

/** Context params preserved when opening the create page or returning from it. */
const CREATE_CONTEXT_PARAMS = [
	"payrollPeriodId",
	"periodCode",
	"periodView",
	"periodStart",
	"periodEnd",
	"departmentId",
	"sectionId",
	"managerId",
	"adjustment",
	"sourceCategory",
	"code",
	"direction",
	"returnTo",
	"status",
	"benefitTypeId",
	"search",
] as const;

export function BenefitsManagement({
	title = "Benefits Management",
	description = "Manage employee benefit enrollments and coverage",
}: BenefitsManagementProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const searchQuery = searchParams.get("search") || "";
	const statusFilter = searchParams.get("status") || "";
	const benefitTypeIdFilter = searchParams.get("benefitTypeId") || "";
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

	// Legacy deep link: ?action=create → dedicated create page
	useEffect(() => {
		if (action !== "create") return;
		const params = new URLSearchParams();
		for (const key of CREATE_CONTEXT_PARAMS) {
			const value = searchParams.get(key);
			if (value) params.set(key, value);
		}
		const query = params.toString();
		navigate(`/hr/benefits-management/new${query ? `?${query}` : ""}`, { replace: true });
	}, [action, navigate, searchParams]);

	const benefitFilterParts = [
		departmentFilter ? `employee.departmentId:${departmentFilter}` : "",
		sectionFilter ? `employee.sectionId:${sectionFilter}` : "",
		managerFilter ? `employee.reportToId:${managerFilter}` : "",
		statusFilter ? `status:${statusFilter}` : "",
		benefitTypeIdFilter ? `benefitTypeId:${benefitTypeIdFilter}` : "",
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
	const { data: benefitTypesData } = useBenefitTypes({
		page: 1,
		limit: 500,
		filter: "isActive:true",
		sort: "name",
		order: "asc",
		count: true,
	});
	const { data: employeesData } = useEmployees({
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
			key: "benefitTypeId",
			label: "Benefit type",
			options: benefitTypeOptions,
		},
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
		benefitTypeId: benefitTypeIdFilter || "",
		code: codeParam && !codeParam.includes(",") ? codeParam.toUpperCase() : "",
		direction: directionParam || "",
		status: statusFilter || "",
		departmentId: departmentFilter || "",
		sectionId: sectionFilter || "",
		managerId: managerFilter || "",
	};

	const managerOptions = useMemo<SelectOption[]>(() => {
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
	}, [employees]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const handleDepartmentFilterChange = (departmentId: string) => {
		updateSearchParams((next) => {
			if (departmentId === "all") {
				next.delete("departmentId");
				next.delete("sectionId");
			} else {
				next.set("departmentId", departmentId);
				next.delete("sectionId");
			}
			next.set("page", "1");
		});
	};

	const handleSectionFilterChange = (departmentId: string, sectionId: string) => {
		updateSearchParams((next) => {
			next.set("departmentId", departmentId);
			next.set("sectionId", sectionId);
			next.set("page", "1");
		});
	};

	const handleManagerFilterChange = (managerId: string) => {
		updateSearchParams((next) => {
			if (managerId === "all") {
				next.delete("managerId");
			} else {
				next.set("managerId", managerId);
			}
			next.set("page", "1");
		});
	};

	const benefitPopoverFilters = (
		<>
			<div className="w-full space-y-1.5">
				<label className="text-xs font-medium text-gray-600">Department</label>
				<DepartmentSectionPicker
					variant="datatable"
					departments={departments}
					sections={sections}
					departmentId={departmentFilter || "all"}
					sectionId={sectionFilter || "all"}
					className={hrDataTablePopoverSelectTriggerClass}
					onDepartmentChange={handleDepartmentFilterChange}
					onSectionChange={handleSectionFilterChange}
				/>
			</div>
			<div className="w-full space-y-1.5">
				<label className="text-xs font-medium text-gray-600">Manager</label>
				<HrDataTableManagerFilter
					value={managerFilter || "all"}
					onValueChange={handleManagerFilterChange}
					options={managerOptions}
					dataUi="benefits-manager-trigger"
					triggerClassName={hrDataTablePopoverSelectTriggerClass}
				/>
			</div>
		</>
	);

	const closeModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

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
		const params = new URLSearchParams();
		for (const key of CREATE_CONTEXT_PARAMS) {
			const value = searchParams.get(key);
			if (value) params.set(key, value);
		}
		const query = params.toString();
		navigate(`/hr/benefits-management/new${query ? `?${query}` : ""}`);
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

	const confirmDelete = () => {
		if (!activeItem) return;
		deleteMutation.mutate(activeItem.id, {
			onSuccess: () => closeModal(),
		});
	};

	const periodContext =
		(activeItem?.payrollPeriod
			? getPayrollPeriodOptionLabel(activeItem.payrollPeriod)
			: "") ||
		periodCodeParam ||
		(payrollPeriodIdParam ? "Selected payroll period" : "No payroll period selected");

	// Percentage widths leave room for the sticky Actions col (~132px) so table-fixed
	// stays within the content shell and does not force horizontal scroll.
	const columns: Column<EmployeeBenefit>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "20%",
			className: "max-w-0 overflow-hidden",
			render: (_value, item) => (
				<EmployeeTableCell
					profileId={item.employee?.id || item.employeeId}
					fullName={getEmployeeName(item.employee)}
					employeeId={item.employee?.employeeId || item.employeeId || "-"}
					avatar={item.employee?.user?.avatar ?? null}
					className="min-w-0"
				/>
			),
		},
		{
			key: "benefitType",
			label: "Benefit",
			width: "16%",
			className: "max-w-0 overflow-hidden",
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
			label: "Period",
			width: "12%",
			className: "max-w-0 overflow-hidden",
			hideBelow: "lg",
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
			width: "11%",
			className: "whitespace-nowrap",
			render: (value, item) => {
				const isDeduction = item.benefitType?.payrollDirection === "DEDUCTION";
				const amount = Number(value || 0).toLocaleString("en-PH", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				});
				return (
					<span className="font-semibold tabular-nums text-gray-900">
						{isDeduction ? "-" : "+"}₱{amount}
					</span>
				);
			},
		},
		{
			key: "status",
			label: "Status",
			width: "11%",
			className: "overflow-hidden",
			render: (value, item) => (
				<div className="flex min-w-0 items-center gap-1">
					<StatusBadge status={String(value || "PENDING")} />
					{!item.isActive && (
						<span className="truncate text-[10px] font-medium uppercase tracking-wide text-neutral-400">
							Off
						</span>
					)}
				</div>
			),
		},
		{
			key: "notes",
			label: "Notes",
			width: "14%",
			className: "max-w-0 overflow-hidden",
			hideBelow: "xl",
			render: (value) => (
				<span
					className="block truncate text-sm text-gray-600"
					title={String(value || "")}>
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

	const activeSourceLabel =
		sourceCategoryLabels[sourceCategoryParam] ||
		(codeParam ? codeParam.toUpperCase() : "");
	const activeBenefitTypeLabel =
		benefitTypeOptions.find((option) => option.value === benefitTypeIdFilter)?.label ||
		"";

	// Avoid flashing list UI while redirecting legacy create deep links
	if (action === "create") {
		return (
			<div className="flex h-40 items-center justify-center text-sm text-neutral-500">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Opening create form...
			</div>
		);
	}

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

			{(activeSourceLabel ||
				activeBenefitTypeLabel ||
				directionParam ||
				periodCodeParam ||
				payrollPeriodIdParam) && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
					<span className="font-medium text-gray-800">Filtered source</span>
					{activeSourceLabel && <Badge variant="secondary">{activeSourceLabel}</Badge>}
					{activeBenefitTypeLabel && (
						<Badge variant="outline">{activeBenefitTypeLabel}</Badge>
					)}
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
				emptyDescription="Add an employee benefit to schedule installments for payroll."
				searchWidth="w-80"
				searchPlaceholder="Search employees or benefits..."
				toolbarAlign="right"
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
				filterButtonLabel="Filters"
				filterColumns={2}
				filterPopoverExtra={benefitPopoverFilters}
				onFilterChange={(filters) => {
					updateSearchParams((next) => {
						const keys = [
							"benefitTypeId",
							"code",
							"direction",
							"status",
							"departmentId",
							"sectionId",
							"managerId",
						] as const;
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
				addButtonLabel="Add benefit"
				addButtonClassName="bg-orange-600 hover:bg-orange-700 text-white"
			/>

			<Modal
				open={isEditing}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Edit benefit"
				description={periodContext}
				className="max-h-[min(90vh,820px)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden rounded-2xl border-neutral-200 p-0 shadow-xl [&>div:first-child]:border-b [&>div:first-child]:border-neutral-100 [&>div:first-child]:bg-neutral-50/80 [&>div:first-child]:px-6 [&>div:first-child]:pb-4 [&>div:first-child]:pt-5 [&>div:first-child]:pr-14">
				<EmployeeBenefitForm
					mode="edit"
					presentation="modal"
					benefitId={id}
					payrollPeriodId={payrollPeriodIdParam}
					periodCode={periodCodeParam}
					periodStart={periodStartParam}
					periodEnd={periodEndParam}
					onCancel={closeModal}
					onSuccess={closeModal}
				/>
			</Modal>

			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Benefit details"
				description={activeItem?.payrollPeriod?.code || periodContext}
				className="max-h-[min(86vh,680px)] overflow-hidden">
				{isLoadingItem ? (
					<div className="flex h-40 items-center justify-center text-sm text-gray-500">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Loading benefit...
					</div>
				) : activeItem ? (
					<div className="max-h-[calc(min(86vh,680px)-7rem)] space-y-4 overflow-y-auto pr-1">
						<div className="grid gap-3 sm:grid-cols-2">
							{[
								["Employee", getEmployeeName(activeItem.employee)],
								[
									"Employee ID",
									(activeItem.employee as any)?.employeeId || activeItem.employeeId,
								],
								["Benefit type", activeItem.benefitType?.name || activeItem.name],
								[
									activeItem.attendanceBased
										? activeItem.attendanceAmountBasis === "PER_DAY"
											? "Rate per present day"
											: "Full cut-off amount"
										: activeItem.scheduleMode === "RECURRING"
											? "Amount per period"
											: "Amount",
									formatCurrency(activeItem.amount),
								],
								[
									"Attendance",
									activeItem.attendanceBased
										? activeItem.attendanceAmountBasis === "PER_DAY"
											? "Yes · per present day"
											: activeItem.attendanceAmountBasis === "PER_CUTOFF"
												? "Yes · full cut-off (deduct absences)"
												: "Yes"
										: "No (fixed amount)",
								],
								[
									"Schedule",
									activeItem.scheduleMode === "RECURRING"
										? "Recurring"
										: activeItem.scheduleMode === "FIXED_INSTALLMENTS"
											? "Fixed installments"
											: activeItem.scheduleMode === "TIME_BOUND"
												? "Time-bound"
												: "—",
								],
								[
									"End date",
									activeItem.endDate
										? formatDate(activeItem.endDate, "short")
										: activeItem.scheduleMode === "RECURRING"
											? "Open-ended"
											: "—",
								],
								[
									"Payroll period",
									activeItem.payrollPeriod?.code || activeItem.payrollPeriodId || "-",
								],
								["Status", activeItem.status || "PENDING"],
							].map(([label, value]) => (
								<div
									key={label}
									className="min-w-0 rounded-md border border-gray-200 bg-gray-50 p-3">
									<p className="text-xs text-gray-500">{label}</p>
									<p
										className="mt-1 truncate text-sm font-medium text-gray-900"
										title={String(value)}>
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
						Benefit not found.
					</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Delete benefit"
				description="This removes the employee benefit and its scheduled payroll installments from future runs.">
				<div className="space-y-4">
					<p className="text-sm text-gray-600">
						Delete{" "}
						<span className="font-medium text-gray-900">
							{activeItem?.name || activeItem?.benefitType?.name || "this benefit"}
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
