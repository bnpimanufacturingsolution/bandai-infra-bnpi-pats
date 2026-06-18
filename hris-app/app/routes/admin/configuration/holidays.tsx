import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useCalendarItem,
	useCalendarItems,
	useCreateCalendarItem,
	useDeleteCalendarItem,
	useImportCalendarItems,
	useUpdateCalendarItem,
} from "~/lib/hooks/use-calendar-items";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { toast } from "sonner";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import type { CalendarItem, CreateCalendarItem, UpdateCalendarItem } from "~/zod/calendar-item.zod";
import {
	useAdminFormErrorNavigation,
	ADMIN_INVALID_FIELD_CLASS,
} from "~/lib/ui/admin-configuration-form";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCategoryChip,
	AdminConfigDateText,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

type HolidayType = "regular" | "special-non-working" | "special-working";
type ItemStatus = "ACTIVE" | "DRAFT" | "CANCELLED" | "COMPLETED";

interface HolidayFormData {
	title: string;
	description?: string;
	holidayType: HolidayType;
	startDate: string;
	endDate: string;
	status: ItemStatus;
}

interface HolidayTableItem extends CalendarItem {
	holidayType: HolidayType;
	holidayTypeLabel: string;
}

const HOLIDAY_FILTER = "type:HOLIDAY";
const HOLIDAY_TYPE_META: Record<
	HolidayType,
	{ label: string; category: string; badgeVariant: "default" | "warning" | "secondary" }
> = {
	regular: {
		label: "Regular Holiday",
		category: "Regular Holiday",
		badgeVariant: "default",
	},
	"special-non-working": {
		label: "Special (Non-Working)",
		category: "Special (Non-Working) Holiday",
		badgeVariant: "warning",
	},
	"special-working": {
		label: "Special (Working)",
		category: "Special (Working) Holiday",
		badgeVariant: "secondary",
	},
};

const HOLIDAY_TYPE_OPTIONS: SelectOption[] = Object.entries(HOLIDAY_TYPE_META).map(
	([value, meta]) => ({
		value,
		label: meta.label,
	}),
);

const STATUS_OPTIONS: SelectOption[] = [
	{ value: "ACTIVE", label: "Active" },
	{ value: "DRAFT", label: "Draft" },
	{ value: "CANCELLED", label: "Cancelled" },
	{ value: "COMPLETED", label: "Completed" },
];

const TABLE_FILTER_OPTIONS: FilterOption[] = [
	{
		key: "status",
		label: "Status",
		options: STATUS_OPTIONS,
	},
];

const IMPORT_FIELDS = {
	required: [
		{ key: "TITLE", label: "Holiday Name", required: true, aliases: ["Description"] },
		{ key: "START_DATE", label: "Start Date", required: true, aliases: ["Date"] },
	],
	optional: [
		{ key: "END_DATE", label: "End Date" },
		{ key: "HOLIDAY_TYPE", label: "Holiday Type", aliases: ["Type"] },
		{ key: "STATUS", label: "Status" },
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
	],
	system: [],
};

const isHolidayType = (value: unknown): value is HolidayType =>
	value === "regular" || value === "special-non-working" || value === "special-working";

const getHolidayType = (item?: CalendarItem | null): HolidayType => {
	const holidayType =
		item?.metadata && typeof item.metadata === "object" ? item.metadata.holidayType : undefined;
	return isHolidayType(holidayType) ? holidayType : "regular";
};

