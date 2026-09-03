import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	useCreateJob,
	useDeleteJob,
	useJob,
	useJobs,
	useRestoreJob,
	useUpdateJob,
} from "~/lib/hooks/use-job";
import { useWorkforceRecruitmentRequestContext } from "~/lib/hooks/useWorkforceRecruitmentSettings";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { formatDateTime } from "~/lib/utils/text-utils";
import type { Job } from "~/zod/job.zod";
import { CreateJobSchema } from "~/zod/job.zod";
import {
	Briefcase,
	CheckCircle2,
	CircleAlert,
	Edit,
	Eye,
	Loader2,
	MapPin,
	MoreVertical,
	Plus,
	Target,
	Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const JobFormSchema = CreateJobSchema;
type JobFormData = z.infer<typeof JobFormSchema>;

const getTargetCount = (job?: Job | null) => {
	const count = Number(job?.headcountRequested || 0);
	return Number.isFinite(count) && count > 0 ? count : 1;
};

export function RecruitmentJobsManager() {
	const [searchParams, setSearchParams] = useSearchParams();
	const jobAction = searchParams.get("jobAction") || "";
	const jobId = searchParams.get("jobId") || "";
	const jobSearch = searchParams.get("jobSearch") || undefined;
	const jobStatus = searchParams.get("jobStatus") || undefined;
	const jobType = searchParams.get("jobType") || undefined;
	const jobLocation = searchParams.get("jobLocation") || undefined;
	const jobPage = Number(searchParams.get("jobPage") || 1);
	const jobLimit = Number(searchParams.get("jobLimit") || 10);
	const isManagerOpen = ["list", "create", "edit", "view", "delete"].includes(jobAction);
	const isEditing = jobAction === "edit";
	const isViewing = jobAction === "view";
	const isDeleting = jobAction === "delete";
	const isFormOpen = jobAction === "create" || jobAction === "edit";

	const filters: Record<string, any> = {};
	if (jobStatus) {
		filters.isDeleted = jobStatus === "inactive";
	} else {
		filters.isDeleted = false;
	}
	if (jobType) filters.type = jobType;
	if (jobLocation) filters.location = jobLocation;

	const { data: jobsData, isLoading } = useJobs({
		page: jobPage,
		limit: jobLimit,
		query: jobSearch,
		filter: filters,
		count: true,
		fields: "id,departmentId,sectionId,positionId,levelId,department.id,department.name,section.id,section.name,section.code,position.id,position.title,position.sectionId,position.section.departmentId,level.id,level.name,headcountRequested,type,location,description,isDeleted,createdAt,updatedAt",
	});
	const items = (jobsData as any)?.jobs || [];
	const totalItems = (jobsData as any)?.pagination?.total || 0;

	const activeJobId = isEditing || isViewing || isDeleting ? jobId : null;
	const { data: activeJob, isLoading: isLoadingJob } = useJob(activeJobId || "", !!activeJobId);

	const { data: positionsData, isLoading: isLoadingPositions } = usePositions({
		limit: 1000,
		fields: "id,title,departmentId,sectionId,section.id,section.name,section.code,levels,levels.id,levels.levelId,levels.level.id,levels.level.name,levels.level.rank",
	});
	const positions = (positionsData as any)?.positions || [];
	const { data: levelsData, isLoading: isLoadingLevels } = useLevels({ limit: 1000 });
	const levels = (levelsData as any)?.levels || [];

	const createJobMutation = useCreateJob();
	const updateJobMutation = useUpdateJob();
	const deleteJobMutation = useDeleteJob();
	const restoreJobMutation = useRestoreJob();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		formState: { errors },
	} = useForm<JobFormData>({
		resolver: zodResolver(JobFormSchema) as any,
		defaultValues: {
			headcountRequested: 1,
			departmentId: null,
			sectionId: null,
			positionId: "",
			levelId: null,
			type: "FULL_TIME",
			location: "ONSITE",
			description: "",
			tags: [],
			isDeleted: false,
		},
	});

	useEffect(() => {
		if (isEditing && activeJob) {
			reset({
				headcountRequested: getTargetCount(activeJob),
				departmentId: activeJob.departmentId || activeJob.position?.section?.departmentId || null,
				sectionId: activeJob.sectionId || activeJob.position?.sectionId || null,
				positionId: activeJob.positionId || activeJob.position?.id || "",
				levelId: activeJob.levelId || activeJob.level?.id || null,
				type: activeJob.type,
				location: activeJob.location,
				description: activeJob.description,
				tags: activeJob.tags || [],
				isDeleted: activeJob.isDeleted,
			});
		} else if (jobAction === "create") {
			reset({
				headcountRequested: 1,
				departmentId: null,
				sectionId: null,
				positionId: "",
				levelId: null,
				type: "FULL_TIME",
				location: "ONSITE",
				description: "",
				tags: [],
				isDeleted: false,
			});
		}
	}, [activeJob, isEditing, jobAction, reset]);

	const watchedPositionId = watch("positionId");
	const watchedLevelId = watch("levelId");
	const watchedHeadcountRequested = watch("headcountRequested");
	const watchedType = watch("type");
	const watchedLocation = watch("location");
	const selectedPosition = useMemo(
		() => positions.find((position: any) => position.id === watchedPositionId),
		[positions, watchedPositionId],
	);
	const selectedPositionLevelIds = useMemo(
		() =>
			new Set(
				Array.isArray(selectedPosition?.levels)
					? selectedPosition.levels
							.map((entry: any) =>
								String(entry?.level?.id || entry?.levelId || entry?.id || ""),
							)
							.filter(Boolean)
					: [],
			),
		[selectedPosition],
	);
	const availableLevels = useMemo(
		() =>
			selectedPosition && selectedPositionLevelIds.size
				? levels.filter((level: any) => selectedPositionLevelIds.has(String(level.id)))
				: [],
		[levels, selectedPosition, selectedPositionLevelIds],
	);
	const selectedSectionId =
		String(selectedPosition?.section?.id || selectedPosition?.sectionId || "").trim() || null;
	const selectedDepartmentId =
		String(selectedPosition?.departmentId || "").trim() || null;
	const requiresLevel = availableLevels.length > 0;
	const recruitmentContextEnabled = isFormOpen && Boolean(watchedPositionId);
	const { data: recruitmentContext, isLoading: isLoadingRecruitmentContext } =
		useWorkforceRecruitmentRequestContext(
			{
				departmentId: selectedDepartmentId || undefined,
				sectionId: selectedSectionId || undefined,
				positionId: watchedPositionId || undefined,
				levelId: requiresLevel ? watchedLevelId || undefined : undefined,
			},
			{ enabled: recruitmentContextEnabled },
		);

	const positionOptions: SelectOption[] = positions.map((position: any) => ({
		value: position.id,
		label: position.title,
	}));
	const levelOptions: SelectOption[] = availableLevels.map((level: any) => ({
		value: level.id,
		label: level.name,
	}));
	const typeOptions: SelectOption[] = [
		{ value: "FULL_TIME", label: "Full Time" },
		{ value: "PART_TIME", label: "Part Time" },
		{ value: "CONTRACT", label: "Contract" },
		{ value: "INTERNSHIP", label: "Internship" },
	];
	const locationOptions: SelectOption[] = [
		{ value: "ONSITE", label: "On-site" },
		{ value: "REMOTE", label: "Remote" },
		{ value: "HYBRID", label: "Hybrid" },
	];
	const requestedHeadcount = Math.max(0, Number(watchedHeadcountRequested || 0));
	const currentHeadcount = Number(recruitmentContext?.headcount.currentHeadcount || 0);
	const targetHeadcount = Number(recruitmentContext?.policy?.targetHeadcount || 0);
	const availableHeadcount =
		recruitmentContext?.headcount.availableHeadcount === null ||
		recruitmentContext?.headcount.availableHeadcount === undefined
			? null
			: Number(recruitmentContext.headcount.availableHeadcount || 0);
	const hasRecruitmentPolicy =
		Boolean(recruitmentContext?.settings.isEnabled) && Boolean(recruitmentContext?.policy);
	const isBlockingPolicy = recruitmentContext?.policy?.limitBehavior === "BLOCK";
	const isOverCapacity =
		hasRecruitmentPolicy &&
		availableHeadcount !== null &&
		requestedHeadcount > availableHeadcount;
	const blocksJobSave = isBlockingPolicy && isOverCapacity;
	const capacityTone = !recruitmentContextEnabled
		? "neutral"
		: blocksJobSave
			? "danger"
			: isOverCapacity
				? "warning"
				: hasRecruitmentPolicy
					? "ready"
					: "neutral";

	const filterOptions: FilterOption[] = [
		{
			key: "jobStatus",
			label: "Status",
			options: [
				{ value: "active", label: "Active" },
				{ value: "inactive", label: "Archived" },
			],
		},
		{
			key: "jobType",
			label: "Type",
			options: typeOptions,
		},
		{
			key: "jobLocation",
			label: "Location",
			options: locationOptions,
		},
	];

	const updateJobSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const formatLevelPositionLabel = (levelName?: string, positionTitle?: string) => {
		const safePosition = positionTitle || "Unknown Position";
		return levelName ? `${levelName} • ${safePosition}` : safePosition;
	};

	const clearJobAction = () => {
		updateJobSearchParams((next) => {
			next.delete("jobAction");
			next.delete("jobId");
		});
	};

	const openJobAction = (nextAction: string, nextId?: string) => {
		updateJobSearchParams((next) => {
			next.set("jobAction", nextAction);
			if (nextId) next.set("jobId", nextId);
			else next.delete("jobId");
			if (!next.get("jobLimit")) next.set("jobLimit", "10");
			if (!next.get("jobPage")) next.set("jobPage", "1");
		});
	};

	const handleSearch = (query: string) => {
		updateJobSearchParams((next) => {
			if (query) next.set("jobSearch", query);
			else next.delete("jobSearch");
			next.set("jobPage", "1");
			if (!next.get("jobAction")) next.set("jobAction", "list");
		});
	};

	const handleFilterChange = (newFilters: Record<string, string>) => {
		updateJobSearchParams((next) => {
			if (newFilters.jobStatus) next.set("jobStatus", newFilters.jobStatus);
			else next.delete("jobStatus");
			if (newFilters.jobType) next.set("jobType", newFilters.jobType);
			else next.delete("jobType");
			if (newFilters.jobLocation) next.set("jobLocation", newFilters.jobLocation);
			else next.delete("jobLocation");
			next.set("jobPage", "1");
			if (!next.get("jobAction")) next.set("jobAction", "list");
		});
	};

	const handlePageChange = (page: number) => {
		updateJobSearchParams((next) => {
			next.set("jobPage", page.toString());
			if (!next.get("jobAction")) next.set("jobAction", "list");
		});
	};

	const handleRestore = (job: Job) => {
		if (!confirm("Are you sure you want to restore this job opening?")) return;
		restoreJobMutation.mutate(job.id);
	};

	const onSubmit = (data: JobFormData) => {
		if (blocksJobSave) {
			toast.error(
				availableHeadcount && availableHeadcount > 0
					? `Only ${availableHeadcount} hiring slot${
							availableHeadcount === 1 ? "" : "s"
						} available for this role.`
					: "This role has no available hiring capacity under recruitment settings.",
			);
			return;
		}

		const payload: JobFormData = {
			...data,
			departmentId: selectedDepartmentId,
			sectionId: selectedSectionId,
			levelId: requiresLevel ? data.levelId || null : null,
		};

		if (isEditing && activeJob) {
			updateJobMutation.mutate(
				{ id: activeJob.id, data: payload },
				{
					onSuccess: () => {
						openJobAction("list");
						reset();
					},
				},
			);
			return;
		}

		createJobMutation.mutate(payload, {
			onSuccess: () => {
				openJobAction("list");
				reset();
			},
		});
	};

	const confirmDelete = () => {
		if (!activeJob) return;
		deleteJobMutation.mutate(activeJob.id, {
			onSuccess: () => openJobAction("list"),
		});
	};

	const columns: Column<Job>[] = [
		{
			key: "position",
			label: "Position",
			width: "280px",
			render: (_value, item) => {
				const positionTitle =
					item.position?.title ||
					positions.find((position: any) => position.id === item.positionId)?.title ||
					"Unknown Position";
				const levelName =
					item.level?.name ||
					levels.find((level: any) => level.id === item.levelId)?.name ||
					"";
				const sectionName =
					item.section?.name ||
					positions.find((position: any) => position.id === item.positionId)?.section
						?.name ||
					"";
				return (
					<div className="min-w-0">
						<div className="truncate font-medium text-gray-900">
							{formatLevelPositionLabel(levelName, positionTitle)}
						</div>
						{sectionName ? (
							<div className="truncate text-xs text-gray-500">{sectionName}</div>
						) : null}
					</div>
				);
			},
		},
		{
			key: "headcountRequested",
			label: "Target",
			width: "110px",
			render: (_value, item) => (
				<div className="flex items-center gap-2 text-sm font-medium text-gray-900">
					<Target className="h-3.5 w-3.5 text-orange-500" />
					<span>{getTargetCount(item)}</span>
				</div>
			),
		},
		{
			key: "type",
			label: "Type",
			width: "140px",
			render: (_value, item) => (
				<div className="flex items-center gap-2 text-sm text-gray-600">
					<Briefcase className="w-3 h-3" />
					<span className="capitalize">
						{item.type?.replace("_", " ").toLowerCase() || "-"}
					</span>
				</div>
			),
		},
		{
			key: "createdAt",
			label: "Created",
			width: "140px",
			render: (_value, item) => (
				<span className="text-sm text-gray-500">{formatDateTime(item.createdAt)}</span>
			),
		},
		{
			key: "status",
			label: "Status",
			width: "110px",
			render: (_value, item) => (
				<Badge variant={item.isDeleted ? "secondary" : "success"}>
					{item.isDeleted ? "Archived" : "Active"}
				</Badge>
			),
		},
	];

	const renderActions = (item: Job) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => openJobAction("view", item.id)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openJobAction("edit", item.id)}>
					<Edit className="h-4 w-4 mr-2" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{item.isDeleted ? (
					<DropdownMenuItem onClick={() => handleRestore(item)}>
						<Plus className="h-4 w-4 mr-2" /> Restore
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						onClick={() => openJobAction("delete", item.id)}
						className="text-red-600">
						<Trash2 className="h-4 w-4 mr-2" /> Archive
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const isDeepLinkLoading = !!activeJobId && isLoadingJob;

	return (
		<Modal
			open={isManagerOpen}
			onOpenChange={(open) => {
				if (!open) clearJobAction();
			}}
			title={
				jobAction === "create"
					? "Create Job Opening"
					: jobAction === "edit"
						? "Edit Job Opening"
						: jobAction === "view"
							? "Job Details"
							: jobAction === "delete"
								? "Archive Job Opening"
								: "Manage Jobs"
			}
			description={
				jobAction === "list"
					? "Manage job listings and recruitment positions without leaving Recruitment."
					: "Keep job management inside the Recruitment workspace."
			}
			className="w-[min(96vw,940px)] sm:max-w-[940px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
			{jobAction === "list" ? (
				<div className="space-y-4">
					<DataTable
						title="Job Openings"
						description="Search, filter, create, and manage recruitment positions."
						data={items}
						columns={columns}
						filters={filterOptions}
						onAdd={() => openJobAction("create")}
						renderActions={renderActions}
						isLoading={isLoading}
						emptyMessage="No job openings found"
						emptyDescription="Get started by creating your first job opening."
						searchWidth="w-full md:w-80"
						searchPlaceholder="Search positions..."
						itemsPerPage={jobLimit}
						currentPage={jobPage}
						totalItems={totalItems}
						onSearch={handleSearch}
						onFilterChange={handleFilterChange}
						onPageChange={handlePageChange}
						searchValue={jobSearch || ""}
						addButtonLabel="Create Job"
						noCard
					/>
					<div className="flex justify-end border-t border-border pt-3">
						<Button type="button" variant="outline" size="sm" onClick={clearJobAction}>
							Close
						</Button>
					</div>
				</div>
			) : null}

			{isFormOpen ? (
				isDeepLinkLoading && isEditing ? (
					<div className="py-8 flex justify-center text-gray-500">
						<Loader2 className="w-8 h-8 animate-spin" />
					</div>
				) : (
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Position *
								</label>
								<input
									type="hidden"
									aria-hidden="true"
									{...register("positionId")}
								/>
								<Select
									options={positionOptions}
									value={watchedPositionId || ""}
									onChange={(value) => {
										const nextPosition = positions.find(
											(position: any) => position.id === value,
										);
										setValue("departmentId", nextPosition?.departmentId || null, {
											shouldDirty: true,
										});
										setValue(
											"sectionId",
											nextPosition?.section?.id || nextPosition?.sectionId || null,
											{ shouldDirty: true },
										);
										setValue("levelId", null, {
											shouldValidate: true,
											shouldDirty: true,
										});
										setValue("positionId", value || "", {
											shouldValidate: true,
											shouldDirty: true,
										});
									}}
									placeholder={
										isLoadingPositions ? "Loading..." : "Select Position"
									}
									disabled={isLoadingPositions}
									error={Boolean(errors.positionId)}
								/>
								{errors.positionId?.message ? (
									<p className="mt-1 text-sm text-red-600">
										{errors.positionId.message}
									</p>
								) : null}
							</div>
							{requiresLevel ? (
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Level
									</label>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("levelId")}
									/>
									<Select
										options={levelOptions}
										value={watchedLevelId || ""}
										onChange={(value) =>
											setValue("levelId", value || null, {
												shouldValidate: true,
												shouldDirty: true,
											})
										}
										placeholder={isLoadingLevels ? "Loading..." : "Select level"}
										disabled={isLoadingLevels}
										error={Boolean(errors.levelId)}
									/>
									{errors.levelId?.message ? (
										<p className="mt-1 text-sm text-red-600">
											{errors.levelId.message}
										</p>
									) : null}
								</div>
							) : null}
						</div>

						<div
							className={`rounded-xl border p-4 ${
								capacityTone === "danger"
									? "border-red-200 bg-red-50 text-red-900"
									: capacityTone === "warning"
										? "border-amber-200 bg-amber-50 text-amber-900"
										: capacityTone === "ready"
											? "border-emerald-200 bg-emerald-50 text-emerald-900"
											: "border-gray-200 bg-white text-gray-700"
							}`}>
							<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
								<div className="flex items-start gap-3">
									{capacityTone === "ready" ? (
										<CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
									) : capacityTone === "danger" || capacityTone === "warning" ? (
										<CircleAlert
											className={`mt-0.5 h-4 w-4 ${
												capacityTone === "danger"
													? "text-red-700"
													: "text-amber-700"
											}`}
										/>
									) : (
										<Target className="mt-0.5 h-4 w-4 text-gray-500" />
									)}
									<div>
										<p className="text-sm font-semibold">
											Recruitment capacity
										</p>
										<p className="mt-1 text-sm">
											{!recruitmentContextEnabled
												? "Select a position to check current hiring capacity."
												: isLoadingRecruitmentContext
													? "Checking current headcount and target..."
													: hasRecruitmentPolicy
														? `Current ${currentHeadcount} / Target ${targetHeadcount}. Available ${
																availableHeadcount ?? 0
															}.`
														: "No active recruitment policy matches this position."}
										</p>
										{blocksJobSave ? (
											<p className="mt-1 text-sm font-medium">
												Blocking rule: lower the job headcount or raise the
												recruitment target in settings.
											</p>
										) : isOverCapacity ? (
											<p className="mt-1 text-sm font-medium">
												Warn-only rule: HR can continue, but this exceeds the
												configured capacity.
											</p>
										) : null}
									</div>
								</div>
								<div className="grid grid-cols-3 gap-2 text-center text-sm md:min-w-[260px]">
									<div className="rounded-lg border border-current/10 bg-white/60 px-3 py-2">
										<p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
											Current
										</p>
										<p className="text-lg font-semibold">{currentHeadcount}</p>
									</div>
									<div className="rounded-lg border border-current/10 bg-white/60 px-3 py-2">
										<p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
											Target
										</p>
										<p className="text-lg font-semibold">
											{targetHeadcount || "-"}
										</p>
									</div>
									<div className="rounded-lg border border-current/10 bg-white/60 px-3 py-2">
										<p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
											Available
										</p>
										<p className="text-lg font-semibold">
											{availableHeadcount ?? "-"}
										</p>
									</div>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Target Headcount *
								</label>
								<Input
									type="number"
									min={1}
									step={1}
									placeholder="Enter target headcount"
									aria-invalid={Boolean(errors.headcountRequested)}
									{...register("headcountRequested", {
										setValueAs: (value) =>
											value === "" || value === null ? undefined : value,
									})}
								/>
								{errors.headcountRequested?.message ? (
									<p className="mt-1 text-sm text-red-600">
										{errors.headcountRequested.message}
									</p>
								) : null}
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Job Type
								</label>
								<Select
									options={typeOptions}
									value={watchedType || "FULL_TIME"}
									onChange={(value) => setValue("type", value || null)}
									placeholder="Select Type"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Location
								</label>
								<Select
									options={locationOptions}
									value={watchedLocation || "ONSITE"}
									onChange={(value) => setValue("location", value || null)}
									placeholder="Select Location"
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Description
							</label>
							<Input
								placeholder="Brief description of the role..."
								aria-invalid={Boolean(errors.description)}
								{...register("description")}
							/>
							{errors.description?.message ? (
								<p className="mt-1 text-sm text-red-600">
									{errors.description.message}
								</p>
							) : null}
						</div>

						<div className="flex justify-end gap-3 pt-2 border-t border-border">
							<Button
								type="button"
								variant="outline"
								onClick={() => openJobAction("list")}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									createJobMutation.isPending ||
									updateJobMutation.isPending ||
									blocksJobSave
								}>
								{createJobMutation.isPending || updateJobMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : isEditing ? (
									"Update Job"
								) : (
									"Create Job"
								)}
							</Button>
						</div>
					</form>
				)
			) : null}

			{isViewing ? (
				isDeepLinkLoading ? (
					<div className="py-8 flex justify-center text-gray-500">
						<Loader2 className="w-8 h-8 animate-spin" />
					</div>
				) : activeJob ? (
					<div className="space-y-6">
						<div className="flex items-start justify-between">
							<div>
								{(() => {
									const positionTitle =
										activeJob.position?.title ||
										positions.find(
											(position: any) => position.id === activeJob.positionId,
										)?.title ||
										"Unknown Position";
									const levelName =
										activeJob.level?.name ||
										levels.find((level: any) => level.id === activeJob.levelId)
											?.name ||
										"";
									return (
										<h3 className="text-lg font-bold text-gray-900">
											{formatLevelPositionLabel(levelName, positionTitle)}
										</h3>
									);
								})()}
								<p className="text-sm text-gray-500 capitalize">
									{activeJob.type?.replace("_", " ").toLowerCase() || "job"}
								</p>
							</div>
							<Badge variant={activeJob.isDeleted ? "secondary" : "success"}>
								{activeJob.isDeleted ? "Archived" : "Active"}
							</Badge>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
								<div className="text-xs text-orange-700 uppercase tracking-wider mb-1">
									Target Count
								</div>
								<div className="flex items-center gap-2 font-semibold text-orange-900">
									<Target className="h-4 w-4 text-orange-600" />
									<span>{getTargetCount(activeJob)} people</span>
								</div>
							</div>
							<div className="p-3 bg-gray-50 rounded-lg border">
								<div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
									Type
								</div>
								<div className="flex items-center gap-2 font-medium">
									<Briefcase className="w-4 h-4 text-gray-400" />
									<span className="capitalize">
										{activeJob.type?.replace("_", " ").toLowerCase() || "-"}
									</span>
								</div>
							</div>
							<div className="p-3 bg-gray-50 rounded-lg border">
								<div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
									Location
								</div>
								<div className="flex items-center gap-2 font-medium">
									<MapPin className="w-4 h-4 text-gray-400" />
									<span className="capitalize">
										{activeJob.location?.toLowerCase() || "-"}
									</span>
								</div>
							</div>
						</div>

						<div>
							<div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
								Description
							</div>
							<div className="p-4 bg-gray-50 rounded-lg border text-sm text-gray-700 min-h-[100px]">
								{activeJob.description || "No description provided."}
							</div>
						</div>

						<div className="flex justify-end gap-3 pt-4 border-t border-border">
							<Button variant="outline" onClick={() => openJobAction("list")}>
								Close
							</Button>
							<Button onClick={() => openJobAction("edit", activeJob.id)}>
								Edit Job
							</Button>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						<div className="py-8 text-center text-gray-500">Job not found</div>
						<div className="flex justify-end border-t border-border pt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => openJobAction("list")}>
								Back
							</Button>
						</div>
					</div>
				)
			) : null}

			{isDeleting ? (
				activeJob ? (
					<div className="space-y-4">
						<div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
							<p>
								Archiving this job will hide it from the public job board and new
								applicants. Existing applications will not be deleted.
							</p>
						</div>
						<div className="flex justify-end gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => openJobAction("list")}>
								Cancel
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={confirmDelete}
								disabled={deleteJobMutation.isPending}>
								{deleteJobMutation.isPending ? "Archiving..." : "Archive Job"}
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">Loading...</div>
				)
			) : null}
		</Modal>
	);
}
