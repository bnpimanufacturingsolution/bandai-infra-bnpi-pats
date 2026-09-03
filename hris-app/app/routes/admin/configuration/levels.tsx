import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { Edit, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
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
	useCreateLevel,
	useDeleteLevel,
	useImportLevels,
	useLevel,
	useLevels,
	useUpdateLevel,
} from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import type { CreateLevelRequest, Level, UpdateLevelRequest } from "~/services/levels.service";
import { toast } from "sonner";
import { getSetupReturnTo, isEmployeeImportReturn } from "~/lib/utils/import-setup-redirect";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import {
	AdminConfigCodeChip,
	AdminConfigLongText,
	AdminConfigMutedDash,
	AdminConfigPolicyChip,
	AdminConfigPrimaryCell,
	AdminConfigStatusBadge,
} from "~/lib/ui/admin-configuration-table";

interface LevelFormData {
	name: string;
	rank?: number;
	description?: string;
	isManager: boolean;
	isActive: boolean;
}

const IMPORT_FIELDS = {
	required: [{ key: "NAME", label: "Level Name", required: true, aliases: ["Name"] }],
	optional: [
		{ key: "RANK", label: "Rank", aliases: ["Order"] },
		{ key: "DESCRIPTION", label: "Description", aliases: ["Notes"] },
		{
			key: "IS_MANAGER",
			label: "Manager Level",
			aliases: ["isManager", "Is Manager", "Manager Flag"],
		},
	],
	system: [],
};

function toBooleanFlag(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "true" || normalized === "1" || normalized === "yes";
	}
	return false;
}

