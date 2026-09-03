import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import {
	Edit,
	Eye,
	FileText,
	GitBranch,
	GripVertical,
	Loader2,
	MoreVertical,
	Trash2,
	Users,
	Wallet,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { CategoricalText } from "~/components/atoms/CategoricalText";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { ConfigurationEmptyGuide } from "~/components/molecules/ConfigurationEmptyGuide";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	useCreateWorkflowInstance,
	useDeleteWorkflowInstance,
	useUpdateWorkflowInstance,
	useWorkflowInstance,
	useWorkflowInstances,
} from "~/lib/hooks/useWorkflowEngine";
import { formatDateForExport, formatDateTime } from "~/lib/utils/text-utils";
import { buildDatedCsvFilename, downloadCsvFile } from "~/lib/utils/csv-export";
import { HR_MODAL_STANDARD_CLASS, HR_MODAL_WIDE_CLASS } from "~/lib/ui/admin-configuration-modal";
import { useAdminFormErrorNavigation } from "~/lib/ui/admin-configuration-form";
import type { RequestType } from "~/services/requests.service";
import type {
	CreateWorkflowInstanceRequest,
	UpdateWorkflowInstanceRequest,
	WorkflowAssigneeType,
	WorkflowDomain,
	WorkflowInstance,
	WorkflowRuntimeState,
	WorkflowRuntimeStep,
	WorkflowStepType,
} from "~/services/workflow-engine.service";
import type { ExportScope } from "~/components/molecules/ExportScopeModal";

const DOMAIN_CARDS = [
	{
		value: "REQUEST" as WorkflowDomain,
		label: "Request",
		description: "Leave, overtime, documents, timesheets, and other employee requests.",
		helper: "Use request type scoping when the template should only apply to one request category.",
		icon: FileText,
		accentClass: "from-slate-900 via-slate-800 to-slate-700",
	},
	{
		value: "RECRUITMENT" as WorkflowDomain,
		label: "Recruitment",
		description:
			"Keep requisition approval and applicant pipeline flows under one clean domain.",
		helper: "Create separate templates by code and name for requisition and applicant scenarios.",
		icon: Users,
		accentClass: "from-emerald-700 via-emerald-600 to-teal-500",
	},
	{
		value: "PAYROLL" as WorkflowDomain,
		label: "Payroll",
		description: "Use this for payslip release approvals and future payroll workflow controls.",
		helper: "Start with payslip release templates, then add more payroll templates later under the same domain.",
		icon: Wallet,
		accentClass: "from-amber-600 via-orange-500 to-rose-500",
	},
];

const DOMAIN_OPTIONS: SelectOption[] = DOMAIN_CARDS.map((domain) => ({
	value: domain.value,
	label: domain.label,
}));

const REQUEST_TYPE_OPTIONS: SelectOption[] = [
	{ value: "LEAVE", label: "Leave Request" },
	{ value: "OVERTIME", label: "Overtime" },
	{ value: "TIME_ADJUSTMENT", label: "Time Adjustment" },
	{ value: "TIMESHEET", label: "Timesheet" },
	{ value: "DOCUMENT_REQUEST", label: "Document Request" },
	{ value: "EXPENSE_REIMBURSEMENT", label: "Expense Reimbursement" },
	{ value: "PROMOTION", label: "Promotion" },
	{ value: "SALARY_CHANGE", label: "Salary Change" },
	{ value: "TRANSFER", label: "Transfer" },
	{ value: "TERMINATION", label: "Termination" },
	{ value: "REGULARIZATION", label: "Regularization" },
	{ value: "RESIGNATION", label: "Resignation" },
	{ value: "OTHER", label: "Other" },
];

const STEP_TYPE_OPTIONS: SelectOption[] = [
	{ value: "SUBMISSION", label: "Submission" },
	{ value: "APPROVAL", label: "Approval" },
	{ value: "TASK", label: "Task" },
];

const ASSIGNEE_TYPE_OPTIONS: SelectOption[] = [
	{ value: "REQUESTER", label: "Requester" },
	{ value: "SUPERVISOR", label: "Supervisor" },
	{ value: "TARGET_DEPARTMENT_MANAGER", label: "Target Department Manager" },
	{ value: "HR", label: "HR" },
	{ value: "SYSTEM", label: "System" },
];

type WorkflowStateDraft = WorkflowRuntimeState & {
	id: string;
};

type WorkflowStepDraft = WorkflowRuntimeStep & {
	id: string;
};

interface WorkflowInstanceFormData {
	code: string;
	name: string;
	description: string;
	domain: WorkflowDomain;
	requestType: string;
	currentStateKey: string;
	stateHistoryJson: string;
}

const EMPTY_FORM: WorkflowInstanceFormData = {
	code: "",
	name: "",
	description: "",
	domain: "REQUEST",
	requestType: "",
	currentStateKey: "",
	stateHistoryJson: "[]",
};

const makeId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toCodeCandidate = (name: string) => {
	const words = name.trim().split(/\s+/).filter(Boolean);

	if (words.length === 0) return "";
	if (words.length === 1) {
		return words[0]
			.replace(/[^A-Za-z0-9]/g, "")
			.slice(0, 12)
			.toUpperCase();
	}

	return words
		.map((word) => word.replace(/[^A-Za-z0-9]/g, "").charAt(0))
		.join("")
		.slice(0, 12)
		.toUpperCase();
};

