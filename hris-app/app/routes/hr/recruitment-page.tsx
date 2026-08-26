import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	Briefcase,
	Calendar,
	CheckCircle2,
	ExternalLink,
	FileText,
	GripVertical,
	LayoutGrid,
	Loader2,
	Plus,
	Search,
	Table2,
	UserCheck,
	XCircle,
	ChevronDown,
	X,
	Copy,
	History,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { Badge } from "~/components/atoms/Badge";
import { DatePicker } from "~/components/atoms/DatePicker";
import { Skeleton } from "~/components/ui/skeleton";
import { ProfileInitialsAvatar } from "~/components/atoms/ProfileInitialsAvatar";
import { TimePicker } from "~/components/molecules/TimePicker";
import { RecruitmentEmployeeTeaser } from "~/components/molecules/recruitment-employee-teaser";
import { DocumentFileViewer } from "~/components/molecules/document-file-viewer";
import { RecruitmentJobsManager } from "~/components/organisms/hr/RecruitmentJobsManager";
import { ApplicantIdentityHistory } from "~/components/organisms/hr/ApplicantIdentityHistory";
import {
	useApplicant,
	useApplicantAction,
	useApplicantsGrouped,
	useEmployees,
	useReserveEmployeeId,
	useShiftTypes,
	useUploadApplicantAttachment,
} from "~/lib/hooks";
import { queryKeys as applicantQueryKeys } from "~/lib/hooks/useApplicants";
import { useJobs } from "~/lib/hooks/use-job";
import { useWorkflowInstances } from "~/lib/hooks/useWorkflowEngine";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { useWorkSchedules } from "~/lib/hooks/useWorkSchedules";
import { useAuth } from "~/lib/hooks/use-auth";
import { toast } from "sonner";
import { Progress } from "~/components/ui/progress";
import type { ApplicantActionRequest } from "~/services/applicant.service";
import workforceRecruitmentSettingsService from "~/services/workforce-recruitment-settings.service";
import { cn } from "~/lib/utils";
import { deriveRoleAndFlags } from "~/lib/utils/role-derivation";
import type { WorkflowRuntimeState, WorkflowRuntimeStep } from "~/services/workflow-engine.service";
import { z } from "zod";

type WorkflowColumn = {
	key: string;
	label: string;
};

const getApplicantPositionTitle = (applicant: any): string =>
	applicant?.job?.position?.title || applicant?.position?.title || "No position";

const getApplicantLevelName = (applicant: any): string => applicant?.job?.level?.name || "";

const getGroupLabel = (applicants: any[], fallback: string): string => {
	const firstApplicant = applicants[0];
	if (!firstApplicant) return fallback;
	const position = getApplicantPositionTitle(firstApplicant);
	const level = getApplicantLevelName(firstApplicant);
	return level ? `${level} - ${position}` : position;
};

const getJobGroupLabel = (job: any, fallback: string): string => {
	const position = job?.position?.title || fallback;
	const level = job?.level?.name || "";
	return level ? `${level} - ${position}` : position;
};

const getJobTargetCount = (job: any): number => {
	const parsed = Number(job?.headcountRequested || 0);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const getApplicantRecruitmentScope = (applicant: any) => ({
	departmentId:
		String(
			applicant?.departmentId ||
				applicant?.department?.id ||
				applicant?.job?.departmentId ||
				applicant?.job?.department?.id ||
				applicant?.job?.position?.section?.departmentId ||
				applicant?.position?.section?.departmentId ||
				"",
		).trim() || undefined,
	sectionId:
		String(
			applicant?.sectionId ||
				applicant?.section?.id ||
				applicant?.job?.sectionId ||
				applicant?.job?.section?.id ||
				applicant?.job?.position?.sectionId ||
				applicant?.position?.sectionId ||
				"",
		).trim() || undefined,
	positionId:
		String(
			applicant?.positionId ||
				applicant?.position?.id ||
				applicant?.job?.positionId ||
				applicant?.job?.position?.id ||
				"",
		).trim() || undefined,
	levelId:
		String(applicant?.levelId || applicant?.level?.id || applicant?.job?.levelId || applicant?.job?.level?.id || "").trim() ||
		undefined,
});

const assertApplicantHeadcountCapacity = async (applicant: any) => {
	const context = await workforceRecruitmentSettingsService.getRequestContext(
		getApplicantRecruitmentScope(applicant),
	);
	const targetHeadcount = Number(context.policy?.targetHeadcount || 0);
	if (!context.settings.isEnabled || targetHeadcount <= 0) return;

	const currentHeadcount = Number(context.headcount.currentHeadcount || 0);
	const projectedHeadcount = currentHeadcount + 1;
	if (projectedHeadcount <= targetHeadcount) return;

	throw new Error(
		`Headcount target reached. Current headcount is ${currentHeadcount}; hiring this candidate would exceed the target of ${targetHeadcount}.`,
	);
};

const buildFullName = (applicant: any) => {
	const firstName = applicant?.person?.personalInfo?.firstName || "";
	const lastName = applicant?.person?.personalInfo?.lastName || "";
	return `${firstName} ${lastName}`.trim() || "Unknown Applicant";
};

const normalizeHireIdentityValue = (value: unknown) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");

const applicantMatchesLinkedEmployee = (applicant: any) => {
	const applicantInfo = applicant?.person?.personalInfo || {};
	const employeeInfo = applicant?.convertedToEmployee?.person?.personalInfo || {};
	const applicantFirst = normalizeHireIdentityValue(applicantInfo.firstName);
	const applicantLast = normalizeHireIdentityValue(applicantInfo.lastName);
	const employeeFirst = normalizeHireIdentityValue(employeeInfo.firstName);
	const employeeLast = normalizeHireIdentityValue(employeeInfo.lastName);
	if (!applicantFirst || !applicantLast || !employeeFirst || !employeeLast) {
		return false;
	}
	if (applicantFirst !== employeeFirst || applicantLast !== employeeLast) {
		return false;
	}
	const applicantEmail = normalizeHireIdentityValue(applicant?.person?.contactInfo?.email);
	const employeeEmail = normalizeHireIdentityValue(
		applicant?.convertedToEmployee?.person?.contactInfo?.email,
	);
	if (applicantEmail && employeeEmail && applicantEmail !== employeeEmail) {
		return false;
	}
	return true;
};

const isApplicantEmployeeLinked = (applicant: any) =>
	Boolean(applicant?.convertedToEmployeeId || applicant?.convertedToEmployee?.id);

const isApplicantHired = (applicant: any) =>
	String(applicant?.currentWorkflowStateKey || "").toUpperCase() === "HIRED" ||
	isApplicantEmployeeLinked(applicant);

const getApplicantBoardColumnKey = (applicant: any) =>
	isApplicantHired(applicant)
		? "HIRED"
		: String(applicant?.currentWorkflowStateKey || "").toUpperCase();

const getHiredApplicantCount = (applicants: any[]) =>
	applicants.filter(isApplicantHired).length;

const getApplicantJobGroupKey = (applicant: any) =>
	String(applicant?.jobId || applicant?.job?.id || "").trim();

const isRecruitmentStageMovementAction = (action?: string | null) =>
	[
		"ADVANCE",
		"APPROVE_STEP",
		"REJECT_STEP",
		"COMPLETE_STEP",
		"SCHEDULE_INTERVIEW",
		"SEND_OFFER",
		"MARK_ONBOARDING_READY",
		"MARK_HIRED",
	].includes(String(action || "").toUpperCase());

const FULL_RECRUITMENT_LOCK_MESSAGE =
	"This job is already full. Stage movement is locked for remaining candidates.";
const HIRED_RECRUITMENT_LOCK_MESSAGE = "Already hired. Employee record is the source of truth.";

const buildLegalPersonName = (pi: any) =>
	[pi?.firstName, pi?.middleName, pi?.lastName].filter(Boolean).join(" ").trim() || "";

/** Prefer nested `convertedToEmployee` only when it is the same person as the applicant. */
const resolveHireEmployeePresentation = (applicant: any) => {
	const emp = applicant?.convertedToEmployee;
	const empPi = emp?.person?.personalInfo;
	const fromEmp = empPi ? buildLegalPersonName(empPi) : "";
	const applicantName = buildFullName(applicant);
	const identityMatches = applicantMatchesLinkedEmployee(applicant);
	const displayName = identityMatches && fromEmp ? fromEmp : applicantName || fromEmp;
	const email = identityMatches
		? emp?.person?.contactInfo?.email ?? applicant?.person?.contactInfo?.email ?? null
		: applicant?.person?.contactInfo?.email ?? emp?.person?.contactInfo?.email ?? null;
	const employeeCode = emp?.employeeId ?? null;
	const role = emp?.position?.title ?? getApplicantPositionTitle(applicant);
	const level = emp?.level?.name || getApplicantLevelName(applicant) || null;
	const department = emp?.department?.name ?? null;
	const linkId = emp?.id ?? applicant?.convertedToEmployeeId ?? null;
	return {
		displayName,
		email,
		employeeCode,
		role,
		level,
		department,
		linkId,
		isLinked: Boolean(linkId),
		identityMatches,
		linkedEmployeeName: fromEmp || null,
	};
};

const getCurrentStepId = (applicant: any) =>
	applicant?.currentStepExecution?.id || applicant?.currentStepExecutionId || "";

const getEmployeeEditStepFromSetupField = (field?: string | null) => {
	const normalized = String(field || "").toLowerCase();
	if (normalized.startsWith("person.") || normalized.includes("contactinfo")) return 0;
	if (
		normalized.includes("role") ||
		normalized.includes("user.") ||
		normalized.includes("access")
	) {
		return 4;
	}
	return 1;
};

const buildStateLabelFromKey = (stateKey?: string | null) =>
	String(stateKey || "")
		.trim()
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const getStateLabel = (stateKey?: string | null, stateLabels: Record<string, string> = {}) =>
	stateLabels[String(stateKey || "").toUpperCase()] ||
	buildStateLabelFromKey(stateKey) ||
	"Unknown";

const buildWorkflowColumns = (
	workflowSource:
		| {
				states?: WorkflowRuntimeState[] | unknown;
				steps?: WorkflowRuntimeStep[] | unknown;
		  }
		| null
		| undefined,
): WorkflowColumn[] => {
	const stateRecords = Array.isArray(workflowSource?.states)
		? (workflowSource.states as WorkflowRuntimeState[])
		: [];
	const stepRecords = Array.isArray(workflowSource?.steps)
		? (workflowSource.steps as WorkflowRuntimeStep[])
		: [];
	const stateLabelMap = Object.fromEntries(
		stateRecords.map((state) => [String(state.key || "").toUpperCase(), state.label || ""]),
	) as Record<string, string>;
	const terminalStateKeys = new Set(
		stateRecords
			.filter((state) => state.isTerminal)
			.map((state) => String(state.key || "").toUpperCase()),
	);
	const orderedKeys: string[] = [];
	const addKey = (value?: string | null) => {
		const key = String(value || "")
			.trim()
			.toUpperCase();
		if (!key || orderedKeys.includes(key)) return;
		orderedKeys.push(key);
	};

	for (const step of stepRecords) {
		addKey(step.state_on_enter);
	}
	for (const state of [...stateRecords].sort((left, right) => left.order - right.order)) {
		if (state.isTerminal) addKey(state.key);
	}
	for (const state of [...stateRecords].sort((left, right) => left.order - right.order)) {
		addKey(state.key);
	}

	if (!orderedKeys.length) return [];

	const columns = orderedKeys.map((key) => ({
		key,
		label: stateLabelMap[key] || getStateLabel(key),
	}));

	const nonTerminal = columns.filter((column) => !terminalStateKeys.has(column.key));
	const terminal = columns.filter((column) => terminalStateKeys.has(column.key));
	return [...nonTerminal, ...terminal];
};

const formatCurrency = (applicant: any) =>
	applicant?.expectedSalary
		? `${applicant.currency || "PHP"} ${Number(applicant.expectedSalary).toLocaleString()}`
		: "Not provided";

const genderOptions = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "other", label: "Other" },
	{ value: "prefer_not_to_say", label: "Prefer not to say" },
];

const nationalityOptions = [
	{ value: "Filipino", label: "Filipino" },
	{ value: "American", label: "American" },
	{ value: "Australian", label: "Australian" },
	{ value: "British", label: "British" },
	{ value: "Canadian", label: "Canadian" },
	{ value: "Chinese", label: "Chinese" },
	{ value: "Indian", label: "Indian" },
	{ value: "Indonesian", label: "Indonesian" },
	{ value: "Japanese", label: "Japanese" },
	{ value: "Korean", label: "Korean" },
	{ value: "Malaysian", label: "Malaysian" },
	{ value: "Singaporean", label: "Singaporean" },
	{ value: "Thai", label: "Thai" },
	{ value: "Vietnamese", label: "Vietnamese" },
];

const employmentTypeOptions = [
	{ value: "PROBATIONARY", label: "Probationary" },
	{ value: "REGULAR", label: "Regular" },
	{ value: "CONTRACTUAL", label: "Contractual" },
	{ value: "PART_TIME", label: "Part-Time" },
	{ value: "CONSULTANT", label: "Consultant" },
	{ value: "INTERN", label: "Intern" },
];

const currencyOptions = [
	{ value: "PHP", label: "PHP" },
	{ value: "USD", label: "USD" },
	{ value: "EUR", label: "EUR" },
];

const payFrequencyOptions = [
	{ value: "SEMI_MONTHLY", label: "Semi-Monthly" },
	{ value: "MONTHLY", label: "Monthly" },
	{ value: "BIWEEKLY", label: "Bi-weekly" },
	{ value: "WEEKLY", label: "Weekly" },
	{ value: "DAILY", label: "Daily" },
];

const workLocationOptions = [
	{ value: "ONSITE", label: "Onsite" },
	{ value: "REMOTE", label: "Remote" },
	{ value: "HYBRID", label: "Hybrid" },
];

type PreHireFormDraft = {
	employeeId: string;
	firstName: string;
	lastName: string;
	email: string;
	dateOfBirth: string;
	gender: string;
	nationality: string;
	phoneCountryCode: string;
	phoneNumber: string;
	street: string;
	city: string;
	state: string;
	country: string;
	postalCode: string;
	departmentId: string;
	positionId: string;
	levelId: string;
	scheduleId: string;
	workLocation: string;
	employmentType: string;
	employmentHireDate: string;
	employmentStartDate: string;
	probationEndDate: string;
	reportToId: string;
	basicSalary: string;
	currency: string;
	payFrequency: string;
};

type PreHireFieldName = keyof PreHireFormDraft;

type PreHireSectionDefinition = {
	key: string;
	label: string;
	description: string;
	optional?: boolean;
	fields: PreHireFieldName[];
};

type PreHireFieldErrors = Partial<Record<PreHireFieldName, string>>;

type PreHireNotice = {
	tone: "error" | "success" | "info";
	title: string;
	detail?: string;
};

const preHireFieldLabels: Record<PreHireFieldName, string> = {
	employeeId: "Employee ID",
	firstName: "First Name",
	lastName: "Last Name",
	email: "Login Email",
	dateOfBirth: "Date of Birth",
	gender: "Gender",
	nationality: "Nationality",
	phoneCountryCode: "Country Code",
	phoneNumber: "Primary Phone",
	street: "Street Address",
	city: "City",
	state: "State / Province",
	country: "Country",
	postalCode: "Postal Code",
	departmentId: "Department",
	positionId: "Position",
	levelId: "Level",
	scheduleId: "Work Schedule",
	workLocation: "Work Location",
	employmentType: "Employment Type",
	employmentHireDate: "Hire Date",
	employmentStartDate: "Start Date",
	probationEndDate: "Probation End Date",
	reportToId: "Reports To",
	basicSalary: "Basic Salary",
	currency: "Currency",
	payFrequency: "Pay Frequency",
};

const preHireSectionDefinitions: PreHireSectionDefinition[] = [
	{
		key: "personal",
		label: "Personal details",
		description: "Core identity and contact details needed to create the employee profile.",
		fields: ["dateOfBirth", "gender", "nationality", "email", "phoneNumber"],
	},
	{
		key: "address",
		label: "Address",
		description: "Primary address details used for the employee record.",
		fields: ["street", "city", "country"],
	},
	{
		key: "employment",
		label: "Required setup",
		description: "Department, role, schedule, and employment start details.",
		fields: [
			"employeeId",
			"departmentId",
			"positionId",
			"scheduleId",
			"workLocation",
			"employmentType",
			"employmentHireDate",
			"employmentStartDate",
		],
	},
	{
		key: "payroll",
		label: "Salary and access",
		description: "Compensation details used before finalizing the hire.",
		fields: ["basicSalary", "currency", "payFrequency"],
	},
	{
		key: "optional",
		label: "Other details",
		description: "Helpful to complete now, but not always required to move forward.",
		optional: true,
		fields: ["state", "postalCode", "levelId", "reportToId", "probationEndDate"],
	},
];

