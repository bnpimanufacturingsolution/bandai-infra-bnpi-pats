import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	CheckCircle2,
	ChevronRight,
	Edit,
	Loader2,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";
import { RulesPoliciesShell } from "~/components/templates/admin/rules-policies-shell";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import {
	useCreateWorkflowInstance,
	useDeleteWorkflowInstance,
	useUpdateWorkflowInstance,
	useWorkflowInstance,
	useWorkflowInstances,
} from "~/lib/hooks/useWorkflowEngine";
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

type DomainFilter = "ALL" | WorkflowDomain;
type EditorMode = "create" | "edit";
type WorkflowGroup = {
	key: WorkflowDomain;
	label: string;
	items: WorkflowInstance[];
};

type WorkflowCoverageItem = {
	key: string;
	label: string;
	domain: WorkflowDomain;
	requestType?: string;
};

type WorkflowStateDraft = WorkflowRuntimeState & { id: string };
type WorkflowStepDraft = WorkflowRuntimeStep & { id: string };

type EditorDraft = {
	code: string;
	name: string;
	description: string;
	domain: WorkflowDomain;
	requestType: string;
	currentStateKey: string;
	states: WorkflowStateDraft[];
	steps: WorkflowStepDraft[];
};

type DraftErrors = Partial<Record<keyof EditorDraft | "transition", string>>;

const WORKFLOW_FIELDS =
	"id,organizationId,code,name,description,domain,domainRecordId,requestType,currentStateKey,steps,states,createdAt,updatedAt";

const DOMAIN_OPTIONS: SelectOption[] = [
	{ value: "REQUEST", label: "Request" },
	{ value: "RECRUITMENT", label: "Recruitment" },
	{ value: "PAYROLL", label: "Payroll" },
];

export const REQUEST_TYPE_OPTIONS: SelectOption[] = [
	{ value: "LEAVE", label: "Leave Request" },
	{ value: "OVERTIME", label: "Overtime" },
	{ value: "TIME_ADJUSTMENT", label: "Time Adjustment" },
	{ value: "ATTENDANCE_CORRECTION", label: "Attendance Correction" },
	{ value: "TIMESHEET", label: "Timesheet" },
	{ value: "DOCUMENT_REQUEST", label: "Document Request" },
	{ value: "EXPENSE_REIMBURSEMENT", label: "Expense Reimbursement" },
	{ value: "PROMOTION", label: "Promotion" },
	{ value: "SALARY_CHANGE", label: "Salary Change" },
	{ value: "TRANSFER", label: "Transfer" },
	{ value: "TERMINATION", label: "Termination" },
	{ value: "REGULARIZATION", label: "Regularization" },
	{ value: "RESIGNATION", label: "Resignation" },
	{ value: "SCHEDULE_CHANGE", label: "Schedule Change" },
	{ value: "OTHER", label: "Other" },
];