const stringifyJson = (value: unknown, fallback = "[]") => {
	try {
		return JSON.stringify(value ?? JSON.parse(fallback), null, 2);
	} catch {
		return fallback;
	}
};

const formatStateLabelFromKey = (value: string) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const parseStateDrafts = (value: WorkflowInstance["states"]): WorkflowStateDraft[] => {
	if (!Array.isArray(value)) return [];
	return value.map((item, index) => ({
		id: makeId(),
		key: String((item as any)?.key || `STATE_${index + 1}`),
		label: String(
			(item as any)?.label ||
				formatStateLabelFromKey((item as any)?.key || `STATE_${index + 1}`) ||
				`State ${index + 1}`,
		),
		order: Number.isFinite(Number((item as any)?.order)) ? Number((item as any)?.order) : index,
		isTerminal: Boolean((item as any)?.isTerminal),
	}));
};

const parseStepDrafts = (value: WorkflowInstance["steps"]): WorkflowStepDraft[] => {
	if (!Array.isArray(value)) return [];
	return value.map((item, index) => ({
		id: makeId(),
		step_number: Number.isFinite(Number((item as any)?.step_number))
			? Number((item as any)?.step_number)
			: index + 1,
		step_name: String((item as any)?.step_name || `Step ${index + 1}`),
		step_type: ((item as any)?.step_type || "TASK") as WorkflowStepType,
		assignee_type: ((item as any)?.assignee_type || "HR") as WorkflowAssigneeType,
		assignee_role: (item as any)?.assignee_role || "",
		is_required: (item as any)?.is_required !== false,
		state_on_enter: ((item as any)?.state_on_enter as string | undefined) || "",
		state_on_approve: ((item as any)?.state_on_approve as string | undefined) || "",
		state_on_reject: ((item as any)?.state_on_reject as string | undefined) || "",
		state_on_complete: ((item as any)?.state_on_complete as string | undefined) || "",
		state_on_skip: ((item as any)?.state_on_skip as string | undefined) || "",
	}));
};

const normalizeStateDrafts = (states: WorkflowStateDraft[]): WorkflowStateDraft[] =>
	states.map((state, index) => ({
		...state,
		order: index,
		key: state.key.trim().toUpperCase(),
		label: formatStateLabelFromKey(state.key) || state.label.trim() || `State ${index + 1}`,
	}));

const normalizeStepDrafts = (steps: WorkflowStepDraft[]): WorkflowStepDraft[] =>
	steps.map((step, index) => ({
		...step,
		step_number: index + 1,
		step_name: step.step_name.trim(),
		assignee_role: step.assignee_role?.trim() || "",
		state_on_enter: step.state_on_enter?.trim() || "",
		state_on_approve: step.state_on_approve?.trim() || "",
		state_on_reject: step.state_on_reject?.trim() || "",
		state_on_complete: step.state_on_complete?.trim() || "",
		state_on_skip: step.state_on_skip?.trim() || "",
	}));

const buildStateOptions = (states: WorkflowStateDraft[]): SelectOption[] =>
	states.map((state) => ({
		value: state.key,
		label: `${state.key} · ${state.label}`,
	}));

const formatDomainLabel = (domain: string) =>
	domain
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0) + part.slice(1).toLowerCase())
		.join(" ");

const getDomainCard = (domain: WorkflowDomain) =>
	DOMAIN_CARDS.find((item) => item.value === domain) || DOMAIN_CARDS[0];

type WorkflowsPageProps = {
	rulesPolicyMode?: boolean;
};