const preHireFormSchema = z
	.object({
		employeeId: z.string().trim().min(1, "Employee ID is required"),
		firstName: z.string(),
		lastName: z.string(),
		email: z.string().trim().min(1, "Login email is required").email("Enter a valid email"),
		dateOfBirth: z.string().trim().min(1, "Date of birth is required"),
		gender: z.string().trim().min(1, "Gender is required"),
		nationality: z.string().trim().min(1, "Nationality is required"),
		phoneCountryCode: z.string(),
		phoneNumber: z.string().trim().min(1, "Primary phone is required"),
		street: z.string().trim().min(1, "Street address is required"),
		city: z.string().trim().min(1, "City is required"),
		state: z.string(),
		country: z.string().trim().min(1, "Country is required"),
		postalCode: z.string(),
		departmentId: z.string().trim().min(1, "Department is required"),
		positionId: z.string().trim().min(1, "Position is required"),
		levelId: z.string(),
		scheduleId: z.string().trim().min(1, "Work schedule is required"),
		workLocation: z.string().trim().min(1, "Work location is required"),
		employmentType: z.string().trim().min(1, "Employment type is required"),
		employmentHireDate: z.string().trim().min(1, "Hire date is required"),
		employmentStartDate: z.string().trim().min(1, "Start date is required"),
		probationEndDate: z.string(),
		reportToId: z.string(),
		basicSalary: z
			.string()
			.trim()
			.min(1, "Basic salary is required")
			.refine((value) => Number(value) > 0, "Basic salary must be greater than 0"),
		currency: z.string().trim().min(1, "Currency is required"),
		payFrequency: z.string().trim().min(1, "Pay frequency is required"),
	})
	.superRefine((value, context) => {
		if (value.employmentType === "PROBATIONARY" && !value.probationEndDate.trim()) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["probationEndDate"],
				message: "Probation end date is required for probationary hires",
			});
		}
	});

const buildPreHireFieldErrors = (form: PreHireFormDraft | null): PreHireFieldErrors => {
	if (!form) return {};
	const result = preHireFormSchema.safeParse(form);
	if (result.success) return {};

	const next: PreHireFieldErrors = {};
	for (const issue of result.error.issues) {
		const field = issue.path[0];
		if (typeof field !== "string") continue;
		const typedField = field as PreHireFieldName;
		if (next[typedField]) continue;
		next[typedField] = issue.message;
	}
	return next;
};

const buildPreHireValidationState = (form: PreHireFormDraft | null) => {
	const fieldErrors = buildPreHireFieldErrors(form);
	const sections = preHireSectionDefinitions.map((section) => ({
		...section,
		errorCount: section.fields.reduce(
			(count, field) => count + (fieldErrors[field] ? 1 : 0),
			0,
		),
	}));
	return {
		fieldErrors,
		sections,
		requiredErrorCount: sections
			.filter((section) => !section.optional)
			.reduce((count, section) => count + section.errorCount, 0),
	};
};

const getErrorMessage = (error: unknown) => {
	if (error instanceof Error && error.message.trim()) return error.message;
	const maybeMessage = (error as any)?.response?.data?.message || (error as any)?.message;
	return typeof maybeMessage === "string" && maybeMessage.trim()
		? maybeMessage
		: "Unable to save employee setup right now.";
};

const sanitizeGeneratedUsername = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

const formatDateInputValue = (value?: string | Date | null) => {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString().slice(0, 10);
};

const addMonthsToDateInputValue = (value: string, months: number) => {
	const [year, month, day] = String(value || "")
		.split("-")
		.map((part) => Number(part));
	if (!year || !month || !day) return "";
	const date = new Date(Date.UTC(year, month - 1, day));
	if (Number.isNaN(date.getTime())) return "";
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
};

