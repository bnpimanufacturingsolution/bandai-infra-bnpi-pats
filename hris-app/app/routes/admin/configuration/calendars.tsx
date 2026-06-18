import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { createTruncatedTextProps, formatDateTime } from "~/lib/utils/text-utils";
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
import {
	type Calendar,
	type CreateCalendar,
	type UpdateCalendar,
	CreateCalendarSchema,
} from "~/zod/calendar.zod";
import {
	useCalendars,
	useCalendar,
	useCreateCalendar,
	useUpdateCalendar,
	useDeleteCalendar,
} from "~/lib/hooks/use-calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

const CalendarFormSchema = CreateCalendarSchema.omit({ organizationId: true });
type CalendarFormData = z.infer<typeof CalendarFormSchema>;

export default function CalendarsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const navigate = useNavigate();
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deletingCalendar, setDeletingCalendar] = useState<Calendar | null>(null);

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const typeFilter = searchParams.get("type") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Build filter string for API
	let filterString = "";
	if (statusFilter) {
		filterString = `isActive:${statusFilter}`;
	}
	if (typeFilter) {
		filterString = filterString ? `${filterString},type:${typeFilter}` : `type:${typeFilter}`;
	}

	// React Query hooks with server-side search and filtering
	const { data: calendarsData, isLoading } = useCalendars({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString || undefined,
		count: true,
	});
	const items =
		(calendarsData as any)?.data?.calendars || (calendarsData as any)?.calendars || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single calendar ID for fetching (when action is edit, view, or delete)
	const activeCalendarId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	// Single useCalendar hook for all modals (edit, view, delete)
	const { data: activeCalendar, isLoading: isLoadingCalendar } = useCalendar(
		activeCalendarId || "",
	);

	// Mutation hooks
	const createCalendarMutation = useCreateCalendar();
	const updateCalendarMutation = useUpdateCalendar();
	const deleteCalendarMutation = useDeleteCalendar();

	const { register, handleSubmit, reset, setValue, watch } = useForm<CalendarFormData>({
		resolver: zodResolver(CalendarFormSchema),
		defaultValues: {
			name: "",
			description: "",
			type: "COMPANY",
			year: new Date().getFullYear(),
			country: "",
			region: "",
			isActive: true,
		},
	});

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingCalendar && activeCalendar) {
			reset({
				name: activeCalendar.name,
				description: activeCalendar.description || "",
				type: activeCalendar.type,
				year: activeCalendar.year,
				country: activeCalendar.country || "",
				region: activeCalendar.region || "",
				isActive: activeCalendar.isActive,
			});
		}
	}, [action, isLoadingCalendar, activeCalendar, reset]);

	const watchedType = watch("type");

	// Calendar type options
	const typeOptions: SelectOption[] = [
		{ value: "COMPANY", label: "Company" },
		{ value: "DEPARTMENT", label: "Department" },
		{ value: "REGIONAL", label: "Regional" },
	];

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

	const columns: Column<Calendar>[] = [
		{
			key: "name",
			label: "Name",
			width: "200px",
			render: (value, item) => <span className="font-medium text-gray-900">{value}</span>,
		},
		{
			key: "year",
			label: "Year",
			width: "100px",
			render: (value) => <span className="font-semibold text-gray-700">{value}</span>,
		},
		{
			key: "description",
			label: "Description",
			width: "300px",
			render: (value) => {
				if (!value) return <span className="text-gray-400">-</span>;
				const textProps = createTruncatedTextProps(value, 40);
				return (
					<span className={textProps.className} title={textProps.title}>
						{textProps.displayText}
					</span>
				);
			},
		},
		{
			key: "type",
			label: "Type",
			width: "120px",
			render: (value, item) => (
				<div className="flex items-center gap-2">
					<span className="font-medium text-gray-900">{value}</span>
				</div>
			),
		},
		{
			key: "isActive",
			label: "Status",
			width: "100px",
			render: (value, item) => (
				<Badge variant={item.isActive ? "success" : "secondary"}>
					{item.isActive ? "Active" : "Inactive"}
				</Badge>
			),
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
		reset({
			name: "",
			description: "",
			type: "COMPANY",
			year: new Date().getFullYear(),
			country: "",
			region: "",
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (calendar: Calendar) => {
		// Don't populate form here - let the useEffect handle it with fresh data from API
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", calendar.id);
		});
	};

	const onSubmit = (data: CalendarFormData) => {
		// Check if we're editing by looking at search params
		const isEditing = action === "edit";

		if (isEditing && activeCalendar) {
			const updatePayload: UpdateCalendar = {
				name: data.name,
				description: data.description || "",
				type: data.type,
				year: data.year,
				country: data.country || "",
				region: data.region || "",
				isActive: data.isActive,
			};

			updateCalendarMutation.mutate(
				{ id: activeCalendar.id, payload: updatePayload },
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
			if (!user?.organizationId && !user?.organization?.id) {
				return;
			}

			const organizationId = user.organizationId || user.organization?.id;

			const payload: CreateCalendar = {
				...data,
				organizationId: organizationId!,
			};

			createCalendarMutation.mutate(payload, {
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

	const handleDelete = (calendar: Calendar) => {
		setDeletingCalendar(calendar);
		setIsDeleteModalOpen(true);
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", calendar.id);
		});
	};

	const confirmDelete = () => {
		if (!deletingCalendar) return;
		deleteCalendarMutation.mutate(deletingCalendar.id, {
			onSuccess: () => {
				setIsDeleteModalOpen(false);
				setDeletingCalendar(null);
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const handleView = (calendar: Calendar) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", calendar.id);
		});
	};

	const renderActions = (item: Calendar) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					onClick={() => navigate(`/admin/configuration/calendars/${item.id}`)}>
					<CalendarIcon className="h-4 w-4 mr-2" /> View Calendar
				</DropdownMenuItem>
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
	const isDeepLinkLoading = !!activeCalendarId && isLoadingCalendar;

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
			// Map isActive to status param
			if (filters.isActive) {
				next.set("status", filters.isActive);
			} else {
				next.delete("status");
			}
			// Map type filter
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
		<div className="space-y-6">
			<DataTable
				title="Calendars"
				description="Manage company calendars and holidays"
				data={items}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No calendars found"
				emptyDescription="Get started by creating your first calendar."
				emptyActions={<ConfigurationEmptyGuide label="Add calendar" onClick={openCreate} />}
				searchWidth="w-80"
				searchPlaceholder="Search calendars..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={
					(calendarsData as any)?.data?.pagination?.total ||
					(calendarsData as any)?.pagination?.total
				}
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
			/>

			{/* Edit / Create Modal */}
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
						? "Loading Calendar..."
						: action === "edit"
							? "Edit Calendar"
							: "Add Calendar"
				}
				description={
					isDeepLinkLoading && action === "edit"
						? "Fetching calendar data..."
						: action === "edit"
							? "Update calendar information"
							: "Create a new calendar"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading calendar...</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div data-field-path="name">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name *
								</label>
								<Input
									placeholder="e.g., 2024 Company Calendar"
									aria-invalid={false}
									{...register("name")}
								/>
								<ConstraintTokenRow tokens={[{ label: "Required", tone: "default" }]} />
							</div>
							<div data-field-path="year">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Year *
								</label>
								<Input
									type="number"
									placeholder="e.g., 2024"
									aria-invalid={false}
									{...register("year", { valueAsNumber: true })}
								/>
								<ConstraintTokenRow tokens={[{ label: "2000-2100", tone: "subtle" }]} />
							</div>
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

						<div className="flex items-center gap-2">
							<input type="checkbox" className="rounded" {...register("isActive")} />
							<label className="text-sm font-medium text-gray-700">Active</label>
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
								type="submit"
								disabled={
									createCalendarMutation.isPending ||
									updateCalendarMutation.isPending
								}>
								{(createCalendarMutation.isPending ||
									updateCalendarMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Calendar" : "Create Calendar"}
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
							next.delete("id");
						});
					}
				}}
				title="Calendar Details"
				description="View calendar information"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading calendar...</div>
				) : activeCalendar && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeCalendar.name}
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Year
								</label>
								<div className="p-3 bg-gray-50 rounded-md border">
									{activeCalendar.year}
								</div>
							</div>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Description
							</label>
							<div className="p-3 bg-gray-50 rounded-md border">
								{activeCalendar.description || "-"}
							</div>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Status
							</label>
							<div className="p-3 bg-gray-50 rounded-md border">
								<Badge variant={activeCalendar.isActive ? "success" : "secondary"}>
									{activeCalendar.isActive ? "Active" : "Inactive"}
								</Badge>
							</div>
						</div>
						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeCalendar)}>Edit Calendar</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Calendar not found</div>
				)}
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal
				open={isDeleteModalOpen}
				onOpenChange={(open) => {
					setIsDeleteModalOpen(open);
					if (!open) {
						setDeletingCalendar(null);
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
					}
				}}
				title="Delete Calendar"
				description="Are you sure you want to delete this calendar?"
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-4">
					<div className="p-4 bg-red-50 border border-red-200 rounded-md">
						<p className="text-sm text-red-800">
							This action cannot be undone. This will permanently delete the calendar
							<strong> {deletingCalendar?.name}</strong>.
						</p>
					</div>
					<div className="flex justify-end gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsDeleteModalOpen(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteCalendarMutation.isPending}>
							{deleteCalendarMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete Calendar"
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
