import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { formatDateTime } from "~/lib/utils/text-utils";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import {
	HR_MODAL_STANDARD_CLASS,
	HR_MODAL_WIDE_CLASS,
} from "~/lib/ui/admin-configuration-modal";
import { Eye, Edit, Trash2, MoreVertical, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "~/lib/hooks/use-auth";
import type { CalendarItem, CreateCalendarItem, UpdateCalendarItem } from "~/zod/calendar-item.zod";
import {
	useCalendarItems,
	useCalendarItem,
	useCreateCalendarItem,
	useUpdateCalendarItem,
	useDeleteCalendarItem,
} from "~/lib/hooks/use-calendar-items";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const CalendarItemFormSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	title: z.string().min(1, "Title is required"),
	description: z.string().optional(),
	type: z.enum([
		"HOLIDAY",
		"EVENT",
		"COMPANY_EVENT",
		"MEETING",
		"DEADLINE",
		"REMINDER",
		"BIRTHDAY",
	]),
	startDate: z.string(),
	endDate: z.string(),
	isAllDay: z.boolean(),
});
type CalendarItemFormData = z.infer<typeof CalendarItemFormSchema>;

export default function CalendarItemsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const navigate = useNavigate();

	const organizationId = user?.organizationId || user?.organization?.id;

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const typeFilter = searchParams.get("type") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Build filter string for API (no year filtering)
	let filterString = "";
	if (statusFilter) {
		filterString = `status:${statusFilter}`;
	}
	if (typeFilter) {
		filterString = filterString ? `${filterString},type:${typeFilter}` : `type:${typeFilter}`;
	}

	// Fetch calendar items for the organization (all years)
	const { data: calendarItemsData, isLoading } = useCalendarItems(
		organizationId || "",
		undefined, // No year filtering
		{
			page: pageParam,
			limit: limitParam,
			query: searchQuery,
			filter: filterString || undefined,
			count: true,
		},
	);

	const items = (calendarItemsData as any)?.data?.items || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const itemId = searchParams.get("itemId");

	// Single calendar item for modals (edit, view, delete)
	const activeItemId =
		action === "edit" || action === "view" || action === "delete" ? itemId : null;
	const { data: activeItem, isLoading: isLoadingItem } = useCalendarItem(activeItemId || "");

	// Mutation hooks
	const createItemMutation = useCreateCalendarItem();
	const updateItemMutation = useUpdateCalendarItem();
	const deleteItemMutation = useDeleteCalendarItem();

	// Helper function to get today's date in YYYY-MM-DD format
	const getTodayDate = () => {
		const today = new Date();
		return today.toISOString().split("T")[0];
	};

	// Helper function to convert ISO date string to YYYY-MM-DD format for date inputs
	const formatDateForInput = (isoDateString: string): string => {
		if (!isoDateString) return "";
		try {
			const date = new Date(isoDateString);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${year}-${month}-${day}`;
		} catch (error) {
			console.error("Error formatting date:", error);
			return "";
		}
	};

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<CalendarItemFormData>({
		resolver: zodResolver(CalendarItemFormSchema),
		defaultValues: {
			year: new Date().getFullYear(), // Default to current year, but will be derived from startDate
			title: "",
			description: "",
			type: "HOLIDAY",
			startDate: getTodayDate(),
			endDate: getTodayDate(),
			isAllDay: true,
		},
	});

	// Handle deep linking: populate forms
	useEffect(() => {
		if (action === "edit" && !isLoadingItem && activeItem) {
			const itemYear = activeItem.year || new Date(activeItem.startDate).getFullYear();
			const startDateStr =
				activeItem.startDate instanceof Date
					? activeItem.startDate.toISOString()
					: String(activeItem.startDate);
			const endDateStr =
				activeItem.endDate instanceof Date
					? activeItem.endDate.toISOString()
					: String(activeItem.endDate);
			reset({
				year: itemYear,
				title: activeItem.title,
				description: activeItem.description || "",
				type: activeItem.type,
				startDate: formatDateForInput(startDateStr),
				endDate: formatDateForInput(endDateStr),
				isAllDay: activeItem.isAllDay,
			});
		}
	}, [action, isLoadingItem, activeItem, reset]);

	const watchedType = watch("type");

	// Calendar item type options
	const typeOptions: SelectOption[] = [
		{ value: "HOLIDAY", label: "Holiday" },
		{ value: "EVENT", label: "Event" },
		{ value: "COMPANY_EVENT", label: "Company Event" },
		{ value: "MEETING", label: "Meeting" },
		{ value: "DEADLINE", label: "Deadline" },
		{ value: "REMINDER", label: "Reminder" },
		{ value: "BIRTHDAY", label: "Birthday" },
	];

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: [
				{ value: "ACTIVE", label: "Active" },
				{ value: "CANCELLED", label: "Cancelled" },
				{ value: "COMPLETED", label: "Completed" },
				{ value: "DRAFT", label: "Draft" },
			],
		},
		{
			key: "type",
			label: "Type",
			options: typeOptions,
		},
	];

	const columns: Column<CalendarItem>[] = [
		{
			key: "title",
			label: "Title",
			width: "200px",
			render: (value, item) => <span className="font-medium text-gray-900">{value}</span>,
		},
		{
			key: "type",
			label: "Type",
			width: "120px",
			render: (value) => (
				<Badge variant="outline">{value}</Badge>
			),
		},
		{
			key: "year",
			label: "Year",
			width: "80px",
			render: (value, item) => {
				const year = value || new Date(item.startDate).getFullYear();
				return <span className="font-semibold text-gray-700">{year}</span>;
			},
		},
		{
			key: "startDate",
			label: "Start Date",
			width: "150px",
			render: (value) => (
				<span className="text-gray-700">{formatDateTime(new Date(value))}</span>
			),
		},
		{
			key: "endDate",
			label: "End Date",
			width: "150px",
			render: (value) => (
				<span className="text-gray-700">{formatDateTime(new Date(value))}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			width: "100px",
			render: (_value, item) => <CategoricalText value={item.status} />,
		},
	];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openCreate = () => {
		const today = getTodayDate();
		reset({
			year: new Date().getFullYear(),
			title: "",
			description: "",
			type: "HOLIDAY",
			startDate: today,
			endDate: today,
			isAllDay: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("itemId");
		});
	};

	const openEdit = (item: CalendarItem) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("itemId", item.id);
		});
	};

	const onSubmit = (data: CalendarItemFormData) => {
		const isEditing = action === "edit";

		if (isEditing && activeItem) {
			const updatePayload: UpdateCalendarItem = {
				title: data.title,
				description: data.description || undefined,
				type: data.type,
				startDate: new Date(data.startDate),
				endDate: new Date(data.endDate),
				isAllDay: data.isAllDay,
				year: data.year,
			};

			updateItemMutation.mutate(
				{ itemId: activeItem.id, payload: updatePayload },
				{
					onSuccess: () => {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("itemId");
						});
					},
				},
			);
		} else {
			if (!user?.organizationId && !user?.organization?.id) {
				return;
			}
			if (!user?.id) {
				return;
			}

			const orgId = user.organizationId || user.organization?.id;

			const payload: CreateCalendarItem = {
				organizationId: orgId!,
				year: data.year,
				title: data.title,
				description: data.description || undefined,
				type: data.type,
				startDate: new Date(data.startDate),
				endDate: new Date(data.endDate),
				isAllDay: data.isAllDay,
				timezone: "UTC",
				tags: [],
				status: "ACTIVE",
			};

			createItemMutation.mutate(payload, {
				onSuccess: () => {
					reset();
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("itemId");
					});
				},
			});
		}
	};

	const handleDelete = (item: CalendarItem) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("itemId", item.id);
		});
	};

	const confirmDelete = () => {
		if (!activeItem) return;
		deleteItemMutation.mutate(
			{ itemId: activeItem.id },
			{
				onSuccess: () => {
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("itemId");
					});
				},
			},
		);
	};

	const handleView = (item: CalendarItem) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("itemId", item.id);
		});
	};

	const renderActions = (item: CalendarItem) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeItemId && isLoadingItem;

	// Server-side search handler
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

	// Server-side filter handler
	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.status) {
				next.set("status", filters.status);
			} else {
				next.delete("status");
			}
			if (filters.type) {
				next.set("type", filters.type);
			} else {
				next.delete("type");
			}
			next.set("page", "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Calendar Items"
				description="Manage all calendar items"
				data={items}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No calendar items found"
				emptyDescription="Get started by creating your first calendar item."
				emptyActions={
					<ConfigurationEmptyGuide label="Add calendar item" onClick={openCreate} />
				}
				searchWidth="w-80"
				searchPlaceholder="Search calendar items..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(calendarItemsData as any)?.data?.pagination?.total}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportPDF={() => {
					/* your PDF logic */
				}}
				onExportExcel={() => {
					/* your Excel logic */
				}}
				containedScroll
			/>

			{/* Edit / Create Modal */}
			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("itemId");
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Calendar Item..."
						: action === "edit"
							? "Edit Calendar Item"
							: "Add Calendar Item"
				}
				description={
					isDeepLinkLoading && action === "edit"
						? "Fetching calendar item data..."
						: action === "edit"
							? "Update calendar item information"
							: "Create a new calendar item"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading calendar item...</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="year">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Year *
								</label>
								<Input
									type="number"
									placeholder="e.g., 2024"
									aria-invalid={Boolean(errors.year)}
									{...register("year", { valueAsNumber: true })}
								/>
								<ConstraintTokenRow tokens={[{ label: "2000-2100", tone: "subtle" }]} />
							</div>
							<div data-field-path="type">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Type *
								</label>
								<Select
									value={watchedType}
									onChange={(value) => setValue("type", value as any)}
									options={typeOptions}
								/>
								<ConstraintTokenRow tokens={[{ label: "Required", tone: "default" }]} />
							</div>
						</div>

						<div data-field-path="title">
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Title *
							</label>
							<Input
								placeholder="e.g., New Year's Day"
								aria-invalid={Boolean(errors.title)}
								{...register("title")}
							/>
							<ConstraintTokenRow tokens={[{ label: "1+", tone: "default" }]} />
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Description
							</label>
							<Input
								placeholder="Optional description"
								{...register("description")}
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="startDate">
								<label className="block text-sm font-medium text-gray-700 mb-1">
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
								{errors.startDate && (
									<p className="mt-1 text-sm text-red-600">
										{errors.startDate.message}
									</p>
								)}
							</div>
							<div data-field-path="endDate">
								<label className="block text-sm font-medium text-gray-700 mb-1">
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
										errors.endDate ? "border-red-300 focus:border-red-500" : ""
									}
								/>
								{errors.endDate && (
									<p className="mt-1 text-sm text-red-600">
										{errors.endDate.message}
									</p>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<input type="checkbox" className="rounded" {...register("isAllDay")} />
							<label className="text-sm font-medium text-gray-700">All Day</label>
						</div>

						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("itemId");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createItemMutation.isPending || updateItemMutation.isPending
								}>
								{(createItemMutation.isPending || updateItemMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Item" : "Create Item"}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("itemId");
						});
					}
				}}
				title="Calendar Item Details"
				description="View calendar item information"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading calendar item...</div>
				) : activeItem && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">Title</label>
								<p className="text-sm font-medium">{activeItem.title}</p>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-500 mb-1">
									Type
								</label>
								<Badge variant="outline">{activeItem.type}</Badge>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Start Date
								</label>
								<p className="text-sm">
									{formatDateTime(new Date(activeItem.startDate))}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									End Date
								</label>
								<p className="text-sm">
									{formatDateTime(new Date(activeItem.endDate))}
								</p>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Description</label>
							<p className="text-sm">{activeItem.description || "-"}</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-500 mb-1">
								Status
							</label>
							<CategoricalText value={activeItem.status} />
						</div>
						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("itemId");
									});
								}}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeItem)}>Edit Item</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Calendar item not found</div>
				)}
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("itemId");
						});
					}
				}}
				title="Delete Calendar Item"
				description="Are you sure you want to delete this calendar item?"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading calendar item...</div>
				) : activeItem && action === "delete" ? (
					<div className="space-y-4">
						<div className="p-4 bg-red-50 border border-red-200 rounded-md">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								calendar item <strong>{activeItem.title}</strong>.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("itemId");
									});
								}}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteItemMutation.isPending}>
								{deleteItemMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Item"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Calendar item not found</div>
				)}
			</Modal>
		</div>
	);
}