const WORKFLOW_COVERAGE_ITEMS: WorkflowCoverageItem[] = [
	...REQUEST_TYPE_OPTIONS.map((option) => ({
		key: `REQUEST:${option.value}`,
		label: option.label,
		domain: "REQUEST" as WorkflowDomain,
		requestType: option.value,
	})),
	{ key: "RECRUITMENT", label: "Recruitment", domain: "RECRUITMENT" },
	{ key: "PAYROLL", label: "Payroll", domain: "PAYROLL" },
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

const DOMAIN_FILTERS: Array<{ value: DomainFilter; label: string }> = [
	{ value: "ALL", label: "All" },
	{ value: "REQUEST", label: "Request" },
	{ value: "RECRUITMENT", label: "Recruitment" },
	{ value: "PAYROLL", label: "Payroll" },
];

const makeId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toCodeCandidate = (name: string) => {
	const normalized = name
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized ? `WF-${normalized}`.slice(0, 48) : "";
};

const formatLabelFromKey = (value: string) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const formatDomainLabel = (domain?: string | null) =>
	String(domain || "")
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const formatRequestType = (type?: string | null) =>
	String(type || "")
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const parseStateDrafts = (value: WorkflowInstance["states"]): WorkflowStateDraft[] => {
	if (!Array.isArray(value)) return [];
	return value.map((item, index) => {
		const key = String((item as any)?.key || `STATE_${index + 1}`).trim().toUpperCase();
		return {
			id: makeId(),
			key,
			label: String((item as any)?.label || formatLabelFromKey(key) || `State ${index + 1}`),
			order: Number.isFinite(Number((item as any)?.order)) ? Number((item as any).order) : index,
			isTerminal: Boolean((item as any)?.isTerminal),
		};
	});
};

const parseStepDrafts = (value: WorkflowInstance["steps"]): WorkflowStepDraft[] => {
	if (!Array.isArray(value)) return [];
	return value.map((item, index) => ({
		id: makeId(),
		step_number: Number.isFinite(Number((item as any)?.step_number))
			? Number((item as any).step_number)
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

const normalizeStates = (states: WorkflowStateDraft[]): WorkflowStateDraft[] =>
	states.map((state, index) => {
		const key = state.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
		return {
			...state,
			key,
			label: state.label.trim() || formatLabelFromKey(key) || `State ${index + 1}`,
			order: index,
		};
	});

const normalizeSteps = (steps: WorkflowStepDraft[]): WorkflowStepDraft[] =>
	steps.map((step, index) => ({
		...step,
		step_number: index + 1,
		step_name: step.step_name.trim() || `Step ${index + 1}`,
		assignee_role: step.assignee_role?.trim() || "",
		state_on_enter: step.state_on_enter?.trim().toUpperCase() || "",
		state_on_approve: step.state_on_approve?.trim().toUpperCase() || "",
		state_on_reject: step.state_on_reject?.trim().toUpperCase() || "",
		state_on_complete: step.state_on_complete?.trim().toUpperCase() || "",
		state_on_skip: step.state_on_skip?.trim().toUpperCase() || "",
	}));

const buildStateOptions = (states: WorkflowStateDraft[]): SelectOption[] =>
	normalizeStates(states).map((state) => ({
		value: state.key,
		label: `${state.key} - ${state.label}`,
	}));

const defaultStates = (): WorkflowStateDraft[] =>
	[
		{ key: "OPEN", label: "Open", order: 0, isTerminal: false },
		{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
		{ key: "APPROVED", label: "Approved", order: 2, isTerminal: false },
		{ key: "COMPLETED", label: "Completed", order: 3, isTerminal: true },
		{ key: "REJECTED", label: "Rejected", order: 4, isTerminal: true },
	].map((state) => ({ ...state, id: makeId() }));

const defaultSteps = (): WorkflowStepDraft[] => [
	{
		id: makeId(),
		step_number: 1,
		step_name: "Requester Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		assignee_role: "",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
		state_on_approve: "",
		state_on_reject: "",
		state_on_skip: "",
	},
	{
		id: makeId(),
		step_number: 2,
		step_name: "HR Approval",
		step_type: "APPROVAL",
		assignee_type: "HR",
		assignee_role: "",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
		state_on_complete: "",
		state_on_skip: "",
	},
	{
		id: makeId(),
		step_number: 3,
		step_name: "System Completion",
		step_type: "TASK",
		assignee_type: "SYSTEM",
		assignee_role: "",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_approve: "",
		state_on_reject: "",
		state_on_skip: "COMPLETED",
	},
];

const emptyDraft = (): EditorDraft => {
	const states = defaultStates();
	return {
		code: "",
		name: "",
		description: "",
		domain: "REQUEST",
		requestType: "",
		currentStateKey: states[0]?.key || "OPEN",
		states,
		steps: defaultSteps(),
	};
};

const draftFromWorkflow = (workflow: WorkflowInstance): EditorDraft => {
	const states = normalizeStates(parseStateDrafts(workflow.states));
	const steps = normalizeSteps(parseStepDrafts(workflow.steps));
	return {
		code: workflow.code || "",
		name: workflow.name || "",
		description: workflow.description || "",
		domain: workflow.domain,
		requestType: workflow.requestType || "",
		currentStateKey: workflow.currentStateKey || states[0]?.key || "",
		states,
		steps,
	};
};

const getStepTransitions = (step: WorkflowRuntimeStep) =>
	[
		["Enter", step.state_on_enter],
		["Approve", step.state_on_approve],
		["Reject", step.state_on_reject],
		["Complete", step.state_on_complete],
		["Skip", step.state_on_skip],
	].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

const getWorkflowName = (workflow?: WorkflowInstance | null) =>
	workflow?.name || workflow?.code || "Workflow Template";

const pageSize = 100;

export default function AdminWorkflowTemplatesPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [draft, setDraft] = useState<EditorDraft>(() => emptyDraft());
	const [errors, setErrors] = useState<DraftErrors>({});
	const codeManuallyEditedRef = useRef(false);

	const searchQuery = searchParams.get("search") || "";
	const domainFilter = (searchParams.get("domain") || "ALL") as DomainFilter;
	const selectedId = searchParams.get("id") || "";
	const action = (searchParams.get("action") || "").toLowerCase() as EditorMode | "delete" | "";
	const isEditing = action === "create" || action === "edit";
	const isDrawerOpen = Boolean(selectedId) && !isEditing && action !== "delete";

	const { data, isLoading, isError, error } = useWorkflowInstances({
		page: 1,
		limit: 1000,
		query: searchQuery || undefined,
		fields: WORKFLOW_FIELDS,
		templateOnly: true,
		count: true,
		document: true,
		pagination: true,
		sort: "updatedAt",
		order: "desc",
	});

	const allItems = useMemo(() => data?.workflowInstances || [], [data?.workflowInstances]);
	const selectedFromList = allItems.find((item) => item.id === selectedId);
	const { data: selectedDetail, isLoading: isLoadingDetail } = useWorkflowInstance(
		selectedId,
		Boolean(selectedId && !selectedFromList),
	);

	const selectedWorkflow = selectedFromList || selectedDetail || null;
	const filteredItems = useMemo(() => {
		if (domainFilter === "ALL") return allItems;
		return allItems.filter((item) => item.domain === domainFilter);
	}, [allItems, domainFilter]);

	const visibleItems = filteredItems.slice(0, pageSize);
	const groupedVisibleItems = useMemo<WorkflowGroup[]>(() => {
		const order: WorkflowDomain[] = ["REQUEST", "RECRUITMENT", "PAYROLL"];
		return order
			.map((domain) => ({
				key: domain,
				label: formatDomainLabel(domain),
				items: visibleItems.filter((item) => item.domain === domain),
			}))
			.filter((group) => group.items.length > 0);
	}, [visibleItems]);

	const coverage = useMemo(() => {
		const covered = new Set(
			WORKFLOW_COVERAGE_ITEMS.filter((item) =>
				allItems.some((workflow) => {
					if (workflow.domain !== item.domain) return false;
					if (item.requestType) {
						return String(workflow.requestType || "").toUpperCase() === item.requestType;
					}
					return true;
				}),
			).map((item) => item.key),
		);
		const missing = WORKFLOW_COVERAGE_ITEMS.filter((item) => !covered.has(item.key));
		const requestTotal = WORKFLOW_COVERAGE_ITEMS.filter((item) => item.domain === "REQUEST").length;
		const requestCovered = WORKFLOW_COVERAGE_ITEMS.filter(
			(item) => item.domain === "REQUEST" && covered.has(item.key),
		).length;

		return {
			covered,
			missing,
			requestCovered,
			requestTotal,
		};
	}, [allItems]);

	const createMutation = useCreateWorkflowInstance();
	const updateMutation = useUpdateWorkflowInstance();
	const deleteMutation = useDeleteWorkflowInstance();
	const isSaving = createMutation.isPending || updateMutation.isPending;

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	useEffect(() => {
		if (action === "create") {
			codeManuallyEditedRef.current = false;
			setDraft(emptyDraft());
			setErrors({});
			return;
		}
		if (action === "edit" && selectedWorkflow) {
			codeManuallyEditedRef.current = true;
			setDraft(draftFromWorkflow(selectedWorkflow));
			setErrors({});
		}
	}, [action, selectedWorkflow]);

	useEffect(() => {
		if (!isEditing || codeManuallyEditedRef.current) return;
		const nextCode = toCodeCandidate(draft.name);
		if (nextCode !== draft.code) {
			setDraft((current) => ({ ...current, code: nextCode }));
		}
	}, [draft.code, draft.name, isEditing]);

	const stateOptions = useMemo(() => buildStateOptions(draft.states), [draft.states]);

	const setSelectedTemplate = (id: string) => {
		updateSearchParams((next) => {
			next.set("id", id);
			next.delete("action");
		});
	};

	const closeDrawer = () => {
		updateSearchParams((next) => {
			next.delete("id");
			if (action !== "create" && action !== "edit") next.delete("action");
		});
	};

	const closeAction = () => {
		setErrors({});
		updateSearchParams((next) => {
			next.delete("action");
		});
	};

	const startCreate = () => {
		updateSearchParams((next) => {
			next.set("action", "create");
			next.delete("id");
		});
	};

	const startEdit = () => {
		if (!selectedWorkflow) return;
		updateSearchParams((next) => {
			next.set("id", selectedWorkflow.id);
			next.set("action", "edit");
		});
	};

	const startDelete = () => {
		if (!selectedWorkflow) return;
		updateSearchParams((next) => {
			next.set("id", selectedWorkflow.id);
			next.set("action", "delete");
		});
	};

	const validateDraft = () => {
		const nextErrors: DraftErrors = {};
		const normalizedStates = normalizeStates(draft.states);
		const normalizedSteps = normalizeSteps(draft.steps);
		const knownStateKeys = new Set(normalizedStates.map((state) => state.key));

		if (draft.domain === "REQUEST" && !draft.requestType.trim()) {
			nextErrors.requestType = "Select a request type.";
		}
		if (normalizedStates.length === 0) nextErrors.states = "Add at least one state.";
		if (normalizedSteps.length === 0) nextErrors.steps = "Add at least one step.";
		if (!knownStateKeys.has(draft.currentStateKey)) {
			nextErrors.currentStateKey = "Current state must match a configured state.";
		}
		if (
			normalizedSteps.some((step) =>
				[
					step.state_on_enter,
					step.state_on_approve,
					step.state_on_reject,
					step.state_on_complete,
					step.state_on_skip,
				]
					.filter(Boolean)
					.some((key) => !knownStateKeys.has(String(key))),
			)
		) {
			nextErrors.transition = "Each transition must point to a configured state.";
		}

		setErrors(nextErrors);
		return Object.keys(nextErrors).length === 0;
	};

	const saveDraft = () => {
		if (!validateDraft()) return;

		const normalizedStates = normalizeStates(draft.states);
		const normalizedSteps = normalizeSteps(draft.steps);
		const payload: CreateWorkflowInstanceRequest | UpdateWorkflowInstanceRequest = {
			code: draft.code.trim() || undefined,
			name: draft.name.trim() || undefined,
			description: draft.description.trim() || undefined,
			domain: draft.domain,
			requestType: draft.domain === "REQUEST" ? draft.requestType.trim() || undefined : undefined,
			currentStateKey: draft.currentStateKey,
			states: normalizedStates.map(({ id: _id, ...state }) => state),
			steps: normalizedSteps.map(({ id: _id, ...step }) => step),
			stateHistory: [],
		};

		if (action === "edit" && selectedWorkflow) {
			updateMutation.mutate(
				{ id: selectedWorkflow.id, payload },
				{
					onSuccess: () => {
						updateSearchParams((next) => {
							next.delete("action");
							next.set("id", selectedWorkflow.id);
						});
					},
				},
			);
			return;
		}

		createMutation.mutate(payload as CreateWorkflowInstanceRequest, {
			onSuccess: (created) => {
				updateSearchParams((next) => {
					next.set("id", created.id);
					next.delete("action");
				});
			},
		});
	};

	const confirmDelete = () => {
		if (!selectedWorkflow) return;
		const deletedId = selectedWorkflow.id;
		deleteMutation.mutate(deletedId, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("action");
					if (next.get("id") === deletedId) next.delete("id");
				});
			},
		});
	};

	const addState = () => {
		setDraft((current) => {
			const nextNumber = current.states.length + 1;
			return {
				...current,
				states: normalizeStates([
					...current.states,
					{
						id: makeId(),
						key: `STATE_${nextNumber}`,
						label: `State ${nextNumber}`,
						order: current.states.length,
						isTerminal: false,
					},
				]),
			};
		});
	};

	const addStep = () => {
		setDraft((current) => ({
			...current,
			steps: normalizeSteps([
				...current.steps,
				{
					id: makeId(),
					step_number: current.steps.length + 1,
					step_name: `Step ${current.steps.length + 1}`,
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
		}));
	};

	const moveStep = (index: number, direction: -1 | 1) => {
		setDraft((current) => {
			const targetIndex = index + direction;
			if (targetIndex < 0 || targetIndex >= current.steps.length) return current;
			const steps = [...current.steps];
			const [moved] = steps.splice(index, 1);
			steps.splice(targetIndex, 0, moved);
			return { ...current, steps: normalizeSteps(steps) };
		});
	};

	const headerActions = (
		<Button
			type="button"
			onClick={startCreate}
			className="h-9 rounded-lg bg-neutral-900 px-3 text-white hover:bg-neutral-800">
			<Plus className="h-4 w-4" />
			Add Template
		</Button>
	);

	return (
		<RulesPoliciesShell title="Workflow Templates" actions={headerActions}>
			<div className="space-y-4">
				{/* Compact coverage strip */}
				<section className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
					<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
						<div className="flex items-baseline gap-2">
							<span className="text-neutral-500">Templates</span>
							<span className="font-semibold tabular-nums text-neutral-900">{allItems.length}</span>
						</div>
						<div className="hidden h-3 w-px bg-neutral-200 sm:block" />
						<div className="flex items-baseline gap-2">
							<span className="text-neutral-500">Request coverage</span>
							<span
								className={`font-semibold tabular-nums ${
									coverage.requestCovered === coverage.requestTotal
										? "text-neutral-900"
										: "text-amber-700"
								}`}>
								{coverage.requestCovered}/{coverage.requestTotal}
							</span>
						</div>
						{coverage.missing.length > 0 ? (
							<>
								<div className="hidden h-3 w-px bg-neutral-200 sm:block" />
								<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
									<span className="text-xs text-neutral-500">Gaps</span>
									{coverage.missing.slice(0, 6).map((item) => (
										<span
											key={item.key}
											className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
											{item.label}
										</span>
									))}
									{coverage.missing.length > 6 ? (
										<span className="text-[11px] text-neutral-400">
											+{coverage.missing.length - 6}
										</span>
									) : null}
								</div>
							</>
						) : null}
					</div>
				</section>

				{/* Template list */}
				<section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white">
					<div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="relative min-w-0 flex-1 sm:max-w-sm">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
							<Input
								value={searchQuery}
								onChange={(event) =>
									updateSearchParams((next) => {
										if (event.target.value) next.set("search", event.target.value);
										else next.delete("search");
									})
								}
								placeholder="Search templates…"
								className="h-9 rounded-lg border-neutral-200 bg-neutral-50/50 pl-9 text-sm focus:bg-white"
							/>
						</div>
						<div className="flex flex-wrap items-center gap-1">
							{DOMAIN_FILTERS.map((filter) => {
								const active = domainFilter === filter.value;
								return (
									<button
										key={filter.value}
										type="button"
										onClick={() =>
											updateSearchParams((next) => {
												if (filter.value === "ALL") next.delete("domain");
												else next.set("domain", filter.value);
											})
										}
										className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
											active
												? "bg-neutral-900 text-white"
												: "text-neutral-600 hover:bg-neutral-100"
										}`}>
										{filter.label}
									</button>
								);
							})}
						</div>
					</div>

					{isLoading ? (
						<div className="flex min-h-56 items-center justify-center text-sm text-neutral-500">
							<Loader2 className="mr-2 h-4 w-4 animate-spin text-neutral-400" />
							Loading templates
						</div>
					) : isError ? (
						<div className="p-6 text-sm text-red-600">
							{(error as any)?.message || "Failed to load workflow templates."}
						</div>
					) : visibleItems.length === 0 ? (
						<div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
							<p className="text-sm font-medium text-neutral-900">No templates found</p>
							<p className="max-w-sm text-sm text-neutral-500">
								{searchQuery || domainFilter !== "ALL"
									? "Try a different search or domain filter."
									: "Create your first workflow template for requests, recruitment, or payroll."}
							</p>
							{!searchQuery && domainFilter === "ALL" ? (
								<Button
									type="button"
									onClick={startCreate}
									className="mt-1 h-9 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">
									<Plus className="h-4 w-4" />
									Add Template
								</Button>
							) : null}
						</div>
					) : (
						<div className="divide-y divide-neutral-100">
							{groupedVisibleItems.map((group) => (
								<div key={group.key}>
									<div className="flex items-center justify-between bg-neutral-50/80 px-4 py-2">
										<span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
											{group.label}
										</span>
										<span className="text-xs tabular-nums text-neutral-400">
											{group.items.length}
										</span>
									</div>
									<ul className="divide-y divide-neutral-50">
										{group.items.map((item) => {
											const states = parseStateDrafts(item.states);
											const steps = parseStepDrafts(item.steps);
											const isActive = item.id === selectedId && isDrawerOpen;
											return (
												<li key={item.id}>
													<button
														type="button"
														onClick={() => setSelectedTemplate(item.id)}
														className={`group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors ${
															isActive
																? "bg-neutral-50"
																: "bg-white hover:bg-neutral-50/70"
														}`}>
														<div className="min-w-0 flex-1">
															<div className="flex flex-wrap items-center gap-2">
																<p className="truncate text-sm font-medium text-neutral-900">
																	{getWorkflowName(item)}
																</p>
																{item.requestType ? (
																	<span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
																		{formatRequestType(item.requestType)}
																	</span>
																) : null}
															</div>
															<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
																<span className="font-mono text-neutral-400">
																	{item.code || item.id.slice(0, 12)}
																</span>
																<span>
																	{steps.length} step{steps.length === 1 ? "" : "s"}
																</span>
																<span>
																	{states.length} state{states.length === 1 ? "" : "s"}
																</span>
																{item.currentStateKey ? (
																	<span className="text-neutral-400">
																		· {item.currentStateKey}
																	</span>
																) : null}
															</div>
														</div>
														<ChevronRight
															className={`h-4 w-4 shrink-0 transition-colors ${
																isActive
																	? "text-neutral-700"
																	: "text-neutral-300 group-hover:text-neutral-500"
															}`}
														/>
													</button>
												</li>
											);
										})}
									</ul>
								</div>
							))}
						</div>
					)}

					{visibleItems.length > 0 ? (
						<div className="flex items-center justify-between border-t border-neutral-100 px-4 py-2.5">
							<p className="text-xs text-neutral-400">
								{visibleItems.length}
								{filteredItems.length > visibleItems.length
									? ` of ${filteredItems.length}`
									: ""}{" "}
								template{filteredItems.length === 1 ? "" : "s"}
							</p>
							{filteredItems.length > pageSize ? (
								<p className="text-xs text-neutral-400">Showing first {pageSize}</p>
							) : null}
						</div>
					) : null}
				</section>
			</div>

			{/* Detail drawer */}
			<Drawer
				open={isDrawerOpen}
				onOpenChange={(open) => {
					if (!open) closeDrawer();
				}}
				direction="right">
				<DrawerContent className="ml-auto flex h-full min-h-0 w-full min-w-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:!max-w-[min(92vw,36rem)]">
					{isLoadingDetail && !selectedWorkflow ? (
						<>
							<DrawerHeader className="shrink-0 border-b border-neutral-100">
								<DrawerTitle className="text-base font-semibold text-neutral-900">
									Loading template
								</DrawerTitle>
								<DrawerDescription className="text-sm text-neutral-500">
									Fetching workflow details…
								</DrawerDescription>
							</DrawerHeader>
							<div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
								<Loader2 className="mr-2 h-4 w-4 animate-spin text-neutral-400" />
								Loading
							</div>
						</>
					) : selectedWorkflow ? (
						<>
							<DrawerHeader className="shrink-0 space-y-3 border-b border-neutral-100 pb-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 space-y-1">
										<DrawerTitle className="text-base font-semibold leading-snug text-neutral-900">
											{getWorkflowName(selectedWorkflow)}
										</DrawerTitle>
										<DrawerDescription className="font-mono text-xs text-neutral-400">
											{selectedWorkflow.code || selectedWorkflow.id}
										</DrawerDescription>
									</div>
									<DrawerClose asChild>
										<button
											type="button"
											className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
											aria-label="Close">
											<X className="h-4 w-4" />
										</button>
									</DrawerClose>
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
										{formatDomainLabel(selectedWorkflow.domain)}
									</span>
									{selectedWorkflow.requestType ? (
										<span className="rounded-md border border-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
											{formatRequestType(selectedWorkflow.requestType)}
										</span>
									) : null}
									<span className="rounded-md bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white">
										{selectedWorkflow.currentStateKey || "OPEN"}
									</span>
								</div>
								{selectedWorkflow.description ? (
									<p className="text-sm leading-relaxed text-neutral-600">
										{selectedWorkflow.description}
									</p>
								) : null}
							</DrawerHeader>

							<div className="min-h-0 flex-1 overflow-y-auto">
								<DetailContent workflow={selectedWorkflow} />
							</div>

							<DrawerFooter className="shrink-0 flex-row gap-2 border-t border-neutral-100 bg-neutral-50/50 sm:justify-end">
								<Button
									type="button"
									variant="outline"
									className="h-9 flex-1 rounded-lg sm:flex-none"
									onClick={startDelete}>
									<Trash2 className="h-4 w-4" />
									Delete
								</Button>
								<Button
									type="button"
									className="h-9 flex-1 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 sm:flex-none"
									onClick={startEdit}>
									<Edit className="h-4 w-4" />
									Configure
								</Button>
							</DrawerFooter>
						</>
					) : (
						<>
							<DrawerHeader>
								<DrawerTitle>Template not found</DrawerTitle>
								<DrawerDescription>
									This workflow template may have been removed.
								</DrawerDescription>
							</DrawerHeader>
							<DrawerFooter>
								<DrawerClose asChild>
									<Button type="button" variant="outline" className="rounded-lg">
										Close
									</Button>
								</DrawerClose>
							</DrawerFooter>
						</>
					)}
				</DrawerContent>
			</Drawer>

			{/* Create / Edit modal */}
			<Modal
				open={isEditing}
				onOpenChange={(open) => {
					if (!open) closeAction();
				}}
				title={action === "edit" ? "Edit Workflow Template" : "Create Workflow Template"}
				description={
					action === "edit"
						? "Update states, steps, and transitions for this template."
						: "Define domain, states, and approval steps for a new template."
				}
				className="max-w-5xl"
				closeOnBackdropClick={false}>
				<EditorPane
					mode={(action as EditorMode) || "create"}
					draft={draft}
					errors={errors}
					stateOptions={stateOptions}
					isSaving={isSaving}
					onCancel={closeAction}
					onSave={saveDraft}
					onAddState={addState}
					onAddStep={addStep}
					onMoveStep={moveStep}
					onChangeDraft={(nextDraft) => setDraft(nextDraft)}
					onCodeEdited={() => {
						codeManuallyEditedRef.current = true;
					}}
				/>
			</Modal>

			{/* Delete modal */}
			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeAction();
				}}
				title="Delete Workflow Template"
				description="This soft-deletes the template from the workflow template list."
				className="max-w-md">
				<div className="space-y-4">
					<div className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
						Delete{" "}
						<span className="font-semibold">{getWorkflowName(selectedWorkflow)}</span>? Runtime
						workflow records are not edited from this page.
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" className="h-9 rounded-lg" onClick={closeAction}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							className="h-9 rounded-lg"
							onClick={confirmDelete}
							disabled={deleteMutation.isPending}>
							{deleteMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Deleting…
								</>
							) : (
								"Delete Template"
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</RulesPoliciesShell>
	);
}

function DetailContent({ workflow }: { workflow: WorkflowInstance }) {
	const states = normalizeStates(parseStateDrafts(workflow.states));
	const steps = normalizeSteps(parseStepDrafts(workflow.steps));

	return (
		<div className="space-y-6 p-4">
			<section>
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
						Step flow
					</h3>
					<span className="text-xs tabular-nums text-neutral-400">{steps.length}</span>
				</div>
				{steps.length === 0 ? (
					<p className="text-sm text-neutral-500">No steps configured.</p>
				) : (
					<ol className="space-y-0">
						{steps.map((step, index) => {
							const transitions = getStepTransitions(step);
							return (
								<li key={`${step.step_number}-${step.step_name}`} className="relative flex gap-3">
									<div className="flex flex-col items-center">
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs font-semibold tabular-nums text-neutral-700">
											{step.step_number}
										</div>
										{index < steps.length - 1 ? (
											<div className="w-px flex-1 bg-neutral-200" />
										) : null}
									</div>
									<div className={`min-w-0 flex-1 ${index < steps.length - 1 ? "pb-5" : ""}`}>
										<p className="text-sm font-medium text-neutral-900">{step.step_name}</p>
										<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
											<span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
												{step.step_type}
											</span>
											<span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
												{step.assignee_type}
											</span>
											<span
												className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
													step.is_required === false
														? "bg-neutral-50 text-neutral-500"
														: "bg-neutral-900 text-white"
												}`}>
												{step.is_required === false ? "Optional" : "Required"}
											</span>
										</div>
										{transitions.length > 0 ? (
											<div className="mt-2 flex flex-wrap gap-1.5">
												{transitions.map(([label, value]) => (
													<span
														key={`${step.step_number}-${label}-${value}`}
														className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50/80 px-1.5 py-0.5 text-[11px] text-neutral-600">
														<span className="text-neutral-400">{label}</span>
														<ArrowRight className="h-2.5 w-2.5 text-neutral-300" />
														<span className="font-mono text-neutral-800">{value}</span>
													</span>
												))}
											</div>
										) : null}
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</section>

			<section>
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
						States
					</h3>
					<span className="text-xs tabular-nums text-neutral-400">{states.length}</span>
				</div>
				{states.length === 0 ? (
					<p className="text-sm text-neutral-500">No states configured.</p>
				) : (
					<ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
						{states.map((state) => (
							<li
								key={`${state.order}-${state.key}`}
								className="flex items-center justify-between gap-3 px-3 py-2.5">
								<div className="min-w-0">
									<p className="truncate font-mono text-xs font-semibold text-neutral-900">
										{state.key}
									</p>
									<p className="truncate text-xs text-neutral-500">{state.label}</p>
								</div>
								<div className="flex shrink-0 items-center gap-1.5">
									<span className="text-[11px] tabular-nums text-neutral-400">
										#{state.order + 1}
									</span>
									{state.isTerminal ? (
										<span className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
											Terminal
										</span>
									) : null}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function EditorPane({
	mode,
	draft,
	errors,
	stateOptions,
	isSaving,
	onCancel,
	onSave,
	onAddState,
	onAddStep,
	onMoveStep,
	onChangeDraft,
	onCodeEdited,
}: {
	mode: EditorMode;
	draft: EditorDraft;
	errors: DraftErrors;
	stateOptions: SelectOption[];
	isSaving: boolean;
	onCancel: () => void;
	onSave: () => void;
	onAddState: () => void;
	onAddStep: () => void;
	onMoveStep: (index: number, direction: -1 | 1) => void;
	onChangeDraft: (draft: EditorDraft) => void;
	onCodeEdited: () => void;
}) {
	const updateState = (id: string, patch: Partial<WorkflowStateDraft>) => {
		onChangeDraft({
			...draft,
			states: normalizeStates(draft.states.map((state) => (state.id === id ? { ...state, ...patch } : state))),
		});
	};

	const updateStep = (id: string, patch: Partial<WorkflowStepDraft>) => {
		onChangeDraft({
			...draft,
			steps: normalizeSteps(draft.steps.map((step) => (step.id === id ? { ...step, ...patch } : step))),
		});
	};

	return (
		<div className="space-y-5">
			<section className="space-y-3">
				<div className="grid gap-3 md:grid-cols-2">
					<Field label="Domain" error={errors.domain}>
						<Select
							value={draft.domain}
							onChange={(value) =>
								onChangeDraft({
									...draft,
									domain: value as WorkflowDomain,
									requestType: value === "REQUEST" ? draft.requestType : "",
								})
							}
							options={DOMAIN_OPTIONS}
							error={Boolean(errors.domain)}
						/>
					</Field>

					{draft.domain === "REQUEST" ? (
						<Field label="Request Type" error={errors.requestType}>
							<Select
								value={draft.requestType}
								onChange={(value) => onChangeDraft({ ...draft, requestType: value })}
								options={REQUEST_TYPE_OPTIONS}
								placeholder="Select request type"
								error={Boolean(errors.requestType)}
							/>
							<ConstraintTokenRow
								tokens={[{ label: "Required", tone: draft.requestType ? "default" : "invalid" }]}
							/>
						</Field>
					) : (
						<div className="flex h-10 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
							Request type not used
						</div>
					)}

					<Field label="Name">
						<Input
							value={draft.name}
							onChange={(event) => onChangeDraft({ ...draft, name: event.target.value })}
							placeholder="Leave request workflow"
							className="h-10 rounded-lg border-neutral-200 bg-white text-sm"
						/>
						<ConstraintTokenRow tokens={[{ label: "Optional", tone: "subtle" }]} />
					</Field>

					<Field label="Code">
						<Input
							value={draft.code}
							onChange={(event) => {
								onCodeEdited();
								onChangeDraft({ ...draft, code: event.target.value.toUpperCase() });
							}}
							placeholder="WF-LEAVE-DEFAULT"
							className="h-10 rounded-lg border-neutral-200 bg-white font-mono text-sm"
						/>
						<ConstraintTokenRow tokens={[{ label: "Auto", tone: draft.code ? "default" : "subtle" }]} />
					</Field>

					<Field label="Current State" error={errors.currentStateKey}>
						<Select
							value={draft.currentStateKey}
							onChange={(value) => onChangeDraft({ ...draft, currentStateKey: value })}
							options={stateOptions}
							placeholder="Select state"
							error={Boolean(errors.currentStateKey)}
						/>
						<ConstraintTokenRow
							tokens={[{ label: "Match state", tone: errors.currentStateKey ? "invalid" : "default" }]}
						/>
					</Field>

					<Field label="Description">
						<Input
							value={draft.description}
							onChange={(event) => onChangeDraft({ ...draft, description: event.target.value })}
							placeholder="Admin-facing workflow summary"
							className="h-10 rounded-lg border-neutral-200 bg-white text-sm"
						/>
					</Field>
				</div>
			</section>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
				<section className="overflow-hidden rounded-xl border border-neutral-200">
					<div className="flex min-h-11 items-center justify-between border-b border-neutral-100 px-3 py-2">
						<h3 className="text-sm font-medium text-neutral-900">States</h3>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 rounded-lg"
							onClick={onAddState}>
							<Plus className="h-3.5 w-3.5" />
							Add
						</Button>
					</div>
					{errors.states ? <ErrorText>{errors.states}</ErrorText> : null}
					<Accordion
						type="multiple"
						defaultValue={draft.states.slice(0, 3).map((state) => state.id)}
						className="divide-y divide-neutral-100">
						{draft.states.map((state, index) => (
							<AccordionItem key={state.id} value={state.id} className="border-b-0">
								<AccordionTrigger className="px-3 py-2.5 hover:no-underline data-[state=open]:bg-neutral-50/80">
									<div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
										<div className="min-w-0">
											<p className="truncate font-mono text-xs font-semibold text-neutral-900">
												{state.key || `STATE_${index + 1}`}
											</p>
											<p className="truncate text-xs text-neutral-500">
												State {index + 1}
												{state.isTerminal ? " · Terminal" : ""}
											</p>
										</div>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-3 pb-3">
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-medium text-neutral-500">State {index + 1}</span>
											<IconButton
												label="Remove state"
												disabled={draft.states.length <= 1}
												onClick={() =>
													onChangeDraft({
														...draft,
														states: normalizeStates(draft.states.filter((item) => item.id !== state.id)),
													})
												}>
												<Trash2 className="h-4 w-4" />
											</IconButton>
										</div>
										<Input
											value={state.key}
											onChange={(event) => updateState(state.id, { key: event.target.value })}
											className="h-9 rounded-lg border-neutral-200 bg-white font-mono text-sm"
										/>
										<Input
											value={state.label}
											onChange={(event) => updateState(state.id, { label: event.target.value })}
											className="h-9 rounded-lg border-neutral-200 bg-white text-sm"
										/>
										<button
											type="button"
											onClick={() => updateState(state.id, { isTerminal: !state.isTerminal })}
											className={`h-8 rounded-lg border px-2 text-xs font-medium transition-colors ${
												state.isTerminal
													? "border-neutral-900 bg-neutral-900 text-white"
													: "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
											}`}>
											{state.isTerminal ? "Terminal state" : "Non-terminal"}
										</button>
									</div>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</section>

				<section className="overflow-hidden rounded-xl border border-neutral-200">
					<div className="flex min-h-11 items-center justify-between border-b border-neutral-100 px-3 py-2">
						<h3 className="text-sm font-medium text-neutral-900">Steps</h3>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 rounded-lg"
							onClick={onAddStep}>
							<Plus className="h-3.5 w-3.5" />
							Add
						</Button>
					</div>
					{errors.steps ? <ErrorText>{errors.steps}</ErrorText> : null}
					{errors.transition ? <ErrorText>{errors.transition}</ErrorText> : null}
					<Accordion
						type="multiple"
						defaultValue={draft.steps.slice(0, 2).map((step) => step.id)}
						className="divide-y divide-neutral-100">
						{draft.steps.map((step, index) => (
							<AccordionItem key={step.id} value={step.id} className="border-b-0">
								<AccordionTrigger className="px-3 py-2.5 hover:no-underline data-[state=open]:bg-neutral-50/80">
									<div className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-neutral-900">
												{index + 1}. {step.step_name || `Step ${index + 1}`}
											</p>
											<p className="truncate text-xs text-neutral-500">
												{step.step_type} / {step.assignee_type}
											</p>
										</div>
										<span
											className={`w-fit rounded-md px-2 py-0.5 text-[11px] font-medium ${
												step.is_required !== false
													? "bg-neutral-900 text-white"
													: "bg-neutral-100 text-neutral-600"
											}`}>
											{step.is_required !== false ? "Required" : "Optional"}
										</span>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-3 pb-3">
									<div className="space-y-3">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-medium text-neutral-500">Step {index + 1}</span>
											<div className="flex gap-1">
												<IconButton
													label="Move up"
													disabled={index === 0}
													onClick={() => onMoveStep(index, -1)}>
													<ArrowUp className="h-4 w-4" />
												</IconButton>
												<IconButton
													label="Move down"
													disabled={index === draft.steps.length - 1}
													onClick={() => onMoveStep(index, 1)}>
													<ArrowDown className="h-4 w-4" />
												</IconButton>
												<IconButton
													label="Remove step"
													disabled={draft.steps.length <= 1}
													onClick={() =>
														onChangeDraft({
															...draft,
															steps: normalizeSteps(draft.steps.filter((item) => item.id !== step.id)),
														})
													}>
													<Trash2 className="h-4 w-4" />
												</IconButton>
											</div>
										</div>

										<div className="grid gap-3 md:grid-cols-2">
											<Field label="Step Name">
												<Input
													value={step.step_name}
													onChange={(event) => updateStep(step.id, { step_name: event.target.value })}
													className="h-9 rounded-lg border-neutral-200 bg-white text-sm"
												/>
											</Field>
											<div className="grid gap-3 sm:grid-cols-2">
												<Field label="Step Type">
													<Select
														value={step.step_type}
														onChange={(value) =>
															updateStep(step.id, { step_type: value as WorkflowStepType })
														}
														options={STEP_TYPE_OPTIONS}
													/>
												</Field>
												<Field label="Assignee">
													<Select
														value={step.assignee_type}
														onChange={(value) =>
															updateStep(step.id, {
																assignee_type: value as WorkflowAssigneeType,
															})
														}
														options={ASSIGNEE_TYPE_OPTIONS}
													/>
												</Field>
											</div>
										</div>

										<button
											type="button"
											onClick={() => updateStep(step.id, { is_required: step.is_required === false })}
											className={`h-8 rounded-lg border px-2 text-xs font-medium transition-colors ${
												step.is_required !== false
													? "border-neutral-900 bg-neutral-900 text-white"
													: "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
											}`}>
											{step.is_required !== false ? "Required step" : "Optional step"}
										</button>

										<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
											{(
												[
													["On Enter", "state_on_enter"],
													["On Approve", "state_on_approve"],
													["On Reject", "state_on_reject"],
													["On Complete", "state_on_complete"],
													["On Skip", "state_on_skip"],
												] as const
											).map(([label, key]) => (
												<Field key={`${step.id}-${key}`} label={label}>
													<Select
														value={String((step as any)[key] || "")}
														onChange={(value) =>
															updateStep(step.id, { [key]: value } as Partial<WorkflowStepDraft>)
														}
														options={[{ value: "", label: "None" }, ...stateOptions]}
														placeholder="None"
													/>
												</Field>
											))}
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</section>
			</div>

			<div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4">
				<Button type="button" variant="outline" className="h-9 rounded-lg" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					type="button"
					className="h-9 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800"
					disabled={isSaving}
					onClick={onSave}>
					{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
					{isSaving ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Template"}
				</Button>
			</div>
		</div>
	);
}

function Field({
	label,
	error,
	children,
}: {
	label: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="min-w-0 space-y-1.5">
			<label className="text-xs font-medium text-neutral-600">{label}</label>
			{children}
			{error ? <p className="text-xs text-red-600">{error}</p> : null}
		</div>
	);
}

function IconButton({
	label,
	disabled,
	children,
	onClick,
}: {
	label: string;
	disabled?: boolean;
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-8 w-8 rounded-lg p-0"
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			title={label}>
			{children}
		</Button>
	);
}

function ErrorText({ children }: { children: React.ReactNode }) {
	return (
		<div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{children}</div>
	);
}
