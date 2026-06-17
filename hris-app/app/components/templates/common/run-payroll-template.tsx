import { useEffect, useMemo, useRef, useState } from "react";
import { Link, data, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { Modal } from "~/components/atoms/Modal";
import { ProfileInitialsAvatar } from "~/components/atoms/ProfileInitialsAvatar";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
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
	payrollPeriodsQueryKeys,
	usePayrollCycleConfig,
} from "~/lib/hooks/usePayrollPeriods";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { useEmployeeBenefits } from "~/lib/hooks/useEmployeeBenefits";
import {
	employeePayrollQueryKeys,
	useEmployeePayrolls,
} from "~/lib/hooks/useEmployeePayroll";
import { formatDate, formatDateForInput } from "~/lib/utils/text-utils";
import type { EmployeeBenefit } from "~/services/employee-benefit.service";
import type {
	PayrollGenerationProgress,
	TimesheetPayrollPreviewEmployee,
	TimesheetPayrollSourceDetail,
} from "~/services/payroll-periods.service";
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
	StickyNote,
	Pause,
	X,
	CreditCard,
	Building2,
	AlertCircle,
	ExternalLink,
	Eye,
	Loader2,
	HelpCircle,
	ChevronDown,
	Search,
} from "lucide-react";

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
	const [expandedAdjustmentId, setExpandedAdjustmentId] = useState<string | null>(null);
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
	const previewDetailEmployeeId = searchParams.get("previewEmployeeId");
	const previewPageParam = Number(searchParams.get("page"));
	const previewLimitParam = Number(searchParams.get("limit"));
	const previewQueryParam = searchParams.get("query")?.trim() || "";
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
	const selectedDepartmentName =
		selectedDepartmentId === "all"
			? "All departments"
			: departments.find((department: any) => String(department.id) === selectedDepartmentId)
					?.name || "Selected department";
	const selectedSectionName =
		selectedSectionId === "all"
			? "All sections"
			: sections.find((section: any) => String(section.id) === selectedSectionId)?.name ||
				"Selected section";

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
	const { data: payrollAdjustmentsData, isLoading: payrollAdjustmentsLoading } =
		useEmployeeBenefits({
			filter: payrollPeriodId
				? `payrollPeriodId:${payrollPeriodId},isActive:true`
				: undefined,
			page: 1,
			limit: 5000,
			sort: "createdAt",
			order: "desc",
			count: true,
			enabled: Boolean(payrollPeriodId),
		});
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
	} = usePayrollBlockers(payrollPeriodId, shouldLoadBlockers, 25, payrollScope);
	const generatePayrollMutation = useGenerateTimesheetPayroll();
	const requestPausePayrollMutation = useRequestPauseTimesheetPayroll();
	const requestStopPayrollMutation = useRequestStopTimesheetPayroll();
	const {
		data: timesheetPayrollPreview,
		isLoading: isTimesheetPayrollPreviewLoading,
		isFetching: isTimesheetPayrollPreviewFetching,
	} = useGenerateTimesheetPayrollPreview(
		payrollPeriodId,
		{
			page: previewPage,
			limit: previewLimit,
			query: previewQueryParam,
			departmentId: payrollScope.departmentId,
			sectionId: payrollScope.sectionId,
		},
		(action === "preview-payroll" || action === "start-payroll" || action === "issues") &&
			!!payrollPeriodId,
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
		},
		action === "preview-payroll" && !!payrollPeriodId && !!previewDetailEmployeeId,
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
		Boolean(payrollPeriodId && isSelectedPeriodProcessing && !payrollJobId),
	);
	const payrollProgress =
		payrollJobId && payrollProgressQuery?.jobId === payrollJobId ? payrollProgressQuery : null;
	const activePayrollProgressForSelectedPeriod =
		isSelectedPeriodProcessing &&
		activePayrollProgress?.status === "processing" &&
		activePayrollProgress?.periodId === payrollPeriodId
			? activePayrollProgress
			: null;
	const savedPayrollGenerationProgress: PayrollGenerationProgress | null =
		lastPayrollGenerationSnapshot?.jobId &&
		(!isSelectedPeriodProcessing || lastPayrollGenerationSnapshot.status !== "processing")
			? {
					jobId: lastPayrollGenerationSnapshot.jobId,
					periodId: payrollPeriodId,
					status:
						lastPayrollGenerationSnapshot.status === "failed" ||
						lastPayrollGenerationSnapshot.status === "paused" ||
						lastPayrollGenerationSnapshot.status === "cancelled" ||
						lastPayrollGenerationSnapshot.status === "completed"
							? lastPayrollGenerationSnapshot.status
							: "completed",
					total: Number(lastPayrollGenerationSnapshot.total || 0),
					processed: Number(lastPayrollGenerationSnapshot.processed || 0),
					success: Number(lastPayrollGenerationSnapshot.success || 0),
					failed: Number(lastPayrollGenerationSnapshot.failed || 0),
					errors: [],
					startedAt: lastPayrollGenerationSnapshot.startedAt || "",
					completedAt:
						lastPayrollGenerationSnapshot.completedAt ||
						lastPayrollGenerationSnapshot.updatedAt,
					message: lastPayrollGenerationSnapshot.message,
					cancellationRequested: lastPayrollGenerationSnapshot.cancellationRequested,
					cancellationRequestedAt: lastPayrollGenerationSnapshot.cancellationRequestedAt,
					pauseRequested: lastPayrollGenerationSnapshot.pauseRequested,
					pauseRequestedAt: lastPayrollGenerationSnapshot.pauseRequestedAt,
				}
			: null;
	const visiblePayrollProgress =
		payrollProgress || activePayrollProgressForSelectedPeriod || savedPayrollGenerationProgress;

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

	const missingInfoCount = payrollRunSummary.missingInfoEmployeesTotal || 0;
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
	const previewLoading = isTimesheetPayrollPreviewLoading;
	const previewTableLoading =
		(action === "preview-payroll" && isTimesheetPayrollPreviewLoading) ||
		isTimesheetPayrollPreviewFetching;
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
		const amount = 420; // tuned for wider cards
		el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
	};

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
	const payrollAdjustments = useMemo(
		() => payrollAdjustmentsData?.employeeBenefits || [],
		[payrollAdjustmentsData?.employeeBenefits],
	);
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
	const getAdjustmentSource = (benefit: EmployeeBenefit) => {
		const code = String(benefit.benefitType?.code || "").toUpperCase();
		const text = [
			benefit.benefitType?.name,
			benefit.name,
			benefit.notes,
			benefit.description,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		if (code === "PFA" || text.includes("perfect attendance")) {
			return { label: "Perfect Attendance", filter: "attendance" as const };
		}
		if (code === "LLA" || text.includes("line leader")) {
			return { label: "Line Leader Allowance", filter: "allowance" as const };
		}
		if (code === "TSA" || text.includes("technical skills")) {
			return { label: "Technical Skills Allowance", filter: "allowance" as const };
		}
		if (code === "HYS" || text.includes("hys")) {
			return { label: "HYS Allowance", filter: "allowance" as const };
		}
		if (code === "OBA" || text.includes("ob allowance")) {
			return { label: "OB Allowance", filter: "allowance" as const };
		}
		if (code === "OTM" || text.includes("ot meal") || text.includes("overtime meal")) {
			return { label: "OT Meal Allowance", filter: "allowance" as const };
		}
		if (code === "MLA" || text.includes("meal allowance")) {
			return { label: "Meal Allowance", filter: "allowance" as const };
		}
		if (code === "DMA" || text.includes("de minimis")) {
			return { label: "De Minimis", filter: "allowance" as const };
		}
		if (code === "AON" || text.includes("adjustment ot")) {
			return { label: "Adjustment OT", filter: "overtime" as const };
		}
		if (code === "LVP" || text.includes("acl") || text.includes("vl conversion")) {
			return { label: "ACL VL Conversion", filter: "allowance" as const };
		}
		if (code === "UFD" || text.includes("uniform")) {
			return { label: "Uniform Deduction", filter: "deduction" as const };
		}
		if (code === "MHDMF2" || text.includes("modified hdmf")) {
			return { label: "Statutory Deduction", filter: "deduction" as const };
		}
		if (getAdjustmentDirection(benefit) === "DEDUCTION") {
			return { label: "Deduction Adjustment", filter: "deduction" as const };
		}
		return { label: "Other Adjustment", filter: "other" as const };
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
				const generatedPayroll = generatedPayrollByEmployeeId.get(employeeRecordId);
				return {
					benefit,
					direction: getAdjustmentDirection(benefit),
					source,
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
	const visiblePayrollAdjustments = filteredPayrollAdjustmentRows.slice(0, 12);
	const selectedAdjustmentSummary = useMemo(
		() =>
			filteredPayrollAdjustmentRows.reduce(
				(summary, row) => {
					summary.count += 1;
					summary.amount += row.amount;
					if (row.direction === "DEDUCTION") {
						summary.deductionAmount += row.amount;
						summary.deductionCount += 1;
					} else {
						summary.compensationAmount += row.amount;
						summary.compensationCount += 1;
					}
					if (row.hasGeneratedPayrollRow) {
						summary.generatedPayrollRows.add(row.employeeId || row.employeeName);
					}
					summary.employees.add(row.employeeId || row.employeeName);
					summary.sources.add(row.source.label);
					return summary;
				},
				{
					count: 0,
					amount: 0,
					compensationAmount: 0,
					compensationCount: 0,
					deductionAmount: 0,
					deductionCount: 0,
					employees: new Set<string>(),
					sources: new Set<string>(),
					generatedPayrollRows: new Set<string>(),
				},
			),
		[filteredPayrollAdjustmentRows],
	);
	const selectedAdjustmentNetAmount =
		selectedAdjustmentSummary.compensationAmount -
		selectedAdjustmentSummary.deductionAmount;
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
	const payrollAdjustmentSourceTotals = useMemo(() => {
		const bySource = new Map<string, { label: string; count: number; amount: number }>();
		for (const row of filteredPayrollAdjustmentRows) {
			const current = bySource.get(row.source.label) || {
				label: row.source.label,
				count: 0,
				amount: 0,
			};
			current.count += 1;
			current.amount += row.amount;
			bySource.set(row.source.label, current);
		}
		return Array.from(bySource.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
	}, [filteredPayrollAdjustmentRows]);
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
		params.set("action", "edit");
		params.set("id", row.benefit.id);
		params.set("adjustment", row.source.filter);
		params.set("sourceCategory", row.source.filter);
		if (row.benefit.benefitType?.code) {
			params.set("code", row.benefit.benefitType.code);
		}
		params.set("direction", row.direction);
		return `/hr/benefits-management?${params.toString()}`;
	};
	const openAdjustmentEmployeeProfile = (employeeId?: string | null) => {
		if (!employeeId) return;
		navigate(`/employee/${employeeId}`);
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
				.filter((detail) => Number(detail.amount || 0) > 0),
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
	const activePreviewRegisterColumns = useMemo(
		() =>
			(activePreviewEmployee?.payrollRegisterColumns || [])
				.filter((column) => Number(column.value || 0) !== 0)
				.filter((column) =>
					[
						"HYS Meal Allowance",
						"OB Allowance",
						"Adjustment OT/ND",
						"Modified HDMF 2",
						"Uniform Deduction",
						"Perfect Attendance",
						"Meal Allowance",
						"Line Leader Allowance",
						"TotalReceivable",
					].includes(column.label),
				),
		[activePreviewEmployee?.payrollRegisterColumns],
	);
	const getPreviewRegisterRole = (label: string) => {
		if (["Perfect Attendance", "Meal Allowance", "TotalReceivable"].includes(label)) {
			return "postNet";
		}
		if (["Modified HDMF 2", "Uniform Deduction"].includes(label)) {
			return "deduction";
		}
		return "gross";
	};
	const getPreviewRoleLabel = (role: string) => {
		if (role === "postNet") return "Added after NetPay";
		if (role === "deduction") return "Deducted after GrossPay";
		return "Included in GrossPay";
	};
	const getPreviewRoleClassName = (role: string) => {
		if (role === "postNet") return "border-emerald-200 bg-emerald-50 text-emerald-700";
		if (role === "deduction") return "border-rose-200 bg-rose-50 text-rose-700";
		return "border-orange-200 bg-orange-50 text-orange-700";
	};
	const PreviewHelp = ({
		lines,
	}: {
		lines: Array<string | null | undefined>;
	}) => {
		const visibleLines = lines.filter(Boolean);
		if (!visibleLines.length) return null;
		return (
			<Tooltip>
				<TooltipTrigger>
					<button
						type="button"
						className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
						<HelpCircle className="h-3.5 w-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-[280px] whitespace-normal text-xs leading-5 text-gray-700">
					{visibleLines.map((line, index) => (
						<p key={`${line}-${index}`}>{line}</p>
					))}
				</TooltipContent>
			</Tooltip>
		);
	};
	const isPreviewDetailOpen = action === "preview-payroll" && !!previewDetailEmployeeId;

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

	useEffect(() => {
		if (action !== "preview-payroll") return;
		updateSearchParams((next) => {
			if (!next.get("page")) {
				next.set("page", "1");
			}
			if (!next.get("limit")) {
				next.set("limit", String(previewLimit));
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [action]);

	useEffect(() => {
		if (action !== "preview-payroll" || !previewPagination) return;
		if (previewPagination.page === previewPage) return;
		updateSearchParams((next) => {
			next.set("page", String(previewPagination.page));
			next.set("limit", String(previewPagination.limit));
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [action, previewPagination?.page, previewPagination?.limit, previewPage]);

	useEffect(() => {
		if (!payrollJobIdParam || payrollJobIdParam === payrollJobId) return;
		setPayrollJobId(payrollJobIdParam);
		setShowProgressModal(true);
		setHandledPayrollJobId(null);
	}, [payrollJobId, payrollJobIdParam]);

	useEffect(() => {
		if (!activePayrollProgressForSelectedPeriod?.jobId || payrollJobId) return;
		setPayrollJobId(activePayrollProgressForSelectedPeriod.jobId);
		setHandledPayrollJobId(null);
	}, [activePayrollProgressForSelectedPeriod?.jobId, payrollJobId, showProgressModal]);

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

	// Update URL function - matches departments.tsx pattern
	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const updateURL = (action: string | null, tab?: string) => {
		updateSearchParams((next) => {
			if (action) {
				next.set("action", action);
				if (action === "preview-payroll") {
					next.set("page", "1");
					next.set("limit", String(previewLimit));
					next.delete("previewEmployeeId");
				} else {
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
					next.set("page", "1");
					next.delete("previewEmployeeId");
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

	const previewColumns: Column<PreviewPayrollRow>[] = [
		{
			key: "name",
			label: "Employee",
			width: "34%",
			sortable: false,
			render: (_value, employee) => (
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200">
						<span className="text-xs font-semibold text-neutral-700">
							{initials(employee.name)}
						</span>
					</div>
					<div className="min-w-0">
						<Link
							to={`/employee/${employee.employeeId}`}
							className="block truncate rounded-sm text-left font-semibold text-gray-900 transition-colors hover:text-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
							{employee.name}
						</Link>
						<div className="mt-0.5 truncate text-xs text-gray-500">
							{employee.employeeCode || employee.employeeId}
						</div>
					</div>
				</div>
			),
		},
		{
			key: "payFrequency",
			label: "Pay Basis",
			width: "18%",
			sortable: false,
			render: (_value, employee) => (
				<div className="space-y-1">
					<div className="text-xs font-medium text-gray-800">
						{String(employee.payFrequency || "").replace(/_/g, " ")}
					</div>
					<div className="text-xs text-gray-500">
						Base {formatCurrency(employee.basicSalary)}
					</div>
				</div>
			),
		},
		{
			key: "department",
			label: "Assignment",
			width: "26%",
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
			key: "payrollComputationStatus",
			label: "Payroll Computation",
			width: "18%",
			sortable: false,
			render: () => (
				<div className="min-w-0">
					<p className="truncate text-xs font-medium text-gray-800">On demand</p>
					<p className="truncate text-xs text-gray-500">View to calculate</p>
				</div>
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
		setSelectedPreviewEmployee(null);
		updateURL("preview-payroll");
	};

	const handleClosePreview = () => {
		setSelectedPreviewEmployee(null);
		updateURL(null);
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

	const handleGenerateFromPreview = () => {
		setSelectedPreviewEmployee(null);
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("tab");
			next.delete("previewEmployeeId");
		});
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

	const handleConfirmStartPayroll = () => {
		if (!payrollPeriodId) {
			return;
		}

		clearPayrollProgressCache(payrollJobId);
		setPayrollJobId(null);
		generatePayrollMutation.mutate({
			id: payrollPeriodId,
			...payrollScope,
		}, {
			onSuccess: (data) => {
				updateSearchParams((next) => {
					next.delete("action");
					next.delete("tab");
				});

				if (data?.jobId) {
					openPayrollProgress(data.jobId);
				}
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

	const payrollProgressTotal = visiblePayrollProgress?.total || payableEmployeesCount;
	const payrollProgressPayableCount = Math.max(
		0,
		approvedTimesheetsCount - approvedExcludedCount,
	);
	const payrollProgressDisplayTotal =
		approvedExcludedCount > 0 ? payrollProgressPayableCount : payrollProgressTotal;
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
	const isPayrollProgressUnavailable =
		isSelectedPeriodProcessing &&
		!visiblePayrollProgress &&
		!isActiveProgressLoading &&
		!isActiveProgressFetching &&
		(!payrollJobId || isActiveProgressError || isProgressError || !isProgressLoading);
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

	const handleCloseProgressModal = () => {
		if (isPayrollActionPending) return;
		setShowProgressModal(false);
		updateSearchParams((next) => {
			next.delete("payrollJobId");
		});
	};

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

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-orange-100 rounded-lg">
						<PesoIcon className="w-6 h-6 text-orange-600" />
					</div>
					<div>
						<h1 className="text-2xl font-bold text-gray-900">Run Payroll</h1>
						<p className="text-sm text-gray-500">
							{formatDate(selectedPeriodCard?.startDate, "short")} -{" "}
							{formatDate(selectedPeriodCard?.endDate, "short")}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						className="gap-2"
						onClick={() => navigate("/hr/hr-payroll")}>
						<FileText className="w-4 h-4" />
						Open Payroll Reports
					</Button>
				</div>
			</div>

			{/* Pay Period Selector */}
			<div className="bg-white rounded-xl border border-gray-200 p-4">
				{/* Month/Year Headers */}
				<div className="flex items-center gap-2 mb-3">
					<span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
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

				{/* Toggle to show past periods */}
				<div className="mb-2 flex items-center justify-end gap-2">
					{hasPayrollStatusResume && (
						<Button
							type="button"
							variant="outline"
							title="Open payroll run status"
							aria-label="Open payroll run status"
							onClick={handleOpenPayrollRunStatus}
							className="relative h-9 gap-2 border-orange-200 bg-orange-50 px-3 text-orange-700 hover:bg-orange-100 hover:text-orange-800">
							<RefreshCw className="h-4 w-4" />
							<span className="text-sm font-medium">Payroll status</span>
							{payrollStatusBubbleLabel && (
								<span className="ml-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
									{payrollStatusBubbleLabel}
								</span>
							)}
						</Button>
					)}
					<button
						type="button"
						onClick={handlePeriodViewToggle}
						className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
						<div
							className={`w-10 h-5 rounded-full transition-colors ${
								showPastPeriods ? "bg-orange-500" : "bg-gray-300"
							}`}>
							<div
								className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
									showPastPeriods ? "translate-x-5" : "translate-x-0.5"
								} mt-0.5`}
							/>
						</div>
						<span className="font-medium">Show Past Periods</span>
					</button>
				</div>

				{/* Pay Period Cards (whole year) */}
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => scrollPeriods("left")}
						className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
						aria-label="Scroll periods left">
						<ChevronLeft className="w-5 h-5 text-gray-600" />
					</button>

					<div
						ref={periodScrollRef}
						className="flex gap-3 overflow-x-auto pb-2 flex-1 scroll-smooth"
						style={{ scrollBehavior: "smooth" }}>
						{payPeriods.length > 0 ? (
							payPeriods.map((p: any) => {
								const isSelected =
									p.code === selectedPeriodCode ||
									(!selectedPeriodCode && p.id === currentPayrollPeriod?.id);
								const isCurrent = p.id === currentPayrollPeriod?.id;
								const isCompleted = p.status === "COMPLETED";

								// Use shared util to avoid timezone-shifted days
								const endInput = formatDateForInput(p.endDate);
								const endLabel = endInput
									? new Date(
											Number(endInput.slice(0, 4)),
											Number(endInput.slice(5, 7)) - 1,
											Number(endInput.slice(8, 10)),
										)
									: null;

								// Derive period info from endDate
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
									<button
										key={p.id}
										onClick={() => handlePeriodChange(p.code)}
										className={`flex-shrink-0 rounded-xl border-2 transition-all w-[132px] ${
											isSelected
												? "border-orange-500 bg-orange-50"
												: "border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"
										}`}>
										<div
											className={`text-[11px] font-semibold py-1.5 px-2 rounded-t-lg text-center ${
												isSelected
													? "bg-orange-500 text-white"
													: isCurrent
														? "bg-emerald-700 text-white"
														: isCompleted
															? "bg-orange-600 text-white"
															: "bg-gray-100 text-gray-600"
											}`}>
											{periodMonth}
										</div>
										<div className="py-3 text-center">
											<div
												className={`text-2xl font-bold ${
													isSelected ? "text-orange-600" : "text-gray-900"
												}`}>
												{periodDay}
											</div>
											<div className="text-[11px] text-gray-500 truncate px-2">
												{periodDayOfWeek}
											</div>
										</div>
									</button>
								);
							})
						) : showInitialSkeleton ? (
							Array.from({ length: 5 }).map((_, index) => (
								<div
									key={`payroll-period-skeleton-${index}`}
									className="w-[132px] flex-shrink-0 overflow-hidden rounded-xl border-2 border-gray-200 bg-white">
									<div className="h-7 bg-gray-100 animate-pulse" />
									<div className="space-y-2 px-4 py-3">
										<div className="mx-auto h-7 w-10 rounded bg-gray-100 animate-pulse" />
										<div className="mx-auto h-3 w-14 rounded bg-gray-100 animate-pulse" />
									</div>
								</div>
							))
						) : (
							<div className="text-sm text-gray-500">No payroll periods found.</div>
						)}
					</div>

					<button
						type="button"
						onClick={() => scrollPeriods("right")}
						className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
						aria-label="Scroll periods right">
						<ChevronRight className="w-5 h-5 text-gray-600" />
					</button>
				</div>
			</div>

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
			) : action === "preview-payroll" ? (
				<div className="space-y-4">
					<div className="bg-white rounded-xl border border-gray-200 p-4">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
							<div className="min-w-0 space-y-3">
								<Button
									variant="ghost"
									size="sm"
									onClick={handleClosePreview}
									className="h-8 px-2 text-gray-600 hover:bg-gray-100 hover:text-orange-600">
									<ChevronLeft className="w-4 h-4 mr-1" />
									Back to Run Payroll
								</Button>
								<div className="flex items-start gap-3">
									<div className="p-2 bg-orange-50 rounded-lg border border-orange-100">
										<Eye className="w-4 h-4 text-orange-600" />
									</div>
									<div className="min-w-0">
										<h2 className="text-lg font-bold text-gray-900">
											Payroll Preview
										</h2>
										<p className="text-xs text-gray-500 mt-0.5">
											{timesheetPayrollPreview?.period?.name ||
												selectedPeriodCard?.name ||
												"Selected Period"}
										</p>
										<p className="text-xs text-gray-500 mt-1">
											{formatDate(
												timesheetPayrollPreview?.period?.startDate ||
													selectedPeriodCard?.startDate,
												"short",
											)}{" "}
											-{" "}
											{formatDate(
												timesheetPayrollPreview?.period?.endDate ||
													selectedPeriodCard?.endDate,
												"short",
											)}
											{" • "}Pay date{" "}
											{formatDate(
												timesheetPayrollPreview?.period?.payDate ||
													selectedPeriodCard?.payDate,
												"long",
											)}
										</p>
									</div>
								</div>
							</div>
							<div className="flex flex-col gap-3 lg:items-end">
								<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
									<div className="space-y-1">
										<span className="block text-xs font-medium text-gray-600">
											Department
										</span>
										<Select
											value={selectedDepartmentId}
											onValueChange={handlePayrollDepartmentChange}>
											<SelectTrigger className="h-9 w-full rounded-md border-gray-200 bg-white text-xs shadow-sm sm:w-[190px]">
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
									<div className="space-y-1">
										<span className="block text-xs font-medium text-gray-600">
											Section
										</span>
										<Select
											value={selectedSectionId}
											onValueChange={handlePayrollSectionChange}>
											<SelectTrigger className="h-9 w-full rounded-md border-gray-200 bg-white text-xs shadow-sm sm:w-[190px]">
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
								<div className="flex flex-wrap items-center gap-2">
									{previewLoading ? (
										<>
											<Skeleton className="h-7 w-28 rounded-full" />
											<Skeleton className="h-7 w-16 rounded-full" />
										</>
									) : (
										<>
											<Badge className="bg-green-100 text-green-700">
												Approved TS{" "}
												{previewSummary?.approvedTimesheetsCount || 0}
											</Badge>
											{selectedPeriodCard?.status && (
												<Badge className="bg-gray-100 text-gray-700">
													{selectedPeriodCard.status}
												</Badge>
											)}
										</>
									)}
								</div>
								<Button
									onClick={handleGenerateFromPreview}
									disabled={
										previewTableLoading ||
										generatePayrollMutation.isPending ||
										(previewPagination?.totalItems ?? previewIncludedEmployees.length) === 0
									}
									className="bg-orange-500 hover:bg-orange-600 text-white">
									{generatePayrollMutation.isPending
										? "Generating..."
										: "Generate from Timesheets"}
								</Button>
							</div>
						</div>
					</div>

					<DataTable<PreviewPayrollRow>
						data={previewIncludedEmployees}
						columns={previewColumns}
						isLoading={previewTableLoading}
						loadingRows={6}
						title="Employees Ready For Payroll"
						description="Approved timesheets included in this payroll run."
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
								: "No employees ready for payroll"
						}
						emptyDescription={
							previewQueryParam
								? `No ready employees matched "${previewQueryParam}".`
								: "Approved timesheets with valid payroll details will appear here."
						}
						rowClassName={() => "hover:bg-orange-50/30"}
						titleActions={
							previewTableLoading ? (
								<Badge className="whitespace-nowrap border border-gray-200 bg-gray-50 text-gray-600">
									Preparing rows
								</Badge>
							) : (
								<Badge className="whitespace-nowrap border border-orange-200 bg-orange-50 text-orange-700">
									{previewPagination?.totalItems ??
										previewIncludedEmployees.length}{" "}
									ready
								</Badge>
							)
						}
						renderActions={(employee) => (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => handleOpenPreviewEmployee(employee)}
								className="h-8 whitespace-nowrap border-orange-200 px-2.5 text-orange-700 hover:bg-orange-50">
								<Eye className="mr-1.5 h-3.5 w-3.5" />
								View
							</Button>
						)}
					/>

					{!previewLoading && previewAdvisoryCount > 0 && (
						<div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
								<div className="flex items-start gap-2">
									<AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-700" />
									<div>
										<h3 className="text-sm font-semibold text-yellow-800">
											{previewAdvisoryCount} payroll{" "}
											{previewAdvisoryCount === 1 ? "advisory" : "advisories"}
										</h3>
										<p className="mt-1 text-xs text-yellow-700">
											Resolve missing info, unsubmitted timesheets, or pending
											approvals before final payroll generation.
										</p>
									</div>
								</div>
								<Button
									variant="outline"
									onClick={() => updateURL("issues", "all")}
									className="border-yellow-300 text-yellow-800 hover:bg-yellow-100">
									View Advisories
								</Button>
							</div>
						</div>
					)}
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
									<p className="text-sm text-gray-500 mt-1">
										Semi-Monthly Employees
									</p>
								</div>
							</div>
						</div>

						{/* Blockers Alert - Hide if completed */}
						{totalBlockers > 0 && !isPeriodCompleted && (
							<div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
								<div className="flex items-start justify-between gap-4">
									<div className="flex items-start gap-3">
										<div className="p-1.5 bg-red-100 rounded-lg mt-0.5">
											<AlertTriangle className="w-5 h-5 text-red-600" />
										</div>
										<div>
											<h3 className="font-semibold text-red-700">
												{totalBlockers} Blockers Preventing Payroll
												Completion
											</h3>
											<p className="text-sm text-red-600 mt-1">
												Hard blockers must be resolved before payroll can be
												processed.
											</p>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => updateURL("issues", "all")}
										className="shrink-0 border-red-300 text-red-700 hover:bg-red-100">
										View All Issues
									</Button>
								</div>

								{/* Blocker Summary */}
								<div className="grid grid-cols-3 gap-2 pt-2 border-t border-red-200">
									{missingInfoCount > 0 && (
										<button
											onClick={() => updateURL("issues", "missing_info")}
											className="flex items-center gap-2 p-2 rounded-lg bg-white border border-red-200 hover:border-red-400 transition-colors">
											<div className="p-1 bg-red-100 rounded">
												<AlertCircle className="w-3.5 h-3.5 text-red-600" />
											</div>
											<div className="text-left">
												<p className="text-xs font-semibold text-red-700">
													{missingInfoCount} Missing Data
												</p>
												<p className="text-[10px] text-red-500">
													Incomplete profiles
												</p>
											</div>
										</button>
									)}
									{timesheetNotSubmittedCount > 0 && (
										<button
											onClick={() => updateURL("issues", "timesheet")}
											className="flex items-center gap-2 p-2 rounded-lg bg-white border border-orange-200 hover:border-orange-400 transition-colors">
											<div className="p-1 bg-orange-100 rounded">
												<Clock className="w-3.5 h-3.5 text-orange-600" />
											</div>
											<div className="text-left">
												<p className="text-xs font-semibold text-orange-700">
													{timesheetNotSubmittedCount} Not Submitted
												</p>
												<p className="text-[10px] text-orange-500">
													Timesheet pending
												</p>
											</div>
										</button>
									)}
									{pendingApprovalCount > 0 && (
										<button
											onClick={() => updateURL("issues", "approval")}
											className="flex items-center gap-2 p-2 rounded-lg bg-white border border-yellow-200 hover:border-yellow-400 transition-colors">
											<div className="p-1 bg-yellow-100 rounded">
												<CheckCircle className="w-3.5 h-3.5 text-yellow-600" />
											</div>
											<div className="text-left">
												<p className="text-xs font-semibold text-yellow-700">
													{pendingApprovalCount} Pending Approval
												</p>
												<p className="text-[10px] text-yellow-600">
													Advisory only
												</p>
											</div>
										</button>
									)}
								</div>
							</div>
						)}

						{/* Payroll Adjustments Section */}
						<div className="rounded-lg border border-gray-200 bg-white p-3">
							<div className="mb-2 flex items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-2">
									<CreditCard className="h-4 w-4 shrink-0 text-gray-500" />
									<h3 className="truncate text-sm font-semibold text-gray-900">
										Payroll Adjustments
									</h3>
								</div>
								<Badge className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
									{formatCount(payrollAdjustmentsTotal)}
								</Badge>
							</div>

							<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200">
								<div className="min-w-0 bg-gray-50 px-3 py-2">
									<p className="truncate text-[11px] text-gray-500">Compensation</p>
									<p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
										{formatCurrency(payrollAdjustmentSummary.compensationAmount)}
									</p>
								</div>
								<div className="min-w-0 bg-gray-50 px-3 py-2">
									<p className="truncate text-[11px] text-gray-500">Deductions</p>
									<p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
										{formatCurrency(payrollAdjustmentSummary.deductionAmount)}
									</p>
								</div>
							</div>

							<div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_152px_160px]">
								<div className="relative min-w-0">
									<Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
									<Input
										value={adjustmentQueryParam}
										onChange={(event) => updateAdjustmentQuery(event.target.value)}
										placeholder="Search employee, code, source"
										className="h-8 pl-8 text-sm"
									/>
								</div>
								<Select
									value={adjustmentDirectionFilter}
									onValueChange={(value) =>
										updateAdjustmentDirection(value as AdjustmentDirectionFilter)
									}>
									<SelectTrigger className="h-8 text-sm">
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
									<SelectTrigger className="h-8 text-sm">
										<SelectValue placeholder="Payroll row" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All payroll states</SelectItem>
										<SelectItem value="with_payroll_row">Generated row</SelectItem>
										<SelectItem value="source_only">Source only</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
								{adjustmentFilters.map((filter) => {
									const isActive = adjustmentFilter === filter.value;
									return (
										<button
											key={filter.value}
											type="button"
											onClick={() => updateAdjustmentFilter(filter.value)}
											className={`h-7 shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors ${
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
										className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
										<X className="h-3.5 w-3.5" />
										Clear
									</button>
								)}
							</div>

							<div className="mt-1.5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-5">
								<div className="min-w-0 bg-white px-2.5 py-2">
									<p className="truncate text-[11px] text-gray-500">
										{selectedAdjustmentLabel}
									</p>
									<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
										{formatCount(selectedAdjustmentSummary.count)} rows
									</p>
								</div>
								<div className="min-w-0 bg-white px-2.5 py-2">
									<p className="truncate text-[11px] text-gray-500">Employees</p>
									<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
										{formatCount(selectedAdjustmentSummary.employees.size)}
									</p>
								</div>
								<div className="min-w-0 bg-white px-2.5 py-2">
									<p className="truncate text-[11px] text-gray-500">Sources</p>
									<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
										{formatCount(selectedAdjustmentSummary.sources.size)}
									</p>
								</div>
								<div className="min-w-0 bg-white px-2.5 py-2">
									<p className="truncate text-[11px] text-gray-500">
										Compensation
									</p>
									<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
										{formatCurrency(selectedAdjustmentSummary.compensationAmount)}
									</p>
								</div>
								<div className="min-w-0 bg-white px-2.5 py-2">
									<p className="truncate text-[11px] text-gray-500">Deductions</p>
									<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
										{formatCurrency(selectedAdjustmentSummary.deductionAmount)}
									</p>
								</div>
							</div>
							<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
								<span>
									Showing {formatCount(selectedAdjustmentSummary.count)} of{" "}
									{formatCount(payrollAdjustmentTotalAvailable)} source rows
								</span>
								<span className="flex shrink-0 items-center gap-2">
									<span className="font-medium text-gray-700">
										Filtered total {formatCurrency(selectedAdjustmentNetAmount)}
									</span>
									{selectedAdjustmentSummary.count > 0 && (
										<button
											type="button"
											onClick={() => navigate(buildAdjustmentCategoryUrl())}
											className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-700">
											View all
											<ExternalLink className="h-3.5 w-3.5" />
										</button>
									)}
								</span>
							</div>

							{payrollAdjustmentSourceTotals.length > 0 && (
								<div className="mt-2 grid gap-1.5 sm:grid-cols-2">
									{payrollAdjustmentSourceTotals.slice(0, 4).map((source) => (
										<div
											key={source.label}
											className="min-w-0 rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
											<div className="flex items-center justify-between gap-2">
												<p className="truncate text-xs font-medium text-gray-700">
													{source.label}
												</p>
												<span className="shrink-0 text-[11px] text-gray-400">
													{formatCount(source.count)}
												</span>
											</div>
											<p className="mt-0.5 truncate text-xs font-semibold tabular-nums text-gray-900">
												{formatCurrency(source.amount)}
											</p>
										</div>
									))}
								</div>
							)}

							<div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
								{payrollAdjustmentsLoading || generatedPayrollRowsLoading ? (
									<div className="space-y-2 p-3">
										<Skeleton className="h-4 w-2/3" />
										<Skeleton className="h-4 w-1/2" />
									</div>
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
										} = row;
										const isExpanded = expandedAdjustmentId === benefit.id;
										const isSourceFilterContext =
											adjustmentFilter !== "all" && adjustmentFilter === source.filter;
										const sourceMetaParts = [
											isSourceFilterContext ? null : source.label,
											benefit.benefitType?.code,
											hasGeneratedPayrollRow ? "Generated row" : "Source only",
										].filter(Boolean);
										return (
											<div
												key={benefit.id}
												className="bg-white">
												<div
													role={employeeId ? "button" : undefined}
													tabIndex={employeeId ? 0 : undefined}
													onClick={() => openAdjustmentEmployeeProfile(employeeId)}
													onKeyDown={(event) => {
														if (!employeeId) return;
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															openAdjustmentEmployeeProfile(employeeId);
														}
													}}
													className={`grid gap-2 px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${
														employeeId ? "cursor-pointer hover:bg-orange-50/35" : ""
													}`}>
													<div className="grid min-w-0 grid-cols-[18px_40px_minmax(0,1fr)] items-start gap-2">
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															setExpandedAdjustmentId(isExpanded ? null : benefit.id);
														}}
														aria-expanded={isExpanded}
														className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
														<ChevronDown
															className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
																isExpanded ? "rotate-180" : ""
															}`}
														/>
														<span className="sr-only">
															{isExpanded ? "Collapse adjustment details" : "Expand adjustment details"}
														</span>
													</button>
													<ProfileInitialsAvatar
														name={employeeName}
														size="sm"
														variant="default"
														className="h-9 w-9 shrink-0 text-xs"
													/>
														<span className="min-w-0">
															<span className="block truncate text-sm font-medium text-gray-900">
																{employeeName}
															</span>
															<span className="mt-0.5 block truncate text-xs text-gray-500">
																{employeeCode || "No employee code"}
															</span>
															<span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-gray-400">
																{sourceMetaParts.map((part, partIndex) => (
																	<span
																		key={`${benefit.id}-${part}`}
																		className="contents">
																		{partIndex > 0 && (
																			<span className="text-gray-300">|</span>
																		)}
																		<span className="truncate">{part}</span>
																	</span>
																))}
															</span>
														</span>
													</div>
													<div className="flex items-start justify-between gap-2 sm:justify-end">
														<div className="shrink-0 text-right">
															<p
																className={
																	direction === "DEDUCTION"
																		? "text-sm font-semibold text-red-700"
																		: "text-sm font-semibold text-emerald-700"
																}>
																{direction === "DEDUCTION" ? "-" : "+"}
																{formatCurrency(benefit.amount)}
															</p>
															<p className="text-xs text-gray-400">
																{direction === "DEDUCTION"
																	? "Deduction"
																	: "Compensation"}
															</p>
														</div>
														<Button
															variant="ghost"
															size="sm"
															onClick={(event) => {
																event.stopPropagation();
																openAdjustmentEmployeeProfile(employeeId);
															}}
															disabled={!employeeId}
															className="h-8 px-2 text-gray-500 hover:bg-orange-50 hover:text-orange-600">
															<ExternalLink className="h-4 w-4" />
															<span className="sr-only">Open employee profile</span>
														</Button>
													</div>
												</div>
												{isExpanded && (
													<div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5">
														<div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">Employee</p>
																<p className="truncate font-medium text-gray-800">
																	{employeeName}
																	{employeeCode ? ` / ${employeeCode}` : ""}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">Payroll period</p>
																<p className="truncate font-medium text-gray-800">
																	{benefit.payrollPeriod?.code ||
																		selectedPeriodCard?.code ||
																		"Selected period"}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">Source table</p>
																<p className="truncate font-medium text-gray-800">
																	employee_benefits
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">Source id</p>
																<p className="truncate font-mono text-[11px] text-gray-700">
																	{benefit.id}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">
																	Type / category
																</p>
																<p className="truncate font-medium text-gray-800">
																	{benefit.benefitType?.code || "No code"} /{" "}
																	{benefit.benefitType?.category || "OTHER"}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">
																	Classification
																</p>
																<p className="truncate font-medium text-gray-800">
																	{direction}
																	{benefit.benefitType?.payrollDirection
																		? " from benefit type"
																		: ""}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">
																	Reconciliation
																</p>
																<p className="truncate font-medium text-gray-800">
																	{(benefit.benefitType as any)?.reconciliationAction ||
																		"Not tagged"}
																</p>
															</div>
															<div className="min-w-0">
																<p className="text-[11px] text-gray-500">Payroll row</p>
																<p className="truncate font-medium text-gray-800">
																	{hasGeneratedPayrollRow
																		? `${generatedPayroll?.isPaid ? "Paid" : "Generated"} / ${formatCurrency(
																				generatedPayroll?.netPay || 0,
																			)} net`
																		: "No generated row for employee"}
																</p>
															</div>
															<div className="min-w-0 sm:col-span-2">
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() => navigate(buildEmployeeAdjustmentUrl(row))}
																	className="h-8 border-gray-200 bg-white px-2.5 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-700">
																	<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
																	Open source adjustment
																</Button>
															</div>
														</div>
													</div>
												)}
											</div>
										);
									})
								) : (
									<div className="px-3 py-3 text-sm text-gray-500">
										No source rows match these controls.
									</div>
								)}
							</div>

							<div className="mt-3 flex items-center justify-between gap-3">
								<p className="truncate text-xs text-gray-500">
									Period rows are added from employee benefits.
								</p>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										const params = buildPayrollAdjustmentParams();
										params.set("action", "create");
										navigate(`/hr/benefits-management?${params.toString()}`);
									}}
									className="shrink-0 text-gray-700 hover:bg-orange-50 hover:text-orange-600">
									<ExternalLink className="mr-2 h-4 w-4" />
									Add/Edit
								</Button>
							</div>
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
									<Button
										onClick={() =>
											navigate(
												getPayrollManagementUrl(selectedPeriodCard?.id),
											)
										}
										className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-5 text-base gap-2">
										<FileText className="w-5 h-5" />
										View Payroll Report
									</Button>
								</div>
							) : isSelectedPeriodProcessing ? (
								<Button
									onClick={handleOpenPayrollRunStatus}
									className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-5 text-base gap-2">
									<RefreshCw className="h-5 w-5" />
									Check Payroll Status
								</Button>
							) : (
								<Button
									onClick={handleStartPayroll}
									className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-5 text-base gap-2">
									<CheckCircle className="w-5 h-5" />
									Start Payroll
								</Button>
							)}

							{/* Payroll Details */}
							<div className="mt-5 space-y-3">
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
										<p className="text-sm font-medium text-gray-900">
											Semi-Monthly Employees
										</p>
										<p className="text-xs text-gray-500">Pay Schedule</p>
									</div>
								</div>

								{/* Payroll-ready employees */}
								<button
									type="button"
									onClick={handlePreviewPayroll}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
									<Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{payableEmployeesValue}
										</p>
										<p className="text-xs text-gray-500">Payable Now / Scope</p>
										<p className="text-xs text-gray-400">{approvedTimesheetsNote}</p>
									</div>
								</button>

								<button
									type="button"
									onClick={() => updateURL("issues", "all")}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
									<AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{notReadyValue}
										</p>
										<p className="text-xs text-gray-500">Not Payroll-Ready / Scope</p>
										<p className="text-xs text-gray-400">{notReadyNote}</p>
									</div>
								</button>

								<button
									type="button"
									onClick={() => updateURL("issues", "missing_info")}
									className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
									<AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{formatCount(missingInfoCount)}
										</p>
										<p className="text-xs text-gray-500">Missing Payroll Data</p>
										<p className="text-xs text-gray-400">{missingInfoNote}</p>
									</div>
								</button>

								{/* Pay Period */}
								<div className="flex items-start gap-3">
									<Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
									<div>
										<p className="text-sm font-medium text-gray-900">
											{formatDate(selectedPeriodCard?.startDate, "short")} -{" "}
											{formatDate(selectedPeriodCard?.endDate, "short")}
										</p>
										<p className="text-xs text-gray-500">Pay Period</p>
									</div>
								</div>

								{/* Pay Date */}
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
									Preview Payroll
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

			<Modal
				open={isPreviewDetailOpen}
				onOpenChange={(open) => {
					if (!open) handleClosePreviewEmployee();
				}}
				title="Payroll Preview Detail"
				description="Estimated payroll amounts for this employee before payroll records are generated."
				className="max-w-3xl">
				{activePreviewEmployee ? (
					<div className="space-y-4">
						<div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
							<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700">
										{initials(activePreviewEmployee.name)}
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-gray-900">
											{activePreviewEmployee.name}
										</p>
										<p className="text-xs text-gray-500">
											{activePreviewEmployee.employeeCode ||
												activePreviewEmployee.employeeId}
										</p>
										<p className="truncate text-xs text-gray-500">
											{activePreviewEmployee.position}{" "}
											<span className="text-gray-300">/</span>{" "}
											{activePreviewEmployee.department}
										</p>
									</div>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										handleViewEmployeeProfile(activePreviewEmployee.employeeId)
									}
									className="w-full justify-center sm:w-auto">
									<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
									Profile
								</Button>
							</div>
						</div>

						{isPreviewEmployeeComputationLoading && !hasActivePreviewComputation ? (
							<div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
								<div className="flex items-center gap-2 text-sm text-gray-600">
									<Loader2 className="h-4 w-4 animate-spin text-orange-500" />
									Calculating payroll computation...
								</div>
								<div className="grid gap-3 sm:grid-cols-3">
									<Skeleton className="h-16 rounded-lg" />
									<Skeleton className="h-16 rounded-lg" />
									<Skeleton className="h-16 rounded-lg" />
								</div>
								<Skeleton className="h-32 rounded-lg" />
							</div>
						) : !hasActivePreviewComputation ? (
							<div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
								Payroll computation is not available for this employee yet.
							</div>
						) : (
							<>
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-lg border border-gray-200 bg-white p-3">
								<div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-500">
									<span>GrossPay</span>
									<PreviewHelp
										lines={[
											"Pay before deductions: basic pay plus items included in GrossPay.",
											"Items added after NetPay are not part of this amount.",
										]}
									/>
								</div>
								<p className="mt-1 font-semibold text-gray-900">
									{formatCurrency(activePreviewEmployee.grossPay)}
								</p>
							</div>
							<div className="rounded-lg border border-gray-200 bg-white p-3">
								<div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-500">
									<span>Deductions</span>
									<PreviewHelp
										lines={["Tax, statutory items, loans, and other deductions taken after GrossPay."]}
									/>
								</div>
								<p className="mt-1 font-semibold text-rose-600">
									{formatCurrency(activePreviewEmployee.totalDeductions)}
								</p>
							</div>
							<div className="rounded-lg border border-gray-200 bg-white p-3">
								<div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-500">
									<span>NetPay</span>
									<PreviewHelp
										lines={["GrossPay less total deductions."]}
									/>
								</div>
								<p className="mt-1 font-semibold text-orange-700">
									{formatCurrency(activePreviewEmployee.netPay)}
								</p>
							</div>
						</div>

						{activePreviewRegisterColumns.length > 0 && (
							<div className="rounded-xl border border-gray-200 bg-white p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-1">
										<h4 className="text-sm font-semibold text-gray-900">
											Register items by payroll role
										</h4>
										<PreviewHelp
											lines={[
												"Each item shows where it enters the payroll math.",
												"Added after NetPay items increase TotalReceivable but do not increase GrossPay.",
											]}
										/>
									</div>
									<span className="text-xs text-gray-500">
										{formatCount(activePreviewRegisterColumns.length)} lines
									</span>
								</div>
								<div className="mt-3 grid gap-2 sm:grid-cols-2">
									{activePreviewRegisterColumns.map((column) => (
										<div
											key={`${column.column}-${column.field}`}
											className="min-w-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
											<div className="flex items-center justify-between gap-2">
												<p className="truncate text-xs font-medium text-gray-700">
													{column.label}
												</p>
												<span
													className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${getPreviewRoleClassName(
														getPreviewRegisterRole(column.label),
													)}`}>
													{getPreviewRoleLabel(getPreviewRegisterRole(column.label))}
												</span>
											</div>
											<div className="mt-1 flex items-center justify-between gap-2">
												<span className="text-[11px] text-gray-400">{column.column}</span>
												<p className="text-sm font-semibold tabular-nums text-gray-900">
													{formatCurrency(Number(column.value || 0))}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						<div className={`grid gap-4 ${activePreviewPostNetSourceDetails.length > 0 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
							<div className="rounded-xl border border-gray-200 bg-white p-4">
								<div className="flex items-center gap-1">
									<h4 className="text-sm font-semibold text-gray-900">Included in GrossPay</h4>
									<PreviewHelp
										lines={[
											"These amounts feed GrossPay before deductions.",
											"Post-net benefits are shown separately.",
										]}
									/>
								</div>
								<div className="mt-3 space-y-2 text-sm">
									{[
										["Basic", activePreviewEmployee.basicPay],
										["Overtime", activePreviewEmployee.overtimePay],
										["Night diff", activePreviewEmployee.nightDiffPay],
										["Holiday/rest day", activePreviewEmployee.holidayPay],
									].map(([label, value]) => (
										<div
											key={String(label)}
											className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
											<span className="text-gray-500">{label}</span>
											<span className="text-left font-medium tabular-nums text-gray-900 sm:text-right">
												{formatCurrency(Number(value))}
											</span>
										</div>
									))}
									{activePreviewGrossSourceDetails.map((detail) => (
										<div
											key={`${detail.source}-${detail.id}`}
											className="grid gap-1 border-t border-gray-100 pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
											<span className="min-w-0 text-gray-500">
												<span className="block truncate text-gray-700">
													{detail.name}
												</span>
												<span className="block truncate text-xs text-gray-400">
													{detail.code || "Adjustment"}{" "}
													{detail.payrollPeriodCode
														? `/ ${detail.payrollPeriodCode}`
														: detail.startDate
															? `/ ${formatDate(detail.startDate, "short")}${
																	detail.endDate
																		? ` - ${formatDate(detail.endDate, "short")}`
																		: ""
																}`
															: ""}
												</span>
											</span>
											<span className="text-left font-medium tabular-nums text-gray-900 sm:text-right">
												{formatCurrency(Number(detail.amount))}
											</span>
										</div>
									))}
								</div>
							</div>

							{activePreviewPostNetSourceDetails.length > 0 && (
								<div className="rounded-xl border border-emerald-200 bg-white p-4">
									<div className="flex items-center gap-1">
										<h4 className="text-sm font-semibold text-gray-900">Added after NetPay</h4>
										<PreviewHelp
											lines={[
												"These are payable on top of NetPay.",
												"They are not included in GrossPay.",
											]}
										/>
									</div>
									<div className="mt-3 space-y-2 text-sm">
										{activePreviewPostNetSourceDetails.map((detail) => (
											<div
												key={`${detail.source}-${detail.id}`}
												className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
												<span className="min-w-0 text-gray-500">
													<span className="block truncate text-gray-700">
														{detail.name}
													</span>
													<span className="block truncate text-xs text-gray-400">
														{detail.code || "Benefit"}
													</span>
												</span>
												<span className="text-left font-medium tabular-nums text-emerald-700 sm:text-right">
													{formatCurrency(Number(detail.amount))}
												</span>
											</div>
										))}
									</div>
								</div>
							)}

							<div className="rounded-xl border border-gray-200 bg-white p-4">
								<div className="flex items-center gap-1">
									<h4 className="text-sm font-semibold text-gray-900">Deducted after GrossPay</h4>
									<PreviewHelp
										lines={["These reduce GrossPay to compute NetPay."]}
									/>
								</div>
								<div className="mt-3 space-y-2 text-sm">
									{[
										["SSS", activePreviewDeductions.sssContribution],
										[
											"PhilHealth",
											activePreviewDeductions.philHealthContribution,
										],
										["Pag-IBIG", activePreviewDeductions.pagibigContribution],
										["Tax", activePreviewDeductions.taxAmount],
										["Absences", activePreviewDeductions.absentDeduction],
										["Late", activePreviewDeductions.lateDeduction],
										["Early out", activePreviewDeductions.earlyOutDeduction],
									].map(([label, value]) => (
										<div
											key={String(label)}
											className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
											<span className="text-gray-500">{label}</span>
											<span className="text-left font-medium tabular-nums text-gray-900 sm:text-right">
												{formatCurrency(Number(value))}
											</span>
										</div>
									))}
									{activePreviewDeductionSourceDetails.map((detail) => (
										<div
											key={`${detail.source}-${detail.id}`}
											className="grid gap-1 border-t border-gray-100 pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
											<span className="min-w-0 text-gray-500">
												<span className="block truncate text-gray-700">
													{detail.name}
												</span>
												<span className="block truncate text-xs text-gray-400">
													{detail.code || detail.direction}{" "}
													{detail.payrollPeriodCode
														? `/ ${detail.payrollPeriodCode}`
														: detail.startDate
															? `/ ${formatDate(detail.startDate, "short")}${
																	detail.endDate
																		? ` - ${formatDate(detail.endDate, "short")}`
																		: ""
																}`
															: ""}
												</span>
											</span>
											<span className="text-left font-medium tabular-nums text-rose-600 sm:text-right">
												{formatCurrency(Number(detail.amount))}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
							</>
						)}
					</div>
				) : (
					<div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
						{isPreviewEmployeeComputationLoading ? (
							<>
								<Loader2 className="mr-2 inline-block h-4 w-4 animate-spin align-middle" />
								Loading payroll preview detail...
							</>
						) : (
							"That payroll preview row is no longer on this page. Return to the preview list and open the employee again."
						)}
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

			{/* Start Payroll Confirmation Modal */}
			<Modal
				open={action === "start-payroll"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => {
							next.delete("action");
							next.delete("tab");
						});
					}
				}}
				title={
					isSelectedPeriodProcessing
						? "Check Payroll Run Status"
						: "Start Payroll Processing"
				}
				description={
					isSelectedPeriodProcessing
						? "This period is marked processing. Check the active background job before taking another action."
						: payrollCoverageLabel !== "N/A"
							? `Start payroll for ${payrollCoverageLabel}`
							: "Processing payroll..."
				}
				className="max-w-lg">
				<div className="space-y-4">
					{isSelectedPeriodProcessing && (
						<div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
								<div>
									<p className="text-sm font-medium text-amber-800">
										Verify the current job first
									</p>
									<p className="text-xs text-amber-700 mt-1">
										Open progress to confirm whether there is an active job or a
										stale processing state that needs to be reopened.
									</p>
								</div>
							</div>
						</div>
					)}
					{/* Warning if there are issues */}
					{!isSelectedPeriodProcessing && payrollIssues.employeeCount > 0 && (
						<div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
								<div>
									<p className="text-sm font-medium text-orange-700">
										{payrollIssues.employeeCount} employees are not payroll-ready
									</p>
									<p className="text-xs text-orange-600 mt-1">
										Resolve missing payroll data or unsubmitted timesheets before
										processing.
									</p>
								</div>
							</div>
						</div>
					)}

					{!isSelectedPeriodProcessing && (
						<div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
							<div className="space-y-1">
								<span className="block text-xs font-medium text-gray-600">
									Department
								</span>
								<Select
									value={selectedDepartmentId}
									onValueChange={handlePayrollDepartmentChange}>
									<SelectTrigger className="h-9 w-full rounded-md border-gray-200 bg-white text-xs shadow-sm">
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
							<div className="space-y-1">
								<span className="block text-xs font-medium text-gray-600">Section</span>
								<Select
									value={selectedSectionId}
									onValueChange={handlePayrollSectionChange}>
									<SelectTrigger className="h-9 w-full rounded-md border-gray-200 bg-white text-xs shadow-sm">
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

					{/* Payroll Summary */}
					<div className="bg-gray-50 rounded-lg p-4 space-y-3">
						<h4 className="font-medium text-gray-900">Payroll Summary</h4>
						<div className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<p className="text-gray-500">Coverage Period</p>
								<p className="font-medium text-gray-900">
									{payrollCoverageLabel}
								</p>
							</div>
							<div>
								<p className="text-gray-500">Pay Date</p>
								<p className="font-medium text-gray-900">
									{period
										? `${period.dayOfWeek}, ${getMonthName(period.month).slice(0, 3)} ${period.day}`
										: "N/A"}
								</p>
							</div>
							<div>
								<p className="text-gray-500">
									{isSelectedPeriodProcessing
										? "Current Status"
										: "Employees Included"}
								</p>
								{isSelectedPeriodProcessing ? (
									<p className="font-medium text-amber-700">
										{selectedPeriod?.status || "PROCESSING"}
									</p>
								) : (
									<button
										type="button"
										onClick={handlePreviewPayroll}
										className="font-medium text-green-700 underline-offset-2 transition-colors hover:text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2">
										{payableEmployeesCount} employees
									</button>
								)}
							</div>
							<div>
								<p className="text-gray-500">
									{isSelectedPeriodProcessing
										? "Next Action"
										: "Employees Excluded"}
								</p>
								{isSelectedPeriodProcessing ? (
									<p className="font-medium text-amber-700">Open progress</p>
								) : (
									<button
										type="button"
										onClick={() => updateURL("issues", "all")}
										className="font-medium text-red-700 underline-offset-2 transition-colors hover:text-red-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
										{payrollIssues.employeeCount} employees
									</button>
								)}
							</div>
							{!isSelectedPeriodProcessing && (
								<div className="col-span-2">
									<p className="text-gray-500">Run Scope</p>
									<p className="font-medium text-gray-900">
										{selectedDepartmentName} / {selectedSectionName}
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="flex justify-end gap-3 pt-4 border-t">
						<Button
							variant="outline"
							onClick={() => {
								updateSearchParams((next) => {
									next.delete("action");
									next.delete("tab");
								});
							}}>
							Back
						</Button>
						<Button
							onClick={
								isSelectedPeriodProcessing
									? () => {
											updateSearchParams((next) => {
												next.delete("action");
												next.delete("tab");
											});
											handleStartPayroll();
										}
									: handleConfirmStartPayroll
							}
							disabled={isPayrollActionPending}
							className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
							{isSelectedPeriodProcessing ? (
								<RefreshCw className="w-4 h-4" />
							) : (
								<CheckCircle className="w-4 h-4" />
							)}
							{isPayrollActionPending
								? "Processing..."
								: isSelectedPeriodProcessing
									? "Open Progress"
									: "Confirm & Start Payroll"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal
				open={showProgressModal}
				onOpenChange={(open) => {
					if (!open && !isPayrollActionPending) handleCloseProgressModal();
				}}
				title="Payroll status"
				description="You can close this window and reopen status from Run Payroll."
				className="max-w-lg"
				showCloseButton={!isPayrollActionPending}
				closeOnBackdropClick={!isPayrollActionPending}>
				<div className="space-y-4">
					{isPayrollProgressUnavailable ? (
						<div className="min-h-[230px] rounded-lg border border-red-200 bg-red-50 p-4">
							<div className="flex items-start gap-2">
								<AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
								<div>
									<p className="text-sm font-medium text-red-900">
										Processing is stuck
									</p>
									<p className="mt-1 text-sm text-red-700">
										This period is marked as processing, but there is no active
										payroll job to follow. Resume to continue from existing
										payroll rows, or reopen only when you want to clear the
										stale state.
									</p>
								</div>
							</div>
							{lastPayrollGenerationSnapshot && (
								<div className="mt-4 grid grid-cols-1 gap-2 border-t border-red-200 pt-3 text-xs text-red-900 sm:grid-cols-2">
									<div>
										<span className="block text-red-700">Saved job</span>
										<span className="font-medium">
											{formatJobId(lastPayrollGenerationSnapshot.jobId)}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Saved state</span>
										<span className="font-medium">
											{lastPayrollGenerationSnapshot.status || "Not saved"}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Saved progress</span>
										<span className="font-medium">
											{Number(lastPayrollGenerationSnapshot.processed || 0)}{" "}
											of {Number(lastPayrollGenerationSnapshot.total || 0)}
										</span>
									</div>
									<div>
										<span className="block text-red-700">Last saved</span>
										<span className="font-medium">
											{formatDateTime(
												lastPayrollGenerationSnapshot.updatedAt ||
													lastPayrollGenerationSnapshot.completedAt,
											)}
										</span>
									</div>
								</div>
							)}
						</div>
					) : !payrollJobId && (isActiveProgressLoading || isActiveProgressFetching) ? (
						<div className="min-h-[230px] rounded-lg border border-orange-200 bg-orange-50 p-4">
							<div className="flex items-center gap-2 text-orange-900 text-sm font-medium">
								<Loader2 className="w-4 h-4 animate-spin" />
								Looking for the running payroll job...
							</div>
						</div>
					) : payrollJobId && isProgressLoading && !visiblePayrollProgress ? (
						<div className="min-h-[230px] rounded-lg border border-orange-200 bg-orange-50 p-4">
							<div className="flex items-center gap-2 text-orange-900 text-sm font-medium">
								<Loader2 className="w-4 h-4 animate-spin" />
								Loading payroll job...
							</div>
						</div>
					) : (
						<>
							<div className="min-h-[230px] rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
								<div className="flex items-center justify-between text-sm">
									<span className="font-medium text-orange-900">
										{isPayrollRunProcessing ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin inline-block mr-2 align-middle" />
												{isPayrollStopRequested
													? "Stopping after current employee"
														: isPayrollPauseRequested
															? "Pausing after current employee"
															: `Processing ${
																	payrollProgressDisplayProcessed
																} of ${
																	payrollProgressDisplayTotal
																} payable`}
											</>
										) : (
											<>
												Processed {payrollProgressDisplayProcessed} of{" "}
												{payrollProgressDisplayTotal} payable
											</>
										)}
									</span>
									<span className="font-semibold text-orange-900">
										{payrollProgressPercentage}%
									</span>
								</div>
								<Progress value={payrollProgressPercentage} className="h-2" />
								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className="text-green-700">
										Success:{" "}
										<span className="font-semibold">
											{visiblePayrollProgress?.success || 0}
										</span>
									</div>
									<div className="text-red-700">
										Failed:{" "}
										<span className="font-semibold">
											{visiblePayrollProgress?.failed || 0}
										</span>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-2 rounded-md border border-orange-100 bg-white/70 px-3 py-2 text-xs text-orange-900">
									<div>
										<span className="block text-orange-700">Payable</span>
										<span className="font-semibold">
											{formatCount(payrollProgressDisplayTotal)}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">
											Not payroll-ready
										</span>
										{notReadyCount > 0 ? (
											<button
												type="button"
												aria-label="View employees not payroll-ready"
												onClick={() => {
													setShowProgressModal(false);
													updateURL("issues", "all");
												}}
												className="font-semibold text-orange-900 underline underline-offset-4 transition-colors hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
												{formatCount(notReadyCount)}
											</button>
										) : (
											<span className="font-semibold">0</span>
										)}
									</div>
								</div>
								<div className="grid grid-cols-1 gap-2 border-t border-orange-200 pt-3 text-xs text-orange-900 sm:grid-cols-2">
									<div>
										<span className="block text-orange-700">Job ID</span>
										<span className="font-medium">
											{formatJobId(
												visiblePayrollProgress?.jobId || payrollJobId,
											)}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Started</span>
										<span className="font-medium">
											{formatDateTime(visiblePayrollProgress?.startedAt)}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Elapsed</span>
										<span className="font-medium">
											{payrollProgressElapsed}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Last update</span>
										<span className="font-medium">
											{formatDateTime(
												visiblePayrollProgress?.completedAt ||
													visiblePayrollProgress?.pauseRequestedAt ||
													visiblePayrollProgress?.cancellationRequestedAt ||
													visiblePayrollProgress?.startedAt,
											)}
										</span>
									</div>
									<div>
										<span className="block text-orange-700">Run state</span>
										<span className="font-medium">
											{visiblePayrollProgress?.status === "failed"
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
																: "Complete"}
										</span>
									</div>
								</div>
								{visiblePayrollProgress?.message && (
									<p className="text-xs text-orange-800">
										{visiblePayrollProgress.message}
									</p>
								)}
								{visiblePayrollProgress?.status === "completed" && (
									<div className="text-green-700 text-sm font-medium text-center">
										Payroll generation completed.
									</div>
								)}
								{visiblePayrollProgress?.status === "failed" && (
									<div className="text-red-700 text-sm font-medium text-center">
										Payroll generation failed.
									</div>
								)}
								{visiblePayrollProgress?.status === "paused" && (
									<div className="text-amber-700 text-sm font-medium text-center">
										Payroll generation paused. Resume when you are ready.
									</div>
								)}
								{visiblePayrollProgress?.status === "cancelled" && (
									<div className="text-amber-700 text-sm font-medium text-center">
										Payroll generation cancelled and period reopened.
									</div>
								)}
							</div>

							{visiblePayrollProgress?.errors &&
								visiblePayrollProgress.errors.length > 0 && (
									<div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
										<div>
											<p className="text-sm font-medium text-red-900">
												Errors ({visiblePayrollProgress.errors.length})
											</p>
											<p className="text-xs text-red-700">
												Fix these rows, then retry. Existing payroll rows
												for this period are upserted, so the rerun continues
												safely for the same period instead of duplicating
												records.
											</p>
										</div>
										<div className="max-h-40 overflow-y-auto space-y-1 text-xs">
											{visiblePayrollProgress.errors.map((error, idx) => (
												<div
													key={`${error.row}-${error.employeeId}-${idx}`}
													className="bg-white border border-red-100 rounded p-2">
													<p className="font-medium text-red-800">
														Row {error.row} - {error.employeeId}
													</p>
													<p className="text-red-700">{error.error}</p>
												</div>
											))}
										</div>
									</div>
								)}
						</>
					)}

					<div className="flex flex-col-reverse gap-2 border-t pt-2 sm:flex-row sm:justify-end">
						<Button
							variant="outline"
							onClick={handleCloseProgressModal}
							disabled={isPayrollActionPending}>
							Close
						</Button>
						{isPayrollProgressUnavailable && (
							<>
								<Button
									variant="outline"
									onClick={handleRequestPayrollStop}
									disabled={isPayrollActionPending}
									className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800">
									{isPayrollActionPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<X className="h-4 w-4" />
									)}
									{isPayrollActionPending ? "Reopening..." : "Reopen period"}
								</Button>
								<Button
									onClick={handleRetryPayrollJob}
									disabled={isPayrollActionPending}
									className="gap-2 bg-orange-500 text-white hover:bg-orange-600">
									{isPayrollActionPending ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<RefreshCw className="h-4 w-4" />
									)}
									{isPayrollActionPending ? "Starting..." : "Resume processing"}
								</Button>
							</>
						)}
						{(visiblePayrollProgress?.status === "failed" ||
							visiblePayrollProgress?.status === "paused" ||
							visiblePayrollProgress?.status === "cancelled") && (
							<Button
								onClick={handleRetryPayrollJob}
								disabled={isPayrollActionPending}
								className="gap-2 bg-orange-500 text-white hover:bg-orange-600">
								{isPayrollActionPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw
										className={`w-4 h-4 ${
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
								className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800">
								{isPayrollActionPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Pause className="h-4 w-4" />
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
								className="bg-orange-500 hover:bg-orange-600 text-white">
								View payroll report
							</Button>
						)}
					</div>
				</div>
			</Modal>
		</div>
	);
}
