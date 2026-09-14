import { useEffect, useMemo, useRef, useState } from "react";
import { Link, data, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	usePayrollBlockers,
	usePayrollRunSummary,
	queryKeys as metricsQueryKeys,
} from "~/lib/hooks/useMetrics";
import {
	usePayrollPeriods,
	useGenerateTimesheetPayroll,
	useRequestPauseTimesheetPayroll,
	useRequestStopTimesheetPayroll,
	useGenerateTimesheetPayrollProgress,
	useActiveTimesheetPayrollProgress,
	useGenerateTimesheetPayrollPreview,
	usePayrollOtReadiness,
	usePayrollOtPersonDetail,
	usePayrollScheduleDeltas,
	payrollPeriodsQueryKeys,
	usePayrollCycleConfig,
} from "~/lib/hooks/usePayrollPeriods";
import type { PayrollOtReadinessPerson } from "~/services/payroll-periods.service";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { useEmployeeBenefits } from "~/lib/hooks/useEmployeeBenefits";
import {
	employeePayrollQueryKeys,
	useEmployeePayrolls,
} from "~/lib/hooks/useEmployeePayroll";
import { useBenefitTypes } from "~/lib/hooks/useBenefitTypes";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { formatDate, formatDateForInput } from "~/lib/utils/text-utils";
import type { EmployeeBenefit } from "~/services/employee-benefit.service";
import type {
	PayrollGenerationProgress,
	TimesheetPayrollPreviewEmployee,
	TimesheetPayrollSourceDetail,
} from "~/services/payroll-periods.service";
import { resolveBenefitDisplay } from "~/lib/utils/bnpi-comcode-catalog";
import {
	canRunPayrollPreview,
	isPreviewPayrollModalStep,
	isPreviewPayrollResultsPage,
	previewPayrollModalTitle,
	resolvePreviewPayrollStep,
	resolvePreviewReadinessPresentation,
	shouldCalculatePreviewRows as shouldCalculatePreviewRowsForAction,
} from "~/lib/utils/payroll-preview-modal";
import { SpecialPayrollModal } from "~/components/organisms/special-payroll-modal";
import { QuickPayrollAdjustmentModal } from "~/components/templates/common/quick-payroll-adjustment-modal";
import {
	specialPayrollService,
	type SpecialPayrollRun,
} from "~/services/special-payroll.service";
import {
	Calendar,
	AlertTriangle,
	Users,
	Clock,
	ChevronLeft,
	ChevronRight,
	Wallet,
	FileText,
	CheckCircle,
	ArrowRight,
	RefreshCw,
	Plus,
	StickyNote,
	Pause,
	X,
	CreditCard,
	Building2,
	AlertCircle,
	ExternalLink,
	Eye,
	Loader2,
	ChevronDown,
	Search,
	Gift,
	MoreVertical,
	HelpCircle,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";

// Philippine Peso Icon Component
const PesoIcon = ({ className }: { className?: string }) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}>
		<path d="M6 19V5h6c2.5 0 4.5 2 4.5 4.5S14.5 14 12 14H6" />
		<line x1="4" y1="8" x2="16" y2="8" />
		<line x1="4" y1="11" x2="16" y2="11" />
	</svg>
);

// "?" hover helper — hides subtitle/description lines behind a HelpCircle
// tooltip so summary rows stay one line (SHE: Shrink + Hide).
function HelpTip({
	tip,
	lines,
}: {
	tip: string;
	lines: Array<string | null | undefined>;
}) {
	const visible = lines.filter(Boolean) as string[];
	if (visible.length === 0) return null;
	return (
		<span className="inline-flex shrink-0 items-center">
			<Tooltip>
				<TooltipTrigger>
					<span className="inline-flex items-center" title={tip}>
						<HelpCircle className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors hover:text-gray-600" />
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-[260px] whitespace-normal text-xs leading-5 text-gray-700">
					{visible.map((line, index) => (
						<p key={index}>{line}</p>
					))}
				</TooltipContent>
			</Tooltip>
		</span>
	);
}

interface EmployeeChange {
	id: string;
	employeeId: string;
	name: string;
	position: string;
	avatar: string;
	changeType: string;
}

interface MissingInfoEmployee {
	id: string;
	employeeId: string;
	name: string;
	position: string;
	department: string;
	avatar: string;
	timesheetId?: string | null;
	status?: string;
	missingFields: {
		field: string;
		description: string;
		severity: "critical" | "warning";
	}[];
}

interface TimesheetBlocker {
	id: string;
	employeeId: string;
	name: string;
	position: string;
	department: string;
	avatar: string;
	blockerType: "not_submitted" | "pending_approval";
	timesheetId?: string | null;
	status?: string;
	manager?: string;
	periodStart: string;
	periodEnd: string;
	daysRemaining?: number;
}

type BlockerTab = "all" | "missing_info" | "approved_excluded" | "timesheet" | "approval";
type PreviewPayrollRow = TimesheetPayrollPreviewEmployee;
type AdjustmentFilter =
	| "all"
	| "attendance"
	| "allowance"
	| "overtime"
	| "deduction"
	| "loan"
	| "other";
type AdjustmentDirectionFilter = "all" | "compensation" | "deduction";
type AdjustmentPayrollStatusFilter = "all" | "with_payroll_row" | "source_only";

