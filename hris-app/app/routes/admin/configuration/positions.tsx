import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { Eye, Edit, Trash2, MoreVertical, Loader2, ChevronsUpDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/lib/hooks/use-auth";
import positionsService from "~/services/positions.service";
import {
	type CreatePositionRequest,
	type UpdatePositionRequest,
	type Position,
} from "~/services/positions.service";
import {
	usePositions,
	usePosition,
	useCreatePosition,
	useUpdatePosition,
	useDeletePosition,
	useImportPositions,
} from "~/lib/hooks/usePositions";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { useLevels } from "~/lib/hooks/useLevels";
import { createTruncatedTextProps, formatDateForExport } from "~/lib/utils/text-utils";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import {
	appendReturnToParam,
	getSetupReturnTo,
	isEmployeeFormReturn,
	isEmployeeImportReturn,
} from "~/lib/utils/import-setup-redirect";
import { CreatePositionSchema } from "~/zod/position.zod";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { useDebouncedGeneratedCodeField } from "~/lib/ui/admin-configuration-code";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import {
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPrimaryCell,
	AdminConfigRelationLink,
	AdminConfigRelationText,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

const PositionFormSchema = CreatePositionSchema.omit({ organizationId: true });
type PositionFormData = z.infer<typeof PositionFormSchema>;

const IMPORT_FIELDS = {
	required: [
		{ key: "CODE", label: "Position Code", required: true, aliases: ["Position Code"] },
		{ key: "TITLE", label: "Position Title", required: true, aliases: ["Position", "Name"] },
	],
	optional: [
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{
			key: "SECTION_CODE",
			label: "Section Code",
			aliases: ["Section", "Section Code"],
		},
		{ key: "MIN_SALARY", label: "Minimum Salary", aliases: ["Min Salary"] },
		{ key: "MAX_SALARY", label: "Maximum Salary", aliases: ["Max Salary"] },
		{ key: "LEVELS", label: "Levels", aliases: ["Position Levels"] },
	],
	system: [],
};

export default function PositionsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);

	const { user } = useAuth();
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const filterString = statusFilter ? `isActive:${statusFilter}` : undefined;

	// React Query hooks
	const { data: positionsData, isLoading } = usePositions({
		page: pageParam,
		limit: limitParam,
		count: true,
		query: searchQuery,
		filter: filterString,
	});
	const positions = (positionsData as any)?.positions || [];
	const { refetch: refetchExportPositions } = usePositions(
		{
			page: 1,
			limit: 1000,
			count: true,
			query: searchQuery,
			filter: filterString,
		},
		{ enabled: false },
	);

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
	const appliedCreatePrefillRef = useRef<string | null>(null);

	// Single position ID for fetching (when action is edit, view, or delete)
	const activePositionId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	// Single usePosition hook for all modals (edit, view, delete)
	const { data: activePosition, isLoading: isLoadingPosition } = usePosition(
		activePositionId || "",
	);

	// Get departments for select inputs
	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 1000,
	});
	const departments = (departmentsData as any)?.departments || [];
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		count: true,
	});
	const sections = (sectionsData as any)?.sections || [];

	// Get levels for select inputs
	const { data: levelsData } = useLevels({
		page: 1,
		limit: 1000,
	});
	const levels = (levelsData as any)?.levels || [];

	// Mutation hooks
	const createPositionMutation = useCreatePosition();
	const updatePositionMutation = useUpdatePosition();
	const deletePositionMutation = useDeletePosition();
	const importPositionsMutation = useImportPositions();
	const [isLevelsOpen, setIsLevelsOpen] = useState(false);
	const [levelSearchQuery, setLevelSearchQuery] = useState("");

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		getValues,
		formState: { errors },
	} = useForm<PositionFormData>({
		defaultValues: {
			title: "",
			code: "",
			description: "",
			sectionId: null,
			levelIds: [],
			minSalary: undefined,
			maxSalary: undefined,
			isManager: false,
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

	// Handle deep linking: populate forms
	useEffect(() => {
		// Populate form when editing and data is loaded
		if (action === "edit" && !isLoadingPosition && activePosition) {
			// Extract level IDs from either direct levelIds or relation rows from GET by ID.
			// Some responses include levelIds: [] while actual data is in levels[].
			const directLevelIds = Array.isArray(activePosition.levelIds)
				? activePosition.levelIds.filter(Boolean)
				: [];
			const relationLevelIds = Array.isArray(activePosition.levels)
				? activePosition.levels.map((l: any) => l?.level?.id || l?.levelId).filter(Boolean)
				: [];
			const levelIds =
				directLevelIds.length > 0 ? directLevelIds : Array.from(new Set(relationLevelIds));

			reset({
				title: activePosition.title,
				code: activePosition.code,
				description: activePosition.description || "",
				sectionId: activePosition.sectionId || null,
				levelIds: levelIds,
				minSalary: activePosition.minSalary,
				maxSalary: activePosition.maxSalary,
				isManager: !!activePosition.isManager,
				isActive: activePosition.isActive,
			});
		}
	}, [action, isLoadingPosition, activePosition, reset]);

	useEffect(() => {
		if (action !== "create") {
			appliedCreatePrefillRef.current = null;
			return;
		}

		const prefillSignature = `${prefillName}|${prefillCode}`;
		if (!prefillSignature.replace(/\|/g, "")) return;
		if (appliedCreatePrefillRef.current === prefillSignature) return;

		if (prefillName && !String(getValues("title") || "").trim()) {
			setValue("title", prefillName, { shouldDirty: false });
		}

		if (prefillCode && !String(getValues("code") || "").trim()) {
			setValue("code", prefillCode, { shouldDirty: false });
		}

		appliedCreatePrefillRef.current = prefillSignature;
	}, [action, getValues, prefillCode, prefillName, setValue]);

	// Handle deep linking from levels page
	useEffect(() => {
		const positionId = searchParams.get("positionId");
		if (positionId && action !== "view" && action !== "edit") {
			updateSearchParams((next) => {
				next.set("action", "view");
				next.set("id", positionId);
				next.delete("positionId");
			});
		}
	}, [searchParams, action, updateSearchParams]);

	// Watch form values for controlled components
	const watchedSectionId = watch("sectionId");
	const watchedLevelIds = watch("levelIds") || [];
	const watchedTitle = watch("title") || "";
	const watchedCode = watch("code") || "";
	const watchedDescription = watch("description") || "";
	const watchedMinSalary = watch("minSalary");
	const watchedMaxSalary = watch("maxSalary");
	const watchedIsManager = watch("isManager");
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	useDebouncedGeneratedCodeField({
		enabled: action === "create" && !prefillCode,
		sourceValue: watchedTitle,
		currentCodeValue: watchedCode,
		generateCode: async (source) => (await positionsService.generatePositionCode(source)).code,
		onGeneratedCode: (nextCode) =>
			setValue("code", nextCode, { shouldDirty: true, shouldValidate: true }),
	});

	const toggleLevelSelection = (levelId: string, checked: boolean) => {
		const currentIds = watchedLevelIds || [];
		if (checked) {
			if (!currentIds.includes(levelId)) {
				setValue("levelIds", [...currentIds, levelId]);
			}
			return;
		}
		setValue(
			"levelIds",
			currentIds.filter((id) => id !== levelId),
		);
	};

	useEffect(() => {
		if (!watchedSectionId) return;
		const sectionStillMatches = sections.some(
			(section: any) => String(section.id) === String(watchedSectionId),
		);
		if (!sectionStillMatches) {
			setValue("sectionId", null, { shouldDirty: true, shouldValidate: true });
		}
	}, [sections, setValue, watchedSectionId]);

	const sectionOptions: SelectOption[] = [
		{ value: "__none__", label: "No section" },
		...sections
			.filter((section: any) => section.isActive !== false)
			.map((section: any) => ({
				value: section.id,
				label: section.department?.name
					? `${section.name} - ${section.department.name}`
					: section.code
						? `${section.name} (${section.code})`
						: section.name,
			})),
	];

	// Show all levels regardless of selected department.
	const filteredLevels = levels;
	const selectedLevels = useMemo(
		() =>
			filteredLevels.filter(
				(level: any) => level?.id && watchedLevelIds.includes(level.id as string),
			),
		[filteredLevels, watchedLevelIds],
	);
	const filteredLevelChoices = useMemo(() => {
		const query = levelSearchQuery.trim().toLowerCase();
		if (!query) return filteredLevels;
		return filteredLevels.filter((level: any) => {
			const name = String(level?.name || "").toLowerCase();
			const rank = String(level?.rank ?? "").toLowerCase();
			return name.includes(query) || rank.includes(query);
		});
	}, [filteredLevels, levelSearchQuery]);

	const columns: Column<Position>[] = [
		{
			key: "title",
			label: "Position Name",
			width: "250px",
			required: true,
			priority: "critical",
			render: (value) => <AdminConfigPrimaryCell primary={value} />,
		},
		{
			key: "code",
			label: "Code",
			width: "120px",
			required: true,
			priority: "high",
			render: (value) => <AdminConfigCodeChip>{value}</AdminConfigCodeChip>,
		},
		{
			key: "section",
			label: "Department",
			width: "150px",
			priority: "high",
			render: (_value, item) => (
				<AdminConfigRelationLink
					to={
						item.section?.department?.id
							? `/admin/configuration/departments?action=view&id=${item.section.department.id}`
							: null
					}
					title={item.section?.department?.name}>
					{item.section?.department?.name ||
						departments.find((d: any) => d.id === item.section?.departmentId)?.name}
				</AdminConfigRelationLink>
			),
		},
		{
			key: "sectionId",
			label: "Section",
			width: "150px",
			priority: "high",
			render: (value, item) => (
				<AdminConfigRelationLink
					to={
						item.section?.id || value
							? `/admin/configuration/sections?action=view&id=${item.section?.id || value}`
							: null
					}
					title={
						item.section?.name ||
						sections.find((section: any) => section.id === value)?.name
					}>
					{item.section?.name ||
						sections.find((section: any) => section.id === value)?.name}
				</AdminConfigRelationLink>
			),
		},
		{
			key: "levels",
			label: "Allowed Levels",
			width: "190px",
			priority: "medium",
			hideBelow: "lg",
			render: (_value, item) => {
				const positionLevels = Array.isArray(item.levels) ? item.levels : [];
				if (!positionLevels.length) return <AdminConfigMutedDash />;
				return (
					<div className="flex max-w-[190px] flex-wrap gap-1">
						{positionLevels.slice(0, 3).map((positionLevel: any) => {
							const level = positionLevel.level || positionLevel;
							const levelId = level.id || positionLevel.levelId;
							return (
								<AdminConfigRelationLink
									key={positionLevel.id || levelId || level.name}
									to={
										levelId
											? `/admin/configuration/levels?action=view&id=${levelId}`
											: null
									}
									className="text-xs font-medium">
									{level.name || "Level"}
								</AdminConfigRelationLink>
							);
						})}
						{positionLevels.length > 3 ? (
							<AdminConfigRelationText className="text-xs">
								+{positionLevels.length - 3}
							</AdminConfigRelationText>
						) : null}
					</div>
				);
			},
		},
		{
			key: "minSalary",
			label: "Salary Range",
			width: "150px",
			priority: "low",
			hideBelow: "xl",
			render: (value, item) => {
				const min = item.minSalary ? `₱${item.minSalary.toLocaleString()}` : "";
				const max = item.maxSalary ? `₱${item.maxSalary.toLocaleString()}` : "";
				return (
					<span className="text-gray-600">
						{min && max ? `${min} - ${max}` : min || max || "-"}
					</span>
				);
			},
		},
		{
			key: "description",
			label: "Description",
			width: "300px",
			priority: "low",
			hideBelow: "xl",
			render: (value) => {
				if (!value) return <AdminConfigMutedDash />;

				const textProps = createTruncatedTextProps(value, 80);

				return <AdminConfigLongText title={textProps.title}>{textProps.displayText}</AdminConfigLongText>;
			},
		},
		{
			key: "isActive",
			label: "Status",
			width: "100px",
			required: true,
			priority: "critical",
			render: (value, item) => (
				<CategoricalText value={item.isActive ? "Active" : "Inactive"} />
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

	const openCreate = () => {
		reset({
			title: "",
			code: "",
			description: "",
			sectionId: null,
			levelIds: [],
			minSalary: undefined,
			maxSalary: undefined,
			isManager: false,
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (position: Position) => {
		// Don't populate form here - let the useEffect handle it with fresh data from API
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", position.id);
		});
	};

	const handleDelete = (position: Position) => {
		setDeletingPosition(position);
		setIsDeleteModalOpen(true);
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", position.id);
		});
	};

	const handleView = (item: Position) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", item.id);
		});
	};

	const confirmDelete = () => {
		if (!deletingPosition) return;
		deletePositionMutation.mutate(deletingPosition.id, {
			onSuccess: () => {
				setIsDeleteModalOpen(false);
				setDeletingPosition(null);
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	// Import handlers
	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	const handleImportPositions = async (file: File) => {
		const result = await importPositionsMutation.mutateAsync(file);
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
		const template = `CODE,TITLE,DESCRIPTION,SECTION_CODE,MIN_SALARY,MAX_SALARY,LEVELS
HR-MGR,HR Manager,Human Resources Manager,HR-OPS,80000,120000,"Manager,Senior Manager"
HR-SPEC,HR Specialist,Human Resources Specialist,HR-OPS,40000,70000,"Junior,Mid,Senior"
IT-MGR,IT Manager,IT Department Manager,IT-OPS,90000,130000,"Manager,Senior Manager"
IT-SE,Software Engineer,Software Engineer,IT-OPS,40000,80000,"Junior,Mid,Senior"`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "positions-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activePositionId && isLoadingPosition;

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
			if (filters.isActive) {
				next.set("status", filters.isActive);
			} else {
				next.delete("status");
			}
			next.set("page", "1");
		});
	};

	// Custom actions renderer with dropdown
	const renderActions = (item: Position) => {
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
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" />
						View Details
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openEdit(item)}>
						<Edit className="h-4 w-4 mr-2" />
						Edit
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

	const onSubmit = (data: PositionFormData) => {
		// Check if we're editing by looking at search params
		const isEditing = action === "edit";

		if (isEditing && activePosition) {
			const updatePayload: UpdatePositionRequest = {
				title: data.title,
				code: data.code,
				description: data.description || "",
				sectionId: data.sectionId || null,
				levelIds: data.levelIds && data.levelIds.length > 0 ? data.levelIds : undefined,
				minSalary: data.minSalary,
				maxSalary: data.maxSalary,
				isManager: data.isManager,
				isActive: data.isActive,
			};

			updatePositionMutation.mutate(
				{ id: activePosition.id, payload: updatePayload },
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

			const createPayload: CreatePositionRequest = {
				...data,
				sectionId: data.sectionId || null,
				organizationId: organizationId!,
			};

			createPositionMutation.mutate(createPayload, {
				onSuccess: (createdPosition) => {
					reset();
					if (shouldReturnToImport && returnTo) {
						navigate(returnTo);
						return;
					}
					if (shouldReturnToEmployeeForm && returnTo) {
						navigate(
							appendReturnToParam(returnTo, "createdPositionId", createdPosition.id),
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

	const exportPositionsToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: Position[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: ((await refetchExportPositions()).data as any)?.positions || [];

		downloadCsvFile(
			buildDatedCsvFilename("positions"),
			[
				"Position Name",
				"Code",
				"Department",
				"Section",
				"Salary Range",
				"Description",
				"Status",
				"Created At",
			],
			exportItems.map((item: Position) => {
				const min = item.minSalary ? `PHP ${item.minSalary.toLocaleString()}` : "";
				const max = item.maxSalary ? `PHP ${item.maxSalary.toLocaleString()}` : "";
				return [
					item.title || "",
					item.code || "",
					item.section?.department?.name ||
						departments.find((d: any) => d.id === item.section?.departmentId)?.name ||
						"",
					item.section?.name ||
						sections.find((section: any) => section.id === item.sectionId)?.name ||
						"",
					min && max ? `${min} - ${max}` : min || max || "",
					item.description || "",
					item.isActive ? "Active" : "Inactive",
					formatDateForExport(item.createdAt),
				];
			}),
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Positions"
				data={positions}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				onImport={openImport}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No positions yet"
				emptyDescription="Add a position or use Migration."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add position"
						to="/admin/configuration/positions?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search positions..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={
					(positionsData as any)?.count ?? (positionsData as any)?.pagination?.total
				}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ isActive: statusFilter || "" }}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportCSV={exportPositionsToCsv}
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
				className={HR_MODAL_WIDE_CLASS}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Position..."
						: action === "edit"
							? "Edit Position"
							: "Create Position"
				}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading position...</div>
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
												? "Create this position, then we'll bring you back to the employee form."
												: "Create this position, then we'll bring you back to step 3."}
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
								<div data-field-path="title">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Name *
									</label>
									<Input
										placeholder="e.g., Software Engineer"
										aria-invalid={Boolean(errors.title)}
										{...register("title", { required: true })}
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
								<div data-field-path="code">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Code *
									</label>
									<Input
										placeholder="e.g., SSE001"
										aria-invalid={Boolean(errors.code)}
										{...register("code", {
											required: true,
											setValueAs: (v) => String(v || "").toUpperCase(),
										})}
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
							<div data-field-path="sectionId">
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Section
								</label>
								<Select
									options={sectionOptions}
									value={watchedSectionId || "__none__"}
									onChange={(value) =>
										setValue("sectionId", value === "__none__" ? null : value, {
											shouldValidate: true,
											shouldDirty: true,
										})
									}
									placeholder="Select Section"
									name="sectionId"
								/>
								<ConstraintTokenRow
									tokens={[
										{
											label: "Department is inherited",
											tone: watchedSectionId ? "default" : "subtle",
										},
									]}
								/>
							</div>

							<div data-field-path="levelIds">
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Allowed Levels (optional)
								</label>
								<div className="space-y-2">
									<DropdownMenu
										open={isLevelsOpen}
										onOpenChange={(open) => {
											setIsLevelsOpen(open);
											if (!open) setLevelSearchQuery("");
										}}>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												role="combobox"
												aria-expanded={isLevelsOpen}
												disabled={filteredLevels.length === 0}
												className="mt-1 flex min-h-[42px] w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 transition-all hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400">
												<span className="truncate">
													{watchedLevelIds.length > 0
														? `${watchedLevelIds.length} level${watchedLevelIds.length > 1 ? "s" : ""} selected`
														: filteredLevels.length === 0
															? "No levels available"
															: "Select levels..."}
												</span>
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="start"
											className="w-[440px] p-0">
											{filteredLevels.length === 0 ? (
												<div className="p-3 text-sm text-gray-500">
													No levels available
												</div>
											) : (
												<div>
													<div className="flex items-center justify-between border-b px-3 py-2">
														<p className="text-xs font-medium text-gray-600">
															Selected: {watchedLevelIds.length}
														</p>
														<div className="flex items-center gap-1">
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-7 px-2 text-xs"
																onClick={(e) => {
																	e.preventDefault();
																	setValue(
																		"levelIds",
																		filteredLevels
																			.map((l: any) => l.id)
																			.filter(Boolean),
																	);
																}}>
																Select all
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-7 px-2 text-xs"
																onClick={(e) => {
																	e.preventDefault();
																	setValue("levelIds", []);
																}}
																disabled={
																	watchedLevelIds.length === 0
																}>
																Clear
															</Button>
														</div>
													</div>
													<div className="border-b p-2">
														<Input
															value={levelSearchQuery}
															onChange={(e) =>
																setLevelSearchQuery(e.target.value)
															}
															onKeyDown={(e) => e.stopPropagation()}
															placeholder="Search levels..."
															className="h-8 text-xs"
														/>
													</div>
													<div className="max-h-64 overflow-y-auto p-1">
														{filteredLevelChoices.length === 0 ? (
															<div className="p-3 text-xs text-gray-500">
																No level matches search.
															</div>
														) : (
															filteredLevelChoices.map(
																(level: any) => (
																	<DropdownMenuCheckboxItem
																		key={level.id}
																		checked={watchedLevelIds.includes(
																			level.id,
																		)}
																		onSelect={(e) =>
																			e.preventDefault()
																		}
																		onCheckedChange={(
																			checked,
																		) =>
																			toggleLevelSelection(
																				level.id,
																				Boolean(checked),
																			)
																		}
																		className="flex items-center justify-between gap-2 py-2">
																		<div className="min-w-0">
																			<p className="truncate text-sm font-medium text-gray-800">
																				{level.name}
																			</p>
																			{level.rank && (
																				<p className="text-xs text-gray-500">
																					Rank{" "}
																					{level.rank}
																				</p>
																			)}
																		</div>
																	</DropdownMenuCheckboxItem>
																),
															)
														)}
													</div>
												</div>
											)}
										</DropdownMenuContent>
									</DropdownMenu>

									{selectedLevels.length > 0 && (
										<div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2">
											{selectedLevels.map((level: any) => (
												<Badge
													key={level.id}
													variant="secondary"
													className="flex items-center gap-1 border border-gray-200 bg-white text-xs">
													<span>{level.name}</span>
													{level.rank && (
														<span className="text-gray-500">
															· R{level.rank}
														</span>
													)}
												</Badge>
											))}
										</div>
									)}
								</div>
								<ConstraintTokenRow
									tokens={[
										{
											label: "0+",
											tone: watchedLevelIds.length > 0 ? "default" : "subtle",
										},
									]}
								/>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="minSalary">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Min Salary
									</label>
									<Input
										type="number"
										placeholder="e.g., 80000"
										step="0.01"
										aria-invalid={Boolean(errors.minSalary)}
										{...register("minSalary", { valueAsNumber: true })}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "P0+",
												tone:
													watchedMinSalary == null ||
													Number(watchedMinSalary) >= 0
														? "subtle"
														: "invalid",
											},
										]}
									/>
								</div>
								<div data-field-path="maxSalary">
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Max Salary
									</label>
									<Input
										type="number"
										placeholder="e.g., 120000"
										step="0.01"
										aria-invalid={Boolean(errors.maxSalary)}
										{...register("maxSalary", { valueAsNumber: true })}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "P0+",
												tone:
													watchedMaxSalary == null ||
													Number(watchedMaxSalary) >= 0
														? "subtle"
														: "invalid",
											},
											{
												label: "Min-Max",
												tone:
													watchedMinSalary == null ||
													watchedMaxSalary == null ||
													Number(watchedMaxSalary) >=
														Number(watchedMinSalary)
														? "subtle"
														: "invalid",
											},
										]}
									/>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<label className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										id="isManager"
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										{...register("isManager")}
									/>
									Manager position
								</label>
								<label className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										id="isActive"
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										{...register("isActive")}
									/>
									Active
								</label>
							</div>
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
								}}
								disabled={
									createPositionMutation.isPending ||
									updatePositionMutation.isPending
								}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createPositionMutation.isPending ||
									updatePositionMutation.isPending
								}>
								{(createPositionMutation.isPending ||
									updatePositionMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update Position" : "Create Position"}
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
				title="Position Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading position...</div>
				) : activePosition && action === "view" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-gray-500">
									Position Title
								</div>
								<p className="text-sm font-medium">{activePosition.title}</p>
							</div>
							<div>
								<div className="text-sm font-medium text-gray-500">Code</div>
								<p className="text-sm">{activePosition.code}</p>
							</div>
						</div>

						<div>
							<div className="text-sm font-medium text-gray-500">Description</div>
							<p className="text-sm">{activePosition.description || "-"}</p>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-gray-500">Department</div>
								<p className="text-sm">
									{activePosition.section?.department?.name ||
										departments.find(
											(d: any) =>
												d.id === activePosition.section?.departmentId,
										)?.name ||
										"-"}
								</p>
							</div>
							<div>
								<div className="text-sm font-medium text-gray-500">Section</div>
								<p className="text-sm">
									{activePosition.section?.name ||
										sections.find(
											(section: any) =>
												section.id === activePosition.sectionId,
										)?.name ||
										"-"}
								</p>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-gray-500">Levels</div>
								<div>
									{activePosition.levels && activePosition.levels.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{activePosition.levels.map((pl: any) => {
												const level = pl.level || pl;
												const levelId = level.id || pl.levelId;
												return (
													<button
														key={pl.id || levelId}
														onClick={(e) => {
															e.stopPropagation();
															navigate(
																`/admin/configuration/levels?action=view&id=${levelId}`,
															);
														}}
														type="button"
														className="inline-flex max-w-full rounded border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-200">
														<span className="truncate">
															{level.name}
														</span>
													</button>
												);
											})}
										</div>
									) : (
										<p className="text-sm text-gray-400">-</p>
									)}
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<div className="text-sm font-medium text-gray-500">Min Salary</div>
								<p className="text-sm">
									{activePosition.minSalary
										? `₱${activePosition.minSalary.toLocaleString()}`
										: "-"}
								</p>
							</div>
							<div>
								<div className="text-sm font-medium text-gray-500">Max Salary</div>
								<p className="text-sm">
									{activePosition.maxSalary
										? `₱${activePosition.maxSalary.toLocaleString()}`
										: "-"}
								</p>
							</div>
						</div>

						<div>
							<div className="block text-sm font-medium text-gray-500 mb-1">
								Status
							</div>
							<CategoricalText
								value={activePosition.isActive ? "Active" : "Inactive"}
							/>
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
							<Button onClick={() => openEdit(activePosition)}>Edit Position</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Position not found</div>
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
				title="Delete Position"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading position...</div>
				) : activePosition && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the
								position <strong>{activePosition.title}</strong> (
								{activePosition.code}).
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
								disabled={deletePositionMutation.isPending}>
								{deletePositionMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Position"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Position not found</div>
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
				title="Import Positions"
				description="Upload a CSV/Excel file to bulk import positions"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportPositions}
				isImporting={importPositionsMutation.isPending}
			/>
		</div>
	);
}