const formatDateForInput = (value?: Date | string | null): string => {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const formatBusinessDate = (value?: Date | string | null): string => {
	const inputValue = formatDateForInput(value);
	if (!inputValue) return "-";
	const [year, month, day] = inputValue.split("-");
	return `${month}/${day}/${year}`;
};

const getDefaultFormValues = (): HolidayFormData => {
	const today = formatDateForInput(new Date());
	return {
		title: "",
		description: "",
		holidayType: "regular",
		startDate: today,
		endDate: today,
		status: "ACTIVE",
	};
};

const buildHolidayMetadata = (
	holidayType: HolidayType,
	currentMetadata?: CalendarItem["metadata"],
) => {
	const baseMetadata =
		currentMetadata && typeof currentMetadata === "object" ? { ...currentMetadata } : {};

	return {
		...baseMetadata,
		holidayType,
		category: HOLIDAY_TYPE_META[holidayType].category,
	};
};

const buildHolidayTags = (holidayType: HolidayType, existingTags: string[] = []) => {
	const preservedTags = existingTags.filter((tag) => tag !== "holiday" && !isHolidayType(tag));
	return Array.from(new Set(["holiday", holidayType, ...preservedTags]));
};

const renderHolidayTypeBadge = (holidayType: HolidayType) => (
	<Badge
		variant={HOLIDAY_TYPE_META[holidayType].badgeVariant}
		className="w-fit max-w-full whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold leading-5">
		{HOLIDAY_TYPE_META[holidayType].label}
	</Badge>
);

export default function HolidaysPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();

	const organizationId = user?.organizationId || user?.organization?.id;
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const activeHolidayId =
		action === "edit" || action === "view" || action === "delete" ? id : null;
	const holidayFilter = `${HOLIDAY_FILTER}${statusFilter ? `,status:${statusFilter}` : ""}`;

	const { data: holidaysData, isLoading } = useCalendarItems(organizationId || "", undefined, {
		page: pageParam,
		limit: limitParam,
		count: true,
		query: searchQuery,
		filter: holidayFilter,
	});
	const { refetch: refetchExportHolidays } = useCalendarItems(organizationId || "", undefined, {
		page: 1,
		limit: 1000,
		count: true,
		query: searchQuery,
		filter: holidayFilter,
	});
	const { data: activeItem, isLoading: isLoadingHoliday } = useCalendarItem(
		activeHolidayId || "",
	);

	const createHolidayMutation = useCreateCalendarItem();
	const updateHolidayMutation = useUpdateCalendarItem();
	const deleteHolidayMutation = useDeleteCalendarItem();
	const importHolidaysMutation = useImportCalendarItems();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<HolidayFormData>({
		defaultValues: getDefaultFormValues(),
	});

	const watchedHolidayType = watch("holidayType");
	const watchedStatus = watch("status");
	const watchedTitle = watch("title") || "";
	const watchedDescription = watch("description") || "";
	const watchedStartDate = watch("startDate") || "";
	const watchedEndDate = watch("endDate") || "";
	const activeHoliday = activeItem?.type === "HOLIDAY" ? activeItem : null;
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	const holidays: HolidayTableItem[] = (
		((holidaysData as any)?.data?.items || []) as CalendarItem[]
	)
		.filter((item) => item.type === "HOLIDAY")
		.map((item) => {
			const holidayType = getHolidayType(item);
			return {
				...item,
				holidayType,
				holidayTypeLabel: HOLIDAY_TYPE_META[holidayType].label,
			};
		});

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
		if (action === "edit" && !isLoadingHoliday && activeHoliday) {
			reset({
				title: activeHoliday.title,
				description: activeHoliday.description || "",
				holidayType: getHolidayType(activeHoliday),
				startDate: formatDateForInput(activeHoliday.startDate),
				endDate: formatDateForInput(activeHoliday.endDate),
				status: activeHoliday.status,
			});
		}
	}, [action, activeHoliday, isLoadingHoliday, reset]);

	const openCreate = () => {
		reset(getDefaultFormValues());
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (holiday: HolidayTableItem | CalendarItem) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", holiday.id);
		});
	};

	const handleView = (holiday: HolidayTableItem) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", holiday.id);
		});
	};

	const handleDelete = (holiday: HolidayTableItem) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", holiday.id);
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
			next.delete("id");
		});
	};

	const closeModal = () => {
		reset(getDefaultFormValues());
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const onSubmit = (data: HolidayFormData) => {
		if (!organizationId) {
			toast.error("User organization ID not found");
			return;
		}

		const startDate = new Date(data.startDate);
		const endDate = new Date(data.endDate);

		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			toast.error("Please provide a valid holiday date range");
			return;
		}

		if (endDate < startDate) {
			toast.error("End date must be after or equal to the start date");
			return;
		}

		const metadata = buildHolidayMetadata(data.holidayType, activeHoliday?.metadata);
		const tags = buildHolidayTags(data.holidayType, activeHoliday?.tags || []);

		if (action === "edit" && activeHoliday) {
			const payload: UpdateCalendarItem = {
				title: data.title.trim(),
				description: data.description?.trim() || undefined,
				type: "HOLIDAY",
				startDate,
				endDate,
				year: startDate.getFullYear(),
				isAllDay: true,
				timezone: activeHoliday.timezone || "UTC",
				status: data.status,
				metadata,
				tags,
			};

			updateHolidayMutation.mutate(
				{ itemId: activeHoliday.id, payload },
				{
					onSuccess: () => closeModal(),
				},
			);
			return;
		}

		const payload: CreateCalendarItem = {
			organizationId,
			year: startDate.getFullYear(),
			title: data.title.trim(),
			description: data.description?.trim() || undefined,
			type: "HOLIDAY",
			startDate,
			endDate,
			isAllDay: true,
			timezone: "UTC",
			status: data.status,
			metadata,
			tags,
			recurrence: null,
		};

		createHolidayMutation.mutate(payload, {
			onSuccess: () => closeModal(),
		});
	};

	const confirmDelete = () => {
		if (!activeHoliday) return;
		deleteHolidayMutation.mutate(
			{ itemId: activeHoliday.id },
			{
				onSuccess: () => closeModal(),
			},
		);
	};

	const handleImportHolidays = async (file: File) => {
		const result = await importHolidaysMutation.mutateAsync(file);
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
		const template = `TITLE,HOLIDAY_TYPE,START_DATE,END_DATE,STATUS,DESCRIPTION
New Year's Day,regular,2026-01-01,2026-01-01,ACTIVE,LH
Company Holiday,special-non-working,2026-01-02,2026-01-02,ACTIVE,SH`;
		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "holidays-template.csv";
		anchor.click();
		window.URL.revokeObjectURL(url);
	};

	const exportHolidaysToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: HolidayTableItem[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: (
						(((await refetchExportHolidays()).data as any)?.data?.items ||
							[]) as CalendarItem[]
					)
						.filter((item) => item.type === "HOLIDAY")
						.map((item) => {
							const holidayType = getHolidayType(item);
							return {
								...item,
								holidayType,
								holidayTypeLabel: HOLIDAY_TYPE_META[holidayType].label,
							};
						});

		downloadCsvFile(
			buildDatedCsvFilename("holidays"),
			["Title", "Holiday Type", "Start Date", "End Date", "Status", "Description"],
			exportItems.map((holiday) => [
				holiday.title || "",
				holiday.holidayTypeLabel,
				formatDateForInput(holiday.startDate),
				formatDateForInput(holiday.endDate),
				holiday.status,
				holiday.description || "",
			]),
		);
	};

	const renderActions = (item: HolidayTableItem) => (
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
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	const columns: Column<HolidayTableItem>[] = [
		{
			key: "title",
			label: "Holiday",
			required: true,
			priority: "critical",
			render: (_, holiday) => (
				<AdminConfigPrimaryCell primary={holiday.title} title={holiday.title} />
			),
		},
		{
			key: "holidayType",
			label: "Holiday Type",
			width: "190px",
			required: true,
			priority: "high",
			render: (_, holiday) => (
				<AdminConfigCategoryChip>
					{holiday.holidayTypeLabel || HOLIDAY_TYPE_META[holiday.holidayType].label}
				</AdminConfigCategoryChip>
			),
		},
		{
			key: "startDate",
			label: "Start Date",
			required: true,
			priority: "high",
			render: (_, holiday) => (
				<AdminConfigDateText>{formatBusinessDate(holiday.startDate)}</AdminConfigDateText>
			),
		},
		{
			key: "endDate",
			label: "End Date",
			priority: "medium",
			hideBelow: "lg",
			render: (_, holiday) => (
				<AdminConfigDateText>{formatBusinessDate(holiday.endDate)}</AdminConfigDateText>
			),
		},
		{
			key: "year",
			label: "Year",
			priority: "low",
			hideBelow: "xl",
			render: (_, holiday) => (
				<div className="text-sm font-medium text-gray-700">
					{holiday.year || new Date(holiday.startDate).getFullYear()}
				</div>
			),
		},
		{
			key: "status",
			label: "Status",
			required: true,
			priority: "critical",
			render: (_, holiday) => <CategoricalText value={holiday.status} />,
		},
	];

	const isDeepLinkLoading = !!activeHolidayId && isLoadingHoliday;

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

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Holidays"
				data={holidays}
				columns={columns}
				filters={TABLE_FILTER_OPTIONS}
				onAdd={openCreate}
				onImport={openImport}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No holidays created yet"
				emptyDescription="Get started by creating your first holiday."
				emptyActions={<ConfigurationEmptyGuide label="Add holiday" onClick={openCreate} />}
				searchWidth="w-80"
				searchPlaceholder="Search holidays..."
				addButtonLabel="Add Holiday"
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(holidaysData as any)?.data?.pagination?.total}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ status: statusFilter || "" }}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportCSV={exportHolidaysToCsv}
				containedScroll
			/>

			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Holiday..."
						: action === "edit"
							? "Edit Holiday"
							: "Create Holiday"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading holiday...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="title">
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Holiday Name *
									</span>
									<Input
										{...register("title", { required: true })}
										aria-invalid={Boolean(errors.title)}
										placeholder="e.g., New Year's Day"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedTitle.trim() ? "default" : "invalid",
											},
											{ label: "A-Z", tone: "subtle" },
										]}
									/>
								</div>
								<div data-field-path="holidayType">
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Holiday Type *
									</span>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("holidayType", {
											required: "Holiday type is required",
										})}
									/>
									<Select
										value={watchedHolidayType}
										onChange={(value) =>
											setValue("holidayType", value as HolidayType, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										options={HOLIDAY_TYPE_OPTIONS}
										name="holidayType"
										error={Boolean(errors.holidayType)}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "1", tone: "default" }]}
									/>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="startDate">
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Start Date *
									</span>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("startDate", {
											required: "Start date is required",
										})}
									/>
									<CalendarDatePicker
										value={watch("startDate")}
										onChange={(value) =>
											setValue("startDate", value, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										className={
											errors.startDate ? ADMIN_INVALID_FIELD_CLASS : undefined
										}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "Today+",
												tone: watchedStartDate ? "default" : "invalid",
											},
										]}
									/>
								</div>
								<div data-field-path="endDate">
									<span className="mb-1 block text-sm font-medium text-gray-700">
										End Date *
									</span>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("endDate", {
											required: "End date is required",
										})}
									/>
									<CalendarDatePicker
										value={watch("endDate")}
										onChange={(value) =>
											setValue("endDate", value, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										minDate={
											watch("startDate")
												? new Date(watch("startDate"))
												: undefined
										}
										className={
											errors.endDate ? ADMIN_INVALID_FIELD_CLASS : undefined
										}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "Start-End",
												tone:
													watchedEndDate &&
													watchedStartDate &&
													watchedEndDate >= watchedStartDate
														? "default"
														: "invalid",
											},
										]}
									/>
								</div>
							</div>

							<div data-field-path="description">
								<span className="mb-1 block text-sm font-medium text-gray-700">
									Description (Optional)
								</span>
								<Input
									{...register("description")}
									aria-invalid={Boolean(errors.description)}
									placeholder="Add notes for payroll or operations"
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0-120",
											tone:
												watchedDescription.length > 120
													? "invalid"
													: "subtle",
										},
									]}
								/>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="status">
									<span className="mb-1 block text-sm font-medium text-gray-700">
										Status
									</span>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("status")}
									/>
									<Select
										value={watchedStatus}
										onChange={(value) =>
											setValue("status", value as ItemStatus, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										options={STATUS_OPTIONS}
										name="status"
										error={Boolean(errors.status)}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "1", tone: "default" }]}
									/>
								</div>
								<div className="flex items-end">
									<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
										Year will be derived from the start date automatically.
									</div>
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createHolidayMutation.isPending ||
									updateHolidayMutation.isPending
								}>
								{(createHolidayMutation.isPending ||
									updateHolidayMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Holiday" : "Create Holiday"}
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
				title="Holiday Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading holiday...</div>
				) : activeHoliday && action === "view" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Holiday
									</span>
									<p className="mt-1 text-sm font-medium text-gray-900">
										{activeHoliday.title}
									</p>
								</div>
								<div>
									<span className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
										Holiday Type
									</span>
									{renderHolidayTypeBadge(getHolidayType(activeHoliday))}
								</div>
							</div>

							<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Start Date
									</span>
									<p className="mt-1 text-sm text-gray-800">
										{formatBusinessDate(activeHoliday.startDate)}
									</p>
								</div>
								<div>
									<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
										End Date
									</span>
									<p className="mt-1 text-sm text-gray-800">
										{formatBusinessDate(activeHoliday.endDate)}
									</p>
								</div>
							</div>

							<div className="mt-4">
								<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Description
								</span>
								<p className="mt-1 text-sm text-gray-800">
									{activeHoliday.description || "No description"}
								</p>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
								<div>
									<span className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
										Status
									</span>
									<CategoricalText value={activeHoliday.status} />
								</div>
								<div>
									<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Year
									</span>
									<p className="mt-1 text-sm text-gray-800">
										{activeHoliday.year}
									</p>
								</div>
								<div>
									<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Source Type
									</span>
									<p className="mt-1 text-sm text-gray-800">
										{activeHoliday.type}
									</p>
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button variant="outline" onClick={closeModal}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeHoliday)}>Edit Holiday</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Holiday not found</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeModal();
				}}
				title="Delete Holiday"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading holiday...</div>
				) : activeHoliday && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								holiday <strong>{activeHoliday.title}</strong>.
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
								disabled={deleteHolidayMutation.isPending}>
								{deleteHolidayMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Holiday"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Holiday not found</div>
				)}
			</Modal>

			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => next.delete("action"));
					}
				}}
				title="Import Holidays"
				description="Upload a CSV/Excel file to bulk import holidays"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportHolidays}
				isImporting={importHolidaysMutation.isPending}
			/>
		</div>
	);
}
