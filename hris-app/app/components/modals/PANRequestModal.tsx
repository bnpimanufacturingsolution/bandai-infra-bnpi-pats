import { useMemo, useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/atoms/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
	AlertCircle,
	Award,
	BadgeCheck,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	ClipboardCheck,
	DollarSign,
	FileText,
	Loader2,
	Repeat,
	Send,
	ShieldCheck,
	UserCheck,
	Users,
} from "lucide-react";
// import { useToastContext } from "~/lib/contexts/toast-context"; // Removed in favor of hook's toast or keep if needed, but we'll use hook's toast primarily or keep for custom messages.
import { useAuth } from "~/lib/hooks/useAuth";
import { useCreateRequest, useRequests } from "~/lib/hooks/useRequests";
import { useEmployee, useEmployeeAttendance, useEmployees } from "~/lib/hooks/useEmployees"; // Import useEmployee and useEmployees
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { differenceInCalendarDays, differenceInMonths, format, subDays } from "date-fns";
import type { RequestType } from "~/services/requests.service";
import type { Employee as ApiEmployee } from "~/services/employees.service";
import { cn } from "~/lib/utils";
import { toast } from "sonner";

// Types
import { type PANIntent } from "~/components/atoms/PANBadge";

interface PANRequestModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeObjectId: string | null; // Database ID (ObjectId), nullable if not open
	defaultIntent?: PANIntent;
	onEmployeeSelect?: (employeeId: string) => void;
	initialStep?: number;
	onStepChange?: (step: number) => void;
}

// Allowed actions
const ALLOWED_ACTIONS = [
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
] as const;
type AllowedAction = (typeof ALLOWED_ACTIONS)[number];
type SelectablePanEmployee = ApiEmployee & {
	reportTo?: {
		id?: string | null;
	} | null;
};
type WorkflowPreviewStep = {
	label: string;
	actorLabel: string;
	actorId?: string | null;
	status?: "auto" | "pending" | "system";
	hover: string;
};
type PromotionManagesPeople = "YES" | "NO";
const MANAGER_ACTIONS: AllowedAction[] = ["REGULARIZATION", "PROMOTION", "TRANSFER"];
const HR_ACTIONS: AllowedAction[] = [...ALLOWED_ACTIONS];
const NO_ACTIONS: AllowedAction[] = [];
const HR_ROLE_KEYS = new Set([
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
	"admin",
	"super_admin",
	"superadmin",
]);
const MANAGER_ROLE_KEYS = new Set(["hris-employee-manager"]);
const hasManagerProfileFlag = (employee?: Record<string, any> | null) =>
	employee?.isManager === true ||
	employee?.isManager === "true" ||
	employee?.isDepartmentManager === true;
const isTruthyManagerFlag = (value: unknown) => value === true || value === "true";
const PAN_REQUEST_TYPES = [
	"REGULARIZATION",
	"PROMOTION",
	"SALARY_CHANGE",
	"TRANSFER",
	"TERMINATION",
] as const;
const ACTIVE_REQUEST_STATES = new Set(["OPEN", "SUBMITTED", "APPROVED"]);
const STEPS = [
	{ label: "Choose Employee", icon: Users },
	{ label: "Choose PAN Type", icon: ClipboardCheck },
	{ label: "Review Eligibility", icon: ShieldCheck },
	{ label: "Recommend Action", icon: UserCheck },
	{ label: "Review & Submit", icon: Send },
];
const PAN_ACTION_CARDS: Record<AllowedAction, { label: string; helper: string; icon: any }> = {
	REGULARIZATION: {
		label: "Regularization",
		helper: "Confirm probation readiness",
		icon: BadgeCheck,
	},
	PROMOTION: {
		label: "Promotion",
		helper: "Recommend a higher role",
		icon: Award,
	},
	SALARY_CHANGE: {
		label: "Salary Change",
		helper: "Recommend pay adjustment",
		icon: DollarSign,
	},
	TRANSFER: {
		label: "Transfer",
		helper: "Move team, department, or site",
		icon: Repeat,
	},
	TERMINATION: {
		label: "Termination",
		helper: "HR-owned separation action",
		icon: AlertCircle,
	},
};
const COMPLETION_STEP_LABEL: Record<AllowedAction, string> = {
	REGULARIZATION: "Regularization Completion",
	PROMOTION: "Promotion Completion",
	SALARY_CHANGE: "Salary Change Completion",
	TRANSFER: "Transfer Completion",
	TERMINATION: "Termination Completion",
};

interface PANFormState {
	actionType: AllowedAction;
	effectiveDate: string;
	justification: string;
	// Regularization
	regularizationDate: string;
	performanceSummary: string;
	supervisorRecommendation: string;
	hrNotes: string;
	attendanceConfirmation: boolean;
	// Promotion
	newPosition: string;
	newPositionId: string;
	newSalary: string; // Keep as string for input, parse on submit
	promotionLevel: string;
	promotionManagesPeople: PromotionManagesPeople;
	reportInheritanceManagerId: string;
	directReportTransferIds: string[];
	// Transfer
	newDepartment: string;
	newLocation: string;
	newSupervisor: string;
	// Termination
	terminationType: string;
	lastWorkingDay: string;
	terminationReason: string;
	exitClearanceRequired: boolean;
	// Shared
	supervisorRemarks: string;
}

type ApiFieldError = {
	field?: string;
	message?: string;
};

