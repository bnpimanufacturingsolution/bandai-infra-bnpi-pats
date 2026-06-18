import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Input } from "~/components/atoms/Input";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import {
	Eye,
	Edit,
	Trash2,
	MoreVertical,
	Calendar,
	User,
	DollarSign,
	Download,
	Upload,
	Loader2,
	FileSpreadsheet,
	AlertCircle,
	CheckCircle2,
	Coins,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { useSearchParams } from "react-router-dom";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	useEmployeeBenefits,
	useEmployeeBenefit,
	useDeleteEmployeeBenefit,
	useUpdateEmployeeBenefit,
	queryKeys,
} from "~/lib/hooks/useEmployeeBenefits";
import type {
	EmployeeBenefit,
	UpdateEmployeeBenefitRequest,
} from "~/services/employee-benefit.service";
import { hrisApiClient } from "~/lib/api-client";

interface BenefitEnrollmentsTemplateProps {
	title?: string;
	description?: string;
}

const UpdateBenefitSchema = z.object({
	amount: z.number().min(0, "Amount must be a positive number"),
	startDate: z.string().min(1, "Start date is required"),
	endDate: z.string().optional().nullable(),
	isActive: z.boolean(),
	notes: z.string().optional(),
});

type UpdateBenefitFormData = z.infer<typeof UpdateBenefitSchema>;

