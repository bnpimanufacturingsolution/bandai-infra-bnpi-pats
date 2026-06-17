import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
	ArrowDown,
	ArrowUp,
	CheckCircle2,
	Edit,
	Loader2,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Badge } from "~/components/atoms/Badge";
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

const REQUEST_TYPE_OPTIONS: SelectOption[] = [
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
		if (isLoading || isEditing || action === "delete") return;
		if (selectedId && filteredItems.some((item) => item.id === selectedId)) return;
		const fallback = visibleItems[0] || filteredItems[0];
		if (!fallback) return;
		updateSearchParams((next) => {
			next.set("id", fallback.id);
		});
	}, [action, filteredItems, isEditing, isLoading, selectedId, visibleItems]);

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

	const closeAction = () => {
		setErrors({});
		updateSearchParams((next) => {
			next.delete("action");
			if (!next.get("id") && selectedWorkflow) next.set("id", selectedWorkflow.id);
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
					onSuccess: () => closeAction(),
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
		<Button type="button" onClick={startCreate} className="h-9 rounded-md bg-orange-600 text-white hover:bg-orange-700">
			<Plus className="h-4 w-4" />
			Add Template
		</Button>
	);

	return (
		<RulesPoliciesShell title="Workflow Templates" actions={headerActions}>
			<WorkflowCoveragePanel
				totalTemplates={allItems.length}
				visibleTemplates={visibleItems.length}
				coverage={coverage}
			/>
			<div className="grid min-h-[640px] gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
				<aside className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
					<div className="border-b border-gray-100 p-3">
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<Input
								value={searchQuery}
								onChange={(event) =>
									updateSearchParams((next) => {
										if (event.target.value) next.set("search", event.target.value);
										else next.delete("search");
									})
								}
								placeholder="Search templates"
								className="h-10 rounded-md border-gray-200 bg-white pl-9 text-sm"
							/>
						</div>
					</div>

					<div className="max-h-[560px] overflow-y-auto">
						{isLoading ? (
							<div className="flex min-h-40 items-center justify-center text-sm text-gray-500">
								<Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-600" />
								Loading templates
							</div>
						) : isError ? (
							<div className="p-4 text-sm text-red-600">
								{(error as any)?.message || "Failed to load workflow templates."}
							</div>
						) : visibleItems.length === 0 ? (
							<div className="p-4 text-sm text-gray-500">No workflow templates found.</div>
						) : (
							<Accordion
								type="multiple"
								defaultValue={groupedVisibleItems.map((group) => group.key)}
								className="divide-y divide-gray-100">
								{groupedVisibleItems.map((group) => (
									<AccordionItem key={group.key} value={group.key} className="border-b-0">
										<AccordionTrigger className="px-3 py-2.5 hover:no-underline data-[state=open]:bg-neutral-50">
											<div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
												<span className="truncate text-sm font-semibold text-gray-900">
													{group.label}
												</span>
												<span className="text-xs font-medium tabular-nums text-gray-500">
													{group.items.length}
												</span>
											</div>
										</AccordionTrigger>
										<AccordionContent className="pb-0">
											<div className="divide-y divide-gray-100">
												{group.items.map((item) => {
													const states = parseStateDrafts(item.states);
													const steps = parseStepDrafts(item.steps);
													const isSelected = item.id === selectedWorkflow?.id && !isEditing;
													return (
														<button
															key={item.id}
															type="button"
															onClick={() => setSelectedTemplate(item.id)}
															className={`block w-full px-3 py-3 text-left transition-colors ${
																isSelected
																	? "bg-orange-50/70 ring-1 ring-inset ring-orange-200"
																	: "bg-white hover:bg-gray-50"
															}`}>
															<div className="flex min-w-0 items-start justify-between gap-3">
																<div className="min-w-0">
																	<p className="truncate text-sm font-semibold leading-5 text-gray-900">
																		{getWorkflowName(item)}
																	</p>
																	<p className="mt-0.5 truncate font-mono text-xs text-gray-500">
																		{item.code || item.id}
																	</p>
																</div>
																<Badge variant="warning" className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-white">
																	{item.currentStateKey || "OPEN"}
																</Badge>
															</div>
															<div className="mt-2 flex flex-wrap items-center gap-1.5">
																{item.requestType ? (
																	<Badge variant="outline" className="rounded-md px-2 py-0.5 text-[11px]">
																		{formatRequestType(item.requestType)}
																	</Badge>
																) : null}
																<span className="text-xs text-gray-500">
																	{steps.length} steps / {states.length} states
																</span>
															</div>
														</button>
													);
												})}
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						)}
					</div>

					<div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
						<p className="text-xs text-gray-500">
							{visibleItems.length}
							{filteredItems.length > visibleItems.length ? ` of ${filteredItems.length}` : ""} template
							{filteredItems.length === 1 ? "" : "s"}
						</p>
						<p className="text-xs text-gray-500">Showing up to {pageSize}</p>
					</div>
				</aside>

				<main className="min-w-0">
					{isEditing ? (
						<EditorPane
							mode={action as EditorMode}
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
					) : selectedWorkflow && !isLoadingDetail ? (
						<DetailPane workflow={selectedWorkflow} onEdit={startEdit} onDelete={startDelete} />
					) : (
						<div className="flex min-h-[420px] items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-500">
							{isLoadingDetail ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-600" />
									Loading template
								</>
							) : (
								"Select a workflow template."
							)}
						</div>
					)}
				</main>
			</div>

			<Modal
				open={action === "delete"}
				onOpenChange={(open) => {
					if (!open) closeAction();
				}}
				title="Delete Workflow Template"
				description="This soft-deletes the template from the workflow template list."
				className="max-w-lg">
				<div className="space-y-3">
					<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
						Delete{" "}
						<span className="font-semibold">
							{getWorkflowName(selectedWorkflow)}
						</span>
						? Runtime workflow records are not edited from this page.
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={closeAction}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={confirmDelete}
							disabled={deleteMutation.isPending}>
							{deleteMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Deleting...
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

function WorkflowCoveragePanel({
	totalTemplates,
	visibleTemplates,
	coverage,
}: {
	totalTemplates: number;
	visibleTemplates: number;
	coverage: {
		covered: Set<string>;
		missing: WorkflowCoverageItem[];
		requestCovered: number;
		requestTotal: number;
	};
}) {
	const missingPreview = coverage.missing.slice(0, 10);
	const hiddenMissingCount = Math.max(coverage.missing.length - missingPreview.length, 0);

	return (
		<section className="rounded-lg border border-gray-200 bg-white p-3">
			<div className="grid gap-2 md:grid-cols-4">
				<CoverageMetric label="Templates" value={String(totalTemplates)} />
				<CoverageMetric
					label="Shown"
					value={visibleTemplates === totalTemplates ? String(visibleTemplates) : `${visibleTemplates}/${totalTemplates}`}
				/>
				<CoverageMetric
					label="Request Types"
					value={`${coverage.requestCovered}/${coverage.requestTotal}`}
					tone={coverage.requestCovered === coverage.requestTotal ? "default" : "warning"}
				/>
				<CoverageMetric
					label="Coverage Gaps"
					value={String(coverage.missing.length)}
					tone={coverage.missing.length === 0 ? "default" : "warning"}
				/>
			</div>
			{coverage.missing.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
					{missingPreview.map((item) => (
						<Badge
							key={item.key}
							variant="outline"
							className="rounded-md border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
							{item.label}
						</Badge>
					))}
					{hiddenMissingCount > 0 ? (
						<Badge variant="outline" className="rounded-md px-2 py-0.5 text-[11px]">
							+{hiddenMissingCount} more
						</Badge>
					) : null}
				</div>
			) : null}
		</section>
	);
}

function CoverageMetric({
	label,
	value,
	tone = "default",
}: {
	label: string;
	value: string;
	tone?: "default" | "warning";
}) {
	return (
		<div className="min-w-0 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
			<p className="truncate text-xs font-medium text-gray-500">{label}</p>
			<p className={tone === "warning" ? "mt-1 text-sm font-semibold text-amber-800" : "mt-1 text-sm font-semibold text-gray-900"}>
				{value}
			</p>
		</div>
	);
}

function DetailPane({
	workflow,
	onEdit,
	onDelete,
}: {
	workflow: WorkflowInstance;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const states = normalizeStates(parseStateDrafts(workflow.states));
	const steps = normalizeSteps(parseStepDrafts(workflow.steps));

	return (
		<div className="space-y-3">
			<div className="rounded-lg border border-gray-200 bg-white p-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<h2 className="min-w-0 break-words text-base font-semibold leading-6 text-gray-900">
								{getWorkflowName(workflow)}
							</h2>
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-1.5">
							<Badge className="rounded-md bg-slate-700 px-2 py-1 text-[11px] text-white hover:bg-slate-700">
								{formatDomainLabel(workflow.domain)}
							</Badge>
							{workflow.requestType ? (
								<Badge variant="outline" className="rounded-md px-2 py-1 text-[11px]">
									{formatRequestType(workflow.requestType)}
								</Badge>
							) : null}
							<Badge variant="warning" className="rounded-md px-2 py-1 text-[11px] text-white">
								{workflow.currentStateKey || "OPEN"}
							</Badge>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" className="h-9 rounded-md" onClick={onDelete}>
							<Trash2 className="h-4 w-4" />
							Delete
						</Button>
						<Button type="button" variant="outline" className="h-9 rounded-md" onClick={onEdit}>
							<Edit className="h-4 w-4" />
							Configure
						</Button>
					</div>
				</div>
			</div>

			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
				<section className="min-w-0 rounded-lg border border-gray-200 bg-white">
					<div className="flex min-h-11 items-center justify-between border-b border-gray-100 px-4 py-2">
						<h3 className="text-sm font-semibold text-gray-900">Step Flow</h3>
						<span className="text-xs text-gray-500">{steps.length} configured</span>
					</div>
					<div className="divide-y divide-gray-100">
						{steps.map((step) => (
							<div key={`${step.step_number}-${step.step_name}`} className="p-3">
								<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
									<div className="min-w-0">
										<p className="break-words text-sm font-semibold text-gray-900">
											{step.step_number}. {step.step_name}
										</p>
										<div className="mt-1 flex flex-wrap items-center gap-1.5">
											<Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px] text-white">
												{step.step_type}
											</Badge>
											<Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px] text-white">
												{step.assignee_type}
											</Badge>
											<Badge
												variant={step.is_required === false ? "outline" : "warning"}
												className={`rounded-md px-2 py-0.5 text-[11px] ${
													step.is_required === false ? "" : "text-white"
												}`}>
												{step.is_required === false ? "Optional" : "Required"}
											</Badge>
										</div>
									</div>
								</div>
								<div className="mt-2 flex flex-wrap gap-1.5">
									{getStepTransitions(step).map(([label, value]) => (
										<span
											key={`${step.step_number}-${label}-${value}`}
											className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700">
											<span className="text-gray-500">{label}</span>
											<span className="max-w-[180px] truncate font-mono text-gray-900">{value}</span>
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</section>

				<section className="min-w-0 rounded-lg border border-gray-200 bg-white">
					<div className="flex min-h-11 items-center justify-between border-b border-gray-100 px-4 py-2">
						<h3 className="text-sm font-semibold text-gray-900">State Catalog</h3>
						<span className="text-xs text-gray-500">{states.length} states</span>
					</div>
					<div className="divide-y divide-gray-100">
						{states.map((state) => (
							<div key={`${state.order}-${state.key}`} className="flex items-start justify-between gap-3 px-3 py-2">
								<div className="min-w-0">
									<p className="truncate font-mono text-xs font-semibold text-gray-900">{state.key}</p>
									<p className="truncate text-xs text-gray-500">{state.label}</p>
								</div>
								<div className="flex shrink-0 items-center gap-1.5">
									<Badge variant="outline" className="rounded-md px-2 py-0.5 text-[11px]">
										#{state.order + 1}
									</Badge>
									{state.isTerminal ? (
										<Badge variant="warning" className="rounded-md px-2 py-0.5 text-[11px] text-white">
											Terminal
										</Badge>
									) : null}
								</div>
							</div>
						))}
					</div>
				</section>
			</div>
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
		<div className="space-y-3">
			<section className="rounded-lg border border-gray-200 bg-white p-3">
				<div className="mb-3 flex flex-col gap-3 border-b border-gray-100 pb-3 lg:flex-row lg:items-center lg:justify-between">
					<h2 className="text-base font-semibold text-gray-900">
						{mode === "edit" ? "Edit Workflow Template" : "Create Workflow Template"}
					</h2>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="outline" className="h-9 rounded-md" onClick={onCancel}>
							<X className="h-4 w-4" />
							Cancel
						</Button>
						<Button type="button" className="h-9 rounded-md bg-orange-600 text-white hover:bg-orange-700" disabled={isSaving} onClick={onSave}>
							{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
							{isSaving ? "Saving..." : "Save Template"}
						</Button>
					</div>
				</div>
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
								tokens={[
									{ label: "Required", tone: draft.requestType ? "default" : "invalid" },
								]}
							/>
						</Field>
					) : (
						<div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
							Request type not used
						</div>
					)}

					<Field label="Name">
						<Input
							value={draft.name}
							onChange={(event) => onChangeDraft({ ...draft, name: event.target.value })}
							placeholder="Leave request workflow"
							className="h-10 rounded-md border-gray-200 bg-white text-sm"
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
							className="h-10 rounded-md border-gray-200 bg-white font-mono text-sm"
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
							tokens={[
								{ label: "Match state", tone: errors.currentStateKey ? "invalid" : "default" },
							]}
						/>
					</Field>

					<Field label="Description">
						<Input
							value={draft.description}
							onChange={(event) => onChangeDraft({ ...draft, description: event.target.value })}
							placeholder="Admin-facing workflow summary"
							className="h-10 rounded-md border-gray-200 bg-white text-sm"
						/>
					</Field>
				</div>
			</section>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
				<section className="rounded-lg border border-gray-200 bg-white">
					<div className="flex min-h-11 items-center justify-between border-b border-gray-100 px-4 py-2">
						<h3 className="text-sm font-semibold text-gray-900">States</h3>
						<Button type="button" variant="outline" size="sm" className="h-8 rounded-md" onClick={onAddState}>
							<Plus className="h-4 w-4" />
							Add State
						</Button>
					</div>
					{errors.states ? <ErrorText>{errors.states}</ErrorText> : null}
					<Accordion
						type="multiple"
						defaultValue={draft.states.slice(0, 3).map((state) => state.id)}
						className="divide-y divide-gray-100">
						{draft.states.map((state, index) => (
							<AccordionItem key={state.id} value={state.id} className="border-b-0">
								<AccordionTrigger className="px-3 py-2.5 hover:no-underline data-[state=open]:bg-neutral-50">
									<div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
										<div className="min-w-0">
											<p className="truncate font-mono text-xs font-semibold text-gray-900">
												{state.key || `STATE_${index + 1}`}
											</p>
											<p className="truncate text-xs text-gray-500">
												State {index + 1} / {state.isTerminal ? "Terminal" : "Non-terminal"}
											</p>
										</div>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-3 pb-3">
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-semibold text-gray-500">State {index + 1}</span>
											<div className="flex gap-1">
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
										</div>
										<Input
											value={state.key}
											onChange={(event) => updateState(state.id, { key: event.target.value })}
											className="h-9 rounded-md border-gray-200 bg-white font-mono text-sm"
										/>
										<Input
											value={state.label}
											onChange={(event) => updateState(state.id, { label: event.target.value })}
											className="h-9 rounded-md border-gray-200 bg-white text-sm"
										/>
										<button
											type="button"
											onClick={() => updateState(state.id, { isTerminal: !state.isTerminal })}
											className={`h-8 rounded-md border px-2 text-xs font-medium ${
												state.isTerminal
													? "border-orange-200 bg-orange-50 text-orange-700"
													: "border-gray-200 bg-white text-gray-600"
											}`}>
											{state.isTerminal ? "Terminal state" : "Non-terminal"}
										</button>
									</div>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</section>

				<section className="rounded-lg border border-gray-200 bg-white">
					<div className="flex min-h-11 items-center justify-between border-b border-gray-100 px-4 py-2">
						<h3 className="text-sm font-semibold text-gray-900">Steps</h3>
						<Button type="button" variant="outline" size="sm" className="h-8 rounded-md" onClick={onAddStep}>
							<Plus className="h-4 w-4" />
							Add Step
						</Button>
					</div>
					{errors.steps ? <ErrorText>{errors.steps}</ErrorText> : null}
					{errors.transition ? <ErrorText>{errors.transition}</ErrorText> : null}
					<Accordion
						type="multiple"
						defaultValue={draft.steps.slice(0, 2).map((step) => step.id)}
						className="divide-y divide-gray-100">
						{draft.steps.map((step, index) => (
							<AccordionItem key={step.id} value={step.id} className="border-b-0">
								<AccordionTrigger className="px-3 py-2.5 hover:no-underline data-[state=open]:bg-neutral-50">
									<div className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-gray-900">
												{index + 1}. {step.step_name || `Step ${index + 1}`}
											</p>
											<p className="truncate text-xs text-gray-500">
												{step.step_type} / {step.assignee_type}
											</p>
										</div>
										<span
											className={`w-fit rounded-md border px-2 py-0.5 text-[11px] font-medium ${
												step.is_required !== false
													? "border-orange-200 bg-orange-50 text-orange-700"
													: "border-gray-200 bg-white text-gray-600"
											}`}>
											{step.is_required !== false ? "Required" : "Optional"}
										</span>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-3 pb-3">
									<div className="space-y-3">
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs font-semibold text-gray-500">Step {index + 1}</span>
											<div className="flex gap-1">
												<IconButton label="Move up" disabled={index === 0} onClick={() => onMoveStep(index, -1)}>
													<ArrowUp className="h-4 w-4" />
												</IconButton>
												<IconButton label="Move down" disabled={index === draft.steps.length - 1} onClick={() => onMoveStep(index, 1)}>
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
													className="h-9 rounded-md border-gray-200 bg-white text-sm"
												/>
											</Field>
											<div className="grid gap-3 sm:grid-cols-2">
												<Field label="Step Type">
													<Select
														value={step.step_type}
														onChange={(value) => updateStep(step.id, { step_type: value as WorkflowStepType })}
														options={STEP_TYPE_OPTIONS}
													/>
												</Field>
												<Field label="Assignee">
													<Select
														value={step.assignee_type}
														onChange={(value) => updateStep(step.id, { assignee_type: value as WorkflowAssigneeType })}
														options={ASSIGNEE_TYPE_OPTIONS}
													/>
												</Field>
											</div>
										</div>

										<button
											type="button"
											onClick={() => updateStep(step.id, { is_required: step.is_required === false })}
											className={`h-8 rounded-md border px-2 text-xs font-medium ${
												step.is_required !== false
													? "border-orange-200 bg-orange-50 text-orange-700"
													: "border-gray-200 bg-white text-gray-600"
											}`}>
											{step.is_required !== false ? "Required step" : "Optional step"}
										</button>

										<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
											{[
												["On Enter", "state_on_enter"],
												["On Approve", "state_on_approve"],
												["On Reject", "state_on_reject"],
												["On Complete", "state_on_complete"],
												["On Skip", "state_on_skip"],
											].map(([label, key]) => (
												<Field key={`${step.id}-${key}`} label={label}>
													<Select
														value={String((step as any)[key] || "")}
														onChange={(value) => updateStep(step.id, { [key]: value } as Partial<WorkflowStepDraft>)}
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
			<label className="text-xs font-medium text-gray-600">{label}</label>
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
			className="h-8 w-8 rounded-md p-0"
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			title={label}>
			{children}
		</Button>
	);
}

function ErrorText({ children }: { children: React.ReactNode }) {
	return <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{children}</div>;
}
