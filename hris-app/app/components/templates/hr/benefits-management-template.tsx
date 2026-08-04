import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	ArrowLeft,
	Edit,
	Eye,
	Loader2,
	MoreVertical,
	Search,
	Trash2,
	Upload,
	Users,
	X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { type SelectOption } from "~/components/atoms/Select";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { BenefitEnrollmentImportModal } from "~/components/organisms/hr/BenefitEnrollmentImportModal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { EmployeeBenefitForm } from "~/components/templates/hr/employee-benefit-form";
import {
	queryKeys as benefitTypeQueryKeys,
	useBenefitTypes,
} from "~/lib/hooks/useBenefitTypes";
import {
	queryKeys as employeeBenefitQueryKeys,
	useDeleteEmployeeBenefit,
	useEmployeeBenefit,
	useEmployeeBenefits,
} from "~/lib/hooks/useEmployeeBenefits";
import { formatDate } from "~/lib/utils/text-utils";
import type { BenefitType } from "~/services/benefit-types.service";
import type { EmployeeBenefit } from "~/services/employee-benefit.service";

interface BenefitsManagementProps {
	title?: string;
	description?: string;
}

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
	"typeId",
	"search",
] as const;

export function BenefitsManagement({
	title = "Benefits Management",
	description = "Browse benefit types and see who is enrolled in each",
}: BenefitsManagementProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [employeeSearch, setEmployeeSearch] = useState("");
	const [bulkImportOpen, setBulkImportOpen] = useState(false);

	const searchQuery = searchParams.get("search") || "";
	const statusFilter = searchParams.get("status") || "";
	const benefitTypeIdFilter = searchParams.get("benefitTypeId") || "";
	const typeIdParam = searchParams.get("typeId") || benefitTypeIdFilter || "";
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
	const employeeSearchParam =
		searchParams.get("employeeSearch") ||
		searchParams.get("employeeCode") ||
		searchParams.get("query") ||
		"";
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const activeEnrollmentId =
		action === "edit" || action === "viewEnrollment" || action === "delete" ? id : null;
	const isEditing = action === "edit";
	const drawerOpen = Boolean(typeIdParam);

	// Deep-link from Run Payroll: seed enrollment search (employee code/name)
	useEffect(() => {
		if (employeeSearchParam) {
			setEmployeeSearch(employeeSearchParam);
		}
	}, [employeeSearchParam]);

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

	// Clear drawer-local employee search when switching types
	useEffect(() => {
		setEmployeeSearch("");
	}, [typeIdParam]);

	const typeFilterParts = [
		"isActive:true",
		directionParam ? `payrollDirection:${directionParam}` : "",
		...codeParam
			.split(",")
			.map((code) => code.trim().toUpperCase())
			.filter(Boolean)
			.map((code) => `code:${code}`),
	].filter(Boolean);

	const { data: benefitTypesData, isLoading: isLoadingTypes } = useBenefitTypes({
		page: pageParam,
		limit: limitParam,
		query: searchQuery || undefined,
		filter: typeFilterParts.join(",") || undefined,
		sort: "name",
		order: "asc",
		count: true,
	});

	const benefitTypes = useMemo(
		() => benefitTypesData?.benefitTypes || [],
		[benefitTypesData?.benefitTypes],
	);

	const selectedBenefitType = useMemo(
		() => benefitTypes.find((type) => type.id === typeIdParam) || null,
		[benefitTypes, typeIdParam],
	);

	// Enrollments for selected type (drawer) — also used for enrollment counts when possible
	const enrollmentFilterParts = [
		typeIdParam ? `benefitTypeId:${typeIdParam}` : "",
		statusFilter ? `status:${statusFilter}` : "",
		payrollPeriodIdParam ? `payrollPeriodId:${payrollPeriodIdParam}` : "",
		!payrollPeriodIdParam && periodCodeParam
			? `payrollPeriod.code:${periodCodeParam}`
			: "",
	].filter(Boolean);

	const { data: enrollmentsData, isLoading: isLoadingEnrollments } = useEmployeeBenefits({
		page: 1,
		limit: 500,
		filter: enrollmentFilterParts.join(",") || undefined,
		sort: "createdAt",
		order: "desc",
		count: true,
		enabled: Boolean(typeIdParam),
	} as any);

	// Light enrollment list for counting on the main table (all active types in view)
	const { data: enrollmentCountsData } = useEmployeeBenefits({
		page: 1,
		limit: 1000,
		filter: "isActive:true",
		sort: "createdAt",
		order: "desc",
		count: true,
	});

	const enrollmentCountByTypeId = useMemo(() => {
		const map = new Map<string, number>();
		for (const row of enrollmentCountsData?.employeeBenefits || []) {
			const typeId = row.benefitTypeId || row.benefitType?.id;
			if (!typeId) continue;
			map.set(typeId, (map.get(typeId) || 0) + 1);
		}
		return map;
	}, [enrollmentCountsData?.employeeBenefits]);

	const enrollments = useMemo(
		() => enrollmentsData?.employeeBenefits || [],
		[enrollmentsData?.employeeBenefits],
	);

	const filteredEnrollments = useMemo(() => {
		const q = employeeSearch.trim().toLowerCase();
		if (!q) return enrollments;
		return enrollments.filter((row) => {
			const name = getEmployeeName(row.employee).toLowerCase();
			const empId = String(
				row.employee?.employeeId || row.employeeId || "",
			).toLowerCase();
			const enrollmentName = String(row.name || "").toLowerCase();
			return name.includes(q) || empId.includes(q) || enrollmentName.includes(q);
		});
	}, [employeeSearch, enrollments]);

	const { data: activeItem, isLoading: isLoadingItem } = useEmployeeBenefit(
		activeEnrollmentId || "",
	);
	const deleteMutation = useDeleteEmployeeBenefit();

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const closeEnrollmentModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const closeDrawer = () => {
		updateSearchParams((next) => {
			next.delete("typeId");
			next.delete("benefitTypeId");
			next.delete("action");
			next.delete("id");
		});
		setEmployeeSearch("");
	};

	const openDrawer = (type: BenefitType) => {
		updateSearchParams((next) => {
			next.set("typeId", type.id);
			next.delete("action");
			next.delete("id");
		});
	};

	const runPayrollReturnUrl = useMemo(() => {
		const params = new URLSearchParams();
		if (periodCodeParam) params.set("periodCode", periodCodeParam);
		if (periodViewParam) params.set("periodView", periodViewParam);
		if (adjustmentFilterParam) params.set("adjustment", adjustmentFilterParam);
		return `/hr/run-payroll${params.toString() ? `?${params.toString()}` : ""}`;
	}, [adjustmentFilterParam, periodCodeParam, periodViewParam]);

	const openCreate = () => {
		const params = new URLSearchParams();
		for (const key of CREATE_CONTEXT_PARAMS) {
			const value = searchParams.get(key);
			if (value) params.set(key, value);
		}
		// Prefer preselecting type when opening create from drawer
		if (typeIdParam && !params.get("benefitTypeId")) {
			params.set("benefitTypeId", typeIdParam);
		}
		const query = params.toString();
		navigate(`/hr/benefits-management/new${query ? `?${query}` : ""}`);
	};

	const openEditEnrollment = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", item.id);
			if (item.benefitTypeId) next.set("typeId", item.benefitTypeId);
		});
	};

	const openDeleteEnrollment = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
			if (item.benefitTypeId) next.set("typeId", item.benefitTypeId);
		});
	};

	const confirmDelete = () => {
		if (!activeItem) return;
		deleteMutation.mutate(activeItem.id, {
			onSuccess: () => closeEnrollmentModal(),
		});
	};

	const directionOptions: SelectOption[] = [
		{ value: "all", label: "All directions" },
		{ value: "COMPENSATION", label: "Compensation" },
		{ value: "DEDUCTION", label: "Deductions" },
	];

	const benefitAdvancedFilters = [
		{
			key: "direction",
			label: "Direction",
			options: directionOptions.filter((option) => option.value !== "all"),
		},
	];

	const benefitAdvancedFilterValues = {
		direction: directionParam || "",
	};

	// Column balance: Benefit absorbs remaining width; Direction / Tax / Enrolled
	// are content-sized so badges and short values don't leave large empty gaps.
	const columns: Column<BenefitType>[] = [
		{
			key: "name",
			label: "Benefit",
			// Flexible primary column: takes leftover width after fixed siblings + actions.
			width: "100%",
			className: "min-w-0 max-w-0 overflow-hidden",
			render: (_value, item) => (
				<button
					type="button"
					className="block min-w-0 w-full max-w-full text-left"
					onClick={() => openDrawer(item)}
					data-testid={`benefit-type-row-${item.id}`}>
					<p className="truncate text-sm font-semibold text-gray-900 hover:text-primary">
						{item.name}
					</p>
					<p className="truncate text-xs text-gray-500">
						{item.code ? `${item.code}` : "—"}
						{item.category ? ` · ${item.category}` : ""}
					</p>
				</button>
			),
		},
		{
			key: "payrollDirection",
			label: "Direction",
			width: "10.5rem",
			className: "whitespace-nowrap align-middle",
			headerClassName: "whitespace-nowrap",
			render: (value) => (
				<Badge variant="outline" className="max-w-full truncate font-normal">
					{String(value || "—")}
				</Badge>
			),
		},
		{
			key: "isTaxable",
			label: "Tax",
			width: "7.5rem",
			hideBelow: "md",
			className: "whitespace-nowrap align-middle",
			headerClassName: "whitespace-nowrap",
			render: (value) => (
				<span className="text-sm text-gray-700">
					{value === true ? "Taxable" : "Non-taxable"}
				</span>
			),
		},
		{
			key: "enrolled",
			label: "Enrolled",
			width: "7rem",
			className: "whitespace-nowrap align-middle",
			headerClassName: "whitespace-nowrap",
			render: (_value, item) => {
				const count = enrollmentCountByTypeId.get(item.id) || 0;
				return (
					<span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-gray-900">
						<Users className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
						{count}
					</span>
				);
			},
		},
	];

	const renderActions = (item: BenefitType) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-8 w-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem onClick={() => openDrawer(item)}>
					<Eye className="mr-2 h-4 w-4" />
					View enrollments
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => {
						openDrawer(item);
						// Create preselected for this type
						const params = new URLSearchParams();
						for (const key of CREATE_CONTEXT_PARAMS) {
							const value = searchParams.get(key);
							if (value) params.set(key, value);
						}
						params.set("benefitTypeId", item.id);
						navigate(`/hr/benefits-management/new?${params.toString()}`);
					}}>
					<Users className="mr-2 h-4 w-4" />
					Enroll employees
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const activeSourceLabel =
		sourceCategoryLabels[sourceCategoryParam] ||
		(codeParam ? codeParam.toUpperCase() : "");

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
				data={benefitTypes}
				columns={columns}
				renderActions={renderActions}
				isLoading={isLoadingTypes}
				emptyMessage="No benefit types found"
				emptyDescription="Create a benefit type in configuration, then enroll employees."
				searchWidth="w-80"
				searchPlaceholder="Search benefits by name or code..."
				toolbarAlign="right"
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={benefitTypesData?.pagination?.total || benefitTypes.length}
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
				filterColumns={1}
				onFilterChange={(filters) => {
					updateSearchParams((next) => {
						const value = filters.direction;
						if (!value || value === "all") {
							next.delete("direction");
						} else {
							next.set("direction", value);
						}
						next.set("page", "1");
					});
				}}
				headerActions={
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-9 gap-1.5"
						onClick={() => setBulkImportOpen(true)}
						data-testid="benefit-bulk-upload-button">
						<Upload className="h-4 w-4" />
						Bulk upload
					</Button>
				}
				onAdd={openCreate}
				addButtonLabel="Enroll employees"
				addButtonClassName="bg-orange-600 hover:bg-orange-700 text-white"
			/>

			<BenefitEnrollmentImportModal
				open={bulkImportOpen}
				onOpenChange={setBulkImportOpen}
				onImported={() => {
					queryClient.invalidateQueries({
						queryKey: employeeBenefitQueryKeys.employeeBenefits.all,
					});
					queryClient.invalidateQueries({
						queryKey: benefitTypeQueryKeys.benefitTypes.all,
					});
				}}
			/>

			{/* Right drawer: benefit type + enrolled employees */}
			<Drawer
				open={drawerOpen}
				onOpenChange={(open) => {
					if (!open) closeDrawer();
				}}
				direction="right">
				<DrawerContent
					className="ml-auto flex h-full min-h-0 w-full min-w-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:!max-w-[min(92vw,40rem)]"
					data-testid="benefit-type-drawer">
					<DrawerHeader className="shrink-0 border-b border-neutral-100 bg-neutral-50/80 px-5 pb-4 pt-5">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<DrawerTitle className="text-lg font-semibold text-neutral-900">
									{selectedBenefitType?.name ||
										enrollments[0]?.benefitType?.name ||
										"Benefit"}
								</DrawerTitle>
								<DrawerDescription className="mt-1 text-sm text-neutral-500">
									{selectedBenefitType?.code ||
										enrollments[0]?.benefitType?.code ||
										"Type details and enrolled employees"}
								</DrawerDescription>
							</div>
							<DrawerClose asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 w-8 shrink-0 p-0"
									aria-label="Close drawer">
									<X className="h-4 w-4" />
								</Button>
							</DrawerClose>
						</div>
					</DrawerHeader>

					<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
						{/* Type details */}
						<div className="shrink-0 space-y-3 border-b border-neutral-100 px-5 py-4">
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{[
									[
										"Direction",
										selectedBenefitType?.payrollDirection ||
											enrollments[0]?.benefitType?.payrollDirection ||
											"—",
									],
									[
										"Category",
										selectedBenefitType?.category ||
											enrollments[0]?.benefitType?.category ||
											"—",
									],
									[
										"Tax",
										selectedBenefitType
											? selectedBenefitType.isTaxable
												? "Taxable"
												: "Non-taxable"
											: "—",
									],
									[
										"Enrolled",
										String(
											typeIdParam
												? enrollmentCountByTypeId.get(typeIdParam) ??
														enrollments.length
												: enrollments.length,
										),
									],
								].map(([label, value]) => (
									<div
										key={label}
										className="rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2">
										<p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
											{label}
										</p>
										<p className="mt-0.5 truncate text-sm font-medium text-neutral-900">
											{value}
										</p>
									</div>
								))}
							</div>
							{selectedBenefitType?.description && (
								<p className="text-xs leading-relaxed text-neutral-600">
									{selectedBenefitType.description}
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									className="bg-orange-600 text-white hover:bg-orange-700"
									onClick={openCreate}>
									Enroll employees
								</Button>
							</div>
						</div>

						{/* Enrolled employees */}
						<div className="flex min-h-0 flex-1 flex-col px-5 py-4">
							<div className="mb-3 flex items-center justify-between gap-2">
								<p className="text-sm font-semibold text-neutral-900">
									Assigned employees
								</p>
								<span className="text-xs text-neutral-500">
									{filteredEnrollments.length} shown
								</span>
							</div>
							<div className="relative mb-3">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
								<Input
									value={employeeSearch}
									onChange={(event) => setEmployeeSearch(event.target.value)}
									placeholder="Search by name or employee ID..."
									className="h-10 pl-9"
									data-testid="drawer-employee-search"
								/>
							</div>

							<div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 modern-scroll">
								{isLoadingEnrollments ? (
									<div className="flex h-32 items-center justify-center text-sm text-neutral-500">
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Loading enrollments...
									</div>
								) : filteredEnrollments.length === 0 ? (
									<div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center text-sm text-neutral-500">
										{employeeSearch.trim()
											? "No employees match your search."
											: "No employees enrolled in this benefit yet."}
									</div>
								) : (
									filteredEnrollments.map((row) => {
										const isDeduction =
											row.benefitType?.payrollDirection === "DEDUCTION";
										return (
											<div
												key={row.id}
												className="rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
												data-testid={`enrollment-row-${row.id}`}>
												<div className="flex items-start justify-between gap-2">
													<div className="min-w-0 flex-1">
														<EmployeeTableCell
															profileId={
																row.employee?.id || row.employeeId
															}
															fullName={getEmployeeName(row.employee)}
															employeeId={
																row.employee?.employeeId ||
																row.employeeId ||
																"-"
															}
															avatar={
																row.employee?.user?.avatar ?? null
															}
															className="min-w-0"
														/>
														<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
															<span className="font-semibold tabular-nums text-neutral-900">
																{isDeduction ? "-" : "+"}
																{formatCurrency(row.amount)}
															</span>
															<StatusBadge
																status={String(row.status || "PENDING")}
															/>
															{row.scheduleMode === "RECURRING" && (
																<span className="text-neutral-400">
																	Recurring
																	{row.recurrenceFrequency
																		? ` · ${String(row.recurrenceFrequency)
																				.replace(/_/g, " ")
																				.toLowerCase()}`
																		: ""}
																</span>
															)}
															{row.startDate && (
																<span className="text-neutral-400">
																	From{" "}
																	{formatDate(row.startDate, "short")}
																</span>
															)}
														</div>
													</div>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="outline"
																size="sm"
																className="h-8 w-8 shrink-0 p-0">
																<MoreVertical className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-40">
															<DropdownMenuItem
																onClick={() => openEditEnrollment(row)}>
																<Edit className="mr-2 h-4 w-4" />
																Edit
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																onClick={() => openDeleteEnrollment(row)}
																className="text-red-600">
																<Trash2 className="mr-2 h-4 w-4" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>
										);
									})
								)}
							</div>
						</div>
					</div>
				</DrawerContent>
			</Drawer>

			<Modal
				open={isEditing}
				onOpenChange={(open) => {
					if (!open) closeEnrollmentModal();
				}}
				title="Edit enrollment"
				description={
					activeItem?.benefitType?.name || activeItem?.name || "Employee benefit"
				}
				className="max-h-[min(90vh,820px)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden rounded-2xl border-neutral-200 p-0 shadow-xl [&>div:first-child]:border-b [&>div:first-child]:border-neutral-100 [&>div:first-child]:bg-neutral-50/80 [&>div:first-child]:px-6 [&>div:first-child]:pb-4 [&>div:first-child]:pt-5 [&>div:first-child]:pr-14">
				<EmployeeBenefitForm
					mode="edit"
					presentation="modal"
					benefitId={id}
					payrollPeriodId={payrollPeriodIdParam}
					periodCode={periodCodeParam}
					periodStart={periodStartParam}
					periodEnd={periodEndParam}
					onCancel={closeEnrollmentModal}
					onSuccess={closeEnrollmentModal}
				/>
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeEnrollmentModal();
				}}
				title="Delete enrollment"
				description="This removes the employee benefit and its scheduled payroll installments from future runs.">
				<div className="space-y-4">
					{isLoadingItem ? (
						<div className="flex h-16 items-center justify-center text-sm text-gray-500">
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Loading...
						</div>
					) : (
						<p className="text-sm text-gray-600">
							Delete enrollment for{" "}
							<span className="font-medium text-gray-900">
								{getEmployeeName(activeItem?.employee)}
							</span>
							{activeItem?.benefitType?.name
								? ` · ${activeItem.benefitType.name}`
								: ""}
							?
						</p>
					)}
					<div className="flex justify-end gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={closeEnrollmentModal}
							disabled={deleteMutation.isPending}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteMutation.isPending || isLoadingItem}>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
