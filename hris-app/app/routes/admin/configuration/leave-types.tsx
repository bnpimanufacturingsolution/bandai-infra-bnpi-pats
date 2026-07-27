import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Checkbox } from "~/components/atoms/Checkbox";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useCreateLeaveType,
	useDeleteLeaveType,
	useImportLeaveTypes,
	useLeaveType,
	useLeaveTypes,
	useUpdateLeaveType,
} from "~/lib/hooks/useLeaveTypes";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { createTruncatedTextProps } from "~/lib/utils/text-utils";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import type {
	CreateLeaveTypeRequest,
	LeaveType,
	UpdateLeaveTypeRequest,
} from "~/services/leaveTypes.service";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigDateText,
	AdminConfigLongText,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

interface LeaveTypeFormData {
	name: string;
	code: string;
	description: string;
	sortOrder?: number;
	isActive: boolean;
	enabled: boolean;
	isPaid: boolean;
	requiresApproval: boolean;
	minAdvanceNoticeDays?: number;
	maxDaysPerRequest?: number;
	allowHalfDay: boolean;
	requireAttachment: boolean;
	allowedEmploymentTypes: string[];
}

const DEFAULT_EMPLOYMENT_TYPES = [
	"REGULAR",
	"PROBATIONARY",
	"CONTRACTUAL",
	"PART_TIME",
	"CONSULTANT",
	"INTERN",
];
const EMPLOYMENT_TYPE_OPTIONS = [
	{ value: "REGULAR", label: "Regular" },
	{ value: "PROBATIONARY", label: "Probationary" },
	{ value: "CONTRACTUAL", label: "Contractual" },
	{ value: "PART_TIME", label: "Part-time" },
	{ value: "CONSULTANT", label: "Consultant" },
	{ value: "INTERN", label: "Intern" },
];