export default function WorkflowsPage({ rulesPolicyMode = false }: WorkflowsPageProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const codeManuallyEditedRef = useRef(false);
	const [stateDrafts, setStateDrafts] = useState<WorkflowStateDraft[]>([]);
	const [stepDrafts, setStepDrafts] = useState<WorkflowStepDraft[]>([]);
	const [draggedStateId, setDraggedStateId] = useState<string | null>(null);
	const [draggedStepId, setDraggedStepId] = useState<string | null>(null);

	const searchQuery = searchParams.get("search") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const action = searchParams.get("action");
	const id = searchParams.get("id");
	const activeWorkflowInstanceId =
		action === "edit" || action === "view" || action === "delete" ? id : null;

	const { data: workflowInstancesData, isLoading } = useWorkflowInstances({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		templateOnly: true,
		count: true,
		document: true,
		pagination: true,
	});
	const { refetch: refetchExportWorkflowInstances } = useWorkflowInstances(
		{
			page: 1,
			limit: 1000,
			query: searchQuery,
			templateOnly: true,
			count: true,
			document: true,
			pagination: true,
		},
		{ enabled: false },
	);
	const { data: activeWorkflowInstance, isLoading: isLoadingWorkflowInstance } =
		useWorkflowInstance(activeWorkflowInstanceId || "");

	const createWorkflowInstanceMutation = useCreateWorkflowInstance();
	const updateWorkflowInstanceMutation = useUpdateWorkflowInstance();
	const deleteWorkflowInstanceMutation = useDeleteWorkflowInstance();

	const items = workflowInstancesData?.workflowInstances || [];
	const pagination = workflowInstancesData?.pagination;

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		setError,
		clearErrors,
		watch,
		formState: { errors },
	} = useForm<WorkflowInstanceFormData>({
		defaultValues: EMPTY_FORM,
	});

	const watchedDomain = watch("domain") || "REQUEST";
	const watchedRequestType = watch("requestType") || "";
	const watchedName = watch("name") || "";
	const watchedCode = watch("code") || "";
	const watchedDescription = watch("description") || "";
	const watchedCurrentStateKey = watch("currentStateKey") || "";
	const stateOptions = useMemo(() => buildStateOptions(stateDrafts), [stateDrafts]);
	const handleInvalidSubmit = useAdminFormErrorNavigation();

	useEffect(() => {
		if (action === "edit" && activeWorkflowInstance) {
			codeManuallyEditedRef.current = true;
			const nextStates = parseStateDrafts(activeWorkflowInstance.states);
			const nextSteps = parseStepDrafts(activeWorkflowInstance.steps);

			setStateDrafts(normalizeStateDrafts(nextStates));
			setStepDrafts(normalizeStepDrafts(nextSteps));
			reset({
				code: activeWorkflowInstance.code || "",
				name: activeWorkflowInstance.name || "",
				description: activeWorkflowInstance.description || "",
				domain: activeWorkflowInstance.domain,
				requestType: activeWorkflowInstance.requestType || "",
				currentStateKey: activeWorkflowInstance.currentStateKey || nextStates[0]?.key || "",
				stateHistoryJson: stringifyJson(activeWorkflowInstance.stateHistory),
			});
		}
	}, [action, activeWorkflowInstance, reset]);

	useEffect(() => {
		if (action !== "create") return;
		if (codeManuallyEditedRef.current) return;

		const nextCode = toCodeCandidate(watchedName);
		if (nextCode && nextCode !== watchedCode) {
			setValue("code", nextCode, { shouldDirty: true });
		}
		if (!watchedName.trim() && watchedCode) {
			setValue("code", "", { shouldDirty: true });
		}
	}, [action, watchedName, watchedCode, setValue]);

	useEffect(() => {
		if (!stateDrafts.some((state) => state.key === watchedCurrentStateKey)) {
			setValue("currentStateKey", stateDrafts[0]?.key || "", { shouldDirty: true });
		}
	}, [stateDrafts, watchedCurrentStateKey, setValue]);

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const resetDraftEditors = () => {
		setStateDrafts([]);
		setStepDrafts([]);
		setValue("currentStateKey", "", { shouldDirty: true });
	};

	const clearModalState = () => {
		codeManuallyEditedRef.current = false;
		reset(EMPTY_FORM);
		resetDraftEditors();
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	const openCreateDomainPicker = () => {
		codeManuallyEditedRef.current = false;
		reset(EMPTY_FORM);
		resetDraftEditors();
		updateSearchParams((next) => {
			next.set("action", "choose-domain");
			next.delete("id");
		});
	};

	const openCreate = (domain: WorkflowDomain) => {
		codeManuallyEditedRef.current = false;
		reset({ ...EMPTY_FORM, domain });
		resetDraftEditors();
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const openEdit = (workflowInstance: WorkflowInstance) => {
		updateSearchParams((next) => {
			next.set("action", "edit");
			next.set("id", workflowInstance.id);
		});
	};

	const handleView = (workflowInstance: WorkflowInstance) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", workflowInstance.id);
		});
	};

	const handleDelete = (workflowInstance: WorkflowInstance) => {
		updateSearchParams((next) => {
			next.set("action", "delete");
			next.set("id", workflowInstance.id);
		});
	};

	const handleDomainSelect = (domain: WorkflowDomain) => {
		setValue("domain", domain, { shouldDirty: true, shouldValidate: true });
		if (domain !== "REQUEST") {
			setValue("requestType", "", { shouldDirty: true });
		}
	};

	const updateStateDraft = <K extends keyof WorkflowStateDraft>(
		id: string,
		key: K,
		value: WorkflowStateDraft[K],
	) => {
		setStateDrafts((current) =>
			normalizeStateDrafts(
				current.map((state) => (state.id === id ? { ...state, [key]: value } : state)),
			),
		);
	};

	const updateStepDraft = <K extends keyof WorkflowStepDraft>(
		id: string,
		key: K,
		value: WorkflowStepDraft[K],
	) => {
		setStepDrafts((current) =>
			normalizeStepDrafts(
				current.map((step) => (step.id === id ? { ...step, [key]: value } : step)),
			),
		);
	};

	const addStateDraft = () => {
		setStateDrafts((current) =>
			normalizeStateDrafts([
				...current,
				{
					id: makeId(),
					key: `STATE_${current.length + 1}`,
					label: formatStateLabelFromKey(`STATE_${current.length + 1}`),
					order: current.length,
					isTerminal: false,
				},
			]),
		);
	};

	const removeStateDraft = (id: string) => {
		setStateDrafts((current) =>
			normalizeStateDrafts(current.filter((state) => state.id !== id)),
		);
	};

	const addStepDraft = () => {
		setStepDrafts((current) =>
			normalizeStepDrafts([
				...current,
				{
					id: makeId(),
					step_number: current.length + 1,
					step_name: `Step ${current.length + 1}`,
					step_type: "TASK",
					assignee_type: "HR",
					assignee_role: "",
					is_required: true,
					state_on_enter: "",
					state_on_approve: "",
					state_on_reject: "",
					state_on_complete: "",
					state_on_skip: "",
				},
			]),
		);
	};

	const removeStepDraft = (id: string) => {
		setStepDrafts((current) => normalizeStepDrafts(current.filter((step) => step.id !== id)));
	};

	const reorderDraftItems = <T extends { id: string }>(
		items: T[],
		activeId: string,
		overId: string,
	) => {
		const activeIndex = items.findIndex((item) => item.id === activeId);
		const overIndex = items.findIndex((item) => item.id === overId);
		if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
			return items;
		}
		const next = [...items];
		const [moved] = next.splice(activeIndex, 1);
		next.splice(overIndex, 0, moved);
		return next;
	};

	const onSubmit = (data: WorkflowInstanceFormData) => {
		clearErrors(["requestType", "currentStateKey", "stateHistoryJson"]);

		if (data.domain === "REQUEST" && !data.requestType.trim()) {
			setError("requestType", {
				type: "manual",
				message: "Select a request type.",
			});
			return;
		}

		if (stateDrafts.length === 0) {
			setError("currentStateKey", {
				type: "manual",
				message: "Add at least one workflow state.",
			});
			return;
		}

		if (stepDrafts.length === 0) {
			setError("currentStateKey", {
				type: "manual",
				message: "Add at least one workflow step.",
			});
			return;
		}

		let parsedStateHistory: unknown[] = [];
		try {
			const stateHistoryValue = JSON.parse(data.stateHistoryJson || "[]");
			parsedStateHistory = Array.isArray(stateHistoryValue) ? stateHistoryValue : [];
		} catch {
			setError("stateHistoryJson", {
				type: "manual",
				message: "State history must be valid JSON.",
			});
			return;
		}

		const normalizedStates = normalizeStateDrafts(stateDrafts);
		const normalizedSteps = normalizeStepDrafts(stepDrafts);
		const knownStateKeys = new Set(normalizedStates.map((state) => state.key));

		const invalidStep = normalizedSteps.find(
			(step) =>
				(step.state_on_enter && !knownStateKeys.has(step.state_on_enter)) ||
				(step.state_on_approve && !knownStateKeys.has(step.state_on_approve)) ||
				(step.state_on_reject && !knownStateKeys.has(step.state_on_reject)) ||
				(step.state_on_complete && !knownStateKeys.has(step.state_on_complete)) ||
				(step.state_on_skip && !knownStateKeys.has(step.state_on_skip)),
		);

		if (invalidStep) {
			setError("currentStateKey", {
				type: "manual",
				message: "Each step transition must point to a configured state.",
			});
			return;
		}

		if (!knownStateKeys.has(data.currentStateKey)) {
			setError("currentStateKey", {
				type: "manual",
				message: "Current state must match one of the configured states.",
			});
			return;
		}

		const payload: CreateWorkflowInstanceRequest | UpdateWorkflowInstanceRequest = {
			code: data.code.trim() || undefined,
			name: data.name.trim() || undefined,
			description: data.description.trim() || undefined,
			domain: data.domain,
			requestType: data.requestType.trim() || undefined,
			currentStateKey: data.currentStateKey,
			steps: normalizedSteps.map(({ id: _id, ...step }) => step),
			states: normalizedStates.map(({ id: _id, ...state }) => state),
			stateHistory: parsedStateHistory,
		};

		if (action === "edit" && activeWorkflowInstance) {
			updateWorkflowInstanceMutation.mutate(
				{ id: activeWorkflowInstance.id, payload },
				{
					onSuccess: () => {
						clearModalState();
					},
				},
			);
			return;
		}

		createWorkflowInstanceMutation.mutate(payload as CreateWorkflowInstanceRequest, {
			onSuccess: () => {
				clearModalState();
			},
		});
	};

	const confirmDelete = () => {
		if (!activeWorkflowInstance) return;
		deleteWorkflowInstanceMutation.mutate(activeWorkflowInstance.id, {
			onSuccess: () => {
				clearModalState();
			},
		});
	};

	const exportWorkflowInstancesToCsv = async ({
		scope,
		currentItems,
	}: {
		scope: ExportScope;
		currentItems: WorkflowInstance[];
	}) => {
		const exportItems =
			scope === "current"
				? currentItems
				: (await refetchExportWorkflowInstances()).data?.workflowInstances || [];

		downloadCsvFile(
			buildDatedCsvFilename("workflow-templates"),
			["Code", "Name", "Domain", "Current State", "Created At", "Updated At"],
			exportItems.map((item) => [
				item.code || "",
				item.name || "",
				item.domain || "",
				item.currentStateKey || "",
				formatDateForExport(item.createdAt),
				formatDateForExport(item.updatedAt),
			]),
		);
	};

	const columns: Column<WorkflowInstance>[] = useMemo(
		() => [
			{
				key: "code",
				label: "Code",
				width: "120px",
				render: (value) =>
					value ? (
						<span className="font-mono rounded bg-gray-100 px-2 py-1 text-sm">
							{value}
						</span>
					) : (
						<span className="text-gray-400">-</span>
					),
			},
			{
				key: "name",
				label: "Name",
				width: "220px",
				render: (_, item) => (
					<div className="font-medium text-gray-900">
						{item.name || "Unnamed workflow template"}
					</div>
				),
			},
			{
				key: "domain",
				label: "Domain",
				width: "180px",
				render: (value) => (
					<Badge
						variant="secondary"
						className="border-0 bg-slate-700 text-white hover:bg-slate-700">
						{formatDomainLabel(String(value || ""))}
					</Badge>
				),
			},
			{
				key: "currentStateKey",
				label: "Current State",
				width: "150px",
				render: (value) => <CategoricalText value={String(value || "OPEN")} />,
			},
			{
				key: "createdAt",
				label: "Created",
				width: "170px",
				render: (value) => formatDateTime(value),
			},
			{
				key: "updatedAt",
				label: "Updated",
				width: "170px",
				render: (value) => formatDateTime(value),
			},
		],
		[],
	);

	const renderActions = (item: WorkflowInstance) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-8 w-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="mr-2 h-4 w-4" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => openEdit(item)}>
					<Edit className="mr-2 h-4 w-4" /> Edit
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-600">
					<Trash2 className="mr-2 h-4 w-4" /> Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

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
			next.set("page", String(page));
		});
	};

	const isDeepLinkLoading = !!activeWorkflowInstanceId && isLoadingWorkflowInstance;
	const isSaving =
		createWorkflowInstanceMutation.isPending || updateWorkflowInstanceMutation.isPending;

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<DataTable
				title="Workflow Templates"
				description={
					rulesPolicyMode
						? undefined
						: "Manage organization workflow templates stored as WorkflowInstance records without attached domain records."
				}
				data={items}
				columns={columns}
				renderActions={renderActions}
				isLoading={isLoading}
				emptyMessage="No workflow templates found"
				emptyDescription="Create the first organization workflow template for requests, recruitment, or payroll."
				onAdd={openCreateDomainPicker}
				emptyActions={
					<ConfigurationEmptyGuide
						label="Add workflow template"
						onClick={openCreateDomainPicker}
				containedScroll
					/>
				}
				searchWidth="w-80"
				searchPlaceholder="Search workflow templates..."
				addButtonLabel="Add Workflow Template"
				itemsPerPage={limitParam}
				currentPage={pageParam}
				totalItems={pagination?.total}
				totalPages={pagination?.totalPages}
				onSearch={handleSearch}
				onPageChange={handlePageChange}
				searchValue={searchQuery || ""}
				showFilters={false}
				onExportCSV={exportWorkflowInstancesToCsv}
				noCard={rulesPolicyMode}
				className={rulesPolicyMode ? "rounded-lg border border-gray-200 bg-white p-3" : undefined}
			/>

			<Modal
				open={action === "choose-domain"}
				onOpenChange={(open) => {
					if (!open) clearModalState();
				}}
				title="Choose Workflow Template Domain"
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-4">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						{DOMAIN_CARDS.map((option) => {
							const Icon = option.icon;
							return (
								<button
									key={option.value}
									type="button"
									className="group rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-orange-200 hover:bg-orange-50"
									onClick={() => openCreate(option.value)}>
									<div className="flex items-center gap-3">
										<div
											className="rounded-md border border-gray-200 bg-white p-2 text-orange-600">
											<Icon className="h-5 w-5" />
										</div>
										<div className="text-sm font-semibold text-slate-900">
											{option.label}
										</div>
									</div>
								</button>
							);
						})}
					</div>
					<div className="flex justify-end border-t border-slate-200 pt-4">
						<Button type="button" variant="outline" onClick={clearModalState}>
							Cancel
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={action === "create" || action === "edit"}
				onOpenChange={(open) => {
					if (!open) clearModalState();
				}}
				title={
					isDeepLinkLoading && action === "edit"
						? "Loading Workflow Template..."
						: action === "edit"
							? "Edit Workflow Template"
							: "Create Workflow Template"
				}
				description={
					isDeepLinkLoading && action === "edit"
						? "Fetching workflow template details..."
						: undefined
				}
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading && action === "edit" ? (
					<div className="py-8 text-center text-gray-500">
						Loading workflow template...
					</div>
				) : (
					<form
						onSubmit={handleSubmit(onSubmit, handleInvalidSubmit)}
						className="space-y-5">
						<input type="hidden" {...register("domain")} />
						<input type="hidden" {...register("requestType")} />
						<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
							<div data-field-path="domain">
								<label className="mb-1 block text-sm font-medium text-gray-700">
									Domain *
								</label>
								<Select
									value={watchedDomain}
									onChange={(value) =>
										handleDomainSelect(value as WorkflowDomain)
									}
									options={DOMAIN_OPTIONS}
									error={Boolean(errors.domain)}
								/>
							</div>

							{(() => {
								const domainCard = getDomainCard(watchedDomain);
								const Icon = domainCard.icon;

								return (
									<div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
										<div className="flex items-start gap-3">
											<div
												className="rounded-md border border-gray-200 bg-white p-2 text-orange-600">
												<Icon className="h-5 w-5" />
											</div>
											<div className="min-w-0">
												<div className="text-sm font-semibold text-slate-900">
													{domainCard.label} workflow template
												</div>
											</div>
										</div>
									</div>
								);
							})()}

							{watchedDomain === "REQUEST" ? (
								<div data-field-path="requestType">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Request Type *
									</label>
									<Select
										value={watchedRequestType}
										onChange={(value) =>
											setValue("requestType", value as RequestType, {
												shouldDirty: true,
												shouldValidate: true,
											})
										}
										options={REQUEST_TYPE_OPTIONS}
										placeholder="Select request type"
										error={Boolean(errors.requestType)}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "Required",
												tone: watchedRequestType ? "default" : "invalid",
											},
										]}
									/>
									{errors.requestType?.message ? (
										<p className="mt-1 text-xs text-red-600">
											{errors.requestType.message}
										</p>
									) : null}
								</div>
							) : null}
						</div>

						<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="name">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Name
									</label>
									<Input
										{...register("name")}
										placeholder="Leave request workflow"
										aria-invalid={Boolean(errors.name)}
									/>
									<ConstraintTokenRow
										tokens={[
											{ label: "Optional", tone: "subtle" },
											{
												label: "A-Z",
												tone: watchedName.trim() ? "default" : "subtle",
											},
										]}
									/>
								</div>
								<div data-field-path="code">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Code
									</label>
									<Input
										{...register("code", {
											onChange: () => {
												codeManuallyEditedRef.current = true;
											},
										})}
										placeholder="WF-LEAVE-001"
										aria-invalid={Boolean(errors.code)}
									/>
									<ConstraintTokenRow
										tokens={[
											{ label: "Optional", tone: "subtle" },
											{
												label: "Auto",
												tone: watchedCode.trim() ? "default" : "subtle",
											},
										]}
									/>
								</div>
							</div>

							<div data-field-path="description">
								<label className="mb-1 block text-sm font-medium text-gray-700">
									Description
								</label>
								<Input
									{...register("description")}
									placeholder="Admin-facing workflow summary"
									aria-invalid={Boolean(errors.description)}
								/>
								<ConstraintTokenRow
									tokens={[
										{ label: "Optional", tone: "subtle" },
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

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div data-field-path="currentStateKey">
									<label className="mb-1 block text-sm font-medium text-gray-700">
										Current State *
									</label>
									<input
										type="hidden"
										aria-hidden="true"
										{...register("currentStateKey")}
									/>
									<Select
										value={watchedCurrentStateKey}
										onChange={(value) =>
											setValue("currentStateKey", value, {
												shouldDirty: true,
												shouldValidate: true,
											})
										}
										options={stateOptions}
										placeholder="Select current state"
										error={Boolean(errors.currentStateKey)}
									/>
									<ConstraintTokenRow
										tokens={[
											{
												label: "Match state",
												tone: watchedCurrentStateKey
													? "default"
													: "invalid",
											},
										]}
									/>
									{errors.currentStateKey?.message ? (
										<p className="mt-1 text-xs text-red-600">
											{errors.currentStateKey.message}
										</p>
									) : null}
								</div>
								<div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
									This screen edits org-level templates only. Runtime workflow
									records stay attached to live domain objects and do not appear
									here.
								</div>
							</div>
						</div>

						<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="text-sm font-medium text-gray-900">States</div>
								<Button type="button" variant="outline" onClick={addStateDraft}>
									Add State
								</Button>
							</div>

							<div className="space-y-3">
								{stateDrafts.map((state, index) => (
									<div
										key={state.id}
										draggable
										onDragStart={() => setDraggedStateId(state.id)}
										onDragOver={(event) => {
											event.preventDefault();
											if (!draggedStateId || draggedStateId === state.id)
												return;
											setStateDrafts((current) =>
												normalizeStateDrafts(
													reorderDraftItems(
														current,
														draggedStateId,
														state.id,
													),
												),
											);
											setDraggedStateId(state.id);
										}}
										onDragEnd={() => setDraggedStateId(null)}
										className={`rounded-lg border bg-gray-50 p-3 ${
											draggedStateId === state.id ? "opacity-60" : ""
										}`}>
										<div className="grid grid-cols-1 gap-4 md:grid-cols-[24px_minmax(0,1fr)_160px_44px] md:items-center">
											<div className="flex items-center justify-center text-gray-400">
												<GripVertical className="h-4 w-4" />
											</div>
											<div className="min-w-0 text-center md:text-left">
												<label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
													State Key
												</label>
												<Input
													value={state.key}
													onChange={(event) =>
														updateStateDraft(
															state.id,
															"key",
															event.target.value,
														)
													}
													placeholder="OPEN"
												/>
												<p className="mt-2 break-words text-xs text-gray-500">
													Label preview:{" "}
													<span className="font-medium text-gray-700">
														{formatStateLabelFromKey(state.key) ||
															"State"}
													</span>
												</p>
											</div>
											<label className="flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-700">
												<input
													type="checkbox"
													checked={Boolean(state.isTerminal)}
													onChange={(event) =>
														updateStateDraft(
															state.id,
															"isTerminal",
															event.target.checked,
														)
													}
												/>
												Terminal
											</label>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="h-10 w-10 p-0"
												onClick={() => removeStateDraft(state.id)}
												disabled={stateDrafts.length <= 1}
												title="Remove state"
												aria-label="Remove state">
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
										<div className="mt-3">
											<ConstraintTokenRow
												tokens={[
													{
														label: `#${index + 1}`,
														tone: "default",
													},
													{
														label: state.key.trim()
															? "Key set"
															: "Key required",
														tone: state.key.trim()
															? "subtle"
															: "invalid",
													},
												]}
											/>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="text-sm font-medium text-gray-900">Steps</div>
								<Button type="button" variant="outline" onClick={addStepDraft}>
									Add Step
								</Button>
							</div>

							<div className="space-y-3">
								{stepDrafts.map((step, index) => (
									<div
										key={step.id}
										draggable
										onDragStart={() => setDraggedStepId(step.id)}
										onDragOver={(event) => {
											event.preventDefault();
											if (!draggedStepId || draggedStepId === step.id) return;
											setStepDrafts((current) =>
												normalizeStepDrafts(
													reorderDraftItems(
														current,
														draggedStepId,
														step.id,
													),
												),
											);
											setDraggedStepId(step.id);
										}}
										onDragEnd={() => setDraggedStepId(null)}
										className={`rounded-lg border bg-gray-50 p-3 ${
											draggedStepId === step.id ? "opacity-60" : ""
										}`}>
										<div className="mb-4 flex items-center justify-between gap-3">
											<div className="min-w-0 flex items-center gap-3">
												<div className="text-gray-400">
													<GripVertical className="h-4 w-4" />
												</div>
												<div className="min-w-0">
													<div className="break-words text-sm font-semibold text-gray-900">
														Step {index + 1}
													</div>
												</div>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="h-9 w-9 p-0"
												onClick={() => removeStepDraft(step.id)}
												disabled={stepDrafts.length <= 1}
												title="Remove step"
												aria-label="Remove step">
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>

										<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
											<div className="min-w-0">
												<label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
													Step Name
												</label>
												<Input
													value={step.step_name}
													onChange={(event) =>
														updateStepDraft(
															step.id,
															"step_name",
															event.target.value,
														)
													}
													placeholder="Manager Approval"
												/>
											</div>
											<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
												<div>
													<label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
														Step Type
													</label>
													<Select
														value={step.step_type}
														onChange={(value) =>
															updateStepDraft(
																step.id,
																"step_type",
																value as WorkflowStepType,
															)
														}
														options={STEP_TYPE_OPTIONS}
													/>
												</div>
												<div>
													<label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
														Assignee
													</label>
													<Select
														value={step.assignee_type}
														onChange={(value) =>
															updateStepDraft(
																step.id,
																"assignee_type",
																value as WorkflowAssigneeType,
															)
														}
														options={ASSIGNEE_TYPE_OPTIONS}
													/>
												</div>
											</div>
										</div>

										<div className="mt-4">
											<label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
												<input
													type="checkbox"
													checked={Boolean(step.is_required)}
													onChange={(event) =>
														updateStepDraft(
															step.id,
															"is_required",
															event.target.checked,
														)
													}
												/>
												Required step
											</label>
										</div>

										<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
											<StepStateSelect
												label="State On Enter"
												value={step.state_on_enter || ""}
												options={stateOptions}
												onChange={(value) =>
													updateStepDraft(
														step.id,
														"state_on_enter",
														value,
													)
												}
											/>
											<StepStateSelect
												label="State On Approve"
												value={step.state_on_approve || ""}
												options={stateOptions}
												onChange={(value) =>
													updateStepDraft(
														step.id,
														"state_on_approve",
														value,
													)
												}
											/>
											<StepStateSelect
												label="State On Reject"
												value={step.state_on_reject || ""}
												options={stateOptions}
												onChange={(value) =>
													updateStepDraft(
														step.id,
														"state_on_reject",
														value,
													)
												}
											/>
											<StepStateSelect
												label="State On Complete"
												value={step.state_on_complete || ""}
												options={stateOptions}
												onChange={(value) =>
													updateStepDraft(
														step.id,
														"state_on_complete",
														value,
													)
												}
											/>
											<StepStateSelect
												label="State On Skip"
												value={step.state_on_skip || ""}
												options={stateOptions}
												onChange={(value) =>
													updateStepDraft(step.id, "state_on_skip", value)
												}
											/>
										</div>
									</div>
								))}
							</div>
						</div>

						<input type="hidden" {...register("stateHistoryJson")} />

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button type="button" variant="outline" onClick={clearModalState}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSaving}>
								{isSaving ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : action === "edit" ? (
									"Save Workflow Template"
								) : (
									"Create Workflow Template"
								)}
							</Button>
						</div>
					</form>
				)}
			</Modal>

			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) clearModalState();
				}}
				title={
					isDeepLinkLoading ? "Loading Workflow Template..." : "Workflow Template Details"
				}
				description="Review the current template states, steps, and request scoping."
				className={HR_MODAL_WIDE_CLASS}>
				{isDeepLinkLoading ? (
					<div className="py-8 text-center text-gray-500">
						Loading workflow template...
					</div>
				) : activeWorkflowInstance ? (
					<div className="space-y-6">
						<div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
							<div className="flex items-start gap-3">
								<div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
									<GitBranch className="h-5 w-5 text-gray-700" />
								</div>
								<div className="min-w-0 space-y-1">
									<h3 className="break-words text-lg font-semibold text-gray-900">
										{activeWorkflowInstance.name ||
											activeWorkflowInstance.code ||
											"Workflow Template"}
									</h3>
									<p className="break-words text-sm text-gray-600">
										{activeWorkflowInstance.description ||
											"No description provided."}
									</p>
								</div>
							</div>
						</div>

						{(() => {
							const states = parseStateDrafts(activeWorkflowInstance.states);
							const steps = parseStepDrafts(activeWorkflowInstance.steps);
							const terminalStates = states.filter((state) => state.isTerminal);

							return (
								<>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
										<DetailCard
											label="Code"
											value={activeWorkflowInstance.code || "-"}
											monospace
										/>
										<DetailCard
											label="Current State"
											value={activeWorkflowInstance.currentStateKey || "OPEN"}
										/>
										<DetailCard label="States" value={String(states.length)} />
										<DetailCard label="Steps" value={String(steps.length)} />
									</div>

									<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
										<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-3">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
														Workflow Scope
													</div>
													<div className="mt-1 break-words text-sm font-semibold text-gray-900">
														{formatDomainLabel(
															activeWorkflowInstance.domain,
														)}
													</div>
												</div>
												<Badge
													variant="secondary"
													className="border-0 bg-slate-700 text-white hover:bg-slate-700">
													{activeWorkflowInstance.domainRecordId
														? "Runtime"
														: "Template"}
												</Badge>
											</div>

											<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
												{activeWorkflowInstance.domain === "REQUEST" ? (
													<DetailCard
														label="Request Type"
														value={
															activeWorkflowInstance.requestType ||
															"Not scoped"
														}
													/>
												) : null}
												<DetailCard
													label="Template Scope"
													value={
														activeWorkflowInstance.domainRecordId
															? "Attached to domain record"
															: "Organization-wide template"
													}
												/>
												<DetailCard
													label="Terminal States"
													value={String(terminalStates.length)}
												/>
												<DetailCard
													label="Updated At"
													value={formatDateTime(
														activeWorkflowInstance.updatedAt,
													)}
												/>
											</div>

											<DetailCard
												label="ID"
												value={activeWorkflowInstance.id}
												monospace
											/>
										</div>

										<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-3">
											<div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
												States
											</div>
											<div className="space-y-2">
												{states.map((state) => (
													<div
														key={state.id}
														className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
														<div className="min-w-0">
															<div className="break-all font-mono text-sm text-gray-900">
																{state.key}
															</div>
															<div className="break-words text-xs text-gray-500">
																{formatStateLabelFromKey(
																	state.key,
																) || state.label}
															</div>
														</div>
														<div className="flex flex-wrap items-center gap-2">
															<Badge variant="secondary">
																#{state.order + 1}
															</Badge>
															{state.isTerminal ? (
																<CategoricalText
																	value="Terminal"
																	tone="amber"
																/>
															) : null}
														</div>
													</div>
												))}
											</div>
										</div>
									</div>

									<div className="space-y-4 rounded-lg border border-gray-200 bg-white p-3">
										<div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
											Steps
										</div>
										<div className="space-y-3">
											{steps.map((step) => (
												<div
													key={step.id}
													className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
													<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
														<div className="min-w-0">
															<div className="break-words text-sm font-semibold text-gray-900">
																Step {step.step_number}:{" "}
																{step.step_name}
															</div>
															<div className="mt-1 flex flex-wrap items-center gap-2">
																<Badge variant="secondary">
																	{step.step_type}
																</Badge>
																<CategoricalText
																	value={step.assignee_type}
																	tone="purple"
																/>
																{step.is_required !== false ? (
																	<CategoricalText
																		value="Required"
																		tone="amber"
																	/>
																) : (
																	<CategoricalText value="Optional" />
																)}
															</div>
														</div>
													</div>

													<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
														<TransitionCard
															label="On Enter"
															value={step.state_on_enter || "None"}
														/>
														<TransitionCard
															label="On Approve"
															value={step.state_on_approve || "None"}
														/>
														<TransitionCard
															label="On Reject"
															value={step.state_on_reject || "None"}
														/>
														<TransitionCard
															label="On Complete"
															value={step.state_on_complete || "None"}
														/>
														<TransitionCard
															label="On Skip"
															value={step.state_on_skip || "None"}
														/>
													</div>
												</div>
											))}
										</div>
									</div>
								</>
							);
						})()}

						<div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
							<Button variant="outline" onClick={clearModalState}>
								Close
							</Button>
							<Button onClick={() => openEdit(activeWorkflowInstance)}>
								Edit Workflow Template
							</Button>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-gray-500">
						Workflow instance not found.
					</div>
				)}
			</Modal>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) clearModalState();
				}}
				title="Delete Workflow Template"
				description="This will soft delete the workflow template from the admin list."
				className={HR_MODAL_STANDARD_CLASS}>
				<div className="space-y-4">
					<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{activeWorkflowInstance ? (
							<>
								Delete{" "}
								<span className="font-semibold">
									{activeWorkflowInstance.name ||
										activeWorkflowInstance.code ||
										activeWorkflowInstance.id}
								</span>
								? The template will be marked deleted and removed from this page.
							</>
						) : (
							"Delete this workflow template? The record will be marked deleted."
						)}
					</div>
					<div className="flex justify-end gap-3">
						<Button type="button" variant="outline" onClick={clearModalState}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteWorkflowInstanceMutation.isPending}>
							{deleteWorkflowInstanceMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete Workflow Template"
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}

function StepStateSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: SelectOption[];
	onChange: (value: string) => void;
}) {
	return (
		<div>
			<label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
				{label}
			</label>
			<Select
				value={value}
				onChange={onChange}
				options={[{ value: "", label: "None" }, ...options]}
				placeholder="None"
			/>
		</div>
	);
}

function DetailCard({
	label,
	value,
	monospace = false,
}: {
	label: string;
	value: string;
	monospace?: boolean;
}) {
	return (
		<div className="min-w-0 space-y-1.5 rounded-lg border border-gray-200 bg-white p-3">
			<div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
				{label}
			</div>
			<div
				className={
					monospace
						? "break-all whitespace-normal font-mono text-sm text-gray-900"
						: "break-words whitespace-normal text-sm text-gray-900"
				}>
				{value}
			</div>
		</div>
	);
}

function TransitionCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-gray-200 bg-white px-3 py-3">
			<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
				{label}
			</div>
			<div className="break-all whitespace-normal font-mono text-sm text-gray-900">
				{value}
			</div>
		</div>
	);
}
