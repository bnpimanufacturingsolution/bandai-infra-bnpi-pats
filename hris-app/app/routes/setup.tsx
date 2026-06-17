import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
	ArrowRight,
	BadgeCheck,
	CheckCircle2,
	ChevronLeft,
	CircleAlert,
	GitBranch,
	Upload,
} from "lucide-react";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { Button } from "~/components/atoms/Button";
import { Select, type SelectOption } from "~/components/atoms/Select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import CompanyIntroduction from "~/components/organisms/onboarding/company-introduction";
import { Input } from "~/components/ui/input";
import { StepRail, type SetupRailStep } from "~/components/setup/StepRail";
import bandaiLogo from "~/assets/bandai_logo.png";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useBootstrapAdmin,
	useInitializeSystemProvisioning,
	useProvisioningLeaveSettings,
	useProvisioningPayrollSettings,
	useProvisioningTimesheetSettings,
	useSystemProvisioningPreview,
	useSystemProvisioningStatus,
	useUpdateProvisioningHrSettings,
	useUpdateProvisioningLeaveSettings,
	useUpdateProvisioningPayrollSettings,
	useUpdateProvisioningTimesheetSettings,
} from "~/lib/hooks/useSystemProvisioning";
import { cn } from "~/lib/utils";
import { getRedirectPathByRole } from "~/lib/utils/role-redirect";
import type { LeavePolicyConfig } from "~/services/leave-settings.service";
import systemProvisioningService from "~/services/system-provisioning.service";
import type {
	OvertimeQualificationRule,
	PayrollFinalizationRule,
	TimesheetConfig,
	WorkTimeRoundingRule,
} from "~/services/timesheet.service";

type SetupStepId =
	| "company-profile"
	| "timesheet-settings"
	| "payroll-settings"
	| "leave-settings"
	| "workflow-templates"
	| "review"
	| "initialize-system"
	| "admin-account";

type PayrollTabId = "cycle" | "tax" | "contributions" | "rates";

type PayrollCycleDraft = {
	defaultPayFrequency: string;
	payDateOffsetDays: number;
	businessDayRule: string;
	includeHolidaysInBusinessDayCheck: boolean;
	cycleRules: Record<string, any>;
};

type PayrollCalculatorDraft = {
	name: string;
	description: string;
	type: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
	taxRates: Array<Record<string, any>>;
	sssRates: Record<string, any>;
	philHealthRates: Record<string, any>;
	pagibigRates: Record<string, any>;
	rateMultipliers: Record<string, any>;
};

type GeneratedPayrollPeriod = {
	name: string;
	startDate: string;
	endDate: string;
	payDate: string;
	payFrequency?: string;
	status?: "DRAFT" | "OPEN";
	notes?: string;
	key: string;
	label: string;
	periodNumber: number;
};

const LAST_STEP_STORAGE_KEY = "hris-setup-last-step-v1";
const LOGIN_PREFILL_STORAGE_KEY = "hris-login-prefill-v1";
const DEFAULT_ADMIN_EMAIL = "admin@bandai.local";
const DEFAULT_ADMIN_USERNAME = "hris-admin";
const DEFAULT_ADMIN_PASSWORD = "password123";

const STEP_ORDER: SetupStepId[] = [
	"company-profile",
	"timesheet-settings",
	"payroll-settings",
	"workflow-templates",
	"review",
	"admin-account",
];

const STEP_CONTENT: Record<SetupStepId, { title: string; description: string }> = {
	"company-profile": {
		title: "Confirm company profile",
		description: "",
	},
	"timesheet-settings": {
		title: "Timesheet rules",
		description: "",
	},
	"payroll-settings": {
		title: "Payroll defaults",
		description: "",
	},
	"leave-settings": {
		title: "Leave policies",
		description: "",
	},
	"workflow-templates": {
		title: "Workflow templates",
		description: "",
	},
	review: {
		title: "Final review",
		description: "",
	},
	"initialize-system": {
		title: "Finish workspace setup",
		description: "",
	},
	"admin-account": {
		title: "Create HR admin",
		description: "",
	},
};

const PAYROLL_RATE_ROWS = [
	{ key: "ordinaryDay", label: "Ordinary Day" },
	{ key: "restDayOrSpecialHoliday", label: "Rest Day or Special Holiday" },
	{ key: "specialHolidayOnRestDay", label: "Special Holiday on Rest Day" },
	{ key: "regularHoliday", label: "Regular Holiday" },
	{ key: "regularHolidayOnRestDay", label: "Regular Holiday on Rest Day" },
	{ key: "doubleHoliday", label: "Double Holiday" },
	{ key: "doubleHolidayOnRestDay", label: "Double Holiday on Rest Day" },
] as const;

const LEGACY_SETUP_STEP_REDIRECTS: Record<string, SetupStepId> = {
	welcome: "company-profile",
	"company-intro": "company-profile",
	"initialize-system": "review",
	"leave-settings": "workflow-templates",
	"payroll-periods": "review",
	"workforce-recruitment": "workflow-templates",
	"workflows": "workflow-templates",
	"workflow-templates": "workflow-templates",
};

const COMMON_TIMEZONE_OPTIONS: SelectOption[] = [
	{ value: "Asia/Manila", label: "Asia/Manila (Philippines)" },
	{ value: "Asia/Singapore", label: "Asia/Singapore" },
	{ value: "Asia/Tokyo", label: "Asia/Tokyo" },
	{ value: "Asia/Hong_Kong", label: "Asia/Hong Kong" },
	{ value: "Australia/Sydney", label: "Australia/Sydney" },
	{ value: "Europe/London", label: "Europe/London" },
	{ value: "Europe/Berlin", label: "Europe/Berlin" },
	{ value: "America/New_York", label: "America/New York" },
	{ value: "America/Chicago", label: "America/Chicago" },
	{ value: "America/Los_Angeles", label: "America/Los Angeles" },
	{ value: "UTC", label: "UTC" },
];

const ROUNDING_INCREMENT_OPTIONS: SelectOption[] = [1, 5, 10, 15, 30, 60].map((value) => ({
	value: String(value),
	label: `${value} min`,
}));

const ROUNDING_MODE_OPTIONS: SelectOption[] = [
	{ value: "NONE", label: "No rounding" },
	{ value: "NEAREST", label: "Nearest" },
	{ value: "UP", label: "Round up" },
	{ value: "DOWN", label: "Round down" },
];

const OVERTIME_ROUNDING_MODE_OPTIONS = ROUNDING_MODE_OPTIONS.filter(
	(option) => option.value !== "NONE",
);

const APPLY_TO_OPTIONS: SelectOption[] = [
	{ value: "WORKED_MINUTES", label: "Worked minutes" },
	{ value: "PAYABLE_MINUTES", label: "Payable minutes" },
];

const REJECT_BEHAVIOR_OPTIONS: SelectOption[] = [
	{ value: "REVISE", label: "Return for revision" },
	{ value: "REJECT", label: "Reject outright" },
];

const DEFAULT_TIMESHEET_RULE_DRAFT: {
	workTimeRounding: WorkTimeRoundingRule;
	overtimeQualification: OvertimeQualificationRule;
	payrollFinalization: PayrollFinalizationRule;
} = {
	workTimeRounding: {
		enabled: false,
		incrementMinutes: 1,
		mode: "NONE",
		applyTo: "WORKED_MINUTES",
	},
	overtimeQualification: {
		enabled: true,
		minimumMinutesBeforeQualification: 60,
		rounding: {
			enabled: false,
			incrementMinutes: 15,
			mode: "NEAREST",
		},
		basis: "POST_SHIFT_EXCESS",
	},
	payrollFinalization: {
		enabled: true,
		lockTimesheetOnCutoffFinalization: true,
		allowUnlockWithAuthorizedPayrollRun: false,
		freezeComputedValuesOnLock: true,
	},
};

function isSetupStepId(value: string | null): value is SetupStepId {
	return value != null && STEP_ORDER.includes(value as SetupStepId);
}