const IMPORT_FIELDS = {
	required: [
		{ key: "CODE", label: "Leave Type Code", required: true, aliases: ["LeaveCode"] },
		{ key: "NAME", label: "Leave Type Name", required: true, aliases: ["LeaveType"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{ key: "SORT_ORDER", label: "Sort Order", aliases: ["Order"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
		{ key: "IS_PAID", label: "Paid Leave", aliases: ["Paid"] },
	],
	system: [],
};

const normalizeCode = (value: string) =>
	value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

const formatDate = (value?: string | null) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

const TABLE_BADGE_CLASS =
	"rounded-md px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap text-white";

const getBooleanBadgeClass = (enabled: boolean) =>
	enabled
		? `${TABLE_BADGE_CLASS} border-emerald-600 bg-emerald-600`
		: `${TABLE_BADGE_CLASS} border-slate-600 bg-slate-600`;

export default function LeaveTypesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();

	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const activeLeaveTypeId =
		action === "edit" || action === "view" || action === "delete" ? id : null;
	const filterString = statusFilter ? `isActive:${statusFilter}` : undefined;

	const { data: leaveTypesData, isLoading } = useLeaveTypes({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
	});
	const { refetch: refetchExportLeaveTypes } = useLeaveTypes(
		{
			page: 1,
			limit: 1000,
			query: searchQuery,
			filter: filterString,
			count: true,
		},
		{ enabled: false },
	);
	const leaveTypes = leaveTypesData?.leaveTypes || leaveTypesData?.leavetypes || [];
	const { data: activeLeaveType, isLoading: isLoadingLeaveType } = useLeaveType(
		activeLeaveTypeId || "",
	);

	const createLeaveTypeMutation = useCreateLeaveType();
	const updateLeaveTypeMutation = useUpdateLeaveType();
	const deleteLeaveTypeMutation = useDeleteLeaveType();
	const importLeaveTypesMutation = useImportLeaveTypes();
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<LeaveTypeFormData>({
		defaultValues: {
			name: "",
			code: "",
			description: "",
			sortOrder: 0,
			isActive: true,
			enabled: true,
			isPaid: true,
			requiresApproval: true,
			minAdvanceNoticeDays: 0,
			maxDaysPerRequest: 5,
			allowHalfDay: true,
			requireAttachment: false,
			allowedEmploymentTypes: DEFAULT_EMPLOYMENT_TYPES,
		},
	});

	const watchedName = watch("name") || "";
	const watchedCode = watch("code") || "";
	const watchedDescription = watch("description") || "";
	const watchedSortOrder = watch("sortOrder");
	const watchedIsActive = watch("isActive");
	const watchedEnabled = watch("enabled");
	const watchedIsPaid = watch("isPaid");
	const watchedRequiresApproval = watch("requiresApproval");
	const watchedAllowHalfDay = watch("allowHalfDay");
	const watchedRequireAttachment = watch("requireAttachment");
	const watchedAllowedEmploymentTypes = watch("allowedEmploymentTypes") || [];
	const watchedMinAdvanceNoticeDays = watch("minAdvanceNoticeDays");
	const watchedMaxDaysPerRequest = watch("maxDaysPerRequest");

	const updateSearchParams = useCallback(
		(mutator: (next: URLSearchParams) => void) => {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				mutator(next);
				return next;
			});
		},
		[setSearchParams],
	);

	useEffect(() => {
		if (action === "edit" && !isLoadingLeaveType && activeLeaveType) {
			reset({
				name: activeLeaveType.name,
				code: activeLeaveType.code,
				description: activeLeaveType.description || "",
				sortOrder: activeLeaveType.sortOrder ?? 0,
				isActive: activeLeaveType.isActive,
				enabled: activeLeaveType.enabled ?? activeLeaveType.isActive,
				isPaid: activeLeaveType.isPaid ?? true,
				requiresApproval: activeLeaveType.requiresApproval ?? true,
				minAdvanceNoticeDays: activeLeaveType.minAdvanceNoticeDays ?? 0,
				maxDaysPerRequest: activeLeaveType.maxDaysPerRequest ?? 5,
				allowHalfDay: activeLeaveType.allowHalfDay ?? true,
				requireAttachment: activeLeaveType.requireAttachment ?? false,
				allowedEmploymentTypes: activeLeaveType.allowedEmploymentTypes?.length
					? activeLeaveType.allowedEmploymentTypes
					: DEFAULT_EMPLOYMENT_TYPES,
			});
		}
	}, [action, activeLeaveType, isLoadingLeaveType, reset]);

	const closeModal = () => {
		reset();
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const openCreate = () => {
		reset({
			name: "",
			code: "",
			description: "",
			sortOrder: 0,
			isActive: true,
			enabled: true,
			isPaid: true,
			requiresApproval: true,
			minAdvanceNoticeDays: 0,
			maxDaysPerRequest: 5,
			allowHalfDay: true,
			requireAttachment: false,
			allowedEmploymentTypes: DEFAULT_EMPLOYMENT_TYPES,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (leaveType: LeaveType) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", leaveType.id);
		});
	};

	const handleView = (leaveType: LeaveType) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", leaveType.id);
		});
	};

	const handleDelete = (leaveType: LeaveType) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", leaveType.id);
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
			next.delete("id");
		});
	};

	const handleImportLeaveTypes = async (file: File) => {
		const result = await importLeaveTypesMutation.mutateAsync(file);
		const data = (result as any)?.data || result;
		const envelope = data?.data || (result as any)?.data?.data;
		const summary =
			data?.summary ||
			envelope?.summary ||
			(result as any)?.summary ||
			(result as any)?.data?.summary ||
			(result as any)?.data?.data?.summary;
		const hasErrors = Array.isArray(summary?.errors) && summary.errors.length > 0;
		const hasFailures = Number(summary?.failed || 0) > 0;
		const hasSkipped = Number(summary?.skipped || 0) > 0;
		if (!hasErrors && !hasFailures && !hasSkipped) {
			updateSearchParams((next) => next.delete("action"));
		}
		return result;
	};

	const handleDownloadTemplate = () => {
		const template = `CODE,NAME,DESCRIPTION,SORT_ORDER,IS_ACTIVE,IS_PAID
VL,Vacation Leave,,1,TRUE,TRUE
SL,Sick Leave,,2,TRUE,TRUE`;
		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "leave-types-template.csv";
		anchor.click();
		window.URL.revokeObjectURL(url);
	};

	const onSubmit = (data: LeaveTypeFormData) => {
		const name = data.name.trim();
		const code = normalizeCode(data.code);
		const description = data.description.trim();
		const sortOrder = Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0;
		const minAdvanceNoticeDays = Number.isFinite(Number(data.minAdvanceNoticeDays))
			? Math.max(0, Number(data.minAdvanceNoticeDays))
			: 0;
		const maxDaysPerRequest = Number.isFinite(Number(data.maxDaysPerRequest))
			? Math.max(0.5, Number(data.maxDaysPerRequest))
			: 5;
		const allowedEmploymentTypes = data.allowedEmploymentTypes || [];

		if (!name || !code) {
			toast.error("Name and code are required");
			return;
		}

		if (allowedEmploymentTypes.length === 0) {
			toast.error("Select at least one employment type");
			return;
		}

		if (action === "edit" && activeLeaveType) {
			const payload: UpdateLeaveTypeRequest = {
				name,
				code,
				description,
				sortOrder,
				isActive: data.isActive,
				enabled: data.enabled,
				isPaid: data.isPaid,
				requiresApproval: data.requiresApproval,
				minAdvanceNoticeDays,
				maxDaysPerRequest,
				allowHalfDay: data.allowHalfDay,
				requireAttachment: data.requireAttachment,
				allowedEmploymentTypes,
			};
			updateLeaveTypeMutation.mutate(
				{ id: activeLeaveType.id, payload },
				{ onSuccess: closeModal },
			);
			return;
		}

		const organizationId = user?.organizationId || user?.organization?.id;
		if (!organizationId) {
			toast.error("Organization not found. Please refresh.");
			return;
		}

		const payload: CreateLeaveTypeRequest = {
			name,
			code,
			description,
			sortOrder,
			isActive: data.isActive,
			organizationId,
			enabled: data.enabled,
			isPaid: data.isPaid,
			requiresApproval: data.requiresApproval,
			minAdvanceNoticeDays,
			maxDaysPerRequest,
			allowHalfDay: data.allowHalfDay,
			requireAttachment: data.requireAttachment,
			allowedEmploymentTypes,
		};
		createLeaveTypeMutation.mutate(payload, { onSuccess: closeModal });
	};

	const confirmDelete = () => {
		if (!activeLeaveType) return;
		deleteLeaveTypeMutation.mutate(activeLeaveType.id, { onSuccess: closeModal });
	};

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.isActive) next.set("status", filters.isActive);
			else next.delete("status");
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const toggleEmploymentType = (employmentType: string, checked: boolean) => {
		const current = new Set(watchedAllowedEmploymentTypes);
		if (checked) current.add(employmentType);
		else current.delete(employmentType);
		setValue("allowedEmploymentTypes", Array.from(current), {
			shouldDirty: true,
			shouldValidate: true,
		});
	};

	const exportLeaveTypesToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: LeaveType[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: (await refetchExportLeaveTypes()).data?.leaveTypes || [];

		downloadCsvFile(
			buildDatedCsvFilename("leave-types"),
			[
				"Name",
				"Code",
				"Description",
				"Sort Order",
				"Status",
				"Enabled",
				"Paid",
				"Requires Approval",
				"Notice Days",
				"Max Days",
				"Half-day",
				"Attachment",
				"Employment Types",
				"Updated",
			],
			exportItems.map((leaveType) => [
				leaveType.name || "",
				leaveType.code || "",
				leaveType.description || "",
				leaveType.sortOrder ?? 0,
				leaveType.isActive && leaveType.enabled ? "Active" : "Inactive",
				leaveType.enabled ? "Yes" : "No",
				leaveType.isPaid ? "Yes" : "No",
				leaveType.requiresApproval ? "Yes" : "No",
				leaveType.minAdvanceNoticeDays ?? 0,
				leaveType.maxDaysPerRequest ?? 5,
				leaveType.allowHalfDay ? "Yes" : "No",
				leaveType.requireAttachment ? "Yes" : "No",
				(leaveType.allowedEmploymentTypes || []).join("; "),
				formatDate(leaveType.updatedAt),
			]),
		);
	};

	const filterOptions: FilterOption[] = [
		{
			key: "isActive",
			label: "Status",
			options: [
				{ value: "true", label: "Active" },
				{ value: "false", label: "Inactive" },
			],
		},
	];

	const columns: Column<LeaveType>[] = [
		{
			key: "name",
			label: "Leave Type",
			width: "260px",
			required: true,
			priority: "critical",
			render: (_, leaveType) => (
				<AdminConfigPrimaryCell
					primary={leaveType.name}
					secondary={<AdminConfigCodeChip>{leaveType.code}</AdminConfigCodeChip>}
					title={leaveType.name}
				/>
			),
		},
		{
			key: "enabled",
			label: "Policy",
			width: "240px",
			required: true,
			priority: "high",
			render: (_, leaveType) => (
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Badge variant="outline" className={getBooleanBadgeClass(!!leaveType.enabled)}>
						{leaveType.enabled ? "Enabled" : "Disabled"}
					</Badge>
					<CategoricalText value={leaveType.isPaid ? "Paid" : "Unpaid"} />
					<CategoricalText
						value={leaveType.requiresApproval ? "Approval" : "Auto"}
						tone={leaveType.requiresApproval ? "amber" : "blue"}
					/>
				</div>
			),
		},
		{
			key: "description",
			label: "Rules",
			width: "260px",
			priority: "medium",
			hideBelow: "lg",
			render: (_, leaveType) => {
				const summary = `${leaveType.minAdvanceNoticeDays ?? 0} day notice, ${leaveType.maxDaysPerRequest ?? 5} max, ${
					leaveType.allowHalfDay ? "half-day ok" : "full-day only"
				}${leaveType.requireAttachment ? ", attachment" : ""}`;
				const textProps = createTruncatedTextProps(summary, 64);
				return <AdminConfigLongText title={textProps.title}>{textProps.displayText}</AdminConfigLongText>;
			},
		},
		{
			key: "isActive",
			label: "Status",
			width: "110px",
			required: true,
			priority: "critical",
			render: (value) => (
				<CategoricalText value={value ? "Active" : "Inactive"} />
			),
		},
		{
			key: "updatedAt",
			label: "Updated",
			width: "130px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => <AdminConfigDateText>{formatDate(value)}</AdminConfigDateText>,
		},
	];

	const renderActions = (item: LeaveType) => (
		<div className="flex justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="flex h-8 w-8 items-center justify-center p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="mr-2 h-4 w-4" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openEdit(item)}>
						<Edit className="mr-2 h-4 w-4" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleDelete(item)}
						className="text-red-600 focus:bg-red-50 focus:text-red-600">
						<Trash2 className="mr-2 h-4 w-4" />
						Deactivate
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	const isDeepLinkLoading = !!activeLeaveTypeId && isLoadingLeaveType;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Leave Types"
				data={leaveTypes}
				columns={columns}
				filters={filterOptions}
				filterValues={{ isActive: statusFilter || "" }}
				onAdd={openCreate}
				onImport={openImport}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No leave types yet"
				emptyDescription="Add leave types used by leave policies and employee balances."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add leave type"
						to="/admin/configuration/leave-types?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search leave types..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={leaveTypesData?.count}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportCSV={exportLeaveTypesToCsv}
				containedScroll
			/>

			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Leave Type..."
						: action === "edit"
							? "Edit Leave Type"
							: "Create Leave Type"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading leave type...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Name *
									</label>
									<Input
										placeholder="e.g., Sick Leave"
										aria-invalid={Boolean(errors.name)}
										{...register("name", { required: true })}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedName.trim() ? "default" : "invalid",
											},
											{ label: "A-Z", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="code">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Code *
									</label>
									<Input
										placeholder="e.g., SICK_LEAVE"
										aria-invalid={Boolean(errors.code)}
										{...register("code", {
											required: true,
											onBlur: (event) =>
												setValue(
													"code",
													normalizeCode(event.target.value),
													{
														shouldDirty: true,
														shouldValidate: true,
													},
												),
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedCode.trim() ? "default" : "invalid",
											},
											{ label: "A-Z_0-9", tone: "subtle" },
										]}
									/>
								</div>
							</div>
							<div data-field-path="description">
								<label className="mb-1 block text-sm font-medium text-gray-700">
									Description
								</label>
								<Input
									placeholder="Optional description"
									aria-invalid={Boolean(errors.description)}
									{...register("description")}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0-160",
											tone:
												watchedDescription.length > 160
													? "invalid"
													: "subtle",
										},
									]}
								/>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div data-field-path="sortOrder">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Sort Order
									</label>
									<Input
										type="number"
										placeholder="0"
										aria-invalid={Boolean(errors.sortOrder)}
										{...register("sortOrder", {
											valueAsNumber: true,
											setValueAs: (value) =>
												value === "" ||
												value === null ||
												Number.isNaN(Number(value))
													? 0
													: Number(value),
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0-999",
												tone:
													watchedSortOrder == null ||
													Number(watchedSortOrder) >= 0
														? "subtle"
														: "invalid",
											},
										]}
									/>
								</div>
								<div className="flex items-end">
									<label
										htmlFor="isActive"
										className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
										<Checkbox
											id="isActive"
											checked={!!watchedIsActive}
											onCheckedChange={(checked) =>
												setValue("isActive", checked === true, {
													shouldDirty: true,
												})
											}
										/>
										Active
									</label>
								</div>
							</div>
						</div>

						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div data-field-path="minAdvanceNoticeDays">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Advance Notice Days
									</label>
									<Input
										type="number"
										min={0}
										placeholder="0"
										aria-invalid={Boolean(errors.minAdvanceNoticeDays)}
										{...register("minAdvanceNoticeDays", {
											valueAsNumber: true,
											setValueAs: (value) =>
												value === "" ||
												value === null ||
												Number.isNaN(Number(value))
													? 0
													: Number(value),
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0+ days",
												tone:
													watchedMinAdvanceNoticeDays == null ||
													Number(watchedMinAdvanceNoticeDays) >= 0
														? "subtle"
														: "invalid",
											},
										]}
									/>
								</div>
								<div data-field-path="maxDaysPerRequest">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Max Days Per Request
									</label>
									<Input
										type="number"
										min={0.5}
										step={0.5}
										placeholder="5"
										aria-invalid={Boolean(errors.maxDaysPerRequest)}
										{...register("maxDaysPerRequest", {
											valueAsNumber: true,
											setValueAs: (value) =>
												value === "" ||
												value === null ||
												Number.isNaN(Number(value))
													? 5
													: Number(value),
										})}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0.5+",
												tone:
													watchedMaxDaysPerRequest == null ||
													Number(watchedMaxDaysPerRequest) >= 0.5
														? "subtle"
														: "invalid",
											},
										]}
									/>
								</div>
							</div>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<label className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
									<Checkbox
										checked={!!watchedEnabled}
										onCheckedChange={(checked) =>
											setValue("enabled", checked === true, {
												shouldDirty: true,
											})
										}
									/>
									Available for requests
								</label>
								<label className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
									<Checkbox
										checked={!!watchedIsPaid}
										onCheckedChange={(checked) =>
											setValue("isPaid", checked === true, {
												shouldDirty: true,
											})
										}
									/>
									Paid leave
								</label>
								<label className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
									<Checkbox
										checked={!!watchedRequiresApproval}
										onCheckedChange={(checked) =>
											setValue("requiresApproval", checked === true, {
												shouldDirty: true,
											})
										}
									/>
									Requires approval
								</label>
								<label className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
									<Checkbox
										checked={!!watchedAllowHalfDay}
										onCheckedChange={(checked) =>
											setValue("allowHalfDay", checked === true, {
												shouldDirty: true,
											})
										}
									/>
									Allow half-day
								</label>
								<label className="flex min-h-10 items-center gap-2 text-sm font-medium text-gray-700">
									<Checkbox
										checked={!!watchedRequireAttachment}
										onCheckedChange={(checked) =>
											setValue("requireAttachment", checked === true, {
												shouldDirty: true,
											})
										}
									/>
									Require attachment
								</label>
							</div>
							<div data-field-path="allowedEmploymentTypes" className="space-y-2">
								<label className="block text-sm font-medium text-gray-700">
									Allowed Employment Types
								</label>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									{EMPLOYMENT_TYPE_OPTIONS.map((option) => (
										<label
											key={option.value}
											className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-gray-700">
											<Checkbox
												checked={watchedAllowedEmploymentTypes.includes(
													option.value,
												)}
												onCheckedChange={(checked) =>
													toggleEmploymentType(
														option.value,
														checked === true,
													)
												}
											/>
											{option.label}
										</label>
									))}
								</div>
								<ConstraintTokenRow
									tokens={[
										{
											label: "1+ type",
											tone: watchedAllowedEmploymentTypes.length
												? "default"
												: "invalid",
										},
									]}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createLeaveTypeMutation.isPending ||
									updateLeaveTypeMutation.isPending
								}>
								{(createLeaveTypeMutation.isPending ||
									updateLeaveTypeMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update" : "Create"} Leave Type
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
				title="Leave Type Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading leave type...</div>
				) : activeLeaveType && action === "view" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Name
									</label>
									<p className="mt-1 text-sm font-medium text-gray-900">
										{activeLeaveType.name}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Code
									</label>
									<p className="mt-1 font-mono text-sm text-gray-800">
										{activeLeaveType.code}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Description
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{activeLeaveType.description || "-"}
								</p>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Sort Order
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.sortOrder ?? 0}
									</p>
								</div>
								<div>
									<label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
										Status
									</label>
									<CategoricalText
										value={activeLeaveType.isActive ? "Active" : "Inactive"}
									/>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Updated
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{formatDate(activeLeaveType.updatedAt)}
									</p>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Request Status
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.enabled ? "Available" : "Disabled"}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Pay Rule
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.isPaid ? "Paid" : "Unpaid"}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Approval
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.requiresApproval
											? "Required"
											: "Not required"}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Notice
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.minAdvanceNoticeDays ?? 0} day(s)
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Max Request
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.maxDaysPerRequest ?? 5} day(s)
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Half-day
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.allowHalfDay ? "Allowed" : "Blocked"}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Attachment
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLeaveType.requireAttachment
											? "Required"
											: "Optional"}
									</p>
								</div>
								<div className="md:col-span-2">
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Employment Types
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{(activeLeaveType.allowedEmploymentTypes || []).join(
											", ",
										) || "-"}
									</p>
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button variant="outline" onClick={closeModal}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeLeaveType)}>
								Edit Leave Type
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Leave type not found</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Deactivate Leave Type"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading leave type...</div>
				) : activeLeaveType && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This disables <strong>{activeLeaveType.name}</strong> (
								{activeLeaveType.code}) for new leave requests. Historical requests,
								balances, attendance, and timesheet snapshots stay untouched.
							</p>
						</div>
						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteLeaveTypeMutation.isPending}>
								{deleteLeaveTypeMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deactivating...
									</>
								) : (
									"Deactivate Leave Type"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Leave type not found</div>
				)}
			</Modal>

			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => next.delete("action"));
					}
				}}
				title="Import Leave Types"
				description="Upload a CSV/Excel file to bulk import leave types"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportLeaveTypes}
				isImporting={importLeaveTypesMutation.isPending}
			/>
		</div>
	);
}