export function BenefitEnrollmentsTemplate({
	title = "Employee Benefits",
	description = "View all employee benefit enrollments",
}: BenefitEnrollmentsTemplateProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const queryClient = useQueryClient();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<UpdateBenefitFormData>({
		resolver: zodResolver(UpdateBenefitSchema),
		defaultValues: {
			amount: 0,
			startDate: new Date().toISOString().split("T")[0],
			isActive: true,
			notes: "",
		},
	});

	// Import modal state
	const [importFile, setImportFile] = useState<File | null>(null);
	const [importError, setImportError] = useState<string>("");
	const [importErrors, setImportErrors] = useState<any[]>([]);
	const [isImporting, setIsImporting] = useState(false);

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || "";
	const statusFilter = searchParams.get("status") || undefined;
	const categoryFilter = searchParams.get("category") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Build filter string for API
	let filterString = "";
	if (statusFilter) {
		filterString = `isActive:${statusFilter}`;
	}
	if (categoryFilter) {
		filterString += filterString
			? `,benefitType.category:${categoryFilter}`
			: `benefitType.category:${categoryFilter}`;
	}

	// React Query hooks
	const { data: benefitsData, isLoading } = useEmployeeBenefits({
		page: pageParam,
		limit: limitParam,
		query: searchQuery || undefined,
		filter: filterString || undefined,
		fields: "name,amount,startDate,endDate,isActive,notes,employee.person.personalInfo",
		count: true,
	});

	console.log("Employee Benifit : ", benefitsData);

	// Get individual benefit for detail modal
	const { data: activeItem, isLoading: isLoadingItem } = useEmployeeBenefit(
		action === "view" || action === "delete" ? id || "" : "",
	);

	// Fallback: if activeItem doesn't have employee data, try to find it in the list
	const items = benefitsData?.employeeBenefits || [];
	const fallbackItem = id ? items.find((item) => item.id === id) : null;

	// Use activeItem if it has employee data, otherwise fall back to list item
	const displayItem = activeItem
		? {
				...activeItem,
				// Merge employee data from fallback if missing
				employee: activeItem.employee || fallbackItem?.employee,
			}
		: fallbackItem;

	console.log("Display Item:", displayItem);
	console.log("Employee data:", displayItem?.employee);
	console.log("Contact Info:", (displayItem?.employee as any)?.person?.contactInfo);

	// Delete mutation
	const deleteMutation = useDeleteEmployeeBenefit();
	// Update mutation
	const updateMutation = useUpdateEmployeeBenefit();

	const totalItems = benefitsData?.pagination?.total || 0;

	// Populate form when editing
	useEffect(() => {
		if (action === "edit" && activeItem && !isLoadingItem) {
			reset({
				amount: activeItem.amount,
				startDate: activeItem.startDate
					? new Date(activeItem.startDate).toISOString().split("T")[0]
					: "",
				endDate: activeItem.endDate
					? new Date(activeItem.endDate).toISOString().split("T")[0]
					: null,
				isActive: activeItem.isActive,
				notes: activeItem.notes || "",
			});
		}
	}, [action, activeItem, isLoadingItem, reset]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	// Actions
	const openView = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const openEdit = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", item.id);
		});
	};

	const openDelete = (item: EmployeeBenefit) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", item.id);
		});
	};

	const openImport = () => {
		setImportFile(null);
		setImportError("");
		setImportErrors([]);
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	// Confirm delete
	const confirmDelete = () => {
		if (!id) return;
		deleteMutation.mutate(id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	// Handle file selection for import
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		setImportError("");
		setImportErrors([]);

		if (file) {
			// Validate file type
			const validTypes = [
				"text/csv",
				"application/vnd.ms-excel",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			];
			const fileExtension = file.name.split(".").pop()?.toLowerCase();

			if (
				!validTypes.includes(file.type) &&
				!["csv", "xlsx", "xls"].includes(fileExtension || "")
			) {
				setImportError("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
				return;
			}

			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				setImportError("File size must be less than 5MB");
				return;
			}

			setImportFile(file);
		}
	};

	// Handle import submission
	// Handle import submission
	const handleImport = async () => {
		if (!importFile) {
			setImportError("Please select a file to import");
			return;
		}

		setIsImporting(true);
		setImportError("");
		setImportErrors([]);

		try {
			const formData = new FormData();
			formData.append("file", importFile);

			// The API returns { status: "success", data: { success: N, failed: N, errors: [] }, ... }
			// We cast to any to handle the dynamic structure
			const response = (await hrisApiClient.post<any>(
				"/api/employeeBenefit/import",
				formData,
			)) as any;

			if (
				response.status === "success" ||
				response.success === true ||
				response.code === 200
			) {
				const { success, failed, errors } = response.data || {
					success: 0,
					failed: 0,
					errors: [],
				};

				if (failed > 0) {
					sonnerToast.warning(`Import completed with issues`, {
						description: `Successfully imported: ${success}. Failed: ${failed}. Check details below.`,
					});
					console.error("Import errors:", errors);
					setImportErrors(errors);
				} else {
					sonnerToast.success("upload successfully", {
						description: `Imported ${success} employee benefits from ${importFile.name}`,
					});
					setImportFile(null);
					setImportError("");
					setImportErrors([]);
					updateSearchParams((next) => {
						next.delete("action");
					});
				}

				// Refresh the list regardless of partial failure so user can see what succeeded
				queryClient.invalidateQueries({ queryKey: queryKeys.employeeBenefits.all });
			} else {
				throw new Error(response.message || "Import failed");
			}
		} catch (error: any) {
			console.error("Import error:", error);
			if (error.errors && Array.isArray(error.errors)) {
				setImportErrors(error.errors);
				sonnerToast.error("Import validation failed", {
					description: "Please check the errors listed below.",
				});
			} else {
				setImportError(error.message || "Failed to import file. Please try again.");
				sonnerToast.error("Import failed", {
					description: error.message || "An unexpected error occurred.",
				});
			}
		} finally {
			setIsImporting(false);
		}
	};

	const handleDownloadTemplate = () => {
		const template = `EMPLOYEE_NUMBER,BENEFIT_TYPE,NAME,DESCRIPTION,AMOUNT,START_DATE,END_DATE,IS_ACTIVE,NOTES
EMP-EXEC-CEO-001,Health Insurance,VIP Health Plan,Comprehensive global coverage,15000,2024-01-01,,TRUE,Executive benefit
EMP-HR-MGR-001,Health Insurance,Standard Health Plan,Standard medical coverage,5000,2024-01-01,,TRUE,Standard benefit
EMP-SW-DEV-001,Health Insurance,Standard Health Plan,Standard medical coverage,5000,2024-02-01,,TRUE,Standard benefit`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "employee-benefits-import-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);

		sonnerToast.success("Template downloaded", {
			description: "Fill in the template and upload to import benefits",
		});
	};

	// Format date helper
	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	// Helper to get employee name from nested structure
	const getEmployeeName = (item: EmployeeBenefit) => {
		const employee = item.employee as any;
		if (!employee) return "Unknown";
		// Handle nested personalInfo structure: employee.person.personalInfo.firstName
		const personalInfo = employee?.person?.personalInfo;
		const firstName =
			personalInfo?.firstName || employee?.person?.firstName || employee?.firstName || "";
		const lastName =
			personalInfo?.lastName || employee?.person?.lastName || employee?.lastName || "";
		return `${firstName} ${lastName}`.trim() || "Unknown";
	};

	const getEmployeeIdentifier = (item: EmployeeBenefit) => {
		const employee = item.employee as any;
		if (!employee) return "No ID";
		return (
			employee?.employeeId ||
			employee?.person?.employeeId ||
			getPositionTitle(item) ||
			"No ID"
		);
	};

	// Helper to get employee email
	const getEmployeeEmail = (item: EmployeeBenefit) => {
		const employee = item.employee as any;
		if (!employee) return "";
		// Handle nested structure: employee.person.contactInfo.email
		const contactInfo = employee?.person?.contactInfo;
		const personalInfo = employee?.person?.personalInfo;
		return (
			contactInfo?.email ||
			personalInfo?.email ||
			employee?.person?.email ||
			employee?.email ||
			""
		);
	};

	// Helper to get position title
	const getPositionTitle = (item: EmployeeBenefit) => {
		const employee = item.employee as any;
		if (!employee) return "";
		// Position can be at employee.position or employee.person.position
		return employee?.position?.title || employee?.person?.position?.title || "";
	};

	// Table Config
	const columns: Column<EmployeeBenefit>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "220px",
			render: (_, row) => (
				<div className="min-w-0 space-y-0.5">
					<span className="block truncate text-sm font-medium text-gray-900">
						{getEmployeeName(row)}
					</span>
					<span className="block truncate font-mono text-[11px] text-muted-foreground">
						{getEmployeeIdentifier(row)}
					</span>
				</div>
			),
		},
		{
			key: "benefitType",
			label: "Benefit Type",
			width: "180px",
			render: (_, row) => (
				<span className="font-medium text-gray-900">
					{row.benefitType?.name || row.name || "-"}
				</span>
			),
		},
		{
			key: "amount",
			label: "Amount",
			width: "120px",
			render: (val) => (
				<span className="font-medium text-gray-900">
					₱
					{(val as number)?.toLocaleString("en-PH", { minimumFractionDigits: 2 }) ||
						"0.00"}
				</span>
			),
		},
		{
			key: "startDate",
			label: "Start Date",
			width: "120px",
			render: (val) => (
				<span className="text-gray-700">{val ? formatDate(val as string) : "-"}</span>
			),
		},
		{
			key: "endDate",
			label: "End Date",
			width: "120px",
			render: (val) =>
				val ? (
					<span className="text-gray-700">{formatDate(val as string)}</span>
				) : (
					<span className="text-gray-400">Ongoing</span>
				),
		},
		{
			key: "isActive",
			label: "Status",
			width: "100px",
			render: (val) => <StatusBadge status={val ? "Active" : "Inactive"} />,
		},
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
		{
			key: "category",
			label: "Category",
			options: [
				{ value: "INSURANCE", label: "Insurance" },
				{ value: "ALLOWANCE", label: "Allowance" },
				{ value: "RETIREMENT", label: "Retirement" },
				{ value: "HEALTH", label: "Health" },
				{ value: "EDUCATION", label: "Education" },
				{ value: "TRANSPORTATION", label: "Transportation" },
				{ value: "BONUS", label: "Bonus" },
				{ value: "OTHER", label: "Other" },
			],
		},
	];

	const renderActions = (item: EmployeeBenefit) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => openView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => openDelete(item)} className="text-red-600">
					<Trash2 className="h-4 w-4 mr-2" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const isDeepLinkLoading = !!id && isLoadingItem;

	return (
		<div className="space-y-6">
			<DataTable
				title={title}
				description={description}
				data={items}
				columns={columns}
				filters={filterOptions}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No employee benefits found"
				emptyDescription="No employees have enrolled in any benefits yet."
				searchWidth="w-80"
				searchPlaceholder="Search by employee name or benefit..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={totalItems}
				onSearch={(q) => {
					updateSearchParams((next) => {
						q ? next.set("search", q) : next.delete("search");
						next.set("page", "1");
					});
				}}
				onFilterChange={(filters) => {
					updateSearchParams((next) => {
						filters.isActive
							? next.set("status", filters.isActive)
							: next.delete("status");
						filters.category
							? next.set("category", filters.category)
							: next.delete("category");
						next.set("page", "1");
					});
				}}
				onPageChange={(page) => {
					updateSearchParams((next) => next.set("page", page.toString()));
				}}
				searchValue={searchQuery}
			/>

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
				title="Benefit Enrollment Details"
				description="View employee benefit information">
				{isDeepLinkLoading ? (
					<div className="py-8 text-center text-gray-500">
						<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
						Loading...
					</div>
				) : displayItem ? (
					<div className="space-y-6">
						{/* Employee Information */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<User className="h-4 w-4" /> Employee Information
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Full Name
									</label>
									<p className="text-sm font-medium text-gray-900">
										{getEmployeeName(displayItem)}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Position
									</label>
									<p className="text-sm font-medium text-gray-900">
										{getPositionTitle(displayItem) || "-"}
									</p>
								</div>
								<div className="col-span-2">
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Email
									</label>
									<p className="text-sm text-gray-700">
										{getEmployeeEmail(displayItem) || "-"}
									</p>
								</div>
							</div>
						</div>

						{/* Benefit Information */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Coins className="h-4 w-4" /> Benefit Information
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Benefit Type
									</label>
									<p className="text-sm font-medium text-gray-900">
										{displayItem.benefitType?.name || displayItem.name}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Category
									</label>
									<StatusBadge
										status={displayItem.benefitType?.category || "OTHER"}
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Amount
									</label>
									<p className="text-sm font-medium text-gray-900">
										₱
										{displayItem.amount?.toLocaleString("en-PH", {
											minimumFractionDigits: 2,
										})}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Status
									</label>
									<StatusBadge
										status={displayItem.isActive ? "Active" : "Inactive"}
									/>
								</div>
							</div>
						</div>

						{/* Enrollment Dates */}
						<div className="bg-gray-50 rounded-lg p-4">
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Calendar className="h-4 w-4" /> Enrollment Period
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										Start Date
									</label>
									<p className="text-sm text-gray-700">
										{displayItem.startDate
											? formatDate(displayItem.startDate)
											: "-"}
									</p>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-500 mb-1">
										End Date
									</label>
									<p className="text-sm text-gray-700">
										{displayItem.endDate
											? formatDate(displayItem.endDate)
											: "Ongoing"}
									</p>
								</div>
							</div>
						</div>

						{/* Notes */}
						{displayItem.notes && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Notes
								</label>
								<p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
									{displayItem.notes}
								</p>
							</div>
						)}

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
							<Button onClick={() => openEdit(displayItem as EmployeeBenefit)}>
								Edit
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Benefit not found</div>
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
				title="Delete Benefit Enrollment"
				description="Are you sure you want to delete this benefit enrollment?">
				{isDeepLinkLoading ? (
					<div className="py-8 text-center text-gray-500">
						<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
						Loading...
					</div>
				) : displayItem ? (
					<div className="space-y-4">
						<div className="bg-red-50 border border-red-200 rounded-lg p-4">
							<p className="text-sm text-red-800">
								You are about to delete the benefit enrollment for{" "}
								<strong>{getEmployeeName(displayItem)}</strong> (
								{displayItem.benefitType?.name || displayItem.name}). This action
								cannot be undone.
							</p>
						</div>

						<div className="flex justify-end gap-3 pt-4">
							<Button
								variant="outline"
								disabled={deleteMutation.isPending}
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={deleteMutation.isPending}
								onClick={confirmDelete}>
								{deleteMutation.isPending && (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								)}
								Delete
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Benefit not found</div>
				)}
			</Modal>

			{/* Edit Modal */}
			<Modal
				open={action === "edit"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("id");
						});
						reset();
					}
				}}
				title="Edit Benefit Enrollment"
				description="Update benefit enrollment details">
				{isDeepLinkLoading ? (
					<div className="py-8 text-center text-gray-500">
						<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
						Loading...
					</div>
				) : activeItem ? (
					<form
						onSubmit={handleSubmit((data) => {
							if (!activeItem.id) return;

							const payload: UpdateEmployeeBenefitRequest = {
								amount: data.amount,
								startDate: new Date(data.startDate).toISOString(),
								endDate: data.endDate
									? new Date(data.endDate).toISOString()
									: undefined,
								isActive: data.isActive,
								notes: data.notes || undefined,
							};

							updateMutation.mutate(
								{ id: activeItem.id, data: payload },
								{
									onSuccess: () => {
										updateSearchParams((next) => {
											next.delete("action");
											next.delete("id");
										});
										reset();
									},
								},
							);
						})}
						className="space-y-4">
						{/* Read-only Info */}
						<div className="bg-gray-50 p-3 rounded-md mb-4 text-sm">
							<div className="grid grid-cols-2 gap-2">
								<div>
									<span className="text-gray-500 block text-xs">Employee</span>
									<span className="font-medium">
										{getEmployeeName(activeItem)}
									</span>
								</div>
								<div>
									<span className="text-gray-500 block text-xs">
										Benefit Type
									</span>
									<span className="font-medium">
										{activeItem.benefitType?.name || activeItem.name}
									</span>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Amount *
								</label>
								<Input
									type="number"
									step="0.01"
									{...register("amount", { valueAsNumber: true })}
									placeholder="0.00"
								/>
								{errors.amount && (
									<p className="text-red-500 text-xs mt-1">
										{errors.amount.message}
									</p>
								)}
							</div>
							<div className="flex items-center pt-6">
								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id="edit-isActive"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										{...register("isActive")}
									/>
									<label
										htmlFor="edit-isActive"
										className="text-sm font-medium text-gray-700">
										Active Status
									</label>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Start Date *
								</label>
								<Input type="date" {...register("startDate")} />
								{errors.startDate && (
									<p className="text-red-500 text-xs mt-1">
										{errors.startDate.message}
									</p>
								)}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									End Date
								</label>
								<Input type="date" {...register("endDate")} />
								{errors.endDate && (
									<p className="text-red-500 text-xs mt-1">
										{errors.endDate.message}
									</p>
								)}
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Notes
							</label>
							<Input {...register("notes")} placeholder="Optional notes" />
							{errors.notes && (
								<p className="text-red-500 text-xs mt-1">{errors.notes.message}</p>
							)}
						</div>

						<div className="flex justify-end gap-3 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
									reset();
								}}>
								Cancel
							</Button>
							<Button type="submit" disabled={updateMutation.isPending}>
								{updateMutation.isPending && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								Save Changes
							</Button>
						</div>
					</form>
				) : (
					<div className="py-8 text-center text-gray-500">Benefit not found</div>
				)}
			</Modal>

			{/* Import Modal */}
			<Modal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						setImportFile(null);
						setImportError("");
						setImportErrors([]);
						updateSearchParams((next) => {
							next.delete("action");
						});
					}
				}}
				title="Import Employee Benefits"
				description="Upload a CSV or Excel file to mass import employee benefits">
				<div className="space-y-6">
					{/* Instructions */}
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
						<h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
							<FileSpreadsheet className="h-4 w-4" />
							Import Instructions
						</h4>
						<ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
							<li>Download the template file to see the required format</li>
							<li>Employee Number must match existing employees</li>
							<li>Benefit Type must match existing benefit types</li>
							<li>Dates should be in YYYY-MM-DD format</li>
							<li>IS_ACTIVE should be TRUE or FALSE</li>
						</ul>
					</div>

					{/* Download Template Button */}
					<div>
						<Button
							type="button"
							variant="outline"
							onClick={handleDownloadTemplate}
							className="w-full">
							<Download className="h-4 w-4 mr-2" />
							Download Import Template
						</Button>
					</div>

					{/* File Upload Area */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Upload File *
						</label>
						<div
							className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
								importFile
									? "border-green-300 bg-green-50"
									: importError
										? "border-red-300 bg-red-50"
										: "border-gray-300 hover:border-gray-400"
							}`}>
							{importFile ? (
								<div className="flex items-center justify-center gap-3">
									<CheckCircle2 className="h-8 w-8 text-green-500" />
									<div className="text-left">
										<p className="text-sm font-medium text-gray-900">
											{importFile.name}
										</p>
										<p className="text-xs text-gray-500">
											{(importFile.size / 1024).toFixed(2)} KB
										</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setImportFile(null)}
										className="text-gray-500 hover:text-red-500">
										Remove
									</Button>
								</div>
							) : (
								<label className="cursor-pointer">
									<Upload className="h-10 w-10 text-gray-400 mx-auto mb-2" />
									<p className="text-sm text-gray-600">
										<span className="font-medium text-blue-600 hover:underline">
											Click to upload
										</span>{" "}
										or drag and drop
									</p>
									<p className="text-xs text-gray-500 mt-1">
										CSV, XLS, XLSX (max 5MB)
									</p>
									<input
										type="file"
										accept=".csv,.xls,.xlsx"
										onChange={handleFileChange}
										className="hidden"
									/>
								</label>
							)}
						</div>

						{/* Error Message */}
						{importError && (
							<div className="flex items-center gap-2 mt-2 text-red-600">
								<AlertCircle className="h-4 w-4" />
								<p className="text-sm">{importError}</p>
							</div>
						)}

						{/* Validation Errors List */}
						{importErrors.length > 0 && (
							<div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
								<h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
									<AlertCircle className="h-4 w-4" />
									Import Errors ({importErrors.length})
								</h4>
								<div className="max-h-40 overflow-y-auto pr-2">
									<ul className="space-y-2">
										{importErrors.map((err, index) => (
											<li
												key={index}
												className="text-sm text-red-700 bg-white p-2 rounded border border-red-100">
												<span className="font-semibold block">
													Row {err.row}: {err.error}
												</span>
												<span className="text-xs text-red-500 block mt-1">
													Data: {JSON.stringify(err.data)}
												</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						)}
					</div>

					{/* Actions */}
					<div className="flex justify-end gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							disabled={isImporting}
							onClick={() => {
								setImportFile(null);
								setImportError("");
								updateSearchParams((next) => {
									next.delete("action");
								});
							}}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={!importFile || isImporting}
							onClick={handleImport}>
							{isImporting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Importing...
								</>
							) : (
								<>
									<Upload className="h-4 w-4 mr-2" />
									Import Benefits
								</>
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