const convertDateInputToUtc = (value?: string | null) => {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const parsed = new Date(`${raw}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const anchorIsoDateToMondayUtc = (isoString: string) => {
	const value = new Date(isoString);
	if (Number.isNaN(value.getTime())) return isoString;
	value.setUTCHours(0, 0, 0, 0);
	const day = value.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	value.setUTCDate(value.getUTCDate() + diff);
	return value.toISOString();
};

const normalizeRecruitmentShiftSnapshot = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object") return null;
	const timeSlots = Array.isArray(snapshot.timeSlots)
		? snapshot.timeSlots
				.filter(
					(slot: any) =>
						slot &&
						typeof slot.startTime === "string" &&
						typeof slot.endTime === "string" &&
						slot.startTime &&
						slot.endTime,
				)
				.map((slot: any) => ({
					type: String(slot.type || "work"),
					label: slot.label ? String(slot.label) : "",
					startTime: String(slot.startTime),
					endTime: String(slot.endTime),
				}))
		: [];

	return {
		name: snapshot.name ? String(snapshot.name) : "",
		code: snapshot.code ? String(snapshot.code) : "",
		isOvernight: Boolean(snapshot.isOvernight),
		isOff: Boolean(snapshot.isOff),
		timeSlots,
	};
};

const buildRecruitmentShiftSnapshotFromShiftType = (shiftType: any) => {
	if (!shiftType || typeof shiftType !== "object") return null;
	return normalizeRecruitmentShiftSnapshot({
		name: shiftType.name || "",
		code: shiftType.code || "",
		isOvernight: Boolean(shiftType.isOvernight),
		isOff: Boolean(shiftType.isOff),
		timeSlots: Array.isArray(shiftType.timeSlots) ? shiftType.timeSlots : [],
	});
};

const getRecruitmentRecordId = (value: any) => String(value?.id || value?._id || "").trim();

const buildRecruitmentScheduleLabel = (value: { code?: string | null; name?: string | null }) =>
	`${String(value.code || "").trim()} ${String(value.name || "Schedule").trim()}`.trim();

const normalizeRecruitmentScheduleRecord = (schedule: any) => {
	const id = getRecruitmentRecordId(schedule);
	return {
		...schedule,
		id,
		code: String(schedule?.code || "").trim(),
		name: String(schedule?.name || schedule?.templateName || "").trim(),
		cycleDays: [7, 14, 21, 28].includes(Number(schedule?.cycleDays))
			? Number(schedule.cycleDays)
			: 7,
		pattern: Array.isArray(schedule?.pattern) ? schedule.pattern : [],
	};
};

const normalizeRecruitmentScheduleSnapshot = (snapshot: any) => {
	if (!snapshot || typeof snapshot !== "object") return null;
	const cycleDays = [7, 14, 21, 28].includes(Number(snapshot?.cycleDays))
		? Number(snapshot.cycleDays)
		: 7;
	return {
		templateId: String(snapshot?.templateId || "").trim() || null,
		templateCode: String(snapshot?.templateCode || "").trim() || null,
		templateName: String(snapshot?.templateName || "").trim() || null,
		cycleDays,
		graceLateMinutes: Number(snapshot?.graceLateMinutes ?? 0),
		graceEarlyOutMinutes: Number(snapshot?.graceEarlyOutMinutes ?? 0),
		pattern: Array.isArray(snapshot?.pattern) ? snapshot.pattern : [],
		assignedByEmployeeId: snapshot?.assignedByEmployeeId || null,
		reason: String(snapshot?.reason || "").trim() || null,
		version: Number.isFinite(Number(snapshot?.version)) ? Number(snapshot.version) : 1,
	};
};

const normalizeRecruitmentSchedulePattern = (
	pattern: any,
	cycleDays: number,
	shiftTypeById: Map<string, any>,
) => {
	const normalizedCycleDays = [7, 14, 21, 28].includes(Number(cycleDays)) ? Number(cycleDays) : 7;
	const safePattern = Array.isArray(pattern) ? pattern : [];

	return Array.from({ length: normalizedCycleDays }).map((_, index) => {
		const day = index + 1;
		const existing =
			safePattern.find((item: any) => Number(item?.day) === day) ||
			safePattern[index] ||
			null;
		const shiftTypeId = existing?.shiftTypeId ? String(existing.shiftTypeId) : "";
		const existingSnapshot = normalizeRecruitmentShiftSnapshot(existing?.shiftSnapshot);
		const shiftTypeSnapshot = shiftTypeId
			? buildRecruitmentShiftSnapshotFromShiftType(shiftTypeById.get(shiftTypeId))
			: null;

		return {
			day,
			shiftTypeId: shiftTypeId || null,
			shiftSnapshot:
				existingSnapshot || shiftTypeSnapshot || (shiftTypeId ? null : existingSnapshot),
		};
	});
};

const normalizePreHireNationality = (value?: string | null) => {
	const normalized = String(value || "").trim();
	if (!normalized) return "Filipino";
	if (normalized.toLowerCase() === "philippines") return "Filipino";
	return normalized;
};

const buildPreHireFormDraft = (
	applicant: any,
	employee: any,
	draft?: Partial<PreHireFormDraft> | null,
): PreHireFormDraft => {
	const scheduleSnapshotFromDraft = normalizeRecruitmentScheduleSnapshot(
		(draft as any)?.scheduleSnapshot,
	);
	const person = employee?.person || applicant?.person || {};
	const personalInfo = person?.personalInfo || {};
	const contactInfo = person?.contactInfo || {};
	const primaryPhone = Array.isArray(contactInfo?.phones)
		? contactInfo.phones.find((phone: any) => phone?.isPrimary) || contactInfo.phones[0] || {}
		: {};
	const primaryAddress = Array.isArray(contactInfo?.address) ? contactInfo.address[0] || {} : {};

	return {
		employeeId: String(draft?.employeeId || employee?.employeeId || ""),
		firstName: String(personalInfo?.firstName || ""),
		lastName: String(personalInfo?.lastName || ""),
		email: String(draft?.email || contactInfo?.email || ""),
		dateOfBirth: String(draft?.dateOfBirth || formatDateInputValue(personalInfo?.dateOfBirth)),
		gender: String(draft?.gender || personalInfo?.gender || ""),
		nationality: normalizePreHireNationality(
			String(
				draft?.nationality ||
					personalInfo?.nationality ||
					applicant?.person?.personalInfo?.nationality ||
					"",
			),
		),
		phoneCountryCode: String(draft?.phoneCountryCode || primaryPhone?.countryCode || "+63"),
		phoneNumber: String(draft?.phoneNumber || primaryPhone?.number || ""),
		street: String(draft?.street || primaryAddress?.street || ""),
		city: String(draft?.city || primaryAddress?.city || ""),
		state: String(draft?.state || primaryAddress?.state || ""),
		country:
			String(
				draft?.country ||
					primaryAddress?.country ||
					applicant?.person?.contactInfo?.address?.[0]?.country ||
					"",
			).trim() || "Philippines",
		postalCode: String(draft?.postalCode || primaryAddress?.postalCode || ""),
		departmentId: String(
			draft?.departmentId || employee?.departmentId || applicant?.departmentId || "",
		),
		positionId: String(
			draft?.positionId ||
				employee?.positionId ||
				applicant?.positionId ||
				applicant?.job?.positionId ||
				"",
		),
		levelId: String(draft?.levelId || employee?.levelId || applicant?.job?.levelId || ""),
		scheduleId: String(
			draft?.scheduleId ||
				scheduleSnapshotFromDraft?.templateId ||
				employee?.embeddedSchedule?.templateId ||
				employee?.schedules?.[0]?.scheduleId ||
				"",
		),
		workLocation: String(draft?.workLocation || employee?.workLocation || "ONSITE"),
		employmentType: String(draft?.employmentType || employee?.employmentType || "PROBATIONARY"),
		employmentHireDate: String(
			draft?.employmentHireDate ||
				formatDateInputValue(employee?.employmentHireDate || new Date()),
		),
		employmentStartDate: String(
			draft?.employmentStartDate ||
				formatDateInputValue(
					employee?.employmentStartDate || applicant?.availabilityDate || new Date(),
				),
		),
		probationEndDate: String(
			draft?.probationEndDate ||
				formatDateInputValue(employee?.probationEndDate) ||
				((draft?.employmentType || employee?.employmentType || "PROBATIONARY") ===
				"PROBATIONARY"
					? addMonthsToDateInputValue(
							String(
								draft?.employmentStartDate ||
									formatDateInputValue(
										employee?.employmentStartDate ||
											applicant?.availabilityDate ||
											new Date(),
									),
							),
							6,
						)
					: ""),
		),
		reportToId: String(draft?.reportToId || employee?.reportToId || ""),
		basicSalary: String(
			draft?.basicSalary || (employee?.basicSalary ? String(employee.basicSalary) : ""),
		),
		currency: String(draft?.currency || employee?.currency || applicant?.currency || "PHP"),
		payFrequency: String(draft?.payFrequency || employee?.payFrequency || "SEMI_MONTHLY"),
	};
};

const formatActivityFieldLabel = (key: string) =>
	key
		.replace(/([A-Z])/g, " $1")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const formatActivityFieldValue = (value: unknown) => {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (Array.isArray(value)) return value.join(", ");
	return null;
};

/** Prefer readable dates when the API stores plausible ISO dates; keep raw if year looks corrupt. */
const formatActivityDetailValue = (_key: string, value: unknown): string | null => {
	const base = formatActivityFieldValue(value);
	if (base === null) return null;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			const parsed = new Date(`${trimmed}T12:00:00`);
			if (!Number.isNaN(parsed.getTime())) {
				const y = parsed.getFullYear();
				if (y >= 1900 && y <= 2100) {
					return parsed.toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
						day: "numeric",
					});
				}
			}
		}
	}
	return base;
};

const getActivitySummaryRows = (activity: any): Array<{ label: string; value: string }> => {
	const details =
		activity?.details && typeof activity.details === "object" ? activity.details : null;
	if (!details) return [];

	return Object.entries(details as Record<string, unknown>)
		.map(([key, value]) => {
			const formatted = formatActivityDetailValue(key, value);
			if (!formatted) return null;
			return {
				label: formatActivityFieldLabel(key),
				value: formatted,
			};
		})
		.filter(Boolean) as Array<{ label: string; value: string }>;
};

/** Typical Mongo ObjectId shape — hide from activity/details when unresolved. */
const OBJECT_ID_LIKE = /^[a-f\d]{24}$/i;

const workflowColumnIndex = (stateKey: string, workflowColumns: WorkflowColumn[] = []) =>
	workflowColumns.findIndex((c) => c.key === stateKey.toUpperCase());

/** Next column in pipeline (excludes jumping; REJECTED is not "next"). */
const expectedForwardColumnKey = (
	currentKey: string,
	workflowColumns: WorkflowColumn[] = [],
): string | null => {
	const i = workflowColumnIndex(currentKey, workflowColumns);
	if (i < 0 || i >= workflowColumns.length - 1) return null;
	const next = workflowColumns[i + 1];
	if (!next || next.key === "REJECTED") return null;
	return next.key;
};

type BoardTransitionResult =
	| { type: "ok"; payload: ApplicantActionRequest }
	| { type: "noop" }
	| { type: "toast"; message: string };

const resolveBoardTransition = (
	applicant: any,
	targetColumnKey: string,
	workflowColumns: WorkflowColumn[] = [],
): BoardTransitionResult => {
	if (isApplicantHired(applicant)) {
		return {
			type: "toast",
			message: HIRED_RECRUITMENT_LOCK_MESSAGE,
		};
	}

	const current = String(applicant.currentWorkflowStateKey || "").toUpperCase();
	const target = targetColumnKey.toUpperCase();
	if (current === target) return { type: "noop" };

	if (target === "REJECTED") {
		return {
			type: "toast",
			message: "Reject a candidate from the panel—dragging to Rejected isn’t supported here.",
		};
	}

	const expected = expectedForwardColumnKey(current, workflowColumns);
	if (!expected || target !== expected) {
		return {
			type: "toast",
			message: "Drag one column forward at a time along the recruitment pipeline.",
		};
	}

	const stepId =
		(typeof applicant.currentStepExecution?.id === "string" &&
			applicant.currentStepExecution.id) ||
		(typeof applicant.currentStepExecutionId === "string" &&
			applicant.currentStepExecutionId) ||
		undefined;

	switch (current) {
		case "APPLIED":
		case "SCREENING":
			return {
				type: "ok",
				payload: { action: "ADVANCE", stepExecutionId: stepId, targetStateKey: target },
			};
		case "INTERVIEW_SCHEDULING":
			return {
				type: "toast",
				message:
					"Add date, time, and location in the candidate panel to schedule the interview.",
			};
		case "INTERVIEW":
			return {
				type: "ok",
				payload: { action: "SEND_OFFER", stepExecutionId: stepId, targetStateKey: target },
			};
		case "OFFER_APPROVAL":
			return {
				type: "ok",
				payload: {
					action: "APPROVE_STEP",
					stepExecutionId: stepId,
					targetStateKey: target,
				},
			};
		case "OFFER_SENT":
			return {
				type: "toast",
				message: "Upload the signed contract in the candidate panel to move to onboarding.",
			};
		case "ONBOARDING_READY":
			return {
				type: "ok",
				payload: { action: "MARK_HIRED", stepExecutionId: stepId, targetStateKey: target },
			};
		default:
			return {
				type: "toast",
				message: "This stage must be updated from the candidate panel.",
			};
	}
};

const humanizeActivityDetailRows = (
	rows: Array<{ label: string; value: string }>,
	employeeLabelById: Record<string, string>,
): Array<{ label: string; value: string }> => {
	const out: Array<{ label: string; value: string }> = [];
	for (const row of rows) {
		const v = row.value.trim();
		const lk = row.label.toLowerCase().replace(/\s+/g, "");
		const resolved = employeeLabelById[v];

		const looksLikeAssignee =
			/assignee|employeeid|userid|recruiter|changedby|actor|createdby/.test(lk) ||
			lk.endsWith("id");

		if (looksLikeAssignee && resolved) {
			const niceLabel = row.label.replace(/\s*id\s*$/i, "").trim() || "Assignee";
			out.push({ label: niceLabel, value: resolved });
			continue;
		}
		if (looksLikeAssignee && OBJECT_ID_LIKE.test(v)) continue;
		if (OBJECT_ID_LIKE.test(v)) continue;
		out.push(row);
	}
	return out;
};

function pipelineProgressPercent(stateKey: string, workflowColumns: WorkflowColumn[] = []): number {
	const k = stateKey.toUpperCase();
	if (k === "REJECTED") return 0;
	const idx = workflowColumnIndex(k, workflowColumns);
	if (idx < 0) return 0;
	const lastPipelineIdx = workflowColumns.findIndex((c) => c.key === "HIRED");
	const span = Math.max(1, lastPipelineIdx);
	return Math.min(100, Math.round((idx / span) * 100));
}

function ApplicantHistoryChip({ history }: { history?: any }) {
	if (!history?.matched) return null;
	return (
		<div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
			<History className="h-3 w-3" />
			History
		</div>
	);
}

function KanbanApplicantCard(props: {
	applicant: any;
	groupKey: string;
	onOpen: (id: string) => void;
}) {
	const { applicant, groupKey, onOpen } = props;
	const hired = isApplicantHired(applicant);
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: `drag-${groupKey}-${applicant.id}`,
		disabled: hired,
		data: {
			type: "applicant",
			applicantId: applicant.id as string,
			groupKey,
		},
	});

	const style = transform
		? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
		: undefined;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex gap-1 rounded-xl border border-neutral-200 bg-white shadow-sm transition",
				hired && "border-emerald-200 bg-emerald-50/55",
				isDragging && "z-50 opacity-90 ring-2 ring-primary/30",
			)}>
			<button
				type="button"
				className={cn(
					"touch-none rounded-l-xl px-1.5 py-3 text-neutral-400",
					hired
						? "cursor-not-allowed opacity-45"
						: "cursor-grab hover:bg-neutral-50 hover:text-neutral-600 active:cursor-grabbing",
				)}
				aria-label={hired ? HIRED_RECRUITMENT_LOCK_MESSAGE : "Drag to move stage"}
				disabled={hired}
				title={hired ? HIRED_RECRUITMENT_LOCK_MESSAGE : undefined}
				{...(!hired ? listeners : {})}
				{...(!hired ? attributes : {})}>
				<GripVertical className="h-4 w-4 shrink-0" />
			</button>
			<button
				type="button"
				onClick={() => onOpen(applicant.id)}
				className="min-w-0 flex-1 rounded-r-xl p-3 text-left transition hover:bg-neutral-50/80">
				<div className="flex items-start gap-3">
					<ProfileInitialsAvatar name={buildFullName(applicant)} size="sm" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-semibold text-neutral-900">
							{buildFullName(applicant)}
						</div>
						<div className="truncate text-xs text-neutral-500">
							{applicant?.person?.contactInfo?.email || "No email"}
						</div>
						<div className="mt-2 truncate text-xs text-neutral-600">
							{getApplicantPositionTitle(applicant)}
						</div>
						<ApplicantHistoryChip history={applicant?.identityHistory} />
						{hired ? (
							<div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
								<UserCheck className="h-3 w-3" />
								Hired
							</div>
						) : null}
					</div>
				</div>
			</button>
		</div>
	);
}

function KanbanDropColumn(props: {
	id: string;
	groupKey: string;
	columnKey: string;
	label: string;
	count: number;
	disabled?: boolean;
	children: ReactNode;
}) {
	const { setNodeRef, isOver } = useDroppable({
		id: props.id,
		disabled: props.disabled,
		data: {
			type: "column",
			columnKey: props.columnKey,
			groupKey: props.groupKey,
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex w-72 flex-shrink-0 flex-col rounded-xl border bg-neutral-50 transition-colors",
				props.disabled
					? "border-neutral-200 bg-neutral-100/80 opacity-70"
					: isOver
						? "border-primary/50 bg-primary/[0.04]"
						: "border-neutral-200",
			)}>
			<div className="border-b border-neutral-200 px-3 py-3">
				<div className="flex items-center justify-between gap-2">
					<span className="text-sm font-semibold text-neutral-900">{props.label}</span>
					<div className="flex items-center gap-1.5">
						{props.disabled ? (
							<Badge className="bg-neutral-200 text-neutral-700 shadow-none">
								Closed
							</Badge>
						) : null}
						<Badge variant="secondary" className="text-white">
							{props.count}
						</Badge>
					</div>
				</div>
			</div>
			<div className="min-h-[120px] space-y-2 p-2">{props.children}</div>
		</div>
	);
}

function RecruitmentJobKanban(props: {
	groupKey: string;
	filteredApplicants: any[];
	workflowColumns: WorkflowColumn[];
	targetReached: boolean;
	openApplicant: (id: string) => void;
	onDragMove: (applicant: any, targetColumnKey: string) => Promise<void>;
}) {
	const { groupKey, filteredApplicants, workflowColumns, targetReached, openApplicant, onDragMove } = props;
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) return;
		const drag = active.data.current as { applicantId?: string; groupKey?: string } | undefined;
		const drop = over.data.current as { columnKey?: string; groupKey?: string } | undefined;
		if (
			!drag?.applicantId ||
			!drop?.columnKey ||
			drag.groupKey !== groupKey ||
			drop.groupKey !== groupKey
		)
			return;
		const applicant = filteredApplicants.find((a) => a.id === drag.applicantId);
		if (!applicant) return;
		if (isApplicantHired(applicant)) {
			toast.message("Move blocked", {
				description: HIRED_RECRUITMENT_LOCK_MESSAGE,
			});
			return;
		}
		if (targetReached) {
			toast.error("Headcount target reached.", {
				description: FULL_RECRUITMENT_LOCK_MESSAGE,
			});
			return;
		}
		await onDragMove(applicant, drop.columnKey);
	};

	return (
		<DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
			<div className="flex gap-4 pb-2">
				{workflowColumns.map((column) => {
					const columnApplicants = filteredApplicants.filter(
						(applicant) => getApplicantBoardColumnKey(applicant) === column.key,
					);
					return (
						<KanbanDropColumn
							key={column.key}
							id={`drop-${groupKey}-${column.key}`}
							groupKey={groupKey}
							columnKey={column.key}
							label={column.label}
							count={columnApplicants.length}
							disabled={targetReached}>
							{columnApplicants.length === 0 ? (
								<div className="rounded-lg border border-dashed border-neutral-200 bg-white px-3 py-8 text-center text-xs text-neutral-400">
									{targetReached ? "Locked" : "Drop here"}
								</div>
							) : (
								columnApplicants.map((applicant) => (
									<KanbanApplicantCard
										key={applicant.id}
										applicant={applicant}
										groupKey={groupKey}
										onOpen={openApplicant}
									/>
								))
							)}
						</KanbanDropColumn>
					);
				})}
			</div>
		</DndContext>
	);
}

export default function RecruitmentPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const applicantId = searchParams.get("id") || "";
	const returnedEmployeeId = String(searchParams.get("employeeId") || "").trim();
	const DEBUG = searchParams.get("debug") === "true";
	const [searchTerm, setSearchTerm] = useState("");
	const [attachmentViewer, setAttachmentViewer] = useState<{
		url: string;
		fileName: string | null;
		ext: string | null;
	} | null>(null);

	const { data: groupedData, isLoading } = useApplicantsGrouped("job");
	const { data: selectedApplicant, isLoading: isLoadingApplicant } = useApplicant(applicantId);
	useEffect(() => {
		if (!applicantId || !returnedEmployeeId) return;
		let cancelled = false;

		void (async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: applicantQueryKeys.applicants.all,
				}),
				queryClient.refetchQueries({
					queryKey: applicantQueryKeys.applicants.detail(applicantId),
					type: "active",
				}),
			]);
			if (cancelled) return;
			setSearchParams(
				(previous) => {
					const next = new URLSearchParams(previous);
					next.delete("employeeId");
					return next;
				},
				{ replace: true },
			);
		})();

		return () => {
			cancelled = true;
		};
	}, [applicantId, queryClient, returnedEmployeeId, setSearchParams]);
	const selectedApplicantForDrawer = useMemo(() => {
		if (!selectedApplicant || !returnedEmployeeId) return selectedApplicant;
		if ((selectedApplicant as any).convertedToEmployeeId || (selectedApplicant as any).convertedToEmployee?.id) {
			return selectedApplicant;
		}
		return {
			...(selectedApplicant as any),
			convertedToEmployeeId: returnedEmployeeId,
		};
	}, [returnedEmployeeId, selectedApplicant]);
	const { data: jobsData, isLoading: isLoadingJobs } = useJobs({
		page: 1,
		limit: 1000,
		document: true as any,
		sort: "createdAt",
		order: "desc",
		fields: "id,position.id,position.title,level.id,level.name,headcountRequested,isDeleted",
		filter: { isDeleted: false },
	});
	const { data: workflowTemplatesData } = useWorkflowInstances(
		{
			page: 1,
			limit: 10,
			templateOnly: true,
			filter: {
				domain: "RECRUITMENT",
				code: "WF-RECRUITMENT-APPLICANT-DEFAULT",
			},
			fields: "id,code,states,steps,currentStateKey",
		},
		{ enabled: true },
	);
	const { data: employeesData } = useEmployees({
		page: 1,
		limit: 200,
		document: true as any,
	});
	const applicantActionMutation = useApplicantAction();
	const uploadAttachmentMutation = useUploadApplicantAttachment();
	const organizationId = user?.organizationId || user?.organization?.id || null;

	const rawGroupedApplicants = useMemo(
		() => ((groupedData as any)?.applicants || {}) as Record<string, any[]>,
		[groupedData],
	);
	const jobs = useMemo(() => {
		const records = ((jobsData as any)?.jobs || (jobsData as any)?.data || []) as any[];
		return Array.isArray(records) ? records : [];
	}, [jobsData]);
	const recruiterOptions = useMemo(() => {
		const records = ((employeesData as any)?.data?.employees ||
			(employeesData as any)?.employees ||
			[]) as any[];
		return records.map((employee) => ({
			value: employee.id,
			label:
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
				employee.employeeId ||
				employee.id,
		}));
	}, [employeesData]);

	const employeeLabelById = useMemo(
		() =>
			Object.fromEntries(recruiterOptions.map((o) => [o.value, o.label])) as Record<
				string,
				string
			>,
		[recruiterOptions],
	);
	const workflowTemplate = useMemo(() => {
		const templates = (workflowTemplatesData?.workflowInstances || []) as Array<{
			states?: WorkflowRuntimeState[] | unknown;
			steps?: WorkflowRuntimeStep[] | unknown;
		}>;
		return templates[0] || null;
	}, [workflowTemplatesData]);
	const workflowColumns = useMemo<WorkflowColumn[]>(
		() => buildWorkflowColumns(workflowTemplate),
		[workflowTemplate],
	);
	const stateLabels = useMemo(
		() =>
			Object.fromEntries(
				workflowColumns.map((column) => [column.key, column.label]),
			) as Record<string, string>,
		[workflowColumns],
	);
	const groupedSections = useMemo(() => {
		const sections: Array<{
			key: string;
			label: string;
			applicants: any[];
			targetCount: number;
		}> = [];
		const seenKeys = new Set<string>();

		for (const job of jobs) {
			const key = String(job?.id || "").trim();
			if (!key) continue;
			seenKeys.add(key);
			sections.push({
				key,
				label: getJobGroupLabel(job, key),
				applicants: rawGroupedApplicants[key] || [],
				targetCount: getJobTargetCount(job),
			});
		}

		for (const [groupKey, applicants] of Object.entries(rawGroupedApplicants)) {
			if (seenKeys.has(groupKey)) continue;
			sections.push({
				key: groupKey,
				label: getGroupLabel(applicants, groupKey),
				applicants,
				targetCount: Math.max(getHiredApplicantCount(applicants), 1),
			});
		}

		return sections.sort((left, right) => {
			const leftReached = getHiredApplicantCount(left.applicants) >= left.targetCount;
			const rightReached = getHiredApplicantCount(right.applicants) >= right.targetCount;
			if (leftReached === rightReached) return 0;
			return leftReached ? 1 : -1;
		});
	}, [jobs, rawGroupedApplicants]);
	const lockedRecruitmentGroupKeys = useMemo(() => {
		const locked = new Set<string>();
		groupedSections.forEach((section) => {
			if (getHiredApplicantCount(section.applicants) >= section.targetCount) {
				locked.add(section.key);
			}
		});
		return locked;
	}, [groupedSections]);
	const selectedApplicantGroupKey = useMemo(() => {
		const directKey = getApplicantJobGroupKey(selectedApplicantForDrawer);
		if (directKey) return directKey;
		const matchedSection = groupedSections.find((section) =>
			section.applicants.some((applicant) => applicant.id === selectedApplicantForDrawer?.id),
		);
		return matchedSection?.key || "";
	}, [groupedSections, selectedApplicantForDrawer]);
	const isSelectedApplicantStageLocked = Boolean(
		selectedApplicantGroupKey && lockedRecruitmentGroupKeys.has(selectedApplicantGroupKey),
	);
	const isSelectedApplicantPostHireLocked = Boolean(
		selectedApplicantForDrawer && isApplicantHired(selectedApplicantForDrawer),
	);
	const [openGroupKeys, setOpenGroupKeys] = useState<string[]>([]);

	useEffect(() => {
		if (groupedSections.length === 0) {
			setOpenGroupKeys([]);
			return;
		}

		setOpenGroupKeys((prev) => {
			const next = prev.filter((key) =>
				groupedSections.some((section) => section.key === key),
			);
			if (next.length > 0) return next;
			return [groupedSections[0].key];
		});
	}, [groupedSections]);

	const boardView = searchParams.get("board") === "table" ? "table" : "kanban";

	const setBoardView = (next: "kanban" | "table") => {
		setSearchParams((prev) => {
			const p = new URLSearchParams(prev);
			if (next === "table") p.set("board", "table");
			else p.delete("board");
			return p;
		});
	};

	const handleBoardDragMove = async (applicant: any, targetColumnKey: string) => {
		const result = resolveBoardTransition(applicant, targetColumnKey, workflowColumns);
		if (result.type === "noop") return;
		if (result.type === "toast") {
			toast.message("Move from the panel instead", { description: result.message });
			return;
		}
		if (lockedRecruitmentGroupKeys.has(getApplicantJobGroupKey(applicant) || "")) {
			toast.error("Headcount target reached.", {
				description: FULL_RECRUITMENT_LOCK_MESSAGE,
			});
			return;
		}
		if (result.payload.action === "MARK_HIRED") {
			try {
				await assertApplicantHeadcountCapacity(applicant);
			} catch (error: any) {
				toast.error(error?.message || "Headcount target reached.");
				return;
			}
		}
		await applicantActionMutation.mutateAsync({
			id: applicant.id as string,
			payload: result.payload,
		});
	};

	useEffect(() => {
		if (!attachmentViewer) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setAttachmentViewer(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [attachmentViewer]);

	const openApplicant = (id: string) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.set("id", id);
			return next;
		});
	};

	const closeDrawer = () => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("id");
			return next;
		});
	};

	return (
		<div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden bg-neutral-50">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-neutral-900">Recruitment</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="gap-2"
						onClick={() =>
							setSearchParams((prev) => {
								const next = new URLSearchParams(prev);
								next.set("jobAction", "list");
								return next;
							})
						}>
						<Briefcase className="h-4 w-4" />
						Manage Jobs
					</Button>
					<Button
						size="sm"
						className="gap-2"
						onClick={() =>
							setSearchParams((prev) => {
								const next = new URLSearchParams(prev);
								next.set("jobAction", "create");
								return next;
							})
						}>
						<Plus className="h-4 w-4" />
						Create Job
					</Button>
				</div>
			</div>

			<div className="mb-6 flex items-center gap-3">
				<div className="relative max-w-md flex-1">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
					<Input
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
						placeholder="Search applicants..."
						className="pl-9"
					/>
				</div>
				<div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
					<Button
						type="button"
						variant={boardView === "kanban" ? "default" : "ghost"}
						size="sm"
						className={cn(
							"gap-2 px-3",
							boardView === "kanban"
								? "text-white hover:text-white"
								: "text-neutral-600 hover:text-neutral-900",
						)}
						onClick={() => setBoardView("kanban")}>
						<LayoutGrid className="h-4 w-4" />
						Kanban
					</Button>
					<Button
						type="button"
						variant={boardView === "table" ? "default" : "ghost"}
						size="sm"
						className={cn(
							"gap-2 px-3",
							boardView === "table"
								? "text-white hover:text-white"
								: "text-neutral-600 hover:text-neutral-900",
						)}
						onClick={() => setBoardView("table")}>
						<Table2 className="h-4 w-4" />
						Table
					</Button>
				</div>
			</div>

			<div className="min-w-0 flex-1 overflow-auto">
				{isLoading || isLoadingJobs ? (
					boardView === "kanban" ? (
						<div className="space-y-5">
							{[1, 2].map((index) => (
								<div
									key={index}
									className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
									<div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
										<div className="flex items-center gap-3">
											<Skeleton className="h-4 w-4 rounded-full" />
											<Skeleton className="h-5 w-52" />
										</div>
										<Skeleton className="h-6 w-10 rounded-full" />
									</div>
									<div className="overflow-x-auto p-4">
										<div className="flex gap-4 pb-2">
											{Array.from({
												length: Math.max(4, workflowColumns.length || 4),
											}).map((_, columnIndex) => (
												<div
													key={`${index}-${columnIndex}`}
													className="flex w-72 flex-shrink-0 flex-col rounded-xl border border-neutral-200 bg-neutral-50">
													<div className="border-b border-neutral-200 px-3 py-3">
														<div className="flex items-center justify-between gap-2">
															<Skeleton className="h-4 w-24" />
															<Skeleton className="h-5 w-8 rounded-full" />
														</div>
													</div>
													<div className="space-y-2 p-2">
														{[1, 2, 3].map((cardIndex) => (
															<div
																key={cardIndex}
																className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
																<div className="flex items-start gap-3">
																	<Skeleton className="h-9 w-9 rounded-full" />
																	<div className="min-w-0 flex-1 space-y-2">
																		<Skeleton className="h-4 w-32" />
																		<Skeleton className="h-3 w-40" />
																		<Skeleton className="h-3 w-24" />
																	</div>
																</div>
															</div>
														))}
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="space-y-5">
							{[1, 2].map((index) => (
								<div
									key={index}
									className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
									<div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">
										<Skeleton className="h-5 w-56" />
										<Skeleton className="h-6 w-10 rounded-full" />
									</div>
									<div className="p-4">
										<div className="overflow-hidden rounded-xl border border-neutral-200">
											<div className="grid grid-cols-6 gap-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
												{[1, 2, 3, 4, 5, 6].map((cell) => (
													<Skeleton key={cell} className="h-3 w-20" />
												))}
											</div>
											<div className="space-y-0">
												{[1, 2, 3, 4].map((row) => (
													<div
														key={row}
														className="grid grid-cols-6 items-center gap-4 border-b border-neutral-100 px-4 py-3 last:border-b-0">
														<div className="flex items-center gap-2">
															<Skeleton className="h-8 w-8 rounded-full" />
															<Skeleton className="h-4 w-28" />
														</div>
														<Skeleton className="h-4 w-28" />
														<Skeleton className="h-4 w-24" />
														<Skeleton className="h-6 w-20 rounded-full" />
														<Skeleton className="h-4 w-20" />
														<div className="space-y-2">
															<Skeleton className="h-2 w-full rounded-full" />
															<Skeleton className="h-3 w-16" />
														</div>
													</div>
												))}
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					)
				) : (
					<div className="min-w-0 space-y-5">
						{groupedSections.length === 0 ? (
							<div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-12 text-center">
								<p className="text-sm font-medium text-neutral-900">
									No recruitment jobs found.
								</p>
								<p className="mt-2 text-sm text-neutral-500">
									Create a job opening to show its workflow stages here.
								</p>
							</div>
						) : null}
						{groupedSections.map(
							({ key: groupKey, label, applicants, targetCount }) => {
								const filteredApplicants = applicants.filter((applicant) => {
									if (!searchTerm) return true;
									const haystack =
										`${buildFullName(applicant)} ${applicant?.person?.contactInfo?.email || ""} ${getApplicantPositionTitle(applicant)}`.toLowerCase();
									return haystack.includes(searchTerm.toLowerCase());
								});
								const isOpen = openGroupKeys.includes(groupKey);
								const hiredCount = getHiredApplicantCount(applicants);
								const targetReached = hiredCount >= targetCount;
								const applicantVsTargetLabel = `${hiredCount}/${targetCount}`;

								return (
									<Collapsible
										key={groupKey}
										className="min-w-0"
										open={isOpen}
										onOpenChange={(open) =>
											setOpenGroupKeys((prev) =>
												open
													? [
															...prev.filter(
																(key) => key !== groupKey,
															),
															groupKey,
														]
													: prev.filter((key) => key !== groupKey),
											)
										}>
										<section
											className={cn(
												"min-w-0 overflow-hidden rounded-2xl border bg-white",
												targetReached
													? "border-orange-200/90 shadow-[0_10px_30px_-26px_rgba(249,115,22,0.8)]"
													: "border-neutral-200",
											)}>
											<CollapsibleTrigger className="w-full text-left">
												<div
													className={cn(
														"flex items-center justify-between gap-4 border-b px-4 py-3 transition",
														targetReached
															? "border-orange-100 bg-orange-50/60 hover:bg-orange-50"
															: "border-neutral-200 bg-neutral-50 hover:bg-neutral-100/80",
													)}>
													<div className="min-w-0 flex items-center gap-3">
														<div
															className={cn(
																"flex h-9 w-9 items-center justify-center rounded-full border",
																targetReached
																	? "border-orange-300 bg-white text-orange-600"
																	: "border-orange-200 bg-orange-50 text-orange-600",
															)}>
															<Briefcase className="h-4 w-4" />
														</div>
														<div className="min-w-0">
															<h2 className="truncate text-sm font-semibold text-neutral-900">
																{label}
															</h2>
														</div>
													</div>
													<div className="flex items-center gap-2">
														{hiredCount > 0 ? (
															<Badge className="bg-emerald-100 text-emerald-700 shadow-none">
																<UserCheck className="mr-1 h-3 w-3" />
																{hiredCount}
															</Badge>
														) : null}
														{targetReached ? (
															<Badge className="bg-orange-100 text-orange-700 shadow-none">
																Full
															</Badge>
														) : null}
														<Badge
															variant="secondary"
															className={cn(
																"text-white",
																targetReached && "bg-orange-600",
															)}>
															{applicantVsTargetLabel}
														</Badge>
														<ChevronDown
															className={cn(
																"h-4 w-4 text-neutral-400 transition-transform duration-200",
																isOpen && "rotate-180",
															)}
														/>
													</div>
												</div>
											</CollapsibleTrigger>
											<CollapsibleContent>
												<div className="max-w-full overflow-x-auto p-4">
													{boardView === "kanban" ? (
														<RecruitmentJobKanban
															groupKey={groupKey}
															filteredApplicants={filteredApplicants}
															workflowColumns={workflowColumns}
															targetReached={targetReached}
															openApplicant={openApplicant}
															onDragMove={handleBoardDragMove}
														/>
													) : (
														<div className="overflow-hidden rounded-xl border border-neutral-200">
															<table className="w-full border-collapse text-left text-sm">
																<thead>
																	<tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
																		<th className="px-4 py-3">
																			Candidate
																		</th>
																		<th className="hidden px-4 py-3 sm:table-cell">
																			Email
																		</th>
																		<th className="hidden px-4 py-3 md:table-cell">
																			Role
																		</th>
																		<th className="px-4 py-3">
																			Stage
																		</th>
																		<th className="hidden px-4 py-3 lg:table-cell">
																			Applied
																		</th>
																		<th className="min-w-[140px] px-4 py-3">
																			Pipeline
																		</th>
																	</tr>
																</thead>
																<tbody>
																	{filteredApplicants.length ===
																	0 ? (
																		<tr>
																			<td
																				colSpan={6}
																				className="px-4 py-8 text-center text-sm text-neutral-500">
																				No applicants in
																				this workflow yet.
																			</td>
																		</tr>
																	) : (
																		[...filteredApplicants]
																			.sort((a, b) =>
																				buildFullName(
																					a,
																				).localeCompare(
																					buildFullName(
																						b,
																					),
																				),
																			)
																			.map((applicant) => {
																				const sk = String(
																					applicant.currentWorkflowStateKey ||
																						"",
																				).toUpperCase();
																				const pct =
																					pipelineProgressPercent(
																						sk,
																						workflowColumns,
																					);
																				return (
																					<tr
																						key={
																							applicant.id
																						}
																						className="cursor-pointer border-b border-neutral-100 transition hover:bg-neutral-50/90"
																						onClick={() =>
																							openApplicant(
																								applicant.id,
																							)
																						}>
																						<td className="px-4 py-3">
																							<div className="flex items-center gap-2">
																								<ProfileInitialsAvatar
																									name={buildFullName(
																										applicant,
																									)}
																									size="sm"
																								/>
																								<span className="font-medium text-neutral-900">
																									{buildFullName(
																										applicant,
																									)}
																								</span>
																								{applicant
																									?.identityHistory
																									?.matched ? (
																									<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
																										<History className="h-3 w-3" />
																										History
																									</span>
																								) : null}
																							</div>
																						</td>
																						<td className="hidden max-w-[200px] truncate px-4 py-3 text-neutral-600 sm:table-cell">
																							{applicant
																								?.person
																								?.contactInfo
																								?.email ||
																								"—"}
																						</td>
																						<td className="hidden max-w-[180px] truncate px-4 py-3 text-neutral-700 md:table-cell">
																							{getApplicantPositionTitle(
																								applicant,
																							)}
																						</td>
																						<td className="px-4 py-3">
																							<div className="flex flex-wrap items-center gap-1.5">
																								<Badge
																									variant={
																										sk ===
																										"REJECTED"
																											? "destructive"
																											: "secondary"
																									}
																									className="font-normal text-white">
																									{getStateLabel(
																										sk,
																										stateLabels,
																									)}
																								</Badge>
																								{sk ===
																								"HIRED" ? (
																									<Badge className="bg-emerald-100 text-emerald-700 shadow-none">
																										<UserCheck className="mr-1 h-3 w-3" />
																										Hired
																									</Badge>
																								) : null}
																							</div>
																						</td>
																						<td className="hidden whitespace-nowrap px-4 py-3 text-neutral-600 lg:table-cell">
																							{applicant.appliedDate
																								? new Date(
																										applicant.appliedDate,
																									).toLocaleDateString()
																								: "—"}
																						</td>
																						<td className="px-4 py-3">
																							<div className="flex min-w-[120px] flex-col gap-1.5">
																								<Progress
																									value={
																										pct
																									}
																									className="h-1.5 bg-neutral-200 [&>div]:bg-primary"
																								/>
																								<span className="text-[10px] text-neutral-500">
																									{
																										pct
																									}

																									%
																									through
																									pipeline
																								</span>
																							</div>
																						</td>
																					</tr>
																				);
																			})
																	)}
																</tbody>
															</table>
														</div>
													)}
												</div>
											</CollapsibleContent>
										</section>
									</Collapsible>
								);
							},
						)}
					</div>
				)}
			</div>

			<Drawer
				open={Boolean(applicantId)}
				onOpenChange={(open) => !open && closeDrawer()}
				direction="right"
				modal={false}>
				<DrawerContent className="ml-auto flex h-full min-h-0 w-full min-w-0 flex-col border-l border-[#e8dede] bg-[#fbf8f5] shadow-2xl sm:!max-w-[min(90vw,48rem)]">
					<DrawerHeader className="shrink-0 border-b border-[#e8dede] bg-white/90 pb-4 backdrop-blur-sm">
						<div className="flex items-center justify-between gap-4">
							<div className="min-w-0">
								<DrawerTitle className="font-heading text-xl font-semibold tracking-tight text-neutral-900">
									{selectedApplicantForDrawer
										? buildFullName(selectedApplicantForDrawer)
										: "Candidate"}
								</DrawerTitle>
							</div>
							<DrawerClose asChild>
								<Button
									variant="ghost"
									size="sm"
									className="shrink-0 text-neutral-600 hover:bg-primary/5 hover:text-primary">
									Close
								</Button>
							</DrawerClose>
						</div>
					</DrawerHeader>

					{isLoadingApplicant || !selectedApplicantForDrawer ? (
						<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-6">
							<div className="flex gap-4 border-b border-[#e8dede] pb-6">
								<Skeleton className="h-16 w-16 shrink-0 rounded-full" />
								<div className="min-w-0 flex-1 space-y-3">
									<Skeleton className="h-7 w-56 max-w-full" />
									<Skeleton className="h-4 w-full max-w-md" />
									<Skeleton className="h-6 w-32 rounded-full" />
								</div>
							</div>
							<div className="space-y-4">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-[88%]" />
								<Skeleton className="h-4 w-[76%]" />
								<Skeleton className="h-24 w-full rounded-xl" />
							</div>
							<div className="space-y-3 pt-4">
								<Skeleton className="h-10 w-full rounded-lg" />
								<Skeleton className="h-10 w-full rounded-lg" />
							</div>
							<p className="text-center text-sm text-[#5f5f63]">Loading candidate…</p>
						</div>
					) : (
						<ApplicantWorkflowDrawer
							applicant={selectedApplicantForDrawer}
							debug={DEBUG}
							organizationId={organizationId}
							templateWorkflowColumns={workflowColumns}
							recruiterOptions={recruiterOptions}
							employeeLabelById={employeeLabelById}
							stageMovementLocked={isSelectedApplicantStageLocked}
							stageMovementLockMessage={FULL_RECRUITMENT_LOCK_MESSAGE}
							onOpenAttachment={setAttachmentViewer}
							onOpenEmployee={(employeeId, options) => {
								if (options?.mode === "edit") {
									const params = new URLSearchParams();
									params.set(
										"step",
										String(getEmployeeEditStepFromSetupField(options.field)),
									);
									params.set("sourceApplicantId", String(selectedApplicant.id));
									params.set("returnTo", `/hr/recruitment?id=${selectedApplicant.id}`);
									navigate(`/hr/employees/${employeeId}/edit?${params.toString()}`);
									return;
								}
								navigate(`/employee/${employeeId}?tab=employment&from=hr-recruitment`);
							}}
							onCreateEmployeeFromApplicant={(applicant) => {
								const params = new URLSearchParams();
								params.set("sourceApplicantId", String(applicant.id));
								params.set("returnTo", `/hr/recruitment?id=${applicant.id}`);
								navigate(`/hr/employees/new?${params.toString()}`);
							}}
							onRunAction={(payload) => {
								if (
									isSelectedApplicantPostHireLocked &&
									isRecruitmentStageMovementAction(payload.action)
								) {
									return Promise.reject(new Error(HIRED_RECRUITMENT_LOCK_MESSAGE));
								}
								if (
									isSelectedApplicantStageLocked &&
									isRecruitmentStageMovementAction(payload.action)
								) {
									return Promise.reject(new Error(FULL_RECRUITMENT_LOCK_MESSAGE));
								}
								return applicantActionMutation.mutateAsync({
									id: selectedApplicant.id,
									payload,
								});
							}}
							onUploadContract={async (file) => {
								if (isSelectedApplicantPostHireLocked) {
									throw new Error(HIRED_RECRUITMENT_LOCK_MESSAGE);
								}
								if (isSelectedApplicantStageLocked) {
									throw new Error(FULL_RECRUITMENT_LOCK_MESSAGE);
								}
								const formData = new FormData();
								formData.append("type", "CONTRACT");
								formData.append("contract", file);
								await uploadAttachmentMutation.mutateAsync({
									id: selectedApplicant.id,
									formData,
								});
								await applicantActionMutation.mutateAsync({
									id: selectedApplicant.id,
									payload: { action: "MARK_ONBOARDING_READY" },
								});
								toast.success(
									"Contract uploaded and candidate moved to onboarding ready",
								);
							}}
						/>
					)}
				</DrawerContent>
			</Drawer>

			{attachmentViewer && typeof document !== "undefined"
				? createPortal(
						<div
							className="fixed inset-0 z-[400] pointer-events-none"
							role="dialog"
							aria-modal="true"
							aria-labelledby="recruitment-attachment-viewer-title">
							<div
								className="absolute inset-0 bg-black/55 pointer-events-auto"
								onClick={() => setAttachmentViewer(null)}
							/>
							<div className="relative flex h-full w-full items-center justify-center p-4">
								<div className="pointer-events-auto relative z-[401] flex h-[min(90vh,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#e8dede] bg-white shadow-2xl">
									<div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8dede] px-4 py-3">
										<h3
											id="recruitment-attachment-viewer-title"
											className="min-w-0 truncate text-base font-semibold text-neutral-900">
											{attachmentViewer.fileName || "Attachment"}
										</h3>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="shrink-0"
											onClick={() => setAttachmentViewer(null)}
											aria-label="Close">
											<X className="h-5 w-5" />
										</Button>
									</div>
									<div className="min-h-0 flex-1 overflow-hidden bg-neutral-100">
										<DocumentFileViewer
											url={attachmentViewer.url}
											fileName={attachmentViewer.fileName || undefined}
											ext={attachmentViewer.ext || undefined}
										/>
									</div>
								</div>
							</div>
						</div>,
						document.body,
					)
				: null}

			<RecruitmentJobsManager />
		</div>
	);
}

type PipelineConfirmDialog = {
	title: string;
	description: string;
	payload: ApplicantActionRequest;
	confirmLabel: string;
	destructive?: boolean;
};

function attachmentExtFromFileName(name?: string | null): string | null {
	if (!name || typeof name !== "string") return null;
	const base = name.split(/[/\\]/).pop() ?? name;
	const i = base.lastIndexOf(".");
	return i >= 0 ? base.slice(i + 1).toLowerCase() : null;
}

function ApplicantWorkflowDrawer({
	applicant,
	debug = false,
	organizationId,
	templateWorkflowColumns,
	recruiterOptions,
	employeeLabelById,
	stageMovementLocked = false,
	stageMovementLockMessage = FULL_RECRUITMENT_LOCK_MESSAGE,
	onOpenAttachment,
	onRunAction,
	onUploadContract,
	onOpenEmployee,
	onCreateEmployeeFromApplicant,
}: {
	applicant: any;
	debug?: boolean;
	organizationId?: string | null;
	templateWorkflowColumns: WorkflowColumn[];
	recruiterOptions: Array<{ value: string; label: string }>;
	employeeLabelById: Record<string, string>;
	stageMovementLocked?: boolean;
	stageMovementLockMessage?: string;
	onOpenAttachment: (viewer: {
		url: string;
		fileName: string | null;
		ext: string | null;
	}) => void;
	onRunAction: (payload: ApplicantActionRequest) => Promise<unknown>;
	onUploadContract: (file: File) => Promise<void>;
	onOpenEmployee: (
		employeeId: string,
		options?: { mode?: "profile" | "edit"; field?: string | null },
	) => void;
	onCreateEmployeeFromApplicant: (applicant: any) => void;
}) {
	const [comments, setComments] = useState("");
	const [assigneeId, setAssigneeId] = useState("");
	const [scheduleDate, setScheduleDate] = useState("");
	const [scheduleTime, setScheduleTime] = useState("");
	const [scheduleLocation, setScheduleLocation] = useState("");
	const [contractFile, setContractFile] = useState<File | null>(null);
	const [stageActionOpen, setStageActionOpen] = useState(true);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const mutationBusy = pendingAction !== null;
	const [pipelineConfirm, setPipelineConfirm] = useState<PipelineConfirmDialog | null>(null);
	const [preHireForm, setPreHireForm] = useState<PreHireFormDraft | null>(null);
	const [preHireDirty, setPreHireDirty] = useState(false);
	const [preHireShowErrors, setPreHireShowErrors] = useState(false);
	const [preHireNotice, setPreHireNotice] = useState<PreHireNotice | null>(null);
	const isPreHireSetupPanelEnabled: boolean = false;
	const reserveEmployeeIdMutation = useReserveEmployeeId();
	const reserveEmployeeIdPromiseRef = useRef<Promise<string> | null>(null);
	const hasAttemptedInitialReserveRef = useRef(false);
	const currentState = String(applicant.currentWorkflowStateKey || "").toUpperCase();
	const postHireLocked = isApplicantHired(applicant);
	const actionState = postHireLocked ? "HIRED" : currentState;
	const preHireSetup = applicant?.preHireSetup as
		| {
				employeeId?: string | null;
				isReady?: boolean;
				missingFields?: Array<{ field: string; label: string; group: string }>;
				groups?: Array<{
					key: string;
					label: string;
					isReady: boolean;
					missingCount: number;
				}>;
				access?: {
					role?: string | null;
					loginEmail?: string | null;
					loginMethod?: string;
					generatedUserName?: string | null;
					hasLinkedUser?: boolean;
				};
				draft?: Partial<PreHireFormDraft> | null;
		  }
		| undefined;
	const setupEmployeeId =
		applicant?.convertedToEmployee?.id || applicant?.convertedToEmployeeId || null;
	const preHireAccess = preHireSetup?.access;
	const preHireMissingFields = preHireSetup?.missingFields || [];
	const isLinkedEmployeeReadyForHire = Boolean(setupEmployeeId && preHireSetup?.isReady);
	const preHireAccessLoginEmail = preHireAccess?.loginEmail || "";
	const preHireAccessGeneratedUserName = preHireAccess?.generatedUserName || "";
	const preHireDraftScheduleSnapshot = useMemo(
		() => normalizeRecruitmentScheduleSnapshot((preHireSetup?.draft as any)?.scheduleSnapshot),
		[preHireSetup?.draft],
	);
	const { data: departmentsData } = useDepartments(
		{ page: 1, limit: 300, document: true as any },
		{ enabled: currentState === "ONBOARDING_READY" },
	);
	const { data: positionsData } = usePositions(
		{ page: 1, limit: 300, document: true as any },
		{ enabled: currentState === "ONBOARDING_READY" },
	);
	const { data: levelsData } = useLevels(
		{ page: 1, limit: 300, document: true as any },
		{ enabled: currentState === "ONBOARDING_READY" },
	);
	const { data: workSchedulesData } = useWorkSchedules(currentState === "ONBOARDING_READY");
	const { data: shiftTypesData } = useShiftTypes(
		{ page: 1, limit: 500, document: true as any },
		{ enabled: currentState === "ONBOARDING_READY" },
	);
	const departmentRecords = useMemo<any[]>(() => {
		const payload = departmentsData as any;
		return Array.isArray(payload?.departments)
			? payload.departments
			: Array.isArray(payload?.data?.departments)
				? payload.data.departments
				: Array.isArray(payload?.data)
					? payload.data
					: [];
	}, [departmentsData]);
	const positionRecords = useMemo<any[]>(() => {
		const payload = positionsData as any;
		return Array.isArray(payload?.positions)
			? payload.positions
			: Array.isArray(payload?.data?.positions)
				? payload.data.positions
				: Array.isArray(payload?.data)
					? payload.data
					: [];
	}, [positionsData]);
	const levelRecords = useMemo<any[]>(() => {
		const payload = levelsData as any;
		return Array.isArray(payload?.levels)
			? payload.levels
			: Array.isArray(payload?.data?.levels)
				? payload.data.levels
				: Array.isArray(payload?.data)
					? payload.data
					: [];
	}, [levelsData]);
	const workScheduleRecords = useMemo<any[]>(() => {
		const payload = workSchedulesData as any;
		const records = Array.isArray(payload)
			? payload
			: Array.isArray(payload?.schedules)
				? payload.schedules
				: Array.isArray(payload?.scheduleTemplates)
					? payload.scheduleTemplates
					: Array.isArray(payload?.data?.schedules)
						? payload.data.schedules
						: Array.isArray(payload?.data?.scheduleTemplates)
							? payload.data.scheduleTemplates
							: Array.isArray(payload?.data)
								? payload.data
								: [];
		return records.map(normalizeRecruitmentScheduleRecord);
	}, [workSchedulesData]);
	const shiftTypeById = useMemo<Map<string, any>>(() => {
		const payload = shiftTypesData as any;
		const records: any[] = Array.isArray(payload?.data?.shiftTypes)
			? payload.data.shiftTypes
			: Array.isArray(payload?.shiftTypes)
				? payload.shiftTypes
				: Array.isArray(payload?.data)
					? payload.data
					: [];
		return new Map(records.map((shift) => [String(shift.id || shift._id || ""), shift]));
	}, [shiftTypesData]);
	const reportingOptions = useMemo(
		() => recruiterOptions.filter((option) => option.value && option.value !== setupEmployeeId),
		[recruiterOptions, setupEmployeeId],
	);
	const preHireValidation = useMemo(
		() => buildPreHireValidationState(preHireForm),
		[preHireForm],
	);
	const visiblePreHireErrors = preHireShowErrors ? preHireValidation.fieldErrors : {};
	const preHireErrorEntries = useMemo(
		() => Object.entries(visiblePreHireErrors) as Array<[PreHireFieldName, string]>,
		[visiblePreHireErrors],
	);
	const getPreHireError = (field: PreHireFieldName) => visiblePreHireErrors[field];
	const setPreHireErrorNotice = (title: string, detail?: string) =>
		setPreHireNotice({ tone: "error", title, detail });
	const clearPreHireNotice = () => setPreHireNotice(null);
	const renderPreHireFieldError = (field: PreHireFieldName) => {
		const message = getPreHireError(field);
		if (!message) return null;
		return <p className="mt-1 text-xs text-red-600">{message}</p>;
	};
	const focusPreHireField = (field?: PreHireFieldName) => {
		if (!field || typeof document === "undefined") return;
		window.requestAnimationFrame(() => {
			const escapedField = window.CSS?.escape ? window.CSS.escape(field) : field;
			const wrapper = document.querySelector<HTMLElement>(
				`[data-pre-hire-field="${escapedField}"]`,
			);
			const focusable = wrapper?.querySelector<HTMLElement>(
				"input:not([disabled]), button:not([disabled]), [role='combobox']",
			);
			const target = focusable || wrapper;
			target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
			window.setTimeout(() => focusable?.focus({ preventScroll: true }), 250);
		});
	};

	const blockStageMovementIfLocked = () => {
		if (postHireLocked) {
			setStageActionOpen(true);
			toast.message("Move blocked", {
				description: HIRED_RECRUITMENT_LOCK_MESSAGE,
			});
			return true;
		}
		if (!stageMovementLocked) return false;
		setStageActionOpen(true);
		toast.error("Headcount target reached.", {
			description: stageMovementLockMessage,
		});
		return true;
	};
	const stageMovementDisabled = mutationBusy || stageMovementLocked || postHireLocked;
	const stageMovementDisabledTitle = postHireLocked
		? HIRED_RECRUITMENT_LOCK_MESSAGE
		: stageMovementLocked
			? stageMovementLockMessage
			: undefined;

	const run = async (payload: ApplicantActionRequest) => {
		if (isRecruitmentStageMovementAction(payload.action) && blockStageMovementIfLocked()) {
			return;
		}
		setPendingAction(payload.action);
		try {
			await onRunAction(payload);
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setPendingAction(null);
		}
	};

	const executeConfirm = async () => {
		if (!pipelineConfirm) return;
		const confirmed = pipelineConfirm;
		setPendingAction(pipelineConfirm.payload.action);
		setPipelineConfirm(null);
		try {
			let payload = confirmed.payload;
			if (payload.action === "REJECT_STEP") {
				payload = {
					...payload,
					comments:
						comments.trim() || String(payload.comments || "").trim() || "Rejected",
				};
			}
			if (isRecruitmentStageMovementAction(payload.action) && blockStageMovementIfLocked()) {
				return;
			}
			await onRunAction(payload);
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setPendingAction(null);
		}
	};

	const updatePreHireField = (field: keyof PreHireFormDraft, value: string) => {
		setPreHireDirty(true);
		clearPreHireNotice();
		setPreHireForm((current) => {
			if (!current) return current;
			const next = {
				...current,
				[field]: value,
			};
			if (field === "employmentType" && value !== "PROBATIONARY") {
				next.probationEndDate = "";
			}
			if (
				field === "employmentType" &&
				value === "PROBATIONARY" &&
				!next.probationEndDate
			) {
				next.probationEndDate = addMonthsToDateInputValue(
					next.employmentStartDate || next.employmentHireDate,
					6,
				);
			}
			if (
				(field === "employmentStartDate" || field === "employmentHireDate") &&
				next.employmentType === "PROBATIONARY"
			) {
				next.probationEndDate = addMonthsToDateInputValue(
					next.employmentStartDate || next.employmentHireDate,
					6,
				);
			}
			return next;
		});
	};

	const applyPreHireEmployeeId = (employeeId: string, options?: { markDirty?: boolean }) => {
		if (!employeeId.trim()) return;
		if (options?.markDirty) {
			setPreHireDirty(true);
		}
		clearPreHireNotice();
		setPreHireForm((current) =>
			current
				? {
						...current,
						employeeId,
					}
				: current,
		);
	};

	const reservePreHireEmployeeId = async ({ force = false }: { force?: boolean } = {}) => {
		const currentEmployeeId = preHireForm?.employeeId?.trim() || "";
		if (!force && currentEmployeeId) {
			return currentEmployeeId;
		}
		if (!organizationId) {
			throw new Error("Organization ID not found. Please refresh and try again.");
		}
		if (reserveEmployeeIdPromiseRef.current) {
			return reserveEmployeeIdPromiseRef.current;
		}

		const reservePromise = reserveEmployeeIdMutation
			.mutateAsync({ organizationId })
			.then((reserved) => reserved.employeeId)
			.finally(() => {
				reserveEmployeeIdPromiseRef.current = null;
			});

		reserveEmployeeIdPromiseRef.current = reservePromise;
		return reservePromise;
	};

	const selectedDepartment = departmentRecords.find(
		(department: any) =>
			String(department.id || department._id || "") === preHireForm?.departmentId,
	);
	const selectedLevel = levelRecords.find(
		(level: any) => String(level.id || level._id || "") === preHireForm?.levelId,
	);
	const selectedSchedule = workScheduleRecords.find(
		(schedule: any) => String(schedule.id || schedule._id || "") === preHireForm?.scheduleId,
	);
	const selectedScheduleSnapshot = useMemo(() => {
		if (selectedSchedule) {
			return normalizeRecruitmentScheduleSnapshot({
				templateId: selectedSchedule.id || selectedSchedule._id || null,
				templateCode: selectedSchedule.code || "",
				templateName: selectedSchedule.name || "",
				cycleDays: selectedSchedule.cycleDays,
				graceLateMinutes: selectedSchedule.graceLateMinutes,
				graceEarlyOutMinutes: selectedSchedule.graceEarlyOutMinutes,
				pattern: selectedSchedule.pattern,
			});
		}

		const embeddedEmployeeSchedule = normalizeRecruitmentScheduleSnapshot(
			applicant?.convertedToEmployee?.embeddedSchedule,
		);
		const fallbackSnapshot = preHireDraftScheduleSnapshot || embeddedEmployeeSchedule;
		if (!fallbackSnapshot) return null;

		if (
			preHireForm?.scheduleId &&
			fallbackSnapshot.templateId &&
			String(fallbackSnapshot.templateId) !== String(preHireForm.scheduleId)
		) {
			return null;
		}

		return fallbackSnapshot;
	}, [
		applicant?.convertedToEmployee?.embeddedSchedule,
		preHireDraftScheduleSnapshot,
		preHireForm?.scheduleId,
		selectedSchedule,
	]);
	const workScheduleOptions = useMemo(() => {
		const options = workScheduleRecords.map((schedule: any) => ({
			value: String(schedule.id || schedule._id || ""),
			label: buildRecruitmentScheduleLabel(schedule),
		}));
		if (!preHireForm?.scheduleId) return options;
		if (options.some((option) => option.value === preHireForm.scheduleId)) return options;
		if (!selectedScheduleSnapshot) return options;

		const fallbackLabel = buildRecruitmentScheduleLabel({
			code: selectedScheduleSnapshot.templateCode,
			name: selectedScheduleSnapshot.templateName,
		});
		if (!fallbackLabel) return options;

		return [{ value: preHireForm.scheduleId, label: fallbackLabel }, ...options];
	}, [preHireForm?.scheduleId, selectedScheduleSnapshot, workScheduleRecords]);
	const accessPreview = useMemo(() => {
		const roleResult =
			selectedDepartment && selectedLevel
				? deriveRoleAndFlags({
						department: selectedDepartment,
						level: selectedLevel,
					})
				: null;
		const generatedUserName =
			preHireForm?.firstName && preHireForm?.lastName
				? sanitizeGeneratedUsername(`${preHireForm.firstName}-${preHireForm.lastName}`)
				: "";
		return {
			role: roleResult?.role || "",
			generatedUserName,
			loginEmail: preHireForm?.email || "",
		};
	}, [
		preHireForm?.email,
		preHireForm?.firstName,
		preHireForm?.lastName,
		selectedDepartment,
		selectedLevel,
	]);

	const buildPreHireActionMetadata = () => {
		if (!preHireForm) return null;

		const scheduleCycleDays = [7, 14, 21, 28].includes(Number(selectedSchedule?.cycleDays))
			? Number(selectedSchedule?.cycleDays)
			: 7;
		const graceLateMinutes = Number(selectedSchedule?.graceLateMinutes);
		const graceEarlyOutMinutes = Number(selectedSchedule?.graceEarlyOutMinutes);
		const effectiveStartDateUtc =
			convertDateInputToUtc(preHireForm.employmentStartDate) ||
			convertDateInputToUtc(preHireForm.employmentHireDate) ||
			convertDateInputToUtc(formatDateInputValue(new Date()));
		const anchoredEffectiveStart =
			effectiveStartDateUtc && scheduleCycleDays % 7 === 0
				? anchorIsoDateToMondayUtc(effectiveStartDateUtc)
				: effectiveStartDateUtc;
		const embeddedSchedule =
			preHireForm.scheduleId && selectedScheduleSnapshot
				? {
						templateId:
							selectedScheduleSnapshot.templateId ||
							String(preHireForm.scheduleId || ""),
						templateCode: selectedScheduleSnapshot.templateCode || "",
						templateName: selectedScheduleSnapshot.templateName || "",
						cycleDays: scheduleCycleDays,
						graceLateMinutes:
							Number.isFinite(graceLateMinutes) && graceLateMinutes >= 0
								? Math.round(graceLateMinutes)
								: Math.max(
										0,
										Math.round(
											Number(selectedScheduleSnapshot.graceLateMinutes ?? 0),
										),
									),
						graceEarlyOutMinutes:
							Number.isFinite(graceEarlyOutMinutes) && graceEarlyOutMinutes >= 0
								? Math.round(graceEarlyOutMinutes)
								: Math.max(
										0,
										Math.round(
											Number(
												selectedScheduleSnapshot.graceEarlyOutMinutes ?? 0,
											),
										),
									),
						pattern: normalizeRecruitmentSchedulePattern(
							selectedScheduleSnapshot.pattern,
							scheduleCycleDays,
							shiftTypeById,
						),
						effectiveStartDate: effectiveStartDateUtc,
						cycleAnchorDate: anchoredEffectiveStart,
						assignedAt: effectiveStartDateUtc,
						assignedByEmployeeId: selectedScheduleSnapshot.assignedByEmployeeId || null,
						reason: selectedScheduleSnapshot.reason || "recruitment_pre_hire_setup",
						version: selectedScheduleSnapshot.version || 1,
					}
				: undefined;

		return {
			preHireDraft: {
				...preHireForm,
				scheduleSnapshot: embeddedSchedule || null,
			},
		};
	};

	const savePreHireSetup = async (options?: { silentSuccess?: boolean }) => {
		if (!preHireForm) {
			setPreHireShowErrors(true);
			setPreHireErrorNotice(
				"Pre-hire setup form is still loading.",
				"Wait for the applicant details to finish loading, then try saving again.",
			);
			return false;
		}

		const validation = buildPreHireValidationState(preHireForm);
		if (validation.requiredErrorCount > 0) {
			setStageActionOpen(true);
			setPreHireShowErrors(true);
			setPreHireErrorNotice(
				`Complete ${validation.requiredErrorCount} required field${validation.requiredErrorCount === 1 ? "" : "s"} before continuing.`,
				"Review the highlighted fields below. Each one shows the exact validation rule that failed.",
			);
			focusPreHireField(Object.keys(validation.fieldErrors)[0] as PreHireFieldName);
			return false;
		}

		const metadata = buildPreHireActionMetadata();
		if (!metadata) return false;

		try {
			setPendingAction("SAVE_PRE_HIRE_SETUP");
			await onRunAction({
				action: "SAVE_PRE_HIRE_SETUP",
				stepExecutionId: currentStepId || undefined,
				metadata,
			});

			setPreHireDirty(false);
			setPreHireShowErrors(false);
			if (!options?.silentSuccess) {
				setPreHireNotice({
					tone: "success",
					title: "Pre-hire setup saved.",
					detail: "This draft will be used to create the employee record when you confirm the hire.",
				});
			}
			return true;
		} catch (error) {
			setPreHireShowErrors(true);
			setPreHireErrorNotice(
				"We couldn't save the employee setup yet.",
				getErrorMessage(error),
			);
			return false;
		} finally {
			setPendingAction(null);
		}
	};

	const handleUploadContract = async () => {
		if (!contractFile || mutationBusy) return;
		if (blockStageMovementIfLocked()) return;
		setPendingAction("CONTRACT_UPLOAD");
		try {
			await onUploadContract(contractFile);
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setPendingAction(null);
		}
	};

	useEffect(() => {
		if (currentState !== "ONBOARDING_READY") return;
		if (preHireDirty) return;
		setPreHireForm(
			buildPreHireFormDraft(
				applicant,
				applicant?.convertedToEmployee,
				(preHireSetup?.draft as Partial<PreHireFormDraft> | null | undefined) || null,
			),
		);
	}, [applicant, currentState, preHireDirty, preHireSetup?.draft]);
	useEffect(() => {
		hasAttemptedInitialReserveRef.current = false;
	}, [applicant?.id]);
	useEffect(() => {
		if (currentState !== "ONBOARDING_READY") return;
		if (!preHireForm) return;
		if (preHireForm.employeeId.trim()) return;
		if (!organizationId) return;
		if (hasAttemptedInitialReserveRef.current) return;

		hasAttemptedInitialReserveRef.current = true;
		let cancelled = false;
		void reservePreHireEmployeeId()
			.then((employeeId) => {
				if (!cancelled && employeeId && !(preHireForm.employeeId || "").trim()) {
					applyPreHireEmployeeId(employeeId);
				}
			})
			.catch((error) => {
				if (!cancelled) {
					console.error("Failed to reserve recruitment employee ID:", error);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [currentState, organizationId, preHireForm, reserveEmployeeIdMutation]);
	useEffect(() => {
		if (!debug) return;
		if (currentState !== "ONBOARDING_READY") return;
		if (!preHireForm || preHireDirty) return;

		const generatedEmailBase =
			sanitizeGeneratedUsername(`${preHireForm.firstName}-${preHireForm.lastName}`) ||
			sanitizeGeneratedUsername(buildFullName(applicant)) ||
			"recruitment-debug";
		const fallbackHireDate =
			preHireForm.employmentHireDate || formatDateInputValue(new Date()) || "";
		const nextProbationEndDate = addMonthsToDateInputValue(
			preHireForm.employmentStartDate || fallbackHireDate,
			6,
		);
		const nextDraft: PreHireFormDraft = {
			...preHireForm,
			email: preHireForm.email || `${generatedEmailBase}@debug.local`,
			dateOfBirth: preHireForm.dateOfBirth || "1995-01-15",
			gender: preHireForm.gender || "prefer_not_to_say",
			nationality: preHireForm.nationality || "Filipino",
			phoneCountryCode: preHireForm.phoneCountryCode || "+63",
			phoneNumber: preHireForm.phoneNumber || "09171234567",
			street: preHireForm.street || "123 Debug Street",
			city: preHireForm.city || "Makati City",
			state: preHireForm.state || "Metro Manila",
			country: preHireForm.country || "Philippines",
			postalCode: preHireForm.postalCode || "1226",
			departmentId:
				preHireForm.departmentId ||
				String(departmentRecords[0]?.id || departmentRecords[0]?._id || ""),
			positionId:
				preHireForm.positionId ||
				String(positionRecords[0]?.id || positionRecords[0]?._id || ""),
			levelId:
				preHireForm.levelId || String(levelRecords[0]?.id || levelRecords[0]?._id || ""),
			scheduleId:
				preHireForm.scheduleId ||
				String(workScheduleRecords[0]?.id || workScheduleRecords[0]?._id || ""),
			workLocation: preHireForm.workLocation || "ONSITE",
			employmentType: preHireForm.employmentType || "PROBATIONARY",
			employmentHireDate: fallbackHireDate,
			employmentStartDate:
				preHireForm.employmentStartDate ||
				formatDateInputValue(applicant?.availabilityDate) ||
				fallbackHireDate,
			probationEndDate:
				preHireForm.probationEndDate ||
				((preHireForm.employmentType || "PROBATIONARY") === "PROBATIONARY"
					? nextProbationEndDate
					: ""),
			reportToId: preHireForm.reportToId || String(reportingOptions[0]?.value || ""),
			basicSalary:
				preHireForm.basicSalary ||
				String(
					Number(applicant?.expectedSalary) > 0
						? Number(applicant.expectedSalary)
						: 18000,
				),
			currency: preHireForm.currency || "PHP",
			payFrequency: preHireForm.payFrequency || "SEMI_MONTHLY",
		};

		if (JSON.stringify(nextDraft) === JSON.stringify(preHireForm)) return;
		setPreHireForm(nextDraft);
	}, [
		debug,
		applicant,
		currentState,
		departmentRecords,
		levelRecords,
		positionRecords,
		preHireDirty,
		preHireForm,
		reportingOptions,
		workScheduleRecords,
	]);
	useEffect(() => {
		if (currentState !== "ONBOARDING_READY") return;
		if (!preHireShowErrors) return;
		if (!preHireForm) return;
		if (Object.keys(preHireValidation.fieldErrors).length === 0) {
			clearPreHireNotice();
		}
	}, [currentState, preHireForm, preHireShowErrors, preHireValidation.fieldErrors]);
	useEffect(() => {
		if (currentState !== "ONBOARDING_READY") return;
		if (preHireDirty || !preHireForm) return;

		const normalizedNationality = preHireForm.nationality.trim() || "Filipino";
		const normalizedCountry = preHireForm.country.trim() || "Philippines";

		if (
			normalizedNationality === preHireForm.nationality &&
			normalizedCountry === preHireForm.country
		) {
			return;
		}

		setPreHireForm((current) =>
			current
				? {
						...current,
						nationality: current.nationality.trim() || "Filipino",
						country: current.country.trim() || "Philippines",
					}
				: current,
		);
	}, [currentState, preHireDirty, preHireForm]);
	const currentStepId = getCurrentStepId(applicant);
	const activities = Array.isArray(applicant.activities) ? applicant.activities : [];
	const attachments = Array.isArray(applicant.attachments) ? applicant.attachments : [];
	const levelName = getApplicantLevelName(applicant);
	const applicantWorkflowColumns = useMemo(
		() =>
			applicant.workflowInstance
				? buildWorkflowColumns(applicant.workflowInstance)
				: templateWorkflowColumns,
		[applicant.workflowInstance, templateWorkflowColumns],
	);
	const applicantStateLabels = useMemo(
		() =>
			Object.fromEntries(
				applicantWorkflowColumns.map((column) => [column.key, column.label]),
			) as Record<string, string>,
		[applicantWorkflowColumns],
	);

	useEffect(() => {
		setStageActionOpen(true);
	}, [actionState]);

	const nextStageKey = expectedForwardColumnKey(actionState, applicantWorkflowColumns);
	const nextStageLabel = nextStageKey ? getStateLabel(nextStageKey, applicantStateLabels) : "";

	const stageActionMeta: {
		title: string;
		icon: typeof Calendar;
	} = (() => {
		switch (actionState) {
			case "APPLIED":
				return {
					title: "Application actions",
					icon: UserCheck,
				};
			case "SCREENING":
				return {
					title: "Screening actions",
					icon: CheckCircle2,
				};
			case "INTERVIEW_SCHEDULING":
				return {
					title: "Interview scheduling",
					icon: Calendar,
				};
			case "INTERVIEW":
				return {
					title: "Interview actions",
					icon: CheckCircle2,
				};
			case "OFFER_APPROVAL":
				return {
					title: "Offer approval",
					icon: CheckCircle2,
				};
			case "OFFER_SENT":
				return {
					title: "Contract action",
					icon: FileText,
				};
			case "ONBOARDING_READY":
				return {
					title: "Pre-hire setup",
					icon: ExternalLink,
				};
			case "HIRED":
				return {
					title: "Employee action",
					icon: ExternalLink,
				};
			default:
				return {
					title: "Stage actions",
					icon: CheckCircle2,
				};
		}
	})();
	const StageActionIcon = stageActionMeta.icon;

	const buildAdvancePayload = (): ApplicantActionRequest | null => {
		if (!nextStageKey) return null;
		return {
			action: "ADVANCE",
			stepExecutionId: currentStepId || undefined,
			targetStateKey: nextStageKey,
		};
	};

	const openAdvanceConfirm = () => {
		if (blockStageMovementIfLocked()) return;
		const payload = buildAdvancePayload();
		if (!payload?.targetStateKey) {
			toast.error("Could not determine the next stage. Refresh and try again.");
			return;
		}
		if (!currentStepId) {
			toast.error(
				"Workflow step is still loading. Wait a second or close and reopen this candidate.",
			);
			return;
		}
		setPipelineConfirm({
			title: `Continue to ${nextStageLabel}?`,
			description: `${buildFullName(applicant)} will move from ${getStateLabel(actionState, applicantStateLabels)} to ${nextStageLabel}. Everyone using the recruitment board will see this update.`,
			payload,
			confirmLabel: `Yes, go to ${nextStageLabel}`,
		});
	};

	const openSendOfferConfirm = () => {
		if (blockStageMovementIfLocked()) return;
		const tk = expectedForwardColumnKey("INTERVIEW", applicantWorkflowColumns);
		if (!currentStepId || !tk) {
			toast.error("Workflow step not ready. Refresh or try again.");
			return;
		}
		setPipelineConfirm({
			title: "Send for offer approval?",
			description:
				"This advances the candidate past the interview and opens the offer approval step. Confirm only when the interview outcome supports continuing.",
			payload: { action: "SEND_OFFER", stepExecutionId: currentStepId, targetStateKey: tk },
			confirmLabel: "Yes, send for approval",
		});
	};

	const openApproveOfferConfirm = () => {
		if (blockStageMovementIfLocked()) return;
		const tk = expectedForwardColumnKey("OFFER_APPROVAL", applicantWorkflowColumns);
		if (!currentStepId || !tk) {
			toast.error("Workflow step not ready.");
			return;
		}
		setPipelineConfirm({
			title: "Approve this offer?",
			description:
				"The candidate will move to Offer Sent and stakeholders will expect follow-up on paperwork.",
			payload: { action: "APPROVE_STEP", stepExecutionId: currentStepId, targetStateKey: tk },
			confirmLabel: "Yes, approve offer",
		});
	};

	const openMarkHiredConfirm = async (metadata?: Record<string, unknown>) => {
		if (blockStageMovementIfLocked()) return;
		if (!setupEmployeeId && !preHireForm) {
			setStageActionOpen(true);
			toast.error("Create the employee record before confirming the hire.");
			return;
		}
		if (setupEmployeeId && !isLinkedEmployeeReadyForHire) {
			setStageActionOpen(true);
			toast.error("Complete the employee record before confirming hire.");
			return;
		}
		const tk = expectedForwardColumnKey("ONBOARDING_READY", applicantWorkflowColumns);
		if (!currentStepId || !tk) {
			toast.error("Workflow step not ready.");
			return;
		}
		try {
			await assertApplicantHeadcountCapacity(applicant);
		} catch (error: any) {
			setStageActionOpen(true);
			setPreHireErrorNotice(
				"Headcount target reached.",
				error?.message || "Hiring this candidate would exceed the saved recruitment target.",
			);
			toast.error(error?.message || "Headcount target reached.");
			return;
		}
		setPipelineConfirm({
			title: "Mark candidate as hired?",
			description: "Finalize the linked employee record and start onboarding with system access.",
			payload: {
				action: "MARK_HIRED",
				stepExecutionId: currentStepId,
				targetStateKey: tk,
				...(metadata ? { metadata } : {}),
			},
			confirmLabel: "Mark hired",
		});
	};

	const handlePrepareHireConfirm = async () => {
		if (setupEmployeeId) {
			await openMarkHiredConfirm();
			return;
		}
		onCreateEmployeeFromApplicant(applicant);
	};

	const handleLegacyPrepareHireConfirm = async () => {
		if (!preHireForm) {
			setStageActionOpen(true);
			setPreHireShowErrors(true);
			setPreHireErrorNotice(
				"Pre-hire setup form is still loading.",
				"Wait for the pre-hire form to finish loading before confirming the hire.",
			);
			return;
		}

		const validation = buildPreHireValidationState(preHireForm);
		if (validation.requiredErrorCount > 0) {
			setStageActionOpen(true);
			setPreHireShowErrors(true);
			setPreHireErrorNotice(
				`Complete ${validation.requiredErrorCount} required field${validation.requiredErrorCount === 1 ? "" : "s"} before continuing.`,
				"Review the highlighted fields below. Each one shows the exact validation rule that failed.",
			);
			focusPreHireField(Object.keys(validation.fieldErrors)[0] as PreHireFieldName);
			return;
		}

		const metadata = buildPreHireActionMetadata();
		setPreHireShowErrors(false);
		clearPreHireNotice();
		await openMarkHiredConfirm(metadata || undefined);
	};

	const openScheduleInterviewConfirm = () => {
		if (blockStageMovementIfLocked()) return;
		if (!currentStepId) {
			toast.error("Workflow step not ready.");
			return;
		}
		setPipelineConfirm({
			title: "Confirm interview schedule?",
			description: `Date ${scheduleDate}, time ${scheduleTime}, location/link: ${scheduleLocation || "—"}`,
			payload: {
				action: "SCHEDULE_INTERVIEW",
				stepExecutionId: currentStepId,
				metadata: {
					scheduledDate: scheduleDate,
					scheduledTime: scheduleTime,
					location: scheduleLocation,
				},
			},
			confirmLabel: "Confirm schedule",
		});
	};

	const openRejectConfirm = (fallbackComment: string, stageTitle: string) => {
		if (!currentStepId) {
			toast.error("Workflow step not loaded. Refresh and try again.");
			return;
		}
		setPipelineConfirm({
			title: stageTitle,
			description:
				"This moves the candidate to Rejected and removes them from the active pipeline. You can leave notes in the box below before confirming.",
			payload: {
				action: "REJECT_STEP",
				stepExecutionId: currentStepId,
				comments: comments.trim() || fallbackComment,
			},
			confirmLabel: "Yes, reject",
			destructive: true,
		});
	};

	const refId = applicant.applicantId ? String(applicant.applicantId).trim() : "";
	const applicantReference = refId && !OBJECT_ID_LIKE.test(refId) ? refId : "";
	const linkedEmployeeCode = String(applicant?.convertedToEmployee?.employeeId || "").trim();
	const handoffReferenceLabel = setupEmployeeId
		? linkedEmployeeCode
			? "Employee ID"
			: "Employee record"
		: applicantReference
			? "Applicant ref"
			: "Handoff status";
	const handoffReferenceValue = setupEmployeeId
		? linkedEmployeeCode || "Record linked"
		: applicantReference || "Pending employee record";
	const detailRows: Array<{ k: string; v: string }> = [
		{ k: "Role", v: getApplicantPositionTitle(applicant) },
		...(levelName ? [{ k: "Level", v: levelName }] : []),
		{ k: "Applied", v: new Date(applicant.appliedDate).toLocaleDateString() },
		{
			k: "Availability",
			v: applicant.availabilityDate
				? new Date(applicant.availabilityDate).toLocaleDateString()
				: "—",
		},
		{ k: "Expected salary", v: formatCurrency(applicant) },
		{ k: "Source", v: applicant.applicationSource || "—" },
		...(applicantReference ? [{ k: "Reference", v: applicantReference }] : []),
	];

	const hireView = resolveHireEmployeePresentation(applicant);
	/** Hired + linked: skip the generic applicant header—employee teaser replaces it. */
	const employeeLinkedHired =
		actionState === "HIRED" && hireView.isLinked && hireView.identityMatches !== false;
	const linkedEmployeeMismatch =
		actionState === "HIRED" && hireView.isLinked && hireView.identityMatches === false;
	const firstMissingSetupField = preHireMissingFields[0]?.field || null;

	const copyToClipboard = (text: string, label: string) => {
		if (!text || text === "—") return;
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied to clipboard`);
	};

	const passwordLastName = String(
		(applicant?.convertedToEmployee?.person?.personalInfo as any)?.lastName ||
			applicant?.person?.personalInfo?.lastName ||
			"",
	)
		.toLowerCase()
		.replace(/\s+/g, "");
	const computedDefaultPassword =
		passwordLastName && hireView.employeeCode
			? `${passwordLastName}${hireView.employeeCode}!${new Date().getFullYear()}`
			: "—";

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
					{!employeeLinkedHired ? (
						<div className="flex gap-4 border-b border-[#e8dede] pb-5">
							<div className="shrink-0 ring-2 ring-[#ff8a00]/35 ring-offset-2 ring-offset-[#fbf8f5] rounded-full">
								<ProfileInitialsAvatar
									name={hireView.displayName}
									size="lg"
									variant="orange"
								/>
							</div>
							<div className="min-w-0 flex-1 space-y-2">
								<div className="flex flex-wrap gap-2">
									<Badge className="border border-primary/15 font-normal shadow-none text-white">
										{getStateLabel(actionState)}
									</Badge>
								</div>
								<p className="line-clamp-2 break-words text-sm leading-snug text-[#5f5f63]">
									{hireView.email || "—"}
								</p>
							</div>
						</div>
					) : null}

					{linkedEmployeeMismatch ? (
						<div className="mb-5 rounded-xl bg-amber-50/90 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
							<p className="font-medium">Employee record does not match this applicant</p>
							<p className="mt-1 leading-snug text-[#5f5f63]">
								The job application is {buildFullName(applicant)}. The linked employee is{" "}
								{hireView.linkedEmployeeName || hireView.employeeCode || "a different person"}.
								Hire must keep the name and email from the public application.
							</p>
						</div>
					) : null}

					{linkedEmployeeMismatch ? (
						<div className="mb-5 rounded-xl bg-amber-50/90 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
							<p className="font-medium">Employee record does not match this applicant</p>
							<p className="mt-1 leading-snug text-[#5f5f63]">
								The job application is {buildFullName(applicant)}. The linked employee is{" "}
								{hireView.linkedEmployeeName || hireView.employeeCode || "a different person"}.
								Hire must keep the name and email from the public application.
							</p>
						</div>
					) : null}

					{employeeLinkedHired ? (
						<div className="border-b border-[#e8dede] pb-5">
							<RecruitmentEmployeeTeaser
								name={hireView.displayName}
								role={hireView.role}
								level={hireView.level}
								department={hireView.department}
								employeeCode={hireView.employeeCode}
								email={hireView.email}
								onOpenProfile={() => {
									if (hireView.linkId) onOpenEmployee(hireView.linkId);
								}}
							/>
						</div>
					) : null}

					<dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
						{detailRows.map((row) => (
							<div key={row.k} className="min-w-0 border-b border-[#e8dede]/60 pb-3">
								<dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
									{row.k}
								</dt>
								<dd className="mt-1 min-w-0 text-sm leading-snug text-neutral-900">
									{row.v}
								</dd>
							</div>
						))}
					</dl>

					<ApplicantIdentityHistory history={applicant?.identityHistory} />

					{attachments.length > 0 ? (
						<div className="mt-6 border-t border-[#e8dede]/80 pt-4">
							<ul className="flex flex-col gap-2">
								{attachments.map((attachment: any) => (
									<li key={attachment.id} className="min-w-0">
										<button
											type="button"
											onClick={() => {
												const url = String(attachment.url ?? "").trim();
												if (!url) {
													toast.error("Attachment URL is missing.");
													return;
												}
												onOpenAttachment({
													url,
													fileName: attachment.name ?? null,
													ext: attachmentExtFromFileName(attachment.name),
												});
											}}
											title={attachment.name ?? "View attachment"}
											className="inline-flex max-w-full cursor-pointer items-start gap-2 text-left text-sm font-medium text-primary underline-offset-4 hover:underline">
											<FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
											<span className="line-clamp-3 text-sm leading-snug">
												{attachment.name}
											</span>
										</button>
									</li>
								))}
							</ul>
						</div>
					) : null}

					<div className="mt-8 border-t border-[#e8dede] pt-5">
						{activities.length === 0 ? (
							<p className="text-sm text-[#5f5f63]">No activity yet</p>
						) : (
							<ul className="divide-y divide-[#e8dede]/90">
								{activities.slice(0, 12).map((activity: any) => {
									const rows = humanizeActivityDetailRows(
										getActivitySummaryRows(activity),
										employeeLabelById,
									);
									return (
										<li key={activity.id} className="min-w-0 py-4 first:pt-0">
											<div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
												<p className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-900">
													{activity.title}
												</p>
												<time
													dateTime={activity.occurredAt}
													className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[#5f5f63]">
													{new Date(activity.occurredAt).toLocaleString()}
												</time>
											</div>
											{rows.length > 0 ? (
												<dl className="mt-3 min-w-0 space-y-2 border-l-2 border-primary/25 pl-3">
													{rows.map((row) => (
														<div
															key={`${activity.id}-${row.label}`}
															className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 border-b border-[#e8dede]/50 pb-2 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-start">
															<dt className="text-sm text-neutral-600">
																{row.label}
															</dt>
															<dd className="min-w-0 break-words text-sm text-neutral-900">
																{row.value}
															</dd>
														</div>
													))}
												</dl>
											) : null}
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>

				<div className="shrink-0 space-y-4 border-t border-[#e8dede] bg-white/95 px-5 py-5 sm:px-6">
					<Collapsible open={stageActionOpen} onOpenChange={setStageActionOpen}>
						<CollapsibleTrigger className="w-full">
							<div className="flex items-center justify-between gap-3 text-left">
								<div className="flex items-center gap-3">
									<div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8dede] bg-[#fbf8f5] text-[#c0000b] shadow-sm">
										<StageActionIcon className="h-4 w-4" />
									</div>
									<div className="text-sm font-medium text-neutral-900">
										{stageActionMeta.title}
									</div>
								</div>
								<ChevronDown
									className={cn(
										"h-4 w-4 text-neutral-400 transition-transform duration-200",
										stageActionOpen && "rotate-180",
									)}
								/>
							</div>
						</CollapsibleTrigger>
						<CollapsibleContent className="max-h-[70vh] overflow-y-auto pr-1 pt-4">
							{stageMovementLocked && actionState !== "HIRED" ? (
								<div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
									<p className="font-semibold">Recruitment target is full.</p>
									<p className="mt-1 text-orange-700">{stageMovementLockMessage}</p>
								</div>
							) : null}
							{actionState === "HIRED" ? (
								<div className="space-y-4 mb-4">
									{hireView.isLinked ? (
										<p className="text-sm leading-relaxed text-neutral-600">
											{HIRED_RECRUITMENT_LOCK_MESSAGE}
										</p>
									) : null}
									{preHireAccessGeneratedUserName || preHireAccessLoginEmail ? (
										<div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-3 text-sm text-neutral-800">
											<p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
												System Access Provisioned
											</p>
											<div className="mt-2 space-y-2 text-sm">
												<div className="flex items-center gap-2">
													<span className="w-28 text-neutral-500 shrink-0">
														Login Email:
													</span>
													<span className="font-medium text-neutral-900 truncate">
														{preHireAccessLoginEmail || "—"}
													</span>
													{preHireAccessLoginEmail ? (
														<button
															type="button"
															title="Copy Email"
															onClick={() =>
																copyToClipboard(
																	preHireAccessLoginEmail,
																	"Email",
																)
															}
															className="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded p-1 transition-colors hover:bg-emerald-100">
															<Copy className="h-3.5 w-3.5" />
														</button>
													) : null}
												</div>
												<div className="flex items-center gap-2">
													<span className="w-28 text-neutral-500 shrink-0">
														Username:
													</span>
													<span className="font-medium text-neutral-900 truncate">
														{preHireAccessGeneratedUserName || "—"}
													</span>
													{preHireAccessGeneratedUserName ? (
														<button
															type="button"
															title="Copy Username"
															onClick={() =>
																copyToClipboard(
																	preHireAccessGeneratedUserName,
																	"Username",
																)
															}
															className="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded p-1 transition-colors hover:bg-emerald-100">
															<Copy className="h-3.5 w-3.5" />
														</button>
													) : null}
												</div>
												<div className="flex items-center gap-2">
													<span className="w-28 text-neutral-500 shrink-0">
														Default Password:
													</span>
													<span className="font-mono text-neutral-900 font-medium truncate">
														{computedDefaultPassword}
													</span>
													{computedDefaultPassword !== "—" ? (
														<button
															type="button"
															title="Copy Password"
															onClick={() =>
																copyToClipboard(
																	computedDefaultPassword,
																	"Password",
																)
															}
															className="ml-auto shrink-0 text-emerald-600 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded p-1 transition-colors hover:bg-emerald-100">
															<Copy className="h-3.5 w-3.5" />
														</button>
													) : null}
												</div>
											</div>
											<p className="mt-3 text-xs text-emerald-700/80">
												The employee can use their email or username to log
												in. They should change their password after the
												first login.
											</p>
										</div>
									) : null}
								</div>
							) : null}
							{actionState === "APPLIED" ? (
								<div className="space-y-3">
									<div>
										<p className="mb-1.5 text-sm font-medium text-neutral-800">
											Assign HR contact (optional)
										</p>
										<SearchableSelect
											options={recruiterOptions}
											value={assigneeId}
											onValueChange={setAssigneeId}
											placeholder="Search employee…"
											searchPlaceholder="Search employee…"
											emptyText="No people found."
											className="w-full"
										/>
										<p className="mt-2 text-xs leading-relaxed text-neutral-500">
											Optional: pick who owns follow-up. You do{" "}
											<span className="font-medium text-neutral-700">
												not
											</span>{" "}
											need an assignment to continue—use the button below when
											you are ready to move the candidate forward.
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										className="w-full sm:w-auto"
										disabled={!assigneeId || mutationBusy}
										onClick={() =>
											run({
												action: "ASSIGN_RECRUITER",
												metadata: { assigneeId },
											})
										}>
										{pendingAction === "ASSIGN_RECRUITER" ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<UserCheck className="mr-2 h-4 w-4" />
										)}
										Save assignment
									</Button>
									<div className="rounded-lg border border-[#e8dede] bg-[#fbf8f5]/80 p-3">
										<p className="text-xs font-medium text-neutral-800">
											Next pipeline step
										</p>
										<p className="mt-1 text-xs text-neutral-600">
											Moves this applicant to{" "}
											<strong>{nextStageLabel || "the next stage"}</strong>.
											You will confirm in a short dialog before anything
											changes.
										</p>
										<Button
											type="button"
											className="mt-3 w-full"
											disabled={
												stageMovementDisabled ||
												!currentStepId ||
												!buildAdvancePayload()
											}
											title={stageMovementDisabledTitle}
											onClick={openAdvanceConfirm}>
											{pendingAction === "ADVANCE" &&
											pipelineConfirm === null ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<CheckCircle2 className="mr-2 h-4 w-4" />
											)}
											{nextStageLabel
												? `Continue to ${nextStageLabel.toLowerCase()}…`
												: "Continue…"}
										</Button>
										{!currentStepId ? (
											<p className="mt-2 text-xs text-amber-800">
												Loading workflow step… If this message stays,
												refresh the page or reopen this candidate.
											</p>
										) : null}
									</div>
								</div>
							) : null}

							{actionState === "SCREENING" ? (
								<div className="flex flex-col gap-3 sm:flex-row">
									<Button
										type="button"
										variant="outline"
										className="flex-1"
										disabled={mutationBusy}
										onClick={() =>
											openRejectConfirm(
												"Rejected during screening",
												"Reject at screening stage?",
											)
										}>
										<XCircle className="mr-2 h-4 w-4" />
										Reject
									</Button>
									<Button
										type="button"
										className="flex-1"
										disabled={
											stageMovementDisabled ||
											!currentStepId ||
											!buildAdvancePayload()
										}
										title={stageMovementDisabledTitle}
										onClick={openAdvanceConfirm}>
										{pendingAction === "ADVANCE" && pipelineConfirm === null ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<CheckCircle2 className="mr-2 h-4 w-4" />
										)}
										{nextStageLabel
											? `Continue to ${nextStageLabel.toLowerCase()}…`
											: "Continue…"}
									</Button>
								</div>
							) : null}

							{actionState === "INTERVIEW_SCHEDULING" ? (
								<>
									<div className="space-y-4">
										<div className="grid gap-3 sm:grid-cols-2">
											<div className="space-y-2">
												<span className="text-sm font-medium text-neutral-800">
													Date
												</span>
												<CalendarDatePicker
													value={scheduleDate}
													onChange={(v) => setScheduleDate(v)}
													placeholder="Select date"
													className="w-full"
													disabled={stageMovementDisabled}
												/>
											</div>
											<div className="space-y-2">
												<span className="text-sm font-medium text-neutral-800">
													Time
												</span>
												<TimePicker
													value={scheduleTime}
													onChange={(v) => setScheduleTime(v)}
													disabled={stageMovementDisabled}
													className="w-full"
												/>
											</div>
										</div>
										<div className="space-y-2">
											<span className="text-sm font-medium text-neutral-800">
												Location or meeting link
											</span>
											<Input
												placeholder="Office address, Zoom link, etc."
												value={scheduleLocation}
												onChange={(event) =>
													setScheduleLocation(event.target.value)
												}
												disabled={stageMovementDisabled}
												className="w-full"
											/>
										</div>
									</div>
									<Button
										type="button"
										className="w-full"
										disabled={
											!scheduleDate ||
											!scheduleTime ||
											!scheduleLocation.trim() ||
											stageMovementDisabled ||
											!currentStepId
										}
										title={stageMovementDisabledTitle}
										onClick={openScheduleInterviewConfirm}>
										{pendingAction === "SCHEDULE_INTERVIEW" &&
										pipelineConfirm === null ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Calendar className="mr-2 h-4 w-4" />
										)}
										Review & schedule interview
									</Button>
								</>
							) : null}

							{actionState === "INTERVIEW" ? (
								<div className="flex flex-col gap-3 sm:flex-row">
									<Button
										type="button"
										variant="outline"
										className="flex-1"
										disabled={mutationBusy}
										onClick={() =>
											openRejectConfirm(
												"Rejected after interview",
												"Reject after interview?",
											)
										}>
										Reject Candidate
									</Button>
									<Button
										type="button"
										className="flex-1"
										disabled={stageMovementDisabled || !currentStepId}
										title={stageMovementDisabledTitle}
										onClick={openSendOfferConfirm}>
										{pendingAction === "SEND_OFFER" &&
										pipelineConfirm === null ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<CheckCircle2 className="mr-2 h-4 w-4" />
										)}
										Send for offer approval…
									</Button>
								</div>
							) : null}

							{actionState === "OFFER_APPROVAL" ? (
								<div className="flex flex-col gap-3 sm:flex-row">
									<Button
										type="button"
										variant="outline"
										className="flex-1"
										disabled={mutationBusy}
										onClick={() =>
											openRejectConfirm(
												"Offer rejected",
												"Reject this offer?",
											)
										}>
										Reject Offer
									</Button>
									<Button
										type="button"
										className="flex-1"
										disabled={!currentStepId || stageMovementDisabled}
										title={stageMovementDisabledTitle}
										onClick={openApproveOfferConfirm}>
										{pendingAction === "APPROVE_STEP" &&
										pipelineConfirm === null ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<CheckCircle2 className="mr-2 h-4 w-4" />
										)}
										Approve offer…
									</Button>
								</div>
							) : null}

							{actionState === "OFFER_SENT" ? (
								<>
									<Input
										type="file"
										accept=".pdf,.png,.jpg,.jpeg,.txt"
										disabled={stageMovementDisabled}
										onChange={(event) =>
											setContractFile(event.target.files?.[0] || null)
										}
									/>
									<Button
										type="button"
										className="w-full"
										disabled={!contractFile || stageMovementDisabled}
										title={stageMovementDisabledTitle}
										onClick={() => void handleUploadContract()}>
										{pendingAction === "CONTRACT_UPLOAD" ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<FileText className="mr-2 h-4 w-4" />
										)}
										Upload contract & continue
									</Button>
								</>
							) : null}

							{actionState === "ONBOARDING_READY" ? (
								<div className="space-y-4">
									<div className="rounded-lg border border-[#e8dede] bg-[#fbf8f5]/85 p-4">
										<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
											<div className="min-w-0">
												<p className="text-sm font-medium text-neutral-900">
													Employee record handoff
												</p>
											</div>
											{setupEmployeeId ? (
												<Badge
													className={cn(
														"shrink-0 border shadow-none",
														isLinkedEmployeeReadyForHire
															? "border-emerald-200 bg-emerald-50 text-emerald-700"
															: "border-amber-200 bg-amber-50 text-amber-700",
													)}>
													{isLinkedEmployeeReadyForHire
														? "Ready to hire"
														: "Employee incomplete"}
												</Badge>
											) : (
												<Badge className="shrink-0 border border-amber-200 bg-amber-50 text-amber-700 shadow-none">
													Needs employee record
												</Badge>
											)}
										</div>

										<div className="mt-4 grid gap-3 sm:grid-cols-3">
											<div className="rounded-md border border-[#e8dede] bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
													Candidate
												</p>
												<p className="mt-1 truncate text-sm font-medium text-neutral-900">
													{buildFullName(applicant)}
												</p>
											</div>
											<div className="rounded-md border border-[#e8dede] bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
													Role
												</p>
												<p className="mt-1 truncate text-sm font-medium text-neutral-900">
													{levelName ? `${levelName} / ` : ""}
													{getApplicantPositionTitle(applicant)}
												</p>
											</div>
											<div className="rounded-md border border-[#e8dede] bg-white px-3 py-2">
												<p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500">
													{handoffReferenceLabel}
												</p>
												<p className="mt-1 truncate text-sm font-medium text-neutral-900">
													{handoffReferenceValue}
												</p>
											</div>
										</div>

										{setupEmployeeId && preHireMissingFields.length > 0 ? (
											<div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
												<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
													<div>
														<p className="text-sm font-medium text-amber-900">
															Complete employee record before final hire
														</p>
													</div>
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
														disabled={mutationBusy}
														onClick={() =>
															onOpenEmployee(setupEmployeeId, {
																mode: "edit",
																field: firstMissingSetupField,
															})
														}>
														<ExternalLink className="mr-2 h-4 w-4" />
														Open record
													</Button>
												</div>
												<div className="mt-3 flex flex-wrap gap-2">
													{preHireMissingFields.slice(0, 6).map((field) => (
														<span
															key={`${field.group}-${field.field}`}
															className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900">
															{field.label}
														</span>
													))}
													{preHireMissingFields.length > 6 ? (
														<span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900">
															+{preHireMissingFields.length - 6} more
														</span>
													) : null}
												</div>
											</div>
										) : null}
									</div>

									<div className="flex flex-col gap-3 sm:flex-row">
										<Button
											type="button"
											variant={setupEmployeeId ? "outline" : "default"}
											className="flex-1"
											disabled={mutationBusy || (!setupEmployeeId && stageMovementLocked)}
											title={
												!setupEmployeeId && stageMovementLocked
													? stageMovementLockMessage
													: undefined
											}
											onClick={() =>
												setupEmployeeId
													? onOpenEmployee(setupEmployeeId, {
															mode: isLinkedEmployeeReadyForHire
																? "profile"
																: "edit",
															field: firstMissingSetupField,
														})
													: onCreateEmployeeFromApplicant(applicant)
											}>
											<ExternalLink className="mr-2 h-4 w-4" />
											{setupEmployeeId ? "Open employee record" : "Add employee"}
										</Button>
										<Button
											type="button"
											className="flex-1"
											disabled={
												stageMovementDisabled ||
												!setupEmployeeId ||
												!isLinkedEmployeeReadyForHire
											}
											title={
												stageMovementLocked
													? stageMovementLockMessage
													: setupEmployeeId && !isLinkedEmployeeReadyForHire
													? "Complete the linked employee record before confirming hire."
													: undefined
											}
											onClick={() => void handlePrepareHireConfirm()}>
											{pendingAction === "MARK_HIRED" && pipelineConfirm === null ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<CheckCircle2 className="mr-2 h-4 w-4" />
											)}
											Confirm hire
										</Button>
									</div>
								</div>
							) : null}

							{preHireForm &&
							preHireNotice &&
							actionState === "ONBOARDING_READY" &&
							isPreHireSetupPanelEnabled ? (
								<div className="space-y-4">
									<div className="rounded-lg border border-[#e8dede] bg-[#fbf8f5]/85 p-4">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div>
												<p className="text-sm font-medium text-neutral-900">
													Pre-hire employee setup
												</p>
												<p className="mt-1 text-xs leading-relaxed text-neutral-600">
													We prefilled this from the applicant and loaded
													the saved draft. Complete the remaining employee
													data here. No employee record is created at this
													stage. The employee record will only be created
													after you confirm the hire.
												</p>
											</div>
											{preHireForm?.employeeId ? (
												<Badge className="border border-primary/15 bg-white text-primary shadow-none">
													Employee ID: {preHireForm.employeeId}
												</Badge>
											) : null}
										</div>

										{preHireForm ? (
											<div className="mt-4 space-y-4">
												{preHireNotice ? (
													<div
														className={cn(
															"rounded-lg border px-3 py-3 text-sm",
															preHireNotice.tone === "error" &&
																"border-red-200 bg-red-50 text-red-700",
															preHireNotice.tone === "success" &&
																"border-emerald-200 bg-emerald-50 text-emerald-700",
															preHireNotice.tone === "info" &&
																"border-amber-200 bg-amber-50 text-amber-700",
														)}>
														<p className="font-medium">
															{preHireNotice.title}
														</p>
														{preHireNotice.detail ? (
															<p className="mt-1 text-xs leading-relaxed">
																{preHireNotice.detail}
															</p>
														) : null}
													</div>
												) : null}
												{preHireErrorEntries.length > 0 ? (
													<div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-3">
														<p className="text-sm font-medium text-red-700">
															Fields that still need attention
														</p>
														<div className="mt-2 flex flex-wrap gap-2">
															{preHireErrorEntries.map(([field]) => (
																<span
																	key={field}
																	className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs text-red-700">
																	{preHireFieldLabels[field]}
																</span>
															))}
														</div>
													</div>
												) : null}
												<div className="grid gap-3 sm:grid-cols-2">
													<div className="sm:col-span-2">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Employee ID
														</p>
														<div className="flex flex-col gap-2 sm:flex-row">
															<Input
																value={preHireForm.employeeId}
																onChange={(event) =>
																	updatePreHireField(
																		"employeeId",
																		event.target.value,
																	)
																}
																aria-invalid={Boolean(
																	getPreHireError("employeeId"),
																)}
															/>
															<Button
																type="button"
																variant="outline"
																disabled={
																	mutationBusy ||
																	reserveEmployeeIdMutation.isPending
																}
																onClick={() => {
																	void reservePreHireEmployeeId({
																		force: true,
																	})
																		.then((employeeId) => {
																			applyPreHireEmployeeId(
																				employeeId,
																				{
																					markDirty: true,
																				},
																			);
																		})
																		.catch((error) => {
																			setPreHireErrorNotice(
																				"We couldn't reserve a new employee ID yet.",
																				getErrorMessage(
																					error,
																				),
																			);
																		});
																}}>
																{reserveEmployeeIdMutation.isPending ? (
																	<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																) : (
																	<Copy className="mr-2 h-4 w-4" />
																)}
																Reserve ID
															</Button>
														</div>
														{renderPreHireFieldError("employeeId")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															First Name
														</p>
														<Input
															value={preHireForm.firstName}
															disabled
														/>
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Last Name
														</p>
														<Input
															value={preHireForm.lastName}
															disabled
														/>
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Date of Birth
														</p>
														<DatePicker
															value={preHireForm.dateOfBirth}
															onChange={(value) =>
																updatePreHireField(
																	"dateOfBirth",
																	value,
																)
															}
															placeholder="Select date of birth"
															className="w-full"
														/>
														{renderPreHireFieldError("dateOfBirth")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Gender
														</p>
														<SearchableSelect
															options={genderOptions}
															value={preHireForm.gender}
															onValueChange={(value) =>
																updatePreHireField("gender", value)
															}
															placeholder="Select gender"
															searchPlaceholder="Search gender..."
															emptyText="No gender found."
														/>
														{renderPreHireFieldError("gender")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Nationality
														</p>
														<SearchableSelect
															options={nationalityOptions}
															value={
																preHireForm.nationality ||
																"Filipino"
															}
															onValueChange={(value) =>
																updatePreHireField(
																	"nationality",
																	value,
																)
															}
															placeholder="Select nationality"
															searchPlaceholder="Search nationality..."
															emptyText="No nationality found."
														/>
														{renderPreHireFieldError("nationality")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Login Email
														</p>
														<Input
															type="email"
															value={preHireForm.email}
															onChange={(event) =>
																updatePreHireField(
																	"email",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("email"),
															)}
														/>
														{renderPreHireFieldError("email")}
													</div>
												</div>

												<div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Country Code
														</p>
														<Input
															value={preHireForm.phoneCountryCode}
															onChange={(event) =>
																updatePreHireField(
																	"phoneCountryCode",
																	event.target.value,
																)
															}
														/>
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Primary Phone
														</p>
														<Input
															value={preHireForm.phoneNumber}
															onChange={(event) =>
																updatePreHireField(
																	"phoneNumber",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("phoneNumber"),
															)}
														/>
														{renderPreHireFieldError("phoneNumber")}
													</div>
												</div>

												<div className="grid gap-3 sm:grid-cols-2">
													<div
														className="sm:col-span-2"
														data-pre-hire-field="street">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Street Address
														</p>
														<Input
															value={preHireForm.street}
															onChange={(event) =>
																updatePreHireField(
																	"street",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("street"),
															)}
														/>
														{renderPreHireFieldError("street")}
													</div>
													<div data-pre-hire-field="city">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															City
														</p>
														<Input
															value={preHireForm.city}
															onChange={(event) =>
																updatePreHireField(
																	"city",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("city"),
															)}
														/>
														{renderPreHireFieldError("city")}
													</div>
													<div data-pre-hire-field="state">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															State / Province
														</p>
														<Input
															value={preHireForm.state}
															onChange={(event) =>
																updatePreHireField(
																	"state",
																	event.target.value,
																)
															}
														/>
													</div>
													<div data-pre-hire-field="country">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Country
														</p>
														<Input
															value={
																preHireForm.country || "Philippines"
															}
															onChange={(event) =>
																updatePreHireField(
																	"country",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("country"),
															)}
														/>
														{renderPreHireFieldError("country")}
													</div>
													<div data-pre-hire-field="postalCode">
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Postal Code
														</p>
														<Input
															value={preHireForm.postalCode}
															onChange={(event) =>
																updatePreHireField(
																	"postalCode",
																	event.target.value,
																)
															}
														/>
													</div>
												</div>

												<div className="grid gap-3 border-t border-[#e8dede]/80 pt-4 sm:grid-cols-2">
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Department
														</p>
														<SearchableSelect
															options={departmentRecords.map(
																(department: any) => ({
																	value: String(
																		department.id ||
																			department._id ||
																			"",
																	),
																	label:
																		department.name ||
																		"Department",
																}),
															)}
															value={preHireForm.departmentId}
															onValueChange={(value) =>
																updatePreHireField(
																	"departmentId",
																	value,
																)
															}
															placeholder="Select department"
															searchPlaceholder="Search department..."
															emptyText="No department found."
														/>
														{renderPreHireFieldError("departmentId")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Position
														</p>
														<SearchableSelect
															options={positionRecords.map(
																(position: any) => ({
																	value: String(
																		position.id ||
																			position._id ||
																			"",
																	),
																	label:
																		position.title ||
																		"Position",
																}),
															)}
															value={preHireForm.positionId}
															onValueChange={(value) =>
																updatePreHireField(
																	"positionId",
																	value,
																)
															}
															placeholder="Select position"
															searchPlaceholder="Search position..."
															emptyText="No position found."
														/>
														{renderPreHireFieldError("positionId")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Level
														</p>
														<SearchableSelect
															options={levelRecords.map(
																(level: any) => ({
																	value: String(
																		level.id || level._id || "",
																	),
																	label: level.name || "Level",
																}),
															)}
															value={preHireForm.levelId}
															onValueChange={(value) =>
																updatePreHireField("levelId", value)
															}
															placeholder="Select level"
															searchPlaceholder="Search level..."
															emptyText="No level found."
														/>
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Work Schedule
														</p>
														<SearchableSelect
															options={workScheduleOptions}
															value={preHireForm.scheduleId}
															onValueChange={(value) =>
																updatePreHireField(
																	"scheduleId",
																	value,
																)
															}
															placeholder="Select work schedule"
															searchPlaceholder="Search work schedule..."
															emptyText="No work schedule found."
														/>
														{renderPreHireFieldError("scheduleId")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Work Location
														</p>
														<SearchableSelect
															options={workLocationOptions}
															value={preHireForm.workLocation}
															onValueChange={(value) =>
																updatePreHireField(
																	"workLocation",
																	value,
																)
															}
															placeholder="Select work location"
															searchPlaceholder="Search work location..."
															emptyText="No work location found."
														/>
														{renderPreHireFieldError("workLocation")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Employment Type
														</p>
														<SearchableSelect
															options={employmentTypeOptions}
															value={preHireForm.employmentType}
															onValueChange={(value) =>
																updatePreHireField(
																	"employmentType",
																	value,
																)
															}
															placeholder="Select employment type"
															searchPlaceholder="Search employment type..."
															emptyText="No employment type found."
														/>
														{renderPreHireFieldError("employmentType")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Hire Date
														</p>
														<DatePicker
															value={preHireForm.employmentHireDate}
															onChange={(value) =>
																updatePreHireField(
																	"employmentHireDate",
																	value,
																)
															}
															placeholder="Select hire date"
															className="w-full"
														/>
														{renderPreHireFieldError(
															"employmentHireDate",
														)}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Start Date
														</p>
														<DatePicker
															value={preHireForm.employmentStartDate}
															onChange={(value) =>
																updatePreHireField(
																	"employmentStartDate",
																	value,
																)
															}
															placeholder="Select start date"
															className="w-full"
														/>
														{renderPreHireFieldError(
															"employmentStartDate",
														)}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Probation End Date
														</p>
														<DatePicker
															value={preHireForm.probationEndDate}
															onChange={(value) =>
																updatePreHireField(
																	"probationEndDate",
																	value,
																)
															}
															placeholder="Select probation end date"
															className="w-full"
															minDate={
																preHireForm.employmentStartDate ||
																undefined
															}
															disabled={
																preHireForm.employmentType !==
																"PROBATIONARY"
															}
														/>
														{renderPreHireFieldError(
															"probationEndDate",
														)}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Reports To
														</p>
														<SearchableSelect
															options={reportingOptions}
															value={preHireForm.reportToId}
															onValueChange={(value) =>
																updatePreHireField(
																	"reportToId",
																	value,
																)
															}
															placeholder="Select reporting line"
															searchPlaceholder="Search employee..."
															emptyText="No employee found."
														/>
													</div>
												</div>

												<div className="grid gap-3 border-t border-[#e8dede]/80 pt-4 sm:grid-cols-2">
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Basic Salary
														</p>
														<Input
															type="number"
															value={preHireForm.basicSalary}
															onChange={(event) =>
																updatePreHireField(
																	"basicSalary",
																	event.target.value,
																)
															}
															aria-invalid={Boolean(
																getPreHireError("basicSalary"),
															)}
														/>
														{renderPreHireFieldError("basicSalary")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Currency
														</p>
														<SearchableSelect
															options={currencyOptions}
															value={preHireForm.currency}
															onValueChange={(value) =>
																updatePreHireField(
																	"currency",
																	value,
																)
															}
															placeholder="Select currency"
															searchPlaceholder="Search currency..."
															emptyText="No currency found."
														/>
														{renderPreHireFieldError("currency")}
													</div>
													<div>
														<p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															Pay Frequency
														</p>
														<SearchableSelect
															options={payFrequencyOptions}
															value={preHireForm.payFrequency}
															onValueChange={(value) =>
																updatePreHireField(
																	"payFrequency",
																	value,
																)
															}
															placeholder="Select pay frequency"
															searchPlaceholder="Search pay frequency..."
															emptyText="No pay frequency found."
														/>
														{renderPreHireFieldError("payFrequency")}
													</div>
													<div className="rounded-md border border-[#e8dede] bg-white px-3 py-2 text-sm text-neutral-700">
														<p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
															System Access
														</p>
														<div className="mt-2 space-y-1 text-sm">
															<p>
																Role:{" "}
																{accessPreview.role ||
																	"Pending level/department"}
															</p>
															<p>
																Login:{" "}
																{accessPreview.loginEmail ||
																	"Pending email"}
															</p>
															<p>
																Username:{" "}
																{accessPreview.generatedUserName ||
																	"Pending name"}
															</p>
														</div>
													</div>
												</div>
											</div>
										) : (
											<div className="mt-4 rounded-lg border border-dashed border-[#e8dede] bg-white px-4 py-6 text-sm text-neutral-500">
												Preparing the employee setup form…
											</div>
										)}
									</div>

									<div className="flex gap-3">
										<Button
											type="button"
											variant="outline"
											className="flex-1"
											disabled={mutationBusy}
											onClick={() => void savePreHireSetup()}>
											{pendingAction === "SAVE_PRE_HIRE_SETUP" ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<ExternalLink className="mr-2 h-4 w-4" />
											)}
											Save draft
										</Button>
										<Button
											type="button"
											className="flex-1"
											disabled={stageMovementDisabled}
											title={stageMovementDisabledTitle}
											onClick={() => void handlePrepareHireConfirm()}>
											{(pendingAction === "MARK_HIRED" ||
												pendingAction === "SAVE_PRE_HIRE_SETUP") &&
											pipelineConfirm === null ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<CheckCircle2 className="mr-2 h-4 w-4" />
											)}
											Confirm hire…
										</Button>
									</div>
								</div>
							) : null}

							{actionState !== "HIRED" ? (
								<Textarea
									value={comments}
									onChange={(event) => setComments(event.target.value)}
									placeholder="Add internal notes"
									className="mt-4 min-h-[76px] bg-white"
								/>
							) : null}
						</CollapsibleContent>
					</Collapsible>
				</div>
			</div>

			<Dialog
				open={pipelineConfirm !== null}
				onOpenChange={(open) => !open && !mutationBusy && setPipelineConfirm(null)}>
				<DialogContent
					className="z-[240] gap-4 border-[#e8dede] bg-white sm:max-w-md"
					showCloseButton={!mutationBusy}>
					<DialogHeader>
						<DialogTitle>{pipelineConfirm?.title}</DialogTitle>
						<DialogDescription className="text-left text-neutral-600">
							{pipelineConfirm?.description}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							type="button"
							variant="outline"
							disabled={mutationBusy}
							onClick={() => setPipelineConfirm(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							variant={pipelineConfirm?.destructive ? "destructive" : "default"}
							disabled={mutationBusy}
							className="gap-2"
							onClick={() => void executeConfirm()}>
							{pendingAction === pipelineConfirm?.payload.action ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							{pipelineConfirm?.confirmLabel ?? "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