export default function LevelsPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
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
	const shouldReturnToImport = action === "create" && isEmployeeImportContext && !!returnTo;
	const activeLevelId = action === "edit" || action === "view" || action === "delete" ? id : null;

	const { data: activeLevel, isLoading: isLoadingLevel } = useLevel(activeLevelId || "");
	const { data: levelsData, isLoading } = useLevels({
		page: pageParam,
		limit: limitParam,
		count: true,
		query: searchQuery,
		filter: filterString,
	});
	const { refetch: refetchExportLevels } = useLevels(
		{
			page: 1,
			limit: 1000,
			count: true,
			query: searchQuery,
			filter: filterString,
		},
		{ enabled: false },
	);
	const { data: positionsData } = usePositions({
		page: 1,
		limit: 1000,
	});

	const levels = (levelsData as any)?.levels || [];
	const positions = (positionsData as any)?.positions || [];

	const createLevelMutation = useCreateLevel();
	const updateLevelMutation = useUpdateLevel();
	const deleteLevelMutation = useDeleteLevel();
	const importLevelsMutation = useImportLevels();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		getValues,
		watch,
		formState: { errors },
	} = useForm<LevelFormData>({
		defaultValues: {
			name: "",
			rank: undefined,
			description: "",
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

	useEffect(() => {
		if (action === "edit" && !isLoadingLevel && activeLevel) {
			reset({
				name: activeLevel.name,
				rank: activeLevel.rank,
				description: activeLevel.description || "",
				isManager: toBooleanFlag(activeLevel.isManager),
				isActive: activeLevel.isActive,
			});
		}
	}, [action, activeLevel, isLoadingLevel, reset]);

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

		appliedCreatePrefillRef.current = prefillSignature;
	}, [action, getValues, prefillCode, prefillName, setValue]);

	useEffect(() => {
		const levelId = searchParams.get("levelId");
		if (levelId && action !== "view" && action !== "edit") {
			updateSearchParams((next) => {
				next.set("action", "view");
				next.set("id", levelId);
				next.delete("levelId");
			});
		}
	}, [action, searchParams, updateSearchParams]);

	const watchedName = watch("name") || "";
	const watchedRank = watch("rank");
	const watchedDescription = watch("description") || "";
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	const openCreate = () => {
		reset({
			name: "",
			rank: undefined,
			description: "",
			isManager: false,
			isActive: true,
		});
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (level: Level) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", level.id);
		});
	};

	const handleDelete = (level: Level) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", level.id);
		});
	};

	const handleView = (level: Level) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", level.id);
		});
	};

	const confirmDelete = () => {
		if (!activeLevel) return;
		deleteLevelMutation.mutate(activeLevel.id, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const openImport = () => {
		updateSearchParams((next) => {
			next.set("action", "import");
		});
	};

	const handleImportLevels = async (file: File) => {
		const result = await importLevelsMutation.mutateAsync(file);
		updateSearchParams((next) => {
			next.delete("action");
		});
		return result;
	};

	const handleDownloadTemplate = () => {
		const template = `NAME,RANK,IS_MANAGER,DESCRIPTION
CEO,1,TRUE,Executive leadership level
Director,2,TRUE,Department or function head
Lead,3,TRUE,Team lead level
Admin,4,TRUE,Administrative support
Staff,6,FALSE,Individual contributor
Manager,3,TRUE,People manager
Junior,7,FALSE,Entry or junior contributor`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "levels-template.csv";
		link.click();
		window.URL.revokeObjectURL(url);
	};

	const onSubmit = (data: LevelFormData) => {
		const isValidRank = (rank: number | undefined | null): rank is number =>
			rank !== undefined && rank !== null && !Number.isNaN(rank) && typeof rank === "number";

		if (action === "edit" && activeLevel) {
			const updatePayload: UpdateLevelRequest = {
				name: data.name,
				...(isValidRank(data.rank) && { rank: data.rank }),
				...(data.description?.trim() && { description: data.description.trim() }),
				isManager: data.isManager,
				isActive: data.isActive,
			};

			updateLevelMutation.mutate(
				{ id: activeLevel.id, payload: updatePayload },
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
			return;
		}

		const organizationId = user?.organizationId || user?.organization?.id;
		if (!organizationId) {
			toast.error("User organization ID not found");
			return;
		}

		const createPayload: CreateLevelRequest = {
			name: data.name,
			...(isValidRank(data.rank) && { rank: data.rank }),
			...(data.description?.trim() && { description: data.description.trim() }),
			isManager: data.isManager,
			isActive: data.isActive,
			organizationId,
		};

		createLevelMutation.mutate(createPayload, {
			onSuccess: () => {
				reset();
				if (shouldReturnToImport && returnTo) {
					navigate(returnTo);
					return;
				}
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("id");
				});
			},
		});
	};

	const getPositionsForLevel = (levelId: string) => {
		return positions.filter((position: any) => {
			const positionLevels = position.levels || [];
			return positionLevels.some((positionLevel: any) => {
				const level = positionLevel.level || positionLevel;
				return (level.id || positionLevel.levelId) === levelId;
			});
		});
	};

	const exportLevelsToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: Level[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: ((await refetchExportLevels()).data as any)?.levels || [];

		downloadCsvFile(
			buildDatedCsvFilename("levels"),
			["Name", "Rank", "Description", "Manager Level", "Status"],
			exportItems.map((level: Level) => [
				level.name || "",
				level.rank ?? "",
				level.description || "",
				toBooleanFlag(level.isManager) ? "Yes" : "No",
				level.isActive ? "Active" : "Inactive",
			]),
		);
	};

	const renderActions = (item: Level) => (
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

	const columns: Column<Level>[] = [
		{
			key: "name",
			label: "Name",
			required: true,
			priority: "critical",
			render: (_, level) => <AdminConfigPrimaryCell primary={level.name} />,
		},
		{
			key: "rank",
			label: "Rank",
			required: true,
			priority: "high",
			render: (_, level) => (
				level.rank ? <AdminConfigCodeChip>#{level.rank}</AdminConfigCodeChip> : <AdminConfigMutedDash />
			),
		},
		{
			key: "description",
			label: "Description",
			priority: "low",
			hideBelow: "lg",
			render: (_, level) => (
				level.description ? <AdminConfigLongText>{level.description}</AdminConfigLongText> : <AdminConfigMutedDash />
			),
		},
		{
			key: "isManager",
			label: "Manager Level",
			required: true,
			priority: "high",
			render: (_, level) => (
				<AdminConfigPolicyChip>
					{toBooleanFlag(level.isManager) ? "Yes" : "No"}
				</AdminConfigPolicyChip>
			),
		},
		{
			key: "isActive",
			label: "Status",
			required: true,
			priority: "critical",
			render: (_, level) => (
				<CategoricalText value={level.isActive ? "Active" : "Inactive"} />
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

	const isDeepLinkLoading = !!activeLevelId && isLoadingLevel;

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

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Levels"
				data={levels}
				columns={columns}
				filters={filterOptions}
				onAdd={openCreate}
				onImport={openImport}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No levels yet"
				emptyDescription="Add a level or use Migration."
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add level"
						to="/admin/configuration/levels?action=create"
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search levels..."
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={(levelsData as any)?.count}
				onSearch={handleSearch}
				onFilterChange={handleFilterChange}
				filterValues={{ isActive: statusFilter || "" }}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				onExportCSV={exportLevelsToCsv}
				containedScroll
			/>

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
						? "Loading Level..."
						: action === "edit"
							? "Edit Level"
							: "Create Level"
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">Loading level...</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						{shouldReturnToImport && returnTo && (
							<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
								<div className="flex items-center justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-emerald-900">
											Opened from employee import
										</p>
										<p className="text-xs text-emerald-700">
											Create this level, then we&apos;ll bring you back to
											step 3.
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										className="border-emerald-200 text-emerald-800 hover:bg-emerald-100"
										onClick={() => navigate(returnTo)}>
										Back to import
									</Button>
								</div>
							</div>
						)}
						<div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Name *
									</label>
									<Input
										aria-invalid={Boolean(errors.name)}
										{...register("name", { required: true })}
										placeholder="e.g., Senior Manager"
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
								<div data-field-path="rank">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Rank (Optional)
									</label>
									<Input
										type="number"
										aria-invalid={Boolean(errors.rank)}
										{...register("rank", {
											valueAsNumber: true,
											setValueAs: (value) =>
												value === "" ||
												value === null ||
												Number.isNaN(Number(value))
													? undefined
													: Number(value),
										})}
										placeholder="e.g., 1, 2, 3"
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "0-999",
												tone:
													watchedRank == null ||
													Number.isNaN(Number(watchedRank)) ||
													Number(watchedRank) >= 0
														? "subtle"
														: "invalid",
											},
											{ label: "0-9", tone: "subtle" },
										]}
									/>
								</div>
							</div>
							<div data-field-path="description">
								<label className="mb-1 block text-sm font-medium text-gray-700">
									Description (Optional)
								</label>
								<Input
									aria-invalid={Boolean(errors.description)}
									{...register("description")}
									placeholder="Enter description"
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
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<label
									htmlFor="isManager"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
									<input
										id="isManager"
										type="checkbox"
										className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										{...register("isManager")}
									/>
									Manager Level
								</label>
								<label
									htmlFor="isActive"
									className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
									reset();
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
									createLevelMutation.isPending || updateLevelMutation.isPending
								}>
								{(createLevelMutation.isPending ||
									updateLevelMutation.isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{action === "edit" ? "Update" : "Create"} Level
							</Button>
						</div>
					</form>
				)}
			</Modal>

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
				title="Level Details"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "view" ? (
					<div className="py-8 text-center text-gray-500">Loading level...</div>
				) : activeLevel && action === "view" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Name
									</label>
									<p className="mt-1 text-sm font-medium text-gray-900">
										{activeLevel.name}
									</p>
								</div>
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Rank
									</label>
									<p className="mt-1 text-sm text-gray-800">
										{activeLevel.rank ? `#${activeLevel.rank}` : "N/A"}
									</p>
								</div>
							</div>
							<div className="mt-4">
								<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
									Description
								</label>
								<p className="mt-1 text-sm text-gray-800">
									{activeLevel.description || "No description"}
								</p>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div>
									<label className="text-xs font-medium uppercase tracking-wider text-gray-500">
										Manager Level
									</label>
									<div className="mt-1">
										<Badge
											variant={
												toBooleanFlag(activeLevel.isManager)
													? "default"
													: "secondary"
											}>
											{toBooleanFlag(activeLevel.isManager) ? "Yes" : "No"}
										</Badge>
									</div>
								</div>
								<div>
									<label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
										Status
									</label>
									<CategoricalText
										value={activeLevel.isActive ? "Active" : "Inactive"}
									/>
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-slate-200 bg-white p-4">
							<label className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500">
								Positions Using This Level
							</label>
							{(() => {
								const levelPositions = getPositionsForLevel(activeLevel.id);
								if (levelPositions.length === 0) {
									return (
										<p className="text-sm text-gray-400">
											No positions assigned
										</p>
									);
								}

								return (
									<div className="flex flex-wrap gap-2">
										{levelPositions.map((position: any) => (
											<button
												key={position.id}
												onClick={() => {
													updateSearchParams((next) => {
														next.delete("action");
														next.delete("id");
													});
													navigate(
														`/admin/configuration/positions?action=view&id=${position.id}`,
													);
												}}
												className="inline-flex rounded border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-700 transition-colors hover:bg-slate-200">
												{position.title}
											</button>
										))}
									</div>
								);
							})()}
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
							<Button onClick={() => openEdit(activeLevel)}>Edit Level</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Level not found</div>
				)}
			</Modal>

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
				title="Delete Level"
				className={HR_MODAL_STANDARD_CLASS}>
				{isDeepLinkLoading && action === "delete" ? (
					<div className="py-8 text-center text-gray-500">Loading level...</div>
				) : activeLevel && action === "delete" ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-red-200 bg-red-50 p-4">
							<p className="text-sm text-red-800">
								This action cannot be undone. This will permanently delete the level{" "}
								<strong>{activeLevel.name}</strong>.
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
								disabled={deleteLevelMutation.isPending}>
								{deleteLevelMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Deleting...
									</>
								) : (
									"Delete Level"
								)}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Level not found</div>
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
				title="Import Levels"
				description="Upload a CSV/Excel file to bulk import levels"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImportLevels}
				isImporting={importLevelsMutation.isPending}
			/>
		</div>
	);
}