export function PANRequestModal({
	isOpen,
	onClose,
	employeeObjectId,
	defaultIntent,
	onEmployeeSelect,
	initialStep,
	onStepChange,
}: PANRequestModalProps) {
	const { user } = useAuth();
	const { mutate: createRequest, isPending } = useCreateRequest({ showErrorToast: false });
	const formScrollRef = useRef<HTMLDivElement | null>(null);
	const wasOpenRef = useRef(false);

	// State for internal employee selection if not provided via props
	const [internalEmployeeId, setInternalEmployeeId] = useState<string | null>(employeeObjectId);
	const [step, setStep] = useState(0);
	const [shouldLoadEmployeeOptions, setShouldLoadEmployeeOptions] = useState(false);

	// Sync prop to internal state
	useEffect(() => {
		if (employeeObjectId) setInternalEmployeeId(employeeObjectId);
	}, [employeeObjectId]);

	const activeEmployeeId = employeeObjectId || internalEmployeeId;
	const getSafeStep = (value?: number | null) => {
		const nextStep = Number.isFinite(value) ? Number(value) : 0;
		if (!activeEmployeeId && nextStep > 0) return 0;
		return Math.max(0, Math.min(STEPS.length - 1, nextStep));
	};
	const updateStep = (next: number | ((current: number) => number)) => {
		setStep((current) => {
			const resolved = typeof next === "function" ? next(current) : next;
			const safeStep = getSafeStep(resolved);
			onStepChange?.(safeStep);
			return safeStep;
		});
	};
	const actorEmployeeId = user?.metadata?.employee?.id || "";
	const userRole = String(user?.role || user?.metadata?.employee?.role || "")
		.trim()
		.toLowerCase();
	const isHrOrAdmin = HR_ROLE_KEYS.has(userRole);
	const hasManagerMarker =
		MANAGER_ROLE_KEYS.has(userRole) || hasManagerProfileFlag(user?.metadata?.employee as any);

	// Update useEmployee to use activeEmployeeId
	const { data: employee, isLoading: isLoadingEmployee } = useEmployee(
		activeEmployeeId || "",
		undefined, // default fields
		undefined,
	);

	// Fetch the selection list only after the picker is opened. Manager flow
	// still scopes this client-side to the full reporting tree.
	const { data: employeesData, isLoading: isLoadingEmployees } = useEmployees(
		isOpen && shouldLoadEmployeeOptions
			? {
					page: 1,
					limit: 1000,
					count: false,
				}
			: undefined,
		{ enabled: isOpen && shouldLoadEmployeeOptions },
	);

	const employeesForSelection = useMemo<SelectablePanEmployee[]>(() => {
		const payload = employeesData as any;
		if (Array.isArray(payload?.employees)) return payload.employees as SelectablePanEmployee[];
		if (Array.isArray(payload?.data)) return payload.data as SelectablePanEmployee[];
		if (Array.isArray(payload?.data?.employees)) {
			return payload.data.employees as SelectablePanEmployee[];
		}
		return [];
	}, [employeesData]);

	const reportingTreeEmployeeIds = useMemo(() => {
		if (!actorEmployeeId) return new Set<string>();

		const childrenByManagerId = new Map<string, SelectablePanEmployee[]>();
		employeesForSelection.forEach((emp) => {
			const reportToId = String(emp.reportToId || emp.reportTo?.id || "").trim();
			if (!reportToId) return;
			const children = childrenByManagerId.get(reportToId) || [];
			children.push(emp);
			childrenByManagerId.set(reportToId, children);
		});

		const seenManagers = new Set<string>([actorEmployeeId]);
		const descendants = new Set<string>();
		const queue = [actorEmployeeId];

		while (queue.length > 0) {
			const managerId = queue.shift();
			if (!managerId) continue;

			const children = childrenByManagerId.get(managerId) || [];
			children.forEach((child) => {
				const childId = String(child.id || "").trim();
				if (!childId || seenManagers.has(childId)) return;
				seenManagers.add(childId);
				descendants.add(childId);
				queue.push(childId);
			});
		}

		return descendants;
	}, [actorEmployeeId, employeesForSelection]);

	const isSupervisorWithReports = reportingTreeEmployeeIds.size > 0;
	const isPanRecommender = hasManagerMarker || isSupervisorWithReports;
	const actionOptions = isHrOrAdmin
		? HR_ACTIONS
		: isPanRecommender
			? MANAGER_ACTIONS
			: NO_ACTIONS;
	const isGuidedManagerFlow = isPanRecommender && !isHrOrAdmin;

	const scopedEmployees = employeesForSelection.filter((emp) => {
		if (isHrOrAdmin) return true;
		if (!actorEmployeeId) return false;
		return reportingTreeEmployeeIds.has(emp.id);
	});

	const employeeOptions = scopedEmployees.map((emp) => ({
		value: emp.id,
		label: `${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""} (${emp.employeeId})`,
	}));

	const today = new Date();
	const attendanceFrom = subDays(today, 30).toISOString().split("T")[0];
	const attendanceTo = today.toISOString().split("T")[0];
	const { data: attendanceData, isLoading: isLoadingAttendance } = useEmployeeAttendance(
		activeEmployeeId || "",
		{
			page: 1,
			limit: 31,
			dateFrom: attendanceFrom,
			dateTo: attendanceTo,
			enabled: !!activeEmployeeId && isOpen,
		},
	);
	const { data: pendingPanData, isLoading: isLoadingPendingPan } = useRequests({
		page: 1,
		limit: 10,
		count: true,
		filter: PAN_REQUEST_TYPES.map((type) => ({ type, targetEmployeeId: activeEmployeeId })),
		enabled: !!activeEmployeeId && isOpen,
		fields: "code,type,currentWorkflowStateKey,createdAt,targetEmployeeId",
	});

	// Derived values from employee data
	// Derived values from employee data
	const employeeName = employee?.person?.personalInfo
		? `${employee.person.personalInfo.firstName || ""} ${employee.person.personalInfo.lastName || ""}`.trim() ||
			"Name Not Available"
		: "Loading...";
	const employeeDisplayId = employee?.employeeId || "N/A";
	const departmentStr = employee?.department?.name || "N/A";
	const positionStr = employee?.position?.title || "N/A";
	const levelStr = employee?.level?.name || "N/A";
	const currentLevelRank = typeof employee?.level?.rank === "number" ? employee.level.rank : null;
	const roleLevelStr = `${positionStr} / ${levelStr}`;
	const employmentStatusStr = employee?.employmentStatus || "N/A";
	const employmentTypeStr = employee?.employmentType || "N/A";
	const currentSalaryVal = employee?.basicSalary || 0;
	const workLocationStr = employee?.workLocation || "N/A";

	// We try to infer probation dates either from embedded schedule or direct fields if they existed
	// Schema shows probationEndDate, but start date might be employmentHireDate or similar
	const probationStartStr = employee?.employmentHireDate
		? new Date(employee.employmentHireDate).toISOString().split("T")[0]
		: "";
	const probationEndStr = employee?.probationEndDate
		? new Date(employee.probationEndDate).toISOString().split("T")[0]
		: "";
	const hireDateStr = employee?.employmentHireDate
		? new Date(employee.employmentHireDate).toISOString().split("T")[0]
		: "";
	const tenureLabel = employee?.employmentHireDate
		? `${Math.max(0, differenceInMonths(today, new Date(employee.employmentHireDate)))} months`
		: "N/A";
	const daysUntilProbationEnd = employee?.probationEndDate
		? differenceInCalendarDays(new Date(employee.probationEndDate), today)
		: null;
	const managerLabel =
		employee?.reportToId && employee.reportToId === actorEmployeeId
			? "You"
			: employee?.reportToId || "N/A";
	const getEmployeeNameById = (employeeId?: string | null) => {
		if (!employeeId) return "";
		if (employeeId === actorEmployeeId) return "You";
		const found = employeesForSelection.find((item) => item.id === employeeId);
		const name = found?.person?.personalInfo
			? `${found.person.personalInfo.firstName || ""} ${found.person.personalInfo.lastName || ""}`.trim()
			: "";
		return name || found?.employeeId || "";
	};
	const targetDepartmentManagerId = (employee as any)?.department?.managerId || null;
	const targetSupervisorId = employee?.reportToId || null;
	const targetDepartmentManagerName = getEmployeeNameById(targetDepartmentManagerId);
	const targetSupervisorName = getEmployeeNameById(targetSupervisorId);
	const isOutOfManagerScope =
		isGuidedManagerFlow &&
		!!activeEmployeeId &&
		!isLoadingEmployees &&
		!reportingTreeEmployeeIds.has(activeEmployeeId);
	const attendanceRows = attendanceData?.attendances || [];
	const attendanceSummary = useMemo(() => {
		const total = attendanceRows.length;
		const present = attendanceRows.filter((item) =>
			["PRESENT", "LATE", "HALF_DAY"].includes(String(item.status || "").toUpperCase()),
		).length;
		const late = attendanceRows.filter(
			(item) => String(item.status || "").toUpperCase() === "LATE",
		).length;
		const absent = attendanceRows.filter(
			(item) => String(item.status || "").toUpperCase() === "ABSENT",
		).length;

		return {
			total,
			present,
			late,
			absent,
			rate: total > 0 ? Math.round((present / total) * 100) : null,
		};
	}, [attendanceRows]);
	const pendingPanRequests = ((pendingPanData as any)?.requests || []).filter((request: any) =>
		ACTIVE_REQUEST_STATES.has(String(request.currentWorkflowStateKey || "").toUpperCase()),
	);
	const todayString = format(new Date(), "yyyy-MM-dd");

	const getSafeDefaultAction = (intent?: PANIntent): AllowedAction => {
		if (
			intent &&
			(ALLOWED_ACTIONS as readonly string[]).includes(intent) &&
			(actionOptions.length === 0 || actionOptions.includes(intent as AllowedAction))
		) {
			return intent as AllowedAction;
		}
		return actionOptions[0] || "PROMOTION";
	};

	const [formData, setFormData] = useState<PANFormState>({
		actionType: getSafeDefaultAction(defaultIntent),
		effectiveDate: todayString,
		justification: "",
		regularizationDate: todayString,
		performanceSummary: "",
		supervisorRecommendation: "",
		hrNotes: "",
		attendanceConfirmation: false,
		newPosition: "",
		newPositionId: "",
		newSalary: "",
		promotionLevel: "",
		promotionManagesPeople: "NO",
		reportInheritanceManagerId: "",
		directReportTransferIds: [],
		newDepartment: "",
		newLocation: "",
		newSupervisor: "",
		terminationType: "",
		lastWorkingDay: todayString,
		terminationReason: "",
		exitClearanceRequired: false,
		supervisorRemarks: "",
	});

	const businessApprovalStep: WorkflowPreviewStep = (() => {
		if (!activeEmployeeId || isLoadingEmployee) {
			return {
				label: "Business need approval",
				actorLabel: "Target department manager",
				status: "pending",
				hover: "The workflow resolves this from the selected employee's department.",
			};
		}

		if (targetDepartmentManagerId && targetDepartmentManagerId !== activeEmployeeId) {
			const isAutoApproved = targetDepartmentManagerId === actorEmployeeId;
			return {
				label: "Department manager approval",
				actorLabel: targetDepartmentManagerName || "Department manager",
				actorId: targetDepartmentManagerId,
				status: isAutoApproved ? "auto" : "pending",
				hover: isAutoApproved
					? "Auto-approved because you are the target employee's department manager."
					: "This approver owns the department business need for the selected employee.",
			};
		}

		if (targetSupervisorId && targetSupervisorId !== activeEmployeeId) {
			const isAutoApproved = targetSupervisorId === actorEmployeeId;
			return {
				label: "Supervisor fallback approval",
				actorLabel: targetSupervisorName || "Target supervisor",
				actorId: targetSupervisorId,
				status: isAutoApproved ? "auto" : "pending",
				hover: isAutoApproved
					? "Auto-approved because the department-manager step falls back to you as the target supervisor."
					: "Used when the target department manager is unavailable or is the target employee.",
			};
		}

		return {
			label: "HR fallback approval",
			actorLabel: "HR queue",
			status: "pending",
			hover: "Used when no safe department-manager or supervisor approver can be resolved.",
		};
	})();
	const workflowPreviewSteps: WorkflowPreviewStep[] = [
		{
			label: "Requester submission",
			actorLabel: "You",
			actorId: actorEmployeeId,
			status: "auto",
			hover: "Submission is completed when this PAN recommendation is created.",
		},
		businessApprovalStep,
		{
			label: "HR validation",
			actorLabel: "HR queue",
			status: "pending",
			hover: "HR validates policy, sensitive fields, and employee source-of-truth before completion.",
		},
		{
			label: COMPLETION_STEP_LABEL[formData.actionType],
			actorLabel: "System",
			status: "system",
			hover: "The system applies the approved employee-record update when the workflow completes.",
		},
	];
	const nextWorkflowStep =
		workflowPreviewSteps.find((item) => item.status !== "auto" && item.status !== "system") ||
		workflowPreviewSteps.find((item) => item.status === "system") ||
		workflowPreviewSteps[workflowPreviewSteps.length - 1];
	const nextWorkflowLabel =
		nextWorkflowStep.status === "system"
			? `${nextWorkflowStep.label}: ${nextWorkflowStep.actorLabel}`
			: nextWorkflowStep.actorLabel;

	const [errors, setErrors] = useState<Record<string, string>>({});

	const fieldStep: Record<string, number> = {
		employee: 0,
		actionType: 3,
		effectiveDate: 3,
		justification: 3,
		regularizationDate: 3,
		performanceSummary: 3,
		supervisorRecommendation: 3,
		attendanceConfirmation: 3,
		newPosition: 3,
		newPositionId: 3,
		newSalary: 3,
		promotionLevel: 3,
		promotionManagesPeople: 3,
		reportInheritanceManagerId: 3,
		newDepartment: 3,
		newSupervisor: 3,
		terminationType: 3,
		lastWorkingDay: 3,
		terminationReason: 3,
	};

	const fieldOrder = [
		"employee",
		"actionType",
		"effectiveDate",
		"justification",
		"regularizationDate",
		"performanceSummary",
		"supervisorRecommendation",
		"attendanceConfirmation",
		"newPosition",
		"newPositionId",
		"newSalary",
		"promotionLevel",
		"promotionManagesPeople",
		"reportInheritanceManagerId",
		"newDepartment",
		"newSupervisor",
		"terminationType",
		"lastWorkingDay",
		"terminationReason",
	];

	const normalizeErrorField = (field?: string) => {
		if (!field) return "form";
		const lastSegment = field.split(".").pop() || field;
		const aliases: Record<string, string> = {
			description: "justification",
			startDate: "effectiveDate",
			type: "actionType",
			panSubType: "actionType",
			recommendation: "supervisorRecommendation",
			performanceAssessment: "performanceSummary",
			newPositionId: "newPositionId",
			managesPeople: "promotionManagesPeople",
			inheritReportsFromManagerId: "reportInheritanceManagerId",
		};
		return aliases[lastSegment] || lastSegment;
	};

	const getFirstErrorField = (nextErrors: Record<string, string>) =>
		fieldOrder.find((field) => nextErrors[field]) || Object.keys(nextErrors)[0];

	const focusField = (field?: string) => {
		if (!field || typeof document === "undefined") return;
		window.requestAnimationFrame(() => {
			const escapedField = window.CSS?.escape ? window.CSS.escape(field) : field;
			const wrapper = formScrollRef.current?.querySelector<HTMLElement>(
				`[data-field-path="${escapedField}"]`,
			);
			const focusable = wrapper?.querySelector<HTMLElement>(
				"input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role='combobox']",
			);
			const target = focusable || wrapper;

			target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
			window.setTimeout(() => focusable?.focus({ preventScroll: true }), 250);
		});
	};

	const applyErrors = (
		nextErrors: Record<string, string>,
		options: { toastMessage?: string; targetStep?: number } = {},
	) => {
		setErrors(nextErrors);
		const firstField = getFirstErrorField(nextErrors);
		const firstMessage =
			options.toastMessage || nextErrors[firstField] || "Please fix the highlighted field";
		const nextStep = options.targetStep ?? fieldStep[firstField] ?? step;

		if (firstMessage) {
			toast.error(firstMessage, {
				description: "Please check the highlighted field.",
			});
		}

		if (nextStep !== step) {
			updateStep(nextStep);
		}
		focusField(firstField);
	};

	useEffect(() => {
		if (Object.keys(errors).length === 0) return;
		const firstField = getFirstErrorField(errors);
		if ((fieldStep[firstField] ?? step) === step) {
			focusField(firstField);
		}
	}, [errors, step]);

	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			const safeAction = getSafeDefaultAction(defaultIntent);
			const openingStep = getSafeStep(initialStep ?? (activeEmployeeId ? 1 : 0));
			setStep(openingStep);
			onStepChange?.(openingStep);
			setFormData({
				actionType: safeAction,
				effectiveDate: todayString,
				justification: "",
				regularizationDate: todayString,
				performanceSummary: "",
				supervisorRecommendation: "",
				hrNotes: "",
				attendanceConfirmation: false,
				newPosition: "",
				newPositionId: "",
				newSalary: "",
				promotionLevel: "",
				promotionManagesPeople: "NO",
				reportInheritanceManagerId: "",
				directReportTransferIds: [],
				newDepartment: "",
				newLocation: "",
				newSupervisor: "",
				terminationType: "",
				lastWorkingDay: todayString,
				terminationReason: "",
				exitClearanceRequired: false,
				supervisorRemarks: "",
			});
			setErrors({});
			wasOpenRef.current = true;
		} else {
			if (isOpen) return;
			wasOpenRef.current = false;
			setStep(0);
			setShouldLoadEmployeeOptions(false);
			// Reset internal selection if closing or opening fresh without prop
			if (!employeeObjectId) {
				setInternalEmployeeId(null);
			}
		}
	}, [isOpen, defaultIntent, employeeObjectId, actionOptions, todayString]);

	useEffect(() => {
		if (!isOpen || actionOptions.length === 0) return;
		if (actionOptions.includes(formData.actionType)) return;
		setFormData((prev) => ({
			...prev,
			actionType: getSafeDefaultAction(defaultIntent),
		}));
	}, [isOpen, actionOptions, defaultIntent, formData.actionType]);

	useEffect(() => {
		if (!isOpen || !wasOpenRef.current || initialStep === undefined) return;
		const safeStep = getSafeStep(initialStep);
		setStep((current) => (current === safeStep ? current : safeStep));
	}, [initialStep, isOpen, activeEmployeeId]);

	const { data: levelsData, isLoading: levelsLoading } = useLevels(
		{ page: 1, limit: 1000, sort: "rank", order: "asc" },
		{ enabled: isOpen && formData.actionType === "PROMOTION" },
	);
	const { data: positionsData, isLoading: positionsLoading } = usePositions(
		{ page: 1, limit: 1000, sort: "title", order: "asc" },
		{ enabled: isOpen && formData.actionType === "PROMOTION" },
	);
	const { data: departmentsData, isLoading: departmentsLoading } = useDepartments(
		{ page: 1, limit: 1000, sort: "name", order: "asc", filter: "isActive:true" },
		{ enabled: isOpen && formData.actionType === "TRANSFER" },
	);
	const levels = (levelsData as any)?.levels || (levelsData as any)?.data?.levels || [];
	const positions =
		(positionsData as any)?.positions || (positionsData as any)?.data?.positions || [];
	const currentPositionId = String(employee?.positionId || employee?.position?.id || "");
	const currentDepartmentId = String(employee?.departmentId || employee?.department?.id || "");
	const positionOptions = positions
		.filter((position: any) => position?.isActive !== false)
		.map((position: any) => ({
			value: String(position.id || position._id || ""),
			label: String(position.title || position.name || "Untitled position"),
			title: String(position.title || position.name || ""),
			departmentId: String(position.section?.departmentId || position.section?.department?.id || ""),
			levelIds: Array.isArray(position.levels)
				? position.levels
						.map((entry: any) =>
							String(entry?.level?.id || entry?.levelId || entry?.id || ""),
						)
						.filter(Boolean)
				: [],
		}))
		.filter((position: any) => position.value)
		.filter((position: any) => {
			if (position.value === currentPositionId) return true;
			if (!currentDepartmentId) return false;
			return position.departmentId === currentDepartmentId;
		})
		.sort((left: any, right: any) => left.label.localeCompare(right.label));
	const selectedPromotionPositionId = formData.newPositionId || currentPositionId;
	const selectedPromotionPosition = positionOptions.find(
		(position: any) => position.value === selectedPromotionPositionId,
	);
	const promotionPositionChanged =
		Boolean(selectedPromotionPositionId) &&
		Boolean(currentPositionId) &&
		selectedPromotionPositionId !== currentPositionId;
	const promotionLevelOptions = levels
		.filter((level: any) => level?.isActive !== false)
		.filter((level: any) => {
			const rank = typeof level?.rank === "number" ? level.rank : null;
			return currentLevelRank === null || rank === null || rank > currentLevelRank;
		})
		.sort((left: any, right: any) => {
			const leftRank = typeof left?.rank === "number" ? left.rank : Number.MAX_SAFE_INTEGER;
			const rightRank =
				typeof right?.rank === "number" ? right.rank : Number.MAX_SAFE_INTEGER;
			return leftRank - rightRank;
		});
	const selectedPromotionLevel = promotionLevelOptions.find(
		(level: any) => level.name === formData.promotionLevel,
	);
	const promotionTargetOptions = positionOptions.flatMap((position: any) => {
		const positionLevelIds = new Set(position.levelIds || []);
		const levelsForPosition =
			positionLevelIds.size > 0
				? promotionLevelOptions.filter((level: any) =>
						positionLevelIds.has(String(level.id)),
					)
				: promotionLevelOptions;

		return levelsForPosition.map((level: any) => ({
			value: `${position.value}::${level.id}`,
			label: `${position.title} / ${level.name}`,
			positionId: position.value,
			positionTitle: position.title,
			levelId: String(level.id || ""),
			levelName: String(level.name || ""),
			levelIsManager: isTruthyManagerFlag(level?.isManager),
		}));
	});
	const selectedPromotionTargetValue =
		selectedPromotionPositionId && selectedPromotionLevel?.id
			? `${selectedPromotionPositionId}::${selectedPromotionLevel.id}`
			: "";
	const selectedPromotionTarget = promotionTargetOptions.find(
		(target: any) => target.value === selectedPromotionTargetValue,
	);
	const departments =
		(departmentsData as any)?.departments || (departmentsData as any)?.data?.departments || [];
	const departmentOptions = departments
		.filter((department: any) => department?.isActive !== false)
		.map((department: any) => ({
			value: String(department.id || department._id || ""),
			label: String(department.name || department.code || "Unnamed department"),
			name: String(department.name || ""),
			managerId: String(department.managerId || ""),
		}))
		.filter((department: any) => department.value)
		.sort((left: any, right: any) => left.label.localeCompare(right.label));
	const selectedTransferDepartment = departmentOptions.find(
		(department: any) =>
			department.value === formData.newDepartment ||
			department.name === formData.newDepartment,
	);
	const selectedTransferDepartmentId = selectedTransferDepartment?.value || "";
	const directReportManagerIds = useMemo(() => {
		const managerIds = new Set<string>();
		employeesForSelection.forEach((emp) => {
			const reportToId = String(emp.reportToId || emp.reportTo?.id || "").trim();
			if (reportToId) managerIds.add(reportToId);
		});
		return managerIds;
	}, [employeesForSelection]);
	const activeTransferSupervisorEmployees = employeesForSelection.filter((emp) => {
		if (!selectedTransferDepartmentId) return false;
		if (emp.id === activeEmployeeId) return false;
		if (String(emp.employmentStatus || "").toUpperCase() !== "ACTIVE") return false;

		const isDepartmentManager = emp.id === selectedTransferDepartment?.managerId;
		const isInSelectedDepartment =
			String(emp.departmentId || emp.department?.id || "") === selectedTransferDepartmentId;
		const hasDirectReports = directReportManagerIds.has(emp.id);
		const isManagerRecord =
			hasManagerProfileFlag(emp as Record<string, any>) ||
			String(emp.role || "")
				.toLowerCase()
				.includes("manager") ||
			isTruthyManagerFlag((emp as any)?.level?.isManager);

		return (
			(isInSelectedDepartment || isDepartmentManager) && (hasDirectReports || isManagerRecord)
		);
	});
	const transferSupervisorSource =
		activeTransferSupervisorEmployees.length > 0
			? activeTransferSupervisorEmployees
			: employeesForSelection.filter((emp) => {
					if (!selectedTransferDepartmentId) return false;
					if (emp.id === activeEmployeeId) return false;
					if (String(emp.employmentStatus || "").toUpperCase() !== "ACTIVE") return false;
					return (
						String(emp.departmentId || emp.department?.id || "") ===
						selectedTransferDepartmentId
					);
				});
	const transferSupervisorOptions = transferSupervisorSource
		.map((emp) => {
			const fullName = emp.person?.personalInfo
				? `${emp.person.personalInfo.firstName || ""} ${emp.person.personalInfo.lastName || ""}`.trim()
				: "";
			return {
				value: emp.id,
				label: `${fullName || emp.employeeId || "Employee"}${emp.employeeId ? ` (${emp.employeeId})` : ""}`,
			};
		})
		.sort((left, right) => left.label.localeCompare(right.label));
	const selectedTransferSupervisor = transferSupervisorOptions.find(
		(supervisor) => supervisor.value === formData.newSupervisor,
	);
	const getEmployeeDisplayName = (emp?: SelectablePanEmployee | null) => {
		const fullName = emp?.person?.personalInfo
			? `${emp.person.personalInfo.firstName || ""} ${emp.person.personalInfo.lastName || ""}`.trim()
			: "";
		return fullName || emp?.employeeId || "Employee";
	};
	const promotionManagerOptions = Array.from(directReportManagerIds)
		.map((managerId) => employeesForSelection.find((emp) => emp.id === managerId))
		.filter((emp): emp is SelectablePanEmployee => Boolean(emp && emp.id !== activeEmployeeId))
		.filter((emp) => {
			if (!currentDepartmentId) return false;
			return String(emp.departmentId || emp.department?.id || "") === currentDepartmentId;
		})
		.map((emp) => ({
			value: emp.id,
			label: `${getEmployeeDisplayName(emp)}${emp.employeeId ? ` (${emp.employeeId})` : ""} - ${
				employeesForSelection.filter((report) => {
					const reportToId = String(
						report.reportToId || report.reportTo?.id || "",
					).trim();
					const reportDepartmentId = String(
						report.departmentId || report.department?.id || "",
					);
					return reportToId === emp.id && reportDepartmentId === currentDepartmentId;
				}).length
			} reports`,
		}))
		.sort((left, right) => left.label.localeCompare(right.label));
	const inheritableReports = employeesForSelection
		.filter((emp) => {
			const reportToId = String(emp.reportToId || emp.reportTo?.id || "").trim();
			const reportDepartmentId = String(emp.departmentId || emp.department?.id || "");
			return (
				reportToId &&
				reportToId === formData.reportInheritanceManagerId &&
				reportDepartmentId === currentDepartmentId
			);
		})
		.sort((left, right) =>
			getEmployeeDisplayName(left).localeCompare(getEmployeeDisplayName(right)),
		);
	const selectedInheritedReports = inheritableReports.filter((emp) =>
		formData.directReportTransferIds.includes(emp.id),
	);
	const selectedReportInheritanceManager = employeesForSelection.find(
		(emp) => emp.id === formData.reportInheritanceManagerId,
	);

	useEffect(() => {
		if (isOpen && (formData.actionType === "TRANSFER" || formData.actionType === "PROMOTION")) {
			setShouldLoadEmployeeOptions(true);
		}
	}, [formData.actionType, isOpen]);

	const handleChange = (field: keyof PANFormState, value: any) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		// Clear error for this field if it exists
		if (errors[field]) {
			setErrors((prev) => {
				const newErrors = { ...prev };
				delete newErrors[field];
				return newErrors;
			});
		}
	};

	const validate = (): Record<string, string> => {
		const newErrors: Record<string, string> = {};
		if (!activeEmployeeId) newErrors.employee = "Employee is required";
		if (isOutOfManagerScope) {
			newErrors.employee =
				"Managers can only submit PAN requests within their reporting tree";
		}
		if (!formData.effectiveDate) newErrors.effectiveDate = "Effective date is required";
		if (!formData.justification) newErrors.justification = "Business justification is required";

		if (formData.actionType === "REGULARIZATION") {
			if (!formData.regularizationDate)
				newErrors.regularizationDate = "Regularization date is required";
			if (!formData.performanceSummary || formData.performanceSummary.trim().length < 1)
				newErrors.performanceSummary = "Performance summary is required";
			if (!formData.supervisorRecommendation)
				newErrors.supervisorRecommendation = "Recommendation is required";
			if (isHrOrAdmin && !formData.attendanceConfirmation) {
				newErrors.attendanceConfirmation = "Must confirm attendance review";
			}
		}

		if (formData.actionType === "PROMOTION") {
			if (!isGuidedManagerFlow && (!formData.newSalary || Number(formData.newSalary) < 0))
				newErrors.newSalary = "New salary must be positive";
			if (!formData.promotionLevel) newErrors.promotionLevel = "Promotion level is required";
		}

		if (formData.actionType === "SALARY_CHANGE") {
			if (!formData.newSalary || Number(formData.newSalary) < 0) {
				newErrors.newSalary = "New salary must be positive";
			}
			if (!formData.justification || formData.justification.trim().length < 1) {
				newErrors.justification = "Justification is required";
			}
		}

		if (formData.actionType === "TRANSFER") {
			if (!formData.newDepartment) newErrors.newDepartment = "New department is required";
			if (!formData.newSupervisor) newErrors.newSupervisor = "Receiving manager is required";
		}

		if (formData.actionType === "TERMINATION") {
			if (!formData.terminationType)
				newErrors.terminationType = "Termination type is required";
			if (!formData.lastWorkingDay) newErrors.lastWorkingDay = "Last working day is required";
			if (!formData.terminationReason || formData.terminationReason.length < 1)
				newErrors.terminationReason = "Reason is required";
		}

		return newErrors;
	};

	const submitRequest = () => {
		const validationErrors = validate();
		if (Object.keys(validationErrors).length > 0) {
			applyErrors(validationErrors, { targetStep: 3 });
			return;
		}

		if (Object.keys(validationErrors).length === 0) {
			if (!user?.organizationId) {
				console.error("Organization ID not found");
				return;
			}

			if (!activeEmployeeId) {
				console.error("Target Employee ID not found");
				return;
			}

			if (actionOptions.length === 0) {
				console.error("Current actor cannot initiate personnel actions");
				return;
			}

			// Map fields to match Zod schema requirements
			const metadata = {
				...formData,
				// Map fields for backend validation
				type: formData.terminationType, // For termination validation
				explanation: formData.terminationReason || formData.justification,
				applicationMode: "IMMEDIATE",
				applicationStatus: "PENDING_WORKFLOW_COMPLETION",

				// Regularization Mapping
				performanceAssessment: formData.performanceSummary,
				recommendation: formData.supervisorRecommendation,
				initiatedByRole: isHrOrAdmin ? "HR" : "MANAGER",
				attendanceConfirmation:
					isHrOrAdmin && formData.attendanceConfirmation ? "CONFIRMED" : undefined,
				panSubType: formData.actionType,
				promotionLevelId: selectedPromotionLevel?.id,
				newPosition: promotionPositionChanged
					? selectedPromotionPosition?.title || formData.newPosition
					: undefined,
				newPositionId: promotionPositionChanged ? selectedPromotionPositionId : undefined,
				managesPeople: formData.promotionManagesPeople === "YES",
				inheritReportsFromManagerId: formData.reportInheritanceManagerId || undefined,
				inheritReportsFromManagerName: selectedReportInheritanceManager
					? getEmployeeDisplayName(selectedReportInheritanceManager)
					: undefined,
				directReportTransferIds: formData.directReportTransferIds,
				directReportTransferCount: formData.directReportTransferIds.length,
				newDepartment: selectedTransferDepartment?.name || formData.newDepartment,
				newDepartmentId: selectedTransferDepartment?.value || undefined,
				newSupervisor: selectedTransferSupervisor?.label || formData.newSupervisor,
				newSupervisorId: selectedTransferSupervisor?.value || undefined,
				proposed_values: {
					newSalary: formData.newSalary ? Number(formData.newSalary) : undefined,
					newPosition: promotionPositionChanged
						? selectedPromotionPosition?.title || formData.newPosition
						: undefined,
					newPositionId: promotionPositionChanged
						? selectedPromotionPositionId
						: undefined,
					promotionLevel: formData.promotionLevel || undefined,
					promotionLevelId: selectedPromotionLevel?.id,
					managesPeople: formData.promotionManagesPeople === "YES",
					orgChange:
						formData.actionType === "PROMOTION"
							? {
									inheritReportsFromManagerId:
										formData.reportInheritanceManagerId || undefined,
									inheritReportsFromManagerName: selectedReportInheritanceManager
										? getEmployeeDisplayName(selectedReportInheritanceManager)
										: undefined,
									directReportTransferIds: formData.directReportTransferIds,
									directReportTransferCount:
										formData.directReportTransferIds.length,
								}
							: undefined,
					newDepartment: selectedTransferDepartment?.name || undefined,
					newDepartmentId: selectedTransferDepartment?.value || undefined,
					newSupervisor: selectedTransferSupervisor?.label || undefined,
					newSupervisorId: selectedTransferSupervisor?.value || undefined,
					regularizationDate: formData.regularizationDate || undefined,
					terminationType: formData.terminationType || undefined,
					lastWorkingDay: formData.lastWorkingDay || undefined,
				},
			};

			const payload: any = {
				organizationId: user.organizationId,
				requesterId: actorEmployeeId || user.id, // Fallback to user ID if employee ID not set
				targetEmployeeId: activeEmployeeId,
				type: formData.actionType as RequestType,
				description: formData.justification,
				startDate: formData.effectiveDate, // Use effectiveDate as startDate
				metadata: metadata,
			};

			// Clean specific fields based on type if needed, or just send everything in metadata

			createRequest(payload, {
				onSuccess: () => {
					onClose();
				},
				onError: (error: any) => {
					const apiErrors: ApiFieldError[] = Array.isArray(error?.errors)
						? error.errors
						: [];
					const nextErrors = apiErrors.reduce(
						(acc: Record<string, string>, item: ApiFieldError) => {
							const field = normalizeErrorField(item?.field);
							acc[field] = item?.message || error?.message || "Invalid value";
							return acc;
						},
						{} as Record<string, string>,
					);
					const fallbackMessage =
						apiErrors[0]?.message || error?.message || "Unable to submit request";

					if (Object.keys(nextErrors).length > 0) {
						applyErrors(nextErrors, { toastMessage: fallbackMessage });
						return;
					}

					toast.error(fallbackMessage);
				},
			});
		}
	};

	const handlePrimaryAction = () => {
		if (step === STEPS.length - 1) {
			submitRequest();
			return;
		}

		goNext();
	};

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		submitRequest();
	};

	// Helper for label rendering
	const FieldLabel = ({
		htmlFor,
		children,
		required,
	}: {
		htmlFor?: string;
		children: React.ReactNode;
		required?: boolean;
	}) => (
		<Label
			htmlFor={htmlFor}
			className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
			{children} {required && <span className="text-red-500 ml-0.5">*</span>}
		</Label>
	);

	// Helper for error message
	const ErrorMsg = ({ name }: { name: string }) =>
		errors[name] ? (
			<p className="text-[0.8rem] font-medium text-red-500">{errors[name]}</p>
		) : null;

	const formatDate = (value?: string | null) => {
		if (!value) return "N/A";
		try {
			return format(new Date(value), "MMM d, yyyy");
		} catch {
			return value;
		}
	};

	const actionLabel = (action: AllowedAction) =>
		action
			.split("_")
			.map((part) => part.charAt(0) + part.slice(1).toLowerCase())
			.join(" ");

	const goNext = () => {
		const nextErrors: Record<string, string> = {};
		if (step === 0 && !activeEmployeeId) nextErrors.employee = "Employee is required";
		if (step === 1 && !formData.actionType) nextErrors.actionType = "PAN type is required";
		if (step === 2 && isOutOfManagerScope) {
			nextErrors.employee =
				"Managers can only submit PAN requests within their reporting tree";
		}
		if (step === 3) {
			const validationErrors = validate();
			if (Object.keys(validationErrors).length > 0) {
				applyErrors(validationErrors, { targetStep: 3 });
				return;
			}
		}
		if (Object.keys(nextErrors).length > 0) {
			applyErrors(nextErrors, { targetStep: step });
			return;
		}
		setErrors({});
		updateStep((current) => Math.min(STEPS.length - 1, current + 1));
	};

	const renderStepHeader = () => (
		<div className="flex items-center gap-4">
			<div className="flex gap-1">
				{STEPS.map((item, index) => (
					<div
						key={item.label}
						className={cn(
							"h-1.5 w-8 rounded-full transition-colors",
							step >= index ? "bg-orange-500" : "bg-gray-200",
						)}
					/>
				))}
			</div>
		</div>
	);

	const ReadOnlyFact = ({ label, value }: { label: string; value: React.ReactNode }) => (
		<div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
			<span className="block text-[11px] font-medium uppercase text-gray-500">{label}</span>
			<span className="text-sm font-semibold text-gray-900">{value}</span>
		</div>
	);

	const renderApproverText = (stepItem: WorkflowPreviewStep) => {
		const canLink =
			stepItem.actorId &&
			stepItem.actorId !== actorEmployeeId &&
			stepItem.actorLabel !== "System";
		const className = canLink
			? "font-semibold text-orange-700 underline-offset-2 hover:underline"
			: "font-semibold text-gray-900";

		if (canLink) {
			return (
				<a
					href={`/employee/${stepItem.actorId}?from=pan-request-modal`}
					className={className}
					title={stepItem.hover}>
					{stepItem.actorLabel}
				</a>
			);
		}

		return (
			<span className={className} title={stepItem.hover}>
				{stepItem.actorLabel}
			</span>
		);
	};

	const renderWorkflowPreview = () => (
		<div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-gray-800">
			<div className="flex flex-wrap items-center gap-1.5">
				<span title={nextWorkflowStep.hover}>
					{nextWorkflowStep.status === "system" ? "Next action:" : "Next approver:"}
				</span>
				{renderApproverText(nextWorkflowStep)}
			</div>
		</div>
	);

	const renderPromotionImpactSummary = () => {
		if (formData.actionType !== "PROMOTION") return null;

		const reportCount = formData.directReportTransferIds.length;
		const managesPeople = formData.promotionManagesPeople === "YES";

		return (
			<div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
				<div className="flex items-center justify-between gap-3">
					<h4 className="text-sm font-semibold text-orange-950">Organization impact</h4>
					<span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-orange-700">
						Simulation
					</span>
				</div>
				<div className="mt-3 space-y-2 text-sm text-gray-800">
					<div className="grid grid-cols-[120px_1fr] gap-3 rounded-lg bg-white px-3 py-2">
						<span className="text-xs font-medium uppercase text-gray-500">Level</span>
						<span>
							{levelStr} {"->"} {formData.promotionLevel || "Select new level"}
						</span>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-3 rounded-lg bg-white px-3 py-2">
						<span className="text-xs font-medium uppercase text-gray-500">
							Position
						</span>
						<span>
							{promotionPositionChanged
								? `${positionStr} -> ${selectedPromotionPosition?.title || "Selected position"}`
								: "No position change"}
						</span>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-3 rounded-lg bg-white px-3 py-2">
						<span className="text-xs font-medium uppercase text-gray-500">Reports</span>
						<span>
							{managesPeople
								? reportCount > 0
									? `${reportCount} selected report${reportCount === 1 ? "" : "s"} will be proposed for transfer to ${employeeName}.`
									: "Manager permissions may be proposed, but no report transfer is selected."
								: "No direct-report changes requested."}
						</span>
					</div>
					<div className="grid grid-cols-[120px_1fr] gap-3 rounded-lg bg-white px-3 py-2">
						<span className="text-xs font-medium uppercase text-gray-500">Access</span>
						<span>
							{managesPeople
								? "Manager approvals and manager dashboards may be granted after HR completion."
								: "No manager access change expected from this recommendation."}
						</span>
					</div>
				</div>
			</div>
		);
	};

	const renderChooseEmployee = () => (
		<div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Choose employee</h2>
				<p className="mt-1 text-sm text-gray-500">
					{isGuidedManagerFlow ? "Reporting tree only." : "Select the PAN target."}
				</p>
			</div>
			<div className="space-y-2" data-field-path="employee">
				<label className="text-sm font-medium text-gray-700">Employee</label>
				<SearchableSelect
					options={employeeOptions}
					value={internalEmployeeId || ""}
					onOpenChange={(open) => {
						if (open) setShouldLoadEmployeeOptions(true);
					}}
					onValueChange={(val) => {
						setInternalEmployeeId(val);
						if (onEmployeeSelect) onEmployeeSelect(val);
						if (errors.employee) {
							setErrors((prev) => {
								const next = { ...prev };
								delete next.employee;
								return next;
							});
						}
					}}
					placeholder={
						isLoadingEmployees
							? "Loading employees..."
							: !shouldLoadEmployeeOptions
								? "Open employee search..."
								: isGuidedManagerFlow
									? "Search reporting tree..."
									: "Search by name or ID..."
					}
					emptyText={
						isLoadingEmployees
							? "Loading employees..."
							: isGuidedManagerFlow
								? "No reporting-tree employee found."
								: "No employee found."
					}
					className={cn(
						"w-full",
						errors.employee && "border-red-500 ring-2 ring-red-100",
					)}
				/>
				<ErrorMsg name="employee" />
			</div>
			{activeEmployeeId && (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<ReadOnlyFact label="Selected employee" value={employeeName} />
					<ReadOnlyFact label="Employee ID" value={employeeDisplayId} />
				</div>
			)}
		</div>
	);

	const renderPanTypeSelect = () => (
		<div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Choose PAN type</h2>
				<p className="mt-1 text-sm text-gray-500">
					Pick the personnel action before checking eligibility.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{actionOptions.map((action) => {
					const item = PAN_ACTION_CARDS[action];
					const Icon = item.icon;
					const isSelected = formData.actionType === action;
					return (
						<button
							key={action}
							type="button"
							onClick={() => !defaultIntent && handleChange("actionType", action)}
							disabled={!!defaultIntent && !isSelected}
							className={cn(
								"flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
								isSelected
									? "border-orange-500 bg-orange-50 ring-1 ring-orange-500"
									: "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50",
								!!defaultIntent && !isSelected && "cursor-not-allowed opacity-50",
							)}>
							<div
								className={cn(
									"flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
									isSelected
										? "bg-orange-100 text-orange-600"
										: "bg-gray-100 text-gray-500",
								)}>
								<Icon className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<p
									className={cn(
										"text-sm font-semibold",
										isSelected ? "text-orange-900" : "text-gray-800",
									)}>
									{item.label}
								</p>
								<p className="mt-0.5 text-xs text-gray-500">{item.helper}</p>
							</div>
						</button>
					);
				})}
			</div>
			<ErrorMsg name="actionType" />
		</div>
	);

	const renderEligibility = () => (
		<div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Review eligibility</h2>
				<p className="mt-1 text-sm text-gray-500">
					Confirm this employee is ready for{" "}
					{actionLabel(formData.actionType).toLowerCase()}.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<ReadOnlyFact label="Employee" value={`${employeeName} (${employeeDisplayId})`} />
				<ReadOnlyFact label="Current Position" value={positionStr} />
				<ReadOnlyFact label="Employee ID" value={employeeDisplayId} />
				<ReadOnlyFact label="Department" value={departmentStr} />
				<ReadOnlyFact label="Employment Type" value={employmentTypeStr} />
				<ReadOnlyFact label="Status" value={employmentStatusStr} />
				<ReadOnlyFact
					label="Hire Date"
					value={`${formatDate(hireDateStr)} / ${tenureLabel}`}
				/>
				<ReadOnlyFact
					label="Probation End"
					value={
						probationEndStr
							? `${formatDate(probationEndStr)}${
									daysUntilProbationEnd !== null
										? ` (${daysUntilProbationEnd} days)`
										: ""
								}`
							: "N/A"
					}
				/>
			</div>
			<div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
				<div className="flex items-center justify-between gap-3 text-sm">
					<div>
						<p className="font-semibold text-gray-900">Attendance</p>
						<p className="text-gray-500">Last 30 days</p>
					</div>
					<p className="font-semibold text-gray-900">
						{isLoadingAttendance
							? "..."
							: attendanceSummary.rate !== null
								? `${attendanceSummary.rate}%`
								: "N/A"}
					</p>
				</div>
				<div className="mt-3 flex gap-2 text-xs text-gray-600">
					<span>Present {attendanceSummary.present}</span>
					<span>Late {attendanceSummary.late}</span>
					<span>Absent {attendanceSummary.absent}</span>
				</div>
			</div>
			<div
				className={cn(
					"rounded-xl border p-3 text-sm",
					pendingPanRequests.length > 0
						? "border-amber-100 bg-amber-50 text-amber-800"
						: "border-emerald-100 bg-emerald-50 text-emerald-700",
				)}>
				{isLoadingPendingPan
					? "Checking active PAN requests..."
					: pendingPanRequests.length > 0
						? `${pendingPanRequests.length} active PAN request found`
						: "No active PAN requests found"}
			</div>
			{isOutOfManagerScope && (
				<div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
					Outside your reporting tree.
				</div>
			)}
			{renderWorkflowPreview()}
		</div>
	);

	const renderActionTypeSelect = () => (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div className="space-y-2" data-field-path="actionType">
				<FieldLabel required>PAN Type</FieldLabel>
				<Select
					value={formData.actionType}
					onValueChange={(val) => handleChange("actionType", val)}>
					<SelectTrigger aria-invalid={Boolean(errors.actionType)}>
						<SelectValue placeholder="Select PAN type" />
					</SelectTrigger>
					<SelectContent>
						{actionOptions.map((action) => (
							<SelectItem key={action} value={action}>
								{actionLabel(action)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<ErrorMsg name="actionType" />
			</div>
			<div className="space-y-2" data-field-path="effectiveDate">
				<FieldLabel required>
					{isGuidedManagerFlow ? "Proposed Effective Date" : "Effective Date"}
				</FieldLabel>
				<CalendarDatePicker
					value={formData.effectiveDate}
					onChange={(val) => handleChange("effectiveDate", val)}
					minDate={new Date()}
					className={
						errors.effectiveDate ? "border-red-500 ring-2 ring-red-100" : undefined
					}
				/>
				<ErrorMsg name="effectiveDate" />
			</div>
		</div>
	);

	const renderRecommendationFields = () => (
		<div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Recommend action</h2>
				<p className="mt-1 text-sm text-gray-500">
					Manager input only. HR validates final employee-record changes.
				</p>
			</div>
			{renderActionTypeSelect()}
			<div className="space-y-2" data-field-path="justification">
				<FieldLabel required>Business Justification</FieldLabel>
				<Textarea
					placeholder="Explain the business reason and evidence for this recommendation..."
					value={formData.justification}
					onChange={(e) => handleChange("justification", e.target.value)}
					aria-invalid={Boolean(errors.justification)}
				/>
				<ErrorMsg name="justification" />
			</div>

			{formData.actionType === "REGULARIZATION" && (
				<div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
					<h4 className="text-sm font-medium text-primary">
						Regularization Recommendation
					</h4>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="space-y-2" data-field-path="regularizationDate">
							<FieldLabel required>Regularization Date</FieldLabel>
							<CalendarDatePicker
								value={formData.regularizationDate}
								onChange={(val) => handleChange("regularizationDate", val)}
								minDate={new Date()}
								className={
									errors.regularizationDate
										? "border-red-500 ring-2 ring-red-100"
										: undefined
								}
							/>
							<ErrorMsg name="regularizationDate" />
						</div>
						<div className="space-y-2" data-field-path="supervisorRecommendation">
							<FieldLabel required>Recommendation</FieldLabel>
							<Select
								value={formData.supervisorRecommendation}
								onValueChange={(val) =>
									handleChange("supervisorRecommendation", val)
								}>
								<SelectTrigger
									aria-invalid={Boolean(errors.supervisorRecommendation)}>
									<SelectValue placeholder="Select" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Recommend">Recommend</SelectItem>
									<SelectItem value="Do Not Recommend">
										Do Not Recommend
									</SelectItem>
								</SelectContent>
							</Select>
							<ErrorMsg name="supervisorRecommendation" />
						</div>
					</div>
					<div className="space-y-2" data-field-path="performanceSummary">
						<FieldLabel required>Performance Summary</FieldLabel>
						<Textarea
							placeholder="Summarize role output, attendance behavior, quality, training, and team fit..."
							value={formData.performanceSummary}
							onChange={(e) => handleChange("performanceSummary", e.target.value)}
							aria-invalid={Boolean(errors.performanceSummary)}
						/>
						<ErrorMsg name="performanceSummary" />
					</div>
				</div>
			)}

			{formData.actionType === "PROMOTION" && (
				<div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
					<h4 className="text-sm font-medium text-primary">Promotion Recommendation</h4>
					<div className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
						<span className="block text-[11px] font-medium uppercase text-gray-500">
							Current assignment
						</span>
						<span className="font-semibold text-gray-900">
							{positionStr} / {levelStr}
						</span>
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="space-y-2 md:col-span-2" data-field-path="promotionLevel">
							<FieldLabel required>Promotion Target</FieldLabel>
							<SearchableSelect
								options={promotionTargetOptions}
								value={selectedPromotionTargetValue}
								onValueChange={(value) => {
									const selected = promotionTargetOptions.find(
										(target: any) => target.value === value,
									);
									if (!selected) return;
									setFormData((prev) => ({
										...prev,
										newPositionId:
											selected.positionId === currentPositionId
												? ""
												: selected.positionId,
										newPosition: selected.positionTitle || "",
										promotionLevel: selected.levelName || "",
									}));
								}}
								placeholder={
									positionsLoading || levelsLoading
										? "Loading promotion targets..."
										: "Select target in current department..."
								}
								searchPlaceholder="Search position or level..."
								emptyText="No promotion target found."
								className={cn(
									"w-full bg-white",
									errors.promotionLevel && "border-red-500 ring-2 ring-red-100",
								)}
							/>
							<ErrorMsg name="promotionLevel" />
						</div>
						{!isGuidedManagerFlow && (
							<>
								<ReadOnlyFact
									label="Current Salary"
									value={currentSalaryVal.toString()}
								/>
								<div className="space-y-2" data-field-path="newSalary">
									<FieldLabel required>New Salary</FieldLabel>
									<Input
										type="number"
										value={formData.newSalary}
										onChange={(e) => handleChange("newSalary", e.target.value)}
										aria-invalid={Boolean(errors.newSalary)}
									/>
									<ErrorMsg name="newSalary" />
								</div>
							</>
						)}
					</div>
					<div className="rounded-xl border border-gray-200 bg-white p-4">
						<div className="space-y-3">
							<div data-field-path="promotionManagesPeople">
								<div className="flex items-start justify-between gap-3">
									<FieldLabel>Assign direct reports?</FieldLabel>
									<div className="flex flex-wrap justify-end gap-1.5">
										<span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
											{departmentStr}
										</span>
										{selectedPromotionTarget?.levelIsManager && (
											<span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
												Manager target
											</span>
										)}
									</div>
								</div>
								<p className="mt-1 text-xs text-gray-500">
									Moves selected employees to report to {employeeName} after
									approval.
								</p>
								<div className="mt-2 grid grid-cols-2 gap-2">
									{(["YES", "NO"] as PromotionManagesPeople[]).map((value) => (
										<button
											key={value}
											type="button"
											onClick={() =>
												setFormData((prev) => ({
													...prev,
													promotionManagesPeople: value,
													reportInheritanceManagerId:
														value === "YES"
															? prev.reportInheritanceManagerId
															: "",
													directReportTransferIds:
														value === "YES"
															? prev.directReportTransferIds
															: [],
												}))
											}
											className={cn(
												"rounded-lg border px-3 py-2 text-sm font-semibold",
												formData.promotionManagesPeople === value
													? "border-orange-500 bg-orange-50 text-orange-900"
													: "border-gray-200 bg-white text-gray-700",
											)}>
											{value === "YES" ? "Yes" : "No"}
										</button>
									))}
								</div>
							</div>
							{formData.promotionManagesPeople === "YES" && (
								<div className="space-y-3">
									<div
										className="space-y-2"
										data-field-path="reportInheritanceManagerId">
										<FieldLabel>Move reports from</FieldLabel>
										<SearchableSelect
											options={promotionManagerOptions}
											value={formData.reportInheritanceManagerId}
											onValueChange={(value) => {
												const nextReports = employeesForSelection
													.filter((emp) => {
														const reportToId = String(
															emp.reportToId ||
																emp.reportTo?.id ||
																"",
														).trim();
														const reportDepartmentId = String(
															emp.departmentId ||
																emp.department?.id ||
																"",
														);
														return (
															reportToId === value &&
															reportDepartmentId ===
																currentDepartmentId
														);
													})
													.map((emp) => emp.id);
												setFormData((prev) => ({
													...prev,
													reportInheritanceManagerId: value,
													directReportTransferIds: nextReports,
												}));
											}}
											placeholder={
												isLoadingEmployees
													? "Loading managers..."
													: "Select manager in current department..."
											}
											searchPlaceholder="Search managers..."
											emptyText="No manager with reports found."
											className="w-full bg-white"
										/>
									</div>
									{formData.reportInheritanceManagerId && (
										<div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
											<div className="mb-2 flex items-center justify-between gap-3">
												<p className="text-sm font-semibold text-gray-900">
													Reports to move
												</p>
												<p className="text-xs text-gray-500">
													{selectedInheritedReports.length} of{" "}
													{inheritableReports.length} selected
												</p>
											</div>
											<div className="max-h-44 space-y-2 overflow-y-auto pr-1">
												{inheritableReports.length > 0 ? (
													inheritableReports.map((report) => {
														const isChecked =
															formData.directReportTransferIds.includes(
																report.id,
															);
														return (
															<label
																key={report.id}
																className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
																<Checkbox
																	checked={isChecked}
																	onCheckedChange={(checked) => {
																		setFormData((prev) => ({
																			...prev,
																			directReportTransferIds:
																				checked
																					? [
																							...prev.directReportTransferIds,
																							report.id,
																						]
																					: prev.directReportTransferIds.filter(
																							(id) =>
																								id !==
																								report.id,
																						),
																		}));
																	}}
																/>
																<span className="min-w-0">
																	<span className="block font-medium text-gray-900">
																		{getEmployeeDisplayName(
																			report,
																		)}
																	</span>
																	<span className="block text-xs text-gray-500">
																		{report.employeeId ||
																			"No employee ID"}
																	</span>
																</span>
															</label>
														);
													})
												) : (
													<p className="text-sm text-gray-500">
														No direct reports found for this manager.
													</p>
												)}
											</div>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
					{renderPromotionImpactSummary()}
					<div className="space-y-2">
						<FieldLabel>Manager Evidence (Optional)</FieldLabel>
						<Textarea
							placeholder="Add evidence such as expanded responsibilities, leadership, performance trend, or readiness..."
							value={formData.supervisorRemarks}
							onChange={(e) => handleChange("supervisorRemarks", e.target.value)}
						/>
					</div>
				</div>
			)}

			{formData.actionType === "SALARY_CHANGE" && (
				<div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
					<h4 className="text-sm font-medium text-primary">
						{isGuidedManagerFlow
							? "Salary Change Recommendation"
							: "Salary Change Details"}
					</h4>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						{!isGuidedManagerFlow && (
							<ReadOnlyFact
								label="Current Salary"
								value={currentSalaryVal.toString()}
							/>
						)}
						<div className="space-y-2" data-field-path="newSalary">
							<FieldLabel required>
								{isGuidedManagerFlow ? "Recommended Salary" : "New Salary"}
							</FieldLabel>
							<Input
								type="number"
								min="0"
								value={formData.newSalary}
								onChange={(e) => handleChange("newSalary", e.target.value)}
								aria-invalid={Boolean(errors.newSalary)}
							/>
							<ErrorMsg name="newSalary" />
						</div>
					</div>
				</div>
			)}

			{formData.actionType === "TRANSFER" && (
				<div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
					<h4 className="text-sm font-medium text-primary">Transfer Recommendation</h4>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="space-y-2" data-field-path="newDepartment">
							<FieldLabel required>Recommended Department</FieldLabel>
							<SearchableSelect
								options={departmentOptions}
								value={formData.newDepartment}
								onValueChange={(value) => {
									handleChange("newDepartment", value);
									setFormData((prev) => ({ ...prev, newSupervisor: "" }));
								}}
								placeholder={
									departmentsLoading
										? "Loading departments..."
										: "Select department..."
								}
								searchPlaceholder="Search departments..."
								emptyText="No department found."
								className={cn(
									"w-full bg-white",
									errors.newDepartment && "border-red-500 ring-2 ring-red-100",
								)}
							/>
							<ErrorMsg name="newDepartment" />
						</div>
						<div className="space-y-2" data-field-path="newSupervisor">
							<FieldLabel required>Receiving Manager</FieldLabel>
							<SearchableSelect
								options={transferSupervisorOptions}
								value={formData.newSupervisor}
								onValueChange={(value) => handleChange("newSupervisor", value)}
								placeholder={
									!selectedTransferDepartmentId
										? "Select department first"
										: isLoadingEmployees
											? "Loading managers..."
											: "Select receiving manager..."
								}
								searchPlaceholder="Search managers..."
								emptyText={
									selectedTransferDepartmentId
										? "No employee found in this department."
										: "Select a department first."
								}
								disabled={!selectedTransferDepartmentId}
								className={cn(
									"w-full bg-white",
									errors.newSupervisor && "border-red-500 ring-2 ring-red-100",
								)}
							/>
							<ErrorMsg name="newSupervisor" />
						</div>
					</div>
				</div>
			)}

			{formData.actionType === "TERMINATION" && isHrOrAdmin && (
				<div className="space-y-4 rounded-lg border border-red-100 bg-white p-4">
					<h4 className="text-sm font-medium text-red-600">Termination Details</h4>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="space-y-2" data-field-path="terminationType">
							<FieldLabel required>Termination Type</FieldLabel>
							<Select
								value={formData.terminationType}
								onValueChange={(val) => handleChange("terminationType", val)}>
								<SelectTrigger aria-invalid={Boolean(errors.terminationType)}>
									<SelectValue placeholder="Select Type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Resignation">Resignation</SelectItem>
									<SelectItem value="End of Contract">End of Contract</SelectItem>
									<SelectItem value="Dismissal">Dismissal</SelectItem>
								</SelectContent>
							</Select>
							<ErrorMsg name="terminationType" />
						</div>
						<div className="space-y-2" data-field-path="lastWorkingDay">
							<FieldLabel required>Last Working Day</FieldLabel>
							<CalendarDatePicker
								value={formData.lastWorkingDay}
								onChange={(val) => handleChange("lastWorkingDay", val)}
								minDate={new Date()}
								className={
									errors.lastWorkingDay
										? "border-red-500 ring-2 ring-red-100"
										: undefined
								}
							/>
							<ErrorMsg name="lastWorkingDay" />
						</div>
					</div>
					<div className="space-y-2" data-field-path="terminationReason">
						<FieldLabel required>Termination Reason</FieldLabel>
						<Textarea
							placeholder="Official reason..."
							value={formData.terminationReason}
							onChange={(e) => handleChange("terminationReason", e.target.value)}
							aria-invalid={Boolean(errors.terminationReason)}
						/>
						<ErrorMsg name="terminationReason" />
					</div>
				</div>
			)}

			{isHrOrAdmin && formData.actionType === "REGULARIZATION" && (
				<div
					className="flex flex-row items-start space-x-3 space-y-0 rounded-md border bg-background p-4 shadow-sm"
					data-field-path="attendanceConfirmation">
					<Checkbox
						checked={formData.attendanceConfirmation}
						onCheckedChange={(val) => handleChange("attendanceConfirmation", !!val)}
						id="attendanceConfirmation"
						aria-invalid={Boolean(errors.attendanceConfirmation)}
					/>
					<div className="space-y-1 leading-none">
						<Label htmlFor="attendanceConfirmation">Attendance Confirmation</Label>
						<p className="text-sm text-muted-foreground">
							Confirm that HR has reviewed attendance standards for regularization.
						</p>
						<ErrorMsg name="attendanceConfirmation" />
					</div>
				</div>
			)}

			{isHrOrAdmin && (
				<div className="space-y-2">
					<FieldLabel>HR Notes (Optional)</FieldLabel>
					<Textarea
						placeholder="HR reference notes..."
						value={formData.hrNotes}
						onChange={(e) => handleChange("hrNotes", e.target.value)}
					/>
				</div>
			)}
		</div>
	);

	const renderReview = () => (
		<div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Review & submit</h2>
				<p className="mt-1 text-sm text-gray-500">Check the request before submission.</p>
			</div>
			<div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<ReadOnlyFact
						label="Employee"
						value={`${employeeName} (${employeeDisplayId})`}
					/>
					<ReadOnlyFact label="Action" value={actionLabel(formData.actionType)} />
					<ReadOnlyFact label="Effective" value={formatDate(formData.effectiveDate)} />
					<ReadOnlyFact label="Next" value={nextWorkflowLabel} />
				</div>
			</div>
			{renderWorkflowPreview()}
			<div className="rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-700">
				{formData.justification || "No justification provided yet."}
			</div>
			<div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
				Workflow request only. Record changes happen after completion.
			</div>
		</div>
	);

	const renderCurrentStep = () => {
		if (step === 0) return renderChooseEmployee();
		if (step === 1) return renderPanTypeSelect();
		if (step === 2) {
			return isLoadingEmployee ? (
				<div className="flex flex-col items-center justify-center py-10 space-y-4">
					<Loader2 className="h-10 w-10 animate-spin text-primary" />
					<p className="text-sm text-muted-foreground">Loading employee details...</p>
				</div>
			) : (
				renderEligibility()
			);
		}
		if (step === 3) return renderRecommendationFields();
		return renderReview();
	};

	const primaryActionLabel =
		step === STEPS.length - 1 ? (isPending ? "Submitting..." : "Submit Request") : "Continue";

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-h-[90vh] overflow-hidden gap-0 p-0 sm:max-w-xl">
				<div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
					<div className="flex items-center justify-between gap-4">
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
								<FileText className="h-5 w-5 text-primary" />
								Personnel Action Notice
							</DialogTitle>
						</DialogHeader>
						{renderStepHeader()}
					</div>
				</div>
				<div ref={formScrollRef} className="max-h-[calc(90vh-80px)] overflow-y-auto p-6">
					<div className="space-y-6">
						{actionOptions.length === 0 ? (
							<div className="rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-700">
								Your current role cannot initiate personnel action requests.
							</div>
						) : (
							renderCurrentStep()
						)}

						<div className="flex items-center justify-between gap-3 pt-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() =>
									step === 0 ? onClose() : updateStep((current) => current - 1)
								}
								disabled={isPending}>
								{step === 0 ? (
									"Cancel"
								) : (
									<>
										<ChevronLeft className="mr-2 h-4 w-4" />
										Back
									</>
								)}
							</Button>
							<Button
								type="button"
								onClick={handlePrimaryAction}
								disabled={isPending || actionOptions.length === 0}
								className="bg-red-600 text-white hover:bg-red-700">
								{isPending && step === STEPS.length - 1 ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : step === STEPS.length - 1 ? (
									<Send className="mr-2 h-4 w-4" />
								) : (
									<ChevronRight className="mr-2 h-4 w-4" />
								)}
								{primaryActionLabel}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 font-sans selection:bg-orange-100 selection:text-orange-900 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
				{/* Decorative Background Elements from Onboarding */}
				<div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 rounded-lg">
					<div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-orange-200/20 blur-[120px]" />
					<div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-red-200/20 blur-[120px]" />
				</div>

				<div className="relative z-10">
					<DialogHeader>
						<DialogTitle className="mb-2 text-xl font-semibold heading-premium flex items-center gap-2">
							<FileText className="w-5 h-5 text-primary" />
							Create Personnel Action Notice (PAN)
						</DialogTitle>
					</DialogHeader>

					{!activeEmployeeId ? (
						<div className="py-6 space-y-4">
							<div className="bg-blue-50 p-4 rounded-md border border-blue-100 flex gap-3 items-start">
								<AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
								<div>
									<h4 className="text-sm font-medium text-blue-900">
										Select an Employee
									</h4>
									<p className="text-xs text-blue-700 mt-1">
										Please select an employee to create a Personnel Action
										Notice for.
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Employee</Label>
								<SearchableSelect
									options={employeeOptions}
									value={internalEmployeeId || ""}
									onValueChange={(val) => {
										setInternalEmployeeId(val);
										if (onEmployeeSelect) onEmployeeSelect(val);
									}}
									placeholder="Search by name or ID..."
									className="w-full"
								/>
							</div>

							<div className="flex justify-end pt-4">
								<Button variant="ghost" onClick={onClose}>
									Cancel
								</Button>
							</div>
						</div>
					) : isLoadingEmployee ? (
						<div className="flex flex-col items-center justify-center py-10 space-y-4">
							<Loader2 className="w-10 h-10 text-primary animate-spin" />
							<p className="text-sm text-muted-foreground">
								Loading employee details...
							</p>
						</div>
					) : (
						<>
							<div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border text-sm mb-4">
								<div>
									<span className="text-muted-foreground block text-xs">
										Employee Name
									</span>
									<span className="font-medium">{employeeName}</span>
								</div>
								<div>
									<span className="text-muted-foreground block text-xs">
										Employee ID
									</span>
									<span className="font-medium">{employeeDisplayId}</span>
								</div>
								<div>
									<span className="text-muted-foreground block text-xs">
										Department
									</span>
									<span className="font-medium">{departmentStr}</span>
								</div>
								<div>
									<span className="text-muted-foreground block text-xs">
										Current Position
									</span>
									<span className="font-medium">{positionStr}</span>
								</div>
								<div>
									<span className="text-muted-foreground block text-xs">
										Status
									</span>
									<span className="font-medium">{employmentStatusStr}</span>
								</div>
							</div>

							<form onSubmit={handleSubmit} className="space-y-4">
								{/* Common Fields */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<FieldLabel required>Action Type</FieldLabel>
										<Select
											value={formData.actionType}
											onValueChange={(val) => handleChange("actionType", val)}
											disabled={!!defaultIntent}>
											<SelectTrigger
												className={
													defaultIntent ? "opacity-100 bg-muted" : ""
												}>
												<SelectValue placeholder="Select Action" />
											</SelectTrigger>
											<SelectContent>
												{actionOptions.includes("REGULARIZATION") && (
													<SelectItem value="REGULARIZATION">
														Regularization
													</SelectItem>
												)}
												{actionOptions.includes("PROMOTION") && (
													<SelectItem value="PROMOTION">
														Promotion
													</SelectItem>
												)}
												{actionOptions.includes("SALARY_CHANGE") && (
													<SelectItem value="SALARY_CHANGE">
														Salary Change
													</SelectItem>
												)}
												{actionOptions.includes("TRANSFER") && (
													<SelectItem value="TRANSFER">
														Transfer
													</SelectItem>
												)}
												{actionOptions.includes("TERMINATION") && (
													<SelectItem value="TERMINATION">
														Termination
													</SelectItem>
												)}
											</SelectContent>
										</Select>
										<ErrorMsg name="actionType" />
									</div>

									<div className="space-y-2">
										<FieldLabel required>Effective Date</FieldLabel>
										<CalendarDatePicker
											value={formData.effectiveDate}
											onChange={(val) => handleChange("effectiveDate", val)}
											minDate={new Date()}
										/>
										<ErrorMsg name="effectiveDate" />
									</div>
								</div>

								<div className="space-y-2">
									<FieldLabel required>Business Justification</FieldLabel>
									<Textarea
										placeholder="Explain why this personnel action is needed..."
										value={formData.justification}
										onChange={(e) =>
											handleChange("justification", e.target.value)
										}
									/>
									<ErrorMsg name="justification" />
								</div>

								{/* Dynamic Fields */}
								{formData.actionType === "REGULARIZATION" && (
									<div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
										<h4 className="font-medium text-sm text-primary">
											Regularization Details
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<FieldLabel>Probation Start (Read-only)</FieldLabel>
												<Input
													value={probationStartStr || "N/A"}
													disabled
												/>
											</div>
											<div className="space-y-2">
												<FieldLabel>Probation End (Read-only)</FieldLabel>
												<Input value={probationEndStr || "N/A"} disabled />
											</div>
											<div className="space-y-2">
												<FieldLabel required>
													Regularization Date
												</FieldLabel>
												<CalendarDatePicker
													value={formData.regularizationDate}
													onChange={(val) =>
														handleChange("regularizationDate", val)
													}
													minDate={new Date()}
												/>
												<ErrorMsg name="regularizationDate" />
											</div>
											<div className="space-y-2">
												<FieldLabel required>Recommendation</FieldLabel>
												<Select
													value={formData.supervisorRecommendation}
													onValueChange={(val) =>
														handleChange(
															"supervisorRecommendation",
															val,
														)
													}>
													<SelectTrigger>
														<SelectValue placeholder="Select" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Recommend">
															Recommend
														</SelectItem>
														<SelectItem value="Do Not Recommend">
															Do Not Recommend
														</SelectItem>
													</SelectContent>
												</Select>
												<ErrorMsg name="supervisorRecommendation" />
											</div>
										</div>
										<div className="space-y-2">
											<FieldLabel required>Performance Summary</FieldLabel>
											<Textarea
												placeholder="Summary of performance..."
												value={formData.performanceSummary}
												onChange={(e) =>
													handleChange(
														"performanceSummary",
														e.target.value,
													)
												}
											/>
											<ErrorMsg name="performanceSummary" />
										</div>
										{isHrOrAdmin && (
											<div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-background">
												<Checkbox
													checked={formData.attendanceConfirmation}
													onCheckedChange={(val) =>
														handleChange(
															"attendanceConfirmation",
															!!val,
														)
													}
													id="attendanceConfirmation"
												/>
												<div className="space-y-1 leading-none">
													<Label htmlFor="attendanceConfirmation">
														Attendance Confirmation
													</Label>
													<p className="text-sm text-muted-foreground">
														Confirm that the employee has met the
														required attendance standards for
														regularization.
													</p>
													<ErrorMsg name="attendanceConfirmation" />
												</div>
											</div>
										)}
										{isHrOrAdmin && (
											<div className="space-y-2">
												<FieldLabel>HR Notes (Optional)</FieldLabel>
												<Textarea
													placeholder="HR reference notes..."
													value={formData.hrNotes}
													onChange={(e) =>
														handleChange("hrNotes", e.target.value)
													}
												/>
											</div>
										)}
									</div>
								)}

								{formData.actionType === "PROMOTION" && (
									<div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
										<h4 className="font-medium text-sm text-primary">
											Promotion Details
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<FieldLabel>Current Role / Level</FieldLabel>
												<Input value={roleLevelStr} disabled />
											</div>
											<div className="space-y-2">
												<FieldLabel required>New Salary</FieldLabel>
												<Input
													type="number"
													value={formData.newSalary}
													onChange={(e) =>
														handleChange("newSalary", e.target.value)
													}
												/>
												<ErrorMsg name="newSalary" />
											</div>
											<div className="space-y-2">
												<FieldLabel required>Promotion Level</FieldLabel>
												<Select
													value={formData.promotionLevel}
													onValueChange={(val) =>
														handleChange("promotionLevel", val)
													}>
													<SelectTrigger>
														<SelectValue placeholder="Select Level" />
													</SelectTrigger>
													<SelectContent>
														{levelsLoading ? (
															<div className="p-2 text-center text-sm text-muted-foreground">
																Loading levels...
															</div>
														) : promotionLevelOptions.length > 0 ? (
															promotionLevelOptions.map(
																(level: any) => (
																	<SelectItem
																		key={level.id}
																		value={level.name}>
																		{level.name}
																	</SelectItem>
																),
															)
														) : (
															<div className="p-2 text-center text-sm text-muted-foreground">
																No higher levels available
															</div>
														)}
													</SelectContent>
												</Select>
												<ErrorMsg name="promotionLevel" />
											</div>
										</div>
										<div className="space-y-2">
											<FieldLabel>Supervisor Remarks (Optional)</FieldLabel>
											<Textarea
												placeholder="Reason for promotion..."
												value={formData.supervisorRemarks}
												onChange={(e) =>
													handleChange(
														"supervisorRemarks",
														e.target.value,
													)
												}
											/>
										</div>
									</div>
								)}

								{formData.actionType === "SALARY_CHANGE" && (
									<div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
										<h4 className="font-medium text-sm text-primary">
											Salary Change Details
										</h4>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<div className="space-y-2">
												<FieldLabel>Current Salary</FieldLabel>
												<Input
													value={currentSalaryVal.toString()}
													disabled
												/>
											</div>
											<div className="space-y-2">
												<FieldLabel required>New Salary</FieldLabel>
												<Input
													type="number"
													min="0"
													value={formData.newSalary}
													onChange={(e) =>
														handleChange("newSalary", e.target.value)
													}
												/>
												<ErrorMsg name="newSalary" />
											</div>
										</div>
									</div>
								)}

								{formData.actionType === "TRANSFER" && (
									<div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
										<h4 className="font-medium text-sm text-primary">
											Transfer Details
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<FieldLabel required>New Department</FieldLabel>
												<SearchableSelect
													options={departmentOptions}
													value={formData.newDepartment}
													onValueChange={(value) => {
														handleChange("newDepartment", value);
														setFormData((prev) => ({
															...prev,
															newSupervisor: "",
														}));
													}}
													placeholder={
														departmentsLoading
															? "Loading departments..."
															: "Select department..."
													}
													searchPlaceholder="Search departments..."
													emptyText="No department found."
													className={cn(
														"w-full bg-white",
														errors.newDepartment &&
															"border-red-500 ring-2 ring-red-100",
													)}
												/>
												<ErrorMsg name="newDepartment" />
											</div>
											<div className="space-y-2">
												<FieldLabel required>Receiving Manager</FieldLabel>
												<SearchableSelect
													options={transferSupervisorOptions}
													value={formData.newSupervisor}
													onValueChange={(value) =>
														handleChange("newSupervisor", value)
													}
													placeholder={
														!selectedTransferDepartmentId
															? "Select department first"
															: isLoadingEmployees
																? "Loading managers..."
																: "Select receiving manager..."
													}
													searchPlaceholder="Search managers..."
													emptyText={
														selectedTransferDepartmentId
															? "No employee found in this department."
															: "Select a department first."
													}
													disabled={!selectedTransferDepartmentId}
													className={cn(
														"w-full bg-white",
														errors.newSupervisor &&
															"border-red-500 ring-2 ring-red-100",
													)}
												/>
												<ErrorMsg name="newSupervisor" />
											</div>
										</div>
									</div>
								)}

								{formData.actionType === "TERMINATION" && (
									<div className="space-y-4 border-t pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
										<h4 className="font-medium text-sm text-red-600">
											Termination Details
										</h4>
										<div className="bg-red-50 p-3 rounded-md border border-red-100 flex gap-2">
											<AlertCircle className="w-5 h-5 text-red-600" />
											<p className="text-xs text-red-800">
												Critical Action: Ensure all termination procedures
												are followed.
											</p>
										</div>
										<div className="grid grid-cols-2 gap-4">
											<div className="space-y-2">
												<FieldLabel required>Termination Type</FieldLabel>
												<Select
													value={formData.terminationType}
													onValueChange={(val) =>
														handleChange("terminationType", val)
													}>
													<SelectTrigger>
														<SelectValue placeholder="Select Type" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="Resignation">
															Resignation
														</SelectItem>
														<SelectItem value="End of Contract">
															End of Contract
														</SelectItem>
														<SelectItem value="Dismissal">
															Dismissal
														</SelectItem>
													</SelectContent>
												</Select>
												<ErrorMsg name="terminationType" />
											</div>
											<div className="space-y-2">
												<FieldLabel required>Last Working Day</FieldLabel>
												<CalendarDatePicker
													value={formData.lastWorkingDay}
													onChange={(val) =>
														handleChange("lastWorkingDay", val)
													}
													minDate={new Date()}
												/>
												<ErrorMsg name="lastWorkingDay" />
											</div>
										</div>
										<div className="space-y-2">
											<FieldLabel required>Termination Reason</FieldLabel>
											<Textarea
												placeholder="Official reason..."
												value={formData.terminationReason}
												onChange={(e) =>
													handleChange(
														"terminationReason",
														e.target.value,
													)
												}
											/>
											<ErrorMsg name="terminationReason" />
										</div>
										<div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-background">
											<Checkbox
												checked={formData.exitClearanceRequired}
												onCheckedChange={(val) =>
													handleChange("exitClearanceRequired", !!val)
												}
												id="exitClearanceRequired"
											/>
											<div className="space-y-1 leading-none">
												<Label htmlFor="exitClearanceRequired">
													Exit Clearance Required
												</Label>
												<p className="text-sm text-muted-foreground">
													Require exit clearance process for this
													employee.
												</p>
											</div>
										</div>
										<div className="space-y-2">
											<FieldLabel>Supervisor Remarks (Optional)</FieldLabel>
											<Textarea
												placeholder="Manager notes..."
												value={formData.supervisorRemarks}
												onChange={(e) =>
													handleChange(
														"supervisorRemarks",
														e.target.value,
													)
												}
											/>
										</div>
									</div>
								)}

								<div className="flex justify-end gap-3 pt-6 border-t mt-4">
									<Button
										type="button"
										variant="ghost"
										onClick={onClose}
										className="hover:bg-orange-50 hover:text-orange-700"
										disabled={isPending}>
										Cancel
									</Button>
									<Button
										type="submit"
										disabled={isPending}
										className="bg-primary text-white shadow-lg shadow-primary/20 border-0">
										{isPending ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												Submitting...
											</>
										) : (
											"Submit Request"
										)}
									</Button>
								</div>
							</form>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
