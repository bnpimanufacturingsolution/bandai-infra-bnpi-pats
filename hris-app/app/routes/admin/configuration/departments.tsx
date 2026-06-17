import { useEffect, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { createTruncatedTextProps } from "~/lib/utils/text-utils";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { Eye, Edit, Trash2, MoreVertical, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import departmentsService from "~/services/departments.service";
import {
	type Department,
	type CreateDepartmentRequest,
	type UpdateDepartmentRequest,
} from "~/services/departments.service";
import { CreateDepartmentSchema } from "~/zod/department.zod";
import {
	useDepartments,
	useDepartment,
	useCreateDepartment,
	useUpdateDepartment,
	useDeleteDepartment,
	useImportDepartments,
} from "~/lib/hooks/useDepartments";
import { useScheduleTemplates } from "~/lib/hooks/useSchedules";
import { useEmployees } from "~/lib/hooks/useEmployees";
import type { Employee } from "~/services/employees.service";
import type { ScheduleTemplate } from "~/services/schedules.service";
import {
	appendReturnToParam,
	getSetupReturnTo,
	isEmployeeFormReturn,
	isEmployeeImportReturn,
} from "~/lib/utils/import-setup-redirect";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { useDebouncedGeneratedCodeField } from "~/lib/ui/admin-configuration-code";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPrimaryCell,
	AdminConfigRelationLink,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

const DepartmentFormSchema = CreateDepartmentSchema.omit({ organizationId: true });
type DepartmentFormInput = z.input<typeof DepartmentFormSchema>;
type DepartmentFormData = z.output<typeof DepartmentFormSchema>;

const isTruthyFlag = (value: unknown): boolean => {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "true" || normalized === "1" || normalized === "yes";
	}
	return false;
};

const isDepartmentManagerCandidate = (employee: Employee): boolean => {
	const role = String(employee.role || "")
		.trim()
		.toLowerCase();

	return (
		isTruthyFlag(employee.isManager) ||
		role === "hris-employee-manager" ||
		role.includes("manager") ||
		isTruthyFlag(employee.level?.isManager) ||
		(!!employee.department?.managerId && employee.department.managerId === employee.id)
	);
};

const getEmployeesFromResponse = (response: unknown): Employee[] => {
	const payload = response as
		| { employees?: Employee[]; data?: { employees?: Employee[]; data?: { employees?: Employee[] } } }
		| undefined;

	return payload?.employees || payload?.data?.employees || payload?.data?.data?.employees || [];
};

const uniqueEmployeesById = (...employeeGroups: Employee[][]): Employee[] => {
	const employeesById = new Map<string, Employee>();

	for (const employee of employeeGroups.flat()) {
		if (!employee?.id || employeesById.has(employee.id)) continue;
		employeesById.set(employee.id, employee);
	}

	return Array.from(employeesById.values());
};

const IMPORT_FIELDS = {
	required: [
		{ key: "CODE", label: "Department Code", required: true, aliases: ["Department Code"] },
		{ key: "NAME", label: "Department Name", required: true, aliases: ["Department"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{
			key: "SCHEDULE",
			label: "Schedule (Code/Name)",
			aliases: ["Schedule", "Schedule Code", "Schedule Name"],
		},
		{
			key: "IS_HR",
			label: "Is HR Department",
			aliases: ["isHr", "HR Department", "Is HR"],
		},
	],
	system: [],
};

export default function DepartmentsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const appliedCreatePrefillRef = useRef<string | null>(null);

	const { user } = useAuth();

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const sortParam = searchParams.get("sort") || "name";
	const orderParam: "asc" | "desc" = searchParams.get("order") === "desc" ? "desc" : "asc";

	// Build filter string for API
	const filterString = statusFilter ? `isActive:${statusFilter}` : undefined;

	// React Query hooks with server-side search and filtering
	const { data: departmentsData, isLoading } = useDepartments({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		sort: sortParam,
		order: orderParam,
		count: true,
	});
	const items = (departmentsData as any)?.departments || [];
	const exportQueryParams = {
		page: 1,
		limit: 1000,
		query: searchQuery,
		filter: filterString,
		sort: sortParam,
		order: orderParam,
		count: true,
	};
	const { refetch: refetchExportDepartments } = useDepartments(exportQueryParams, {
		enabled: false,
	});

	// Fetch employees from manager-related API contracts, then merge them for the dropdown.
	const { data: managerRolesData, isLoading: isLoadingManagerRoles } = useEmployees({
		page: 1,
		limit: 1000,
		count: true,
	});
	const { data: directReportManagersData, isLoading: isLoadingDirectReportManagers } =
		useEmployees({
			page: 1,
			limit: 1000,
			filter: "directReports:exists",
			count: true,
			sort: "employeeId",
			order: "asc",
		});
	const { data: rawManagerFlagsData, isLoading: isLoadingRawManagerFlags } = useEmployees({
		page: 1,
		limit: 1000,
		filter: "isManager:true",
		count: true,
		sort: "employeeId",
		order: "asc",
	});
	const isLoadingManagers =
		isLoadingManagerRoles || isLoadingDirectReportManagers || isLoadingRawManagerFlags;
	const employeesForManagerDropdown = uniqueEmployeesById(
		getEmployeesFromResponse(managerRolesData),
		getEmployeesFromResponse(directReportManagersData),
		getEmployeesFromResponse(rawManagerFlagsData),
	);
	const managers = employeesForManagerDropdown.filter(isDepartmentManagerCandidate);
	const { data: schedulesData, isLoading: isLoadingSchedules } = useScheduleTemplates({
		page: 1,
		limit: 1000,
	});
	const schedules = (schedulesData as any)?.scheduleTemplates || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const prefillName = String(searchParams.get("prefillName") || "").trim();
	const prefillCode = String(searchParams.get("prefillCode") || "").trim();
	const returnTo = getSetupReturnTo(searchParams);
	const isEmployeeImportContext = isEmployeeImportReturn(searchParams);
	const isEmployeeFormContext = isEmployeeFormReturn(searchParams);
	const shouldReturnToImport = action === "create" && isEmployeeImportContext && !!returnTo;
	const shouldReturnToEmployeeForm = action === "create" && isEmployeeFormContext && !!returnTo;

	// Single department ID for fetching (when action is edit, view, or delete)
	const activeDepartmentId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	// Single useDepartment hook for all modals (edit, view, delete)
	const { data: activeDepartment, isLoading: isLoadingDepartment } = useDepartment(
		activeDepartmentId || "",
	);

	// Mutation hooks
	const createDepartmentMutation = useCreateDepartment();
	const updateDepartmentMutation = useUpdateDepartment();
	const deleteDepartmentMutation = useDeleteDepartment();
	const importDepartmentsMutation = useImportDepartments();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		getValues,
		formState: { errors },
	} = useForm<DepartmentFormInput, any, DepartmentFormData>({
		resolver: zodResolver(DepartmentFormSchema),
		defaultValues: {
			name: "",
			code: "",
			description: "",
			managerId: null,
			parentId: null,
			scheduleId: null,
			scheduleIds: [],
			isHr: false,
			isActive: true,
		},
	});

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingDepartment && activeDepartment) {
			reset({
				name: activeDepartment.name,
				code: activeDepartment.code,
				description: activeDepartment.description || "",
				managerId: activeDepartment.managerId ?? null,
				parentId: activeDepartment.parentId ?? null,
				scheduleId: activeDepartment.scheduleId ?? null,
				scheduleIds:
					activeDepartment.schedules
						?.map(
							(item: NonNullable<Department["schedules"]>[number]) =>
								item.scheduleId || item.scheduleTemplate?.id,
						)
						.filter((value: string | undefined): value is string => !!value) || [],
				isHr: !!activeDepartment.isHr,
				isActive: activeDepartment.isActive,
			});
		}
	}, [action, isLoadingDepartment, activeDepartment, reset]);

	useEffect(() => {
		if (action !== "create") {
			appliedCreatePrefillRef.current = null;
			return;
		}

		const prefillSignature = `${prefillName}|${prefillCode}`;
		if (!prefillSignature.replace(/\|/g, "")) return;
		if (appliedCreatePrefillRef.current === prefillSignature) return;

		if (prefillName && !String(getValues("name") || "").trim()) {
			setValue("name", prefillName, { shouldDirty: false });
		}

		if (prefillCode && !String(getValues("code") || "").trim()) {
			setValue("code", prefillCode, { shouldDirty: false });
		}

		appliedCreatePrefillRef.current = prefillSignature;
	}, [action, getValues, prefillCode, prefillName, setValue]);

	const watchedManagerId = watch("managerId");
	const watchedParentId = watch("parentId");
	const watchedScheduleId = watch("scheduleId");
	const watchedScheduleIds = watch("scheduleIds") || [];
	const watchedIsHr = watch("isHr");
	const watchedIsActive = watch("isActive");
	const watchedName = watch("name") || "";
	const watchedCode = watch("code") || "";
	const watchedDescription = watch("description") || "";
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	useDebouncedGeneratedCodeField({
		enabled: action === "create" && !prefillCode,
		sourceValue: watchedName,
		currentCodeValue: watchedCode,
		generateCode: async (source) =>
			(await departmentsService.generateDepartmentCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});

	const normalizedLinkedScheduleIds = useMemo(
		() =>
			Array.from(
				new Set([
					...(watchedScheduleIds || []),
					...(watchedScheduleId ? [watchedScheduleId] : []),
				]),
			),
		[watchedScheduleId, watchedScheduleIds],
	);

	useEffect(() => {
		if (!watchedScheduleId) return;
		if (normalizedLinkedScheduleIds.includes(watchedScheduleId)) {
			if (normalizedLinkedScheduleIds.length !== (watchedScheduleIds || []).length) {
				setValue("scheduleIds", normalizedLinkedScheduleIds, { shouldDirty: true });
			}
			return;
		}
		setValue("scheduleIds", normalizedLinkedScheduleIds, { shouldDirty: true });
	}, [normalizedLinkedScheduleIds, setValue, watchedScheduleId, watchedScheduleIds]);

	// Manager options
	const managerOptions: SelectOption[] = [
		{ value: "", label: "-- none --" },
		...managers.map((employee: Employee) => {
			const firstName = employee.person?.personalInfo?.firstName || "";
			const lastName = employee.person?.personalInfo?.lastName || "";
			const name = `${firstName} ${lastName}`.trim() || employee.employeeId;
			return { value: employee.id, label: name };
		}),
	];

	// Helper: get manager name
	const getManagerName = (dept: Department): string => {
		if (dept.manager?.person?.personalInfo) {
			const firstName = dept.manager.person.personalInfo.firstName || "";
			const lastName = dept.manager.person.personalInfo.lastName || "";
			return `${firstName} ${lastName}`.trim() || "-";
		}
		return "-";
	};

	// Department map for parent name lookup
	const departmentMap = new Map<string, string>();
	items.forEach((dept: Department) => {
		departmentMap.set(dept.id, dept.name);
	});

	const departmentOptions: SelectOption[] = [
		{ value: "", label: "-- none --" },
		...items.map((dept: Department) => ({
			value: dept.id,
			label: dept.name,
		})),
	];

	const scheduleOptions: SelectOption[] = [
		{ value: "", label: "-- none --" },
		...schedules.map((schedule: ScheduleTemplate) => ({
			value: schedule.id,
			label: schedule.name || schedule.code || "Unnamed Template",
		})),
	];

	const scheduleMap = new Map<string, string>();
	schedules.forEach((schedule: ScheduleTemplate) => {
		scheduleMap.set(schedule.id, schedule.name || schedule.code || schedule.id);
	});

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

	const columns: Column<Department>[] = [
		{
			key: "name",
			label: "Name",
			width: "200px",
			sortable: true,
			required: true,
			priority: "critical",
			render: (value) => <AdminConfigPrimaryCell primary={value || "Unnamed department"} />,
		},
		{
			key: "code",
			label: "Code",
			width: "120px",
			sortable: true,
			required: true,
			priority: "high",
			render: (value) => (value ? <AdminConfigCodeChip>{value}</AdminConfigCodeChip> : <AdminConfigMutedDash />),
		},
		{
			key: "description",
			label: "Description",
			width: "250px",
			priority: "medium",
			hideBelow: "lg",
			render: (value) => {
				if (!value) return <AdminConfigMutedDash />;
				const textProps = createTruncatedTextProps(value, 80);
				return <AdminConfigLongText title={textProps.title}>{textProps.displayText}</AdminConfigLongText>;
			},
		},
		{
			key: "managerId",
			label: "Manager",
			width: "150px",
			priority: "medium",
			hideBelow: "md",
			render: (_value, item) => {
				const managerName = getManagerName(item);
				return managerName === "-" ? (
					<AdminConfigMutedDash />
				) : (
					<AdminConfigRelationLink
						to={item.managerId ? `/admin/configuration/employees?action=view&id=${item.managerId}` : null}
						title={managerName}>
						{managerName}
					</AdminConfigRelationLink>
				);
			},
		},

		{
			key: "isActive",
			label: "Status",
			width: "100px",
			sortable: true,
			required: true,
			priority: "critical",
			render: (value) => <CategoricalText value={value ? "Active" : "Inactive"} />,
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
			code: "",
			description: "",
			managerId: null,
			parentId: null,
			scheduleId: null,
			scheduleIds: [],
			isHr: false,
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (dept: Department) => {
		// Don't populate form here - let the useEffect handle it with fresh data from API
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", dept.id);
		});
	};

	const onSubmit = (data: DepartmentFormData) => {
		// Check if we're editing by looking at search params
		const isEditing = action === "edit";

		const normalizedScheduleIds = Array.from(
			new Set([...(data.scheduleIds || []), ...(data.scheduleId ? [data.scheduleId] : [])]),
		);

		if (isEditing && activeDepartment) {
			const updatePayload: UpdateDepartmentRequest = {
				name: data.name,
				code: data.code,
				description: data.description || "",
				managerId: data.managerId || null,
				parentId: data.parentId || null,
				scheduleId: data.scheduleId || null,
				scheduleIds: normalizedScheduleIds,
				isHr: data.isHr,
				isActive: data.isActive,
			};

			updateDepartmentMutation.mutate(
				{ id: activeDepartment.id, payload: updatePayload },
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
				toast.error("Organization not found. Please refresh.");
				return;
			}

			const organizationId = user.organizationId || user.organization?.id;

			const payload: CreateDepartmentRequest = {
				...data,
				scheduleIds: normalizedScheduleIds,
				organizationId: organizationId!,
			};

			createDepartmentMutation.mutate(payload, {
				onSuccess: (createdDepartment) => {
					reset();
					if (shouldReturnToImport && returnTo) {
						navigate(returnTo);
						return;
					}
					if (shouldReturnToEmployeeForm && returnTo) {
						navigate(
							appendReturnToParam(
								returnTo,
								"createdDepartmentId",
								createdDepartment.id,
							),
						);
						return;
					}
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					});
				},
			});
		}
	};

	const handleDelete = (dept: Department) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", dept.id);
		});
	};

	const confirmDelete = () => {
		if (!activeDepartment) return;
		deleteDepartmentMutation.mutate(activeDepartment.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const handleView = (dept: Department) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", dept.id);
		});
	};

	const renderActions = (item: Department) => (
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
	const isDeepLinkLoading = !!activeDepartmentId && isLoadingDepartment;

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
			next.set("page", "1");
		});
	};

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleSort = (key: string, direction: "asc" | "desc") => {
		updateSearchParams((next) => {
			next.set("sort", key);
			next.set("order", direction);
			next.set("page", "1");
		});
	};

	// Import handlers
	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	const handleImportDepartments = async (file: File) => {
		const result = await importDepartmentsMutation.mutateAsync(file);
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
			updateSearchParams((next) => {
				next.delete("action");
			});
		}
		return result;
	};

	const handleDownloadTemplate = () => {
		// Create sample template data
		const template = `CODE,NAME,DESCRIPTION,SCHEDULE,IS_HR
HD,HEAD,Executive Departmetn,REGULAR_SCHEDULE,TRUE
SW,SOFTWARE DEPT.,IT Department,COMPRESSED_SCHEDULE_86,FALSE
ADM,ADMIN,Admin Department,REGULAR_SCHEDULE,TRUE`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "departments-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const exportDepartmentsToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: Department[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: ((await refetchExportDepartments()).data as any)?.departments || [];

		downloadCsvFile(
			buildDatedCsvFilename("departments"),
			[
				"Name",
				"Code",
				"Description",
				"Manager",
				"Default Template",
				"Department Templates",
				"HR Department",
				"Status",
			],
			exportItems.map((item: Department) => [
				item.name || "",
				item.code || "",
				item.description || "",
				getManagerName(item),
				item.scheduleTemplate?.name || scheduleMap.get(item.scheduleId || "") || "",
				(item.schedules || [])
					.map(
						(scheduleLink) =>
							scheduleLink.scheduleTemplate?.name ||
							scheduleMap.get(scheduleLink.scheduleId || ""),
					)
					.filter(Boolean)
					.join(" | "),
				item.isHr ? "Yes" : "No",
				item.isActive ? "Active" : "Inactive",
			]),
		);
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Departments"
				data={items}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No departments yet"
				emptyDescription="Add a department or use Migration."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add department"
						to="/admin/configuration/departments?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search departments..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(departmentsData as any)?.pagination?.total}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ isActive: statusFilter || "" }}
				onPageChange={handlePageChange}
				onSort={handleSort}
				sortKey={sortParam}
				sortDirection={orderParam}
				searchValue={searchQuery || ""}
				onExportCSV={exportDepartmentsToCsv}
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
							next.delete("id");
						});
					}
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Department..."
						: action === "edit"
							? "Edit Department"
							: "Add Department"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading department...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						{(shouldReturnToImport || shouldReturnToEmployeeForm) && returnTo && (
							<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-emerald-900">
											{shouldReturnToEmployeeForm
												? "Opened from employee form"
												: "Opened from employee import"}
										</p>
										<p className="text-xs text-emerald-700">
											{shouldReturnToEmployeeForm
												? "Create this department, then we'll bring you back to the employee form."
												: "Create this department, then we'll bring you back to step 3."}
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										className="border-emerald-200 text-emerald-800 hover:bg-emerald-100"
										onClick={() => navigate(returnTo)}>
										{shouldReturnToEmployeeForm
											? "Back to employee form"
											: "Back to import"}
									</Button>
								</div>
							</div>
						)}
						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Name *
									</label>
									<Input
										placeholder="e.g., Engineering"
										aria-invalid={Boolean(errors.name)}
										{...register("name")}
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
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Code *
									</label>
									<Input
										placeholder="e.g., ENG"
										aria-invalid={Boolean(errors.code)}
										{...register("code")}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "1+",
												tone: watchedCode.trim() ? "default" : "invalid",
											},
											{ label: "Aa1", tone: "subtle" },
										]}
									/>
								</div>
							</div>
							<div data-field-path="description">
								<label className="block text-sm font-medium text-gray-700 mb-1">
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

						<div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Manager (optional)
									</label>
									<Select
										options={managerOptions}
										value={watchedManagerId || ""}
										onChange={(v) => setValue("managerId", v || null)}
										placeholder={
											isLoadingManagers ? "Loading..." : "Select Manager"
										}
										disabled={isLoadingManagers}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0-1",
												tone: watchedManagerId ? "default" : "subtle",
											},
										]}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Parent Department
									</label>
									<Select
										options={departmentOptions}
										value={watchedParentId || ""}
										onChange={(v) => setValue("parentId", v || null)}
										placeholder="Select Parent"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0-1",
												tone: watchedParentId ? "default" : "subtle",
											},
										]}
									/>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Default Schedule Template (optional)
								</label>
								<Select
									options={scheduleOptions}
									value={watchedScheduleId || ""}
									onChange={(v) => setValue("scheduleId", v || null)}
									placeholder={
										isLoadingSchedules
											? "Loading schedule templates..."
											: "Select default schedule template"
									}
									disabled={isLoadingSchedules}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0-1",
											tone: watchedScheduleId ? "default" : "subtle",
										},
										{
											label: "7-42d",
											tone:
												watchedScheduleIds.length > 0
													? "default"
													: "subtle",
										},
									]}
								/>
							</div>

							<div className="hidden">
								<div className="flex items-center justify-between gap-3">
									<label className="block text-sm font-medium text-gray-700">
										Department Templates
									</label>
									<span className="text-xs text-gray-500">
										Default template is always included
									</span>
								</div>
								<div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
									{schedules.length === 0 ? (
										<p className="text-sm text-gray-500">
											No schedule templates available yet.
										</p>
									) : (
										schedules.map((schedule: ScheduleTemplate) => {
											const scheduleId = schedule.id;
											const isDefault = watchedScheduleId === scheduleId;
											const checked =
												normalizedLinkedScheduleIds.includes(scheduleId);
											return (
												<label
													key={scheduleId}
													className="flex items-start gap-3 rounded-md bg-white px-3 py-2 text-sm text-gray-700">
													<input
														type="checkbox"
														className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
														checked={checked}
														disabled={isDefault}
														onChange={(event) => {
															const nextIds = event.target.checked
																? Array.from(
																		new Set([
																			...(watchedScheduleIds ||
																				[]),
																			scheduleId,
																		]),
																	)
																: (watchedScheduleIds || []).filter(
																		(value) =>
																			value !== scheduleId,
																	);
															setValue("scheduleIds", nextIds, {
																shouldDirty: true,
															});
														}}
													/>
													<div>
														<p className="font-medium text-gray-900">
															{schedule.name ||
																schedule.code ||
																"Unnamed Template"}
														</p>
														<p className="text-xs text-gray-500">
															{schedule.code}
															{isDefault ? " • Default template" : ""}
														</p>
													</div>
												</label>
											);
										})
									)}
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<label
									htmlFor="isHr"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										id="isHr"
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsHr}
										onChange={(event) =>
											setValue("isHr", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									HR Department
								</label>
								<label
									htmlFor="isActive"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										id="isActive"
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsActive}
										onChange={(event) =>
											setValue("isActive", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									Active
								</label>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<Accordion type="single" collapsible className="w-full">
								<AccordionItem value="department-schedules" className="border-b-0">
									<AccordionTrigger className="py-0 hover:no-underline">
										<div className="text-left">
											<p className="text-sm font-medium text-gray-900">
												Department Templates
											</p>
											<p className="text-xs text-gray-500">
												Optional extra linked templates. The default
												template stays included automatically.
											</p>
										</div>
									</AccordionTrigger>
									<AccordionContent className="pt-4">
										<div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
											{schedules.length === 0 ? (
												<p className="text-sm text-gray-500">
													No schedule templates available yet.
												</p>
											) : (
												schedules.map((schedule: ScheduleTemplate) => {
													const scheduleId = schedule.id;
													const isDefault =
														watchedScheduleId === scheduleId;
													const checked =
														normalizedLinkedScheduleIds.includes(
															scheduleId,
														);
													return (
														<label
															key={scheduleId}
															className="flex items-start gap-3 rounded-md bg-white px-3 py-2 text-sm text-gray-700">
															<input
																type="checkbox"
																className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
																checked={checked}
																disabled={isDefault}
																onChange={(event) => {
																	const nextIds = event.target
																		.checked
																		? Array.from(
																				new Set([
																					...(watchedScheduleIds ||
																						[]),
																					scheduleId,
																				]),
																			)
																		: (
																				watchedScheduleIds ||
																				[]
																			).filter(
																				(value) =>
																					value !==
																					scheduleId,
																			);
																	setValue(
																		"scheduleIds",
																		nextIds,
																		{
																			shouldDirty: true,
																		},
																	);
																}}
															/>
															<div>
																<p className="font-medium text-gray-900">
																	{schedule.name ||
																		schedule.code ||
																		"Unnamed Template"}
																</p>
																<p className="text-xs text-gray-500">
																	{schedule.code}
																	{isDefault
																		? " • Default template"
																		: ""}
																</p>
															</div>
														</label>
													);
												})
											)}
										</div>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
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
									createDepartmentMutation.isPending ||
									updateDepartmentMutation.isPending
								}>
								{(createDepartmentMutation.isPending ||
									updateDepartmentMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Department" : "Create Department"}
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
				title="Department Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading department...</div>
				) : activeDepartment && action === "view" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Name
									</label>
									<p className="mt-1 text-sm font-medium text-gray-900">
										{activeDepartment.name}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Code
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeDepartment.code}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Description
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{activeDepartment.description || "-"}
								</p>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Manager
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{getManagerName(activeDepartment)}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Parent Department
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeDepartment.parentId
											? departmentMap.get(activeDepartment.parentId) || "-"
											: "-"}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Default Schedule
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{activeDepartment.scheduleTemplate?.name ||
										(activeDepartment.scheduleId
											? scheduleMap.get(activeDepartment.scheduleId) || "-"
											: "-")}
								</p>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Department Templates
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{(activeDepartment.schedules || [])
										.map(
											(item: NonNullable<Department["schedules"]>[number]) =>
												item.scheduleTemplate?.name ||
												(item.scheduleId
													? scheduleMap.get(item.scheduleId)
													: ""),
										)
										.filter(Boolean)
										.join(", ") || "-"}
								</p>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										HR Department
									</label>
									<div className="mt-1">
										{activeDepartment.isHr ? (
											<Badge className="inline-flex" variant="success">
												HR Department
											</Badge>
										) : (
											<CategoricalText value="No" />
										)}
									</div>
								</div>
								<div>
									<label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
										Status
									</label>
									<CategoricalText
										value={activeDepartment.isActive ? "Active" : "Inactive"}
									/>
								</div>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
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
							<Button onClick={() => openEdit(activeDepartment)}>
								Edit Department
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Department not found</div>
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
				title="Delete Department"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading department...</div>
				) : activeDepartment && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								department <strong>{activeDepartment.name}</strong> (
								{activeDepartment.code}).
							</p>
						</div>
						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
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
								disabled={deleteDepartmentMutation.isPending}>
								{deleteDepartmentMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Department"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Department not found</div>
				)}
			</Modal>
			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
						});
					}
				}}
				title="Import Departments"
				description="Upload a CSV/Excel file to bulk import departments"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportDepartments}
				isImporting={importDepartmentsMutation.isPending}
			/>
		</div>
	);
}