function formatFrequencyLabel(value?: string | null) {
	return String(value || "SEMI_MONTHLY")
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLeaveType(value?: string | null) {
	return String(value || "")
		.toLowerCase()
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatTitleCase(value?: string | null) {
	return String(value || "")
		.toLowerCase()
		.replace(/_/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function buildTimezoneOptions(selectedTimezone?: string | null): SelectOption[] {
	const normalizedSelected = String(selectedTimezone || "").trim();
	const existing = COMMON_TIMEZONE_OPTIONS.find((option) => option.value === normalizedSelected);

	if (!normalizedSelected || existing) {
		return COMMON_TIMEZONE_OPTIONS;
	}

	return [
		{
			value: normalizedSelected,
			label: normalizedSelected,
		},
		...COMMON_TIMEZONE_OPTIONS,
	];
}

function resolveSetupLogo(value?: string | null) {
	const logo = String(value || "").trim();
	if (!logo || logo === "assets/images/bandai_logo.png") return bandaiLogo;
	return logo;
}

function createUtcDate(year: number, month: number, day: number) {
	return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function formatUtcDateInput(date: Date) {
	return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value?: string) {
	if (!value) return "-";
	const parsed = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function resolveUtcDayInMonth(year: number, month: number, day: number) {
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const safeDay = Math.min(Math.max(day, 1), lastDay);
	return createUtcDate(year, month, safeDay);
}

function addUtcDays(date: Date, days: number) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function buildProvisioningPayrollPeriodsForYear(
	year: number,
	cycleDraft: PayrollCycleDraft | null,
): GeneratedPayrollPeriod[] {
	if (!cycleDraft) return [];

	const frequency = String(cycleDraft.defaultPayFrequency || "SEMI_MONTHLY");
	const payDateOffsetDays = Number(cycleDraft.payDateOffsetDays || 0);

	if (frequency === "MONTHLY") {
		return Array.from({ length: 12 }, (_, month): GeneratedPayrollPeriod => {
			const start = createUtcDate(year, month, 1);
			const end = resolveUtcDayInMonth(year, month, 31);
			const payDate = addUtcDays(end, payDateOffsetDays);
			const monthLabel = start.toLocaleDateString("en-US", {
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			});
			const row: GeneratedPayrollPeriod = {
				key: `monthly-${year}-${month + 1}`,
				label: monthLabel,
				name: `${monthLabel} Payroll`,
				startDate: formatUtcDateInput(start),
				endDate: formatUtcDateInput(end),
				payDate: formatUtcDateInput(payDate),
				payFrequency: "MONTHLY",
				status: "OPEN",
				notes: "Generated from payroll settings.",
				periodNumber: month + 1,
			};
			return row;
		});
	}

	if (frequency !== "SEMI_MONTHLY") return [];

	const semiMonthlyRules = cycleDraft.cycleRules?.SEMI_MONTHLY || {
		firstStartDay: 1,
		secondStartDay: 16,
		secondEndDay: "LAST_DAY",
	};
	const firstStartDay = Number(semiMonthlyRules.firstStartDay || 1);
	const secondStartDay = Number(semiMonthlyRules.secondStartDay || 16);
	const secondEndDay = semiMonthlyRules.secondEndDay ?? "LAST_DAY";
	const firstEndDay = Math.max(firstStartDay, secondStartDay - 1);

	return Array.from({ length: 12 }, (_, month): GeneratedPayrollPeriod[] => {
		const firstStart = resolveUtcDayInMonth(year, month, firstStartDay);
		const firstEnd = resolveUtcDayInMonth(year, month, firstEndDay);
		const firstPayDate = addUtcDays(firstEnd, payDateOffsetDays);
		const secondStart = resolveUtcDayInMonth(year, month, secondStartDay);
		const secondEnd =
			secondEndDay === "LAST_DAY"
				? resolveUtcDayInMonth(year, month, 31)
				: Number(secondEndDay) < secondStartDay
					? resolveUtcDayInMonth(
							month === 11 ? year + 1 : year,
							(month + 1) % 12,
							Number(secondEndDay),
						)
					: resolveUtcDayInMonth(year, month, Number(secondEndDay));
		const secondPayDate = addUtcDays(secondEnd, payDateOffsetDays);
		const monthLabel = firstStart.toLocaleDateString("en-US", {
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		});

		const period1: GeneratedPayrollPeriod = {
			key: `semi-${year}-${month + 1}-1`,
			label: `${monthLabel} - Period 1`,
			name: `Period 1 - ${monthLabel}`,
			startDate: formatUtcDateInput(firstStart),
			endDate: formatUtcDateInput(firstEnd),
			payDate: formatUtcDateInput(firstPayDate),
			payFrequency: "SEMI_MONTHLY",
			status: "OPEN",
			notes: "Generated from payroll settings.",
			periodNumber: month * 2 + 1,
		};
		const period2: GeneratedPayrollPeriod = {
			key: `semi-${year}-${month + 1}-2`,
			label: `${monthLabel} - Period 2`,
			name: `Period 2 - ${monthLabel}`,
			startDate: formatUtcDateInput(secondStart),
			endDate: formatUtcDateInput(secondEnd),
			payDate: formatUtcDateInput(secondPayDate),
			payFrequency: "SEMI_MONTHLY",
			status: "OPEN",
			notes: "Generated from payroll settings.",
			periodNumber: month * 2 + 2,
		};
		return [period1, period2];
	}).flat();
}

function getCurrentStepFromStorage() {
	if (typeof window === "undefined") return null;
	const value = window.localStorage.getItem(LAST_STEP_STORAGE_KEY);
	return isSetupStepId(value) ? value : null;
}

function StepHeader(props: { step: SetupStepId; currentIndex: number; totalSteps: number }) {
	const meta = STEP_CONTENT[props.step];
	const progress = ((props.currentIndex + 1) / props.totalSteps) * 100;

	return (
		<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
			<div className="h-1 bg-orange-100">
				<div
					className="h-full bg-orange-600 transition-all duration-300"
					style={{ width: `${progress}%` }}
				/>
			</div>
			<div className="px-4 py-3 lg:px-5">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="max-w-3xl">
						<h1 className="text-xl font-semibold tracking-tight text-gray-900 lg:text-2xl">
							{meta.title}
						</h1>
						{meta.description ? (
							<p className="mt-3 text-sm leading-6 text-gray-600">
								{meta.description}
							</p>
						) : null}
					</div>
					<div className="w-fit rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-gray-900 whitespace-nowrap">
						Step {props.currentIndex + 1} of {props.totalSteps}
					</div>
				</div>
			</div>
		</div>
	);
}

function MetricCard(props: { label: string; value: string; tone?: "brand" | "neutral" }) {
	return (
		<div
			className={cn(
				"rounded-xl border p-3",
				props.tone === "brand"
					? "border-orange-200 bg-orange-50 text-orange-900"
					: "border-gray-200 bg-white text-gray-900",
			)}>
			<p className="text-sm text-gray-500">{props.label}</p>
			<p className="mt-1 text-2xl font-semibold">{props.value}</p>
		</div>
	);
}

function SectionCard(props: { title: string; description?: string; children: ReactNode }) {
	return (
		<section className="rounded-xl border border-gray-200 bg-white p-4 lg:p-5">
			<div>
				<h2 className="text-lg font-semibold text-gray-900">{props.title}</h2>
			</div>
			<div className="mt-4">{props.children}</div>
		</section>
	);
}

function FieldLabel(props: { children: ReactNode }) {
	return (
		<label className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
			{props.children}
		</label>
	);
}

function PreviewRow(props: { label: string; value: ReactNode; valueClassName?: string }) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0 last:pb-0 first:pt-0">
			<p className="shrink-0 text-sm text-gray-500">{props.label}</p>
			<div
				className={cn(
					"min-w-0 max-w-[18rem] text-right text-sm font-medium text-gray-900 break-words",
					props.valueClassName,
				)}>
				{props.value}
			</div>
		</div>
	);
}

function InlineTabButton(props: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={props.onClick}
			className={cn(
				"rounded-lg border px-4 py-2 text-sm font-semibold transition",
				props.active
					? "border-orange-200 bg-orange-50 text-orange-700"
					: "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:text-orange-700",
			)}>
			{props.label}
		</button>
	);
}

function ReviewListGroup(props: {
	title: string;
	countLabel: string;
	icon: ReactNode;
	rows: Array<{ id: string; primary: string; secondary: string }>;
	emptyMessage: string;
}) {
	return (
		<section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-orange-700">
						{props.icon}
					</div>
					<h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
				</div>
				<div className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
					{props.countLabel}
				</div>
			</div>
			<div className="mt-3 space-y-2">
				{props.rows.length ? (
					props.rows.map((row) => (
						<div
							key={row.id}
							className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
							<p className="text-sm font-medium text-gray-900 break-words">
								{row.primary}
							</p>
							<p className="mt-1 text-xs leading-5 text-gray-500 break-words">
								{row.secondary}
							</p>
						</div>
					))
				) : (
					<div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
						{props.emptyMessage}
					</div>
				)}
			</div>
		</section>
	);
}

function ToggleBlock(props: {
	label: string;
	description?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const nextChecked = !props.checked;
	const actionLabel = nextChecked ? "Turn on" : "Turn off";

	return (
		<>
			<button
				type="button"
				onClick={() => setIsConfirmOpen(true)}
				className={cn(
					"flex w-full items-start justify-between gap-4 rounded-lg border p-3 text-left transition",
					props.checked
						? "border-orange-200 bg-orange-50"
						: "border-gray-200 bg-gray-50/70 hover:border-orange-200 hover:bg-orange-50/40",
				)}>
				<div>
					<p className="text-sm font-semibold text-gray-900">{props.label}</p>
				</div>
				<div
					className={cn(
						"mt-1 flex h-6 w-11 items-center rounded-full px-1 transition",
						props.checked ? "bg-orange-600" : "bg-gray-300",
					)}>
					<div
						className={cn(
							"h-4 w-4 rounded-full bg-white transition",
							props.checked ? "translate-x-5" : "translate-x-0",
						)}
					/>
				</div>
			</button>

			<Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
				<DialogContent className="w-[calc(100vw-2rem)] max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm setting change</DialogTitle>
						<DialogDescription>
							{actionLabel} {props.label.toLowerCase()}?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsConfirmOpen(false)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-orange-600 text-white hover:bg-orange-700"
							onClick={() => {
								props.onChange(nextChecked);
								setIsConfirmOpen(false);
							}}>
							{actionLabel}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function WorkflowSummaryCell(props: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-0 px-3 py-2.5">
			<p className="truncate text-xs font-medium text-gray-500">{props.label}</p>
			<div className="mt-1 truncate text-sm font-semibold text-gray-900">
				{props.value}
			</div>
		</div>
	);
}

function StepActions(props: {
	onBack?: () => void;
	primaryLabel: string;
	onPrimary: () => void;
	primaryDisabled?: boolean;
	secondaryLabel?: string;
	onSecondary?: () => void;
}) {
	const [pendingAction, setPendingAction] = useState<{
		label: string;
		onConfirm: () => void;
	} | null>(null);

	const requestConfirmation = (label: string, onConfirm: () => void) => {
		setPendingAction({ label, onConfirm });
	};

	const confirmAction = () => {
		const action = pendingAction;
		setPendingAction(null);
		action?.onConfirm();
	};

	return (
		<>
			<div className="flex flex-wrap justify-between gap-3">
				{props.onBack ? (
					<Button type="button" variant="outline" onClick={props.onBack}>
						<ChevronLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				) : (
					<div />
				)}
				<div className="flex flex-wrap gap-3">
					{props.secondaryLabel && props.onSecondary ? (
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								requestConfirmation(props.secondaryLabel || "Continue", props.onSecondary!)
							}>
							{props.secondaryLabel}
						</Button>
					) : null}
					<Button
						type="button"
						onClick={() => requestConfirmation(props.primaryLabel, props.onPrimary)}
						disabled={props.primaryDisabled}
						className="bg-orange-600 text-white hover:bg-orange-700">
						{props.primaryLabel}
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				</div>
			</div>

			<Dialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
				<DialogContent className="w-[calc(100vw-2rem)] max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm step change</DialogTitle>
						<DialogDescription>
							Continue with {pendingAction?.label.toLowerCase() || "this action"}?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setPendingAction(null)}>
							Cancel
						</Button>
						<Button
							type="button"
							className="bg-orange-600 text-white hover:bg-orange-700"
							onClick={confirmAction}>
							Continue
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function normalizeNumberInput(value: string, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SetupRoute() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { isAuthenticated, user } = useAuth();
	const { data: status, isLoading, refetch } = useSystemProvisioningStatus(true);
	const previewEnabled = Boolean(
		status?.summary.previewAvailable ||
			status?.summary.hasHrSettings ||
			(status?.provisioning?.hrSettings?.companyName &&
				status?.provisioning?.hrSettings?.timezone),
	);
	const previewQuery = useSystemProvisioningPreview(previewEnabled);
	const preview = previewQuery.data;

	const timesheetQuery = useProvisioningTimesheetSettings(true);
	const payrollSettingsQuery = useProvisioningPayrollSettings(true);
	const leaveSettingsQuery = useProvisioningLeaveSettings(true);

	const updateHrSettings = useUpdateProvisioningHrSettings();
	const updateTimesheetSettings = useUpdateProvisioningTimesheetSettings();
	const updatePayrollSettings = useUpdateProvisioningPayrollSettings();
	const updateLeaveSettings = useUpdateProvisioningLeaveSettings();
	const initializeProvisioning = useInitializeSystemProvisioning();
	const bootstrapAdmin = useBootstrapAdmin();

	const [savedStep, setSavedStep] = useState<SetupStepId | null>(null);
	const [payrollTab, setPayrollTab] = useState<PayrollTabId>("cycle");

	const [companyName, setCompanyName] = useState("");
	const [companyDescription, setCompanyDescription] = useState("");
	const [companyLogo, setCompanyLogo] = useState("");
	const [primaryColor, setPrimaryColor] = useState("#E60012");
	const [secondaryColor, setSecondaryColor] = useState("#FF8200");
	const [accentColor, setAccentColor] = useState("#f59e0b");
	const [timezone, setTimezone] = useState("Asia/Manila");

	const [timesheetDraft, setTimesheetDraft] = useState<TimesheetConfig | null>(null);
	const [payrollCycleDraft, setPayrollCycleDraft] = useState<PayrollCycleDraft | null>(null);
	const [payrollCalculatorDraft, setPayrollCalculatorDraft] =
		useState<PayrollCalculatorDraft | null>(null);
	const [leaveDrafts, setLeaveDrafts] = useState<Record<string, LeavePolicyConfig>>({});
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);
	const [seedPhilippineHolidays, setSeedPhilippineHolidays] = useState(true);
	const [seedMandated201DocumentTypes, setSeedMandated201DocumentTypes] = useState(true);
	const [seedWorkflowTemplates, setSeedWorkflowTemplates] = useState(true);
	const [seedDefaultLeaveTypes, setSeedDefaultLeaveTypes] = useState(false);

	const [didInitCompany, setDidInitCompany] = useState(false);
	const [didInitTimesheet, setDidInitTimesheet] = useState(false);
	const [didInitPayroll, setDidInitPayroll] = useState(false);
	const [didInitLeave, setDidInitLeave] = useState(false);

	const [adminEmail, setAdminEmail] = useState(DEFAULT_ADMIN_EMAIL);
	const [adminUserName, setAdminUserName] = useState(DEFAULT_ADMIN_USERNAME);
	const [adminPassword, setAdminPassword] = useState(DEFAULT_ADMIN_PASSWORD);

	useEffect(() => {
		setSavedStep(getCurrentStepFromStorage());
	}, []);

	useEffect(() => {
		if (!status || didInitCompany) return;
		const branding = status.organization.branding || {};
		const colors = branding.colors || {};
		setCompanyName(
			status.provisioning?.hrSettings?.companyName ||
				preview?.companyProfile.name ||
				status.organization.name ||
				"Bandai Namco",
		);
		setCompanyDescription(
			status.organization.description || preview?.companyProfile.description || "",
		);
		setCompanyLogo(resolveSetupLogo(String(branding.logo || preview?.companyProfile.logo || "")));
		setPrimaryColor(String(colors.primary || "#E60012"));
		setSecondaryColor(String(colors.secondary || "#FF8200"));
		setAccentColor(String(colors.accent || "#f59e0b"));
		setTimezone(
			status.provisioning?.hrSettings?.timezone ||
				preview?.companyProfile.timezone ||
				"Asia/Manila",
		);
		setDidInitCompany(true);
	}, [
		didInitCompany,
		preview?.companyProfile.description,
		preview?.companyProfile.logo,
		preview?.companyProfile.name,
		preview?.companyProfile.timezone,
		status,
	]);

	useEffect(() => {
		if (!timesheetQuery.data || didInitTimesheet) return;
		setTimesheetDraft({
			...timesheetQuery.data,
			workTimeRounding:
				timesheetQuery.data.workTimeRounding ||
				DEFAULT_TIMESHEET_RULE_DRAFT.workTimeRounding,
			overtimeQualification:
				timesheetQuery.data.overtimeQualification || {
					...DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification,
					minimumMinutesBeforeQualification:
						timesheetQuery.data.overtimeFlagThresholdMinutes ||
						DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification
							.minimumMinutesBeforeQualification,
				},
			payrollFinalization:
				timesheetQuery.data.payrollFinalization ||
				DEFAULT_TIMESHEET_RULE_DRAFT.payrollFinalization,
		});
		setDidInitTimesheet(true);
	}, [didInitTimesheet, timesheetQuery.data]);

	useEffect(() => {
		if (!payrollSettingsQuery.data || didInitPayroll) return;
		setPayrollCycleDraft({
			defaultPayFrequency: payrollSettingsQuery.data.cycleConfig.defaultPayFrequency,
			payDateOffsetDays: payrollSettingsQuery.data.cycleConfig.payDateOffsetDays,
			businessDayRule: payrollSettingsQuery.data.cycleConfig.businessDayRule,
			includeHolidaysInBusinessDayCheck:
				payrollSettingsQuery.data.cycleConfig.includeHolidaysInBusinessDayCheck,
			cycleRules: (payrollSettingsQuery.data.cycleConfig.cycleRules as Record<
				string,
				any
			>) || {
				SEMI_MONTHLY: {
					firstStartDay: 1,
					secondStartDay: 16,
					secondEndDay: "LAST_DAY",
				},
			},
		});
		setPayrollCalculatorDraft({
			name: payrollSettingsQuery.data.defaultCalculator.name,
			description: payrollSettingsQuery.data.defaultCalculator.description || "",
			type: payrollSettingsQuery.data.defaultCalculator.type,
			taxRates: Array.isArray(payrollSettingsQuery.data.defaultCalculator.taxRates)
				? payrollSettingsQuery.data.defaultCalculator.taxRates
				: [],
			sssRates: payrollSettingsQuery.data.defaultCalculator.sssRates || {},
			philHealthRates: payrollSettingsQuery.data.defaultCalculator.philHealthRates || {},
			pagibigRates: payrollSettingsQuery.data.defaultCalculator.pagibigRates || {},
			rateMultipliers: payrollSettingsQuery.data.defaultCalculator.rateMultipliers || {},
		});
		setDidInitPayroll(true);
	}, [didInitPayroll, payrollSettingsQuery.data]);

	useEffect(() => {
		if (!leaveSettingsQuery.data || didInitLeave) return;
		const nextDrafts: Record<string, LeavePolicyConfig> = {};
		for (const policy of leaveSettingsQuery.data) {
			nextDrafts[policy.leaveType] = { ...policy };
		}
		setLeaveDrafts(nextDrafts);
		setDidInitLeave(true);
	}, [didInitLeave, leaveSettingsQuery.data]);

	const requestedStep = searchParams.get("step");
	const legacyRequestedStep = requestedStep ? LEGACY_SETUP_STEP_REDIRECTS[requestedStep] : null;
	const showBandaiIntro =
		!requestedStep && !(status?.summary.isProvisioned && !status.summary.hasAdmin);

	useEffect(() => {
		if (!status || !legacyRequestedStep) return;
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				next.set("step", legacyRequestedStep);
				return next;
			},
			{ replace: true },
		);
	}, [legacyRequestedStep, setSearchParams, status]);

	useEffect(() => {
		if (!status || showBandaiIntro || legacyRequestedStep) return;
		if (isSetupStepId(requestedStep)) return;

		const resumed =
			status.summary.isProvisioned && !status.summary.hasAdmin
				? "admin-account"
				: savedStep && savedStep !== "admin-account"
					? savedStep
					: "company-profile";

		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				next.set("step", resumed);
				return next;
			},
			{ replace: true },
		);
	}, [legacyRequestedStep, requestedStep, savedStep, setSearchParams, showBandaiIntro, status]);

	const currentStep = isSetupStepId(requestedStep)
		? requestedStep
		: status?.summary.isProvisioned && !status.summary.hasAdmin
			? "admin-account"
			: legacyRequestedStep || savedStep || "company-profile";
	const currentIndex = STEP_ORDER.indexOf(currentStep);

	useEffect(() => {
		if (showBandaiIntro) return;
		if (!isSetupStepId(currentStep)) return;
		if (typeof window === "undefined") return;
		window.localStorage.setItem(LAST_STEP_STORAGE_KEY, currentStep);
	}, [currentStep, showBandaiIntro]);

	const activeLeavePolicies = Object.values(leaveDrafts);
	const paidLeaveCount = activeLeavePolicies.filter((policy) => policy.isPaid).length;
	const approvalLeaveCount = activeLeavePolicies.filter(
		(policy) => policy.requiresApproval,
	).length;
	const payrollPreviewYear = preview?.payrollPeriods.year || new Date().getFullYear();
	const generatedPayrollPeriods = useMemo(
		() => buildProvisioningPayrollPeriodsForYear(payrollPreviewYear, payrollCycleDraft),
		[payrollPreviewYear, payrollCycleDraft],
	);
	const semiMonthlyUnifiedShift = useMemo(() => {
		const firstStartDay = Number(
			payrollCycleDraft?.cycleRules?.SEMI_MONTHLY?.firstStartDay || 1,
		);
		return Math.min(Math.max(firstStartDay, 1), 16);
	}, [payrollCycleDraft?.cycleRules?.SEMI_MONTHLY?.firstStartDay]);
	const timezoneOptions = useMemo(() => buildTimezoneOptions(timezone), [timezone]);
	const workflowConfigItems = useMemo(
		() => (preview?.workflowConfigs || []) as any[],
		[preview?.workflowConfigs],
	);
	const holidayItems = useMemo(() => (preview?.holidays || []) as any[], [preview?.holidays]);
	const documentTypeItems = useMemo(
		() => (preview?.documentTypes || []) as any[],
		[preview?.documentTypes],
	);
	if (isLoading || !status) {
		return <LoadingScreen message="Loading setup workspace" />;
	}

	if (status.mode === "READY") {
		if (isAuthenticated && user?.role) {
			return <Navigate to={getRedirectPathByRole(user.role as any)} replace />;
		}
		return <Navigate to="/auth/login" replace />;
	}

	const goToStep = (step: SetupStepId) => {
		setSearchParams((current) => {
			const next = new URLSearchParams(current);
			next.set("step", step);
			return next;
		});
	};

	const goBack = () => {
		const previousStep = STEP_ORDER[currentIndex - 1];
		if (previousStep) {
			goToStep(previousStep);
			return;
		}
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				next.delete("step");
				return next;
			},
			{ replace: true },
		);
	};

	const railSteps: SetupRailStep[] = STEP_ORDER.map((step, index) => ({
		id: step,
		title: STEP_CONTENT[step].title,
		isCurrent: currentStep === step,
		isComplete:
			status.summary.isProvisioned && step !== "admin-account"
				? index < STEP_ORDER.indexOf("admin-account")
				: index < currentIndex,
		isLocked:
			index > currentIndex ||
			(step === "admin-account" ? !status.summary.isProvisioned : false),
	}));

	const workflowConfigPreviewRows =
		workflowConfigItems.slice(0, 4).map((workflow) => ({
			id: workflow.code,
			primary: workflow.name,
			secondary: `${formatTitleCase(workflow.domain)}${workflow.requestType ? ` - ${formatTitleCase(workflow.requestType)}` : ""} - ${Array.isArray(workflow.steps) ? workflow.steps.length : 0} steps - ${Array.isArray(workflow.states) ? workflow.states.length : 0} states`,
		})) || [];
	const holidayPreviewRows =
		holidayItems.slice(0, 4).map((holiday: any) => {
			const hasSeedDateParts =
				typeof holiday.month === "number" &&
				typeof holiday.day === "number" &&
				typeof holiday.year === "number";
			const dateLabel = hasSeedDateParts
				? `${String(holiday.month).padStart(2, "0")}/${String(holiday.day).padStart(2, "0")}/${holiday.year}`
				: formatDisplayDate(String(holiday.startDate || "").slice(0, 10) || undefined);
			return {
				id: String(holiday.id || `${holiday.title}-${dateLabel}`),
				primary: holiday.title,
				secondary: `${dateLabel} - ${formatTitleCase(holiday.holidayType || "holiday")}`,
			};
		}) || [];
	const documentPreviewRows =
		documentTypeItems.slice(0, 4).map((documentType: any) => ({
			id: String(documentType.id || documentType.code),
			primary: documentType.name,
			secondary: `${documentType.uploadBy} upload - ${documentType.isRequired ? "Required" : "Optional"}`,
		})) || [];
	const leavePolicyPreviewRows = seedDefaultLeaveTypes
		? (preview?.leavePolicies || []).map((policy) => ({
				id: policy.leaveType,
				primary: formatLeaveType(policy.leaveType),
				secondary: `${policy.isPaid ? "Paid" : "Unpaid"} / ${
					policy.requiresApproval ? "Approval required" : "No approval"
				}`,
			}))
		: [];
	const handleSaveCompanyProfile = async () => {
		await updateHrSettings.mutateAsync({
			companyName: companyName.trim(),
			timezone: timezone.trim(),
			description: companyDescription.trim(),
			logo: companyLogo.trim(),
			primaryColor,
			secondaryColor,
			accentColor,
		});
		await refetch();
		goToStep("timesheet-settings");
	};

	const handleCompanyLogoUpload = async (file?: File | null) => {
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error("Upload an image file for the company logo");
			return;
		}

		setIsUploadingLogo(true);
		try {
			const result = await systemProvisioningService.uploadLogo(file);
			setCompanyLogo(result.logo);
			await refetch();
			toast.success("Company logo uploaded");
		} finally {
			setIsUploadingLogo(false);
		}
	};

	const handleSaveTimesheet = async () => {
		if (!timesheetDraft) return;
		await updateTimesheetSettings.mutateAsync({
			enableAutoApprove: timesheetDraft.enableAutoApprove,
			enableEditBeforeSubmission: timesheetDraft.enableEditBeforeSubmission,
			rejectBehavior: timesheetDraft.rejectBehavior,
			overtimeFlagThresholdMinutes: Number(timesheetDraft.overtimeFlagThresholdMinutes || 0),
			workTimeRounding: timesheetDraft.workTimeRounding,
			overtimeQualification: timesheetDraft.overtimeQualification,
			payrollFinalization: timesheetDraft.payrollFinalization,
		});
		await refetch();
		goToStep("payroll-settings");
	};

	const handleSavePayrollSettings = async () => {
		if (!payrollCycleDraft || !payrollCalculatorDraft) return;
		await updatePayrollSettings.mutateAsync({
			defaultPayFrequency: payrollCycleDraft.defaultPayFrequency as any,
			payDateOffsetDays: Number(payrollCycleDraft.payDateOffsetDays || 0),
			businessDayRule: payrollCycleDraft.businessDayRule as any,
			includeHolidaysInBusinessDayCheck: Boolean(
				payrollCycleDraft.includeHolidaysInBusinessDayCheck,
			),
			cycleRules: payrollCycleDraft.cycleRules as any,
			calculator: {
				name: payrollCalculatorDraft.name,
				description: payrollCalculatorDraft.description,
				type: payrollCalculatorDraft.type,
				taxRates: payrollCalculatorDraft.taxRates,
				sssRates: payrollCalculatorDraft.sssRates,
				philHealthRates: payrollCalculatorDraft.philHealthRates,
				pagibigRates: payrollCalculatorDraft.pagibigRates,
				rateMultipliers: payrollCalculatorDraft.rateMultipliers as any,
			},
		});
		await refetch();
		goToStep("workflow-templates");
	};

	const setSemiMonthlyUnifiedShift = (rawValue: number) => {
		const firstStartDay = Math.min(Math.max(Number(rawValue) || 1, 1), 16);
		const secondStartDay = Math.min(firstStartDay + 15, 31);
		const secondEndDay: number | "LAST_DAY" =
			firstStartDay === 1 ? "LAST_DAY" : firstStartDay - 1;
		setPayrollCycleDraft((current) =>
			current
				? {
						...current,
						cycleRules: {
							...current.cycleRules,
							SEMI_MONTHLY: {
								firstStartDay,
								secondStartDay,
								secondEndDay,
							},
						},
					}
				: current,
		);
	};

	const applySemiMonthlyPreset = (firstStartDay: number) => {
		setSemiMonthlyUnifiedShift(firstStartDay);
	};

	const handleSaveLeaveSettings = async () => {
		if (!leaveSettingsQuery.data?.length) {
			goToStep("review");
			return;
		}

		const dirtyPolicies = leaveSettingsQuery.data
			.filter((policy) => {
				const draft = leaveDrafts[policy.leaveType];
				return draft && JSON.stringify(draft) !== JSON.stringify(policy);
			})
			.map((policy) => {
				const draft = leaveDrafts[policy.leaveType];
				return {
					leaveType: policy.leaveType,
					payload: {
						enabled: draft.enabled,
						isPaid: draft.isPaid,
						requiresApproval: draft.requiresApproval,
						minAdvanceNoticeDays: Number(draft.minAdvanceNoticeDays || 0),
						maxDaysPerRequest: Number(draft.maxDaysPerRequest || 0),
						allowHalfDay: draft.allowHalfDay,
						requireAttachment: draft.requireAttachment,
						allowedEmploymentTypes: draft.allowedEmploymentTypes,
					},
				};
			});

		if (dirtyPolicies.length > 0) {
			await updateLeaveSettings.mutateAsync(dirtyPolicies as any);
			await refetch();
		}

		goToStep("workflow-templates");
	};

	const handleInitialize = async () => {
		const response = await initializeProvisioning.mutateAsync({
			seedPhilippineHolidays,
			seedMandated201DocumentTypes,
			seedWorkflowTemplates,
			seedDefaultLeaveTypes,
		});
		await refetch();
		if (response.status?.summary?.hasAdmin) {
			if (isAuthenticated && user?.role) {
				navigate(getRedirectPathByRole(user.role as any), { replace: true });
				return;
			}
			navigate("/auth/login", { replace: true });
			return;
		}
		goToStep("admin-account");
	};

	const handleBootstrapAdmin = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextEmail = adminEmail.trim();
		await bootstrapAdmin.mutateAsync({
			email: nextEmail,
			userName: adminUserName.trim(),
			password: adminPassword,
		});
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(LAST_STEP_STORAGE_KEY);
			window.localStorage.setItem(
				LOGIN_PREFILL_STORAGE_KEY,
				JSON.stringify({
					email: nextEmail,
					password: adminPassword,
				}),
			);
		}
		await refetch();
		navigate("/auth/login", { replace: true });
	};

	return (
		<div className="min-h-screen bg-[#f6f2ed] selection:bg-orange-100 selection:text-orange-900">
			<div className="px-3 py-3 lg:px-5 lg:py-4">
				{showBandaiIntro ? (
					<div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center">
						<div className="w-full">
							<CompanyIntroduction
								onBack={() => navigate(-1)}
								onSkip={() => goToStep("company-profile")}
								onNext={() => goToStep("company-profile")}
							/>
						</div>
					</div>
				) : (
					<div className="mx-auto grid max-w-[1440px] gap-4 xl:h-[calc(100vh-2rem)] xl:grid-cols-[280px_minmax(0,1fr)] xl:overflow-hidden">
						<div className="xl:min-h-0 xl:overflow-y-auto">
							<StepRail
								steps={railSteps}
								currentStep={currentStep}
								onSelect={(step) => goToStep(step as SetupStepId)}
								progressValue={((currentIndex + 1) / STEP_ORDER.length) * 100}
							/>
						</div>

						<div className="flex min-h-0 flex-col gap-4">
							<StepHeader
								step={currentStep}
								currentIndex={currentIndex}
								totalSteps={STEP_ORDER.length}
							/>

							<div className="min-h-0 space-y-4 overflow-y-auto pr-1">
							{currentStep === "company-profile" ? (
								<div className="space-y-4">
									<SectionCard title="Company profile">
										<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
											<div className="grid gap-4 md:grid-cols-2">
												<div className="space-y-2">
													<FieldLabel>Company Name</FieldLabel>
													<Input
														value={companyName}
														onChange={(event) =>
															setCompanyName(event.target.value)
														}
														className="h-12 rounded-xl border-gray-200 bg-white"
													/>
												</div>
												<div className="space-y-2">
													<FieldLabel>Timezone</FieldLabel>
													<Select
														options={timezoneOptions}
														value={timezone}
														onChange={setTimezone}
														className="h-12 rounded-xl border-gray-200 bg-white text-sm"
													/>
												</div>
												<div className="space-y-2 md:col-span-2">
													<FieldLabel>Description</FieldLabel>
													<textarea
														value={companyDescription}
														onChange={(event) =>
															setCompanyDescription(event.target.value)
														}
														rows={3}
														className="min-h-[92px] w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
													/>
												</div>
												<div className="space-y-2 md:col-span-2">
													<FieldLabel>Company Logo</FieldLabel>
													<label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30">
														<span className="min-w-0 truncate text-gray-600">
															{companyLogo
																? "Logo uploaded"
																: "Choose PNG, JPG, or WebP"}
														</span>
														<span className="inline-flex shrink-0 items-center font-semibold text-orange-700">
															<Upload className="mr-2 h-4 w-4" />
															{isUploadingLogo ? "Uploading..." : "Upload"}
														</span>
														<input
															type="file"
															accept="image/png,image/jpeg,image/webp,image/svg+xml"
															className="sr-only"
															disabled={isUploadingLogo}
															onChange={(event) => {
																void handleCompanyLogoUpload(
																	event.target.files?.[0],
																);
																event.currentTarget.value = "";
															}}
														/>
													</label>
												</div>
												<div className="grid gap-4 md:col-span-2 md:grid-cols-3">
													{[
														{
															label: "Primary Color",
															value: primaryColor,
															setValue: setPrimaryColor,
														},
														{
															label: "Secondary Color",
															value: secondaryColor,
															setValue: setSecondaryColor,
														},
														{
															label: "Accent Color",
															value: accentColor,
															setValue: setAccentColor,
														},
													].map((colorField) => (
														<div key={colorField.label} className="space-y-2">
															<FieldLabel>{colorField.label}</FieldLabel>
															<div className="flex h-12 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 shadow-sm">
																<input
																	type="color"
																	value={colorField.value}
																	onChange={(event) =>
																		colorField.setValue(
																			event.target.value,
																		)
																	}
																	className="h-7 w-9 shrink-0 cursor-pointer border-0 bg-transparent p-0"
																	aria-label={colorField.label}
																/>
																<Input
																	value={colorField.value}
																	onChange={(event) =>
																		colorField.setValue(
																			event.target.value,
																		)
																	}
																	className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
																/>
															</div>
														</div>
													))}
												</div>
											</div>

											<div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
												<div className="flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-white px-4">
													{companyLogo ? (
														<img
															src={companyLogo}
															alt={`${companyName || "Company"} logo`}
															className="max-h-16 max-w-full object-contain"
														/>
													) : (
														<div className="text-sm font-semibold text-gray-500">
															Logo preview
														</div>
													)}
												</div>
												<div className="mt-4 space-y-3">
													<p className="truncate text-base font-semibold text-gray-900">
														{companyName || "Company name"}
													</p>
													<p className="line-clamp-4 text-sm leading-6 text-gray-600">
														{companyDescription || "Company description"}
													</p>
													<div className="flex gap-2">
														{[primaryColor, secondaryColor, accentColor].map(
															(color) => (
																<span
																	key={color}
																	className="h-6 w-10 rounded-md border border-gray-200"
																	style={{ backgroundColor: color }}
																/>
															),
														)}
													</div>
												</div>
											</div>
										</div>
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel={
											updateHrSettings.isPending
												? "Saving..."
												: "Save and Continue"
										}
										onPrimary={handleSaveCompanyProfile}
										primaryDisabled={
											updateHrSettings.isPending ||
											!companyName.trim() ||
											!timezone.trim()
										}
									/>
								</div>
							) : null}

							{currentStep === "timesheet-settings" ? (
								<div className="space-y-4">
									<SectionCard title="Timesheet rules">
										{timesheetDraft ? (
											<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
												<div className="space-y-4">
													<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
														<ToggleBlock
															label="Work time rounding"
															checked={Boolean(
																timesheetDraft.workTimeRounding
																	?.enabled,
															)}
															onChange={(enabled) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				workTimeRounding: {
																					...(current.workTimeRounding ||
																						DEFAULT_TIMESHEET_RULE_DRAFT.workTimeRounding),
																					enabled,
																				},
																			}
																		: current,
																)
															}
														/>
														<div className="grid gap-3 border-t border-gray-100 p-3 md:grid-cols-3">
															<div className="space-y-2">
																<FieldLabel>Increment</FieldLabel>
																<Select
																	value={String(
																		timesheetDraft.workTimeRounding
																			?.incrementMinutes || 1,
																	)}
																	onChange={(value) =>
																		setTimesheetDraft((current) =>
																			current
																				? {
																						...current,
																						workTimeRounding:
																							{
																								...(current.workTimeRounding ||
																									DEFAULT_TIMESHEET_RULE_DRAFT.workTimeRounding),
																								incrementMinutes:
																									Number(
																										value,
																									) as any,
																							},
																					}
																				: current,
																		)
																	}
																	options={ROUNDING_INCREMENT_OPTIONS}
																	className="h-10 rounded-md"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>Mode</FieldLabel>
																<Select
																	value={
																		timesheetDraft.workTimeRounding
																			?.mode || "NONE"
																	}
																	onChange={(value) =>
																		setTimesheetDraft((current) =>
																			current
																				? {
																						...current,
																						workTimeRounding:
																							{
																								...(current.workTimeRounding ||
																									DEFAULT_TIMESHEET_RULE_DRAFT.workTimeRounding),
																								mode: value as any,
																							},
																					}
																				: current,
																		)
																	}
																	options={ROUNDING_MODE_OPTIONS}
																	className="h-10 rounded-md"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>Apply To</FieldLabel>
																<Select
																	value={
																		timesheetDraft.workTimeRounding
																			?.applyTo ||
																		"WORKED_MINUTES"
																	}
																	onChange={(value) =>
																		setTimesheetDraft((current) =>
																			current
																				? {
																						...current,
																						workTimeRounding:
																							{
																								...(current.workTimeRounding ||
																									DEFAULT_TIMESHEET_RULE_DRAFT.workTimeRounding),
																								applyTo:
																									value as any,
																							},
																					}
																				: current,
																		)
																	}
																	options={APPLY_TO_OPTIONS}
																	className="h-10 rounded-md"
																/>
															</div>
														</div>
													</div>

													<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
														<ToggleBlock
															label="Overtime qualification"
															checked={Boolean(
																timesheetDraft.overtimeQualification
																	?.enabled,
															)}
															onChange={(enabled) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				overtimeQualification: {
																					...(current.overtimeQualification ||
																						DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification),
																					enabled,
																				},
																			}
																		: current,
																)
															}
														/>
														<div className="grid gap-3 border-t border-gray-100 p-3 md:grid-cols-3">
															<div className="flex min-w-0 flex-col gap-2">
																<div className="flex min-h-8 items-end">
																	<FieldLabel>Minimum Excess</FieldLabel>
																</div>
																<Input
																	type="number"
																	min={0}
																	value={String(
																		timesheetDraft
																			.overtimeQualification
																			?.minimumMinutesBeforeQualification ||
																			0,
																	)}
																	onChange={(event) =>
																		setTimesheetDraft((current) => {
																			if (!current) return current;
																			const value =
																				normalizeNumberInput(
																					event.target.value,
																					0,
																				);
																			return {
																				...current,
																				overtimeFlagThresholdMinutes:
																					value,
																				overtimeQualification:
																					{
																						...(current.overtimeQualification ||
																							DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification),
																						minimumMinutesBeforeQualification:
																							value,
																					},
																			};
																		})
																	}
																	className="h-10 rounded-md border-gray-200 bg-white"
																/>
															</div>
															<div className="flex min-w-0 flex-col gap-2">
																<div className="flex min-h-8 items-end">
																	<FieldLabel>OT Round Increment</FieldLabel>
																</div>
																<Select
																	value={String(
																		timesheetDraft.overtimeQualification
																			?.rounding
																			?.incrementMinutes || 15,
																	)}
																	onChange={(value) =>
																		setTimesheetDraft((current) =>
																			current
																				? {
																						...current,
																						overtimeQualification:
																							{
																								...(current.overtimeQualification ||
																									DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification),
																								rounding: {
																									...((current.overtimeQualification ||
																										DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification)
																										.rounding ||
																										DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification
																											.rounding),
																									incrementMinutes:
																										Number(
																											value,
																										) as any,
																								},
																							},
																					}
																				: current,
																		)
																	}
																	options={ROUNDING_INCREMENT_OPTIONS}
																	className="h-10 rounded-md"
																/>
															</div>
															<div className="flex min-w-0 flex-col gap-2">
																<div className="flex min-h-8 items-end">
																	<FieldLabel>OT Round Mode</FieldLabel>
																</div>
																<Select
																	value={
																		timesheetDraft.overtimeQualification
																			?.rounding?.mode ||
																		"NEAREST"
																	}
																	onChange={(value) =>
																		setTimesheetDraft((current) =>
																			current
																				? {
																						...current,
																						overtimeQualification:
																							{
																								...(current.overtimeQualification ||
																									DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification),
																								rounding: {
																									...((current.overtimeQualification ||
																										DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification)
																										.rounding ||
																										DEFAULT_TIMESHEET_RULE_DRAFT.overtimeQualification
																											.rounding),
																									mode: value as any,
																								},
																							},
																					}
																				: current,
																		)
																	}
																	options={OVERTIME_ROUNDING_MODE_OPTIONS}
																	className="h-10 rounded-md"
																/>
															</div>
														</div>
													</div>
												</div>

												<div className="space-y-4">
													<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
														<ToggleBlock
															label="Employee edit before submit"
															checked={Boolean(
																timesheetDraft.enableEditBeforeSubmission,
															)}
															onChange={(enableEditBeforeSubmission) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				enableEditBeforeSubmission,
																			}
																		: current,
																)
															}
														/>
														<ToggleBlock
															label="Auto approve timesheet"
															checked={Boolean(
																timesheetDraft.enableAutoApprove,
															)}
															onChange={(enableAutoApprove) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				enableAutoApprove,
																			}
																		: current,
																)
															}
														/>
														<div className="border-t border-gray-100 p-3">
															<FieldLabel>Reject Behavior</FieldLabel>
															<Select
																value={
																	timesheetDraft.rejectBehavior ||
																	"REVISE"
																}
																onChange={(value) =>
																	setTimesheetDraft((current) =>
																		current
																			? {
																					...current,
																					rejectBehavior:
																						value as any,
																				}
																			: current,
																	)
																}
																options={REJECT_BEHAVIOR_OPTIONS}
																className="mt-2 h-10 rounded-md"
															/>
														</div>
													</div>

													<div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
														<ToggleBlock
															label="Payroll finalization"
															checked={Boolean(
																timesheetDraft.payrollFinalization
																	?.enabled,
															)}
															onChange={(enabled) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				payrollFinalization: {
																					...(current.payrollFinalization ||
																						DEFAULT_TIMESHEET_RULE_DRAFT.payrollFinalization),
																					enabled,
																				},
																			}
																		: current,
																)
															}
														/>
														<ToggleBlock
															label="Lock on cutoff"
															checked={Boolean(
																timesheetDraft.payrollFinalization
																	?.lockTimesheetOnCutoffFinalization,
															)}
															onChange={(lockTimesheetOnCutoffFinalization) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				payrollFinalization: {
																					...(current.payrollFinalization ||
																						DEFAULT_TIMESHEET_RULE_DRAFT.payrollFinalization),
																					lockTimesheetOnCutoffFinalization,
																				},
																			}
																		: current,
																)
															}
														/>
														<ToggleBlock
															label="Freeze computed values"
															checked={Boolean(
																timesheetDraft.payrollFinalization
																	?.freezeComputedValuesOnLock,
															)}
															onChange={(freezeComputedValuesOnLock) =>
																setTimesheetDraft((current) =>
																	current
																		? {
																				...current,
																				payrollFinalization: {
																					...(current.payrollFinalization ||
																						DEFAULT_TIMESHEET_RULE_DRAFT.payrollFinalization),
																					freezeComputedValuesOnLock,
																				},
																			}
																		: current,
																)
															}
														/>
													</div>
												</div>
											</div>
										) : (
											<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
												Loading timesheet setup values...
											</div>
										)}
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel={
											updateTimesheetSettings.isPending
												? "Saving..."
												: "Save and Continue"
										}
										onPrimary={handleSaveTimesheet}
										primaryDisabled={
											!timesheetDraft || updateTimesheetSettings.isPending
										}
									/>
								</div>
							) : null}

							{currentStep === "payroll-settings" ? (
								<div className="space-y-4">
									<div className="flex flex-wrap gap-3">
										{(
											[
												"cycle",
												"tax",
												"contributions",
												"rates",
											] as PayrollTabId[]
										).map((tab) => (
											<InlineTabButton
												key={tab}
												label={
													tab === "tax"
														? "Tax Table"
														: tab === "contributions"
															? "Contributions"
															: tab === "rates"
																? "Rate Multipliers"
																: "Cycle"
												}
												active={payrollTab === tab}
												onClick={() => setPayrollTab(tab)}
											/>
										))}
									</div>

									<SectionCard title="Payroll defaults">
										{payrollCycleDraft && payrollCalculatorDraft ? (
											<div className="space-y-5">
												{payrollTab === "cycle" ? (
													<div className="space-y-5">
														<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]">
															<div className="space-y-2">
																<FieldLabel>
																	Default Frequency
																</FieldLabel>
																<select
																	value={
																		payrollCycleDraft.defaultPayFrequency
																	}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							defaultPayFrequency:
																								event
																									.target
																									.value,
																						}
																					: current,
																		)
																	}
																	className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm">
																	{[
																		"DAILY",
																		"WEEKLY",
																		"BIWEEKLY",
																		"SEMI_MONTHLY",
																		"MONTHLY",
																		"QUARTERLY",
																		"ANNUALLY",
																	].map((option) => (
																		<option
																			key={option}
																			value={option}>
																			{formatFrequencyLabel(
																				option,
																			)}
																		</option>
																	))}
																</select>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Pay Date Offset Days
																</FieldLabel>
																<Input
																	type="number"
																	min={0}
																	max={60}
																	value={String(
																		payrollCycleDraft.payDateOffsetDays ||
																			0,
																	)}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							payDateOffsetDays:
																								normalizeNumberInput(
																									event
																										.target
																										.value,
																									0,
																								),
																						}
																					: current,
																		)
																	}
																	className="h-12 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Business Day Rule
																</FieldLabel>
																<select
																	value={
																		payrollCycleDraft.businessDayRule
																	}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							businessDayRule:
																								event
																									.target
																									.value,
																						}
																					: current,
																		)
																	}
																	className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm">
																	<option value="NEXT_BUSINESS_DAY">
																		Next Business Day
																	</option>
																	<option value="NONE">
																		None
																	</option>
																</select>
															</div>
															<ToggleBlock
																label="Use holiday business-day check"
																checked={Boolean(
																	payrollCycleDraft.includeHolidaysInBusinessDayCheck,
																)}
																onChange={(checked) =>
																	setPayrollCycleDraft(
																		(current) =>
																			current
																				? {
																						...current,
																						includeHolidaysInBusinessDayCheck:
																							checked,
																					}
																				: current,
																	)
																}
															/>
														</div>

														<div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
															<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
																<div className="max-w-2xl">
																	<h3 className="mt-2 text-xl font-semibold text-gray-900">
																		Quick shift and presets
																	</h3>
																</div>
																<div className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm shadow-sm">
																	<p className="mt-2 font-semibold text-gray-900">
																		{Number(
																			payrollCycleDraft
																				.cycleRules
																				?.SEMI_MONTHLY
																				?.firstStartDay ||
																				1,
																		)}
																		-
																		{Math.max(
																			Number(
																				payrollCycleDraft
																					.cycleRules
																					?.SEMI_MONTHLY
																					?.secondStartDay ||
																					16,
																			) - 1,
																			1,
																		)}{" "}
																		/{" "}
																		{Number(
																			payrollCycleDraft
																				.cycleRules
																				?.SEMI_MONTHLY
																				?.secondStartDay ||
																				16,
																		)}
																		-
																		{String(
																			payrollCycleDraft
																				.cycleRules
																				?.SEMI_MONTHLY
																				?.secondEndDay ||
																				"LAST_DAY",
																		)}
																	</p>
																</div>
															</div>

															<div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
																<div className="rounded-lg border border-orange-100 bg-white p-3">
																	<div className="flex items-center justify-between gap-4">
																		<p className="text-sm font-semibold text-gray-900">
																			Quick Shift
																		</p>
																		<p className="text-sm font-medium text-orange-700">
																			Start on day{" "}
																			{
																				semiMonthlyUnifiedShift
																			}
																		</p>
																	</div>
																	<input
																		type="range"
																		min={1}
																		max={16}
																		value={
																			semiMonthlyUnifiedShift
																		}
																		onChange={(event) =>
																			setSemiMonthlyUnifiedShift(
																				Number(
																					event.target
																						.value,
																				),
																			)
																		}
																		className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-orange-100 accent-orange-600"
																	/>
																	<div className="mt-2 flex justify-between text-xs font-medium text-gray-500">
																		<span>1</span>
																		<span>8</span>
																		<span>16</span>
																	</div>
																</div>

																<div className="rounded-lg border border-orange-100 bg-white p-3">
																	<p className="text-sm font-semibold text-gray-900">
																		Presets
																	</p>
																	<div className="mt-3 flex flex-wrap gap-2">
																		{[
																			{
																				label: "1-15 / 16-End",
																				start: 1,
																			},
																			{
																				label: "2-16 / 17-1",
																				start: 2,
																			},
																			{
																				label: "5-19 / 20-4",
																				start: 5,
																			},
																			{
																				label: "10-24 / 25-9",
																				start: 10,
																			},
																		].map((preset) => (
																			<button
																				key={preset.label}
																				type="button"
																				onClick={() =>
																					applySemiMonthlyPreset(
																						preset.start,
																					)
																				}
																				className="rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100">
																				{preset.label}
																			</button>
																		))}
																	</div>
																</div>
															</div>
														</div>

														<div className="grid gap-4 md:grid-cols-3">
															<div className="space-y-2">
																<FieldLabel>
																	Semi-Monthly 1st Start
																</FieldLabel>
																<Input
																	type="number"
																	min={1}
																	max={28}
																	value={String(
																		payrollCycleDraft.cycleRules
																			?.SEMI_MONTHLY
																			?.firstStartDay || 1,
																	)}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							cycleRules:
																								{
																									...current.cycleRules,
																									SEMI_MONTHLY:
																										{
																											...(current
																												.cycleRules
																												?.SEMI_MONTHLY ||
																												{}),
																											firstStartDay:
																												normalizeNumberInput(
																													event
																														.target
																														.value,
																													1,
																												),
																										},
																								},
																						}
																					: current,
																		)
																	}
																	className="h-12 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Semi-Monthly 2nd Start
																</FieldLabel>
																<Input
																	type="number"
																	min={2}
																	max={31}
																	value={String(
																		payrollCycleDraft.cycleRules
																			?.SEMI_MONTHLY
																			?.secondStartDay || 16,
																	)}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							cycleRules:
																								{
																									...current.cycleRules,
																									SEMI_MONTHLY:
																										{
																											...(current
																												.cycleRules
																												?.SEMI_MONTHLY ||
																												{}),
																											secondStartDay:
																												normalizeNumberInput(
																													event
																														.target
																														.value,
																													16,
																												),
																										},
																								},
																						}
																					: current,
																		)
																	}
																	className="h-12 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Semi-Monthly 2nd End
																</FieldLabel>
																<select
																	value={String(
																		payrollCycleDraft.cycleRules
																			?.SEMI_MONTHLY
																			?.secondEndDay ||
																			"LAST_DAY",
																	)}
																	onChange={(event) =>
																		setPayrollCycleDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							cycleRules:
																								{
																									...current.cycleRules,
																									SEMI_MONTHLY:
																										{
																											...(current
																												.cycleRules
																												?.SEMI_MONTHLY ||
																												{}),
																											secondEndDay:
																												event
																													.target
																													.value ===
																												"LAST_DAY"
																													? "LAST_DAY"
																													: normalizeNumberInput(
																															event
																																.target
																																.value,
																															15,
																														),
																										},
																								},
																						}
																					: current,
																		)
																	}
																	className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm">
																	<option value="LAST_DAY">
																		LAST_DAY
																	</option>
																	{Array.from(
																		{ length: 31 },
																		(_, index) => index + 1,
																	).map((day) => (
																		<option
																			key={day}
																			value={day}>
																			{day}
																		</option>
																	))}
																</select>
															</div>
														</div>
													</div>
												) : null}

												{payrollTab === "tax" ? (
													<div className="space-y-4">
														<div className="grid gap-4 md:grid-cols-2">
															<div className="space-y-2">
																<FieldLabel>
																	Calculator Name
																</FieldLabel>
																<Input
																	value={
																		payrollCalculatorDraft.name
																	}
																	onChange={(event) =>
																		setPayrollCalculatorDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							name: event
																								.target
																								.value,
																						}
																					: current,
																		)
																	}
																	className="h-12 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Calculator Type
																</FieldLabel>
																<select
																	value={
																		payrollCalculatorDraft.type
																	}
																	onChange={(event) =>
																		setPayrollCalculatorDraft(
																			(current) =>
																				current
																					? {
																							...current,
																							type: event
																								.target
																								.value as PayrollCalculatorDraft["type"],
																						}
																					: current,
																		)
																	}
																	className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm">
																	{[
																		"BASIC",
																		"GROSS_TO_NET",
																		"NET_TO_GROSS",
																		"THIRTEENTH_MONTH",
																		"CUSTOM",
																	].map((option) => (
																		<option
																			key={option}
																			value={option}>
																			{formatFrequencyLabel(
																				option,
																			)}
																		</option>
																	))}
																</select>
															</div>
														</div>

														<div className="space-y-3">
															<FieldLabel>Tax Brackets</FieldLabel>
															<div className="overflow-x-auto rounded-2xl border border-gray-200">
																<table className="min-w-full text-sm">
																	<thead className="bg-gray-50 text-gray-600">
																		<tr>
																			<th className="px-4 py-3 text-left font-semibold">
																				Base
																			</th>
																			<th className="px-4 py-3 text-left font-semibold">
																				Cap
																			</th>
																			<th className="px-4 py-3 text-left font-semibold">
																				Fixed Tax
																			</th>
																			<th className="px-4 py-3 text-left font-semibold">
																				Rate
																			</th>
																		</tr>
																	</thead>
																	<tbody className="divide-y divide-gray-100 bg-white">
																		{payrollCalculatorDraft.taxRates.map(
																			(bracket, index) => (
																				<tr
																					key={`tax-${index}`}>
																					<td className="px-3 py-3">
																						<Input
																							type="number"
																							value={String(
																								bracket.annualBase ??
																									0,
																							)}
																							onChange={(
																								event,
																							) =>
																								setPayrollCalculatorDraft(
																									(
																										current,
																									) =>
																										current
																											? {
																													...current,
																													taxRates:
																														current.taxRates.map(
																															(
																																item,
																																itemIndex,
																															) =>
																																itemIndex ===
																																index
																																	? {
																																			...item,
																																			annualBase:
																																				normalizeNumberInput(
																																					event
																																						.target
																																						.value,
																																					0,
																																				),
																																		}
																																	: item,
																														),
																												}
																											: current,
																								)
																							}
																							className="h-10 rounded-lg border-gray-200"
																						/>
																					</td>
																					<td className="px-3 py-3">
																						<Input
																							type="number"
																							value={String(
																								bracket.annualCap ??
																									0,
																							)}
																							onChange={(
																								event,
																							) =>
																								setPayrollCalculatorDraft(
																									(
																										current,
																									) =>
																										current
																											? {
																													...current,
																													taxRates:
																														current.taxRates.map(
																															(
																																item,
																																itemIndex,
																															) =>
																																itemIndex ===
																																index
																																	? {
																																			...item,
																																			annualCap:
																																				normalizeNumberInput(
																																					event
																																						.target
																																						.value,
																																					0,
																																				),
																																		}
																																	: item,
																														),
																												}
																											: current,
																								)
																							}
																							className="h-10 rounded-lg border-gray-200"
																						/>
																					</td>
																					<td className="px-3 py-3">
																						<Input
																							type="number"
																							value={String(
																								bracket.annualFixedTax ??
																									0,
																							)}
																							onChange={(
																								event,
																							) =>
																								setPayrollCalculatorDraft(
																									(
																										current,
																									) =>
																										current
																											? {
																													...current,
																													taxRates:
																														current.taxRates.map(
																															(
																																item,
																																itemIndex,
																															) =>
																																itemIndex ===
																																index
																																	? {
																																			...item,
																																			annualFixedTax:
																																				normalizeNumberInput(
																																					event
																																						.target
																																						.value,
																																					0,
																																				),
																																		}
																																	: item,
																														),
																												}
																											: current,
																								)
																							}
																							className="h-10 rounded-lg border-gray-200"
																						/>
																					</td>
																					<td className="px-3 py-3">
																						<Input
																							type="number"
																							step="0.001"
																							value={String(
																								bracket.rate ??
																									0,
																							)}
																							onChange={(
																								event,
																							) =>
																								setPayrollCalculatorDraft(
																									(
																										current,
																									) =>
																										current
																											? {
																													...current,
																													taxRates:
																														current.taxRates.map(
																															(
																																item,
																																itemIndex,
																															) =>
																																itemIndex ===
																																index
																																	? {
																																			...item,
																																			rate: normalizeNumberInput(
																																				event
																																					.target
																																					.value,
																																				0,
																																			),
																																		}
																																	: item,
																														),
																												}
																											: current,
																								)
																							}
																							className="h-10 rounded-lg border-gray-200"
																						/>
																					</td>
																				</tr>
																			),
																		)}
																	</tbody>
																</table>
															</div>
														</div>
													</div>
												) : null}

												{payrollTab === "contributions" ? (
													<div className="grid gap-5 xl:grid-cols-3">
														{[
															{ key: "sssRates", label: "SSS" },
															{
																key: "philHealthRates",
																label: "PhilHealth",
															},
															{
																key: "pagibigRates",
																label: "Pag-IBIG",
															},
														].map((group) => {
															const values =
																(payrollCalculatorDraft as any)[
																	group.key
																] || {};
															const keys = Object.keys(values);
															return (
																<div
																	key={group.key}
																	className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
																	<p className="text-sm font-semibold text-gray-900">
																		{group.label}
																	</p>
																	<div className="mt-4 space-y-3">
																		{keys.map((fieldKey) => (
																			<div
																				key={`${group.key}-${fieldKey}`}
																				className="space-y-2">
																				<FieldLabel>
																					{fieldKey}
																				</FieldLabel>
																				<Input
																					type="number"
																					step="0.001"
																					value={String(
																						values[
																							fieldKey
																						] ?? 0,
																					)}
																					onChange={(
																						event,
																					) =>
																						setPayrollCalculatorDraft(
																							(
																								current,
																							) =>
																								current
																									? {
																											...current,
																											[group.key]:
																												{
																													...(
																														current as any
																													)[
																														group
																															.key
																													],
																													[fieldKey]:
																														normalizeNumberInput(
																															event
																																.target
																																.value,
																															0,
																														),
																												},
																										}
																									: current,
																						)
																					}
																					className="h-11 rounded-xl border-gray-200"
																				/>
																			</div>
																		))}
																	</div>
																</div>
															);
														})}
													</div>
												) : null}

												{payrollTab === "rates" ? (
													<div className="overflow-x-auto rounded-2xl border border-gray-200">
														<table className="min-w-full text-sm">
															<thead className="bg-gray-50 text-gray-600">
																<tr>
																	<th className="px-4 py-3 text-left font-semibold">
																		Category
																	</th>
																	<th className="px-4 py-3 text-left font-semibold">
																		Work
																	</th>
																	<th className="px-4 py-3 text-left font-semibold">
																		OT
																	</th>
																	<th className="px-4 py-3 text-left font-semibold">
																		ND
																	</th>
																	<th className="px-4 py-3 text-left font-semibold">
																		ND OT
																	</th>
																</tr>
															</thead>
															<tbody className="divide-y divide-gray-100 bg-white">
																{PAYROLL_RATE_ROWS.map((row) => (
																	<tr key={row.key}>
																		<td className="px-4 py-3 font-medium text-gray-900">
																			{row.label}
																		</td>
																		{(
																			[
																				"work",
																				"ot",
																				"nd",
																				"ndot",
																			] as const
																		).map((field) => (
																			<td
																				key={`${row.key}-${field}`}
																				className="px-3 py-3">
																				<Input
																					type="number"
																					step="0.001"
																					value={String(
																						payrollCalculatorDraft
																							.rateMultipliers?.[
																							row.key
																						]?.[
																							field
																						] ?? 0,
																					)}
																					onChange={(
																						event,
																					) =>
																						setPayrollCalculatorDraft(
																							(
																								current,
																							) =>
																								current
																									? {
																											...current,
																											rateMultipliers:
																												{
																													...current.rateMultipliers,
																													[row.key]:
																														{
																															...(current
																																.rateMultipliers?.[
																																row
																																	.key
																															] ||
																																{}),
																															[field]:
																																normalizeNumberInput(
																																	event
																																		.target
																																		.value,
																																	0,
																																),
																														},
																												},
																										}
																									: current,
																						)
																					}
																					className="h-10 rounded-lg border-gray-200"
																				/>
																			</td>
																		))}
																	</tr>
																))}
															</tbody>
														</table>
													</div>
												) : null}
											</div>
										) : (
											<div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
												Loading payroll settings...
											</div>
										)}
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel={
											updatePayrollSettings.isPending
												? "Saving..."
												: "Save and Continue"
										}
										onPrimary={handleSavePayrollSettings}
										primaryDisabled={
											!payrollCycleDraft ||
											!payrollCalculatorDraft ||
											updatePayrollSettings.isPending
										}
										secondaryLabel="Keep Current Setup"
										onSecondary={() => goToStep("workflow-templates")}
									/>
								</div>
							) : null}

							{currentStep === "leave-settings" ? (
								<div className="space-y-4">
									<div className="grid gap-4 md:grid-cols-3">
										<MetricCard
											label="Policy Types"
											value={String(activeLeavePolicies.length)}
											tone="brand"
										/>
										<MetricCard label="Paid" value={String(paidLeaveCount)} />
										<MetricCard
											label="Approval-Based"
											value={String(approvalLeaveCount)}
										/>
									</div>

									<SectionCard title="Leave policy quick review">
										<div className="space-y-5">
											{activeLeavePolicies.map((policy) => (
												<div
													key={policy.id}
													className="rounded-xl border border-gray-200 bg-white p-4">
													<div className="flex flex-col gap-4 border-b border-gray-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
														<div>
															<div className="flex items-center gap-2">
																<BadgeCheck className="h-4 w-4 text-orange-600" />
																<h3 className="text-lg font-semibold text-gray-900">
																	{formatLeaveType(
																		policy.leaveType,
																	)}{" "}
																	Leave
																</h3>
															</div>
														</div>
													</div>

													<div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
														<div className="grid gap-4 md:grid-cols-2">
															<ToggleBlock
																label="Enabled"
																checked={policy.enabled}
																onChange={(checked) =>
																	setLeaveDrafts((current) => ({
																		...current,
																		[policy.leaveType]: {
																			...current[
																				policy.leaveType
																			],
																			enabled: checked,
																		},
																	}))
																}
															/>
															<ToggleBlock
																label="Paid Leave"
																checked={policy.isPaid}
																onChange={(checked) =>
																	setLeaveDrafts((current) => ({
																		...current,
																		[policy.leaveType]: {
																			...current[
																				policy.leaveType
																			],
																			isPaid: checked,
																		},
																	}))
																}
															/>
															<ToggleBlock
																label="Requires Approval"
																checked={policy.requiresApproval}
																onChange={(checked) =>
																	setLeaveDrafts((current) => ({
																		...current,
																		[policy.leaveType]: {
																			...current[
																				policy.leaveType
																			],
																			requiresApproval:
																				checked,
																		},
																	}))
																}
															/>
															<ToggleBlock
																label="Allow Half-day"
																checked={policy.allowHalfDay}
																onChange={(checked) =>
																	setLeaveDrafts((current) => ({
																		...current,
																		[policy.leaveType]: {
																			...current[
																				policy.leaveType
																			],
																			allowHalfDay: checked,
																		},
																	}))
																}
															/>
														</div>

														<div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
															<div className="space-y-2">
																<FieldLabel>
																	Advance Notice Days
																</FieldLabel>
																<Input
																	type="number"
																	min={0}
																	value={String(
																		policy.minAdvanceNoticeDays ||
																			0,
																	)}
																	onChange={(event) =>
																		setLeaveDrafts(
																			(current) => ({
																				...current,
																				[policy.leaveType]:
																					{
																						...current[
																							policy
																								.leaveType
																						],
																						minAdvanceNoticeDays:
																							normalizeNumberInput(
																								event
																									.target
																									.value,
																								0,
																							),
																					},
																			}),
																		)
																	}
																	className="h-11 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Max Days Per Request
																</FieldLabel>
																<Input
																	type="number"
																	min={0}
																	step="0.5"
																	value={String(
																		policy.maxDaysPerRequest ||
																			0,
																	)}
																	onChange={(event) =>
																		setLeaveDrafts(
																			(current) => ({
																				...current,
																				[policy.leaveType]:
																					{
																						...current[
																							policy
																								.leaveType
																						],
																						maxDaysPerRequest:
																							normalizeNumberInput(
																								event
																									.target
																									.value,
																								0,
																							),
																					},
																			}),
																		)
																	}
																	className="h-11 rounded-xl border-gray-200"
																/>
															</div>
															<div className="space-y-2">
																<FieldLabel>
																	Require Attachment
																</FieldLabel>
																<select
																	value={
																		policy.requireAttachment
																			? "YES"
																			: "NO"
																	}
																	onChange={(event) =>
																		setLeaveDrafts(
																			(current) => ({
																				...current,
																				[policy.leaveType]:
																					{
																						...current[
																							policy
																								.leaveType
																						],
																						requireAttachment:
																							event
																								.target
																								.value ===
																							"YES",
																					},
																			}),
																		)
																	}
																	className="h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm">
																	<option value="NO">No</option>
																	<option value="YES">Yes</option>
																</select>
															</div>
														</div>
													</div>
												</div>
											))}
										</div>
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel={
											updateLeaveSettings.isPending
												? "Saving..."
												: "Save and Continue"
										}
										onPrimary={handleSaveLeaveSettings}
										primaryDisabled={updateLeaveSettings.isPending}
									/>
								</div>
							) : null}

							{currentStep === "workflow-templates" ? (
								<div className="space-y-4">
									<SectionCard title="Workflow templates">
										<div className="space-y-3">
											<div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
												<ToggleBlock
													label="Add starter workflow templates"
													checked={seedWorkflowTemplates}
													onChange={setSeedWorkflowTemplates}
												/>
											</div>
											<div className="grid overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-4 md:divide-x md:divide-gray-100">
												<WorkflowSummaryCell
													label="Selected"
													value={
														seedWorkflowTemplates
															? `${workflowConfigItems.length} templates`
															: "Skipped"
													}
												/>
												<WorkflowSummaryCell
													label="Request"
													value={String(
														seedWorkflowTemplates
															? workflowConfigItems.filter(
																	(item) => item.domain === "REQUEST",
																).length
															: 0,
													)}
												/>
												<WorkflowSummaryCell
													label="Recruitment"
													value={String(
														seedWorkflowTemplates
															? workflowConfigItems.filter(
																	(item) =>
																		item.domain === "RECRUITMENT",
																).length
															: 0,
													)}
												/>
												<WorkflowSummaryCell
													label="Payroll"
													value={String(
														seedWorkflowTemplates
															? workflowConfigItems.filter(
																	(item) => item.domain === "PAYROLL",
																).length
															: 0,
													)}
												/>
											</div>
											<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
												<div className="grid grid-cols-[minmax(0,1fr)_112px_80px] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 md:grid-cols-[minmax(0,1fr)_160px_120px]">
													<span>Template</span>
													<span>Domain</span>
													<span>Steps</span>
												</div>
												<div className="divide-y divide-gray-100">
													{seedWorkflowTemplates &&
													workflowConfigItems.length > 0 ? (
														workflowConfigItems.slice(0, 8).map((workflow) => (
															<div
																key={workflow.code}
																className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_112px_80px] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_160px_120px]">
																<div className="min-w-0">
																	<p className="truncate text-sm font-semibold text-gray-900">
																		{workflow.name || workflow.code}
																	</p>
																	<p className="mt-1 truncate text-xs text-gray-500">
																		{workflow.code}
																	</p>
																</div>
																<p className="min-w-0 truncate text-sm font-medium text-gray-700">
																	{formatTitleCase(workflow.domain)}
																</p>
																<p className="whitespace-nowrap text-sm text-gray-600">
																	{Array.isArray(workflow.steps)
																		? `${workflow.steps.length} steps`
																		: "0 steps"}
																</p>
															</div>
														))
													) : (
														<div className="px-4 py-8 text-sm text-gray-500">
															{seedWorkflowTemplates
																? "No workflow templates are available."
																: "Starter workflow templates are not included."}
														</div>
													)}
												</div>
											</div>
										</div>
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel="Continue to Review"
										onPrimary={() => goToStep("review")}
									/>
								</div>
							) : null}

							{currentStep === "review" ? (
								<div className="space-y-4">
									<SectionCard title="Final review">
										<div className="space-y-5">
											{status.provisioning?.lastError ? (
												<p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
													{status.provisioning.lastError}
												</p>
											) : null}
											<div className="grid gap-3 md:grid-cols-2">
												<ToggleBlock
													label="Add Philippine default holidays"
													checked={seedPhilippineHolidays}
													onChange={setSeedPhilippineHolidays}
												/>
												<ToggleBlock
													label="Add mandated 201 document types"
													checked={seedMandated201DocumentTypes}
													onChange={setSeedMandated201DocumentTypes}
												/>
												<ToggleBlock
													label="Add default leave types"
													checked={seedDefaultLeaveTypes}
													onChange={setSeedDefaultLeaveTypes}
												/>
											</div>
											<div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
												<div className="overflow-visible">
													<div className="space-y-4">
														<section className="rounded-lg border border-gray-200 bg-white p-4">
															<h3 className="text-base font-semibold text-gray-900">
																Company and timesheet
															</h3>
															<div className="mt-4">
																<PreviewRow
																	label="Company"
																	value={
																		companyName ||
																		status.organization.name
																	}
																/>
																<PreviewRow
																	label="Description"
																	value={
																		companyDescription ||
																		status.organization
																			.description ||
																		"-"
																	}
																/>
																<PreviewRow
																	label="Logo"
																	value={companyLogo ? "Uploaded" : "-"}
																/>
																<PreviewRow
																	label="Timezone"
																	value={timezone}
																/>
																<PreviewRow
																	label="Auto approve"
																	value={
																		timesheetDraft?.enableAutoApprove
																			? "Enabled"
																			: "Disabled"
																	}
																/>
																<PreviewRow
																	label="Edit before submit"
																	value={
																		timesheetDraft?.enableEditBeforeSubmission
																			? "Enabled"
																			: "Disabled"
																	}
																/>
																<PreviewRow
																	label="OT threshold"
																	value={`${timesheetDraft?.overtimeFlagThresholdMinutes || 0} min`}
																/>
															</div>
														</section>

														<section className="rounded-lg border border-gray-200 bg-white p-4">
															<h3 className="text-base font-semibold text-gray-900">
																Payroll and leave
															</h3>
															<div className="mt-4">
																<PreviewRow
																	label="Frequency"
																	value={formatFrequencyLabel(
																		payrollCycleDraft?.defaultPayFrequency,
																	)}
																/>
																<PreviewRow
																	label="Calculator"
																	value={
																		payrollCalculatorDraft?.name ||
																		"Default Philippine Calculator"
																	}
																/>
																<PreviewRow
																	label="Pay date offset"
																	value={`${Number(payrollCycleDraft?.payDateOffsetDays || 0)} day(s)`}
																/>
																<PreviewRow
																	label="Business day rule"
																	value={formatTitleCase(
																		payrollCycleDraft?.businessDayRule,
																	)}
																/>
																<PreviewRow
																	label="Tax brackets"
																	value={String(
																		payrollCalculatorDraft
																			?.taxRates.length || 0,
																	)}
																/>
																<PreviewRow
																	label="Holiday check"
																	value={
																		payrollCycleDraft?.includeHolidaysInBusinessDayCheck
																			? "Included"
																			: "Skipped"
																	}
																/>
																{seedDefaultLeaveTypes ? (
																	<PreviewRow
																		label="Leave types"
																		value={String(
																			activeLeavePolicies.length ||
																				preview?.leavePolicies.length ||
																				0,
																		)}
																	/>
																) : null}
															</div>
														</section>

														<section className="rounded-lg border border-gray-200 bg-white p-4">
															<h3 className="text-base font-semibold text-gray-900">
																Payroll periods
															</h3>
															<div className="mt-4">
																<PreviewRow
																	label="Frequency"
																	value={formatFrequencyLabel(
																		payrollCycleDraft?.defaultPayFrequency,
																	)}
																/>
																<PreviewRow
																	label="Year"
																	value={String(
																		payrollPreviewYear,
																	)}
																/>
																<PreviewRow
																	label="Period count"
																	value={String(
																		generatedPayrollPeriods.length,
																	)}
																/>
																<PreviewRow
																	label="Summary"
																	value={
																		status.summary.isProvisioned
																			? "Created during setup"
																			: "Will be created when you finish setup"
																	}
																/>
															</div>
														</section>

														{seedDefaultLeaveTypes ? (
															<ReviewListGroup
																title="Leave types"
																countLabel={`${preview?.leavePolicies.length || activeLeavePolicies.length} types`}
																icon={
																	<BadgeCheck className="h-5 w-5" />
																}
																rows={leavePolicyPreviewRows}
																emptyMessage="No default leave types are available yet."
															/>
														) : null}

														<ReviewListGroup
															title="Workflow templates"
															countLabel={
																seedWorkflowTemplates
																	? `${workflowConfigItems.length} templates`
																	: "Skipped"
															}
															icon={<GitBranch className="h-5 w-5" />}
															rows={
																seedWorkflowTemplates
																	? workflowConfigPreviewRows
																	: []
															}
															emptyMessage={
																seedWorkflowTemplates
																	? "No workflow templates are available yet."
																	: "Starter workflow templates are not included."
															}
														/>
														<ReviewListGroup
															title="Holidays"
															countLabel={
																seedPhilippineHolidays
																	? `${holidayItems.length} holidays`
																	: "Skipped"
															}
															icon={
																<BadgeCheck className="h-5 w-5" />
															}
															rows={
																seedPhilippineHolidays
																	? holidayPreviewRows
																	: []
															}
															emptyMessage={
																seedPhilippineHolidays
																	? "No holidays are available yet."
																	: "Default holidays are not included."
															}
														/>
														<ReviewListGroup
															title="Document types"
															countLabel={
																seedMandated201DocumentTypes
																	? `${documentTypeItems.length} types`
																	: "Skipped"
															}
															icon={
																<BadgeCheck className="h-5 w-5" />
															}
															rows={
																seedMandated201DocumentTypes
																	? documentPreviewRows
																	: []
															}
															emptyMessage={
																seedMandated201DocumentTypes
																	? "No document types are available yet."
																	: "Default 201 document types are not included."
															}
														/>
													</div>
												</div>
											</div>
										</div>
									</SectionCard>

									<StepActions
										onBack={goBack}
										primaryLabel={
											initializeProvisioning.isPending
												? "Finishing setup..."
												: status.summary.isProvisioned
													? "Continue to HR Admin"
													: "Finish Setup and Continue"
										}
										onPrimary={handleInitialize}
										primaryDisabled={
											initializeProvisioning.isPending ||
											(status.summary.isProvisioned
												? false
												: !status.summary.previewAvailable)
										}
										secondaryLabel={
											status.summary.isProvisioned
												? "Open Workflow Setup"
												: undefined
										}
										onSecondary={
											status.summary.isProvisioned
												? () => navigate("/admin/configuration/workflows")
												: undefined
										}
									/>
								</div>
							) : null}

							{currentStep === "admin-account" ? (
								<form
									onSubmit={handleBootstrapAdmin}
									className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 lg:p-5">
									<div className="space-y-2">
										<h2 className="text-lg font-semibold text-gray-900">
											Create the first HR admin
										</h2>
										<p className="text-sm leading-6 text-gray-600">
											Workspace setup is complete. The last step is handing the
											workspace off to the first admin account.
										</p>
									</div>

									{!status.summary.isProvisioned ? (
										<div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
											<CircleAlert className="mt-0.5 h-5 w-5" />
											<p>
												Finish workspace setup before creating the
												admin account.
											</p>
										</div>
									) : (
										<div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
											<CheckCircle2 className="mt-0.5 h-5 w-5" />
											<p>
												The workspace is set up and ready for the first
												admin account.
											</p>
										</div>
									)}

									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<FieldLabel>Admin Email</FieldLabel>
											<Input
												value={adminEmail}
												onChange={(event) =>
													setAdminEmail(event.target.value)
												}
												className="h-12 rounded-xl border-gray-200"
											/>
										</div>
										<div className="space-y-2">
											<FieldLabel>Username</FieldLabel>
											<Input
												value={adminUserName}
												onChange={(event) =>
													setAdminUserName(event.target.value)
												}
												className="h-12 rounded-xl border-gray-200"
											/>
										</div>
										<div className="space-y-2 md:col-span-2">
											<FieldLabel>Password</FieldLabel>
											<Input
												type="password"
												value={adminPassword}
												onChange={(event) =>
													setAdminPassword(event.target.value)
												}
												className="h-12 rounded-xl border-gray-200"
											/>
										</div>
									</div>

									<div className="flex flex-wrap justify-between gap-3">
										<Button type="button" variant="outline" onClick={goBack}>
											<ChevronLeft className="mr-2 h-4 w-4" />
											Back
										</Button>
										<div className="flex flex-wrap gap-3">
											{status.summary.isProvisioned ? (
												<Button
													type="button"
													variant="outline"
													onClick={() =>
														navigate("/admin/configuration/workflows")
													}>
													<GitBranch className="mr-2 h-4 w-4" />
													Open Workflow Setup
												</Button>
											) : null}
											<Button
												type="submit"
												disabled={
													!status.summary.isProvisioned ||
													bootstrapAdmin.isPending
												}
												className="bg-orange-600 text-white hover:bg-orange-700">
												{bootstrapAdmin.isPending
													? "Creating..."
													: "Create Admin Account"}
											</Button>
										</div>
									</div>
								</form>
							) : null}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
