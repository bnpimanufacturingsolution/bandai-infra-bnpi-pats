import { useCallback, useEffect, useMemo, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select } from "~/components/atoms/Select";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useScheduleTemplates } from "~/lib/hooks/useSchedules";
import {
	useCreateSection,
	useDeleteSection,
	useImportSections,
	useSection,
	useSections,
	useUpdateSection,
} from "~/lib/hooks/useSections";
import type {
	CreateSectionRequest,
	Section,
	UpdateSectionRequest,
} from "~/services/sections.service";
import sectionsService from "~/services/sections.service";
import type { Employee } from "~/services/employees.service";
import { toast } from "sonner";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import {
	appendReturnToParam,
	getSetupReturnTo,
	isEmployeeFormReturn,
	isEmployeeImportReturn,
} from "~/lib/utils/import-setup-redirect";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { useDebouncedGeneratedCodeField } from "~/lib/ui/admin-configuration-code";
import { createTruncatedTextProps } from "~/lib/utils/text-utils";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigRelationLink,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

interface SectionFormData {
	name: string;
	code: string;
	description: string;
	departmentId: string;
	headId: string;
	scheduleId: string;
	isHr: boolean;
	isActive: boolean;
}

const SectionFormSchema = z.object({
	name: z.string().trim().min(1),
	code: z.string().trim().min(1),
	description: z.string(),
	departmentId: z.string().trim().min(1),
	headId: z.string(),
	scheduleId: z.string(),
	isHr: z.boolean(),
	isActive: z.boolean(),
});

const IMPORT_FIELDS = {
	required: [
		{ key: "CODE", label: "Section Code", required: true, aliases: ["Section Code"] },
		{ key: "NAME", label: "Section Name", required: true, aliases: ["Section"] },
		{
			key: "DEPARTMENT",
			label: "Department (Code/Name)",
			required: true,
			aliases: ["Department", "Department Code", "Department Name"],
		},
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{
			key: "SCHEDULE",
			label: "Schedule (Code/Name)",
			aliases: ["Schedule", "Schedule Code", "Schedule Name"],
		},
		{ key: "IS_HR", label: "Is HR Section", aliases: ["isHr", "HR Section", "Is HR"] },
		{ key: "IS_ACTIVE", label: "Active", aliases: ["Active", "Status"] },
	],
	system: [],
};