export function RunPayrollTemplate() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const [reminder, setReminder] = useState("");
	const [scrollPosition, setScrollPosition] = useState(0);
	const [payrollJobId, setPayrollJobId] = useState<string | null>(null);
	const [showProgressModal, setShowProgressModal] = useState(false);
	const [handledPayrollJobId, setHandledPayrollJobId] = useState<string | null>(null);
	const [selectedPreviewEmployee, setSelectedPreviewEmployee] =
		useState<PreviewPayrollRow | null>(null);
	/** Payroll preview quick adjustment (addition/deduction) for one row. */
	const [previewQuickAdjustEmployee, setPreviewQuickAdjustEmployee] =
		useState<PreviewPayrollRow | null>(null);
	const [expandedAdjustmentId, setExpandedAdjustmentId] = useState<string | null>(null);
	/** Open OT matrix detail (report buckets) for list person — not full timesheet totals. */
	const [selectedOtPerson, setSelectedOtPerson] =
		useState<PayrollOtReadinessPerson | null>(null);
	const [specialPayrollOpen, setSpecialPayrollOpen] = useState(false);
	const [specialPayrollRuns, setSpecialPayrollRuns] = useState<SpecialPayrollRun[]>([]);
	const [specialPayrollHistoryLoading, setSpecialPayrollHistoryLoading] = useState(false);
	const [showBlockerHelp, setShowBlockerHelp] = useState(false);
	const { data: cycleConfig } = usePayrollCycleConfig();
	const activeFrequency = cycleConfig?.defaultPayFrequency || "SEMI_MONTHLY";
	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000, count: true });
	const { data: sectionsData } = useSections({ page: 1, limit: 1000, count: true });

	// Get periodCode from URL (following timesheets.tsx pattern)
	const selectedPeriodCode = searchParams.get("periodCode") || undefined;
	const payrollPeriodViewParam = searchParams.get("periodView");
	const action = searchParams.get("action");
	const payrollJobIdParam = searchParams.get("payrollJobId");
	const activeBlockerTab = (searchParams.get("tab") as BlockerTab) || "all";
	const previewStep = resolvePreviewPayrollStep(searchParams.get("previewStep"));
	const previewDetailEmployeeId = searchParams.get("previewEmployeeId");
	const previewPageParam = Number(searchParams.get("page"));
	const previewLimitParam = Number(searchParams.get("limit"));
	const previewQueryParam = searchParams.get("query")?.trim() || "";
	const isPreviewPayrollAction = action === "preview-payroll";
	/** Full dry-run calc only after operator confirms Run Management (or opens employee detail). */
	const shouldCalculatePreviewRows = shouldCalculatePreviewRowsForAction({
		action,
		previewStep,
	});
	const selectedDepartmentId = searchParams.get("departmentId") || "all";
	const selectedSectionId = searchParams.get("sectionId") || "all";
	const adjustmentQueryParam = searchParams.get("adjustmentQuery")?.trim() || "";
	const adjustmentFilterParam = searchParams.get("adjustment");
	const adjustmentFilter: AdjustmentFilter = [
		"all",
		"attendance",
		"allowance",
		"overtime",
		"deduction",
		"loan",
		"other",
	].includes(adjustmentFilterParam || "")
		? (adjustmentFilterParam as AdjustmentFilter)
		: "all";
	const adjustmentDirectionParam = searchParams.get("adjustmentDirection");
	const adjustmentDirectionFilter: AdjustmentDirectionFilter = [
		"all",
		"compensation",
		"deduction",
	].includes(adjustmentDirectionParam || "")
		? (adjustmentDirectionParam as AdjustmentDirectionFilter)
		: "all";
	const adjustmentPayrollStatusParam = searchParams.get("adjustmentPayrollStatus");
	const adjustmentPayrollStatusFilter: AdjustmentPayrollStatusFilter = [
		"all",
		"with_payroll_row",
		"source_only",
	].includes(adjustmentPayrollStatusParam || "")
		? (adjustmentPayrollStatusParam as AdjustmentPayrollStatusFilter)
		: "all";
	const payrollScope = {
		departmentId: selectedDepartmentId !== "all" ? selectedDepartmentId : null,
		sectionId: selectedSectionId !== "all" ? selectedSectionId : null,
	};
	const previewPage =
		Number.isFinite(previewPageParam) && previewPageParam > 0
			? Math.floor(previewPageParam)
			: 1;
	const previewLimit =
		Number.isFinite(previewLimitParam) && previewLimitParam > 0
			? Math.min(Math.floor(previewLimitParam), 25)
			: 10;
	const departments = useMemo(
		() => ((departmentsData as any)?.departments || []) as any[],
		[departmentsData],
	);
	const sections = useMemo(
		() => ((sectionsData as any)?.sections || []) as any[],
		[sectionsData],
	);
	const scopedSections = useMemo(
		() =>
			sections.filter(
				(section: any) =>
					selectedDepartmentId === "all" ||
					String(section.departmentId || section.department?.id || "") === selectedDepartmentId,
			),
		[sections, selectedDepartmentId],
	);
	// Calculate date range: Only fetch current and future periods (no past cutoffs)
	// endDate >= today (periods that haven't ended yet)
	// endDate <= 6 months from today (limit to 6 months ahead = 12 semi-monthly periods)
	const dateRange = useMemo(() => {
		const today = new Date();
		const todayStr = formatDateForInput(today); // Today's date
		const endDate = new Date(today);
		endDate.setMonth(today.getMonth() + 6); // 6 month	s forward
		const endDateStr = formatDateForInput(endDate);

		return {
			today: todayStr,
			endDate: endDateStr,
		};
	}, []);

	const inferPastFromPeriodCode = (periodCode?: string) => {
		if (!periodCode) return false;
		const match = /^PP-\d{8}-(\d{4})(\d{2})(\d{2})$/.exec(periodCode);
		if (!match) return false;
		const [, year, month, day] = match;
		const periodEnd = `${year}-${month}-${day}`;
		return periodEnd < dateRange.today;
	};

	const showPastPeriods =
		payrollPeriodViewParam === "past" ||
		(payrollPeriodViewParam !== "current" && inferPastFromPeriodCode(selectedPeriodCode));

	// Fetch payroll periods with date range filter
	// Only get periods where endDate >= today (not yet finished)
	// If showPastPeriods is enabled, remove the end date filter to show all periods
	const { data: periodsData, isLoading: periodsLoading } = usePayrollPeriods({
		filter: showPastPeriods
			? `payFrequency:${activeFrequency}`
			: `payFrequency:${activeFrequency},endDate>=${dateRange.today}`,
		sort: "startDate",
		order: "asc",
		limit: 50, // More items when showing past
	});

	const payPeriods = useMemo(
		() =>
			(((periodsData as any)?.payrollPeriods ||
				(periodsData as any)?.data?.payrollPeriods ||
				[]) as any[]),
		[periodsData],
	);

	// "Current payroll period" (for today) derived from the year periods list
	const currentPayrollPeriod = useMemo(() => {
		if (payPeriods.length === 0) return null;

		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset to start of day for comparison

		const found = payPeriods.find((p: any) => {
			const startDate = new Date(p.startDate);
			const endDate = new Date(p.endDate);
			startDate.setHours(0, 0, 0, 0);
			endDate.setHours(23, 59, 59, 999);

			// Today should be between startDate and endDate (inclusive)
			return today >= startDate && today <= endDate;
		});

		// If no current period found, return the first upcoming period or first period
		return found || payPeriods[0];
	}, [payPeriods]);

	const mostRecentPastPayrollPeriod = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const pastPeriods = payPeriods.filter((p: any) => {
			const endDate = new Date(p.endDate);
			endDate.setHours(23, 59, 59, 999);
			return endDate < today;
		});

		return pastPeriods[pastPeriods.length - 1] || null;
	}, [payPeriods]);

	// Find selected period by code from URL (following timesheets.tsx pattern)
	const selectedPeriod = useMemo(() => {
		if (!selectedPeriodCode && payPeriods.length > 0) {
			if (showPastPeriods) {
				return mostRecentPastPayrollPeriod || currentPayrollPeriod || payPeriods[0];
			}
			return currentPayrollPeriod || payPeriods[0];
		}
		if (selectedPeriodCode) {
			// Find period by code
			return payPeriods.find((p: any) => p.code === selectedPeriodCode) || null;
		}
		return null;
	}, [
		selectedPeriodCode,
		payPeriods,
		currentPayrollPeriod,
		showPastPeriods,
		mostRecentPastPayrollPeriod,
	]);

	// Sync URL with default period if not set (following timesheets.tsx pattern)
	useEffect(() => {
		const defaultPeriodCode = showPastPeriods
			? mostRecentPastPayrollPeriod?.code
			: currentPayrollPeriod?.code;
		if (!selectedPeriodCode && payPeriods.length > 0 && defaultPeriodCode) {
			updateSearchParams((next) => {
				next.set("periodCode", defaultPeriodCode);
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		payPeriods.length,
		currentPayrollPeriod?.code,
		mostRecentPastPayrollPeriod?.code,
		showPastPeriods,
	]);

	const payrollPeriodId = selectedPeriod?.id;
	const isSelectedPeriodProcessing = selectedPeriod?.status === "PROCESSING";
	const selectedPeriodCard = selectedPeriod || currentPayrollPeriod;
	const lastPayrollGenerationSnapshot = useMemo(() => {
		const metadata = selectedPeriodCard?.generationMetadata;
		if (!metadata || typeof metadata !== "object") return null;
		const snapshot = (metadata as Record<string, any>).payrollGeneration;
		if (!snapshot || typeof snapshot !== "object") return null;
		return snapshot as {
			jobId?: string;
			status?: string;
			total?: number;
			processed?: number;
			success?: number;
			failed?: number;
			startedAt?: string;
			completedAt?: string | null;
			updatedAt?: string;
			message?: string;
			cancellationRequested?: boolean;
			cancellationRequestedAt?: string;
			pauseRequested?: boolean;
			pauseRequestedAt?: string;
		};
	}, [selectedPeriodCard?.generationMetadata]);

	const { data: payrollRunSummaryData, isLoading: payrollRunSummaryLoading } =
		usePayrollRunSummary(payrollPeriodId, true, payrollScope);

	const { data: specialCompensationTypesData } = useBenefitTypes({
		page: 1,
		limit: 500,
		filter: "isActive:true,payrollDirection:COMPENSATION",
	});
	const { data: specialActiveEmployeesData } = useEmployees(
		{
			page: 1,
			limit: 500,
			filter: "employmentStatus:ACTIVE",
			fields: [
				"id",
				"employeeId",
				"person.personalInfo.firstName",
				"person.personalInfo.middleName",
				"person.personalInfo.lastName",
			],
		},
		{ enabled: specialPayrollOpen },
	);

	const specialCompensationTypes = useMemo(() => {
		const list =
			(specialCompensationTypesData as any)?.benefitTypes ||
			(specialCompensationTypesData as any)?.data ||
			(Array.isArray(specialCompensationTypesData)
				? specialCompensationTypesData
				: []);
		return (list as any[])
			.filter((b) => b?.code && b?.isActive !== false)
			.map((b) => ({
				id: String(b.id),
				code: String(b.code),
				name: String(b.name || b.code),
			}));
	}, [specialCompensationTypesData]);

	const specialActiveEmployees = useMemo(() => {
		const list =
			(specialActiveEmployeesData as any)?.employees ||
			(specialActiveEmployeesData as any)?.data ||
			(Array.isArray(specialActiveEmployeesData) ? specialActiveEmployeesData : []);
		return (list as any[]).map((e) => {
			const info = e?.person?.personalInfo || {};
			const name =
				[info.lastName, info.firstName].filter(Boolean).join(", ") ||
				e.employeeId ||
				e.id;
			return {
				id: String(e.id),
				employeeId: String(e.employeeId || ""),
				name: String(name),
			};
		});
	}, [specialActiveEmployeesData]);

	useEffect(() => {
		if (!payrollPeriodId) {
			setSpecialPayrollRuns([]);
			return;
		}
		let cancelled = false;
		setSpecialPayrollHistoryLoading(true);
		specialPayrollService
			.listRuns({ contextPayrollPeriodId: payrollPeriodId, limit: 20 })
			.then((result) => {
				if (!cancelled) setSpecialPayrollRuns(result.runs || []);
			})
			.catch(() => {
				if (!cancelled) setSpecialPayrollRuns([]);
			})
			.finally(() => {
				if (!cancelled) setSpecialPayrollHistoryLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [payrollPeriodId]);

	// Mass-upload compensations often set startDate only (payrollPeriodId null).
	// Load active enrollments and scope client-side to this period window + explicit period link.
	const { data: payrollAdjustmentsData, isLoading: payrollAdjustmentsLoading } =
		useEmployeeBenefits({
			filter: payrollPeriodId ? `isActive:true` : undefined,
			page: 1,
			limit: 5000,
			sort: "createdAt",
			order: "desc",
			count: true,
			enabled: Boolean(payrollPeriodId),
		});
	const {
		data: payrollOtReadiness,
		isLoading: payrollOtReadinessLoading,
		isFetching: payrollOtReadinessFetching,
		isError: payrollOtReadinessError,
		error: payrollOtReadinessErrorObj,
	} = usePayrollOtReadiness(
		payrollPeriodId,
		{
			page: 1,
			limit: 20,
			onlyWithOt: true,
			// Match Payable Now / Scope filters (sticky dept/section in URL).
			departmentId: payrollScope.departmentId,
			sectionId: payrollScope.sectionId,
		},
		Boolean(payrollPeriodId),
	);
	// WorkSharing / schedule assignment deltas (source of truth: EmployeeScheduleHistory).
	const {
		data: payrollScheduleDeltas,
		isLoading: payrollScheduleDeltasLoading,
		isFetching: payrollScheduleDeltasFetching,
		isError: payrollScheduleDeltasError,
	} = usePayrollScheduleDeltas(
		payrollPeriodId,
		{ page: 1, limit: 30, onlyWorkshare: true },
		Boolean(payrollPeriodId),
	);
	// Lean OT matrix detail (report buckets) — not full timesheet totals.
	const selectedOtTimesheetId = selectedOtPerson?.timesheetId || "";
	const isOtDetailModalOpen = Boolean(
		selectedOtTimesheetId && payrollPeriodId,
	);
	const {
		data: otPersonDetail,
		isLoading: otPersonDetailLoading,
		isFetching: otPersonDetailFetching,
		isError: otPersonDetailError,
		error: otPersonDetailErrorObj,
	} = usePayrollOtPersonDetail(
		payrollPeriodId,
		selectedOtTimesheetId,
		isOtDetailModalOpen,
	);
	const { data: generatedPayrollRowsData, isLoading: generatedPayrollRowsLoading } =
		useEmployeePayrolls({
			filter: payrollPeriodId ? `payrollPeriodId:${payrollPeriodId}` : undefined,
			page: 1,
			limit: 5000,
			count: true,
			enabled: Boolean(payrollPeriodId),
		});
	const shouldLoadBlockers = action === "issues";
	const {
		data: blockersData,
		isLoading: blockersLoading,
		isFetching: blockersFetching,
	} = usePayrollBlockers(payrollPeriodId, shouldLoadBlockers, 200, payrollScope);
	const generatePayrollMutation = useGenerateTimesheetPayroll();
	const requestPausePayrollMutation = useRequestPauseTimesheetPayroll();
	const requestStopPayrollMutation = useRequestStopTimesheetPayroll();
	const {
		data: timesheetPayrollPreview,
		isLoading: isTimesheetPayrollPreviewLoading,
		isFetching: isTimesheetPayrollPreviewFetching,
		isError: isTimesheetPayrollPreviewError,
		error: timesheetPayrollPreviewError,
	} = useGenerateTimesheetPayrollPreview(
		payrollPeriodId,
		{
			page: previewPage,
			limit: previewLimit,
			query: previewQueryParam,
			departmentId: payrollScope.departmentId,
			sectionId: payrollScope.sectionId,
			calculateRows: shouldCalculatePreviewRows,
		},
		// Lightweight list for start/issues counts; full calc only on preview progress/results.
		(isPreviewPayrollAction || action === "start-payroll" || action === "issues") &&
			!!payrollPeriodId &&
			// Defer network until operator starts preview (confirm uses page-side counts).
			(!isPreviewPayrollAction || shouldCalculatePreviewRows),
	);
	const {
		data: previewEmployeeDetail,
		isLoading: isPreviewEmployeeDetailLoading,
		isFetching: isPreviewEmployeeDetailFetching,
	} = useGenerateTimesheetPayrollPreview(
		payrollPeriodId,
		{
			page: 1,
			limit: 1,
			employeeId: previewDetailEmployeeId,
			departmentId: payrollScope.departmentId,
			sectionId: payrollScope.sectionId,
			calculateRows: true,
		},
		isPreviewPayrollAction && !!payrollPeriodId && !!previewDetailEmployeeId,
	);
	const {
		data: payrollProgressQuery,
		isLoading: isProgressLoading,
		isError: isProgressError,
	} = useGenerateTimesheetPayrollProgress(payrollJobId, !!payrollJobId);
	const {
		data: activePayrollProgress,
		isLoading: isActiveProgressLoading,
		isFetching: isActiveProgressFetching,
		isError: isActiveProgressError,
	} = useActiveTimesheetPayrollProgress(
		payrollPeriodId,
		// Always watch active job for PROCESSING periods so leave/return rediscovers
		// the background run even when URL lost payrollJobId.
		Boolean(payrollPeriodId && isSelectedPeriodProcessing),
	);
	const payrollProgress =
		payrollJobId && payrollProgressQuery?.jobId === payrollJobId ? payrollProgressQuery : null;
	// Period-scoped active endpoint already filters by period id — do not drop
	// the job when periodId is missing on the payload (legacy) or only on job.
	const activePayrollProgressForSelectedPeriod =
		isSelectedPeriodProcessing &&
		activePayrollProgress?.status === "processing" &&
		Boolean(activePayrollProgress?.jobId) &&
		(!activePayrollProgress.periodId ||
			!payrollPeriodId ||
			activePayrollProgress.periodId === payrollPeriodId)
			? activePayrollProgress
			: null;
	/** Snapshot from DB generationMetadata — includes in-flight processing for reattach */
	const metadataPayrollProgress: PayrollGenerationProgress | null = (() => {
		const snap = lastPayrollGenerationSnapshot;
		if (!snap?.jobId || !payrollPeriodId) return null;
		const snapStatus = String(snap.status || "");
		const isTerminal =
			snapStatus === "failed" ||
			snapStatus === "paused" ||
			snapStatus === "cancelled" ||
			snapStatus === "completed";
		// While period is PROCESSING, prefer live active/query; metadata is fallback for jobId + last known counts
		if (isSelectedPeriodProcessing && snapStatus === "processing") {
			return {
				jobId: snap.jobId,
				periodId: payrollPeriodId,
				status: "processing" as const,
				total: Number(snap.total || 0),
				processed: Number(snap.processed || 0),
				success: Number(snap.success || 0),
				failed: Number(snap.failed || 0),
				errors: [],
				startedAt: snap.startedAt || "",
				updatedAt: snap.updatedAt,
				completedAt: snap.completedAt || undefined,
				message: snap.message,
				cancellationRequested: snap.cancellationRequested,
				cancellationRequestedAt: snap.cancellationRequestedAt,
				pauseRequested: snap.pauseRequested,
				pauseRequestedAt: snap.pauseRequestedAt,
			};
		}
		if (!isSelectedPeriodProcessing && isTerminal) {
			return {
				jobId: snap.jobId,
				periodId: payrollPeriodId,
				status: snapStatus as PayrollGenerationProgress["status"],
				total: Number(snap.total || 0),
				processed: Number(snap.processed || 0),
				success: Number(snap.success || 0),
				failed: Number(snap.failed || 0),
				errors: [],
				startedAt: snap.startedAt || "",
				updatedAt: snap.updatedAt,
				completedAt: snap.completedAt || snap.updatedAt,
				message: snap.message,
				cancellationRequested: snap.cancellationRequested,
				cancellationRequestedAt: snap.cancellationRequestedAt,
				pauseRequested: snap.pauseRequested,
				pauseRequestedAt: snap.pauseRequestedAt,
			};
		}
		return null;
	})();
	const savedPayrollGenerationProgress = metadataPayrollProgress;
	const rawVisiblePayrollProgress =
		payrollProgress ||
		activePayrollProgressForSelectedPeriod ||
		// Prefer live active over stale metadata counts when both exist
		savedPayrollGenerationProgress;
	/**
	 * Period status wins over stale job snapshot.
	 * COMPLETED/CLOSED must never present as paused/processing/failed with Resume
	 * (API returns 400 "Payroll period is already completed").
	 */
	const visiblePayrollProgress = (() => {
		const base = rawVisiblePayrollProgress;
		const periodStatus = String(selectedPeriodCard?.status || "");
		const periodTerminal =
			periodStatus === "COMPLETED" || periodStatus === "CLOSED";
		if (!periodTerminal || !base) return base;
		if (
			base.status === "completed" ||
			base.status === "cancelled"
		) {
			return base;
		}
		// Coerce paused/processing/failed job UI to completed for terminal periods.
		const done = Math.max(
			Number(base.success || 0),
			Number(base.processed || 0),
			Number(base.total || 0),
		);
		return {
			...base,
			status: "completed" as const,
			processed: Math.max(Number(base.processed || 0), done),
			success: Math.max(Number(base.success || 0), done > 0 ? done : Number(base.success || 0)),
			pauseRequested: false,
			cancellationRequested: false,
			orphaned: false,
			completedAt: base.completedAt || base.updatedAt || base.startedAt,
			message:
				base.message && !/paused|resume/i.test(String(base.message))
					? base.message
					: "Payroll period is completed",
		};
	})();

	const blockers = useMemo(
		() =>
			blockersData?.metrics?.payrollBlockers ??
			({
				missingInfo: [],
				timesheetNotSubmitted: [],
				pendingApproval: [],
				total: 0,
				semiMonthlyEmployeesTotal: 0,
				blockedEmployeesTotal: 0,
				includedEmployeesTotal: 0,
			} as any),
		[blockersData?.metrics?.payrollBlockers],
	);

	const payrollRunSummary = useMemo(
		() =>
			payrollRunSummaryData?.metrics?.payrollRunSummary ??
			({
				payrollScopeEmployeesTotal: 0,
			previewEligibleEmployeesTotal: 0,
			includedEmployeesTotal: 0,
			missingInfoEmployeesTotal: 0,
			approvedMissingInfoEmployeesTotal: 0,
				missingInfoAndNotSubmittedEmployeesTotal: 0,
				approvedExcludedEmployeesTotal: 0,
				notReadyEmployeesTotal: 0,
				timesheetNotSubmittedEmployeesTotal: 0,
				pendingApprovalEmployeesTotal: 0,
				blockedEmployeesTotal: 0,
				total: 0,
			} as const),
		[payrollRunSummaryData?.metrics?.payrollRunSummary],
	);
	const savedPayrollRunTotals = useMemo(() => {
		const metadata = selectedPeriodCard?.generationMetadata;
		if (!metadata || typeof metadata !== "object") return null;
		const totals = (metadata as Record<string, any>).payrollRunTotals;
		return totals && typeof totals === "object" ? (totals as Record<string, any>) : null;
	}, [selectedPeriodCard?.generationMetadata]);

	const missingInfoCount =
		Number((blockers as any)?.missingInfoTotal) ||
		payrollRunSummary.missingInfoEmployeesTotal ||
		0;
	const timesheetNotSubmittedCount = payrollRunSummary.timesheetNotSubmittedEmployeesTotal || 0;
	const pendingApprovalCount = payrollRunSummary.pendingApprovalEmployeesTotal || 0;
	const approvedMissingInfoRaw = payrollRunSummary.approvedMissingInfoEmployeesTotal;
	const missingInfoAndNotSubmittedCount =
		payrollRunSummary.missingInfoAndNotSubmittedEmployeesTotal || 0;

	const employeeCount = useMemo(
		() => ({
			total:
				payrollRunSummary.payrollScopeEmployeesTotal ||
				payrollRunSummary.previewEligibleEmployeesTotal ||
				0,
			excluded:
				payrollRunSummary.notReadyEmployeesTotal ||
				payrollRunSummary.blockedEmployeesTotal ||
				0,
			included: Math.max(
				0,
				Math.min(
					payrollRunSummary.includedEmployeesTotal || 0,
					payrollRunSummary.payrollScopeEmployeesTotal ||
						payrollRunSummary.previewEligibleEmployeesTotal ||
						0,
				),
			),
		}),
		[
			payrollRunSummary.blockedEmployeesTotal,
			payrollRunSummary.includedEmployeesTotal,
			payrollRunSummary.notReadyEmployeesTotal,
			payrollRunSummary.payrollScopeEmployeesTotal,
			payrollRunSummary.previewEligibleEmployeesTotal,
		],
	);

	const loading = periodsLoading || payrollRunSummaryLoading;
	const previewLoading =
		shouldCalculatePreviewRows && isTimesheetPayrollPreviewLoading;
	const previewTableLoading =
		shouldCalculatePreviewRows &&
		(isTimesheetPayrollPreviewLoading || isTimesheetPayrollPreviewFetching);
	const blockersListLoading =
		action === "issues" &&
		((blockersLoading || blockersFetching) && !blockersData ||
			(isTimesheetPayrollPreviewLoading && !timesheetPayrollPreview));

	const initials = (name: string) => {
		const parts = String(name || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (parts.length === 0) return "NA";
		return (parts[0][0] + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
	};

	const formatCurrency = (value: number | null | undefined) =>
		new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
			maximumFractionDigits: 2,
		}).format(Number(value || 0));
	const formatCount = (value: number | null | undefined) =>
		new Intl.NumberFormat("en-US").format(Number(value || 0));

	const formatDateTime = (value: string | Date | null | undefined) => {
		if (!value) return "Not recorded";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "Not recorded";
		return new Intl.DateTimeFormat("en-PH", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		}).format(date);
	};

	const formatElapsedTime = (
		startValue: string | Date | null | undefined,
		endValue?: string | Date | null,
	) => {
		if (!startValue) return "Not recorded";
		const start = new Date(startValue).getTime();
		const end = endValue ? new Date(endValue).getTime() : Date.now();
		if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "Not recorded";
		const totalSeconds = Math.floor((end - start) / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	};

	const formatJobId = (value: string | null | undefined) => {
		if (!value) return "No job id";
		return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
	};

	// Derive period info from dates - use formatDateForInput to avoid timezone-shifted days (same as period cards)
	const period = useMemo(() => {
		if (!selectedPeriodCard?.endDate) return null;

		// Use shared util to avoid timezone-shifted days (same pattern as period cards)
		const endInput = formatDateForInput(selectedPeriodCard.endDate);
		const endLabel = endInput
			? new Date(
					Number(endInput.slice(0, 4)),
					Number(endInput.slice(5, 7)) - 1,
					Number(endInput.slice(8, 10)),
				)
			: null;

		if (!endLabel) return null;

		return {
			month: endLabel.toLocaleString("en-US", { month: "short" }).toUpperCase(),
			day: endLabel.getDate(),
			year: endLabel.getFullYear(),
			dayOfWeek: endLabel.toLocaleString("en-US", { weekday: "short" }),
		};
	}, [selectedPeriodCard?.endDate]);

	const payrollCoverageLabel = useMemo(() => {
		if (!selectedPeriodCard?.startDate || !selectedPeriodCard?.endDate) return "N/A";

		const getDateParts = (value: string | Date) => {
			const input = formatDateForInput(value);
			if (!input) return null;
			const [year, month, day] = input.split("-").map(Number);
			if (!year || !month || !day) return null;
			const date = new Date(year, month - 1, day);
			return {
				year,
				label: date.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				}),
				labelWithoutYear: date.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
				}),
			};
		};

		const start = getDateParts(selectedPeriodCard.startDate);
		const end = getDateParts(selectedPeriodCard.endDate);
		if (!start || !end) return "N/A";
		if (start.year === end.year) {
			return `${start.labelWithoutYear} to ${end.label}`;
		}
		return `${start.label} to ${end.label}`;
	}, [selectedPeriodCard?.startDate, selectedPeriodCard?.endDate]);

	// For backward compatibility - keep selectedStartDate and selectedEndDate
	const selectedStartDate = selectedPeriodCard?.startDate
		? new Date(selectedPeriodCard.startDate)
		: null;
	const selectedEndDate = selectedPeriodCard?.endDate
		? new Date(selectedPeriodCard.endDate)
		: null;

	const isPeriodCompleted = selectedPeriodCard?.status === "COMPLETED";
	const getPayrollManagementUrl = (periodId?: string | null) => {
		if (!periodId) return "/hr/hr-payroll";
		const isCurrentSelected =
			!!currentPayrollPeriod?.id && String(periodId) === String(currentPayrollPeriod.id);
		if (isCurrentSelected) return "/hr/hr-payroll?tab=active";
		return `/hr/hr-payroll?tab=past&periodId=${encodeURIComponent(String(periodId))}`;
	};

	const periodScrollRef = useRef<HTMLDivElement | null>(null);

	const formatMonthYearUpper = (date: Date | string | null | undefined) => {
		if (!date) return "—";
		const safe = formatDateForInput(date);
		if (!safe) return "—";
		const [y, m, d] = safe.split("-").map(Number);
		const dt = new Date(y, (m || 1) - 1, d || 1);
		return `${dt.toLocaleString("en-US", { month: "long" }).toUpperCase()} ${dt.getFullYear()}`;
	};

	const scrollPeriods = (direction: "left" | "right") => {
		const el = periodScrollRef.current;
		if (!el) return;
		const amount = 420; // ~3 cards at 132px + gaps
		el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
	};

	/** Compact period picker search (SHE: Hide full strip behind calendar button). */
	const [periodPickerQuery, setPeriodPickerQuery] = useState("");

	const employeesWithMissingInfo: MissingInfoEmployee[] = useMemo(
		() =>
			(blockers.missingInfo || []).map((e: any) => ({
				...e,
				avatar: initials(e.name),
			})),
		[blockers.missingInfo],
	);
	const approvedExcludedEmployees = useMemo(
		() => employeesWithMissingInfo.filter((employee) => employee.status === "APPROVED"),
		[employeesWithMissingInfo],
	);
	const displayedMissingInfoEmployees =
		activeBlockerTab === "approved_excluded"
			? approvedExcludedEmployees
			: employeesWithMissingInfo;
	const timesheetBlockers: TimesheetBlocker[] = useMemo(
		() =>
			(blockers.timesheetNotSubmitted || []).map((e: any) => ({
				...e,
				avatar: initials(e.name),
			})),
		[blockers.timesheetNotSubmitted],
	);
	const approvalBlockers: TimesheetBlocker[] = useMemo(
		() =>
			(blockers.pendingApproval || []).map((e: any) => ({
				...e,
				avatar: initials(e.name),
			})),
		[blockers.pendingApproval],
	);
	// Prefer unique employees blocked (not raw issue entries)
	const totalBlockers =
		payrollRunSummary.notReadyEmployeesTotal || payrollRunSummary.blockedEmployeesTotal || 0;
	const totalIssues = payrollRunSummary.total || 0;
	const previewSummary = timesheetPayrollPreview?.summary;
	const savedApprovedTimesheetsCount = Number(
		savedPayrollRunTotals?.approvedTimesheetsTotalCount || 0,
	);
	const savedPayrollReadyTimesheetsCount = Number(
		savedPayrollRunTotals?.payrollReadyTimesheetsTotalCount || 0,
	);
	const approvedTimesheetsCount =
		previewSummary?.approvedTimesheetsCount ??
		(savedApprovedTimesheetsCount || payrollRunSummary.previewEligibleEmployeesTotal || 0);
	const payableEmployeesCount =
		previewSummary?.includedEmployeesCount ??
		(savedPayrollReadyTimesheetsCount || employeeCount.included);
	const previewComputableEmployeesCount =
		previewSummary?.previewComputableEmployeesCount ?? payableEmployeesCount;
	const estimatedIncludesNonApproved =
		previewSummary?.estimatedIncludesNonApproved === true ||
		previewComputableEmployeesCount > payableEmployeesCount;
	const canRunPreview = canRunPayrollPreview({
		payrollPeriodId,
		payableEmployeesCount,
		previewComputableEmployeesCount,
	});
	const approvedExcludedCount =
		previewSummary?.approvedExcludedEmployeesCount ??
		payrollRunSummary.approvedExcludedEmployeesTotal ??
		Math.max(0, approvedTimesheetsCount - payableEmployeesCount);
	const approvedMissingInfoCount = approvedMissingInfoRaw ?? approvedExcludedCount;
	const payrollScopeCount =
		previewSummary?.scopeEmployeesCount ??
		Math.max(employeeCount.total, payableEmployeesCount);
	const notReadyCount =
		previewSummary?.excludedEmployeesCount ??
		payrollRunSummary.notReadyEmployeesTotal ??
		Math.max(0, payrollScopeCount - payableEmployeesCount);
	const scopedTimesheetNotSubmittedCount =
		previewSummary?.notSubmittedEmployeesCount ?? timesheetNotSubmittedCount;
	const scopedApprovedMissingInfoCount = previewSummary
		? approvedExcludedCount
		: approvedMissingInfoCount;
	const payableEmployeesValue =
		payrollScopeCount > 0
			? `${formatCount(payableEmployeesCount)} / ${formatCount(payrollScopeCount)}`
			: formatCount(payableEmployeesCount);
	const notReadyValue =
		payrollScopeCount > 0
			? `${formatCount(notReadyCount)} / ${formatCount(payrollScopeCount)}`
			: formatCount(notReadyCount);
	const approvedTimesheetsNote = `${formatCount(approvedTimesheetsCount)} approved timesheets, ${formatCount(payableEmployeesCount)} payroll-ready`;
	const notReadyNote = `${formatCount(scopedTimesheetNotSubmittedCount)} not submitted, ${formatCount(scopedApprovedMissingInfoCount)} approved not payroll-ready`;
	const missingInfoNote =
		missingInfoAndNotSubmittedCount > 0
			? `${formatCount(missingInfoAndNotSubmittedCount)} also not submitted`
			: "Required payroll fields incomplete";
	const selectedDepartmentName = useMemo(() => {
		if (selectedDepartmentId === "all") return null;
		const match = departments.find((d: any) => String(d.id) === selectedDepartmentId);
		return (match?.name || match?.code || "Department") as string;
	}, [departments, selectedDepartmentId]);
	const selectedSectionName = useMemo(() => {
		if (selectedSectionId === "all") return null;
		const match = sections.find((s: any) => String(s.id) === selectedSectionId);
		return (match?.name || match?.code || "Section") as string;
	}, [sections, selectedSectionId]);
	const hasPayrollScopeFilter =
		selectedDepartmentId !== "all" || selectedSectionId !== "all";
	const clearPayrollScopeFilter = () => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			next.delete("departmentId");
			next.delete("sectionId");
			return next;
		});
	};
	const payrollAdjustments = useMemo(() => {
		const rows = (payrollAdjustmentsData?.employeeBenefits || []) as EmployeeBenefit[];
		if (!payrollPeriodId) return [];
		const periodStart = selectedPeriodCard?.startDate
			? new Date(selectedPeriodCard.startDate)
			: null;
		const periodEnd = selectedPeriodCard?.endDate
			? new Date(selectedPeriodCard.endDate)
			: null;
		if (periodStart) periodStart.setHours(0, 0, 0, 0);
		if (periodEnd) periodEnd.setHours(23, 59, 59, 999);
		return rows.filter((benefit) => {
			const linkedPeriodId = String(benefit.payrollPeriodId || "");
			if (linkedPeriodId && linkedPeriodId === String(payrollPeriodId)) return true;
			// Open-horizon / mass-upload rows: active when start falls on/before period end
			// and end is empty or after period start.
			if (!periodStart || !periodEnd) return false;
			const start = benefit.startDate ? new Date(benefit.startDate) : null;
			const end = benefit.endDate ? new Date(benefit.endDate) : null;
			if (!start || Number.isNaN(start.getTime())) return false;
			if (start > periodEnd) return false;
			if (end && !Number.isNaN(end.getTime()) && end < periodStart) return false;
			// Prefer BNPI mass-upload / recurring enrollment signals when period is not linked.
			const notes = String(benefit.notes || "").toLowerCase();
			const isMassUpload = notes.includes("mass upload") || notes.includes("comcode");
			const isRecurring =
				String(benefit.scheduleMode || "").toUpperCase() === "RECURRING" ||
				String(benefit.recurrenceFrequency || "").length > 0;
			return isMassUpload || isRecurring || !linkedPeriodId;
		});
	}, [
		payrollAdjustmentsData?.employeeBenefits,
		payrollPeriodId,
		selectedPeriodCard?.endDate,
		selectedPeriodCard?.startDate,
	]);
	const generatedPayrollRows = useMemo(
		() => ((generatedPayrollRowsData as any)?.employeePayrolls || []) as any[],
		[generatedPayrollRowsData],
	);
	const generatedPayrollByEmployeeId = useMemo(() => {
		const byEmployeeId = new Map<string, any>();
		for (const payroll of generatedPayrollRows) {
			const employeeId = String(payroll.employeeId || payroll.employee?.id || "");
			if (employeeId) byEmployeeId.set(employeeId, payroll);
		}
		return byEmployeeId;
	}, [generatedPayrollRows]);
	const getAdjustmentDirection = (benefit: EmployeeBenefit) =>
		benefit.benefitType?.payrollDirection === "DEDUCTION" ? "DEDUCTION" : "COMPENSATION";
	/** CODE · description from DB name / BNPI ComCode catalog (never "MTX · MTX"). */
	const getAdjustmentDisplay = (benefit: EmployeeBenefit) =>
		resolveBenefitDisplay({
			code: benefit.benefitType?.code,
			typeName: benefit.benefitType?.name,
			typeDescription: (benefit.benefitType as any)?.description,
			enrollmentName: benefit.name,
		});
	const getAdjustmentSource = (benefit: EmployeeBenefit) => {
		const display = getAdjustmentDisplay(benefit);
		const code = display.code;
		const text = [
			benefit.benefitType?.name,
			benefit.name,
			benefit.notes,
			benefit.description,
			display.description,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		// Prefer catalog filter; refine loans / direction fallbacks.
		if (display.fromCatalog && display.filter !== "other") {
			return { label: display.sourceLabel, filter: display.filter, display };
		}
		if (code === "PFA" || text.includes("perfect attendance")) {
			return { label: "Perfect Attendance", filter: "attendance" as const, display };
		}
		if (text.includes("loan")) {
			return { label: display.sourceLabel || "Loan", filter: "loan" as const, display };
		}
		if (getAdjustmentDirection(benefit) === "DEDUCTION") {
			return {
				label: display.sourceLabel || "Deduction",
				filter: "deduction" as const,
				display,
			};
		}
		return {
			label: display.sourceLabel || "Other Adjustment",
			filter: display.filter || ("other" as const),
			display,
		};
	};
	const payrollAdjustmentSummary = useMemo(
		() =>
			payrollAdjustments.reduce(
				(summary, benefit) => {
					const amount = Number(benefit.amount || 0);
					if (getAdjustmentDirection(benefit) === "DEDUCTION") {
						summary.deductionAmount += amount;
						summary.deductionCount += 1;
					} else {
						summary.compensationAmount += amount;
						summary.compensationCount += 1;
					}
					return summary;
				},
				{
					compensationAmount: 0,
					compensationCount: 0,
					deductionAmount: 0,
					deductionCount: 0,
				},
			),
		[payrollAdjustments],
	);
	const payrollAdjustmentsTotal =
		payrollAdjustmentSummary.compensationCount + payrollAdjustmentSummary.deductionCount;
	const payrollAdjustmentTotalAvailable =
		payrollAdjustmentsData?.pagination?.total || payrollAdjustmentsTotal;
	const hasAdjustmentControls =
		Boolean(adjustmentQueryParam) ||
		adjustmentFilter !== "all" ||
		adjustmentDirectionFilter !== "all" ||
		adjustmentPayrollStatusFilter !== "all";
	const getAdjustmentEmployeeName = (benefit: EmployeeBenefit) => {
		const employee = benefit.employee as any;
		const personalInfo = employee?.person?.personalInfo || {};
		const parts = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
			.map((part) => String(part || "").trim())
			.filter(Boolean);
		return parts.join(" ") || employee?.employeeId || "Employee";
	};
	const payrollAdjustmentRows = useMemo(
		() =>
			payrollAdjustments.map((benefit) => {
				const employee = benefit.employee as any;
				const employeeRecordId = String(employee?.id || benefit.employeeId || "");
				const employeeCode = String(employee?.employeeId || "");
				const source = getAdjustmentSource(benefit);
				const display = source.display || getAdjustmentDisplay(benefit);
				const generatedPayroll = generatedPayrollByEmployeeId.get(employeeRecordId);
				return {
					benefit,
					direction: getAdjustmentDirection(benefit),
					source,
					display,
					/** Primary title: CODE · human description */
					displayTitle: display.title,
					displayDescription: display.description,
					displayCode: display.code,
					employeeName: getAdjustmentEmployeeName(benefit),
					employeeId: employeeRecordId,
					employeeCode,
					generatedPayroll,
					hasGeneratedPayrollRow: Boolean(generatedPayroll),
					amount: Number(benefit.amount || 0),
				};
			}),
		[generatedPayrollByEmployeeId, payrollAdjustments],
	);
	const normalizeAdjustmentSearch = (value: string) => value.trim().toLowerCase();
	const filteredPayrollAdjustmentRows = useMemo(
		() =>
			payrollAdjustmentRows.filter((row) => {
				const matchesSource =
					adjustmentFilter === "all" || row.source.filter === adjustmentFilter;
				const matchesDirection =
					adjustmentDirectionFilter === "all" ||
					(adjustmentDirectionFilter === "compensation" &&
						row.direction === "COMPENSATION") ||
					(adjustmentDirectionFilter === "deduction" && row.direction === "DEDUCTION");
				const matchesPayrollStatus =
					adjustmentPayrollStatusFilter === "all" ||
					(adjustmentPayrollStatusFilter === "with_payroll_row" &&
						row.hasGeneratedPayrollRow) ||
					(adjustmentPayrollStatusFilter === "source_only" &&
						!row.hasGeneratedPayrollRow);
				const normalizedQuery = normalizeAdjustmentSearch(adjustmentQueryParam);
				const searchableText = [
					row.employeeName,
					row.employeeCode,
					row.employeeId,
					row.source.label,
					row.displayTitle,
					row.displayDescription,
					row.displayCode,
					row.benefit.benefitType?.name,
					row.benefit.benefitType?.code,
					row.benefit.benefitType?.category,
					row.benefit.benefitType?.payrollDirection,
					row.benefit.benefitType?.provider,
					row.benefit.name,
					row.benefit.description,
					row.benefit.notes,
					row.benefit.status,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				const matchesQuery =
					!normalizedQuery || searchableText.includes(normalizedQuery);
				return (
					matchesSource &&
					matchesDirection &&
					matchesPayrollStatus &&
					matchesQuery
				);
			}),
		[
			adjustmentDirectionFilter,
			adjustmentFilter,
			adjustmentPayrollStatusFilter,
			adjustmentQueryParam,
			payrollAdjustmentRows,
		],
	);
	// Compact viewport page: never dump hundreds of rows into page scroll.
	const adjustmentPageSize = 6;
	const adjustmentPageParam = Number(searchParams.get("adjPage"));
	const adjustmentPage =
		Number.isFinite(adjustmentPageParam) && adjustmentPageParam > 0
			? Math.floor(adjustmentPageParam)
			: 1;
	const adjustmentTotalPages = Math.max(
		1,
		Math.ceil(filteredPayrollAdjustmentRows.length / adjustmentPageSize),
	);
	const safeAdjustmentPage = Math.min(adjustmentPage, adjustmentTotalPages);
	const visiblePayrollAdjustments = filteredPayrollAdjustmentRows.slice(
		(safeAdjustmentPage - 1) * adjustmentPageSize,
		safeAdjustmentPage * adjustmentPageSize,
	);
	const setAdjustmentPage = (page: number) => {
		updateSearchParams((next) => {
			const clamped = Math.max(1, Math.min(adjustmentTotalPages, page));
			if (clamped <= 1) next.delete("adjPage");
			else next.set("adjPage", String(clamped));
		});
		setExpandedAdjustmentId(null);
	};
	const selectedAdjustmentLabel =
		(
			{
				all: "All",
				attendance: "Attendance",
				allowance: "Allowances",
				overtime: "OT",
				deduction: "Deductions",
				loan: "Loans",
				other: "Other",
			} satisfies Record<AdjustmentFilter, string>
		)[adjustmentFilter] || "All";
	const adjustmentFilters: Array<{ value: AdjustmentFilter; label: string }> = [
		{ value: "all", label: "All" },
		{ value: "attendance", label: "Attendance" },
		{ value: "allowance", label: "Allowances" },
		{ value: "overtime", label: "OT" },
		{ value: "deduction", label: "Deductions" },
		{ value: "loan", label: "Loans" },
		{ value: "other", label: "Other" },
	];
	const updateAdjustmentFilter = (filter: AdjustmentFilter) => {
		updateSearchParams((next) => {
			if (filter === "all") {
				next.delete("adjustment");
			} else {
				next.set("adjustment", filter);
			}
		});
	};
	const updateAdjustmentQuery = (query: string) => {
		updateSearchParams((next) => {
			const normalizedQuery = query.trim();
			if (normalizedQuery) {
				next.set("adjustmentQuery", normalizedQuery);
			} else {
				next.delete("adjustmentQuery");
			}
		});
	};
	const updateAdjustmentDirection = (filter: AdjustmentDirectionFilter) => {
		updateSearchParams((next) => {
			if (filter === "all") {
				next.delete("adjustmentDirection");
			} else {
				next.set("adjustmentDirection", filter);
			}
		});
	};
	const updateAdjustmentPayrollStatus = (filter: AdjustmentPayrollStatusFilter) => {
		updateSearchParams((next) => {
			if (filter === "all") {
				next.delete("adjustmentPayrollStatus");
			} else {
				next.set("adjustmentPayrollStatus", filter);
			}
		});
	};
	const clearAdjustmentControls = () => {
		updateSearchParams((next) => {
			next.delete("adjustmentQuery");
			next.delete("adjustment");
			next.delete("adjustmentDirection");
			next.delete("adjustmentPayrollStatus");
		});
		setExpandedAdjustmentId(null);
	};
	const buildPayrollAdjustmentParams = () => {
		const params = new URLSearchParams();
		params.set("returnTo", "run-payroll");
		if (payrollPeriodId) params.set("payrollPeriodId", String(payrollPeriodId));
		if (selectedPeriodCode) params.set("periodCode", selectedPeriodCode);
		if (payrollPeriodViewParam) params.set("periodView", payrollPeriodViewParam);
		if (selectedDepartmentId !== "all") params.set("departmentId", selectedDepartmentId);
		if (selectedSectionId !== "all") params.set("sectionId", selectedSectionId);
		if (selectedPeriodCard?.startDate) {
			params.set("periodStart", formatDateForInput(selectedPeriodCard.startDate));
		}
		if (selectedPeriodCard?.endDate) {
			params.set("periodEnd", formatDateForInput(selectedPeriodCard.endDate));
		}
		if (adjustmentFilter !== "all") params.set("adjustment", adjustmentFilter);
		return params;
	};
	const applyAdjustmentCategoryParams = (
		params: URLSearchParams,
		filter: AdjustmentFilter,
	) => {
		params.delete("action");
		params.delete("id");
		params.set("page", "1");
		params.set("limit", "10");
		if (filter === "all") {
			params.delete("sourceCategory");
			params.delete("code");
			params.delete("direction");
			return params;
		}
		params.set("sourceCategory", filter);
		params.set("adjustment", filter);
		if (filter === "overtime") {
			params.set("code", "AON");
			params.set("direction", "COMPENSATION");
		} else if (filter === "attendance") {
			params.set("code", "PFA");
			params.set("direction", "COMPENSATION");
		} else if (filter === "deduction") {
			params.set("code", "UFD,MHDMF2");
			params.set("direction", "DEDUCTION");
		} else if (filter === "allowance") {
			params.set("code", "DMA,HYS,LLA,LVP,MLA,OBA,OTM,TSA");
			params.set("direction", "COMPENSATION");
		} else {
			params.delete("code");
			params.delete("direction");
		}
		return params;
	};
	const buildAdjustmentCategoryUrl = (filter = adjustmentFilter) => {
		const params = applyAdjustmentCategoryParams(buildPayrollAdjustmentParams(), filter);
		return `/hr/benefits-management?${params.toString()}`;
	};
	const buildEmployeeAdjustmentUrl = (row: (typeof payrollAdjustmentRows)[number]) => {
		const params = buildPayrollAdjustmentParams();
		// Payroll adjustments = employee benefits enrollments (Benefits Management).
		// Open type drawer + edit enrollment modal for this benefit row.
		const typeId =
			row.benefit.benefitTypeId ||
			row.benefit.benefitType?.id ||
			"";
		if (typeId) {
			params.set("typeId", typeId);
			params.set("benefitTypeId", typeId);
		}
		params.set("action", "edit");
		params.set("id", row.benefit.id);
		params.set("employeeId", row.employeeId || "");
		if (row.employeeCode) params.set("employeeCode", row.employeeCode);
		params.set("adjustment", row.source.filter);
		params.set("sourceCategory", row.source.filter);
		if (row.benefit.benefitType?.code) {
			params.set("code", row.benefit.benefitType.code);
		}
		params.set("direction", row.direction);
		// Seeds enrollment search in the benefits drawer.
		params.set(
			"employeeSearch",
			row.employeeCode || row.employeeName || "",
		);
		params.set("search", row.benefit.benefitType?.name || row.benefit.benefitType?.code || "");
		return `/hr/benefits-management?${params.toString()}`;
	};
	const openAdjustmentEmployeeProfile = (employeeId?: string | null) => {
		if (!employeeId) return;
		// Prefer employee profile benefits/compensation surface with return context.
		const params = buildPayrollAdjustmentParams();
		params.set("tab", "benefits");
		params.set("from", "run-payroll");
		navigate(`/employee/${employeeId}?${params.toString()}`);
	};
	const previewIncludedEmployees = useMemo(
		() => timesheetPayrollPreview?.includedEmployees || [],
		[timesheetPayrollPreview?.includedEmployees],
	);
	const previewExcludedEmployees = useMemo(
		() => timesheetPayrollPreview?.excludedEmployees || [],
		[timesheetPayrollPreview?.excludedEmployees],
	);
	const previewAdvisoryCount =
		missingInfoCount + timesheetNotSubmittedCount + pendingApprovalCount;
	const zeroGrossEmployeeCount = previewIncludedEmployees.filter(
		(e) => e.metadata?.zeroSalaryGuardrailApplied === true,
	).length;
	const previewPagination = timesheetPayrollPreview?.pagination;
	const activePreviewEmployee = useMemo(() => {
		const detailEmployee = previewEmployeeDetail?.includedEmployees?.[0];
		if (detailEmployee) return detailEmployee;

		if (previewDetailEmployeeId) {
			return (
				previewIncludedEmployees.find(
					(employee) =>
						String(employee.employeeId) === previewDetailEmployeeId ||
						String(employee.employeeCode || "") === previewDetailEmployeeId ||
						String(employee.timesheetId || "") === previewDetailEmployeeId,
				) ||
				(selectedPreviewEmployee &&
				(String(selectedPreviewEmployee.employeeId) === previewDetailEmployeeId ||
					String(selectedPreviewEmployee.employeeCode || "") ===
						previewDetailEmployeeId ||
					String(selectedPreviewEmployee.timesheetId || "") === previewDetailEmployeeId)
					? selectedPreviewEmployee
					: null)
			);
		}

		return null;
	}, [
		previewDetailEmployeeId,
		previewEmployeeDetail?.includedEmployees,
		previewIncludedEmployees,
		selectedPreviewEmployee,
	]);
	const activePreviewDeductions = activePreviewEmployee?.deductions || {
		sssContribution: 0,
		philHealthContribution: 0,
		pagibigContribution: 0,
		taxAmount: 0,
		absentDeduction: 0,
		lateDeduction: 0,
		earlyOutDeduction: 0,
	};
	const isPreviewEmployeeComputationLoading =
		isPreviewEmployeeDetailLoading || isPreviewEmployeeDetailFetching;
	const hasActivePreviewComputation =
		activePreviewEmployee && typeof activePreviewEmployee.grossPay === "number";
	const activePreviewPayrollSourceDetails = useMemo(
		() =>
			((activePreviewEmployee?.metadata?.payrollSourceDetails || []) as TimesheetPayrollSourceDetail[])
				.filter((detail) => Math.abs(Number(detail.amount || 0)) >= 0.005),
		[activePreviewEmployee?.metadata?.payrollSourceDetails],
	);
	const getPreviewSourceRole = (detail: TimesheetPayrollSourceDetail) => {
		const action = String(detail.reconciliationAction || "").toUpperCase();
		if (detail.direction === "LOAN" || detail.direction === "DEDUCTION") {
			return "deduction";
		}
		if (action === "RECEIVABLE_ONLY") {
			return "postNet";
		}
		return "gross";
	};
	const activePreviewGrossSourceDetails = activePreviewPayrollSourceDetails.filter(
		(detail) => getPreviewSourceRole(detail) === "gross",
	);
	const activePreviewPostNetSourceDetails = activePreviewPayrollSourceDetails.filter(
		(detail) => getPreviewSourceRole(detail) === "postNet",
	);
	const activePreviewDeductionSourceDetails = activePreviewPayrollSourceDetails.filter(
		(detail) => getPreviewSourceRole(detail) === "deduction",
	);
	type PreviewComputationRow = {
		label: string;
		field: string;
		operation: "ADD" | "SUBTRACT";
		amount: number;
		isBenefitSource?: boolean;
		isTaxable?: boolean | null;
		explanation?: string;
	};
	const previewAmount = (value: unknown) => {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	};
	const previewNonZero = (amount: number) => Math.abs(amount) >= 0.005;
	const activePreviewGrossBaseRows = useMemo((): PreviewComputationRow[] => {
		if (!activePreviewEmployee || !hasActivePreviewComputation) return [];
		const rows: PreviewComputationRow[] = [
			{
				label: "Basic Pay",
				field: "basicPay",
				operation: "ADD",
				amount: previewAmount(activePreviewEmployee.basicPay),
				explanation:
					"Period basic after attendance shortfall (absent / late / early-out already applied).",
			},
			{
				label: "Overtime Pay",
				field: "overtimePay",
				operation: "ADD",
				amount: previewAmount(activePreviewEmployee.overtimePay),
			},
			{
				label: "Night Differential Pay",
				field: "nightDiffPay",
				operation: "ADD",
				amount: previewAmount(activePreviewEmployee.nightDiffPay),
			},
			{
				label: "Holiday / rest day pay",
				field: "holidayPay",
				operation: "ADD",
				amount: previewAmount(activePreviewEmployee.holidayPay),
			},
		];
		return rows.filter(
			(row) => previewNonZero(row.amount) || row.field === "basicPay",
		);
	}, [activePreviewEmployee, hasActivePreviewComputation]);
	const activePreviewGrossBenefitRows = useMemo((): PreviewComputationRow[] => {
		return activePreviewGrossSourceDetails.map((detail) => ({
			label: String(detail.name || detail.benefitTypeName || "Benefit").trim() || "Benefit",
			field: `source:${detail.source}:${detail.id}`,
			operation: "ADD" as const,
			amount: previewAmount(detail.amount),
			isBenefitSource: true,
			isTaxable:
				detail.isTaxable === true ? true : detail.isTaxable === false ? false : null,
			explanation: [detail.benefitTypeName, detail.code].filter(Boolean).join(" · ") || undefined,
		}));
	}, [activePreviewGrossSourceDetails]);
	const activePreviewGrossBenefitTaxableRows = activePreviewGrossBenefitRows.filter(
		(row) => row.isTaxable !== false,
	);
	const activePreviewGrossBenefitNonTaxableRows = activePreviewGrossBenefitRows.filter(
		(row) => row.isTaxable === false,
	);
	const activePreviewDeductionRows = useMemo((): PreviewComputationRow[] => {
		if (!activePreviewEmployee || !hasActivePreviewComputation) return [];
		const hasLoanSources = activePreviewDeductionSourceDetails.some(
			(detail) => String(detail.direction || "").toUpperCase() === "LOAN",
		);
		const rows: PreviewComputationRow[] = [
			{
				label: "W/Tax",
				field: "taxAmount",
				operation: "SUBTRACT",
				amount: previewAmount(activePreviewDeductions.taxAmount),
			},
			{
				label: "SSS Contribution",
				field: "sssContribution",
				operation: "SUBTRACT",
				amount: previewAmount(activePreviewDeductions.sssContribution),
			},
			{
				label: "PhilHealth Contribution",
				field: "philHealthContribution",
				operation: "SUBTRACT",
				amount: previewAmount(activePreviewDeductions.philHealthContribution),
			},
			{
				label: "Pag-IBIG Contribution",
				field: "pagibigContribution",
				operation: "SUBTRACT",
				amount: previewAmount(activePreviewDeductions.pagibigContribution),
			},
			...(hasLoanSources
				? []
				: [
						{
							label: "Loan deductions",
							field: "loanDeductions",
							operation: "SUBTRACT" as const,
							amount: previewAmount(activePreviewEmployee.loanDeductions),
						},
					]),
			...activePreviewDeductionSourceDetails.map((detail) => ({
				label:
					String(detail.name || detail.benefitTypeName || "Deduction").trim() ||
					"Deduction",
				field: `source:${detail.source}:${detail.id}`,
				operation: "SUBTRACT" as const,
				amount: previewAmount(detail.amount),
				isBenefitSource: true,
				explanation:
					[detail.benefitTypeName, detail.code || detail.direction]
						.filter(Boolean)
						.join(" · ") || undefined,
			})),
		];
		return rows.filter(
			(row) =>
				previewNonZero(row.amount) ||
				["sssContribution", "philHealthContribution", "pagibigContribution"].includes(
					row.field,
				),
		);
	}, [
		activePreviewEmployee,
		activePreviewDeductions,
		activePreviewDeductionSourceDetails,
		hasActivePreviewComputation,
	]);
	const activePreviewPostNetRows = useMemo((): PreviewComputationRow[] => {
		return activePreviewPostNetSourceDetails.map((detail) => ({
			label: String(detail.name || detail.benefitTypeName || "Receivable").trim() || "Receivable",
			field: `source:${detail.source}:${detail.id}`,
			operation: "ADD" as const,
			amount: previewAmount(detail.amount),
			isBenefitSource: true,
			explanation: [detail.benefitTypeName, detail.code].filter(Boolean).join(" · ") || undefined,
		}));
	}, [activePreviewPostNetSourceDetails]);
	const activePreviewGrossPay = previewAmount(activePreviewEmployee?.grossPay);
	const activePreviewTotalDeductions = previewAmount(activePreviewEmployee?.totalDeductions);
	const activePreviewNetPay = previewAmount(activePreviewEmployee?.netPay);
	const activePreviewTotalReceivable = previewAmount(
		activePreviewEmployee?.totalReceivable ?? activePreviewNetPay,
	);
	const activePreviewReceivableDelta =
		activePreviewTotalReceivable - activePreviewNetPay;
	const shouldShowPreviewReceivable =
		Math.abs(activePreviewReceivableDelta) >= 0.005 ||
		activePreviewPostNetRows.length > 0;
	const activePreviewPeriodName =
		timesheetPayrollPreview?.period?.name ||
		previewEmployeeDetail?.period?.name ||
		"Payroll period";
	const activePreviewPeriodRange =
		(timesheetPayrollPreview?.period?.startDate || previewEmployeeDetail?.period?.startDate) &&
		(timesheetPayrollPreview?.period?.endDate || previewEmployeeDetail?.period?.endDate)
			? `${formatDate(
					timesheetPayrollPreview?.period?.startDate ||
						previewEmployeeDetail?.period?.startDate,
					"short",
				)} - ${formatDate(
					timesheetPayrollPreview?.period?.endDate ||
						previewEmployeeDetail?.period?.endDate,
					"short",
				)}`
			: null;
	const activePreviewMeta = (activePreviewEmployee?.metadata || {}) as Record<string, any>;
	const activePreviewHasRatesMeta =
		activePreviewMeta.estimatedMonthlyRate != null ||
		activePreviewMeta.totalWorkDays != null ||
		activePreviewMeta.overtimeRate != null ||
		activePreviewMeta.nightDiffRate != null ||
		activePreviewEmployee?.basicSalary != null;
	const activePreviewHasAttendanceMeta =
		activePreviewMeta.daysAbsent != null ||
		activePreviewMeta.totalWorkDays != null ||
		activePreviewMeta.totalOvertimeHours != null ||
		activePreviewMeta.totalLateHours != null ||
		activePreviewMeta.totalEarlyOutHours != null ||
		previewAmount(activePreviewDeductions.absentDeduction) > 0 ||
		previewAmount(activePreviewDeductions.lateDeduction) > 0 ||
		previewAmount(activePreviewDeductions.earlyOutDeduction) > 0;
	const isPreviewResultsPage = isPreviewPayrollResultsPage({
		action,
		previewStep,
	});
	const isPreviewDetailOpen =
		isPreviewResultsPage && !!previewDetailEmployeeId;
	/** Confirm + progress only; completed dry-run lives on the page. */
	const isPreviewPayrollModalOpen =
		isPreviewPayrollAction && isPreviewPayrollModalStep(previewStep);

	// Sync default tab when issues modal opens (following timesheets.tsx pattern)
	useEffect(() => {
		if (action === "issues" && !searchParams.get("tab")) {
			updateSearchParams((next) => {
				next.set("tab", "all");
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [action]);

	useEffect(() => {
		if (
			expandedAdjustmentId &&
			!filteredPayrollAdjustmentRows.some((row) => row.benefit.id === expandedAdjustmentId)
		) {
			setExpandedAdjustmentId(null);
		}
	}, [expandedAdjustmentId, filteredPayrollAdjustmentRows]);

	// After Run Management completes (data ready), advance progress → results.
	useEffect(() => {
		if (!isPreviewPayrollAction || previewStep !== "progress") return;
		if (isTimesheetPayrollPreviewLoading || isTimesheetPayrollPreviewFetching) return;
		if (isTimesheetPayrollPreviewError) return;
		if (!timesheetPayrollPreview) return;
		updateSearchParams((next) => {
			next.set("action", "preview-payroll");
			next.set("previewStep", "results");
			if (!next.get("page")) next.set("page", "1");
			if (!next.get("limit")) next.set("limit", String(previewLimit));
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		isPreviewPayrollAction,
		previewStep,
		isTimesheetPayrollPreviewLoading,
		isTimesheetPayrollPreviewFetching,
		isTimesheetPayrollPreviewError,
		timesheetPayrollPreview,
	]);

	useEffect(() => {
		if (!isPreviewPayrollAction || previewStep !== "results") return;
		updateSearchParams((next) => {
			if (!next.get("page")) {
				next.set("page", "1");
			}
			if (!next.get("limit")) {
				next.set("limit", String(previewLimit));
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPreviewPayrollAction, previewStep]);

	// Deep links with previewEmployeeId (e.g. shared results URL) open results + detail.
	useEffect(() => {
		if (!isPreviewPayrollAction || !previewDetailEmployeeId) return;
		if (previewStep === "results") return;
		updateSearchParams((next) => {
			next.set("previewStep", "results");
			if (!next.get("page")) next.set("page", "1");
			if (!next.get("limit")) next.set("limit", String(previewLimit));
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPreviewPayrollAction, previewDetailEmployeeId, previewStep]);

	useEffect(() => {
		if (!isPreviewPayrollAction || previewStep !== "results" || !previewPagination) return;
		if (previewPagination.page === previewPage) return;
		updateSearchParams((next) => {
			next.set("page", String(previewPagination.page));
			next.set("limit", String(previewPagination.limit));
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		isPreviewPayrollAction,
		previewStep,
		previewPagination?.page,
		previewPagination?.limit,
		previewPage,
	]);

	useEffect(() => {
		if (!payrollJobIdParam || payrollJobIdParam === payrollJobId) return;
		setPayrollJobId(payrollJobIdParam);
		setShowProgressModal(true);
		setHandledPayrollJobId(null);
	}, [payrollJobId, payrollJobIdParam]);

	// Leave/return reattach: period PROCESSING + active (or metadata) job → restore jobId + URL
	// so user can reopen progress without the original session.
	useEffect(() => {
		const reattachId =
			activePayrollProgressForSelectedPeriod?.jobId ||
			(isSelectedPeriodProcessing &&
			lastPayrollGenerationSnapshot?.status === "processing" &&
			lastPayrollGenerationSnapshot?.jobId
				? lastPayrollGenerationSnapshot.jobId
				: null);
		if (!reattachId) return;
		if (payrollJobId === reattachId) {
			// Keep URL shareable when state already has the job
			if (payrollJobIdParam !== reattachId) {
				updateSearchParams((next) => {
					next.set("payrollJobId", reattachId);
				});
			}
			return;
		}
		if (payrollJobId && payrollJobId !== reattachId) return;
		setPayrollJobId(reattachId);
		setHandledPayrollJobId(null);
		updateSearchParams((next) => {
			next.set("payrollJobId", reattachId);
		});
		// Auto-open progress when returning to a PROCESSING period with a live job
		// so "switch page and come back" restores the session without hunting.
		if (isSelectedPeriodProcessing) {
			setShowProgressModal(true);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		activePayrollProgressForSelectedPeriod?.jobId,
		isSelectedPeriodProcessing,
		lastPayrollGenerationSnapshot?.jobId,
		lastPayrollGenerationSnapshot?.status,
		payrollJobId,
		payrollJobIdParam,
	]);

	useEffect(() => {
		if (!payrollProgress?.jobId) return;
		if (handledPayrollJobId === payrollProgress.jobId) return;
		if (
			payrollProgress.status !== "completed" &&
			payrollProgress.status !== "failed" &&
			payrollProgress.status !== "cancelled"
		) {
			return;
		}

		queryClient.invalidateQueries({
			queryKey: payrollPeriodsQueryKeys.payrollPeriods.all,
		});
		queryClient.invalidateQueries({
			queryKey: employeePayrollQueryKeys.employeePayroll.all,
		});
		queryClient.invalidateQueries({
			queryKey: metricsQueryKeys.metrics.all,
		});

		setHandledPayrollJobId(payrollProgress.jobId);
	}, [handledPayrollJobId, payrollProgress, queryClient]);

	// Update URL function - matches departments.tsx pattern.
	// preventScrollReset keeps filter/chip clicks (adjustment category, search,
	// pagination, tabs) updating the list in place instead of jumping the page
	// to the top like a full refresh. Real loads still skeleton only their own
	// list container (adj-skel / ot-skel / sch-skel).
	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				mutator(next);
				return next;
			},
			{ preventScrollReset: true },
		);
	};

	const updateURL = (action: string | null, tab?: string) => {
		updateSearchParams((next) => {
			if (action) {
				next.set("action", action);
				if (action === "preview-payroll") {
					next.set("previewStep", "confirm");
					next.set("page", "1");
					next.set("limit", String(previewLimit));
					next.delete("previewEmployeeId");
					next.delete("query");
				} else {
					next.delete("previewStep");
					next.delete("previewEmployeeId");
				}
				if (tab) {
					next.set("tab", tab);
				} else {
					next.delete("tab");
				}
			} else {
				next.delete("action");
				next.delete("tab");
				next.delete("page");
				next.delete("limit");
				next.delete("query");
				next.delete("previewEmployeeId");
				next.delete("previewStep");
			}
		});
	};

	const closeIssuesModal = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("tab");
		});
	};

	const setIssueTab = (tab: BlockerTab) => {
		updateSearchParams((next) => {
			next.set("action", "issues");
			next.set("tab", tab);
		});
	};

	const handlePayrollDepartmentChange = (value: string) => {
		updateSearchParams((next) => {
			if (value === "all") {
				next.delete("departmentId");
			} else {
				next.set("departmentId", value);
			}
			next.delete("sectionId");
			next.set("page", "1");
		});
	};

	const handlePayrollSectionChange = (value: string) => {
		updateSearchParams((next) => {
			if (value === "all") {
				next.delete("sectionId");
			} else {
				next.set("sectionId", value);
			}
			next.set("page", "1");
		});
	};

	const clearPayrollProgressCache = (jobId?: string | null) => {
		if (jobId) {
			queryClient.removeQueries({ queryKey: ["payrollGenerationProgress", jobId] });
		}
		if (payrollPeriodId) {
			queryClient.removeQueries({
				queryKey: ["payrollGenerationProgress", "active", payrollPeriodId],
			});
		}
	};

	const handleTabChange = (tab: BlockerTab) => {
		updateSearchParams((next) => {
			next.set("tab", tab);
		});
	};

	const handlePeriodChange = (periodCode: string) => {
		setSelectedPreviewEmployee(null);
		setShowProgressModal(false);
		clearPayrollProgressCache(payrollJobId);
		setPayrollJobId(null);
		updateSearchParams((next) => {
			if (periodCode) {
				next.set("periodCode", periodCode);
				if (next.get("action") === "preview-payroll") {
					next.set("previewStep", "confirm");
					next.set("page", "1");
					next.delete("previewEmployeeId");
					next.delete("query");
				}
			} else {
				next.delete("periodCode");
			}
			next.delete("payrollJobId");
		});
	};

	const handlePeriodViewToggle = () => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			const nextShowPast = !showPastPeriods;
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			next.set("periodView", nextShowPast ? "past" : "current");

			if (nextShowPast) {
				const selectedVisiblePeriod = payPeriods.find(
					(period: any) => period.code === selectedPeriodCode,
				);
				const selectedEndDate = selectedVisiblePeriod?.endDate
					? new Date(selectedVisiblePeriod.endDate)
					: null;
				if (selectedEndDate) {
					selectedEndDate.setHours(23, 59, 59, 999);
				}

				const isSelectedPeriodPast = selectedEndDate !== null && selectedEndDate < today;

				if (!isSelectedPeriodPast && mostRecentPastPayrollPeriod?.code) {
					next.set("periodCode", mostRecentPastPayrollPeriod.code);
				}
			} else if (currentPayrollPeriod?.code) {
				next.set("periodCode", currentPayrollPeriod.code);
			}

			if (next.get("action") === "preview-payroll") {
				next.set("page", "1");
				next.delete("previewEmployeeId");
			}
		});
	};

	const handlePreviewPageChange = (page: number) => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.set("page", String(page));
			next.set("limit", String(previewLimit));
			next.delete("previewEmployeeId");
		});
	};

	const handlePreviewSearch = (query: string) => {
		const normalizedQuery = query.trim();
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			if (normalizedQuery) {
				next.set("query", normalizedQuery);
			} else {
				next.delete("query");
			}
			next.set("page", "1");
			next.set("limit", String(previewLimit));
			next.delete("previewEmployeeId");
		});
	};

	const getMonthName = (month: string) => {
		const months: Record<string, string> = {
			JAN: "January",
			FEB: "February",
			MAR: "March",
			APR: "April",
			MAY: "May",
			JUN: "June",
			JUL: "July",
			AUG: "August",
			SEP: "September",
			OCT: "October",
			NOV: "November",
			DEC: "December",
		};
		return months[month] || month;
	};

	const handleViewEmployeeProfile = (employeeId: string) => {
		navigate(`/employee/${employeeId}`);
	};

	const getTimesheetsPeriodTab = () => {
		if (!selectedPeriodCard?.endDate) return "active";
		const endDate = new Date(selectedPeriodCard.endDate);
		endDate.setHours(23, 59, 59, 999);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return endDate < today ? "past" : "active";
	};

	const buildTimesheetsUrl = (
		statuses?: string[],
		blocker?: Pick<TimesheetBlocker, "id" | "timesheetId" | "name">,
	) => {
		const params = new URLSearchParams();
		params.set("tab", getTimesheetsPeriodTab());
		if (selectedPeriodCode) {
			params.set("periodCode", selectedPeriodCode);
		}
		if (statuses?.length) {
			params.set("status", statuses.join(","));
			if (statuses.includes("DRAFT")) {
				params.set("prepareDrafts", "1");
			}
		}
		if (blocker?.id) {
			params.set("employeeId", blocker.id);
		} else if (blocker?.name) {
			params.set("search", blocker.name);
		}
		if (blocker?.timesheetId) {
			params.set("action", "view");
			params.set("id", blocker.timesheetId);
		}
		return `/hr/timesheets?${params.toString()}`;
	};

	const openTimesheets = (
		statuses?: string[],
		blocker?: Pick<TimesheetBlocker, "id" | "timesheetId" | "name">,
	) => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("tab");
		});
		navigate(buildTimesheetsUrl(statuses, blocker));
	};

	const handleViewPreviewEmployeeTimesheet = (employee: {
		employeeId?: string | null;
		timesheetId?: string | null;
		name?: string | null;
	}) => {
		if (!employee.timesheetId && !employee.employeeId) return;
		navigate(
			buildTimesheetsUrl(undefined, {
				id: employee.employeeId || "",
				timesheetId: employee.timesheetId || null,
				name: employee.name || undefined,
			}),
		);
	};

	const handleOpenPreviewEmployee = (employee: PreviewPayrollRow) => {
		const previewEmployeeKey =
			employee.employeeId || employee.employeeCode || employee.timesheetId;
		if (!previewEmployeeKey) {
			setSelectedPreviewEmployee(null);
			return;
		}
		setSelectedPreviewEmployee(employee);
		updateSearchParams((next) => {
			next.set("previewEmployeeId", String(previewEmployeeKey));
		});
	};

	const handleClosePreviewEmployee = () => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.delete("previewEmployeeId");
		});
	};

	const previewReadinessBadgeClass = (tone: "ready" | "warn" | "danger" | "muted") => {
		if (tone === "ready") {
			return "border-emerald-200 bg-emerald-50 text-emerald-800";
		}
		if (tone === "warn") {
			return "border-amber-200 bg-amber-50 text-amber-900";
		}
		if (tone === "danger") {
			return "border-rose-200 bg-rose-50 text-rose-800";
		}
		return "border-neutral-200 bg-neutral-50 text-neutral-700";
	};

	const previewColumns: Column<PreviewPayrollRow>[] = [
		{
			key: "name",
			label: "Employee",
			width: "28%",
			sortable: false,
			render: (_value, employee) => {
				const readiness = resolvePreviewReadinessPresentation({
					timesheetStatus: employee.timesheetStatus,
					isPayrollReady: employee.isPayrollReady,
					readinessKey: employee.readinessKey,
					readinessLabel: employee.readinessLabel,
				});
				return (
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200">
							<span className="text-xs font-semibold text-neutral-700">
								{initials(employee.name)}
							</span>
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-gray-900">
								{employee.name}
							</p>
							<div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
								<span className="truncate text-xs text-gray-500">
									{employee.employeeCode || employee.employeeId}
								</span>
								{readiness.key !== "payroll_ready" && (
									<span
										className={`inline-flex max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${previewReadinessBadgeClass(readiness.tone)}`}
										title={
											readiness.key === "not_submitted"
												? "Estimate only — timesheet not submitted. Money uses the same lines as after submit."
												: readiness.key === "pending_approval"
													? "Estimate only — timesheet pending auto-approval. Start Payroll auto-approves it."
													: "Estimate only — not payroll-ready yet."
										}>
										{readiness.label}
									</span>
								)}
							</div>
						</div>
					</div>
				);
			},
		},
		{
			key: "department",
			label: "Assignment",
			width: "18%",
			sortable: false,
			render: (_value, employee) => (
				<div className="min-w-0 space-y-1">
					<div className="truncate text-xs font-medium text-gray-800">
						{employee.department}
					</div>
					<div className="truncate text-xs text-gray-500">{employee.position}</div>
				</div>
			),
		},
		{
			key: "basicPay",
			label: "Basic",
			width: "12%",
			sortable: false,
			headerClassName: "text-right",
			render: (_value, employee) => {
				// Only show computed period basicPay — not standing basicSalary
				// (salary alone made empty Gross/Net look broken).
				const amount =
					typeof employee.basicPay === "number" ? employee.basicPay : null;
				return (
					<span className="block text-right font-mono text-xs tabular-nums text-gray-900">
						{amount == null ? "—" : formatCurrency(amount)}
					</span>
				);
			},
		},
		{
			key: "grossPay",
			label: "Gross",
			width: "12%",
			sortable: false,
			headerClassName: "text-right",
			render: (_value, employee) => (
				<span className="block text-right font-mono text-xs tabular-nums text-gray-900">
					{typeof employee.grossPay === "number"
						? formatCurrency(employee.grossPay)
						: "—"}
				</span>
			),
		},
		{
			key: "totalDeductions",
			label: "Deduct.",
			width: "12%",
			sortable: false,
			headerClassName: "text-right",
			render: (_value, employee) => (
				<span className="block text-right font-mono text-xs tabular-nums text-rose-600">
					{typeof employee.totalDeductions === "number"
						? formatCurrency(employee.totalDeductions)
						: "—"}
				</span>
			),
		},
		{
			key: "netPay",
			label: "Net",
			width: "12%",
			sortable: false,
			headerClassName: "text-right",
			render: (_value, employee) => (
				<span className="block text-right font-mono text-xs font-semibold tabular-nums text-emerald-700">
					{typeof employee.netPay === "number"
						? formatCurrency(employee.netPay)
						: "—"}
				</span>
			),
		},
	];

	const handleStartPayroll = () => {
		if (isSelectedPeriodProcessing) {
			const runningJobId =
				payrollJobId || activePayrollProgressForSelectedPeriod?.jobId || null;
			if (runningJobId) {
				openPayrollProgress(runningJobId);
				return;
			}
			setShowProgressModal(true);
			return;
		}

		updateURL("start-payroll");
	};

	const handlePreviewPayroll = () => {
		// Close live progress/start modal so preview owns the dialog surface.
		setShowProgressModal(false);
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.set("action", "preview-payroll");
			next.set("previewStep", "confirm");
			next.set("page", "1");
			next.set("limit", String(previewLimit));
			next.delete("previewEmployeeId");
			next.delete("query");
			next.delete("tab");
			next.delete("payrollJobId");
		});
	};

	const handleClosePreview = () => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("tab");
			next.delete("page");
			next.delete("limit");
			next.delete("query");
			next.delete("previewEmployeeId");
			next.delete("previewStep");
		});
	};

	const handleConfirmRunPreview = () => {
		setSelectedPreviewEmployee(null);
		// Drop cached dry-run so progress always re-fetches with calculateRows.
		queryClient.removeQueries({ queryKey: ["timesheetPayrollPreview"] });
		updateSearchParams((next) => {
			next.set("action", "preview-payroll");
			next.set("previewStep", "progress");
			next.set("page", "1");
			next.set("limit", String(previewLimit));
			next.delete("previewEmployeeId");
		});
	};

	const handleRefreshPreviewAfterAdjustment = () => {
		// Invalidate preview and payroll rows so the new adjustment reflects.
		queryClient.removeQueries({ queryKey: ["timesheetPayrollPreview"] });
		queryClient.removeQueries({ queryKey: ["employeePayroll"] });
		updateSearchParams((next) => {
			next.set("action", "preview-payroll");
			next.set("previewStep", "results");
			if (!next.get("page")) next.set("page", "1");
			if (!next.get("limit")) next.set("limit", String(previewLimit));
			// Keep previewEmployeeId so employee detail stays visible.
		});
	};

	const handleStartRealPayrollFromPreview = () => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.set("action", "start-payroll");
			next.delete("previewStep");
			next.delete("page");
			next.delete("limit");
			next.delete("query");
			next.delete("previewEmployeeId");
			next.delete("tab");
		});
	};

	const openPayrollProgress = (jobId: string) => {
		setPayrollJobId(jobId);
		setHandledPayrollJobId(null);
		setShowProgressModal(true);
		updateSearchParams((next) => {
			next.set("payrollJobId", jobId);
		});
	};

	const handleOpenPayrollRunStatus = () => {
		const runningJobId = payrollJobId || activePayrollProgressForSelectedPeriod?.jobId || null;
		if (runningJobId) {
			openPayrollProgress(runningJobId);
			return;
		}
		if (lastPayrollGenerationSnapshot?.jobId) {
			openPayrollProgress(lastPayrollGenerationSnapshot.jobId);
			return;
		}
		setShowProgressModal(true);
	};

	const handleConfirmStartPayroll = () => {
		if (!payrollPeriodId) {
			return;
		}

		clearPayrollProgressCache(payrollJobId);
		setPayrollJobId(null);
		// Switch the open start-payroll modal into progress content (no second modal).
		setShowProgressModal(true);
		generatePayrollMutation.mutate({
			id: payrollPeriodId,
			...payrollScope,
		}, {
			onSuccess: (data) => {
				const jobId = data?.jobId;
				if (jobId) {
					setPayrollJobId(jobId);
					setHandledPayrollJobId(null);
					updateSearchParams((next) => {
						next.set("payrollJobId", jobId);
					});
					return;
				}
				// No job id returned — keep progress view so the user can close cleanly.
				setShowProgressModal(true);
			},
		});
	};

	const handleRetryPayrollJob = () => {
		if (!payrollPeriodId) return;
		clearPayrollProgressCache(payrollJobId);
		setPayrollJobId(null);
		generatePayrollMutation.mutate({
			id: payrollPeriodId,
			...payrollScope,
		}, {
			onSuccess: (data) => {
				if (data?.jobId) {
					openPayrollProgress(data.jobId);
				}
			},
		});
	};

	const handleRequestPayrollStop = () => {
		if (!payrollPeriodId) return;
		requestStopPayrollMutation.mutate(payrollPeriodId, {
			onSuccess: (data) => {
				if (data?.jobId) {
					openPayrollProgress(data.jobId);
					return;
				}

				setShowProgressModal(false);
				clearPayrollProgressCache(payrollJobId);
				setPayrollJobId(null);
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("tab");
					next.delete("payrollJobId");
				});
				queryClient.invalidateQueries({
					queryKey: payrollPeriodsQueryKeys.payrollPeriods.all,
				});
				queryClient.invalidateQueries({
					queryKey: metricsQueryKeys.metrics.all,
				});
			},
		});
	};

	const handleRequestPayrollPause = () => {
		if (!payrollPeriodId) return;
		requestPausePayrollMutation.mutate(payrollPeriodId, {
			onSuccess: (data) => {
				if (data?.jobId) {
					openPayrollProgress(data.jobId);
				}
				queryClient.invalidateQueries({
					queryKey: payrollPeriodsQueryKeys.payrollPeriods.all,
				});
			},
		});
	};

	// Helper to get initials from name
	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	// Calculate payroll issues
	const issueTabItems: Array<{
		value: BlockerTab;
		label: string;
		count: number;
	}> = [
		{ value: "all", label: "All", count: notReadyCount },
		{ value: "missing_info", label: "Not payroll-ready", count: missingInfoCount },
		{
			value: "approved_excluded",
			label: "Approved not payroll-ready",
			count: approvedExcludedCount,
		},
		{
			value: "timesheet",
			label: "Not submitted",
			count: timesheetNotSubmittedCount,
		},
		{ value: "approval", label: "Pending approval", count: pendingApprovalCount },
	];

	const showAllNotReadyEmployees = activeBlockerTab === "all";
	const showMissingInfoIssues =
		activeBlockerTab === "missing_info" || activeBlockerTab === "approved_excluded";
	const showTimesheetIssues = activeBlockerTab === "timesheet";
	const showApprovalIssues = activeBlockerTab === "approval";
	const visibleMissingInfoTitle =
		activeBlockerTab === "approved_excluded"
			? "Approved timesheets not payroll-ready"
			: "Employees not payroll-ready";

	const payrollIssues = {
		employeeCount: notReadyCount,
	};

	// Run-progress denominator is job-scoped only. Metrics/metadata row counts
	// (unscoped, all frequencies) must never become the denominator — mixing
	// org-wide approved rows with scoped exclusions once showed "Payable 2206"
	// for an 851-person run. The job total already accounts for exclusions.
	const payrollProgressTotal =
		visiblePayrollProgress?.total ||
		lastPayrollGenerationSnapshot?.total ||
		payableEmployeesCount;
	const payrollProgressDisplayTotal = payrollProgressTotal;
	const payrollProgressDisplayProcessed = Math.min(
		visiblePayrollProgress?.processed || 0,
		payrollProgressDisplayTotal,
	);
	const payrollProgressPercentage =
		payrollProgressDisplayTotal > 0
			? Math.round((payrollProgressDisplayProcessed / payrollProgressDisplayTotal) * 100)
			: 0;
	const payrollProgressElapsed = formatElapsedTime(
		visiblePayrollProgress?.startedAt,
		visiblePayrollProgress?.completedAt ||
			visiblePayrollProgress?.pauseRequestedAt ||
			visiblePayrollProgress?.cancellationRequestedAt ||
			null,
	);
	const isPayrollProgressOrphaned =
		Boolean(visiblePayrollProgress?.orphaned) ||
		(Boolean(visiblePayrollProgress?.status === "failed") &&
			Boolean(isSelectedPeriodProcessing) &&
			/worker|restart|orphaned|not running|Resume processing/i.test(
				String(visiblePayrollProgress?.message || ""),
			));
	// Stuck = period locked PROCESSING but no live worker to poll (404, orphan after API restart, etc.)
	const isPayrollProgressUnavailable =
		isSelectedPeriodProcessing &&
		(isPayrollProgressOrphaned ||
			(!visiblePayrollProgress &&
				!isActiveProgressLoading &&
				!isActiveProgressFetching &&
				(!payrollJobId || isActiveProgressError || isProgressError || !isProgressLoading)));
	const isPayrollActionPending =
		generatePayrollMutation.isPending ||
		requestPausePayrollMutation.isPending ||
		requestStopPayrollMutation.isPending;
	const isPayrollRunProcessing = visiblePayrollProgress?.status === "processing";
	const isPayrollStopRequested =
		isPayrollRunProcessing && Boolean(visiblePayrollProgress?.cancellationRequested);
	const isPayrollPauseRequested =
		isPayrollRunProcessing && Boolean(visiblePayrollProgress?.pauseRequested);
	const canViewPayrollReport = visiblePayrollProgress?.status === "completed";
	// Show progress entry when there is something to reopen. On COMPLETED periods the
	// coerced status is "completed" (not paused), so label is "View payroll progress".
	const hasPayrollStatusResume = Boolean(
		payrollJobId ||
			visiblePayrollProgress ||
			isSelectedPeriodProcessing ||
			lastPayrollGenerationSnapshot,
	);
	const payrollStatusBubbleLabel = isPayrollProgressUnavailable
		? "stuck"
		: visiblePayrollProgress?.success
			? String(visiblePayrollProgress.success)
			: visiblePayrollProgress?.processed
				? String(visiblePayrollProgress.processed)
				: lastPayrollGenerationSnapshot?.success
					? String(lastPayrollGenerationSnapshot.success)
					: lastPayrollGenerationSnapshot?.processed
						? String(lastPayrollGenerationSnapshot.processed)
						: null;
	/** Reopen the run modal — action-oriented, not vague "status". */
	const payrollProgressResumeLabel = isPayrollProgressUnavailable
		? "View stuck payroll run"
		: isPayrollRunProcessing
			? "View running payroll"
			: visiblePayrollProgress?.status === "paused"
				? "View paused payroll"
				: visiblePayrollProgress?.status === "completed"
					? "View payroll progress"
					: visiblePayrollProgress?.status === "failed" ||
						  visiblePayrollProgress?.status === "cancelled"
						? "View payroll progress"
						: isSelectedPeriodProcessing
							? "View running payroll"
							: "View payroll progress";

	const handleCloseProgressModal = () => {
		if (isPayrollActionPending) return;
		setShowProgressModal(false);
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("tab");
			next.delete("payrollJobId");
		});
	};

	/** Single modal hosts confirm + live progress (avoids stacked dialogs). */
	const isStartOrProgressModalOpen =
		action === "start-payroll" || showProgressModal;
	const showPayrollProgressContent = showProgressModal;

	const autoPausePayrollRef = useRef<{
		payrollPeriodId?: string | null;
		shouldPause: boolean;
	}>({ payrollPeriodId: null, shouldPause: false });

	useEffect(() => {
		autoPausePayrollRef.current = {
			payrollPeriodId,
			shouldPause: Boolean(
				payrollPeriodId &&
					isPayrollRunProcessing &&
					!isPayrollPauseRequested &&
					!isPayrollStopRequested,
			),
		};
	}, [isPayrollPauseRequested, isPayrollRunProcessing, isPayrollStopRequested, payrollPeriodId]);

	useEffect(() => {
		return () => {
			const { payrollPeriodId: periodIdToPause, shouldPause } =
				autoPausePayrollRef.current;
			if (!periodIdToPause || !shouldPause) return;
			requestPausePayrollMutation.mutate(periodIdToPause);
		};
		// Pause only when this route unmounts; the ref carries the current job state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const showInitialSkeleton = loading && payPeriods.length === 0;

	// Only show "No Active Payroll Period" if we're done loading and still have no data
	if (!loading && payPeriods.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-center">
					<AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
					<h2 className="text-xl font-semibold text-gray-900 mb-2">
						No Active Payroll Period
					</h2>
					<p className="text-gray-500 mb-4">
						There is no active payroll period for today&apos;s date.
					</p>
					<Button onClick={() => navigate("/admin/configuration/payroll-periods")}>
						Manage Payroll Periods
					</Button>
				</div>
			</div>
		);
	}

	const previewResultsPeriodStart =
		timesheetPayrollPreview?.period?.startDate || selectedPeriodCard?.startDate;
	const previewResultsPeriodEnd =
		timesheetPayrollPreview?.period?.endDate || selectedPeriodCard?.endDate;
	const previewResultsPeriodRange =
		previewResultsPeriodStart && previewResultsPeriodEnd
			? `${formatDate(previewResultsPeriodStart, "short")} - ${formatDate(previewResultsPeriodEnd, "short")}`
			: null;

	return (
		<div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
			{/* Header */}
			<div className="flex min-w-0 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div
						className={`shrink-0 rounded-lg p-2 ${
							isPreviewResultsPage ? "bg-sky-100" : "bg-orange-100"
						}`}>
						{isPreviewResultsPage ? (
							<Eye className="h-6 w-6 text-sky-700" />
						) : (
							<PesoIcon className="w-6 h-6 text-orange-600" />
						)}
					</div>
					<div className="min-w-0">
						{isPreviewResultsPage ? (
							<>
								<h1 className="text-2xl font-bold text-gray-900">
									Payroll Management
								</h1>
								<p className="text-sm text-gray-500">
									{previewResultsPeriodRange || "Selected period"}
									{timesheetPayrollPreview?.period?.name || selectedPeriodCard?.name
										? ` · ${timesheetPayrollPreview?.period?.name || selectedPeriodCard?.name}`
										: ""}
								</p>
							</>
						) : (
						<>
							<h1 className="text-2xl font-bold text-gray-900">Run Payroll</h1>
						</>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{isPreviewResultsPage ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={handleClosePreview}
								className="gap-2">
								Back to Run Payroll
							</Button>
							{!isPeriodCompleted && !isSelectedPeriodProcessing && (
								<Button
									type="button"
									onClick={handleStartRealPayrollFromPreview}
									className="gap-2 bg-neutral-900 text-white hover:bg-neutral-800">
									<CheckCircle className="h-4 w-4" />
									Start real payroll…
								</Button>
							)}
						</>
					) : (
						<Button
							variant="outline"
							className="gap-2"
							onClick={() => navigate("/hr/hr-payroll")}>
							<FileText className="w-4 h-4" />
							Open Payroll Reports
						</Button>
					)}
				</div>
			</div>

			{/* Pay Period Selector — compact calendar button (SHE: Hide strip until HR asks) */}
			{!isPreviewResultsPage && (
			<div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="text-sm font-medium uppercase tracking-wide text-gray-500">
							{formatMonthYearUpper(
								selectedEndDate || selectedStartDate || selectedPeriodCard?.endDate,
							)}
						</span>
						{payrollPeriodId && currentPayrollPeriod?.id === payrollPeriodId && (
							<Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
								Current
							</Badge>
						)}
						{isPeriodCompleted && (
							<Badge className="bg-orange-100 text-orange-700 border-orange-200">
								Completed
							</Badge>
						)}
					</div>

					<div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
						{hasPayrollStatusResume && (
							<Button
								type="button"
								variant="outline"
								title={payrollProgressResumeLabel}
								aria-label={payrollProgressResumeLabel}
								onClick={handleOpenPayrollRunStatus}
								className="relative h-9 gap-2 border-orange-200 bg-orange-50 px-3 text-orange-700 hover:bg-orange-100 hover:text-orange-800">
								<RefreshCw className="h-4 w-4" />
								<span className="text-sm font-medium">{payrollProgressResumeLabel}</span>
								{payrollStatusBubbleLabel && (
									<span className="ml-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
										{payrollStatusBubbleLabel}
									</span>
								)}
							</Button>
						)}
						<DropdownMenu
							onOpenChange={(open) => {
								if (!open) setPeriodPickerQuery("");
							}}>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="outline"
									className="h-9 gap-2"
									data-testid="payroll-period-picker-trigger"
									title="Choose pay period">
									<Calendar className="h-4 w-4 text-gray-500" />
									<span className="text-sm font-medium tabular-nums">
										{selectedPeriodCard
											? `${formatDate(selectedPeriodCard.startDate, "short")} - ${formatDate(selectedPeriodCard.endDate, "short")}`
											: "Choose period"}
									</span>
									<ChevronDown className="h-4 w-4 text-gray-500" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[340px] p-0"
								data-testid="payroll-period-carousel">
								<div
									className="flex items-center gap-2 border-b border-gray-100 p-2"
									onKeyDown={(e) => e.stopPropagation()}>
									<div className="relative min-w-0 flex-1">
										<Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
										<Input
											value={periodPickerQuery}
											onChange={(e) => setPeriodPickerQuery(e.target.value)}
											placeholder="Search periods…"
											className="h-8 pl-8 text-sm"
										/>
									</div>
									<button
										type="button"
										onClick={handlePeriodViewToggle}
										title={showPastPeriods ? "Hide past periods" : "Show past periods"}
										className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors">
										<div
											className={`h-4 w-8 rounded-full transition-colors ${
												showPastPeriods ? "bg-orange-500" : "bg-gray-300"
											}`}>
											<div
												className={`h-3 w-3 bg-white rounded-full transition-transform transform ${
													showPastPeriods ? "translate-x-4" : "translate-x-0.5"
												} mt-0.5`}
											/>
										</div>
										<span className="font-medium">Past</span>
									</button>
								</div>
								<div className="max-h-[320px] overflow-y-auto p-1">
									{payPeriods.length > 0 ? (
										payPeriods
											.filter((p: any) => {
												const q = periodPickerQuery.trim().toLowerCase();
												if (!q) return true;
												const endInput = formatDateForInput(p.endDate) || "";
												let monthDay = "";
												if (endInput) {
													const dt = new Date(
														Number(endInput.slice(0, 4)),
														Number(endInput.slice(5, 7)) - 1,
														Number(endInput.slice(8, 10)),
													);
													monthDay = `${dt.toLocaleString("en-US", { month: "short" })} ${dt.getDate()} ${dt.toLocaleString("en-US", { weekday: "short" })}`;
												}
												const hay = `${p.code || ""} ${p.name || ""} ${monthDay} ${formatDate(p.startDate, "short")} ${formatDate(p.endDate, "short")}`.toLowerCase();
												return hay.includes(q);
											})
											.map((p: any) => {
												const isSelected =
													p.code === selectedPeriodCode ||
													(!selectedPeriodCode && p.id === currentPayrollPeriod?.id);
												const isCurrent = p.id === currentPayrollPeriod?.id;
												const isCompleted = p.status === "COMPLETED";
												const endInput = formatDateForInput(p.endDate);
												const endLabel = endInput
													? new Date(
															Number(endInput.slice(0, 4)),
															Number(endInput.slice(5, 7)) - 1,
															Number(endInput.slice(8, 10)),
														)
													: null;
												const periodMonth = endLabel
													? endLabel
															.toLocaleString("en-US", { month: "short" })
															.toUpperCase()
													: "—";
												const periodDay = endLabel ? endLabel.getDate() : "—";
												const periodDayOfWeek = endLabel
													? endLabel.toLocaleString("en-US", { weekday: "short" })
													: "";
												return (
													<DropdownMenuItem
														key={p.id}
														onSelect={() => {
															setPeriodPickerQuery("");
															handlePeriodChange(p.code);
														}}
														className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
															isSelected ? "bg-orange-50" : ""
														}`}>
														<span
															className={`w-14 shrink-0 rounded-md px-1.5 py-1 text-center text-[11px] font-semibold leading-tight ${
																isSelected
																	? "bg-orange-500 text-white"
																	: isCurrent
																		? "bg-emerald-600 text-white"
																		: isCompleted
																			? "bg-orange-600 text-white"
																			: "bg-gray-100 text-gray-600"
															}`}>
															{periodMonth}
															<span className="block text-sm font-bold leading-tight tabular-nums">
																{periodDay}
															</span>
															<span className="block text-[10px] font-normal">
																{periodDayOfWeek}
															</span>
														</span>
														<span className="min-w-0 flex-1">
															<span className="block truncate text-sm font-medium text-gray-900 tabular-nums">
																{formatDate(p.startDate, "short")} -{" "}
																{formatDate(p.endDate, "short")}
															</span>
															<span className="block truncate text-[11px] text-gray-500">
																{p.code}
																{isCurrent ? " · Current" : ""}
																{isCompleted ? " · Completed" : ""}
															</span>
														</span>
														{isSelected && (
															<CheckCircle className="h-4 w-4 shrink-0 text-orange-600" />
														)}
													</DropdownMenuItem>
												);
											})
									) : showInitialSkeleton ? (
										<div className="space-y-1 p-1">
											{Array.from({ length: 5 }).map((_, index) => (
												<div
													key={`payroll-period-skeleton-${index}`}
													className="flex items-center gap-2 rounded-lg px-2 py-1.5">
													<div className="h-11 w-14 animate-pulse rounded-md bg-gray-100" />
													<div className="flex-1 space-y-1.5">
														<div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
														<div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
													</div>
												</div>
											))}
										</div>
									) : periodPickerQuery.trim() ? (
										<div className="px-3 py-6 text-center text-sm text-gray-500">
											No periods match “{periodPickerQuery.trim()}”.
										</div>
									) : (
										<div className="px-3 py-6 text-center text-sm text-gray-500">
											No payroll periods found.
										</div>
									)}
								</div>
								{payPeriods.length > 0 && <DropdownMenuSeparator />}
								<div className="px-3 py-1.5 text-[11px] text-gray-400">
									{payPeriods.length} period{payPeriods.length === 1 ? "" : "s"}
									{showPastPeriods ? " · including past" : ""}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</div>
			)}

			{/* Main Content */}
			{showInitialSkeleton ? (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<div className="space-y-4 lg:col-span-2">
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="flex items-start gap-4">
								<div className="h-14 w-14 rounded-xl bg-orange-100 animate-pulse" />
								<div className="flex-1 space-y-3">
									<div className="h-6 w-48 rounded bg-gray-100 animate-pulse" />
									<div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
								</div>
							</div>
						</div>
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{Array.from({ length: 4 }).map((_, index) => (
									<div
										key={`run-payroll-main-skeleton-${index}`}
										className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
										<div className="h-4 w-28 rounded bg-gray-100 animate-pulse" />
										<div className="h-7 w-20 rounded bg-gray-100 animate-pulse" />
										<div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
									</div>
								))}
							</div>
						</div>
					</div>
					<div className="space-y-4">
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="space-y-4">
								<div className="h-5 w-36 rounded bg-gray-100 animate-pulse" />
								{Array.from({ length: 5 }).map((_, index) => (
									<div
										key={`run-payroll-side-skeleton-${index}`}
										className="space-y-2">
										<div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
										<div className="h-5 w-32 rounded bg-gray-100 animate-pulse" />
									</div>
								))}
							</div>
						</div>
						<div className="rounded-xl border border-gray-200 bg-white p-5">
							<div className="flex items-center gap-3 text-sm text-gray-500">
								<RefreshCw className="h-4 w-4 animate-spin text-orange-500" />
								Loading payroll data...
							</div>
						</div>
					</div>
				</div>
			) : isPreviewResultsPage ? (
				/* Payroll Management results live on the page after modal progress completes.
				   Page h1 carries Payroll Management + period date range; carousel is hidden. */
				<div
					className="space-y-4"
					data-testid="preview-payroll-results-page">
					<div className="rounded-xl border border-sky-200 bg-white p-5">
						<div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2">
							<Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
							<p className="text-xs text-sky-950 sm:text-sm">
								Dry-run amounts from timesheet lines. No payslips or period status
								changes.
								{estimatedIncludesNonApproved
									? " Rows marked Not submitted / Pending approval are estimates (status does not change money)."
									: ""}
							</p>
						</div>

						<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
							<div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
								<p className="text-[11px] text-neutral-400">Managed rows</p>
								<p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900">
									{formatCount(
										previewPagination?.totalItems ??
											previewIncludedEmployees.length,
									)}
								</p>
							</div>
							<div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
								<p className="text-[11px] text-neutral-400">Payroll-ready</p>
								<p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700">
									{formatCount(payableEmployeesCount)}
								</p>
							</div>
							<div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
								<p className="text-[11px] text-neutral-400">Coverage</p>
								<p className="mt-0.5 truncate text-sm font-medium text-neutral-900">
									{payrollCoverageLabel}
								</p>
							</div>
							<div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
								<p className="text-[11px] text-neutral-400">Scope</p>
								<div className="mt-1 flex min-w-0 flex-wrap gap-1">
									<Select
										value={selectedDepartmentId}
										onValueChange={handlePayrollDepartmentChange}>
										<SelectTrigger className="h-8 w-full min-w-0 rounded-md border-neutral-200 bg-white text-xs shadow-none sm:w-[9rem]">
											<SelectValue placeholder="Department" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All departments</SelectItem>
											{departments.map((department: any) => (
												<SelectItem key={department.id} value={department.id}>
													{department.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										value={selectedSectionId}
										onValueChange={handlePayrollSectionChange}>
										<SelectTrigger className="h-8 w-full min-w-0 rounded-md border-neutral-200 bg-white text-xs shadow-none sm:w-[9rem]">
											<SelectValue placeholder="Section" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All sections</SelectItem>
											{scopedSections.map((section: any) => (
												<SelectItem key={section.id} value={section.id}>
													{section.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>
					</div>

					{!previewTableLoading && zeroGrossEmployeeCount > 0 && (
						<div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
							{zeroGrossEmployeeCount}{" "}
							{zeroGrossEmployeeCount === 1 ? "employee has" : "employees have"}{" "}
							zero gross pay — non-statutory deductions waived in this preview.
						</div>
					)}

					<div
						className="rounded-xl border border-gray-200 bg-white p-4"
						data-testid="preview-payroll-results-table-shell">
						<DataTable<PreviewPayrollRow>
							data={previewIncludedEmployees}
							columns={previewColumns}
							isLoading={previewTableLoading}
							loadingRows={8}
							title="Payroll management employees"
							description="Computed dry-run amounts for this period scope. Not-submitted rows are labeled estimates."
							showFilters={false}
							showExport={false}
							showPagination
							searchPlaceholder="Search employee or code"
							searchValue={previewQueryParam}
							onSearch={handlePreviewSearch}
							currentPage={previewPagination?.page || previewPage}
							totalItems={previewPagination?.totalItems || 0}
							totalPages={previewPagination?.totalPages || 1}
							itemsPerPage={previewPagination?.limit || previewLimit}
							onPageChange={handlePreviewPageChange}
							emptyMessage={
								previewQueryParam
									? "No matching employees found"
									: "No timesheets available for payroll preview"
							}
							emptyDescription={
								previewQueryParam
									? `No employees matched "${previewQueryParam}".`
									: "Employees need a period timesheet with salary and schedule. Draft/not-submitted timesheets are included as estimates."
							}
							rowClassName={() => "hover:bg-sky-50/40"}
							titleActions={
								<div className="flex flex-wrap items-center gap-2">
									<Badge className="whitespace-nowrap border border-sky-200 bg-sky-50 text-sky-800">
										{previewPagination?.totalItems ??
											previewIncludedEmployees.length}{" "}
										preview
									</Badge>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleConfirmRunPreview}
										className="h-8 border-sky-200 text-sky-800 hover:bg-sky-50">
										<RefreshCw className="mr-1.5 h-3.5 w-3.5" />
										Re-run preview
									</Button>
								</div>
							}
							renderActions={(employee) => (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-8 w-8 p-0"
										>
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										<DropdownMenuItem
											onClick={() => setPreviewQuickAdjustEmployee(employee)}
											className="cursor-pointer"
										>
											<Plus className="mr-2 h-3.5 w-3.5" />
											Adjustment
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => handleOpenPreviewEmployee(employee)}
											className="cursor-pointer"
										>
											<Eye className="mr-2 h-3.5 w-3.5" />
											View Details
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						/>
						{previewQuickAdjustEmployee ? (
							<QuickPayrollAdjustmentModal
								open
								onOpenChange={(open) => {
									if (!open) setPreviewQuickAdjustEmployee(null);
								}}
								initialDirection="ADDITION"
								initialEmployeeIds={
									previewQuickAdjustEmployee.employeeId
										? [previewQuickAdjustEmployee.employeeId]
										: []
								}
								initialEmployeeLabel={
									[previewQuickAdjustEmployee.name, previewQuickAdjustEmployee.employeeCode]
										.filter(Boolean)
										.join(" · ") || undefined
								}
								defaultPayrollPeriodId={payrollPeriodId}
								defaultPayrollPeriodLabel={
									selectedPeriodCard?.name ||
									(selectedPeriodCard?.startDate && selectedPeriodCard?.endDate
										? `${formatDate(selectedPeriodCard.startDate, "short")} - ${formatDate(selectedPeriodCard.endDate, "short")}`
										: undefined)
								}
							onAdjusted={(result) => {
								// Show the actual salary with the new adjustment in preview.
								if (result.payrollPeriodId && result.payrollPeriodId === payrollPeriodId) {
									handleRefreshPreviewAfterAdjustment();
								}
							}}
							/>
						) : null}
					</div>
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{/* Left Column - Main Content */}
					<div className="lg:col-span-2 space-y-4">
						{/* Payroll Title Card */}
						<div className="bg-white rounded-xl border border-gray-200 p-5">
							<div className="flex items-start gap-4">
								<div className="p-3 bg-gradient-to-br from-orange-100 to-orange-50 rounded-xl">
									<div className="flex items-center gap-1">
										<PesoIcon className="w-5 h-5 text-orange-600" />
										<Users className="w-4 h-4 text-orange-500" />
									</div>
								</div>
								<div>
									<h2 className="text-xl font-bold text-orange-600">
										{period ? getMonthName(period.month) : ""}{" "}
										{period?.day || ""} Payroll
									</h2>
								</div>
							</div>
						</div>

						{/* Blockers Alert - Hide if completed */}
						{totalBlockers > 0 && !isPeriodCompleted && (
							<div className="rounded-xl border border-rose-200 bg-white p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-start gap-3">
										<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50">
											<AlertTriangle className="h-4 w-4 text-rose-600" />
										</div>
										<div className="min-w-0">
											<h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
												<span>
													{totalBlockers}{" "}
													{totalBlockers === 1 ? "blocker" : "blockers"}{" "}
													preventing payroll completion
												</span>
												<button
													type="button"
													onClick={() => setShowBlockerHelp(true)}
													title="Why payroll is blocked"
													aria-label="Why payroll is blocked"
													className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
													<HelpCircle className="h-3.5 w-3.5" />
												</button>
											</h3>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => updateURL("issues", "all")}
										className="h-8 shrink-0 border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
										View all issues
									</Button>
								</div>

								{/* Blocker summary chips */}
								<div className="mt-3 flex flex-wrap gap-2">
									{missingInfoCount > 0 && (
										<button
											type="button"
											onClick={() => updateURL("issues", "missing_info")}
											className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:bg-white">
											<AlertCircle className="h-3 w-3 shrink-0 text-rose-500" />
											<span className="font-semibold tabular-nums text-gray-900">
												{missingInfoCount}
											</span>
											<span className="text-gray-500">Missing data</span>
										</button>
									)}
									{timesheetNotSubmittedCount > 0 && (
										<button
											type="button"
											onClick={() => updateURL("issues", "timesheet")}
											className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:bg-white">
											<Clock className="h-3 w-3 shrink-0 text-amber-500" />
											<span className="font-semibold tabular-nums text-gray-900">
												{timesheetNotSubmittedCount}
											</span>
											<span className="text-gray-500">Not submitted</span>
										</button>
									)}
									{pendingApprovalCount > 0 && (
										<button
											type="button"
											onClick={() => updateURL("issues", "approval")}
											className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:bg-white">
											<CheckCircle className="h-3 w-3 shrink-0 text-amber-500" />
											<span className="font-semibold tabular-nums text-gray-900">
												{pendingApprovalCount}
											</span>
											<span className="text-gray-500">Pending approval</span>
										</button>
									)}
							</div>
							<Modal
								open={showBlockerHelp}
								onOpenChange={setShowBlockerHelp}
								title="Why payroll is blocked"
								description="Resolve hard blockers before payroll can be processed."
								className="max-w-md">
								<p className="text-sm text-gray-600">
									Complete missing payroll data, submit timesheets, and approve
									pending items. Use the counts above or View all issues to review.
								</p>
							</Modal>
						</div>
					)}

						{/* Payroll Adjustments + Approved OT (compact accordion stack) */}
						<div className="rounded-lg border border-gray-200 bg-white p-2">
							<Accordion
								type="multiple"
								defaultValue={[]}
								className="w-full">
							<AccordionItem value="payroll-adjustments" className="border-none">
								<AccordionTrigger className="rounded-md px-2 py-2.5 hover:no-underline hover:bg-gray-50/80">
									<div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
										<div className="flex min-w-0 items-center gap-2">
											<CreditCard className="h-4 w-4 shrink-0 text-gray-500" />
											<span className="truncate text-sm font-semibold text-gray-900">
												Payroll Adjustments
											</span>
										</div>
										<div className="flex shrink-0 items-center gap-1.5">
											<span className="hidden text-[11px] tabular-nums text-emerald-700 sm:inline">
												+{formatCurrency(payrollAdjustmentSummary.compensationAmount)}
											</span>
											<span className="hidden text-[11px] tabular-nums text-red-700 sm:inline">
												−{formatCurrency(payrollAdjustmentSummary.deductionAmount)}
											</span>
											<Badge className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
												{formatCount(payrollAdjustmentsTotal)}
											</Badge>
										</div>
									</div>
								</AccordionTrigger>
								<AccordionContent className="px-1 pb-2 pt-0">
							{/* Dense toolbar: always one horizontal flex wrap (not stacked selects) */}
							<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
								<div className="relative min-w-[140px] flex-1 basis-[160px]">
									<Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
									<Input
										value={adjustmentQueryParam}
										onChange={(event) => updateAdjustmentQuery(event.target.value)}
										placeholder="Search employee, code…"
										className="h-7 pl-7 text-xs"
									/>
								</div>
								<Select
									value={adjustmentDirectionFilter}
									onValueChange={(value) =>
										updateAdjustmentDirection(value as AdjustmentDirectionFilter)
									}>
									<SelectTrigger className="h-7 w-auto min-w-[118px] shrink-0 px-2 text-xs">
										<SelectValue placeholder="Direction" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All directions</SelectItem>
										<SelectItem value="compensation">Compensation</SelectItem>
										<SelectItem value="deduction">Deductions</SelectItem>
									</SelectContent>
								</Select>
								<Select
									value={adjustmentPayrollStatusFilter}
									onValueChange={(value) =>
										updateAdjustmentPayrollStatus(
											value as AdjustmentPayrollStatusFilter,
										)
									}>
									<SelectTrigger className="h-7 w-auto min-w-[124px] shrink-0 px-2 text-xs">
										<SelectValue placeholder="Payroll state" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All payroll states</SelectItem>
										<SelectItem value="with_payroll_row">Generated row</SelectItem>
										<SelectItem value="source_only">Source only</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5">
								{adjustmentFilters.map((filter) => {
									const isActive = adjustmentFilter === filter.value;
									return (
										<button
											key={filter.value}
											type="button"
											onClick={() => updateAdjustmentFilter(filter.value)}
											className={`h-6 shrink-0 rounded border px-2 text-[11px] font-medium transition-colors ${
												isActive
													? "border-orange-300 bg-orange-50 text-orange-700"
													: "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
											}`}>
											{filter.label}
										</button>
									);
								})}
								{hasAdjustmentControls && (
									<button
										type="button"
										onClick={clearAdjustmentControls}
										className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50">
										<X className="h-3 w-3" />
										Clear
									</button>
								)}
							</div>

						{/* Dense single-line rows; page size keeps panel short */}
							<div className="mt-1.5 max-h-[min(220px,32vh)] overflow-y-auto overscroll-contain rounded border border-gray-200 divide-y divide-gray-100 modern-scroll">
								{payrollAdjustmentsLoading || generatedPayrollRowsLoading ? (
									<>
										{Array.from({ length: 6 }).map((_, i) => (
											<div
												key={`adj-skel-${i}`}
												className="flex h-9 items-center gap-1.5 px-2">
												<Skeleton className="h-6 w-6 shrink-0 rounded-full" />
												<div className="min-w-0 flex-1 space-y-1">
													<Skeleton className="h-3 w-2/3" />
													<Skeleton className="h-2.5 w-1/2" />
												</div>
												<Skeleton className="h-3 w-12 shrink-0" />
											</div>
										))}
									</>
								) : visiblePayrollAdjustments.length > 0 ? (
									visiblePayrollAdjustments.map((row) => {
										const {
											benefit,
											direction,
											employeeCode,
											employeeId,
											employeeName,
											generatedPayroll,
											hasGeneratedPayrollRow,
											source,
											displayTitle,
											displayDescription,
											displayCode,
										} = row;
										const isExpanded = expandedAdjustmentId === benefit.id;
										const code = displayCode || benefit.benefitType?.code || "";
										return (
											<div key={benefit.id} className="bg-white">
												<div className="flex h-9 items-center gap-1.5 px-2 hover:bg-orange-50/40">
													<button
														type="button"
														onClick={() =>
															setExpandedAdjustmentId(isExpanded ? null : benefit.id)
														}
														aria-expanded={isExpanded}
														className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
														<ChevronDown
															className={`h-3.5 w-3.5 transition-transform ${
																isExpanded ? "rotate-180" : ""
															}`}
														/>
														<span className="sr-only">
															{isExpanded ? "Collapse" : "Expand"}
														</span>
													</button>
													<button
														type="button"
														onClick={() => openAdjustmentEmployeeProfile(employeeId)}
														disabled={!employeeId}
														className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-default">
														<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-semibold leading-none text-white">
															{(employeeName || "?")
																.split(/\s+/)
																.filter(Boolean)
																.slice(0, 2)
																.map((part: string) => part[0]?.toUpperCase() || "")
																.join("") || "?"}
														</span>
														<span className="min-w-0 flex-1">
															<span className="block truncate text-xs font-medium leading-tight text-gray-900">
																{code ? (
																	<>
																		<span className="font-semibold text-gray-800">
																			{code}
																		</span>
																		<span className="font-normal text-gray-500">
																			{" "}
																			· {displayDescription}
																		</span>
																	</>
																) : (
																	displayTitle
																)}
															</span>
															<span className="block truncate text-[10px] leading-tight text-gray-500">
																{employeeName}
																{employeeCode ? ` · ${employeeCode}` : ""}
																{" · "}
																{hasGeneratedPayrollRow ? "Generated" : "Source only"}
															</span>
														</span>
													</button>
													<span
														className={`shrink-0 tabular-nums text-xs font-semibold ${
															direction === "DEDUCTION"
																? "text-red-700"
																: "text-emerald-700"
														}`}>
														{direction === "DEDUCTION" ? "−" : "+"}
														{formatCurrency(benefit.amount)}
													</span>
													<button
														type="button"
														onClick={() => navigate(buildEmployeeAdjustmentUrl(row))}
														className="shrink-0 rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-600"
														title="Open source adjustment">
														<ExternalLink className="h-3.5 w-3.5" />
													</button>
												</div>
												{isExpanded && (
													<div className="border-t border-gray-100 bg-gray-50/70 px-2 py-1.5 text-[10px] text-gray-600">
														<span className="font-medium text-gray-800">
															{code || "—"} · {displayDescription}
														</span>
														{" · "}
														{employeeName}
														{employeeCode ? ` / ${employeeCode}` : ""}
														{" · "}
														{direction}
														{" · "}
														{benefit.payrollPeriod?.code ||
															selectedPeriodCard?.code ||
															"period"}
														{" · "}
														{hasGeneratedPayrollRow
															? `${generatedPayroll?.isPaid ? "Paid" : "Generated"} net ${formatCurrency(generatedPayroll?.netPay || 0)}`
															: "No payroll row yet"}
														{" · "}
														<span className="text-gray-500">
															Benefits management enrollment
														</span>
														<button
															type="button"
															onClick={() => navigate(buildEmployeeAdjustmentUrl(row))}
															className="ml-2 font-medium text-orange-700 underline-offset-2 hover:underline">
															Open in benefits
														</button>
													</div>
												)}
											</div>
										);
									})
								) : (
									<div className="px-2 py-2 text-xs text-gray-500">
										No source rows match these controls.
									</div>
								)}
							</div>

							<div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
								<p className="text-[10px] text-gray-500">
									{formatCount(visiblePayrollAdjustments.length)} of{" "}
									{formatCount(filteredPayrollAdjustmentRows.length)} · employee
									benefits for this period
								</p>
								<div className="flex items-center gap-1">
									{adjustmentTotalPages > 1 ? (
										<>
											<button
												type="button"
												disabled={safeAdjustmentPage <= 1}
												onClick={() => setAdjustmentPage(safeAdjustmentPage - 1)}
												className="h-6 rounded border border-gray-200 bg-white px-1.5 text-[10px] font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50">
												Prev
											</button>
											<span className="px-0.5 text-[10px] tabular-nums text-gray-400">
												{safeAdjustmentPage}/{adjustmentTotalPages}
											</span>
											<button
												type="button"
												disabled={safeAdjustmentPage >= adjustmentTotalPages}
												onClick={() => setAdjustmentPage(safeAdjustmentPage + 1)}
												className="h-6 rounded border border-gray-200 bg-white px-1.5 text-[10px] font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50">
												Next
											</button>
										</>
									) : null}
									<button
										type="button"
										onClick={() => navigate(buildAdjustmentCategoryUrl())}
										className="inline-flex h-6 items-center gap-0.5 rounded border border-orange-200 bg-orange-50 px-1.5 text-[10px] font-medium text-orange-800 hover:bg-orange-100"
										title="Open Benefits Management (source of payroll adjustments)">
										Benefits management
										<ExternalLink className="h-3 w-3" />
									</button>
								</div>
							</div>
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="approved-ot" className="border-t border-gray-100">
								<AccordionTrigger className="rounded-md px-2 py-2.5 hover:no-underline hover:bg-gray-50/80">
									<div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
									<div className="flex min-w-0 items-center gap-2">
										<Clock className="h-4 w-4 shrink-0 text-gray-500" />
										<span className="truncate text-sm font-semibold text-gray-900">
											Approved OT
										</span>
										<HelpTip
											tip="About approved OT"
											lines={[
												"Payable line OT · click row for days",
												"Approved OT = hours from the rptOvertimeDetails workbook applied to timesheet lines (not demo/biometric alone).",
											]}
										/>
									</div>
										<div className="flex shrink-0 items-center gap-1.5">
											{payrollOtReadinessLoading || payrollOtReadinessFetching ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
											) : (
												<>
													<span className="text-[11px] tabular-nums text-emerald-700">
														{formatCount(
															payrollOtReadiness?.summary.peopleWithApprovedOt ??
																payrollOtReadiness?.summary.timesheetsApproved ??
																0,
														)}{" "}
														approved
													</span>
													<Badge className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
														{Number(
															payrollOtReadiness?.summary.totalApprovedLineOtHours ??
																payrollOtReadiness?.summary.totalLineOtHours ??
																0,
														).toLocaleString(undefined, {
															maximumFractionDigits: 1,
														})}{" "}
														hrs
													</Badge>
												</>
											)}
										</div>
									</div>
								</AccordionTrigger>
							<AccordionContent className="px-1 pb-2 pt-0">
								<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-4">
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">Approved people</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-800">
												{formatCount(
													payrollOtReadiness?.summary.peopleWithApprovedOt ?? 0,
												)}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">Approved OT hrs</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-orange-800">
												{Number(
													payrollOtReadiness?.summary.totalApprovedLineOtHours ?? 0,
												).toLocaleString(undefined, { maximumFractionDigits: 1 })}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">Total OT hrs</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900">
												{Number(
													payrollOtReadiness?.summary.totalLineOtHours || 0,
												).toLocaleString(undefined, { maximumFractionDigits: 1 })}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">Pending approval</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-amber-800">
												{formatCount(
													payrollOtReadiness?.summary.peopleWithPendingOtApproval ?? 0,
												)}
											</p>
										</div>
									</div>

									{payrollOtReadinessLoading && !payrollOtReadiness ? (
										<p className="mt-1.5 text-[11px] text-gray-400">Loading…</p>
									) : null}
									<div className="mt-2 max-h-[min(180px,28vh)] overflow-y-auto overscroll-contain divide-y divide-gray-100 rounded-lg border border-gray-200 modern-scroll">
										{payrollOtReadinessLoading && !payrollOtReadiness ? (
											<>
												{Array.from({ length: 6 }).map((_, i) => (
													<div
														key={`ot-skel-${i}`}
														className="flex h-9 items-center gap-2 px-2">
														<div className="min-w-0 flex-1 space-y-1">
															<Skeleton className="h-3 w-2/3" />
															<Skeleton className="h-2.5 w-1/3" />
														</div>
														<Skeleton className="h-3 w-8 shrink-0" />
													</div>
												))}
											</>
										) : payrollOtReadinessError ? (
											<div className="px-3 py-3 text-xs text-amber-800">
												Could not load OT readiness
												{payrollOtReadinessErrorObj instanceof Error
													? `: ${payrollOtReadinessErrorObj.message}`
													: ""}. Restart API if route 404, or seed OT for this period via
												repair-bandai-payroll-source-timesheet-lines.
											</div>
										) : (payrollOtReadiness?.people || []).length > 0 ? (
											(payrollOtReadiness?.people || []).map((person) => {
												const label =
													person.approvalLabel ||
													(person.timesheetStatus === "APPROVED"
														? "Approved"
														: "Needs timesheet approval");
												const isPayable =
													person.isPayableApproved ??
													(person.timesheetStatus === "APPROVED" &&
														person.lineOtMinutes > 0);
												return (
													<button
														key={person.timesheetId}
														type="button"
														onClick={() => setSelectedOtPerson(person)}
														className="flex h-9 w-full items-center gap-2 px-2 text-left hover:bg-orange-50/50 focus:outline-none focus-visible:bg-orange-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300">
														<div className="min-w-0 flex-1">
															<p className="truncate text-xs font-medium text-gray-900">
																{person.name}
																{person.employeeCode ? (
																	<span className="font-normal text-gray-500">
																		{" "}
																		· {person.employeeCode}
																	</span>
																) : null}
															</p>
															<p className="truncate text-[10px] text-gray-500">
																<span
																	className={
																		isPayable
																			? "text-emerald-700"
																			: "text-amber-700"
																	}>
																	{label}
																</span>
																{person.lineDaysWithOt
																	? ` · ${person.lineDaysWithOt} OT days`
																	: ""}
															</p>
														</div>
														<span className="shrink-0 text-xs font-semibold tabular-nums text-orange-800">
															{person.lineOtHours}
														</span>
														<ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
													</button>
												);
											})
										) : (
											<div className="space-y-2 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
										{Number(payrollOtReadiness?.summary?.timesheetsTotal || 0) === 0 ? (
												<p className="flex items-center gap-1.5">
													<span>
														<strong className="text-gray-800">0 timesheets</strong>{" "}
														for this period
													</span>
													<HelpTip
														tip="Why there is no approved OT"
														lines={[
															"Approved OT has nothing to attach to. Seed timesheets (DM4 biometrics) for this cutoff first, then apply rptOvertimeDetails.",
														]}
													/>
												</p>
											) : (
												<>
													<p className="flex items-center gap-1.5">
														<span>
															{formatCount(
																payrollOtReadiness?.summary?.timesheetsTotal || 0,
															)}{" "}
															timesheets ·{" "}
															<strong className="text-gray-800">
																0 report-backed OT
															</strong>{" "}
															for{" "}
															<code className="rounded bg-gray-100 px-1 text-[10px]">
																{selectedPeriodCode || "this period"}
															</code>
														</span>
														<HelpTip
															tip="Why there is no report-backed OT"
															lines={[
																"Demo/biometric OT alone does not count — need rptOvertimeDetails applied to lines for this cutoff.",
															]}
														/>
													</p>
														{/* Known BNPI cutoffs with workbooks in docs/new-cutoff */}
														{(selectedPeriodCode === "PP-20260526-20260611" ||
															Number(
																payrollOtReadiness?.summary?.peopleWithLineOt || 0,
															) === 0) && (
															<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
																<span className="text-[10px] text-gray-500">
																	Open a cutoff with applied OT:
																</span>
																<button
																	type="button"
																	onClick={() =>
																		handlePeriodChange("PP-20260611-20260626")
																	}
																	className="h-6 rounded border border-orange-200 bg-orange-50 px-1.5 text-[10px] font-medium text-orange-800 hover:bg-orange-100">
																	June 11–25
																</button>
																<button
																	type="button"
																	onClick={() =>
																		handlePeriodChange("PP-20260626-20260711")
																	}
																	className="h-6 rounded border border-orange-200 bg-orange-50 px-1.5 text-[10px] font-medium text-orange-800 hover:bg-orange-100">
																	June 26–Jul 10
																</button>
															</div>
														)}
													</>
												)}
											</div>
										)}
									</div>

									<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
										<p className="text-[11px] text-gray-500">
											Showing{" "}
											{formatCount(payrollOtReadiness?.people?.length || 0)} of{" "}
											{formatCount(
												payrollOtReadiness?.pagination?.totalItems || 0,
											)}{" "}
											people · click OT days (DB)
										</p>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => openTimesheets()}
											className="h-7 shrink-0 px-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-700">
											<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
											Open timesheets
										</Button>
									</div>
								</AccordionContent>
							</AccordionItem>

							{/* Schedule deltas — assignment history under OT stack */}
							<AccordionItem value="schedule-deltas" className="border-t border-gray-100">
								<AccordionTrigger className="rounded-md px-2 py-2.5 hover:no-underline hover:bg-gray-50/80">
									<div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
										<div className="flex min-w-0 items-center gap-2">
											<Calendar className="h-4 w-4 shrink-0 text-gray-500" />
											<span className="truncate text-sm font-semibold text-gray-900">
												Schedule changes
											</span>
											<HelpTip
												tip="About schedule changes"
												lines={[
													"Assignments · before → after",
													"Source of truth: EmployeeScheduleHistory (template before → after). Already-matching schedules are skipped at apply time (no history row).",
												]}
											/>
										</div>
										<div className="flex shrink-0 items-center gap-1.5">
											{payrollScheduleDeltasLoading ||
											payrollScheduleDeltasFetching ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
											) : (
												<>
													<span className="text-[11px] tabular-nums text-gray-600">
														{formatCount(
															payrollScheduleDeltas?.summary.uniqueEmployees ?? 0,
														)}{" "}
														emps
													</span>
													<Badge className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-800">
														{formatCount(
															payrollScheduleDeltas?.summary.workshareDeltas ??
																payrollScheduleDeltas?.summary.totalDeltas ??
																0,
														)}{" "}
														deltas
													</Badge>
												</>
											)}
										</div>
									</div>
								</AccordionTrigger>
							<AccordionContent className="px-1 pb-2 pt-0">
								<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-4">
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">
												Schedule deltas
											</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900">
												{formatCount(
													payrollScheduleDeltas?.summary.workshareDeltas ?? 0,
												)}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">
												Unique employees
											</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-emerald-800">
												{formatCount(
													payrollScheduleDeltas?.summary.uniqueEmployees ?? 0,
												)}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">
												Template changes
											</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-orange-800">
												{formatCount(
													payrollScheduleDeltas?.summary.templateChanges ?? 0,
												)}
											</p>
										</div>
										<div className="min-w-0 bg-gray-50 px-2.5 py-2">
											<p className="truncate text-[11px] text-gray-500">Total rows</p>
											<p className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900">
												{formatCount(
													payrollScheduleDeltas?.summary.totalDeltas ?? 0,
												)}
											</p>
										</div>
									</div>
									<div className="mt-2 max-h-[min(180px,28vh)] overflow-y-auto overscroll-contain divide-y divide-gray-100 rounded-lg border border-gray-200 modern-scroll">
										{payrollScheduleDeltasLoading && !payrollScheduleDeltas ? (
											Array.from({ length: 4 }).map((_, i) => (
												<div
													key={`sch-skel-${i}`}
													className="flex h-9 items-center gap-2 px-2">
													<div className="min-w-0 flex-1 space-y-1">
														<Skeleton className="h-3 w-2/3" />
														<Skeleton className="h-2.5 w-1/2" />
													</div>
												</div>
											))
										) : payrollScheduleDeltasError ? (
											<div className="px-3 py-3 text-xs text-amber-800">
												Could not load schedule deltas.
											</div>
										) : (payrollScheduleDeltas?.rows || []).length > 0 ? (
											(payrollScheduleDeltas?.rows || []).map((row) => (
												<button
													key={row.historyId}
													type="button"
													onClick={() => {
														if (!row.employeeId) return;
														const params = new URLSearchParams();
														params.set("from", "run-payroll");
														params.set("tab", "schedule");
														if (selectedPeriodCode) {
															params.set("periodCode", selectedPeriodCode);
														}
														params.set(
															"returnTo",
															`${window.location.pathname}${window.location.search}`,
														);
														navigate(
															`/employee/${encodeURIComponent(row.employeeId)}?${params.toString()}`,
														);
													}}
													className="flex min-h-9 w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-orange-50/50 focus:outline-none focus-visible:bg-orange-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300">
													<div className="min-w-0 flex-1">
														<p className="truncate text-xs font-medium text-gray-900 hover:text-orange-700 hover:underline">
															{row.name}
															{row.employeeCode ? (
																<span className="font-normal text-gray-500">
																	{" "}
																	· {row.employeeCode}
																</span>
															) : null}
														</p>
														<p className="truncate text-[10px] text-gray-500">
															<span className="font-medium text-gray-600">
																{row.action}
															</span>
															{" · "}
															<span className="tabular-nums text-gray-400">
																{row.beforeTemplateCode || "—"}
															</span>
															{" → "}
															<span className="tabular-nums text-orange-800">
																{row.afterTemplateCode || "—"}
															</span>
														</p>
													</div>
													<ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300" />
												</button>
											))
										) : (
										<div className="px-3 py-3 text-xs leading-relaxed text-gray-600">
											<p className="flex items-center gap-1.5">
												<span>
													<strong className="text-gray-800">0 schedule deltas</strong>{" "}
													for this period window
												</span>
												<HelpTip
													tip="Why there are no schedule deltas"
													lines={[
														"Schedules already matched current templates.",
													]}
												/>
											</p>
										</div>
										)}
									</div>
									<p className="mt-1.5 text-[10px] text-gray-400">
										Showing{" "}
										{formatCount(payrollScheduleDeltas?.rows?.length || 0)} of{" "}
										{formatCount(
											payrollScheduleDeltas?.pagination?.totalItems || 0,
										)}{" "}
										· history DB
									</p>
								</AccordionContent>
							</AccordionItem>
							</Accordion>
						</div>

						{/* Reminders Section */}
						<div className="bg-white rounded-xl border border-gray-200 p-5">
							<div className="flex items-center gap-2 mb-3">
								<StickyNote className="w-5 h-5 text-gray-500" />
								<h3 className="font-semibold text-gray-900">Reminders</h3>
							</div>
							<input
								type="text"
								value={reminder}
								onChange={(e) => setReminder(e.target.value)}
								placeholder="Don't forget to..."
								className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-gray-400"
							/>
						</div>
					</div>

					{/* Right Column - Sidebar */}
					<div className="space-y-4">
						{/* Start Payroll Card */}
						<div className="bg-white rounded-xl border border-gray-200 p-5">
							{isPeriodCompleted ? (
								<div className="space-y-4">
									<div className="flex flex-col items-center justify-center p-4 bg-orange-50 rounded-lg border border-orange-100">
										<CheckCircle className="w-10 h-10 text-orange-500 mb-2" />
										<h3 className="font-semibold text-orange-700 text-lg">
											Payroll Completed
										</h3>
										<p className="text-orange-600 text-sm text-center mt-1">
											This payroll period has been successfully processed.
										</p>
									</div>
									<div className="flex gap-3">
										<Button
											type="button"
											onClick={() =>
												navigate(
													getPayrollManagementUrl(selectedPeriodCard?.id),
												)
											}
											data-testid="view-payroll-report"
											className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-5 text-base gap-2 shadow-sm">
											<FileText className="w-5 h-5" />
											View Payroll Report
										</Button>
										<Button
											type="button"
											onClick={handleRetryPayrollJob}
											data-testid="re-run-payroll"
											className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-semibold py-5 text-base gap-2 shadow-sm">
											<RefreshCw className="w-5 h-5" />
											Re-run Payroll
										</Button>
									</div>
								</div>
							) : isSelectedPeriodProcessing ? (
								<Button
									onClick={handleOpenPayrollRunStatus}
									className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-5 text-base gap-2">
									<RefreshCw className="h-5 w-5" />
									{payrollProgressResumeLabel}
								</Button>
							) : (
								<Button
									onClick={handleStartPayroll}
									className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-5 text-base gap-2">
									<CheckCircle className="w-5 h-5" />
									Start Payroll
								</Button>
							)}

						{/* Special Payroll — separate one-time compensation (never regular payroll) */}
						<div className="mt-3 space-y-2">
							<div className="flex items-center gap-1.5">
								<Button
									type="button"
									variant="outline"
									onClick={() => setSpecialPayrollOpen(true)}
									className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 font-semibold py-5 text-base gap-2"
									data-testid="special-payroll-open">
									<Gift className="w-5 h-5" />
									Special Payroll
								</Button>
								<HelpTip
									tip="About special payroll"
									lines={[
										"One-time compensation with separate payslips. Uses this period only as a date label — does not wait for or enter regular payroll.",
									]}
								/>
							</div>
							{(specialPayrollHistoryLoading || specialPayrollRuns.length > 0) && (
									<div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
										<p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
											Special Payroll history
										</p>
										{specialPayrollHistoryLoading ? (
											<p className="text-xs text-gray-500">Loading…</p>
										) : (
											<ul className="space-y-1.5">
												{specialPayrollRuns.slice(0, 5).map((run) => (
													<li
														key={run.id}
														className="flex items-start justify-between gap-2 text-xs">
														<div className="min-w-0">
															<p className="font-medium text-gray-900 truncate">
																{run.label}
															</p>
															<p className="text-gray-500 font-mono">
																{run.runCode}
															</p>
														</div>
														<span
															className={
																run.status === "RELEASED"
																	? "text-emerald-700 font-medium"
																	: run.status === "CANCELLED"
																		? "text-gray-400"
																		: "text-orange-700 font-medium"
															}>
															{run.status}
														</span>
													</li>
												))}
											</ul>
										)}
									</div>
								)}
							</div>

							{/* Payroll Details */}
							<div className="mt-5 space-y-3">
								{/* Sticky dept/section filter explains 0/0 when scope is empty */}
								{hasPayrollScopeFilter ? (
									<div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2">
										<span className="text-[11px] font-medium text-amber-900">
											Scope filter
										</span>
										{selectedDepartmentName ? (
											<span className="rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-900">
												{selectedDepartmentName}
											</span>
										) : null}
										{selectedSectionName ? (
											<span className="rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-amber-900">
												{selectedSectionName}
											</span>
										) : null}
										{payableEmployeesCount === 0 && payrollScopeCount === 0 ? (
											<span className="text-[11px] text-amber-800">
												· 0 employees in this scope
											</span>
										) : null}
										<button
											type="button"
											onClick={clearPayrollScopeFilter}
											className="ml-auto text-[11px] font-medium text-orange-700 underline-offset-2 hover:underline">
											Clear → all
										</button>
									</div>
								) : null}

								{/* Due Date */}
								<div className="flex items-start gap-3">
									<Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{period ? (
												<>
													Due by {period.dayOfWeek}, {period.month}{" "}
													{period.day}
												</>
											) : (
												"Due date not available"
											)}
										</p>
									</div>
								</div>

							{/* Pay Schedule */}
							<div className="flex items-start gap-3">
								<FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
								<div>
									<div className="flex items-center gap-1.5">
										<p className="text-sm font-medium text-gray-900">
											Semi-Monthly Employees
										</p>
										<HelpTip tip="Pay schedule" lines={["Pay Schedule"]} />
									</div>
								</div>
							</div>

								{/* Payroll-ready employees */}
								<button
									type="button"
									onClick={handlePreviewPayroll}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
								<Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
								<div>
									<div className="flex items-center gap-1.5">
										<p className="text-sm font-medium text-gray-900">
											{payableEmployeesValue}
										</p>
										<HelpTip
											tip="About payable now"
											lines={["Payable Now / Scope", approvedTimesheetsNote]}
										/>
									</div>
								</div>
								</button>

								<button
									type="button"
									onClick={() => updateURL("issues", "all")}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
								<AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
								<div>
									<div className="flex items-center gap-1.5">
										<p className="text-sm font-medium text-gray-900">
											{notReadyValue}
										</p>
										<HelpTip
											tip="About not payroll-ready"
											lines={["Not Payroll-Ready / Scope", notReadyNote]}
										/>
									</div>
								</div>
								</button>

								<button
									type="button"
									onClick={() => updateURL("issues", "missing_info")}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
								<AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
								<div>
									<div className="flex items-center gap-1.5">
										<p className="text-sm font-medium text-gray-900">
											{formatCount(missingInfoCount)}
										</p>
										<HelpTip
											tip="About missing payroll data"
											lines={["Missing Payroll Data", missingInfoNote]}
										/>
									</div>
								</div>
								</button>

							{/* Pay Date — period range itself lives on the picker button above */}
								<div className="flex items-start gap-3">
									<Wallet className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{formatDate(
												selectedPeriodCard?.payDate ||
													selectedEndDate ||
													"",
												"long",
											)}
										</p>
										<p className="text-xs text-gray-500">Pay Date</p>
									</div>
								</div>
							</div>
						</div>

						{/* Quick Actions */}
						<div className="bg-white rounded-xl border border-gray-200 p-5">
							<h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
							<div className="space-y-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={handlePreviewPayroll}
									className="w-full justify-start text-gray-700 hover:text-orange-600 hover:bg-orange-50">
									<Eye className="w-4 h-4 mr-3" />
									Payroll Management
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => navigate("/hr/employees")}
									className="w-full justify-start text-gray-700 hover:text-orange-600 hover:bg-orange-50">
									<Users className="w-4 h-4 mr-3" />
									View All Employees
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => openTimesheets()}
									className="w-full justify-start text-gray-700 hover:text-orange-600 hover:bg-orange-50">
									<Clock className="w-4 h-4 mr-3" />
									View Timesheets
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Payroll Management modal: confirm + progress only. Results render on the page. */}
			<Modal
				open={isPreviewPayrollModalOpen}
				onOpenChange={(open) => {
					if (!open) handleClosePreview();
				}}
				showCloseButton={previewStep !== "progress"}
				closeOnBackdropClick={previewStep !== "progress"}
				className={
					previewStep === "progress"
						? "max-h-[90vh] max-w-2xl gap-0 overflow-hidden rounded-xl border-neutral-200 p-0 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:max-w-3xl"
						: "max-h-[90vh] max-w-lg gap-0 overflow-hidden rounded-xl border-neutral-200 p-0 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:max-w-xl"
				}>
				<div
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
					data-testid="preview-payroll-modal-root">
					<div className="shrink-0 border-b border-neutral-100 px-5 py-3 pr-12">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-base font-semibold tracking-tight text-neutral-900">
								{previewPayrollModalTitle(
									previewStep,
									previewStep === "progress" && isTimesheetPayrollPreviewError,
								)}
							</h2>
							<Badge className="border border-sky-200 bg-sky-50 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
								Preview only
							</Badge>
							{previewStep === "confirm" && (
								<HelpTip
									tip="About this management run"
									lines={[
										"Dry-run using timesheet lines and current adjustments (including not submitted, clearly labeled). No payroll records will be created.",
										"Start Payroll auto-generates any missing timesheets from current attendance and auto-approves them.",
									]}
								/>
							)}
						</div>
					</div>

					{previewStep === "confirm" ? (
						<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
							<div className="min-h-0 flex-1 overflow-y-auto modern-scroll px-5 py-4">
								<div className="space-y-4">
									<div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
										<Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
										<p className="text-sm text-sky-950">
											This is a preview only. Running it will not generate payslips,
											lock timesheets, or change period status.
										</p>
									</div>

									<div className="grid grid-cols-2 gap-2">
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Coverage</p>
											<p className="mt-0.5 text-sm font-medium text-neutral-900">
												{payrollCoverageLabel}
											</p>
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Pay date</p>
											<p className="mt-0.5 text-sm font-medium text-neutral-900">
												{period
													? `${period.dayOfWeek}, ${getMonthName(period.month).slice(0, 3)} ${period.day}`
													: "N/A"}
											</p>
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Managed rows</p>
											<p className="mt-0.5 text-sm font-medium text-emerald-700">
												{formatCount(previewComputableEmployeesCount)} employees
											</p>
											<p className="mt-0.5 text-[11px] text-neutral-500">
												{formatCount(payableEmployeesCount)} payroll-ready
												{estimatedIncludesNonApproved
													? ` · ${formatCount(
															Math.max(
																0,
																previewComputableEmployeesCount -
																	payableEmployeesCount,
															),
														)} estimate-only`
													: ""}
											</p>
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Excluded</p>
											<button
												type="button"
												onClick={() => updateURL("issues", "all")}
												className="mt-0.5 text-left text-sm font-medium text-red-600 underline-offset-2 hover:underline">
												{payrollIssues.employeeCount} employees
											</button>
										</div>
									</div>

									<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
										<div className="space-y-1.5">
											<label className="block text-xs font-medium text-neutral-600">
												Department
											</label>
											<Select
												value={selectedDepartmentId}
												onValueChange={handlePayrollDepartmentChange}>
												<SelectTrigger className="h-9 w-full rounded-lg border-neutral-200 bg-white text-sm shadow-none focus:ring-1 focus:ring-neutral-300">
													<SelectValue placeholder="All departments" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All departments</SelectItem>
													{departments.map((department: any) => (
														<SelectItem key={department.id} value={department.id}>
															{department.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-1.5">
											<label className="block text-xs font-medium text-neutral-600">
												Section
											</label>
											<Select
												value={selectedSectionId}
												onValueChange={handlePayrollSectionChange}>
												<SelectTrigger className="h-9 w-full rounded-lg border-neutral-200 bg-white text-sm shadow-none focus:ring-1 focus:ring-neutral-300">
													<SelectValue placeholder="All sections" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All sections</SelectItem>
													{scopedSections.map((section: any) => (
														<SelectItem key={section.id} value={section.id}>
															{section.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>

									{payrollIssues.employeeCount > 0 && (
										<div className="flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
											<p className="text-sm text-orange-900">
												{payrollIssues.employeeCount} not payroll-ready
											</p>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => updateURL("issues", "all")}
												className="h-7 shrink-0 rounded-md border-orange-300 bg-white px-2.5 text-xs font-medium text-orange-800 shadow-none hover:bg-orange-100">
												View issues
											</Button>
										</div>
									)}
								</div>
							</div>
							<div
								className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 bg-white px-5 py-3"
								data-testid="preview-payroll-confirm-footer">
								<Button
									type="button"
									variant="outline"
									onClick={handleClosePreview}
									className="h-9 rounded-lg border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-none hover:bg-neutral-50">
									Back
								</Button>
								{/* Use orange-500 (compiled) — sky-700 is often missing from Tailwind output and hides white label text */}
								<Button
									type="button"
									onClick={handleConfirmRunPreview}
									disabled={!canRunPreview}
									data-testid="preview-payroll-run"
									className="h-9 gap-2 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white shadow-none hover:bg-orange-600 disabled:opacity-60">
									<Eye className="h-3.5 w-3.5" />
									Run Management
								</Button>
							</div>
						</div>
					) : (
						<div className="min-h-0 flex-1 overflow-y-auto modern-scroll p-6">
							{isTimesheetPayrollPreviewError ? (
								<div className="space-y-4">
									<div className="flex items-start gap-3 rounded-xl border border-red-200/80 bg-red-50/70 p-4">
										<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
											<AlertCircle className="h-4 w-4 text-red-700" />
										</div>
										<div className="min-w-0">
											<p className="text-sm font-medium text-red-900">
												Could not compute payroll management
											</p>
											<p className="mt-1 text-xs leading-relaxed text-red-800/80">
												{timesheetPayrollPreviewError instanceof Error
													? timesheetPayrollPreviewError.message
													: "The dry-run request failed. Try again or narrow department/section scope."}
											</p>
										</div>
									</div>
									<div className="flex justify-end gap-2">
										<Button variant="outline" onClick={handleClosePreview}>
											Close
										</Button>
										<Button
											type="button"
											onClick={handleConfirmRunPreview}
											data-testid="preview-payroll-retry"
											className="bg-orange-500 text-white hover:bg-orange-600">
											Retry management
										</Button>
									</div>
								</div>
							) : (
								<div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-sky-100 bg-sky-50/40">
									<Loader2 className="h-7 w-7 animate-spin text-sky-700" />
									<p className="text-sm font-medium text-neutral-800">
										Computing payroll management…
									</p>
									<p className="max-w-sm text-center text-xs text-neutral-500">
										Estimating gross, deductions, and net from timesheet lines
										(including not submitted, labeled). Nothing is written to payroll
										records. Results open on the page when ready.
									</p>
								</div>
							)}
						</div>
					)}
				</div>
			</Modal>

			<Modal
				open={isPreviewDetailOpen}
				onOpenChange={(open) => {
					if (!open) handleClosePreviewEmployee();
				}}
				showCloseButton={false}
				closeOnBackdropClick
				zIndex={120}
				className="max-w-6xl p-5"
				data-testid="preview-payroll-employee-detail-modal">
				{activePreviewEmployee ? (
					<div className="space-y-4">
						{/* Header — matches payroll summary, with PREVIEW distinction */}
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="text-lg font-bold leading-none tracking-tight">
										Payroll summary
									</h2>
									<span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
										Preview
									</span>
									{(() => {
										const readiness = resolvePreviewReadinessPresentation({
											timesheetStatus: activePreviewEmployee.timesheetStatus,
											isPayrollReady: activePreviewEmployee.isPayrollReady,
											readinessKey: activePreviewEmployee.readinessKey,
											readinessLabel: activePreviewEmployee.readinessLabel,
										});
										if (readiness.key === "payroll_ready") return null;
										return (
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${previewReadinessBadgeClass(readiness.tone)}`}>
												{readiness.label}
											</span>
										);
									})()}
								</div>
								<p className="text-xs text-gray-500">
									Estimated amounts before payroll records are generated. Not a final payslip.
									{activePreviewEmployee.isPayrollReady === false
										? " This employee is not payroll-ready yet (workflow); money still uses the same line engine."
										: ""}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1.5 px-2 text-xs"
									onClick={() =>
										handleViewEmployeeProfile(activePreviewEmployee.employeeId)
									}>
									<ExternalLink className="h-3.5 w-3.5" />
									Profile
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
									onClick={handleClosePreviewEmployee}>
									<X className="h-4 w-4" />
									<span className="sr-only">Close</span>
								</Button>
							</div>
						</div>

						{/* Employee header card */}
						<div className="flex items-center gap-3 rounded-lg border border-amber-200/80 border-l-4 border-l-amber-500 bg-white p-3">
							<button
								type="button"
								onClick={() =>
									handleViewEmployeeProfile(activePreviewEmployee.employeeId)
								}
								className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left transition enabled:cursor-pointer enabled:hover:bg-amber-50/60 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-amber-300">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
									{initials(activePreviewEmployee.name)}
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="truncate text-base font-semibold text-gray-900">
											{activePreviewEmployee.name}
										</h3>
										<span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
											Estimated
										</span>
									</div>
									<p className="mt-0.5 min-w-0 truncate text-xs text-gray-500">
										<span className="truncate">{activePreviewPeriodName}</span>
										{activePreviewPeriodRange ? (
											<span className="ml-2 border-l border-gray-300 pl-2">
												{" "}
												{activePreviewPeriodRange}
											</span>
										) : null}
									</p>
									<div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
										<span className="max-w-full truncate">
											{activePreviewEmployee.employeeCode ||
												activePreviewEmployee.employeeId ||
												"N/A"}
										</span>
										<span aria-hidden="true" className="text-gray-300">
											/
										</span>
										<span className="max-w-[220px] truncate">
											{activePreviewEmployee.department || "N/A"}
										</span>
										<span aria-hidden="true" className="text-gray-300">
											/
										</span>
										<span className="max-w-[260px] truncate">
											{activePreviewEmployee.position || "N/A"}
										</span>
									</div>
								</div>
							</button>
							{(activePreviewEmployee.timesheetId ||
								activePreviewEmployee.employeeId) && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 shrink-0 gap-1.5 border-sky-200 px-2.5 text-xs text-sky-800 hover:bg-sky-50"
									onClick={() =>
										handleViewPreviewEmployeeTimesheet(activePreviewEmployee)
									}
									data-testid="preview-employee-view-timesheet">
									<Clock className="h-3.5 w-3.5" />
									View Timesheet
								</Button>
							)}
						</div>

						{/* Zero Pay / Schedule Status Banners */}
						{(() => {
							const meta = activePreviewEmployeeComputation?.metadata || (activePreviewEmployee as any)?.metadata;
							const zeroPayReason = meta?.zeroPayReason;
							const hasSchedule = activePreviewEmployee.hasSchedule !== false && meta?.hasSchedule !== false;

							if (zeroPayReason === "NO_SCHEDULE" || (!hasSchedule && Number(activePreviewEmployeeComputation?.grossPay || 0) === 0)) {
								return (
									<div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
										<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
										<div className="space-y-0.5">
											<p className="font-semibold text-amber-950">No Schedule Assigned (Zero Pay Safeguard)</p>
											<p className="text-amber-800">
												This employee does not have an active work schedule assigned by HR. The preview engine generated ₱0.00 basic pay to prevent unearned salary disbursement. To enable timesheet generation and attendance-based pay, please assign a work schedule to this employee.
											</p>
										</div>
									</div>
								);
							}

							if (zeroPayReason === "NO_DEVICE_DATA") {
								return (
									<div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
										<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
										<div className="space-y-0.5">
											<p className="font-semibold text-slate-900">Zero Attendance (No Device Punches)</p>
											<p className="text-slate-600">
												This employee had 0 biometric punch pairs and 0 approved paid leaves during this cutoff period, resulting in ₱0.00 gross pay.
											</p>
										</div>
									</div>
								);
							}

							return null;
						})()}

						{isPreviewEmployeeComputationLoading && !hasActivePreviewComputation ? (
							<div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
								<div className="flex items-center gap-2 text-sm text-gray-600">
									<Loader2 className="h-4 w-4 animate-spin text-orange-500" />
									Calculating estimated payroll computation...
								</div>
								<Skeleton className="h-40 rounded-lg" />
							</div>
						) : !hasActivePreviewComputation ? (
							<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
								Estimated payroll computation is not available for this employee yet.
							</div>
						) : (
							<>
								{/* Accordion sections mirror /hr/hr-payroll view modal */}
								<Accordion
									type="multiple"
									defaultValue={[]}
									className="rounded-lg border border-gray-200 bg-white">
									<AccordionItem
										value="earnings-deductions"
										className="border-b border-gray-200">
										<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
											<span className="flex items-center gap-2">
												Payroll computation
												<span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
													Estimated
												</span>
											</span>
										</AccordionTrigger>
										<AccordionContent className="px-3 pb-3">
											<div className="grid gap-3 md:grid-cols-2">
												{/* Left: earnings → GrossPay */}
												<div className="overflow-hidden rounded-md border border-gray-200 bg-white">
													<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-500">
														<span>Earnings</span>
														<span className="text-right">Amount</span>
													</div>
													<div className="divide-y divide-gray-100">
														{activePreviewGrossBaseRows.map((row) => (
															<div
																key={`preview-gross-${row.field}-${row.amount}`}
																className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																<div className="min-w-0">
																	<span className="block truncate font-medium text-gray-900">
																		{row.label}
																	</span>
																	{row.explanation ? (
																		<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																			{row.explanation}
																		</span>
																	) : null}
																</div>
																<span
																	className={`whitespace-nowrap text-right font-mono font-semibold tabular-nums ${
																		row.operation === "SUBTRACT"
																			? "text-rose-700"
																			: "text-gray-950"
																	}`}>
																	{row.operation === "SUBTRACT" ? "-" : "+"}
																	{formatCurrency(row.amount)}
																</span>
															</div>
														))}
														{activePreviewGrossBenefitRows.length > 0 && (
															<div className="bg-slate-50/80">
																<div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
																	Benefits applied
																</div>
																{activePreviewGrossBenefitNonTaxableRows.length >
																	0 && (
																	<div>
																		<div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">
																			Non-taxable
																		</div>
																		{activePreviewGrossBenefitNonTaxableRows.map(
																			(row) => (
																				<div
																					key={`preview-gross-nt-${row.field}`}
																					className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																					<div className="min-w-0">
																						<span className="block truncate font-medium text-gray-900">
																							{row.label}
																						</span>
																						{row.explanation ? (
																							<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																								{row.explanation}
																							</span>
																						) : null}
																					</div>
																					<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-gray-950">
																						+{formatCurrency(row.amount)}
																					</span>
																				</div>
																			),
																		)}
																	</div>
																)}
																{activePreviewGrossBenefitTaxableRows.length >
																	0 && (
																	<div>
																		<div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-900/80">
																			Taxable
																		</div>
																		{activePreviewGrossBenefitTaxableRows.map(
																			(row) => (
																				<div
																					key={`preview-gross-t-${row.field}`}
																					className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																					<div className="min-w-0">
																						<span className="block truncate font-medium text-gray-900">
																							{row.label}
																						</span>
																						{row.explanation ? (
																							<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																								{row.explanation}
																							</span>
																						) : null}
																					</div>
																					<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-gray-950">
																						+{formatCurrency(row.amount)}
																					</span>
																				</div>
																			),
																		)}
																	</div>
																)}
															</div>
														)}
														<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-orange-50 px-3 py-2 text-sm">
															<span className="font-semibold text-orange-950">
																GrossPay
																<span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800">
																	(est.)
																</span>
															</span>
															<span className="font-mono font-bold tabular-nums text-orange-950">
																{formatCurrency(activePreviewGrossPay)}
															</span>
														</div>
													</div>
												</div>

												{/* Right: deductions → NetPay → post-net → TotalReceivable */}
												<div className="overflow-hidden rounded-md border border-gray-200 bg-white">
													<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-500">
														<span>Deductions &amp; net</span>
														<span className="text-right">Amount</span>
													</div>
													<div className="divide-y divide-gray-100">
														{activePreviewDeductionRows.map((row) => (
															<div
																key={`preview-deduction-${row.field}-${row.amount}`}
																className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																<div className="min-w-0">
																	<span className="block truncate font-medium text-gray-900">
																		{row.label}
																	</span>
																	{row.explanation ? (
																		<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																			{row.explanation}
																		</span>
																	) : null}
																</div>
																<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-rose-700">
																	-{formatCurrency(row.amount)}
																</span>
															</div>
														))}
														<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-rose-50 px-3 py-2 text-sm">
															<span className="font-semibold text-rose-950">
																Total Deductions
																<span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800">
																	(est.)
																</span>
															</span>
															<span className="font-mono font-bold tabular-nums text-rose-950">
																-{formatCurrency(activePreviewTotalDeductions)}
															</span>
														</div>
														<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-emerald-50 px-3 py-2 text-sm">
															<span className="font-semibold text-emerald-950">
																NetPay
																<span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800">
																	(est.)
																</span>
															</span>
															<span className="font-mono font-bold tabular-nums text-emerald-950">
																{formatCurrency(activePreviewNetPay)}
															</span>
														</div>
														{activePreviewPostNetRows.map((row) => (
															<div
																key={`preview-post-net-${row.field}`}
																className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																<div className="min-w-0">
																	<span className="block truncate font-medium text-gray-900">
																		{row.label}
																	</span>
																	{row.explanation ? (
																		<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																			{row.explanation}
																		</span>
																	) : null}
																</div>
																<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-sky-700">
																	+{formatCurrency(row.amount)}
																</span>
															</div>
														))}
														{shouldShowPreviewReceivable && (
															<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-sky-50 px-3 py-2 text-sm">
																<span className="font-semibold text-sky-950">
																	TotalReceivable
																	<span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800">
																		(est.)
																	</span>
																</span>
																<span className="font-mono font-bold tabular-nums text-sky-950">
																	{formatCurrency(activePreviewTotalReceivable)}
																</span>
															</div>
														)}
													</div>
												</div>
											</div>
										</AccordionContent>
									</AccordionItem>

									{activePreviewHasRatesMeta && (
										<AccordionItem
											value="rates-used"
											className="border-b border-gray-200">
											<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
												<span className="flex items-center gap-2">
													Rates used
													<span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
														Estimated
													</span>
												</span>
											</AccordionTrigger>
											<AccordionContent className="px-3 pb-3">
												<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
													<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
														<h4 className="text-sm font-semibold text-gray-800">
															Salary and rates
														</h4>
														<Badge
															variant="outline"
															className="h-5 rounded-md border-gray-300 px-2 text-[10px] font-normal">
															{(
																activePreviewEmployee.payFrequency || "N/A"
															).replace(/_/g, " ")}
														</Badge>
													</div>
													<div className="grid gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
														<div className="min-w-0 bg-white px-3 py-2.5">
															<div className="text-[11px] font-medium text-gray-500">
																Period basic salary
															</div>
															<div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
																{formatCurrency(
																	activePreviewEmployee.basicSalary,
																)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2.5">
															<div className="text-[11px] font-medium text-gray-500">
																Est. monthly rate
															</div>
															<div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
																{formatCurrency(
																	activePreviewMeta.estimatedMonthlyRate ??
																		activePreviewEmployee.basicSalary,
																)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2.5">
															<div className="text-[11px] font-medium text-gray-500">
																Working days
															</div>
															<div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
																{formatCount(
																	activePreviewMeta.totalWorkDays ?? 0,
																)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2.5">
															<div className="text-[11px] font-medium text-gray-500">
																OT / ND rate
															</div>
															<div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
																{formatCurrency(
																	activePreviewMeta.overtimeRate,
																)}{" "}
																/{" "}
																{formatCurrency(
																	activePreviewMeta.nightDiffRate,
																)}
															</div>
														</div>
													</div>
												</div>
											</AccordionContent>
										</AccordionItem>
									)}

									{activePreviewHasAttendanceMeta && (
										<AccordionItem value="attendance-basis" className="border-b-0">
											<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
												<span className="flex items-center gap-2">
													Attendance basis
													<span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
														Estimated
													</span>
												</span>
											</AccordionTrigger>
											<AccordionContent className="px-3 pb-3">
												<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
													<div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
														<h4 className="text-sm font-semibold text-gray-900">
															Attendance used for estimate
														</h4>
														<Calendar className="h-4 w-4 text-gray-400" />
													</div>
													<div className="grid grid-cols-2 gap-px bg-gray-200 sm:grid-cols-4">
														<div className="min-w-0 bg-white px-3 py-2">
															<div className="text-[11px] font-medium text-gray-500">
																Work days
															</div>
															<div className="mt-1 text-base font-semibold leading-none text-gray-950">
																{formatCount(
																	activePreviewMeta.totalWorkDays ?? 0,
																)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2">
															<div className="text-[11px] font-medium text-gray-500">
																Days absent
															</div>
															<div className="mt-1 text-base font-semibold leading-none text-gray-950">
																{formatCount(
																	activePreviewMeta.daysAbsent ?? 0,
																)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2">
															<div className="text-[11px] font-medium text-gray-500">
																OT hours
															</div>
															<div className="mt-1 text-base font-semibold leading-none text-gray-950">
																{Number(
																	activePreviewMeta.totalOvertimeHours || 0,
																).toFixed(2)}
															</div>
														</div>
														<div className="min-w-0 bg-white px-3 py-2">
															<div className="text-[11px] font-medium text-gray-500">
																Late / early-out hrs
															</div>
															<div className="mt-1 text-base font-semibold leading-none text-gray-950">
																{Number(
																	activePreviewMeta.totalLateHours || 0,
																).toFixed(2)}{" "}
																/{" "}
																{Number(
																	activePreviewMeta.totalEarlyOutHours || 0,
																).toFixed(2)}
															</div>
														</div>
													</div>
													{(previewNonZero(
														previewAmount(activePreviewDeductions.absentDeduction),
													) ||
														previewNonZero(
															previewAmount(activePreviewDeductions.lateDeduction),
														) ||
														previewNonZero(
															previewAmount(
																activePreviewDeductions.earlyOutDeduction,
															),
														)) && (
														<div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-600">
															<p className="font-medium text-gray-800">
																Attendance shortfalls already in Basic Pay
															</p>
															<div className="mt-1.5 grid gap-1 sm:grid-cols-3">
																<span>
																	Absent:{" "}
																	<span className="font-mono font-semibold tabular-nums text-rose-700">
																		-
																		{formatCurrency(
																			activePreviewDeductions.absentDeduction,
																		)}
																	</span>
																</span>
																<span>
																	Late:{" "}
																	<span className="font-mono font-semibold tabular-nums text-rose-700">
																		-
																		{formatCurrency(
																			activePreviewDeductions.lateDeduction,
																		)}
																	</span>
																</span>
																<span>
																	Early out:{" "}
																	<span className="font-mono font-semibold tabular-nums text-rose-700">
																		-
																		{formatCurrency(
																			activePreviewDeductions.earlyOutDeduction,
																		)}
																	</span>
																</span>
															</div>
														</div>
													)}
												</div>
											</AccordionContent>
										</AccordionItem>
									)}
								</Accordion>
							</>
						)}
					</div>
				) : (
					<div className="space-y-4">
						<div className="flex items-start justify-between">
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<h2 className="text-lg font-bold leading-none tracking-tight">
										Payroll summary
									</h2>
									<span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
										Preview
									</span>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
								onClick={handleClosePreviewEmployee}>
								<X className="h-4 w-4" />
								<span className="sr-only">Close</span>
							</Button>
						</div>
						<div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
							{isPreviewEmployeeComputationLoading ? (
								<>
									<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin align-middle" />
									Loading payroll preview detail...
								</>
							) : (
								"That payroll preview row is no longer on this page. Return to the preview list and open the employee again."
							)}
						</div>
					</div>
				)}
			</Modal>


			<Modal
				open={action === "issues"}
				onOpenChange={(open) => {
					if (!open) closeIssuesModal();
				}}
				title="Payroll Issues"
				description="Employees that must be reviewed before this payroll period can be completed."
				className="max-w-5xl">
				<div className="space-y-4">
					<div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
						<div>
							<p className="text-xs text-gray-500">Payroll period</p>
							<p className="text-sm font-semibold text-gray-900">
								{formatDate(selectedPeriodCard?.startDate, "short")} -{" "}
								{formatDate(selectedPeriodCard?.endDate, "short")}
							</p>
						</div>
						<div>
							<p className="text-xs text-gray-500">Payable now</p>
							<p className="text-sm font-semibold text-gray-900">
								{payableEmployeesValue}
							</p>
						</div>
						<div>
							<p className="text-xs text-gray-500">Not payroll-ready</p>
							<p className="text-sm font-semibold text-gray-900">
								{notReadyValue}
							</p>
						</div>
					</div>

					<div className="flex gap-2 overflow-x-auto pb-1">
						{issueTabItems.map((item) => (
							<button
								key={item.value}
								type="button"
								onClick={() => setIssueTab(item.value)}
								className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
									activeBlockerTab === item.value
										? "border-orange-300 bg-orange-50 text-orange-700"
										: "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
								}`}>
								<span>{item.label}</span>
								<span className="rounded border border-current/20 px-1.5 py-0.5 text-xs">
									{formatCount(item.count)}
								</span>
							</button>
						))}
					</div>

					{blockersListLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-16 rounded-lg" />
							<Skeleton className="h-16 rounded-lg" />
							<Skeleton className="h-16 rounded-lg" />
						</div>
					) : (
						<div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">
							{showAllNotReadyEmployees && (
								<section className="space-y-2">
									<div className="flex items-center justify-between gap-3">
										<h3 className="text-sm font-semibold text-gray-900">
											Employees not payroll-ready
										</h3>
										<Badge variant="outline">
											{formatCount(previewExcludedEmployees.length)}
										</Badge>
									</div>
									{previewExcludedEmployees.length > 0 ? (
										<div className="space-y-2">
											{previewExcludedEmployees.map((employee) => (
												<div
													key={`${employee.employeeId || employee.employeeCode}-${employee.blockerType}`}
													className="grid gap-3 rounded-lg border border-orange-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
													<div className="min-w-0">
														<p className="truncate text-sm font-semibold text-gray-900">
															{employee.name}
														</p>
														<p className="truncate text-xs text-gray-500">
															{employee.employeeCode || employee.employeeId || "No code"} /{" "}
															{employee.position || "N/A"} /{" "}
															{employee.department || "N/A"}
														</p>
														<p className="mt-1 line-clamp-2 text-xs text-orange-700">
															{employee.reason}
														</p>
													</div>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() =>
															employee.employeeId &&
															handleViewEmployeeProfile(employee.employeeId)
														}
														disabled={!employee.employeeId}
														className="h-8">
														<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
														Profile
													</Button>
												</div>
											))}
										</div>
									) : (
										<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
											All scoped employees are payroll-ready.
										</div>
									)}
								</section>
							)}

							{showMissingInfoIssues && (
								<section className="space-y-2">
									<div className="flex items-center justify-between gap-3">
										<h3 className="text-sm font-semibold text-gray-900">
											{visibleMissingInfoTitle}
										</h3>
										<Badge variant="outline">
											{formatCount(displayedMissingInfoEmployees.length)}
										</Badge>
									</div>
									{displayedMissingInfoEmployees.length > 0 ? (
										<div className="space-y-2">
											{displayedMissingInfoEmployees.map((employee) => (
												<div
													key={`${employee.id}-${employee.employeeId}`}
													className="grid gap-3 rounded-lg border border-red-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
													<div className="min-w-0">
														<div className="flex min-w-0 items-center gap-3">
															<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-700">
																{employee.avatar}
															</div>
															<div className="min-w-0">
																<p className="truncate text-sm font-semibold text-gray-900">
																	{employee.name}
																</p>
																<p className="truncate text-xs text-gray-500">
																	{employee.employeeId} / {employee.position} /{" "}
																	{employee.department}
																</p>
															</div>
														</div>
														<div className="mt-2 flex flex-wrap gap-1.5">
															{employee.missingFields.map((field) => (
																<span
																	key={`${employee.id}-${field.field}`}
																	className="rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
																	{field.description || field.field}
																</span>
															))}
														</div>
													</div>
													<div className="flex gap-2 sm:justify-end">
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() => handleViewEmployeeProfile(employee.id)}
															className="h-8">
															<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
															Profile
														</Button>
													</div>
												</div>
											))}
											{missingInfoCount > displayedMissingInfoEmployees.length ? (
												<p className="text-xs text-gray-500">
													Showing {formatCount(displayedMissingInfoEmployees.length)} of{" "}
													{formatCount(missingInfoCount)} employees. Open an employee
													profile to fix salary or work schedule.
												</p>
											) : null}
										</div>
									) : missingInfoCount > 0 && blockersListLoading ? (
										<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
											Loading employees with missing payroll info…
										</div>
									) : missingInfoCount > 0 ? (
										<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
											{formatCount(missingInfoCount)} employees are missing basic salary or
											work schedule, but the detail list could not be loaded. Refresh this
											dialog or open employee profiles from the timesheets list.
										</div>
									) : (
										<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
											No employees found for this issue type.
										</div>
									)}
								</section>
							)}

							{showTimesheetIssues && (
								<section className="space-y-2">
									<div className="flex items-center justify-between gap-3">
										<h3 className="text-sm font-semibold text-gray-900">
											Timesheets not submitted
										</h3>
										<Badge variant="outline">
											{formatCount(timesheetBlockers.length)}
										</Badge>
									</div>
									{timesheetBlockers.length > 0 ? (
										<div className="space-y-2">
											{timesheetBlockers.map((blocker) => (
												<div
													key={`${blocker.id}-${blocker.timesheetId || blocker.employeeId}`}
													className="grid gap-3 rounded-lg border border-orange-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
													<div className="min-w-0">
														<p className="truncate text-sm font-semibold text-gray-900">
															{blocker.name}
														</p>
														<p className="truncate text-xs text-gray-500">
															{blocker.employeeId} / {blocker.position} /{" "}
															{blocker.department}
														</p>
													</div>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => openTimesheets(["DRAFT"], blocker)}
														className="h-8">
														<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
														Timesheet
													</Button>
												</div>
											))}
										</div>
									) : (
										<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
											No unsubmitted timesheets found.
										</div>
									)}
								</section>
							)}

							{showApprovalIssues && (
								<section className="space-y-2">
									<div className="flex items-center justify-between gap-3">
										<h3 className="text-sm font-semibold text-gray-900">
											Timesheets pending approval
										</h3>
										<Badge variant="outline">
											{formatCount(approvalBlockers.length)}
										</Badge>
									</div>
									{approvalBlockers.length > 0 ? (
										<div className="space-y-2">
											{approvalBlockers.map((blocker) => (
												<div
													key={`${blocker.id}-${blocker.timesheetId || blocker.employeeId}`}
													className="grid gap-3 rounded-lg border border-yellow-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
													<div className="min-w-0">
														<p className="truncate text-sm font-semibold text-gray-900">
															{blocker.name}
														</p>
														<p className="truncate text-xs text-gray-500">
															{blocker.employeeId} / {blocker.position} /{" "}
															{blocker.department}
														</p>
														{blocker.manager && (
															<p className="truncate text-xs text-gray-400">
																Manager: {blocker.manager}
															</p>
														)}
													</div>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => openTimesheets(["SUBMITTED"], blocker)}
														className="h-8">
														<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
														Timesheet
													</Button>
												</div>
											))}
										</div>
									) : (
										<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
											No timesheets pending approval found.
										</div>
									)}
								</section>
							)}
						</div>
					)}

					<div className="flex justify-end border-t pt-3">
						<Button type="button" variant="outline" onClick={closeIssuesModal}>
							Close
						</Button>
					</div>
				</div>
			</Modal>

			{/* Start Payroll + Progress (single modal, content switches after start) */}
			<Modal
				open={isStartOrProgressModalOpen}
				onOpenChange={(open) => {
					if (!open && !isPayrollActionPending) {
						handleCloseProgressModal();
					}
				}}
				showCloseButton={!isPayrollActionPending}
				closeOnBackdropClick={!isPayrollActionPending}
				className={
					showPayrollProgressContent
						? "max-h-[90vh] max-w-2xl gap-0 overflow-hidden rounded-xl border-neutral-200 p-0 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:max-w-3xl"
						: "max-h-[90vh] max-w-lg gap-0 overflow-hidden rounded-xl border-neutral-200 p-0 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:max-w-xl"
				}>
				<div className="flex min-h-0 max-h-[90vh] flex-col">
					{/* Header — title only, no subdescription */}
					<div className="shrink-0 border-b border-neutral-100 px-5 py-4 pr-12">
						<h2 className="text-base font-semibold tracking-tight text-neutral-900">
							{showPayrollProgressContent
								? isPayrollProgressUnavailable
									? "Payroll run stuck"
									: isPayrollRunProcessing
										? "Payroll running"
										: visiblePayrollProgress?.status === "completed"
											? "Payroll completed"
											: visiblePayrollProgress?.status === "failed"
												? "Payroll failed"
												: visiblePayrollProgress?.status === "paused"
													? "Payroll paused"
													: visiblePayrollProgress?.status === "cancelled"
														? "Payroll cancelled"
														: "Payroll progress"
								: isSelectedPeriodProcessing
									? "View Progress"
									: "Start Payroll"}
						</h2>
					</div>

					{showPayrollProgressContent ? (
						<>
							{/* Scrollable progress body */}
							<div className="min-h-0 flex-1 overflow-y-auto modern-scroll">
							{/* Progress body — horizontal modern layout */}
							<div className="grid grid-cols-1 divide-y divide-neutral-100 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:divide-x md:divide-y-0">
								{/* Left: primary progress */}
								<div className="flex flex-col gap-5 p-6">
									{isPayrollProgressUnavailable ? (
										<div className="flex flex-1 flex-col gap-4">
											<div className="flex items-start gap-3 rounded-xl border border-red-200/80 bg-red-50/70 p-4">
												<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
													<AlertCircle className="h-4 w-4 text-red-700" />
												</div>
												<div className="min-w-0">
													<p className="text-sm font-medium text-red-900">
														Processing is stuck
													</p>
													<p className="mt-1 text-xs leading-relaxed text-red-800/80">
														This period is marked as processing, but there is no
														active payroll job to follow. Resume to continue from
														existing payroll rows, or reopen only when you want to
														clear the stale state.
													</p>
												</div>
											</div>
											{lastPayrollGenerationSnapshot && (
												<div className="grid grid-cols-2 gap-3">
													<div className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3">
														<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
															Saved job
														</p>
														<p className="mt-1 text-sm font-medium text-neutral-900">
															{formatJobId(lastPayrollGenerationSnapshot.jobId)}
														</p>
													</div>
													<div className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3">
														<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
															Saved state
														</p>
														<p className="mt-1 text-sm font-medium text-neutral-900">
															{lastPayrollGenerationSnapshot.status || "Not saved"}
														</p>
													</div>
													<div className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3">
														<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
															Saved progress
														</p>
														<p className="mt-1 text-sm font-medium text-neutral-900">
															{Number(lastPayrollGenerationSnapshot.processed || 0)}{" "}
															of {Number(lastPayrollGenerationSnapshot.total || 0)}
														</p>
													</div>
													<div className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3">
														<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
															Last saved
														</p>
														<p className="mt-1 text-sm font-medium text-neutral-900">
															{formatDateTime(
																lastPayrollGenerationSnapshot.updatedAt ||
																	lastPayrollGenerationSnapshot.completedAt,
															)}
														</p>
													</div>
												</div>
											)}
										</div>
									) : (!payrollJobId &&
											(isActiveProgressLoading || isActiveProgressFetching)) ||
									  (payrollJobId &&
											isProgressLoading &&
											!visiblePayrollProgress) ||
									  (generatePayrollMutation.isPending && !visiblePayrollProgress) ? (
										<div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60">
											<Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
											<p className="text-sm font-medium text-neutral-700">
												{generatePayrollMutation.isPending && !payrollJobId
													? "Starting payroll run..."
													: !payrollJobId
														? "Looking for the running payroll job..."
														: "Loading payroll job..."}
											</p>
											<p className="text-xs text-neutral-400">
												Progress updates live once the job is ready.
											</p>
										</div>
									) : (
										<>
											<div className="flex items-start justify-between gap-4">
												<div className="min-w-0">
													<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
														Progress
													</p>
													<p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-neutral-900">
														{isPayrollRunProcessing && (
															<Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-500" />
														)}
														{isPayrollRunProcessing
															? isPayrollStopRequested
																? "Stopping after current employee"
																: isPayrollPauseRequested
																	? "Pausing after current employee"
																	: `Processing ${payrollProgressDisplayProcessed} of ${payrollProgressDisplayTotal} payable`
															: `Processed ${payrollProgressDisplayProcessed} of ${payrollProgressDisplayTotal} payable`}
													</p>
												</div>
												<div className="text-right">
													<p className="text-3xl font-semibold tracking-tight text-neutral-900">
														{payrollProgressPercentage}
														<span className="text-lg font-medium text-neutral-400">
															%
														</span>
													</p>
												</div>
											</div>

											<div className="space-y-2">
												<Progress
													value={payrollProgressPercentage}
													className="h-2 bg-neutral-100"
												/>
												<div className="flex items-center justify-between text-[11px] text-neutral-400">
													<span>
														{formatCount(payrollProgressDisplayProcessed)} done
													</span>
													<span>
														{formatCount(
															Math.max(
																0,
																payrollProgressDisplayTotal -
																	payrollProgressDisplayProcessed,
															),
														)}{" "}
														remaining
													</span>
												</div>
											</div>

											<div className="grid grid-cols-2 gap-3">
												<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5">
													<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
														Success
													</p>
													<p className="mt-1.5 text-xl font-semibold tracking-tight text-emerald-700">
														{visiblePayrollProgress?.success || 0}
													</p>
												</div>
												<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5">
													<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
														Failed
													</p>
													<p className="mt-1.5 text-xl font-semibold tracking-tight text-red-600">
														{visiblePayrollProgress?.failed || 0}
													</p>
												</div>
												<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5">
													<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
														Payable
													</p>
													<p className="mt-1.5 text-xl font-semibold tracking-tight text-neutral-900">
														{formatCount(payrollProgressDisplayTotal)}
													</p>
												</div>
												<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5">
													<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
														Not ready
													</p>
													{notReadyCount > 0 ? (
														<button
															type="button"
															aria-label="View employees not payroll-ready"
															onClick={() => {
																setShowProgressModal(false);
																updateURL("issues", "all");
															}}
															className="mt-1.5 text-left text-xl font-semibold tracking-tight text-orange-700 underline-offset-2 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2">
															{formatCount(notReadyCount)}
														</button>
													) : (
														<p className="mt-1.5 text-xl font-semibold tracking-tight text-neutral-900">
															0
														</p>
													)}
												</div>
											</div>

											{visiblePayrollProgress?.message && (
												<p className="rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2 text-xs leading-relaxed text-neutral-600">
													{visiblePayrollProgress.message}
												</p>
											)}

											{visiblePayrollProgress?.status === "completed" && (
												<div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-3">
													<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100">
														<CheckCircle className="h-3.5 w-3.5 text-emerald-700" />
													</div>
													<p className="text-sm font-medium text-emerald-900">
														Payroll generation completed.
													</p>
												</div>
											)}
											{visiblePayrollProgress?.status === "failed" && (
												<div className="space-y-2">
													<div className="flex items-center gap-2.5 rounded-xl border border-red-200/80 bg-red-50/70 px-3.5 py-3">
														<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-100">
															<AlertCircle className="h-3.5 w-3.5 text-red-700" />
														</div>
														<p className="text-sm font-medium text-red-900">
															Payroll generation failed.
														</p>
													</div>
													{visiblePayrollProgress.errors?.length > 0 && (
														<div className="rounded-xl border border-red-200/80 bg-white px-3.5 py-3">
															<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-red-500">
																Error detail
																{visiblePayrollProgress.errors.length > 1
																	? ` · ${visiblePayrollProgress.errors.length}`
																	: ""}
															</p>
															<ul className="mt-2 space-y-2">
																{visiblePayrollProgress.errors
																	.slice(0, 3)
																	.map((error, idx) => (
																		<li
																			key={`preview-${error.row}-${error.employeeId}-${idx}`}
																			className="text-xs leading-relaxed text-red-800">
																			{(error.row != null || error.employeeId) && (
																				<span className="font-medium">
																					{error.row != null
																						? `Row ${error.row}`
																						: ""}
																					{error.row != null && error.employeeId
																						? " — "
																						: ""}
																					{error.employeeId || ""}
																					{(error.row != null ||
																						error.employeeId) &&
																						": "}
																				</span>
																			)}
																			<span className="break-words text-red-700">
																				{error.error}
																			</span>
																		</li>
																	))}
															</ul>
															{visiblePayrollProgress.errors.length > 3 && (
																<p className="mt-2 text-[11px] text-red-600/80">
																	+{visiblePayrollProgress.errors.length - 3}{" "}
																	more in the list below
																</p>
															)}
														</div>
													)}
												</div>
											)}
											{visiblePayrollProgress?.status === "paused" && (
												<div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-3">
													<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100">
														<Pause className="h-3.5 w-3.5 text-amber-700" />
													</div>
													<p className="text-sm font-medium text-amber-900">
														Paused. Resume when you are ready.
													</p>
												</div>
											)}
											{visiblePayrollProgress?.status === "cancelled" && (
												<div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-3">
													<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100">
														<X className="h-3.5 w-3.5 text-amber-700" />
													</div>
													<p className="text-sm font-medium text-amber-900">
														Cancelled and period reopened.
													</p>
												</div>
											)}
										</>
									)}
								</div>

								{/* Right: run metadata */}
								<div className="flex flex-col gap-4 bg-neutral-50/50 p-6">
									<div>
										<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400">
											Run details
										</p>
										<p className="mt-1 text-sm text-neutral-500">
											Background job metadata for this period.
										</p>
									</div>
									<div className="space-y-3">
										<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
											<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
												Job ID
											</p>
											<p className="mt-1 font-mono text-sm font-medium text-neutral-900">
												{formatJobId(
													visiblePayrollProgress?.jobId ||
														payrollJobId ||
														lastPayrollGenerationSnapshot?.jobId,
												)}
											</p>
										</div>
										<div className="grid grid-cols-2 gap-3">
											<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
												<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
													Started
												</p>
												<p className="mt-1 text-sm font-medium text-neutral-900">
													{formatDateTime(
														visiblePayrollProgress?.startedAt ||
															lastPayrollGenerationSnapshot?.startedAt,
													)}
												</p>
											</div>
											<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
												<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
													Elapsed
												</p>
												<p className="mt-1 text-sm font-medium text-neutral-900">
													{payrollProgressElapsed || "—"}
												</p>
											</div>
										</div>
										<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
											<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
												Last update
											</p>
											<p className="mt-1 text-sm font-medium text-neutral-900">
												{formatDateTime(
													visiblePayrollProgress?.completedAt ||
														visiblePayrollProgress?.pauseRequestedAt ||
														visiblePayrollProgress?.cancellationRequestedAt ||
														visiblePayrollProgress?.startedAt ||
														lastPayrollGenerationSnapshot?.updatedAt ||
														lastPayrollGenerationSnapshot?.completedAt,
												)}
											</p>
										</div>
										<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
											<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
												Run state
											</p>
											<p className="mt-1 text-sm font-medium text-neutral-900">
												{isPayrollProgressUnavailable
													? "No active job"
													: visiblePayrollProgress?.status === "failed"
														? "Retryable after fixing errors"
														: visiblePayrollProgress?.status === "paused"
															? "Paused; ready to resume"
															: visiblePayrollProgress?.status === "cancelled"
																? "Can run again"
																: isPayrollStopRequested
																	? "Stop requested"
																	: isPayrollPauseRequested
																		? "Pause requested"
																		: visiblePayrollProgress?.status ===
																			  "processing"
																			? "Background run active"
																			: generatePayrollMutation.isPending
																				? "Starting..."
																				: "Complete"}
											</p>
										</div>
										{payrollCoverageLabel !== "N/A" && (
											<div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3">
												<p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400">
													Coverage
												</p>
												<p className="mt-1 text-sm font-medium text-neutral-900">
													{payrollCoverageLabel}
												</p>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Errors — kept inside scroll area so they stay reachable */}
							{visiblePayrollProgress?.errors &&
								visiblePayrollProgress.errors.length > 0 && (
									<div className="border-t border-neutral-100 px-6 py-4">
										<div className="rounded-xl border border-red-200/80 bg-red-50/60 p-4">
											<div className="mb-3">
												<p className="text-sm font-medium text-red-900">
													Errors ({visiblePayrollProgress.errors.length})
												</p>
												<p className="mt-0.5 text-xs leading-relaxed text-red-700/80">
													Fix these rows, then retry. Existing payroll rows for
													this period are upserted, so the rerun continues safely
													instead of duplicating records.
												</p>
											</div>
											<div className="space-y-2">
												{visiblePayrollProgress.errors.map((error, idx) => (
													<div
														key={`${error.row}-${error.employeeId}-${idx}`}
														className="rounded-lg border border-red-100 bg-white px-3.5 py-2.5 text-xs">
														<p className="font-medium text-red-800">
															{error.row != null ? `Row ${error.row}` : "Error"}
															{error.employeeId
																? ` — ${error.employeeId}`
																: ""}
														</p>
														<p className="mt-1 break-words leading-relaxed text-red-700/90">
															{error.error}
														</p>
													</div>
												))}
											</div>
										</div>
									</div>
								)}
							</div>

							{/* Progress footer — pinned */}
							<div className="flex shrink-0 flex-col-reverse items-stretch justify-end gap-2 border-t border-neutral-100 bg-white px-6 py-4 sm:flex-row sm:items-center">
								<Button
									variant="outline"
									onClick={handleCloseProgressModal}
									disabled={isPayrollActionPending}
									className="h-9 rounded-lg border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-none hover:bg-neutral-50">
									Close
								</Button>
								{/* Never resume/reopen when period is already COMPLETED/CLOSED */}
								{isPayrollProgressUnavailable && !isPeriodCompleted && (
									<>
										<Button
											variant="outline"
											onClick={handleRequestPayrollStop}
											disabled={isPayrollActionPending}
											className="h-9 gap-2 rounded-lg border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-none hover:bg-neutral-50">
											{isPayrollActionPending ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<X className="h-3.5 w-3.5" />
											)}
											{isPayrollActionPending ? "Reopening..." : "Reopen period"}
										</Button>
										<Button
											onClick={handleRetryPayrollJob}
											disabled={isPayrollActionPending}
											className="h-9 gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white shadow-none hover:bg-neutral-800">
											{isPayrollActionPending ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<RefreshCw className="h-3.5 w-3.5" />
											)}
											{isPayrollActionPending ? "Starting..." : "Resume processing"}
										</Button>
									</>
								)}
								{!isPeriodCompleted &&
									(visiblePayrollProgress?.status === "failed" ||
										visiblePayrollProgress?.status === "paused" ||
										visiblePayrollProgress?.status === "cancelled") && (
									<Button
										onClick={handleRetryPayrollJob}
										disabled={isPayrollActionPending}
										className="h-9 gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white shadow-none hover:bg-neutral-800">
										{isPayrollActionPending ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<RefreshCw
												className={`h-3.5 w-3.5 ${
													isPayrollActionPending ? "animate-spin" : ""
												}`}
											/>
										)}
										{isPayrollActionPending
											? "Starting..."
											: visiblePayrollProgress?.status === "paused"
												? "Resume processing"
												: "Run again"}
									</Button>
								)}
								{isPayrollRunProcessing && (
									<Button
										variant="outline"
										onClick={handleRequestPayrollPause}
										disabled={
											isPayrollActionPending ||
											isPayrollPauseRequested ||
											isPayrollStopRequested
										}
										className="h-9 gap-2 rounded-lg border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-none hover:bg-neutral-50">
										{isPayrollActionPending ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Pause className="h-3.5 w-3.5" />
										)}
										{isPayrollActionPending
											? "Pausing..."
											: isPayrollStopRequested
												? "Stop requested"
												: isPayrollPauseRequested
													? "Pause requested"
													: "Pause processing"}
									</Button>
								)}
								{canViewPayrollReport && (
									<Button
										onClick={() => {
											navigate(getPayrollManagementUrl(payrollPeriodId));
										}}
										className="h-9 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white shadow-none hover:bg-neutral-800">
										View payroll report
									</Button>
								)}
							</div>
						</>
					) : (
						<>
							{/* Confirm body — compact, scrollable so footer stays visible */}
							<div className="min-h-0 flex-1 overflow-y-auto modern-scroll px-5 py-4">
								<div className="space-y-4">
									{/* Period snapshot */}
									<div className="grid grid-cols-2 gap-2">
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Coverage</p>
											<p className="mt-0.5 text-sm font-medium text-neutral-900">
												{payrollCoverageLabel}
											</p>
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">Pay date</p>
											<p className="mt-0.5 text-sm font-medium text-neutral-900">
												{period
													? `${period.dayOfWeek}, ${getMonthName(period.month).slice(0, 3)} ${period.day}`
													: "N/A"}
											</p>
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">
												{isSelectedPeriodProcessing ? "Status" : "Included"}
											</p>
											{isSelectedPeriodProcessing ? (
												<p className="mt-0.5 text-sm font-medium text-amber-700">
													{selectedPeriod?.status || "PROCESSING"}
												</p>
											) : (
												<button
													type="button"
													onClick={handlePreviewPayroll}
													className="mt-0.5 text-left text-sm font-medium text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">
													{payableEmployeesCount} employees
												</button>
											)}
										</div>
										<div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
											<p className="text-[11px] text-neutral-400">
												{isSelectedPeriodProcessing ? "Next" : "Excluded"}
											</p>
											{isSelectedPeriodProcessing ? (
												<p className="mt-0.5 text-sm font-medium text-amber-700">
													Open progress
												</p>
											) : (
												<button
													type="button"
													onClick={() => updateURL("issues", "all")}
													className="mt-0.5 text-left text-sm font-medium text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40">
													{payrollIssues.employeeCount} employees
												</button>
											)}
										</div>
									</div>

									{/* Department / section filters only */}
									{!isSelectedPeriodProcessing && (
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<div className="space-y-1.5">
												<label className="block text-xs font-medium text-neutral-600">
													Department
												</label>
												<Select
													value={selectedDepartmentId}
													onValueChange={handlePayrollDepartmentChange}>
													<SelectTrigger className="h-9 w-full rounded-lg border-neutral-200 bg-white text-sm shadow-none focus:ring-1 focus:ring-neutral-300">
														<SelectValue placeholder="All departments" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All departments</SelectItem>
														{departments.map((department: any) => (
															<SelectItem
																key={department.id}
																value={department.id}>
																{department.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<div className="space-y-1.5">
												<label className="block text-xs font-medium text-neutral-600">
													Section
												</label>
												<Select
													value={selectedSectionId}
													onValueChange={handlePayrollSectionChange}>
													<SelectTrigger className="h-9 w-full rounded-lg border-neutral-200 bg-white text-sm shadow-none focus:ring-1 focus:ring-neutral-300">
														<SelectValue placeholder="All sections" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All sections</SelectItem>
														{scopedSections.map((section: any) => (
															<SelectItem key={section.id} value={section.id}>
																{section.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
									)}

									{isSelectedPeriodProcessing && (
										<div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
											<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
											<p className="text-sm text-amber-900">
												This period is already processing. Open progress to continue.
											</p>
										</div>
									)}

									{!isSelectedPeriodProcessing &&
										payrollIssues.employeeCount > 0 && (
											<div className="flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
												<p className="text-sm text-orange-900">
													{payrollIssues.employeeCount} not payroll-ready
												</p>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => updateURL("issues", "all")}
													className="h-7 shrink-0 rounded-md border-orange-300 bg-white px-2.5 text-xs font-medium text-orange-800 shadow-none hover:bg-orange-100">
													View issues
												</Button>
											</div>
										)}
								</div>
							</div>

							{/* Confirm footer — always pinned */}
							<div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-100 bg-white px-5 py-3">
								<Button
									variant="outline"
									onClick={() => {
										updateSearchParams((next) => {
											next.delete("action");
											next.delete("tab");
										});
									}}
									className="h-9 rounded-lg border-neutral-200 px-4 text-sm font-medium text-neutral-700 shadow-none hover:bg-neutral-50">
									Back
								</Button>
								<Button
									onClick={
										isSelectedPeriodProcessing
											? () => {
													// Stay in this modal; switch content to live progress.
													handleStartPayroll();
												}
											: handleConfirmStartPayroll
									}
									disabled={isPayrollActionPending}
									className="h-9 gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white shadow-none hover:bg-neutral-800 disabled:opacity-60">
									{isSelectedPeriodProcessing ? (
										<RefreshCw className="h-3.5 w-3.5" />
									) : (
										<CheckCircle className="h-3.5 w-3.5" />
									)}
									{isPayrollActionPending
										? "Processing..."
										: isSelectedPeriodProcessing
											? "Open Progress"
											: "Start Payroll"}
								</Button>
							</div>
						</>
					)}
				</div>
			</Modal>

			{/* OT detail — compact horizontal avatar+summary; table scrolls; shell fits viewport */}
			<Modal
				open={isOtDetailModalOpen}
				onOpenChange={(open) => {
					if (!open) setSelectedOtPerson(null);
				}}
				showCloseButton={false}
				className="relative flex h-auto max-h-[min(88dvh,640px)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-2 overflow-hidden p-3 pr-10 sm:max-h-[min(88vh,640px)] sm:p-3.5 sm:pr-11">
				<Button
					variant="ghost"
					size="icon"
					className="absolute right-2 top-2 z-20 h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
					onClick={() => setSelectedOtPerson(null)}>
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</Button>

				{otPersonDetailLoading || otPersonDetailFetching ? (
					<div className="space-y-2">
						<Skeleton className="h-14 w-full rounded-lg" />
						{Array.from({ length: 5 }).map((_, i) => (
							<Skeleton key={`ot-sk-${i}`} className="h-6 w-full" />
						))}
					</div>
				) : otPersonDetailError ? (
					<p className="py-4 text-center text-sm text-amber-800">
						Could not load OT detail
						{otPersonDetailErrorObj instanceof Error
							? `: ${otPersonDetailErrorObj.message}`
							: "."}
					</p>
				) : otPersonDetail ? (
					(() => {
						const profileEmployeeId =
							otPersonDetail.employeeId || selectedOtPerson?.employeeId || "";
						const openOtEmployeeProfile = () => {
							if (!profileEmployeeId) return;
							const params = new URLSearchParams();
							params.set("from", "run-payroll");
							if (selectedPeriodCode) params.set("periodCode", selectedPeriodCode);
							params.set(
								"returnTo",
								`${window.location.pathname}${window.location.search}`,
							);
							navigate(
								`/employee/${encodeURIComponent(profileEmployeeId)}?${params.toString()}`,
							);
						};
						const initials =
							(otPersonDetail.name || "E")
								.trim()
								.split(/\s+/)
								.filter(Boolean)
								.slice(0, 2)
								.map((p) => p[0]?.toUpperCase() ?? "")
								.join("") || "E";
						const catChips = otPersonDetail.categoryTotals
							? (
									[
										["Reg", otPersonDetail.categoryTotals.regOtHrs],
										["ND", otPersonDetail.categoryTotals.regNdHrs],
										["Spcl", otPersonDetail.categoryTotals.spclHrs],
										["Spcl OT", otPersonDetail.categoryTotals.spclOtHrs],
										["RHol", otPersonDetail.categoryTotals.rholOtHrs],
										["RD", otPersonDetail.categoryTotals.rdHrs],
										["RD OT", otPersonDetail.categoryTotals.rdOtHrs],
									] as const
								).filter(([, v]) => Number(v) > 0)
							: [];
						return (
							<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
								{/* Single compact horizontal strip: avatar | identity | payable | cats */}
								<div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 pr-8">
									<button
										type="button"
										onClick={openOtEmployeeProfile}
										disabled={!profileEmployeeId}
										className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-default"
										aria-label={
											otPersonDetail.name
												? `Open ${otPersonDetail.name} profile`
												: "Open employee profile"
										}>
										{initials}
									</button>
									<div className="min-w-0 shrink basis-[9.5rem] sm:basis-40">
										{profileEmployeeId ? (
											<button
												type="button"
												onClick={openOtEmployeeProfile}
												className="block max-w-full truncate text-left text-sm font-semibold text-gray-900 hover:text-orange-700 hover:underline">
												{otPersonDetail.name || "Employee"}
											</button>
										) : (
											<p className="truncate text-sm font-semibold text-gray-900">
												{otPersonDetail.name || "Employee"}
											</p>
										)}
										<p className="truncate text-[11px] text-gray-500">
											{otPersonDetail.employeeCode
												? `ID ${otPersonDetail.employeeCode}`
												: ""}
											{otPersonDetail.department
												? `${otPersonDetail.employeeCode ? " · " : ""}${otPersonDetail.department}`
												: ""}
										</p>
									</div>
									<div className="h-8 w-px shrink-0 bg-gray-200" />
									<div className="shrink-0 text-right">
										<p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
											Payable OT
										</p>
										<p className="text-xl font-bold tabular-nums leading-none text-orange-800">
											{otPersonDetail.totalLineOtHours}
										</p>
										<p className="text-[10px] tabular-nums text-gray-500">
											{otPersonDetail.otDayCount} day
											{otPersonDetail.otDayCount === 1 ? "" : "s"}
										</p>
									</div>
									{catChips.length > 0 ? (
										<>
											<div className="hidden h-8 w-px shrink-0 bg-gray-200 sm:block" />
											<div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
												{catChips.map(([label, val]) => (
													<div key={label} className="min-w-0">
														<p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
															{label}
														</p>
														<p className="text-sm font-bold tabular-nums leading-none text-gray-900">
															{Number(val).toLocaleString(undefined, {
																maximumFractionDigits: 1,
															})}
															h
														</p>
													</div>
												))}
											</div>
										</>
									) : null}
									{otPersonDetail.timesheetStatus ? (
										<span
											className={`ml-auto hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase sm:inline ${
												otPersonDetail.timesheetStatus === "APPROVED"
													? "border-emerald-200 bg-emerald-50 text-emerald-700"
													: "border-amber-200 bg-amber-50 text-amber-800"
											}`}>
											{otPersonDetail.timesheetStatus}
										</span>
									) : null}
								</div>

								{/* Day table — only scroll region (cap so modal never exceeds viewport) */}
								<div className="min-h-0 max-h-[calc(min(88dvh,640px)-9.5rem)] flex-1 overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 modern-scroll sm:max-h-[calc(min(88vh,640px)-9.5rem)]">
									<table className="w-full min-w-[480px] border-collapse text-left text-[11px]">
										<thead className="sticky top-0 z-10 bg-gray-50 text-[10px] font-medium text-gray-500 shadow-sm">
											<tr className="border-b border-gray-200">
												<th className="px-2.5 py-1.5 font-medium">Date</th>
												<th className="px-1 py-1.5 text-right font-medium">Reg</th>
												<th className="px-1 py-1.5 text-right font-medium">ND</th>
												<th className="px-1 py-1.5 text-right font-medium">Spcl</th>
												<th className="px-1 py-1.5 text-right font-medium">Spcl OT</th>
												<th className="px-1 py-1.5 text-right font-medium">RHol</th>
												<th className="px-1 py-1.5 text-right font-medium">RD</th>
												<th className="px-1 py-1.5 text-right font-medium">RD OT</th>
												<th className="px-2.5 py-1.5 text-right font-medium text-orange-800">
													Pay
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-50 bg-white">
											{otPersonDetail.days.length === 0 ? (
												<tr>
													<td
														colSpan={9}
														className="px-3 py-5 text-center text-xs text-gray-500">
														No report-backed OT days.
													</td>
												</tr>
											) : (
												otPersonDetail.days.map((day) => {
													const b = day.approvedBuckets || {};
													const n = (k: string) => {
														const v = Number((b as any)[k] ?? 0);
														return Number.isFinite(v) ? v : 0;
													};
													const cell = (v: number) =>
														v > 0 ? (
															<span className="font-medium tabular-nums text-gray-900">
																{v}
															</span>
														) : (
															<span className="tabular-nums text-gray-300">·</span>
														);
													return (
														<tr
															key={day.lineId}
															className="hover:bg-orange-50/40">
															<td className="whitespace-nowrap px-2.5 py-1 font-medium tabular-nums text-gray-800">
																{day.date}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("regOtHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("regNdHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("spclHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("spclOtHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("rholOtHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("rdHrs"))}
															</td>
															<td className="px-1 py-1 text-right">
																{cell(n("rdOtHrs"))}
															</td>
															<td className="px-2.5 py-1 text-right text-sm font-semibold tabular-nums text-orange-800">
																{day.overtimeHours}
															</td>
														</tr>
													);
												})
											)}
										</tbody>
										{otPersonDetail.categoryTotals ? (
											<tfoot className="sticky bottom-0 border-t border-gray-200 bg-gray-50 text-[11px] font-semibold">
												<tr>
													<td className="px-2.5 py-1.5 text-gray-600">Total</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.regOtHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.regNdHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.spclHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.spclOtHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.rholOtHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.rdHrs}
													</td>
													<td className="px-1 py-1.5 text-right tabular-nums">
														{otPersonDetail.categoryTotals.rdOtHrs}
													</td>
													<td className="px-2.5 py-1.5 text-right text-sm tabular-nums text-orange-800">
														{otPersonDetail.totalLineOtHours}
													</td>
												</tr>
											</tfoot>
										) : null}
									</table>
								</div>

								<div className="flex shrink-0 items-center justify-end gap-2">
									<Button
										variant="outline"
										size="sm"
										className="h-8 px-3 text-xs"
										onClick={() => setSelectedOtPerson(null)}>
										Close
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 px-2.5 text-xs text-gray-600 hover:bg-orange-50 hover:text-orange-700"
										onClick={() => {
											const tid = selectedOtPerson?.timesheetId;
											setSelectedOtPerson(null);
											if (tid) {
												navigate(
													`/hr/timesheets?action=view&id=${encodeURIComponent(tid)}${
														selectedPeriodCode
															? `&periodCode=${encodeURIComponent(selectedPeriodCode)}`
															: ""
													}`,
												);
											} else {
												openTimesheets();
											}
										}}>
										<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
										Full timesheet
									</Button>
								</div>
							</div>
						);
					})()
				) : (
					<p className="py-4 text-center text-sm text-gray-500">No OT detail.</p>
				)}
			</Modal>

			<SpecialPayrollModal
				open={specialPayrollOpen}
				onOpenChange={setSpecialPayrollOpen}
				period={
					selectedPeriodCard
						? {
								id: selectedPeriodCard.id,
								code: selectedPeriodCard.code,
								name: selectedPeriodCard.name,
								startDate: selectedPeriodCard.startDate
									? String(selectedPeriodCard.startDate)
									: null,
								endDate: selectedPeriodCard.endDate
									? String(selectedPeriodCard.endDate)
									: null,
								payDate: selectedPeriodCard.payDate
									? String(selectedPeriodCard.payDate)
									: null,
							}
						: null
				}
				compensationTypes={specialCompensationTypes}
				activeEmployees={specialActiveEmployees}
				onCompleted={(run) => {
					setSpecialPayrollRuns((prev) => {
						const without = prev.filter((r) => r.id !== run.id);
						return [run, ...without];
					});
				}}
			/>
		</div>
	);
}
