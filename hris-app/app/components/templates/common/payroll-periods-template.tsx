import { useState, useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Modal } from "~/components/atoms/Modal";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Badge } from "~/components/atoms/Badge";
import { formatDate, formatDateForInput } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { Edit, Trash2, MoreVertical, Zap } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import type { PayrollPeriod } from "~/services/payroll-periods.service";
import {
	usePayrollPeriods,
	usePayrollPeriod,
	useCreatePayrollPeriod,
	useUpdatePayrollPeriod,
	useDeletePayrollPeriod,
	useGenerateTimesheetPayroll,
	usePayrollCycleConfig,
} from "~/lib/hooks/usePayrollPeriods";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigDateText,
	AdminConfigMutedDash,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

interface PayrollPeriodFormData {
	name: string;
	code?: string;
	startDate: string;
	endDate: string;
	payDate: string;
	payFrequency?: string;
	periodNumber?: number;
	calculatorId?: string;
	status: "DRAFT" | "OPEN" | "PROCESSING" | "COMPLETED" | "CLOSED";
	cutoffDay?: number;
	notes?: string;
}

interface PayrollPeriodsManagementProps {
	title?: string;
	description?: string;
}

export function PayrollPeriodsManagement({
	title = "Payroll Periods",
	description = "Manage payroll periods and cycles",
}: PayrollPeriodsManagementProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();

	// Modal states
	const [isGenerateTimesheetPayrollModalOpen, setIsGenerateTimesheetPayrollModalOpen] =
		useState(false);
	const [selectedPeriodForGeneration, setSelectedPeriodForGeneration] =
		useState<PayrollPeriod | null>(null);

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Build filter string for API
	const filterString = statusFilter ? `status:${statusFilter}` : undefined;

	// React Query hooks
	const { data: payrollPeriodsData, isLoading } = usePayrollPeriods({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
	});
	const { data: payrollCycleConfig } = usePayrollCycleConfig();
	const items = (payrollPeriodsData as any)?.payrollPeriods || [];
	const pagination = (payrollPeriodsData as any)?.pagination;
	const seededPayFrequency = items.find(
		(period: PayrollPeriod) => period.payFrequency,
	)?.payFrequency;
	const selectedPayFrequency =
		payrollCycleConfig?.defaultPayFrequency || seededPayFrequency || "SEMI_MONTHLY";

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single period ID for fetching (when action is edit, view, or delete)
	const activePeriodId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	// Single usePayrollPeriod hook for all modals
	const { data: activePeriod, isLoading: isLoadingPeriod } = usePayrollPeriod(
		activePeriodId || "",
	);

	// Mutation hooks
	const createPeriodMutation = useCreatePayrollPeriod();
	const updatePeriodMutation = useUpdatePayrollPeriod();
	const deletePeriodMutation = useDeletePayrollPeriod();
	const generateTimesheetPayrollMutation = useGenerateTimesheetPayroll();

	// Helper function to get today's date in YYYY-MM-DD format
	const getTodayDate = () => {
		const today = new Date();
		return today.toISOString().split("T")[0];
	};

	// Helper function to get end of month date in YYYY-MM-DD format
	const getEndOfMonthDate = () => {
		const today = new Date();
		const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
		return endOfMonth.toISOString().split("T")[0];
	};

	// Helper function to get pay date (5 days after end date) in YYYY-MM-DD format
	const getPayDate = (endDate: string) => {
		const end = new Date(endDate);
		const payDate = new Date(end);
		payDate.setDate(end.getDate() + 5);
		return payDate.toISOString().split("T")[0];
	};

	// Form management with schema-equivalent validation through react-hook-form field rules.
	const {
		register,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		control,
		formState: { errors },
	} = useForm<PayrollPeriodFormData>({
		defaultValues: {
			name: "",
			startDate: getTodayDate(),
			endDate: getEndOfMonthDate(),
			payDate: getPayDate(getEndOfMonthDate()),
			payFrequency: selectedPayFrequency,
			status: "DRAFT",
			notes: "",
		},
	});

	const watchPayFrequency = watch("payFrequency");
	const watchCutoffDay = watch("cutoffDay");

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingPeriod && activePeriod) {
			reset({
				name: activePeriod.name,
				code: activePeriod.code,
				startDate: formatDateForInput(activePeriod.startDate),
				endDate: formatDateForInput(activePeriod.endDate),
				payDate: formatDateForInput(activePeriod.payDate),
				payFrequency: activePeriod.payFrequency || selectedPayFrequency,
				calculatorId: activePeriod.calculatorId,
				status: activePeriod.status,
				cutoffDay: activePeriod.cutoffDay,
				periodNumber: activePeriod.periodNumber,
				notes: activePeriod.notes || "",
			});
		}

		// Handle deep link for generate modal
		if (action === "generate" && !isLoadingPeriod && activePeriod) {
			setSelectedPeriodForGeneration(activePeriod);
			setIsGenerateTimesheetPayrollModalOpen(true);
		}
	}, [action, isLoadingPeriod, activePeriod, reset, selectedPayFrequency]);

	useEffect(() => {
		if (action !== "create") return;
		const currentFrequency = getValues("payFrequency");
		if (!currentFrequency || currentFrequency === "SEMI_MONTHLY") {
			setValue("payFrequency", selectedPayFrequency);
		}
	}, [action, selectedPayFrequency, getValues, setValue]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const statusOptions: SelectOption[] = [
		{ value: "DRAFT", label: "Draft" },
		{ value: "OPEN", label: "Open" },
		{ value: "PROCESSING", label: "Processing" },
		{ value: "COMPLETED", label: "Completed" },
		{ value: "CLOSED", label: "Closed" },
	];

	// Filtered options as requested
	const payFrequencyOptions: SelectOption[] = [
		{ value: "DAILY", label: "Daily" },
		{ value: "WEEKLY", label: "Weekly" },
		{ value: "BIWEEKLY", label: "Biweekly" },
		{ value: "SEMI_MONTHLY", label: "Semi-Monthly" },
		{ value: "MONTHLY", label: "Monthly" },
		{ value: "QUARTERLY", label: "Quarterly" },
		{ value: "ANNUALLY", label: "Annually" },
	];

	// Define filter options
	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "DRAFT", label: "Draft" },
				{ value: "OPEN", label: "Open" },
				{ value: "PROCESSING", label: "Processing" },
				{ value: "COMPLETED", label: "Completed" },
				{ value: "CLOSED", label: "Closed" },
			],
		},
	];

	// Define table columns
	const columns: Column<PayrollPeriod>[] = [
		{
			key: "name",
			label: "Period Name",
			width: "200px",
			required: true,
			priority: "critical",
			render: (value, item) => (
				<AdminConfigPrimaryCell
					primary={value || "Unnamed period"}
					secondary={item.code ? <AdminConfigCodeChip>{item.code}</AdminConfigCodeChip> : null}
					title={String(value || "")}
				/>
			),
		},
		{
			key: "startDate",
			label: "Period",
			width: "180px",
			required: true,
			priority: "high",
			render: (_, item) => (
				<AdminConfigDateText>
					{formatDate(item.startDate, "short")} - {formatDate(item.endDate, "short")}
				</AdminConfigDateText>
			),
		},
		{
			key: "payDate",
			label: "Pay Date",
			width: "130px",
			required: true,
			priority: "high",
			render: (value) => <AdminConfigDateText>{formatDate(value, "short")}</AdminConfigDateText>,
		},
		{
			key: "periodNumber",
			label: "Period #",
			width: "100px",
			priority: "low",
			hideBelow: "xl",
			render: (value) => (
				<div className="text-sm text-center">
					{value ? (
						<span className="text-xs font-medium">{value}</span>
					) : (
						<span className="text-gray-400">—</span>
					)}
				</div>
			),
		},
		{
			key: "payFrequency",
			label: "Frequency",
			width: "140px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => {
				const formatted = (value as string)
					?.toLowerCase()
					.replace(/_/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
				return (
					<AdminConfigPolicyChip>
						{formatted || value}
					</AdminConfigPolicyChip>
				);
			},
		},
		{
			key: "status",
			label: "Status",
			width: "130px",
			required: true,
			priority: "critical",
			render: (value) => <CategoricalText value={value as string} />,
		},
		{
			key: "createdAt",
			label: "Created",
			width: "120px",
			priority: "low",
			hideBelow: "xl",
			render: (value) => <AdminConfigDateText>{formatDate(value, "short")}</AdminConfigDateText>,
		},
	];

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) {
				next.set("search", query);
			} else {
				next.delete("search");
			}
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.status) {
				next.set("status", filters.status);
			} else {
				next.delete("status");
			}
			next.set("page", "1");
		});
	};

	const openCreate = () => {
		reset({
			name: "",
			startDate: getTodayDate(),
			endDate: getEndOfMonthDate(),
			payDate: getPayDate(getEndOfMonthDate()),
			payFrequency: selectedPayFrequency,
			status: "DRAFT",
			notes: "",
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (period: PayrollPeriod) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", period.id);
		});
	};

	const handleDelete = (period: PayrollPeriod) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", period.id);
		});
	};

	const handleGenerateTimesheetPayroll = (period: PayrollPeriod) => {
		if (period.status === "COMPLETED" || period.status === "CLOSED") {
			toast.error(`Cannot generate payroll for ${period.status.toLowerCase()} period`);
			return;
		}

		setSelectedPeriodForGeneration(period);
		setIsGenerateTimesheetPayrollModalOpen(true);
	};

	const confirmGenerateTimesheetPayroll = () => {
		if (!selectedPeriodForGeneration) return;

		generateTimesheetPayrollMutation.mutate(
			{ id: selectedPeriodForGeneration.id },
			{
				onSuccess: () => {
					setIsGenerateTimesheetPayrollModalOpen(false);
					setSelectedPeriodForGeneration(null);
					navigate("/hr/hr-payroll");
				},
			},
		);
	};

	const confirmDelete = () => {
		if (!activePeriod) return;
		deletePeriodMutation.mutate(activePeriod.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const onSubmit = (data: PayrollPeriodFormData) => {
		const isEditing = action === "edit";

		if (isEditing && activePeriod) {
			const updatePayload = {
				name: data.name,
				startDate: data.startDate,
				endDate: data.endDate,
				payDate: data.payDate,
				payFrequency: data.payFrequency as any,
				periodNumber: data.periodNumber,
				calculatorId: data.calculatorId,
				status: data.status,
				cutoffDay: data.cutoffDay,
				notes: data.notes,
			};

			updatePeriodMutation.mutate(
				{ id: activePeriod.id, payload: updatePayload },
				{
					onSuccess: () => {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					},
				},
			);
		} else {
			if (!user) {
				toast.error("User information not loaded. Please try again.");
				return;
			}

			const organizationId = user?.organizationId || user?.organization?.id;

			if (!organizationId) {
				toast.error(
					"User organization ID not found. Please refresh the page and try again.",
				);
				return;
			}

			const payload = {
				name: data.name,
				startDate: data.startDate,
				endDate: data.endDate,
				payDate: data.payDate,
				payFrequency: data.payFrequency as any,
				periodNumber: data.periodNumber,
				calculatorId: data.calculatorId,
				status: data.status,
				cutoffDay: data.cutoffDay,
				notes: data.notes,
				organizationId: organizationId,
			};

			createPeriodMutation.mutate(payload, {
				onSuccess: () => {
					reset();
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					});
				},
			});
		}
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: PayrollPeriod) => {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex items-center justify-center w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => openEdit(item)}>
						<Edit className="h-4 w-4 mr-2" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleGenerateTimesheetPayroll(item)}
						disabled={item.status === "COMPLETED" || item.status === "CLOSED"}
						className="text-green-600 focus:text-green-600 focus:bg-green-50">
						<Zap className="h-4 w-4 mr-2" />
						Generate Payroll
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleDelete(item)}
						className="text-red-600 focus:text-red-600 focus:bg-red-50">
						<Trash2 className="h-4 w-4 mr-2" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activePeriodId && isLoadingPeriod;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title={title}
				data={items}
				columns={columns}
				filters={filterOptions}
				searchFields={["name"]}
				onAdd={openCreate}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No payroll periods found"
				emptyDescription="Add a payroll period or generate periods from Payroll Rules."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add payroll period"
						to="/admin/configuration/payroll-periods?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search periods..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ status: statusFilter || "" }}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				containedScroll
			/>

			{/* Create/Edit Modal */}
			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Period..."
						: action === "edit"
							? "Edit Payroll Period"
							: "Create Payroll Period"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading period...</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label
										htmlFor="payroll-period-name"
										className="block text-sm font-medium text-gray-700 mb-1">
										Period Name *
									</label>
									<Input
										id="payroll-period-name"
										type="text"
										placeholder="e.g., January 2026"
										aria-invalid={Boolean(errors.name)}
										{...register("name", {
											required: "Period name is required",
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watch("name")?.trim() ? "default" : "invalid",
											},
											{ label: "Aa1", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="status">
									<div className="block text-sm font-medium text-gray-700 mb-1">
										Status *
									</div>
									<Controller
										name="status"
										control={control}
										rules={{ required: true }}
										render={({ field }) => (
											<Select
												options={statusOptions}
												value={field.value}
												onChange={field.onChange}
												placeholder="Select status"
												error={Boolean(errors.status)}
											/>
										)}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "Required", tone: "default" }]}
									/>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div>
									<div className="block text-sm font-medium text-gray-700 mb-1">
										Pay Frequency
									</div>
									<Controller
										name="payFrequency"
										control={control}
										render={({ field }) => (
											<Select
												options={payFrequencyOptions}
												value={field.value || ""}
												onChange={field.onChange}
												placeholder="Select frequency"
											/>
										)}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "Cycle",
												tone: watchPayFrequency ? "default" : "subtle",
											},
										]}
									/>
								</div>
								<div data-field-path="cutoffDay">
									<label
										htmlFor="payroll-period-cutoff-day"
										className="block text-sm font-medium text-gray-700 mb-1">
										Cutoff Day (Optional)
									</label>
									<Input
										id="payroll-period-cutoff-day"
										type="number"
										placeholder="e.g., 15"
										aria-invalid={Boolean(errors.cutoffDay)}
										{...register("cutoffDay", {
											valueAsNumber: true,
											min: { value: 1, message: "Must be between 1 and 31" },
											max: { value: 31, message: "Must be between 1 and 31" },
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1-31",
												tone: errors.cutoffDay ? "invalid" : "subtle",
											},
											...(watchCutoffDay && watchPayFrequency
												? [
														{
															label: "Cutoff set",
															tone: "default" as const,
														},
													]
												: []),
										]}
									/>
								</div>
								<div data-field-path="periodNumber">
									<div className="block text-sm font-medium text-gray-700 mb-1">
										Period Number (Optional)
									</div>
									<Controller
										name="periodNumber"
										control={control}
										render={({ field }) => {
											const periodOptions =
												watchPayFrequency === "SEMI_MONTHLY"
													? [
															{ value: "1", label: "1 (1st Cutoff)" },
															{ value: "2", label: "2 (2nd Cutoff)" },
														]
													: [{ value: "1", label: "1 (Monthly)" }];

											return (
												<Select
													options={periodOptions}
													value={field.value?.toString()}
													onChange={(val) =>
														field.onChange(
															val ? parseInt(val) : undefined,
														)
													}
													placeholder="Select period number"
													disabled={!watchPayFrequency}
												/>
											);
										}}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label:
													watchPayFrequency === "SEMI_MONTHLY"
														? "1-2"
														: "1",
												tone: "subtle",
											},
										]}
									/>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="startDate">
									<label
										htmlFor="payroll-period-start-date"
										className="block text-sm font-medium text-gray-700 mb-1">
										Start Date *
									</label>
									<CalendarDatePicker
										value={watch("startDate") || ""}
										onChange={(next) =>
											setValue("startDate", next, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.startDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "Required", tone: "default" }]}
									/>
								</div>
								<div data-field-path="endDate">
									<label
										htmlFor="payroll-period-end-date"
										className="block text-sm font-medium text-gray-700 mb-1">
										End Date *
									</label>
									<CalendarDatePicker
										value={watch("endDate") || ""}
										onChange={(next) =>
											setValue("endDate", next, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.endDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "Required", tone: "default" }]}
									/>
								</div>
							</div>

							<div>
								<label
									htmlFor="payroll-period-pay-date"
									className="block text-sm font-medium text-gray-700 mb-1">
									Pay Date *
								</label>
								<CalendarDatePicker
									value={watch("payDate") || ""}
									onChange={(next) =>
										setValue("payDate", next, {
											shouldValidate: true,
											shouldDirty: true,
										})
									}
									className={
										errors.payDate
											? "border-red-300 focus:border-red-500"
											: ""
									}
								/>
								<ConstraintTokenRow
									tokens={[
										{ label: "Required", tone: "default" },
										{ label: "+5d default", tone: "subtle" },
									]}
								/>
							</div>

							<div>
								<label
									htmlFor="payroll-period-notes"
									className="block text-sm font-medium text-gray-700 mb-1">
									Notes (Optional)
								</label>
								<textarea
									id="payroll-period-notes"
									{...register("notes")}
									className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
									rows={3}
									placeholder="Optional notes"
								/>
								<ConstraintTokenRow
									tokens={[{ label: "Optional", tone: "subtle" }]}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3 pt-4 border-t">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}
								disabled={
									createPeriodMutation.isPending || updatePeriodMutation.isPending
								}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createPeriodMutation.isPending || updatePeriodMutation.isPending
								}>
								{createPeriodMutation.isPending || updatePeriodMutation.isPending
									? "Saving..."
									: action === "edit"
										? "Update"
										: "Create"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Delete Payroll Period"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading period...</div>
				) : activePeriod && action === "delete" ? (
					<div className="space-y-4">
						<div className="p-4 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								payroll period <strong>{activePeriod.name}</strong>.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deletePeriodMutation.isPending}>
								{deletePeriodMutation.isPending ? "Deleting..." : "Delete Period"}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Period not found</div>
				)}
			</Modal>

			{/* Generate Payroll (Timesheet) Confirmation Modal */}
			<Modal
				open={isGenerateTimesheetPayrollModalOpen}
				onOpenChange={(open) => {
					setIsGenerateTimesheetPayrollModalOpen(open);
					if (!open) {
						setSelectedPeriodForGeneration(null);
					}
				}}
				title="Generate Payroll from Timesheets"
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-4">
					<div className="p-4 bg-green-50 border border-green-200 rounded-md">
						<p className="text-sm text-green-800">
							This will create payroll records for all employees with{" "}
							<strong>approved timesheets</strong> in{" "}
							<strong>{selectedPeriodForGeneration?.name}</strong>.
						</p>
						{selectedPeriodForGeneration && (
							<div className="mt-3 text-xs text-green-700">
								<p>
									<strong>Period:</strong>{" "}
									{formatDate(selectedPeriodForGeneration.startDate, "short")} -{" "}
									{formatDate(selectedPeriodForGeneration.endDate, "short")}
								</p>
								<p>
									<strong>Status:</strong> {selectedPeriodForGeneration.status}
								</p>
							</div>
						)}
					</div>
					<div className="flex justify-end gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsGenerateTimesheetPayrollModalOpen(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="default"
							onClick={confirmGenerateTimesheetPayroll}
							disabled={generateTimesheetPayrollMutation.isPending}>
							{generateTimesheetPayrollMutation.isPending ? (
								<>
									<Zap className="w-4 h-4 mr-2 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<Zap className="w-4 h-4 mr-2" />
									Generate from Timesheets
								</>
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