function getEmployeeName(employee?: Employee | null) {
	const person = employee?.person as any;
	const personalInfo = person?.personalInfo || person;
	const fullName = [personalInfo?.firstName, personalInfo?.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();
	return fullName || employee?.employeeId || "Unassigned";
}

export default function SectionsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const { user } = useAuth();
	const appliedCreatePrefillRef = useRef<string | null>(null);

	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const filterString = statusFilter ? `isActive:${statusFilter}` : undefined;
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const prefillName = String(searchParams.get("prefillName") || "").trim();
	const prefillCode = String(searchParams.get("prefillCode") || "").trim();
	const returnTo = getSetupReturnTo(searchParams);
	const isEmployeeImportContext = isEmployeeImportReturn(searchParams);
	const isEmployeeFormContext = isEmployeeFormReturn(searchParams);
	const shouldReturnToImport = action === "create" && isEmployeeImportContext && !!returnTo;
	const shouldReturnToEmployeeForm = action === "create" && isEmployeeFormContext && !!returnTo;
	const activeSectionId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	const { data: sectionsData, isLoading } = useSections({
		page: pageParam,
		limit: limitParam,
		count: true,
		query: searchQuery,
		filter: filterString,
	});
	const { refetch: refetchExportSections } = useSections(
		{ page: 1, limit: 1000, count: true, query: searchQuery, filter: filterString },
		{ enabled: false },
	);
	const { data: activeSection, isLoading: isLoadingSection } = useSection(activeSectionId || "");
	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000, count: true });
	const { data: employeesData } = useEmployees({ page: 1, limit: 1000, count: true });
	const { data: schedulesData, isLoading: isLoadingSchedules } = useScheduleTemplates({
		page: 1,
		limit: 1000,
	});

	const sections = (sectionsData as any)?.sections || [];
	const totalItems = (sectionsData as any)?.count;
	const departments = (departmentsData as any)?.departments || [];
	const employees =
		(employeesData as any)?.employees || (employeesData as any)?.data?.employees || [];
	const schedules = (schedulesData as any)?.scheduleTemplates || [];

	const departmentOptions = useMemo(
		() =>
			departments
				.filter((department: any) => department.isActive !== false)
				.map((department: any) => ({
					value: department.id,
					label: department.code
						? `${department.name} (${department.code})`
						: department.name,
				})),
		[departments],
	);

	const employeeOptions = useMemo(
		() => [
			{ value: "none", label: "No section head" },
			...employees.map((employee: Employee) => ({
				value: employee.id,
				label: getEmployeeName(employee),
			})),
		],
		[employees],
	);

	const scheduleOptions = useMemo(
		() => [
			{ value: "none", label: "No default schedule" },
			...schedules
				.filter((schedule: any) => schedule.isActive !== false)
				.map((schedule: any) => ({
					value: schedule.id,
					label: schedule.code
						? `${schedule.name || schedule.code} (${schedule.code})`
						: schedule.name || "Unnamed template",
				})),
		],
		[schedules],
	);

	const scheduleMap = useMemo(() => {
		const map = new Map<string, string>();
		schedules.forEach((schedule: any) => {
			map.set(
				schedule.id,
				schedule.code
					? `${schedule.name || schedule.code} (${schedule.code})`
					: schedule.name || schedule.id,
			);
		});
		return map;
	}, [schedules]);

	const departmentMap = useMemo(() => {
		const map = new Map<string, string>();
		departments.forEach((department: any) => {
			map.set(
				department.id,
				department.code ? `${department.name} (${department.code})` : department.name,
			);
		});
		return map;
	}, [departments]);

	const createSectionMutation = useCreateSection();
	const updateSectionMutation = useUpdateSection();
	const deleteSectionMutation = useDeleteSection();
	const importSectionsMutation = useImportSections();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		formState: { errors },
	} = useForm<SectionFormData>({
		resolver: zodResolver(SectionFormSchema),
		defaultValues: {
			name: "",
			code: "",
			description: "",
			departmentId: "",
			headId: "none",
			scheduleId: "none",
			isHr: false,
			isActive: true,
		},
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

	const watchedName = watch("name") || "";
	const watchedCode = watch("code") || "";
	const watchedDescription = watch("description") || "";
	const watchedDepartmentId = watch("departmentId") || "";
	const watchedHeadId = watch("headId") || "none";
	const watchedIsHr = watch("isHr") || false;
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	useDebouncedGeneratedCodeField({
		enabled: action === "create" && !prefillCode,
		sourceValue: watchedName,
		currentCodeValue: watchedCode,
		generateCode: async (source) => (await sectionsService.generateSectionCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});

	useEffect(() => {
		if (action === "edit" && !isLoadingSection && activeSection) {
			reset({
				name: activeSection.name,
				code: activeSection.code,
				description: activeSection.description || "",
				departmentId: activeSection.departmentId,
				headId: activeSection.headId || "none",
				scheduleId: activeSection.scheduleId || "none",
				isHr: !!activeSection.isHr,
				isActive: activeSection.isActive,
			});
		}
	}, [action, activeSection, isLoadingSection, reset]);

	useEffect(() => {
		if (action !== "create") {
			appliedCreatePrefillRef.current = null;
			return;
		}
		const key = `${prefillName}|${prefillCode}`;
		if (!key.replace(/\|/g, "")) return;
		if (appliedCreatePrefillRef.current === key) return;
		appliedCreatePrefillRef.current = key;
		if (prefillName && !String(getValues("name") || "").trim()) {
			setValue("name", prefillName, { shouldDirty: false });
		}
		if (prefillCode && !String(getValues("code") || "").trim()) {
			setValue("code", prefillCode, { shouldDirty: false });
		}
	}, [action, getValues, prefillName, prefillCode, setValue]);

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
			departmentId: "",
			headId: "none",
			scheduleId: "none",
			isHr: false,
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (section: Section) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", section.id);
		});
	};

	const handleView = (section: Section) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", section.id);
		});
	};

	const handleDelete = (section: Section) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", section.id);
		});
	};

	const onSubmit = (data: SectionFormData) => {
		const organizationId = user?.organizationId || user?.organization?.id;
		if (!organizationId) {
			toast.error("User organization ID not found");
			return;
		}
		if (!data.departmentId) {
			toast.error("Department is required");
			return;
		}

		const payload: UpdateSectionRequest = {
			name: data.name.trim(),
			code: data.code.trim(),
			description: data.description.trim() || undefined,
			departmentId: data.departmentId,
			headId: data.headId === "none" ? null : data.headId,
			scheduleId: data.scheduleId === "none" ? null : data.scheduleId,
			isHr: data.isHr,
			isActive: data.isActive,
		};

		if (action === "edit" && id) {
			updateSectionMutation.mutate({ id, payload }, { onSuccess: closeModal });
			return;
		}

		createSectionMutation.mutate({ ...payload, organizationId } as CreateSectionRequest, {
			onSuccess: (createdSection: any) => {
				if (shouldReturnToImport && returnTo) {
					navigate(returnTo);
					return;
				}
				if (shouldReturnToEmployeeForm && returnTo) {
					const sectionId =
						createdSection?.id ||
						createdSection?.data?.section?.id ||
						createdSection?.section?.id;
					navigate(appendReturnToParam(returnTo, "createdSectionId", sectionId || ""));
					return;
				}
				closeModal();
			},
		});
	};

	const renderActions = (section: Section) => (
		<div className="flex justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="flex h-8 w-8 justify-center p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onClick={() => handleView(section)}>
						<Eye className="mr-2 h-4 w-4" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openEdit(section)}>
						<Edit className="mr-2 h-4 w-4" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => handleDelete(section)}
						className="text-red-600 focus:bg-red-50 focus:text-red-600">
						<Trash2 className="mr-2 h-4 w-4" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	const columns: Column<Section>[] = [
		{
			key: "name",
			label: "Name",
			width: "200px",
			required: true,
			priority: "critical",
			render: (_, section) => <AdminConfigPrimaryCell primary={section.name} />,
		},
		{
			key: "code",
			label: "Code",
			width: "120px",
			required: true,
			priority: "high",
			render: (_, section) => <AdminConfigCodeChip>{section.code}</AdminConfigCodeChip>,
		},
		{
			key: "description",
			label: "Description",
			width: "250px",
			priority: "low",
			hideBelow: "lg",
			render: (_, section) => {
				if (!section.description) return <AdminConfigMutedDash />;
				const textProps = createTruncatedTextProps(section.description, 80);
				return <AdminConfigLongText title={textProps.title}>{textProps.displayText}</AdminConfigLongText>;
			},
		},
		{
			key: "department",
			label: "Department",
			width: "170px",
			required: true,
			priority: "high",
			render: (_, section) => (
				<AdminConfigRelationLink
					to={section.department?.id ? `/admin/configuration/departments?action=view&id=${section.department.id}` : null}
					title={section.department?.name}>
					{section.department?.name || "Unassigned"}
				</AdminConfigRelationLink>
			),
		},
		{
			key: "head",
			label: "Section Head",
			width: "150px",
			priority: "medium",
			hideBelow: "md",
			render: (_, section) => (
				<AdminConfigRelationLink
					to={section.headId ? `/admin/configuration/employees?action=view&id=${section.headId}` : null}
					title={getEmployeeName(section.head as any)}>
					{getEmployeeName(section.head as any)}
				</AdminConfigRelationLink>
			),
		},
		{
			key: "scheduleTemplate",
			label: "Default Schedule",
			width: "170px",
			priority: "medium",
			hideBelow: "md",
			render: (_, section) => (
				<AdminConfigRelationLink
					to={section.scheduleId ? `/admin/configuration/schedule-templates?action=view&id=${section.scheduleId}` : null}
					title={section.scheduleTemplate?.name || (section.scheduleId ? scheduleMap.get(section.scheduleId) : "") || undefined}>
					{section.scheduleTemplate?.name ||
						(section.scheduleId ? scheduleMap.get(section.scheduleId) : "")}
				</AdminConfigRelationLink>
			),
		},
		{
			key: "isHr",
			label: "HR",
			priority: "low",
			hideBelow: "xl",
			render: (_, section) =>
				section.isHr ? (
					<AdminConfigPolicyChip>HR</AdminConfigPolicyChip>
				) : (
					<AdminConfigMutedDash />
				),
		},
		{
			key: "isActive",
			label: "Status",
			required: true,
			priority: "critical",
			render: (_, section) => (
				<CategoricalText value={section.isActive ? "Active" : "Inactive"} />
			),
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
	];

	const handleSearch = (query: string) => {
		updateSearchParams((next) => {
			if (query) next.set("search", query);
			else next.delete("search");
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => next.set("page", page.toString()));
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.isActive) next.set("status", filters.isActive);
			else next.delete("status");
			next.set("page", "1");
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
			next.delete("id");
		});
	};

	const handleImportSections = async (file: File) => {
		const result = await importSectionsMutation.mutateAsync(file);
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
		const template = `CODE,NAME,DEPARTMENT,SCHEDULE,DESCRIPTION,IS_HR,IS_ACTIVE
PROD-GEN,General Production,Production,REGULAR_SCHEDULE,Manpower databank section,false,true
ADM-GAHR1,GA/HR 1,Administration,REGULAR_SCHEDULE,Manpower databank section,true,true
PENG-MFG,Manufacturing Engineering,Product Engineering,REGULAR_SCHEDULE,Manpower databank section,false,true
QA-LINE,Line Quality Assurance,Product Assurance,REGULAR_SCHEDULE,Manpower databank section,false,true`;
		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "sections-template.csv";
		anchor.click();
		window.URL.revokeObjectURL(url);
	};

	const exportSectionsToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: Section[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: ((await refetchExportSections()).data as any)?.sections || [];

		downloadCsvFile(
			buildDatedCsvFilename("sections"),
			[
				"Name",
				"Code",
				"Department",
				"Section Head",
				"Default Schedule",
				"Description",
				"HR Section",
				"Status",
			],
			exportItems.map((section: Section) => [
				section.name || "",
				section.code || "",
				section.department?.name || departmentMap.get(section.departmentId) || "",
				getEmployeeName(section.head as any),
				section.scheduleTemplate?.name ||
					(section.scheduleId ? scheduleMap.get(section.scheduleId) : "") ||
					"",
				section.description || "",
				section.isHr ? "Yes" : "No",
				section.isActive ? "Active" : "Inactive",
			]),
		);
	};

	const isSaving = createSectionMutation.isPending || updateSectionMutation.isPending;
	const isDeepLinkLoading = !!activeSectionId && isLoadingSection;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Sections"
				data={sections}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				onImport={openImport}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No sections yet"
				emptyDescription="Add a section or use Migration."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add section"
						to="/admin/configuration/sections?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search sections..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={totalItems}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ isActive: statusFilter || "" }}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportCSV={exportSectionsToCsv}
				containedScroll
			/>

			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => !open && closeModal()}
				title={action === "edit" ? "Edit Section" : "Create Section"}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-sm text-slate-500">
						Loading section...
					</div>
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
											Create this section, then return to the employee setup
											flow.
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										className="border-emerald-200 text-emerald-800 hover:bg-emerald-100"
										onClick={() => navigate(returnTo)}>
										Back
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
										placeholder="e.g., Warehouse"
										{...register("name")}
										aria-invalid={!!errors.name}
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
										placeholder="e.g., WH"
										{...register("code")}
										aria-invalid={!!errors.code}
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
							<div data-field-path="departmentId">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Department *
								</label>
								<Select
									options={departmentOptions}
									value={watchedDepartmentId}
									onChange={(value) =>
										setValue("departmentId", value, {
											shouldDirty: true,
											shouldValidate: true,
										})
									}
									placeholder="Select department"
									error={!!errors.departmentId}
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "required",
											tone: errors.departmentId ? "invalid" : "default",
										},
									]}
								/>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Section Head (optional)
									</label>
									<Select
										options={employeeOptions}
										value={watchedHeadId}
										onChange={(value) =>
											setValue("headId", value, { shouldDirty: true })
										}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "0-1", tone: "subtle" }]}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Default Schedule Template (optional)
									</label>
									<Select
										options={scheduleOptions}
										value={watch("scheduleId") || "none"}
										onChange={(value) =>
											setValue("scheduleId", value || "none", {
												shouldDirty: true,
											})
										}
										placeholder={
											isLoadingSchedules
												? "Loading schedule templates..."
												: "Select default schedule"
										}
										disabled={isLoadingSchedules}
									/>
									<ConstraintTokenRow
										tokens={[{ label: "0-1", tone: "subtle" }]}
									/>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<label className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										checked={!!watchedIsHr}
										onChange={(event) =>
											setValue("isHr", event.target.checked, {
												shouldDirty: true,
											})
										}
									/>
									HR Section
								</label>
								<label className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										{...register("isActive")}
									/>
									Active
								</label>
							</div>
						</div>

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSaving}>
								{isSaving ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : action === "edit" ? (
									"Update Section"
								) : (
									"Create Section"
								)}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={action === "view"}
				onOpenChange={(open) => !open && closeModal()}
				title="Section Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{activeSection ? (
					<div className="space-y-5 text-sm">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="min-w-0">
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Name
									</div>
									<div className="mt-1 truncate font-medium text-slate-900">
										{activeSection.name}
									</div>
								</div>
								<div className="min-w-0">
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Code
									</div>
									<div className="mt-1 truncate font-medium text-slate-900">
										{activeSection.code}
									</div>
								</div>
								<div className="min-w-0">
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Department
									</div>
									<div className="mt-1 truncate font-medium text-slate-900">
										{activeSection.department?.name || "Unassigned"}
									</div>
								</div>
								<div className="min-w-0">
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Section head
									</div>
									<div className="mt-1 truncate font-medium text-slate-900">
										{getEmployeeName(activeSection.head as any)}
									</div>
								</div>
								<div className="min-w-0">
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Default schedule
									</div>
									<div className="mt-1 truncate font-medium text-slate-900">
										{activeSection.scheduleTemplate?.name ||
											(activeSection.scheduleId
												? scheduleMap.get(activeSection.scheduleId)
												: "") ||
											"-"}
									</div>
								</div>
								<div>
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Status
									</div>
									<CategoricalText
										value={activeSection.isActive ? "Active" : "Inactive"}
									/>
								</div>
								<div>
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										HR Section
									</div>
									<div className="mt-1 font-medium text-slate-900">
										{activeSection.isHr ? "Yes" : "No"}
									</div>
								</div>
								<div>
									<div className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Description
									</div>
									<div className="mt-1 break-words font-medium text-slate-900">
										{activeSection.description || "-"}
									</div>
								</div>
							</div>
						</div>
						<div className="flex justify-end border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={closeModal}>
								Close
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-sm text-slate-500">
						Loading section...
					</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => !open && closeModal()}
				title="Delete Section"
				description="This will archive the selected section."
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-5">
					<div className="rounded-xl border border-red-200 bg-red-50 p-4">
						<p className="text-sm text-red-800">
							This action will archive{" "}
							<strong>{activeSection?.name || "this section"}</strong>.
						</p>
					</div>
					<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
						<Button type="button" variant="outline" onClick={closeModal}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!id || deleteSectionMutation.isPending}
							onClick={() =>
								id && deleteSectionMutation.mutate(id, { onSuccess: closeModal })
							}>
							{deleteSectionMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete Section"
							)}
						</Button>
					</div>
				</div>
			</Modal>

			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => next.delete("action"));
					}
				}}
				title="Import Sections"
				description="Upload a CSV/Excel file to bulk import sections"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportSections}
				isImporting={importSectionsMutation.isPending}
			/>
		</div>
	);
}
