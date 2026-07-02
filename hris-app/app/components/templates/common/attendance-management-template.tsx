import { Fragment, useEffect, useState, useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	Clock,
	Calendar,
	Download,
	Check,
	ListCheck,
	ArrowLeft,
	MoreVertical,
	FileEdit,
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import {
	AttendanceDateFilterPopover,
	type AttendanceDatePresetOption,
} from "~/components/molecules/AttendanceDateFilterPopover";
import { AttendanceScopeFilterPopover } from "~/components/molecules/AttendanceScopeFilterPopover";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useSections } from "~/lib/hooks/useSections";
import { usePositions } from "~/lib/hooks/usePositions";
import { useLevels } from "~/lib/hooks/useLevels";
import { formatDate } from "~/lib/utils/text-utils";
import { formatDuration, formatDurationCompact, formatMinutesDuration } from "~/lib/utils";
import { filterAttendanceRecordsByPresentDayThreshold } from "~/lib/utils/attendance-threshold";

import { toast } from "sonner";
import { GenericImportModal } from "~/components/organisms/shared/GenericImportModal";
import { AttendanceFixModal } from "~/components/organisms/hr/AttendanceFixModal";

const IMPORT_FIELDS = {
	required: [
		{ key: "EMPLOYEE_ID", label: "Employee ID", required: true, aliases: ["Person ID"] },
		{ key: "DATE", label: "Date", required: true, aliases: ["Date"] },
	],
	optional: [
		{ key: "TIME_IN", label: "Time In", required: false, aliases: ["IN"] },
		{ key: "TIME_OUT", label: "Time Out", required: false, aliases: ["OUT"] },
		{ key: "STATUS", label: "Status", required: false },
		{ key: "NOTES", label: "Notes", required: false },
	],
	system: [],
};
import { timesheetQueryKeys } from "~/lib/hooks/useTimesheets";
import { timesheetlineQueryKeys } from "~/lib/hooks/useTimesheetlines";
import {
	useAttendanceMetricsDetailed,
	useLeaveBalanceMetrics,
	queryKeys,
} from "~/lib/hooks/useMetrics";
import { useImportAttendance } from "~/lib/hooks/useAttendances";
import { useAttendanceImportProgress } from "~/lib/hooks/useAttendanceImportProgress";
import { useAuth } from "~/lib/hooks/use-auth";
import { useSocket } from "~/contexts/socket-context";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { Card, CardContent } from "~/components/atoms/Card";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	AttendanceDailyTrendSection,
} from "./AttendanceDailyTrendSection";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type AttendanceRecord } from "~/services/metrics.service";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import {
	getAttendanceDisplayStatus,
	getAttendanceStatusBadgeClass,
} from "~/lib/utils/attendance-status";

interface AttendanceManagementProps {
	title?: string;
	description?: string;
}

const BUSINESS_TIME_ZONE = "Asia/Manila";

function getPayrollPeriodsFromResponse(data: any): any[] {
	return data?.payrollPeriods || data?.data?.payrollPeriods || [];
}

function getPayrollPeriodTotalCount(period: any): number | null {
	const count = period?._count;
	const obligationCount = Number(count?.attendanceObligations);
	if (Number.isFinite(obligationCount)) return obligationCount;

	const timesheetCount = Number(count?.timesheets);
	if (Number.isFinite(timesheetCount)) return timesheetCount;

	const directCount = Number(period?.attendanceObligationCount ?? period?.timesheetCount);
	return Number.isFinite(directCount) ? directCount : null;
}

function formatPayrollPeriodOption(period: any): string {
	const name = period?.name || period?.code || "Payroll period";
	const range = `${formatDate(period?.startDate, "short")} - ${formatDate(period?.endDate, "short")}`;
	const total = getPayrollPeriodTotalCount(period);
	const totalLabel = total === null ? "" : ` | ${total.toLocaleString()} total`;
	return `${name} | ${range}${totalLabel}`;
}

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);

	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const day = parts.find((part) => part.type === "day")?.value;

	if (!year || !month || !day) {
		return "";
	}

	return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string | Date | null | undefined): Date {
	if (!value) {
		return new Date();
	}

	if (value instanceof Date) {
		return new Date(value.getFullYear(), value.getMonth(), value.getDate());
	}

	const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (dateMatch) {
		const [, year, month, day] = dateMatch;
		return new Date(Number(year), Number(month) - 1, Number(day));
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return new Date();
	}

	return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function toDateOnlyKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function clampDateToMax(target: Date, max: Date): Date {
	return target.getTime() > max.getTime() ? new Date(max) : new Date(target);
}

function clampRangeToMax(range: DateRange | undefined, maxDate: Date): DateRange | undefined {
	if (!range) return range;

	return {
		from: range.from ? clampDateToMax(range.from, maxDate) : range.from,
		to: range.to ? clampDateToMax(range.to, maxDate) : range.to,
	};
}

function parseDurationToMinutes(value?: string | null): number {
	if (!value) return 0;
	const normalized = String(value).trim();
	if (!normalized || normalized === "0:00" || normalized === "0h 0m") return 0;

	const hhmm = normalized.match(/^(\d+):(\d{1,2})$/);
	if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);

	const verbose = normalized.match(/^(\d+)h\s*(\d+)m$/i);
	if (verbose) return Number(verbose[1]) * 60 + Number(verbose[2]);

	return 0;
}

export function AttendanceManagement({
	title = "Attendance",
	description = "Manage and import attendance records",
}: AttendanceManagementProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const importAttendanceMutation = useImportAttendance();
	const { user } = useAuth();
	const { socket, isConnected } = useSocket();
	const organizationId = user?.organizationId || user?.person?.organizationId || null;
	const showAttendanceTrend = user?.role === "hris-hr-manager";

	// Progress tracking state
	const [importJobId, setImportJobId] = useState<string | null>(null);
	const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
	const [fixAttendanceRecord, setFixAttendanceRecord] = useState<AttendanceRecord | null>(null);
	const [enablePeopleFilterData, setEnablePeopleFilterData] = useState(true);
	const [enablePeriodOptions, setEnablePeriodOptions] = useState(false);
	const [collapsedOverviewDepartments, setCollapsedOverviewDepartments] = useState<Set<string>>(
		() => new Set(),
	);
	const { progress, isPolling } = useAttendanceImportProgress(
		importJobId,
		!!importJobId, // Enable polling when we have a jobId
	);

	// Deep-linking state (used for Import modal)
	const action = searchParams.get("action");

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const openImport = () => {
		updateSearchParams((next) => next.set("action", "import"));
	};

	const handleDownloadTemplate = () => {
		// Generate last 7 days of sample data
		const rows = ["EMPLOYEE_ID,DATE,TIME_IN,TIME_OUT,STATUS,NOTES"];
		const today = new Date();

		// Generate 7 days of attendance (today - 7 to today - 1)
		for (let i = 7; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			const dateStr = toDateOnlyKey(date);

			// Vary the entries a bit for better example
			if (i === 6) {
				// One day with slight late arrival
				rows.push(`EMP-SW-DEV-001,${dateStr},08:15,17:05,PRESENT,Slightly late`);
			} else {
				// Normal attendance
				rows.push(`EMP-SW-DEV-001,${dateStr},08:00,17:00,PRESENT,`);
			}
		}

		const template = rows.join("\n") + "\n";
		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "attendance-template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const handleImport = async (file: File, options?: { createTimesheets?: boolean }) => {
		try {
			const data = await importAttendanceMutation.mutateAsync({ file, options });

			// New async format - returns jobId
			if (data?.jobId) {
				setImportJobId(data.jobId);
				// Don't close the modal - keep it open to show progress
				// Don't open separate progress modal - show inline
				return data;
			}

			// If no jobId, something went wrong
			toast.error("Import failed to start");
			throw new Error("No jobId returned from import");
		} catch (error: any) {
			toast.error(error?.message || "Failed to import attendance.");
			throw error;
		}
	};

	// Handle when import completes
	useEffect(() => {
		if (progress?.status === "completed") {
			// Invalidate queries to refresh data
			queryClient.invalidateQueries({ queryKey: timesheetQueryKeys.timesheets.all });
			queryClient.invalidateQueries({ queryKey: timesheetlineQueryKeys.timesheetlines.all });
			toast.success(
				`Import completed: ${progress.success} succeeded, ${progress.failed} failed`,
			);
		}
	}, [progress?.status, progress?.success, progress?.failed, queryClient]);

	const todayStr = useMemo(() => getDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE), []);

	const today = useMemo(() => parseDateOnly(todayStr), [todayStr]);
	const customFromParam = searchParams.get("from") || "";
	const customToParam = searchParams.get("to") || "";
	const hasCustomDateParams = Boolean(customFromParam || customToParam);

	const [dateRangeObj, setDateRangeObj] = useState<DateRange | undefined>({
		from: customFromParam ? parseDateOnly(customFromParam) : today,
		to: customToParam
			? parseDateOnly(customToParam)
			: customFromParam
				? parseDateOnly(customFromParam)
				: today,
	});

	const selectedRangeFrom = dateRangeObj?.from || today;
	const selectedRangeTo = dateRangeObj?.to || selectedRangeFrom;
	const selectedDateRange = {
		from: toDateOnlyKey(selectedRangeFrom),
		to: toDateOnlyKey(selectedRangeTo),
	};

	// Get status filter and pagination from URL
	const explicitViewMode = searchParams.get("view");
	const statusFilter = searchParams.get("status") || undefined;
	const parsedPageParam = Number(searchParams.get("page"));
	const parsedLimitParam = Number(searchParams.get("limit"));
	const pageParam =
		Number.isFinite(parsedPageParam) && parsedPageParam > 0 ? Math.floor(parsedPageParam) : 1;
	const limitParam =
		Number.isFinite(parsedLimitParam) && parsedLimitParam > 0
			? Math.floor(parsedLimitParam)
			: 10;
	const searchParam = searchParams.get("search") || "";

	// Search state with debounce
	const [searchQuery, setSearchQuery] = useState(searchParam);
	const [debouncedSearch, setDebouncedSearch] = useState(searchParam);
	// Get filters from URL
	const selectedDepartment = searchParams.get("department") || "all";
	const selectedSection = searchParams.get("section") || "all";
	const selectedPosition = searchParams.get("position") || "all";
	const selectedLevel = searchParams.get("level") || "all";
	const presentGt10Days = searchParams.get("presentGt10Days") === "1";

	const setPresentGt10Days = (enabled: boolean) => {
		updateSearchParams((next) => {
			if (enabled) next.set("presentGt10Days", "1");
			else next.delete("presentGt10Days");
			next.delete("page");
		});
	};
	const selectedManager = searchParams.get("manager") || "all";
	const selectedEmployee = searchParams.get("employee") || "all";
	const selectedShiftType = searchParams.get("shiftType") || "all";
	const selectedPeriodCodeFromUrl = searchParams.get("periodCode") || "";
	const selectedPeriodFromUrl =
		searchParams.get("period") ||
		selectedPeriodCodeFromUrl ||
		(hasCustomDateParams ? "custom" : "today");
	const hasListDeepLink =
		explicitViewMode === "list" ||
		Boolean(statusFilter) ||
		Boolean(searchParam) ||
		selectedDepartment !== "all" ||
		selectedSection !== "all" ||
		selectedPosition !== "all" ||
		selectedLevel !== "all" ||
		selectedManager !== "all" ||
		selectedEmployee !== "all" ||
		selectedShiftType !== "all";
	const viewMode = hasListDeepLink ? "list" : "overview";

	useEffect(() => {
		if (
			viewMode === "overview" ||
			viewMode === "list" ||
			selectedDepartment !== "all" ||
			selectedSection !== "all" ||
			selectedPosition !== "all" ||
			selectedLevel !== "all" ||
			selectedManager !== "all" ||
			selectedEmployee !== "all"
		) {
			setEnablePeopleFilterData(true);
		}
	}, [
		selectedDepartment,
		selectedSection,
		selectedPosition,
		selectedLevel,
		selectedManager,
		selectedEmployee,
		viewMode,
	]);

	useEffect(() => {
		if (selectedPeriodFromUrl !== "today" && selectedPeriodFromUrl !== "active") {
			setEnablePeriodOptions(true);
		}
	}, [selectedPeriodFromUrl]);

	// Fetch departments for filter
	const { data: departmentsData } = useDepartments(
		{ limit: 1000 },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const departments = departmentsData?.departments || [];

	const { data: sectionsData } = useSections(
		{ page: 1, limit: 1000, sort: "name", order: "asc" },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const sections = useMemo(
		() => ((sectionsData as any)?.sections || (sectionsData as any)?.data?.sections || []) as any[],
		[sectionsData],
	);

	const { data: positionsData } = usePositions(
		{ page: 1, limit: 1000, sort: "title", order: "asc" },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const positions = useMemo(
		() => ((positionsData as any)?.positions || (positionsData as any)?.data?.positions || []) as any[],
		[positionsData],
	);

	const { data: levelsData } = useLevels(
		{ page: 1, limit: 1000, sort: "rank", order: "asc" },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const levels = useMemo(
		() => ((levelsData as any)?.levels || (levelsData as any)?.data?.levels || []) as any[],
		[levelsData],
	);

	// Fetch all employees for filters (used for both Manager and Employee dropdowns)
	const { data: employeesData } = useEmployees(
		{ limit: 1000 },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const allEmployees = Array.isArray(employeesData?.data)
		? employeesData?.data
		: (employeesData as any)?.data?.employees ||
			employeesData?.employees ||
			employeesData?.employees ||
			[];

	// Match timesheets: manager dropdown is sourced from employees with direct reports.
	const { data: managersData } = useEmployees(
		{ page: 1, limit: 100, filter: "directReports:exists" },
		{ enabled: enablePeopleFilterData || viewMode === "overview" },
	);
	const managerEmployees = Array.isArray((managersData as any)?.data)
		? (managersData as any)?.data
		: (managersData as any)?.data?.employees || (managersData as any)?.employees || [];

	// Fetch Payroll/Timesheet Periods for filter

	const currentPeriodParams = useMemo(
		() => ({
			filter: `startDate<=${todayStr},endDate>=${todayStr}`,
			sort: "startDate",
			order: "desc" as const,
			limit: 1,
			aggregateBy: "attendanceObligations,timesheets",
		}),
		[todayStr],
	);

	const { data: currentPeriodData } = usePayrollPeriods(currentPeriodParams, true);
	const currentPeriod = getPayrollPeriodsFromResponse(currentPeriodData)?.[0];

	const attendancePeriodWindowParams = useMemo(
		() => ({
			filter: `startDate<=${todayStr}`,
			sort: "startDate",
			order: "desc" as const,
			limit: 12,
			aggregateBy: "attendanceObligations,timesheets",
		}),
		[todayStr],
	);

	const { data: attendancePeriodWindowData } = usePayrollPeriods(
		attendancePeriodWindowParams,
		true,
	);
	const attendancePeriodWindow = useMemo(
		() => getPayrollPeriodsFromResponse(attendancePeriodWindowData),
		[attendancePeriodWindowData],
	);
	const attendanceSelectablePeriods = useMemo(() => {
		const availablePeriods = [currentPeriod, ...attendancePeriodWindow].filter(
			(period: any) => {
				if (!period) return false;
				return parseDateOnly(period.startDate).getTime() <= today.getTime();
			},
		);

		return availablePeriods.map((period: any) => ({
			start: parseDateOnly(period.startDate),
			end: parseDateOnly(period.endDate),
		}));
	}, [attendancePeriodWindow, currentPeriod, today]);

	const attendanceSelectableMaxDate = useMemo(() => {
		const maxPeriodEnd = attendanceSelectablePeriods.reduce<Date | null>((latest, period) => {
			if (!latest || period.end.getTime() > latest.getTime()) return period.end;
			return latest;
		}, null);

		return maxPeriodEnd && maxPeriodEnd.getTime() > today.getTime() ? maxPeriodEnd : today;
	}, [attendanceSelectablePeriods, today]);

	const isAttendanceDateDisabled = (date: Date) => {
		const day = parseDateOnly(date);
		if (day.getTime() <= today.getTime()) return false;

		return !attendanceSelectablePeriods.some(
			(period) =>
				day.getTime() >= period.start.getTime() && day.getTime() <= period.end.getTime(),
		);
	};

	const pastPeriodsParams = useMemo(
		() => ({
			filter: `endDate<${todayStr}`,
			sort: "startDate",
			order: "desc" as const,
			limit: 20,
			aggregateBy: "attendanceObligations,timesheets",
		}),
		[todayStr],
	);

	const { data: pastPeriodsData } = usePayrollPeriods(
		pastPeriodsParams,
		enablePeriodOptions ||
			(selectedPeriodFromUrl !== "today" && selectedPeriodFromUrl !== "active"),
	);
	const pastPeriods = getPayrollPeriodsFromResponse(pastPeriodsData);
	const payrollPeriodOptions = useMemo(() => {
		const byKey = new Map<string, any>();
		[currentPeriod, ...attendancePeriodWindow, ...pastPeriods].forEach((period: any) => {
			if (!period) return;
			if (parseDateOnly(period.startDate).getTime() > today.getTime()) return;
			const key = period.id || period.code;
			if (!key || byKey.has(key)) return;
			byKey.set(key, period);
		});
		return Array.from(byKey.values()).sort((left: any, right: any) => {
			const leftStart = parseDateOnly(left.startDate).getTime();
			const rightStart = parseDateOnly(right.startDate).getTime();
			if (leftStart !== rightStart) return rightStart - leftStart;
			const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
			const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
			return rightUpdated - leftUpdated;
		});
	}, [attendancePeriodWindow, currentPeriod, pastPeriods, today]);

	const [selectedPeriod, setSelectedPeriod] = useState<string>(selectedPeriodFromUrl);
	const selectedPayrollPeriod = useMemo(() => {
		if (selectedPeriod === "today" || selectedPeriod === "active" || selectedPeriod === "custom") {
			return null;
		}
		return (
			payrollPeriodOptions.find(
				(period: any) =>
					period.id === selectedPeriod ||
					period.code === selectedPeriod ||
					(selectedPeriodCodeFromUrl && period.code === selectedPeriodCodeFromUrl),
			) || null
		);
	}, [payrollPeriodOptions, selectedPeriod, selectedPeriodCodeFromUrl]);
	const selectedPeriodValue = selectedPayrollPeriod?.id || selectedPeriod;
	const metricsDateRange = useMemo(() => {
		if (selectedPeriod === "active" && currentPeriod) {
			return {
				from: toDateOnlyKey(parseDateOnly(currentPeriod.startDate)),
				to: toDateOnlyKey(parseDateOnly(currentPeriod.endDate)),
			};
		}

		if (
			selectedPeriod !== "today" &&
			selectedPeriod !== "custom" &&
			selectedPayrollPeriod
		) {
			return {
				from: toDateOnlyKey(parseDateOnly(selectedPayrollPeriod.startDate)),
				to: toDateOnlyKey(parseDateOnly(selectedPayrollPeriod.endDate)),
			};
		}

		return selectedDateRange;
	}, [
		currentPeriod,
		selectedDateRange.from,
		selectedDateRange.to,
		selectedPayrollPeriod,
		selectedPeriod,
	]);
	// The daily trend chart needs multiple days to plot a line; widen a single-day
	// selection to a trailing 7-day window instead of changing the page-wide range.
	const trendDateRange = useMemo(() => {
		if (metricsDateRange.from !== metricsDateRange.to) {
			return metricsDateRange;
		}

		const to = parseDateOnly(metricsDateRange.to);
		const from = new Date(to);
		from.setDate(from.getDate() - 6);

		return { from: toDateOnlyKey(from), to: metricsDateRange.to };
	}, [metricsDateRange]);

	const trendPeriodLabel = useMemo(() => {
		if (selectedPeriod === "today") return "Today";
		if (selectedPeriod === "active") return "Active Timesheet";
		if (selectedPeriod === "custom") return "Custom Range";
		return selectedPayrollPeriod?.name || selectedPayrollPeriod?.code || "Selected Period";
	}, [selectedPayrollPeriod, selectedPeriod]);

	const isTrendWindowWidened = metricsDateRange.from === metricsDateRange.to && trendDateRange.from !== trendDateRange.to;
	const trendTitle = isTrendWindowWidened
		? "Last 7 Days Trend by Department"
		: `${trendPeriodLabel} Trend by Department`;
	const trendDescription = `${formatDate(trendDateRange.from, "short")} to ${formatDate(trendDateRange.to, "short")}`;

	const dateFilterTriggerLabel = useMemo(() => {
		const fromLabel = formatDate(selectedDateRange.from, "short");
		const toLabel = formatDate(selectedDateRange.to, "short");
		const rangeLabel = fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
		return `${trendPeriodLabel} · ${rangeLabel}`;
	}, [trendPeriodLabel, selectedDateRange.from, selectedDateRange.to]);

	const datePresetOptions = useMemo(() => {
		const options: AttendanceDatePresetOption[] = [
			{ value: "today", label: "Today" },
			{
				value: "active",
				label: `Active Timesheet${
					currentPeriod
						? ` (${formatDate(currentPeriod.startDate, "short")} - ${formatDate(currentPeriod.endDate, "short")})`
						: ""
				}`,
			},
		];
		payrollPeriodOptions
			.filter(
				(period: any) =>
					period.id === selectedPayrollPeriod?.id ||
					period.code === selectedPeriodCodeFromUrl ||
					(period.id !== currentPeriod?.id && period.code !== currentPeriod?.code),
			)
			.forEach((period: any) => {
				options.push({ value: period.id, label: formatPayrollPeriodOption(period) });
			});
		return options;
	}, [
		currentPeriod,
		payrollPeriodOptions,
		selectedPayrollPeriod,
		selectedPeriodCodeFromUrl,
	]);

	// Keep local period state in sync with URL deep-linking
	useEffect(() => {
		if (selectedPeriod !== selectedPeriodFromUrl) {
			setSelectedPeriod(selectedPeriodFromUrl);
		}
	}, [selectedPeriod, selectedPeriodFromUrl]);

	useEffect(() => {
		if (selectedPeriodFromUrl !== "custom" || !hasCustomDateParams) return;

		const from = parseDateOnly(customFromParam || customToParam);
		const to = parseDateOnly(customToParam || customFromParam);
		const nextRange = clampRangeToMax({ from, to }, attendanceSelectableMaxDate);
		const currentFrom = dateRangeObj?.from?.getTime();
		const currentTo = dateRangeObj?.to?.getTime();
		const nextFrom = nextRange?.from?.getTime();
		const nextTo = nextRange?.to?.getTime();

		if (currentFrom !== nextFrom || currentTo !== nextTo) {
			setDateRangeObj(nextRange);
		}
	}, [
		selectedPeriodFromUrl,
		hasCustomDateParams,
		customFromParam,
		customToParam,
		attendanceSelectableMaxDate,
		dateRangeObj,
	]);

	const setCustomRange = (range: DateRange | undefined) => {
		const nextRange = clampRangeToMax(range, attendanceSelectableMaxDate);
		setSelectedPeriod("custom");
		setDateRangeObj(nextRange);
		updateSearchParams((params) => {
			params.set("period", "custom");
			if (nextRange?.from) {
				params.set("from", toDateOnlyKey(nextRange.from));
				params.set("to", toDateOnlyKey(nextRange.to || nextRange.from));
			} else {
				params.delete("from");
				params.delete("to");
			}
			params.set("page", "1");
		});
	};

	// Sync date range when period changes or loads
	useEffect(() => {
		const checkAndSet = (start: Date, end: Date) => {
			const nextRange = clampRangeToMax(
				{ from: start, to: end },
				attendanceSelectableMaxDate,
			);
			const currentFrom = dateRangeObj?.from?.getTime();
			const currentTo = dateRangeObj?.to?.getTime();
			const newFrom = nextRange?.from?.getTime();
			const newTo = nextRange?.to?.getTime();

			if (currentFrom !== newFrom || currentTo !== newTo) {
				setDateRangeObj(nextRange);
			}
		};

		if (selectedPeriod === "today") {
			checkAndSet(today, today);
		} else if (selectedPeriod === "active" && currentPeriod) {
			checkAndSet(
				parseDateOnly(currentPeriod.startDate),
				parseDateOnly(currentPeriod.endDate),
			);
		} else if (selectedPeriod !== "active" && selectedPeriod !== "custom") {
			if (selectedPayrollPeriod) {
				checkAndSet(
					parseDateOnly(selectedPayrollPeriod.startDate),
					parseDateOnly(selectedPayrollPeriod.endDate),
				);
			}
		}
	}, [
		selectedPeriod,
		currentPeriod,
		payrollPeriodOptions,
		selectedPayrollPeriod,
		dateRangeObj,
		today,
		attendanceSelectableMaxDate,
	]);

	const handlePeriodChange = (value: string) => {
		if (value !== "today" && value !== "active" && value !== "custom") {
			const period = payrollPeriodOptions.find(
				(item: any) => item.id === value || item.code === value,
			);

			setSelectedPeriod(period?.id || value);
			if (period) {
				setDateRangeObj({
					from: parseDateOnly(period.startDate),
					to: parseDateOnly(period.endDate),
				});
			}
			updateSearchParams((params) => {
				params.set("period", period?.id || value);
				if (period?.code) {
					params.set("periodCode", period.code);
				} else {
					params.delete("periodCode");
				}
				params.delete("from");
				params.delete("to");
				params.set("page", "1");
			});
			return;
		}

		setSelectedPeriod(value);
		updateSearchParams((params) => {
			if (value === "today") {
				params.delete("period");
			} else {
				params.set("period", value);
			}
			params.delete("periodCode");
			params.delete("from");
			params.delete("to");
			params.set("page", "1");
		});
	};

	const handleCustomDateChange = (range: DateRange | undefined) => {
		setCustomRange(range);
	};

	// Filtered managers based on selected department
	const filteredManagers = useMemo(() => {
		if (selectedDepartment === "all") return managerEmployees;
		return managerEmployees.filter((emp: any) => emp.department?.id === selectedDepartment);
	}, [managerEmployees, selectedDepartment]);

	const filteredSections = useMemo(() => {
		const scopedSections = sections.filter((section: any) => {
			if (selectedDepartment === "all") return true;
			return section.departmentId === selectedDepartment;
		});

		if (
			selectedSection !== "all" &&
			!scopedSections.some((section: any) => section.id === selectedSection)
		) {
			const selectedSectionRecord = sections.find((section: any) => section.id === selectedSection);
			if (selectedSectionRecord) scopedSections.unshift(selectedSectionRecord);
		}

		return scopedSections;
	}, [sections, selectedDepartment, selectedSection]);

	const filteredPositions = useMemo(() => {
		const scopedPositions = positions.filter((position: any) => {
			const positionSectionId = String(position.sectionId || position.section?.id || "");
			const positionDepartmentId = String(
				position.section?.departmentId || position.section?.department?.id || "",
			);
			if (selectedSection !== "all") {
				return positionSectionId === selectedSection;
			}
			if (selectedDepartment !== "all") {
				return positionDepartmentId === selectedDepartment;
			}
			return true;
		});

		if (
			selectedPosition !== "all" &&
			!scopedPositions.some((position: any) => position.id === selectedPosition)
		) {
			const selectedPositionRecord = positions.find(
				(position: any) => position.id === selectedPosition,
			);
			if (selectedPositionRecord) scopedPositions.unshift(selectedPositionRecord);
		}

		return scopedPositions;
	}, [positions, selectedDepartment, selectedPosition, selectedSection]);

	const selectedPositionRecord = useMemo(
		() => positions.find((position: any) => position.id === selectedPosition) || null,
		[positions, selectedPosition],
	);
	const selectedLevelRecord = useMemo(
		() => levels.find((level: any) => level.id === selectedLevel) || null,
		[levels, selectedLevel],
	);

	const filteredLevels = useMemo(() => {
		const levelById = new Map<string, any>();
		const scopedPositions =
			selectedPosition !== "all"
				? selectedPositionRecord
					? [selectedPositionRecord]
					: []
				: filteredPositions;

		scopedPositions.forEach((position: any) => {
			(Array.isArray(position.levels) ? position.levels : []).forEach((entry: any) => {
				const levelId = String(entry?.level?.id || entry?.levelId || entry?.id || "").trim();
				if (!levelId || levelById.has(levelId)) return;
				const levelRecord =
					levels.find((level: any) => level.id === levelId) ||
					entry?.level ||
					(entry?.id ? entry : null);
				if (levelRecord) {
					levelById.set(levelId, levelRecord);
				}
			});
		});

		const scopedLevels = Array.from(levelById.values()).sort((left, right) => {
			const leftRank = Number(left.rank ?? left.level?.rank ?? 0);
			const rightRank = Number(right.rank ?? right.level?.rank ?? 0);
			if (leftRank !== rightRank) return leftRank - rightRank;
			const leftName = String(left.name || left.level?.name || "");
			const rightName = String(right.name || right.level?.name || "");
			return leftName.localeCompare(rightName);
		});

		if (
			selectedLevel !== "all" &&
			!scopedLevels.some((level: any) => level.id === selectedLevel)
		) {
			if (selectedLevelRecord) scopedLevels.unshift(selectedLevelRecord);
		}

		return scopedLevels;
	}, [
		filteredPositions,
		levels,
		selectedLevel,
		selectedLevelRecord,
		selectedPosition,
		selectedPositionRecord,
	]);

	// Filtered employees based on selected department and manager
	const filteredEmployees = useMemo(() => {
		let result = allEmployees;

		// Filter by department
		if (selectedDepartment !== "all") {
			result = result.filter((emp: any) => emp.department?.id === selectedDepartment);
		}

		// Filter by manager (reportTo)
		if (selectedManager !== "all") {
			result = result.filter((emp: any) => emp.reportTo?.id === selectedManager);
		}

		return result;
	}, [allEmployees, selectedDepartment, selectedManager]);
	const employeeFilterOptions = useMemo(() => {
		const options = [...filteredEmployees];
		if (selectedEmployee === "all") return options;
		const selectedEmployeeRecord = allEmployees.find((emp: any) => emp.id === selectedEmployee);
		if (selectedEmployeeRecord && !options.some((emp: any) => emp.id === selectedEmployee)) {
			options.unshift(selectedEmployeeRecord);
		}
		if (!selectedEmployeeRecord && !options.some((emp: any) => emp.id === selectedEmployee)) {
			options.unshift({ id: selectedEmployee, employeeId: selectedEmployee, person: null });
		}
		return options;
	}, [allEmployees, filteredEmployees, selectedEmployee]);

	useEffect(() => {
		const timer = setTimeout(() => {
			const normalizedSearch = searchQuery.trim();
			setDebouncedSearch(normalizedSearch);
			if (normalizedSearch === searchParam) {
				return;
			}
			updateSearchParams((next) => {
				if (normalizedSearch) {
					next.set("search", normalizedSearch);
				} else {
					next.delete("search");
				}
				next.set("page", "1");
			});
		}, 500);
		return () => clearTimeout(timer);
	}, [searchQuery, searchParam]);

	// Handlers for filter changes with deep linking and cascading resets
	const handleShiftTypeChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("shiftType");
			} else {
				params.set("shiftType", value);
			}
			params.set("page", "1");
		});
	};

	const handleDepartmentFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("department");
			} else {
				params.set("department", value);
			}
			params.delete("manager");
			params.delete("employee");
			params.delete("section");
			params.delete("position");
			params.delete("level");
			params.set("page", "1");
		});
	};

	const handleSectionFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("section");
			} else {
				params.set("section", value);
			}
			params.delete("position");
			params.delete("level");
			params.set("page", "1");
		});
	};

	const handlePositionFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("position");
			} else {
				params.set("position", value);
			}
			params.delete("level");
			params.set("page", "1");
		});
	};

	const handleLevelFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("level");
			} else {
				params.set("level", value);
			}
			params.set("page", "1");
		});
	};

	const handleStatusFilterChange = (value: string) => {
		const nextStatus = value === "all" ? undefined : value;
		updateSearchParams((params) => {
			if (nextStatus) {
				params.set("status", nextStatus);
			} else {
				params.delete("status");
			}
			params.set("view", "list");
			params.set("page", "1");
		});
	};

	const clearScopeAndShiftFilters = () => {
		updateSearchParams((params) => {
			params.delete("department");
			params.delete("section");
			params.delete("position");
			params.delete("level");
			params.delete("shiftType");
			params.delete("presentGt10Days");
			params.set("page", "1");
		});
	};

	const clearAllTableFilters = () => {
		setSearchQuery("");
		updateSearchParams((params) => {
			params.delete("department");
			params.delete("section");
			params.delete("position");
			params.delete("level");
			params.delete("manager");
			params.delete("employee");
			params.delete("shiftType");
			params.delete("status");
			params.delete("search");
			params.set("page", "1");
		});
	};

	const handleAdvancedFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((params) => {
			const managerChanged =
				filters.manager !== undefined && filters.manager !== selectedManager;
			const nextManager = filters.manager || "";
			if (nextManager && nextManager !== "all") {
				params.set("manager", nextManager);
			} else {
				params.delete("manager");
			}
			if (managerChanged) {
				params.delete("employee");
			}

			const nextEmployee = managerChanged ? "" : filters.employee || "";
			if (nextEmployee && nextEmployee !== "all") {
				params.set("employee", nextEmployee);
			} else {
				params.delete("employee");
			}

			params.set("page", "1");
		});
	};

	useEffect(() => {
		if (!socket || !isConnected || !organizationId) return;

		const roomPayload = { organizationId };
		const handleAttendanceEvent = () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.metrics.all });
		};

		socket.emit("join:attendance", roomPayload);
		socket.on("attendance:event", handleAttendanceEvent);

		return () => {
			socket.off("attendance:event", handleAttendanceEvent);
			socket.emit("leave:attendance", roomPayload);
		};
	}, [socket, isConnected, organizationId, queryClient]);

	const isTodayMode = metricsDateRange.from === todayStr && metricsDateRange.to === todayStr;
	const isPeriodDateRangeReady =
		selectedPeriod === "today" ||
		selectedPeriod === "custom" ||
		(selectedPeriod === "active" && Boolean(currentPeriod)) ||
		(selectedPeriod !== "active" &&
			selectedPeriod !== "custom" &&
			Boolean(selectedPayrollPeriod));
	const todayRefreshInterval = isTodayMode ? 15_000 : false;

	const departmentFilter = selectedDepartment !== "all" ? selectedDepartment : undefined;
	const sectionFilter = selectedSection !== "all" ? selectedSection : undefined;
	const positionFilter = selectedPosition !== "all" ? selectedPosition : undefined;
	const levelFilter = selectedLevel !== "all" ? selectedLevel : undefined;
	const managerFilter = selectedManager !== "all" ? selectedManager : undefined;
	const employeeFilter = selectedEmployee !== "all" ? selectedEmployee : undefined;
	const shiftTypeFilter = selectedShiftType !== "all" ? selectedShiftType : undefined;
	const limitForFetch = presentGt10Days ? 10000 : limitParam;
	const { data: attendanceRowsData, isLoading: isLoadingTimesheets } =
		useAttendanceMetricsDetailed(
			metricsDateRange.from,
			metricsDateRange.to,
			limitForFetch,
			pageParam,
			debouncedSearch,
			statusFilter,
			departmentFilter,
			sectionFilter,
			positionFilter,
			levelFilter,
			managerFilter,
			employeeFilter,
			shiftTypeFilter,
			{
				enabled: isPeriodDateRangeReady && viewMode === "list",
				refetchInterval: todayRefreshInterval,
			},
		);
	const { data: attendanceMetricsSummaryData, isLoading: isLoadingAttendanceMetricsSummary } =
		useAttendanceMetricsDetailed(
			metricsDateRange.from,
			metricsDateRange.to,
			1,
			1,
			debouncedSearch,
			undefined,
			departmentFilter,
			sectionFilter,
			positionFilter,
			levelFilter,
			managerFilter,
			employeeFilter,
			shiftTypeFilter,
			{
				enabled: isPeriodDateRangeReady && viewMode === "list",
				refetchInterval: todayRefreshInterval,
			},
		);
	const { data: attendanceOverviewData, isLoading: isLoadingAttendanceOverview } =
		useAttendanceMetricsDetailed(
			metricsDateRange.from,
			metricsDateRange.to,
			1,
			1,
			debouncedSearch,
			undefined,
			departmentFilter,
			sectionFilter,
			positionFilter,
			levelFilter,
			managerFilter,
			employeeFilter,
			shiftTypeFilter,
			{
				enabled: isPeriodDateRangeReady && viewMode === "overview",
				refetchInterval: todayRefreshInterval,
			},
		);
	const leaveBalanceFilter = useMemo(
		() => ({
			...(departmentFilter ? { departmentId: departmentFilter } : {}),
			...(sectionFilter ? { sectionId: sectionFilter } : {}),
			...(positionFilter ? { positionId: positionFilter } : {}),
			...(levelFilter ? { levelId: levelFilter } : {}),
			...(managerFilter ? { reportToId: managerFilter } : {}),
			...(employeeFilter ? { employeeId: employeeFilter } : {}),
			periodFrom: metricsDateRange.from,
			periodTo: metricsDateRange.to,
		}),
		[
			departmentFilter,
			sectionFilter,
			positionFilter,
			levelFilter,
			managerFilter,
			employeeFilter,
			metricsDateRange.from,
			metricsDateRange.to,
		],
	);
	const { data: leaveBalanceData, isLoading: isLoadingLeaveBalances } =
		useLeaveBalanceMetrics(leaveBalanceFilter, { enabled: isPeriodDateRangeReady });

	const attendanceRowsPayload = attendanceRowsData?.metrics?.attendanceObligationDetailed || null;
	const attendanceMetricsSummaryPayload =
		attendanceMetricsSummaryData?.metrics?.attendanceObligationDetailed || null;
	const attendanceOverviewPayload =
		attendanceOverviewData?.metrics?.attendanceObligationDetailed || null;
	const activeAttendancePayload =
		viewMode === "list" ? attendanceMetricsSummaryPayload : attendanceOverviewPayload;
	const displayedMetricsPayload = activeAttendancePayload?.metrics || null;
	const shiftOptionsPayload = useMemo(
		() => activeAttendancePayload?.metrics?.shiftTypeBreakdown || [],
		[activeAttendancePayload?.metrics?.shiftTypeBreakdown],
	);
	const shiftTypeOptions = useMemo(() => {
		const options = shiftOptionsPayload
			.filter((item) => item.shiftType)
			.map((item) => ({
				value: item.shiftType,
				label: item.label || item.shiftType,
				total: item.total,
			}));
		if (
			selectedShiftType !== "all" &&
			!options.some((option) => option.value === selectedShiftType)
		) {
			options.unshift({ value: selectedShiftType, label: selectedShiftType, total: 0 });
		}
		return options;
	}, [selectedShiftType, shiftOptionsPayload]);
	const leaveBalancePayload = leaveBalanceData?.metrics?.leaveBalanceMetrics || null;
	const rawRecords = attendanceRowsPayload?.records || [];
	const records = useMemo(() => {
		if (!presentGt10Days) return rawRecords;
		const thresholdFiltered = filterAttendanceRecordsByPresentDayThreshold(rawRecords);
		const start = (pageParam - 1) * limitParam;
		return thresholdFiltered.slice(start, start + limitParam);
	}, [rawRecords, presentGt10Days, pageParam, limitParam]);
	const overviewRecords = useMemo(
		() => attendanceOverviewPayload?.records || [],
		[attendanceOverviewPayload?.records],
	);
	const departmentPreviewRows = useMemo(
		() => attendanceOverviewPayload?.departmentPreviewRows || [],
		[attendanceOverviewPayload?.departmentPreviewRows],
	);
	const departmentBreakdown = useMemo(
		() => attendanceOverviewPayload?.departmentBreakdown || [],
		[attendanceOverviewPayload?.departmentBreakdown],
	);
	const allTimesheetRecords = records;
	const leaveBalanceRows = useMemo(
		() =>
			(leaveBalancePayload?.employees || []).flatMap((employee) =>
				employee.leaveBalances.map((balance) => ({
					employeeId: employee.employeeId,
					leaveType: balance.leaveType,
					totalEntitled: Number(balance.totalEntitled || 0),
					used: Number(balance.used || 0),
					pending: Number(balance.pending || 0),
					available: Number(balance.available || 0),
				})),
			),
		[leaveBalancePayload?.employees],
	);
	const leaveBalanceTotals = useMemo(
		() =>
			leaveBalanceRows.reduce(
				(totals, row) => ({
					entitled: totals.entitled + row.totalEntitled,
					used: totals.used + row.used,
					pending: totals.pending + row.pending,
					available: totals.available + row.available,
				}),
				{ entitled: 0, used: 0, pending: 0, available: 0 },
			),
		[leaveBalanceRows],
	);
	const leaveBalanceMeasuredTotal =
		leaveBalanceTotals.entitled || leaveBalanceTotals.available + leaveBalanceTotals.used;
	const leaveBalanceAvailableRate =
		leaveBalanceMeasuredTotal > 0
			? Math.round((leaveBalanceTotals.available / leaveBalanceMeasuredTotal) * 100)
			: 0;
	const leaveBalanceTypeRows = useMemo(() => {
		const rows = new Map<
			string,
			{
				leaveType: string;
				totalEntitled: number;
				used: number;
				available: number;
				pending: number;
			}
		>();

		for (const row of leaveBalanceRows) {
			const key = row.leaveType || "UNKNOWN";
			const existing = rows.get(key) || {
				leaveType: key,
				totalEntitled: 0,
				used: 0,
				available: 0,
				pending: 0,
			};
			rows.set(key, {
				...existing,
				totalEntitled: existing.totalEntitled + row.totalEntitled,
				used: existing.used + row.used,
				available: existing.available + row.available,
				pending: existing.pending + row.pending,
			});
		}

		const order = ["SICK", "VACATION", "PERSONAL"];
		return Array.from(rows.values()).sort((a, b) => {
			const aIndex = order.indexOf(a.leaveType);
			const bIndex = order.indexOf(b.leaveType);
			if (aIndex !== -1 || bIndex !== -1) {
				return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
			}
			return a.leaveType.localeCompare(b.leaveType);
		});
	}, [leaveBalanceRows]);
	const getLeaveTypeCode = (leaveType: string) =>
		(
			({
				SICK: "SL",
				VACATION: "VL",
				PERSONAL: "PL",
			}) as Record<string, string>
		)[String(leaveType || "").toUpperCase()] ||
		String(leaveType || "LV")
			.split(/[\s_-]+/)
			.filter(Boolean)
			.map((part) => part[0])
			.join("")
			.slice(0, 3)
			.toUpperCase();
	const formatLeaveBalanceNumber = (value: number) =>
		value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	const getLeaveBalancePercent = (used: number, totalEntitled: number) =>
		totalEntitled > 0 ? Math.min(100, Math.round((used / totalEntitled) * 100)) : 0;
	const getLeaveTypeColor = (leaveType: string) =>
		(
			({
				SICK: "#06b6d4",
				VACATION: "#8b5cf6",
				PERSONAL: "#f97316",
			}) as Record<string, string>
		)[String(leaveType || "").toUpperCase()] || "#64748b";
	const getPeriodLeaveUsed = (leaveType: string) => {
		const normalized = String(leaveType || "")
			.trim()
			.toUpperCase();
		return (
			(leaveTypeBreakdown || []).find(
				(item) =>
					String(item.leaveType || "")
						.trim()
						.toUpperCase() === normalized,
			)?.total || 0
		);
	};
	const detailedMetrics = displayedMetricsPayload || {
		totalPresent: 0,
		totalAbsent: 0,
		totalNotClockedIn: 0,
		totalLate: 0,
		totalOnLeave: 0,
		totalRestDay: 0,
		totalHoliday: 0,
		totalClockedIn: 0,
		totalOnTime: 0,
		totalScheduledWorkDays: 0,
		totalCalendarDays: 0,
		totalCompanyEventDays: 0,
		totalEmployeesMissingSchedule: 0,
		totalClockedOut: 0,
		totalEarlyOut: 0,
		totalOvertime: 0,
		approvedOvertimeCount: 0,
		unapprovedOvertimeCount: 0,
		leaveTypeBreakdown: [],
		avgAttendanceRate: 0,
		utilizationRate: 0,
		totalMinutesWorked: 0,
		totalOvertimeMinutes: 0,
		totalUndertimeMinutes: 0,
		totalLateMinutes: 0,
	};

	const totalRecords = useMemo(() => {
		if (!presentGt10Days) return attendanceRowsPayload?.totalRecords || records.length;
		return filterAttendanceRecordsByPresentDayThreshold(rawRecords).length;
	}, [attendanceRowsPayload, presentGt10Days, rawRecords, records.length]);
	const hasActiveTableFilters =
		Boolean(debouncedSearch) ||
		Boolean(statusFilter) ||
		selectedDepartment !== "all" ||
		selectedSection !== "all" ||
		selectedPosition !== "all" ||
		selectedLevel !== "all" ||
		selectedManager !== "all" ||
		selectedEmployee !== "all" ||
		selectedShiftType !== "all" ||
		presentGt10Days;

	const renderClockValue = (
		value?: string | null,
		options: { isVirtual?: boolean; nextDay?: boolean } = {},
	) => {
		const isEmpty = !value;
		const muted = options.isVirtual || isEmpty;
		const parsedDate = value ? new Date(value) : null;
		const hasReadableDate = parsedDate && !Number.isNaN(parsedDate.getTime());
		const readableTime = hasReadableDate
			? new Intl.DateTimeFormat("en-US", {
					hour: "numeric",
					minute: "2-digit",
				}).format(parsedDate)
			: null;

		return (
			<span
				title={value || undefined}
				className={`inline-flex min-w-0 items-baseline whitespace-nowrap text-[15px] tabular-nums ${
					muted ? "font-medium italic text-gray-400" : "font-semibold text-slate-950"
				}`}>
				{readableTime || value || "-"}
				{value && options.nextDay && (
					<span className="ml-1 text-[11px] font-semibold not-italic text-gray-500">
						(+1)
					</span>
				)}
			</span>
		);
	};

	const isClockOutNextDay = (item: AttendanceRecord) => {
		if (item.timeOutNextDay) return true;
		if (!item.timeOut) return false;

		const clockOut = new Date(item.timeOut);
		if (Number.isNaN(clockOut.getTime())) return false;

		const baseDate = item.timeIn ? new Date(item.timeIn) : parseDateOnly(item.date);
		if (Number.isNaN(baseDate.getTime())) return false;

		const baseKey = getDateKeyInTimeZone(baseDate, BUSINESS_TIME_ZONE);
		const outKey = getDateKeyInTimeZone(clockOut, BUSINESS_TIME_ZONE);

		return Boolean(baseKey && outKey && outKey > baseKey);
	};

	const handleMetricFilter = (status: string) => {
		handleStatusFilterChange(statusFilter === status ? "all" : status);
	};

	// Pagination handlers
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const activeMetricKey = statusFilter;
	const isMetricActive = (status?: string) => Boolean(status && activeMetricKey === status);

	const getEmployeeProfileId = (record: AttendanceRecord): string | undefined => {
		if (record.employeeRefId) return record.employeeRefId;
		const byId = allEmployees.find((emp: any) => emp.id === record.employeeId);
		if (byId?.id) return byId.id;

		const byEmployeeCode = allEmployees.find(
			(emp: any) => emp.employeeId === record.employeeId,
		);
		if (byEmployeeCode?.id) return byEmployeeCode.id;

		const byName = allEmployees.find((emp: any) => {
			const firstName = emp.person?.personalInfo?.firstName || "";
			const lastName = emp.person?.personalInfo?.lastName || "";
			return `${firstName} ${lastName}`.trim() === record.employeeName;
		});
		return byName?.id;
	};

	const getEmployeeAvatar = (record: AttendanceRecord): string | null => {
		if (record.employeeRefId) {
			const byRefId = allEmployees.find((emp: any) => emp.id === record.employeeRefId);
			if (byRefId?.user?.avatar) return byRefId.user.avatar;
		}

		const byId = allEmployees.find((emp: any) => emp.id === record.employeeId);
		if (byId?.user?.avatar) return byId.user.avatar;

		const byEmployeeCode = allEmployees.find(
			(emp: any) => emp.employeeId === record.employeeId,
		);
		if (byEmployeeCode?.user?.avatar) return byEmployeeCode.user.avatar;

		const byName = allEmployees.find((emp: any) => {
			const firstName = emp.person?.personalInfo?.firstName || "";
			const lastName = emp.person?.personalInfo?.lastName || "";
			return `${firstName} ${lastName}`.trim() === record.employeeName;
		});
		return byName?.user?.avatar || null;
	};

	const openFixAttendance = (record: AttendanceRecord) => {
		setFixAttendanceRecord(record);
	};

	const openEmployeeProfile = (record: AttendanceRecord) => {
		const employeeProfileId = getEmployeeProfileId(record);
		if (!employeeProfileId) return;
		navigate(`/employee/${employeeProfileId}`);
	};

	const getAttendanceIndicatorBadges = (item: AttendanceRecord) => {
		const hasHoliday = item.primaryMarker === "HOLIDAY" || item.status === "HOLIDAY";
		const hasLeave = item.primaryMarker === "LEAVE" || item.status === "LEAVE";
		const isRestDay = item.primaryMarker === "REST_DAY" || item.status === "REST_DAY";
		const withinGrace = Boolean(item.computationMeta?.withinGrace);
		const rawLateMinutes = Math.max(0, Number(item.computationMeta?.rawLateMinutes) || 0);
		const hasOvertime = parseDurationToMinutes(item.overtimeHours) > 0;
		const hasChargeableLate = !withinGrace && parseDurationToMinutes(item.lateHours) > 0;
		const hasEarlyOut = parseDurationToMinutes(item.earlyOutHours) > 0;
		const needsClockInAction = item.status === "NOT_CLOCKED_IN";

		const badges: Array<{
			label: string;
			value?: string;
			className: string;
			valueClassName?: string;
		}> = [];
		if (hasHoliday) {
			badges.push({
				label: "HOL",
				value: getHolidayContextLabel(item) || undefined,
				className: "bg-blue-100 text-blue-700",
				valueClassName: "bg-blue-200/70 text-blue-800",
			});
		}
		if (hasLeave) {
			badges.push({
				label: "LEAVE",
				value: getLeaveContextLabel(item) || undefined,
				className: "bg-violet-100 text-violet-700",
				valueClassName: "bg-violet-200/70 text-violet-800",
			});
		}
		if (isRestDay) {
			badges.push({
				label: "REST",
				value: getRestDayContextLabel(item),
				className: "bg-gray-100 text-gray-700",
				valueClassName: "bg-gray-200/70 text-gray-800",
			});
		}
		if (needsClockInAction) {
			badges.push({
				label: "ACTION",
				value: "Clock In",
				className: "bg-rose-100 text-rose-700",
				valueClassName: "bg-rose-200/70 text-rose-800",
			});
		}
		if (hasOvertime) {
			badges.push({
				label: "+EX",
				value: formatDurationCompact(item.overtimeHours),
				className: "bg-green-100 text-green-700",
				valueClassName: "bg-green-200/70 text-green-800",
			});
		}
		if (hasChargeableLate) {
			badges.push({
				label: "LATE",
				value: formatDurationCompact(item.lateHours),
				className: "bg-amber-100 text-amber-700",
				valueClassName: "bg-amber-200/70 text-amber-800",
			});
		}
		if (withinGrace) {
			badges.push({
				label: "GRACE",
				value:
					rawLateMinutes > 0
						? formatMinutesDuration(rawLateMinutes, { compact: true })
						: undefined,
				className: "bg-amber-50 text-amber-700 border border-amber-200",
				valueClassName: "bg-amber-100 text-amber-800",
			});
		}
		if (hasEarlyOut) {
			badges.push({
				label: "EO",
				value: formatDurationCompact(item.earlyOutHours),
				className: "bg-orange-100 text-orange-700",
				valueClassName: "bg-orange-200/70 text-orange-800",
			});
		}
		return badges;
	};

	const formatContextToken = (value?: string | null) =>
		String(value || "")
			.trim()
			.replace(/_/g, " ")
			.replace(/\s+/g, " ")
			.toLowerCase()
			.replace(/\b\w/g, (char) => char.toUpperCase());

	const getLeaveContextLabel = (record: AttendanceRecord) => {
		const entries = Array.isArray(record.leaveEntries) ? record.leaveEntries : [];
		const labels = entries
			.map((entry) => entry.label || formatContextToken(entry.leaveType))
			.filter(Boolean);
		if (labels.length) return Array.from(new Set(labels)).join(", ");
		return record.leaveType ? `${formatContextToken(record.leaveType)} Leave` : "";
	};

	const getHolidayContextLabel = (record: AttendanceRecord) => {
		const entries = Array.isArray(record.holidayEntries) ? record.holidayEntries : [];
		const labels = entries.map((entry) => entry.title).filter(Boolean);
		return labels.length ? Array.from(new Set(labels)).join(", ") : "";
	};

	const getRestDayContextLabel = (record: AttendanceRecord) => {
		const schedule = (record as any).scheduleSnapshot || {};
		return (
			schedule.shiftTypeName ||
			schedule.name ||
			schedule.shiftTypeCode ||
			schedule.code ||
			schedule.scheduleTemplateName ||
			schedule.templateName ||
			"Scheduled rest day"
		);
	};

	const getAttendanceContextLabel = (record: AttendanceRecord) => {
		if (record.primaryMarker === "LEAVE" || record.status === "LEAVE") {
			return getLeaveContextLabel(record);
		}
		if (record.primaryMarker === "HOLIDAY" || record.status === "HOLIDAY") {
			return getHolidayContextLabel(record);
		}
		if (record.primaryMarker === "REST_DAY" || record.status === "REST_DAY") {
			return getRestDayContextLabel(record);
		}
		return "";
	};

	const formatMinutesLabel = (value?: string | null) => {
		if (parseDurationToMinutes(value) <= 0) return "-";
		if (!value) return "-";
		return value.includes(":") ? formatDuration(value) : value;
	};

	const formatWithinGraceLabel = (rawLateMinutes?: number | null) => {
		const totalMinutes = Math.max(0, Number(rawLateMinutes) || 0);
		if (totalMinutes <= 0) return "Within grace";
		return `Within grace (${formatMinutesDuration(totalMinutes, { compact: true })})`;
	};

	const getEmployeeInitials = (name?: string | null) => {
		const parts = String(name || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (parts.length === 0) return "U";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
	};

	const renderDetailMetric = (
		label: string,
		value: ReactNode,
		valueClassName = "text-gray-900",
	) => (
		<div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
			<div className="text-xs font-medium text-gray-500">{label}</div>
			<div className={`mt-1 text-sm font-semibold ${valueClassName}`}>
				{value || value === 0 ? value : "-"}
			</div>
		</div>
	);

	const renderDetailRow = (
		label: string,
		value: string | number | null | undefined,
		valueClassName = "text-gray-900",
	) => (
		<div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-b-0">
			<span className="text-sm text-gray-500">{label}</span>
			<span className={`max-w-[60%] text-right text-sm font-medium ${valueClassName}`}>
				{value || value === 0 ? value : "-"}
			</span>
		</div>
	);

	const renderSelectedAttendanceDetails = () => {
		if (!selectedRecord) return null;

		const displayStatus = getAttendanceDisplayStatus(selectedRecord);
		const indicatorBadges = getAttendanceIndicatorBadges(selectedRecord);
		const chargeableLate = selectedRecord.computationMeta?.withinGrace
			? formatWithinGraceLabel(selectedRecord.computationMeta?.rawLateMinutes)
			: formatMinutesLabel(selectedRecord.lateHours ?? undefined);
		const sourceLabel = selectedRecord.isManualEntry
			? "Manual entry"
			: selectedRecord.isVirtual
				? "System derived"
				: "Time log";
		const workforceLabel =
			selectedRecord.workforceSource === "AGENCY" && selectedRecord.agencyName
				? selectedRecord.agencyName
				: selectedRecord.workforceSource || "-";
		const hasIncompleteClock = !selectedRecord.timeOut || displayStatus === "INCOMPLETE";
		const employeeProfileId = getEmployeeProfileId(selectedRecord);
		const leaveContext = getLeaveContextLabel(selectedRecord);
		const holidayContext = getHolidayContextLabel(selectedRecord);
		const restDayContext =
			selectedRecord.primaryMarker === "REST_DAY" || selectedRecord.status === "REST_DAY"
				? getRestDayContextLabel(selectedRecord)
				: "";
		const attendanceContext = getAttendanceContextLabel(selectedRecord);

		return (
			<div className="space-y-5">
				<div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="flex min-w-0 items-start gap-4">
							<button
								type="button"
								onClick={() => openEmployeeProfile(selectedRecord)}
								disabled={!employeeProfileId}
								className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-600 text-base font-bold text-white transition-colors hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:bg-orange-600"
								aria-label={
									employeeProfileId
										? `Open ${selectedRecord.employeeName || "employee"} profile`
										: "Employee profile unavailable"
								}>
								{getEmployeeInitials(selectedRecord.employeeName)}
							</button>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										onClick={() => openEmployeeProfile(selectedRecord)}
										disabled={!employeeProfileId}
										className="truncate text-left text-lg font-semibold text-gray-950 transition-colors hover:text-orange-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:text-gray-950 disabled:hover:no-underline">
										{selectedRecord.employeeName || "Unknown Employee"}
									</button>
									<span
										className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getAttendanceStatusBadgeClass(displayStatus)}`}>
										{displayStatus}
									</span>
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
									<span>{selectedRecord.employeeId || "UNKNOWN"}</span>
									<span>{formatDate(selectedRecord.date, "long")}</span>
									<span>{sourceLabel}</span>
									{attendanceContext && (
										<span className="font-medium text-gray-800">
											{attendanceContext}
										</span>
									)}
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									{selectedRecord.isVirtual && (
										<span className="inline-flex items-center rounded-md border border-dashed border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
											Virtual row
										</span>
									)}
									{selectedRecord.isManualEntry && (
										<span className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
											Manual entry
										</span>
									)}
									{indicatorBadges.map((badge, index) => (
										<span
											key={`${selectedRecord.id}-${badge.label}-${index}-modal`}
											className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${badge.className}`}>
											<span>{badge.label}</span>
											{badge.value && (
												<span
													className={`max-w-[180px] truncate rounded px-1.5 py-[1px] font-mono text-[10px] ${badge.valueClassName || "bg-white/50"}`}>
													{badge.value}
												</span>
											)}
										</span>
									))}
									{!indicatorBadges.length && (
										<span className="text-xs font-medium text-gray-500">
											No active indicators
										</span>
									)}
								</div>
							</div>
						</div>

						<div className="grid min-w-[260px] grid-cols-2 gap-2 lg:max-w-sm">
							{renderDetailMetric(
								"Time in",
								renderClockValue(selectedRecord.timeIn, {
									isVirtual: selectedRecord.isVirtual,
								}),
							)}
							{renderDetailMetric(
								hasIncompleteClock ? "Missing clock" : "Time out",
								renderClockValue(selectedRecord.timeOut, {
									isVirtual: selectedRecord.isVirtual,
									nextDay: isClockOutNextDay(selectedRecord),
								}),
								hasIncompleteClock ? "text-red-600" : "text-gray-900",
							)}
							{renderDetailMetric("Worked", selectedRecord.hoursWorked || "0:00")}
							{renderDetailMetric(
								"Late",
								chargeableLate,
								chargeableLate === "-" || chargeableLate === "Within grace"
									? "text-gray-900"
									: selectedRecord.computationMeta?.withinGrace
										? "text-amber-700"
										: "text-red-600",
							)}
						</div>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="rounded-xl border border-gray-200 p-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<h3 className="text-sm font-semibold text-gray-900">Timekeeping</h3>
							<Clock className="h-4 w-4 text-gray-400" />
						</div>
						<div className="grid grid-cols-2 gap-3">
							{renderDetailMetric(
								"Time in",
								renderClockValue(selectedRecord.timeIn, {
									isVirtual: selectedRecord.isVirtual,
								}),
							)}
							{renderDetailMetric(
								"Time break",
								renderClockValue(selectedRecord.timeBreak, {
									isVirtual: selectedRecord.isVirtual,
								}),
							)}
							{renderDetailMetric(
								"Time out",
								renderClockValue(selectedRecord.timeOut, {
									isVirtual: selectedRecord.isVirtual,
									nextDay: isClockOutNextDay(selectedRecord),
								}),
							)}
							{renderDetailMetric("Break minutes", selectedRecord.breakMinutes ?? 0)}
							{renderDetailMetric(
								"Hours worked",
								selectedRecord.hoursWorked || "0:00",
							)}
							{renderDetailMetric(
								"Regular hours",
								selectedRecord.regularHours || "0:00",
							)}
						</div>
					</div>

					<div className="rounded-xl border border-gray-200 p-4">
						<h3 className="mb-3 text-sm font-semibold text-gray-900">Exceptions</h3>
						<div className="space-y-0">
							{renderDetailRow(
								"Chargeable late",
								chargeableLate,
								selectedRecord.computationMeta?.withinGrace
									? "text-amber-700"
									: chargeableLate === "-"
										? "text-gray-900"
										: "text-red-600",
							)}
							{renderDetailRow(
								"Raw late",
								formatMinutesDuration(
									Math.max(
										0,
										Number(selectedRecord.computationMeta?.rawLateMinutes) || 0,
									),
									{ compact: true },
								),
							)}
							{renderDetailRow(
								"Grace minutes",
								selectedRecord.computationMeta?.gracePeriodMinutes ?? 0,
							)}
							{renderDetailRow(
								"Early out",
								formatMinutesLabel(selectedRecord.earlyOutHours ?? undefined),
								parseDurationToMinutes(selectedRecord.earlyOutHours) > 0
									? "text-orange-700"
									: "text-gray-900",
							)}
							{renderDetailRow(
								"Excess time",
								formatMinutesLabel(selectedRecord.overtimeHours ?? undefined),
								parseDurationToMinutes(selectedRecord.overtimeHours) > 0
									? "text-green-700"
									: "text-gray-900",
							)}
							{renderDetailRow(
								"Undertime",
								formatMinutesLabel(selectedRecord.undertimeHours ?? undefined),
							)}
						</div>
					</div>
				</div>

				<div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
					<div className="rounded-xl border border-gray-200 p-4">
						<h3 className="mb-3 text-sm font-semibold text-gray-900">Record Context</h3>
						<div className="space-y-0">
							{renderDetailRow("Workforce source", workforceLabel)}
							{renderDetailRow(
								"Primary marker",
								selectedRecord.primaryMarker || "HOURS",
							)}
							{renderDetailRow("Leave type", leaveContext || "-")}
							{renderDetailRow("Holiday", holidayContext || "-")}
							{renderDetailRow("Rest day", restDayContext || "-")}
							{renderDetailRow(
								"Timesheet link",
								selectedRecord.timesheetId ? "Linked" : "-",
							)}
						</div>
					</div>

					<div className="rounded-xl border border-gray-200 p-4">
						<h3 className="mb-3 text-sm font-semibold text-gray-900">HR Review</h3>
						<div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-700">
							{selectedRecord.notes || "No notes for this attendance record."}
						</div>
						<div className="mt-4 flex flex-wrap justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => openFixAttendance(selectedRecord)}>
								<FileEdit className="mr-2 h-4 w-4" />
								Fix Attendance
							</Button>
							<Button variant="outline" onClick={() => setSelectedRecord(null)}>
								Close
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
	};

	const openAttendanceDepartment = (departmentId?: string | null) => {
		updateSearchParams((params) => {
			params.set("view", "list");
			params.set("page", "1");
			if (departmentId) {
				params.set("department", departmentId);
			} else {
				params.delete("department");
			}
			params.delete("section");
			params.delete("position");
			params.delete("level");
			params.delete("manager");
			params.delete("employee");
			params.delete("search");
			params.delete("status");
		});
		setSearchQuery("");
	};

	const returnToAttendanceOverview = () => {
		updateSearchParams((params) => {
			params.delete("view");
			params.delete("department");
			params.delete("section");
			params.delete("position");
			params.delete("level");
			params.delete("manager");
			params.delete("employee");
			params.delete("shiftType");
			params.delete("search");
			params.delete("status");
			params.delete("page");
		});
		setSearchQuery("");
	};

	const columns: Column<AttendanceRecord>[] = [
		{
			key: "employeeName",
			label: "Employee",
			width: "250px",
			render: (value, item) => (
				<EmployeeTableCell
					profileId={getEmployeeProfileId(item)}
					fullName={String(value || item.employeeName || "-")}
					employeeId={item.employeeId}
					avatar={getEmployeeAvatar(item)}
				/>
			),
		},
		{
			key: "date",
			label: "Shift Date",
			width: "130px",
			render: (value) => (
				<div className="text-sm text-gray-700">{formatDate(value, "short")}</div>
			),
		},
		{
			key: "status",
			label: "Status",
			width: "170px",
			render: (_value, item) => {
				const displayStatus = getAttendanceDisplayStatus(item);
				return (
					<div className="min-w-0">
						<span
							className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 ${getAttendanceStatusBadgeClass(displayStatus)}`}>
							{displayStatus}
						</span>
					</div>
				);
			},
		},
		{
			key: "behaviorFlags",
			label: "Indicators",
			width: "180px",
			render: (_, item) => {
				const indicatorBadges = getAttendanceIndicatorBadges(item);

				if (!indicatorBadges.length) {
					return <span className="text-gray-400 text-sm">-</span>;
				}

				return (
					<div className="flex flex-wrap gap-1">
						{indicatorBadges.map((badge, index) => (
							<span
								key={`${item.id}-${badge.label}-${index}`}
								className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-bold ${badge.className}`}>
								<span>{badge.label}</span>
								{badge.value && (
									<span
										className={`max-w-[100px] truncate rounded px-1 py-[1px] font-mono text-[10px] ${badge.valueClassName || "bg-white/50"}`}>
										{badge.value}
									</span>
								)}
							</span>
						))}
					</div>
				);
			},
		},
		{
			key: "timeIn",
			label: "Clock In",
			width: "120px",
			render: (value, item) =>
				renderClockValue(value as string | null | undefined, {
					isVirtual: item.isVirtual,
				}),
		},
		{
			key: "timeOut",
			label: "Clock Out",
			width: "120px",
			render: (_value, item) =>
				renderClockValue(item.timeOut, {
					isVirtual: item.isVirtual,
					nextDay: isClockOutNextDay(item),
				}),
		},
	];

	const getShiftLabel = (record: AttendanceRecord) => {
		const schedule = (record as any).scheduleSnapshot || {};
		return (
			schedule.shiftTypeName ||
			schedule.name ||
			schedule.shiftTypeCode ||
			schedule.code ||
			schedule.scheduleTemplateName ||
			schedule.templateName ||
			(record.status === "REST_DAY" ? "Rest day" : "Unassigned")
		);
	};

	const getRecordReliability = (record: AttendanceRecord) => {
		const status = getAttendanceDisplayStatus(record);
		if (["REST_DAY", "HOLIDAY", "CANCELLED", "SCHEDULED"].includes(status)) return null;
		return ["PRESENT", "INCOMPLETE", "LEAVE"].includes(status) ? 100 : 0;
	};

	const departmentOverviewGroups = useMemo(() => {
		const grouped = new Map<
			string,
			{
				key: string;
				departmentName: string;
				departmentId: string | null;
				rows: AttendanceRecord[];
				previewRows: AttendanceRecord[];
				stats: {
					employees: number;
					scheduled: number;
					present: number;
					late: number;
					absent: number;
					leave: number;
					missing: number;
					overtimeHours: number;
					unapprovedOvertimeHours: number;
					reliability: number | null;
					totalRecords: number;
				};
			}
		>();
		const breakdownByDepartment = new Map(
			departmentBreakdown.map((item) => [
				item.departmentId || item.departmentName || "Unassigned",
				item,
			]),
		);

		const previewRecordsByDepartment = departmentPreviewRows.length
			? departmentPreviewRows.flatMap((group) =>
					(group.rows || []).map((record) => ({
						...record,
						departmentId: record.departmentId || group.departmentId,
						departmentName: record.departmentName || group.departmentName,
					})),
				)
			: overviewRecords;

		previewRecordsByDepartment.forEach((record) => {
			const departmentName = record.departmentName || "Unassigned";
			const key = record.departmentId || departmentName;
			const group =
				grouped.get(key) ||
				({
					key,
					departmentName,
					departmentId: record.departmentId || null,
					rows: [],
					previewRows: [],
					stats: {
						employees: 0,
						scheduled: 0,
						present: 0,
						late: 0,
						absent: 0,
						leave: 0,
						missing: 0,
						overtimeHours: 0,
						unapprovedOvertimeHours: 0,
						reliability: null,
						totalRecords: 0,
					},
				} as {
					key: string;
					departmentName: string;
					departmentId: string | null;
					rows: AttendanceRecord[];
					previewRows: AttendanceRecord[];
					stats: {
						employees: number;
						scheduled: number;
						present: number;
						late: number;
						absent: number;
						leave: number;
						missing: number;
						overtimeHours: number;
						unapprovedOvertimeHours: number;
						reliability: number | null;
						totalRecords: number;
					};
				});

			group.rows.push(record);
			group.previewRows.push(record);
			grouped.set(key, group);
		});

		departmentBreakdown.forEach((item) => {
			const key = item.departmentId || item.departmentName || "Unassigned";
			if (grouped.has(key)) return;
			grouped.set(key, {
				key,
				departmentName: item.departmentName || "Unassigned",
				departmentId: item.departmentId || null,
				rows: [],
				previewRows: [],
				stats: {
					employees: item.employeeCount || 0,
					scheduled: item.scheduled || 0,
					present: item.present || 0,
					late: item.late || 0,
					absent: item.absent || 0,
					leave: item.leave || 0,
					missing: item.missing || 0,
					overtimeHours: item.overtimeHours || 0,
					unapprovedOvertimeHours: item.overtimeHours || 0,
					reliability: null,
					totalRecords: item.totalRecords || 0,
				},
			});
		});

		return Array.from(grouped.values())
			.map((group) => {
				const seenEmployees = new Set<string>();
				const reliabilityValues: number[] = [];
				const stats = { ...group.stats };

				group.rows.forEach((record) => {
					const employeeKey = record.employeeRefId || record.employeeId;
					if (employeeKey && !seenEmployees.has(employeeKey)) {
						seenEmployees.add(employeeKey);
					}

					const status = getAttendanceDisplayStatus(record);
					const scheduled = !["REST_DAY", "HOLIDAY", "CANCELLED", "SCHEDULED"].includes(
						status,
					);
					const isPresent = ["PRESENT", "INCOMPLETE"].includes(status);
					const isLate =
						(record.behaviorFlags || []).includes("TARDINESS") ||
						parseDurationToMinutes(record.lateHours) > 0;
					const overtimeHours = parseDurationToMinutes(record.overtimeHours) / 60;

					if (scheduled) stats.scheduled += 1;
					if (isPresent) stats.present += 1;
					if (isLate) stats.late += 1;
					if (status === "ABSENT") stats.absent += 1;
					if (status === "LEAVE") stats.leave += 1;
					if (["NOT_CLOCKED_IN", "INCOMPLETE"].includes(status)) stats.missing += 1;
					stats.overtimeHours += overtimeHours;
					stats.unapprovedOvertimeHours += overtimeHours;

					const reliability = getRecordReliability(record);
					if (reliability !== null) reliabilityValues.push(reliability);
				});

				stats.employees = seenEmployees.size;
				stats.totalRecords = group.rows.length;
				stats.reliability =
					reliabilityValues.length > 0
						? Math.round(
								reliabilityValues.reduce((sum, value) => sum + value, 0) /
									reliabilityValues.length,
							)
						: null;
				const serverStats = breakdownByDepartment.get(
					group.departmentId || group.departmentName,
				);
				if (serverStats) {
					stats.employees = serverStats.employeeCount ?? stats.employees;
					stats.totalRecords = serverStats.totalRecords ?? stats.totalRecords;
					stats.scheduled = serverStats.scheduled ?? stats.scheduled;
					stats.present = serverStats.present ?? stats.present;
					stats.late = serverStats.late ?? stats.late;
					stats.absent = serverStats.absent ?? stats.absent;
					stats.leave = serverStats.leave ?? stats.leave;
					stats.missing = serverStats.missing ?? stats.missing;
					stats.overtimeHours = serverStats.overtimeHours ?? stats.overtimeHours;
					stats.unapprovedOvertimeHours =
						serverStats.overtimeHours ?? stats.unapprovedOvertimeHours;
				}

				return {
					...group,
					previewRows: group.previewRows.slice(0, 5),
					stats,
				};
			})
			.sort((left, right) => left.departmentName.localeCompare(right.departmentName));
	}, [departmentBreakdown, departmentPreviewRows, overviewRecords]);

	const toggleOverviewDepartment = (departmentKey: string) => {
		setCollapsedOverviewDepartments((current) => {
			const next = new Set(current);
			if (next.has(departmentKey)) {
				next.delete(departmentKey);
			} else {
				next.add(departmentKey);
			}
			return next;
		});
	};

	const formatLeaveTypeLabel = (leaveType: string) =>
		String(leaveType || "LEAVE")
			.replace(/_/g, " ")
			.toLowerCase()
			.replace(/\b\w/g, (letter) => letter.toUpperCase());

	const advancedFilters: FilterOption[] = [
		{
			key: "manager",
			label: "Manager",
			options: filteredManagers.map((emp: any) => ({
				value: emp.id,
				label:
					[emp.person?.personalInfo?.firstName, emp.person?.personalInfo?.lastName]
						.filter(Boolean)
						.join(" ") || emp.employeeId,
			})),
		},
		{
			key: "employee",
			label: "Employee",
			options: employeeFilterOptions.map((emp: any) => ({
				value: emp.id,
				label:
					[emp.person?.personalInfo?.firstName, emp.person?.personalInfo?.lastName]
						.filter(Boolean)
						.join(" ") ||
					emp.employeeId ||
					emp.id,
			})),
		},
	];

	const advancedFilterValues = {
		manager: selectedManager,
		employee: selectedEmployee,
	};

	const attendanceScopeFilterControls = useMemo(
		() => [
			{
				key: "shiftType",
				label: "Shift Type",
				value: selectedShiftType,
				options: [
					{ value: "all", label: "All Shift Types" },
					...shiftTypeOptions.map((shift) => ({
						value: shift.value,
						label: `${shift.label} (${shift.total})`,
					})),
				],
				onChange: handleShiftTypeChange,
			},
			{
				key: "department",
				label: "Department",
				value: selectedDepartment,
				options: [
					{ value: "all", label: "All Departments" },
					...departments.map((dept: any) => ({
						value: dept.id,
						label: dept.name,
					})),
				],
				onChange: handleDepartmentFilterChange,
			},
			{
				key: "section",
				label: "Section",
				value: selectedSection,
				options: [
					{ value: "all", label: "All Sections" },
					...filteredSections.map((section: any) => ({
						value: section.id,
						label: section.name,
					})),
				],
				onChange: handleSectionFilterChange,
			},
			{
				key: "position",
				label: "Position",
				value: selectedPosition,
				options: [
					{ value: "all", label: "All Positions" },
					...filteredPositions.map((position: any) => ({
						value: position.id,
						label: position.title,
					})),
				],
				onChange: handlePositionFilterChange,
			},
			{
				key: "level",
				label: "Level",
				value: selectedLevel,
				options: [
					{ value: "all", label: "All Levels" },
					...filteredLevels.map((level: any) => ({
						value: level.id,
						label: level.name,
					})),
				],
				onChange: handleLevelFilterChange,
			},
		],
		[
			departments,
			filteredLevels,
			filteredPositions,
			filteredSections,
			selectedDepartment,
			selectedLevel,
			selectedPosition,
			selectedSection,
			selectedShiftType,
			shiftTypeOptions,
		],
	);

	const customFilters = (
		<>
			<Select value={statusFilter || "all"} onValueChange={handleStatusFilterChange}>
				<SelectTrigger className="w-[180px] h-9 md:h-10 rounded-xl px-3 md:px-4 border-neutral-200 bg-white shadow-sm text-xs font-medium">
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Statuses</SelectItem>
					<SelectItem value="ON_TIME">On time</SelectItem>
					<SelectItem value="LATE">Late</SelectItem>
					<SelectItem value="ABSENT">Absent</SelectItem>
					<SelectItem value="EARLY_OUT">Early out</SelectItem>
					<SelectItem value="CLOCKED_IN">Clocked in</SelectItem>
					<SelectItem value="CLOCKED_OUT">Clocked out</SelectItem>
					<SelectItem value="MISSING_CLOCK_IN">Not clocked in</SelectItem>
					<SelectItem value="OVERTIME">Overtime</SelectItem>
					<SelectItem value="LEAVE">Leave</SelectItem>
					{leaveBalanceTypeRows.map((item) => (
						<SelectItem
							key={`status-filter-${item.leaveType}`}
							value={`LEAVE_TYPE:${item.leaveType}`}>
							{formatLeaveTypeLabel(item.leaveType)}
						</SelectItem>
					))}
					<SelectItem value="WORKED_REST_DAY">Off-day work</SelectItem>
					<SelectItem value="WORKED_HOLIDAY">Holiday work</SelectItem>
					<SelectItem value="MISSING_SCHEDULE">Missing schedule</SelectItem>
				</SelectContent>
			</Select>

		</>
	);

	const metricsLoading =
		viewMode === "list" ? isLoadingAttendanceMetricsSummary : isLoadingAttendanceOverview;
	const workDayCount = detailedMetrics.totalScheduledWorkDays || 0;
	const clockedInCount = detailedMetrics.totalClockedIn || detailedMetrics.totalPresent || 0;
	const clockedOutCount = detailedMetrics.totalClockedOut || 0;
	const onTimeCount =
		detailedMetrics.totalOnTime ||
		Math.max(0, clockedInCount - (detailedMetrics.totalLate || 0));
	const lateCount = detailedMetrics.totalLate || 0;
	const earlyOutCount = detailedMetrics.totalEarlyOut || 0;
	const leaveCount = detailedMetrics.totalOnLeave || 0;
	const approvedOvertimeCount = detailedMetrics.approvedOvertimeCount || 0;
	const unapprovedOvertimeCount = detailedMetrics.unapprovedOvertimeCount || 0;
	const absentCount = detailedMetrics.totalAbsent || 0;
	const notClockedInCount = detailedMetrics.totalNotClockedIn || 0;
	const missingClockInCount = absentCount + notClockedInCount;
	const restDayCount = detailedMetrics.totalRestDay || 0;
	const holidayCount = detailedMetrics.totalHoliday || 0;
	const holidayDateCount = detailedMetrics.totalHolidayDateCount || 0;
	const workedOnRestDayCount = detailedMetrics.totalWorkedOnRestDay || 0;
	const workedOnHolidayCount = detailedMetrics.totalWorkedOnHoliday || 0;
	const nonWorkingDayWorkCount = workedOnRestDayCount + workedOnHolidayCount;
	const companyEventDayCount = detailedMetrics.totalCompanyEventDays || 0;
	const employeesMissingScheduleCount = detailedMetrics.totalEmployeesMissingSchedule || 0;
	const calendarDayCount = Math.max(
		workDayCount + restDayCount + holidayCount + companyEventDayCount,
		workDayCount,
	);
	const scheduledRate =
		calendarDayCount > 0 ? Math.round((workDayCount / calendarDayCount) * 100) : 0;
	const leaveTypeBreakdown = detailedMetrics.leaveTypeBreakdown || [];
	const utilizationRate =
		detailedMetrics.utilizationRate || detailedMetrics.avgAttendanceRate || 0;
	const onTimeRate = workDayCount > 0 ? Math.round((onTimeCount / workDayCount) * 100) : 0;
	const lateRate = workDayCount > 0 ? Math.round((lateCount / workDayCount) * 100) : 0;
	const earlyOutRate = workDayCount > 0 ? Math.round((earlyOutCount / workDayCount) * 100) : 0;
	const getMetricRate = (value: number, total = workDayCount) =>
		total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
	const displayMetricValue = (value: number) => (metricsLoading ? "..." : value.toLocaleString());
	const displayMetricText = (value: number | string) =>
		metricsLoading && typeof value === "number" ? "..." : String(value);
	const displayLeaveBalanceValue = (value: number) =>
		isLoadingLeaveBalances
			? "..."
			: value.toLocaleString(undefined, { maximumFractionDigits: 1 });

	const getActiveFilterLabel = () => {
		if (!statusFilter) return "";
		if (statusFilter.startsWith("LEAVE_TYPE:")) {
			return formatLeaveTypeLabel(statusFilter.replace("LEAVE_TYPE:", ""));
		}
		if (statusFilter === "MISSING_CLOCK_IN") return "Not Clocked In";
		if (statusFilter === "MISSING_SCHEDULE") return "Missing Schedule";
		return statusFilter
			.replace(/_/g, " ")
			.toLowerCase()
			.replace(/\b\w/g, (letter) => letter.toUpperCase());
	};
	const activeFilterLabel = getActiveFilterLabel();
	const getActiveMetricTone = () => {
		if (!activeMetricKey) {
			return {
				gauge: "#16415f",
				text: "text-neutral-900",
				bar: "bg-neutral-700",
				appliesTo: "",
			};
		}
		if (activeMetricKey.startsWith("LEAVE_TYPE:") || activeMetricKey === "LEAVE") {
			return {
				gauge: "#059669",
				text: "text-emerald-700",
				bar: "bg-emerald-600",
				appliesTo: "leave",
			};
		}
		if (activeMetricKey === "LATE") {
			return {
				gauge: "#f59e0b",
				text: "text-amber-700",
				bar: "bg-amber-500",
				appliesTo: "attendance",
			};
		}
		if (
			activeMetricKey === "ABSENT" ||
			activeMetricKey === "NOT_CLOCKED_IN" ||
			activeMetricKey === "MISSING_CLOCK_IN"
		) {
			return {
				gauge: "#e11d48",
				text: "text-rose-700",
				bar: "bg-rose-600",
				appliesTo: "attendance",
			};
		}
		if (activeMetricKey === "EARLY_OUT") {
			return {
				gauge: "#f97316",
				text: "text-orange-700",
				bar: "bg-orange-500",
				appliesTo: "attendance",
			};
		}
		if (
			activeMetricKey === "REST_DAY" ||
			activeMetricKey === "HOLIDAY" ||
			activeMetricKey === "WORKED_REST_DAY" ||
			activeMetricKey === "WORKED_HOLIDAY" ||
			activeMetricKey === "SCHEDULED" ||
			activeMetricKey === "MISSING_SCHEDULE"
		) {
			return {
				gauge:
					activeMetricKey === "HOLIDAY" || activeMetricKey === "WORKED_HOLIDAY"
						? "#f59e0b"
						: activeMetricKey === "MISSING_SCHEDULE"
							? "#e11d48"
						: "#525252",
				text:
					activeMetricKey === "HOLIDAY" || activeMetricKey === "WORKED_HOLIDAY"
						? "text-amber-700"
						: activeMetricKey === "MISSING_SCHEDULE"
							? "text-rose-700"
						: "text-neutral-800",
				bar:
					activeMetricKey === "HOLIDAY" || activeMetricKey === "WORKED_HOLIDAY"
						? "bg-amber-500"
						: activeMetricKey === "MISSING_SCHEDULE"
							? "bg-rose-600"
						: "bg-neutral-700",
				appliesTo: "schedule",
			};
		}
		return {
			gauge: "#404040",
			text: "text-neutral-900",
			bar: "bg-neutral-700",
			appliesTo: "attendance",
		};
	};
	const activeMetricTone = getActiveMetricTone();
	const activeLeaveType = activeMetricKey?.startsWith("LEAVE_TYPE:")
		? activeMetricKey.replace("LEAVE_TYPE:", "").trim()
		: "";
	const activeLeaveTypeRow = activeLeaveType
		? leaveBalanceTypeRows.find(
				(item) => String(item.leaveType).toUpperCase() === activeLeaveType.toUpperCase(),
			)
		: null;
	const activeLeaveUsed = activeLeaveTypeRow ? getPeriodLeaveUsed(activeLeaveTypeRow.leaveType) : 0;
	const leaveVisualRate = activeLeaveTypeRow
		? getLeaveBalancePercent(activeLeaveUsed, activeLeaveTypeRow.totalEntitled)
		: leaveBalanceAvailableRate;
	const leaveVisualLabel = activeLeaveTypeRow
		? `${getLeaveTypeCode(activeLeaveTypeRow.leaveType)} used`
		: "avail. capacity";
	const scheduleVisual =
		activeMetricKey === "REST_DAY"
			? { rate: getMetricRate(restDayCount, calendarDayCount), label: "off days" }
			: activeMetricKey === "HOLIDAY"
				? { rate: getMetricRate(holidayDateCount, calendarDayCount), label: "holidays" }
				: activeMetricKey === "WORKED_REST_DAY" || activeMetricKey === "WORKED_HOLIDAY"
					? {
							rate: getMetricRate(nonWorkingDayWorkCount, calendarDayCount),
							label: "exception work",
						}
					: activeMetricKey === "MISSING_SCHEDULE"
						? {
								rate: getMetricRate(
									employeesMissingScheduleCount,
									Math.max(employeesMissingScheduleCount, workDayCount),
								),
								label: "missing schedule",
							}
				: { rate: scheduledRate, label: "scheduled" };
	const attendanceGaugeVisual = (() => {
		if (activeMetricKey === "ON_TIME") return { value: onTimeRate, label: "on time" };
		if (activeMetricKey === "LATE") return { value: lateRate, label: "late" };
		if (activeMetricKey === "ABSENT") return { value: getMetricRate(absentCount), label: "absent" };
		if (activeMetricKey === "EARLY_OUT") return { value: earlyOutRate, label: "early out" };
		if (activeMetricKey === "CLOCKED_IN") {
			return { value: getMetricRate(clockedInCount), label: "clocked in" };
		}
		if (activeMetricKey === "CLOCKED_OUT") {
			return { value: getMetricRate(clockedOutCount, clockedInCount), label: "clocked out" };
		}
		if (activeMetricKey === "NOT_CLOCKED_IN" || activeMetricKey === "MISSING_CLOCK_IN") {
			return { value: getMetricRate(missingClockInCount), label: "not in" };
		}
		if (activeMetricKey === "OVERTIME") {
			return {
				value: getMetricRate(approvedOvertimeCount + unapprovedOvertimeCount),
				label: "overtime",
			};
		}
		return { value: utilizationRate, label: "present" };
	})();

	const renderMetricRow = (
		label: string,
		value: number,
		status: string,
		options: { total?: number; colorClassName?: string } = {},
	) => {
		const total = Math.max(options.total ?? workDayCount, 0);
		const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
		return (
			<button
				type="button"
				aria-pressed={isMetricActive(status)}
				onClick={() => handleMetricFilter(status)}
				className={`group grid w-full cursor-pointer grid-cols-[minmax(92px,0.42fr)_minmax(80px,1fr)_auto] items-center gap-2 border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${
					isMetricActive(status)
						? "border-l-orange-500 bg-neutral-100"
						: "border-l-transparent hover:bg-neutral-50"
				}`}>
				<span className="truncate text-xs font-medium text-gray-800">{label}</span>
				<span className="h-1.5 overflow-hidden bg-neutral-200/80">
					<span
						className={`block h-full transition-colors ${
							isMetricActive(status)
								? activeMetricTone.bar
								: options.colorClassName || "bg-slate-600"
						}`}
						style={{ width: `${percent}%` }}
					/>
				</span>
				<span className="text-xs font-semibold tabular-nums text-gray-950">
					{displayMetricValue(value)}
					{total > 0 && (
						<span className="ml-1 text-xs font-medium text-gray-500">
							/ {displayMetricText(total)}
						</span>
					)}
				</span>
			</button>
		);
	};

	const renderScheduleRow = (
		label: string,
		value: number,
		options: { total?: number; colorClassName?: string; status?: string } = {},
	) => {
		const total = Math.max(options.total ?? calendarDayCount, 0);
		const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
		const content = (
			<>
				<span className="truncate text-xs font-medium text-gray-800">{label}</span>
				<span className="h-1.5 overflow-hidden bg-neutral-200/80">
					<span
						className={`block h-full transition-colors ${
							isMetricActive(options.status)
								? activeMetricTone.bar
								: options.colorClassName || "bg-slate-600"
						}`}
						style={{ width: `${percent}%` }}
					/>
				</span>
				<span className="text-xs font-semibold tabular-nums text-gray-950">
					{displayMetricValue(value)}
					{total > 0 && (
						<span className="ml-1 text-xs font-medium text-gray-500">
							/ {displayMetricText(total)}
						</span>
					)}
				</span>
			</>
		);

		if (options.status) {
			return (
				<button
					type="button"
					aria-pressed={isMetricActive(options.status)}
					onClick={() => handleMetricFilter(options.status || "")}
					className={`grid w-full cursor-pointer grid-cols-[minmax(92px,0.42fr)_minmax(80px,1fr)_auto] items-center gap-2 border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${
						isMetricActive(options.status)
							? "border-l-orange-500 bg-neutral-100"
							: "border-l-transparent hover:bg-neutral-50"
					}`}>
					{content}
				</button>
			);
		}

		return (
			<div className="grid w-full grid-cols-[minmax(92px,0.42fr)_minmax(80px,1fr)_auto] items-center gap-2 border-l-2 border-l-transparent px-2 py-1.5">
				{content}
			</div>
		);
	};

	const renderCompactScheduleRow = (
		label: string,
		value: number,
		options: { total?: number; colorClassName?: string; status?: string } = {},
	) => {
		const total = Math.max(options.total ?? calendarDayCount, 0);
		const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
		const content = (
			<>
				<span className="flex min-w-0 items-baseline justify-between gap-2">
					<span className="truncate text-xs font-medium text-gray-800">{label}</span>
					<span className="shrink-0 text-xs font-semibold tabular-nums text-gray-950">
						{displayMetricValue(value)}
						{total > 0 && (
							<span className="ml-1 text-[11px] font-medium text-gray-500">
								/ {displayMetricText(total)}
							</span>
						)}
					</span>
				</span>
				<span className="h-1.5 overflow-hidden bg-neutral-200/80">
					<span
						className={`block h-full transition-colors ${
							isMetricActive(options.status)
								? activeMetricTone.bar
								: options.colorClassName || "bg-slate-600"
						}`}
						style={{ width: `${percent}%` }}
					/>
				</span>
			</>
		);

		if (options.status) {
			return (
				<button
					type="button"
					aria-pressed={isMetricActive(options.status)}
					onClick={() => handleMetricFilter(options.status || "")}
					className={`grid w-full cursor-pointer gap-1.5 border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${
						isMetricActive(options.status)
							? "border-l-orange-500 bg-neutral-100"
							: "border-l-transparent hover:bg-neutral-50"
					}`}>
					{content}
				</button>
			);
		}

		return (
			<div className="grid w-full gap-1.5 border-l-2 border-l-transparent px-2 py-1.5">
				{content}
			</div>
		);
	};

	const renderPresenceRow = (
		label: string,
		value: number,
		status: string,
		options: { total?: number; colorClassName?: string } = {},
	) => {
		const total = Math.max(options.total ?? workDayCount, 0);
		const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

		return (
			<button
				type="button"
				aria-pressed={isMetricActive(status)}
				onClick={() => handleMetricFilter(status)}
				className={`grid min-w-0 cursor-pointer gap-1.5 border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 ${
					isMetricActive(status)
						? "border-l-orange-500 bg-neutral-100"
						: "border-l-transparent hover:bg-neutral-50"
				}`}>
				<span className="flex min-w-0 items-baseline justify-between gap-3">
					<span className="truncate text-xs font-medium text-gray-800">{label}</span>
					<span className="shrink-0 text-xs font-semibold tabular-nums text-gray-950">
						{displayMetricValue(value)}
						{total > 0 && (
							<span className="ml-1 text-[11px] font-medium text-gray-500">
								/ {displayMetricText(total)}
							</span>
						)}
					</span>
				</span>
				<span className="h-1.5 overflow-hidden bg-neutral-200/80">
					<span
						className={`block h-full transition-colors ${
							isMetricActive(status)
								? activeMetricTone.bar
								: options.colorClassName || "bg-slate-600"
						}`}
						style={{ width: `${percent}%` }}
					/>
				</span>
			</button>
		);
	};

	const renderSegmentedBar = (
		segments: Array<{ key: string; value: number; className: string }>,
		total: number,
		activeKey?: string,
	) => {
		const safeTotal = Math.max(total, 0);
		const visibleSegments = segments.filter((segment) => segment.value > 0);

		return (
			<div className="flex h-2 w-full overflow-hidden border border-neutral-200 bg-neutral-100">
				{safeTotal > 0 && visibleSegments.length > 0 ? (
					visibleSegments.map((segment) => (
						<span
							key={segment.key}
							className={`${segment.className} transition-opacity ${
								activeKey && segment.key !== activeKey ? "opacity-35" : ""
							}`}
							style={{
								width: `${Math.max(1, Math.min(100, (segment.value / safeTotal) * 100))}%`,
							}}
						/>
					))
				) : (
					<span className="h-full w-full bg-neutral-100" />
				)}
			</div>
		);
	};

	const renderUtilizationGauge = (value: number, label: string) => {
		const percent = Math.max(0, Math.min(100, Math.round(value || 0)));
		const gaugeColor =
			activeMetricTone.appliesTo === "attendance" ? activeMetricTone.gauge : "#16415f";

		return (
			<div
				className="grid h-32 w-32 shrink-0 place-items-center rounded-full transition-colors"
				style={{
					background: `conic-gradient(${gaugeColor} ${percent * 3.6}deg, #e5e7eb 0deg)`,
				}}>
				<div className="grid h-[92px] w-[92px] place-items-center rounded-full bg-white">
					<div className="text-center leading-none">
						<div className="text-xl font-semibold tabular-nums text-neutral-950">
							{metricsLoading ? "..." : `${percent}%`}
						</div>
						<div className="mt-1 text-[10px] font-semibold uppercase text-neutral-500">
							{label}
						</div>
					</div>
				</div>
			</div>
		);
	};

	const renderOverviewMetric = (
		value: number | string | null,
		options: { tone?: "default" | "good" | "warn" | "danger"; suffix?: string } = {},
	) => {
		const toneClass =
			options.tone === "good"
				? "text-emerald-700"
				: options.tone === "warn"
					? "text-amber-700"
					: options.tone === "danger"
						? "text-rose-700"
						: "text-gray-950";
		return (
			<span className={`tabular-nums ${toneClass}`}>
				{value === null ? "-" : value}
				{value !== null && options.suffix ? options.suffix : ""}
			</span>
		);
	};

	const renderAttendanceOverviewTable = () => {
		if (isLoadingAttendanceOverview) {
			return (
				<div className="rounded-md border border-neutral-200 bg-white p-8 text-center text-sm text-gray-500">
					Loading department attendance...
				</div>
			);
		}

		if (!departmentOverviewGroups.length) {
			return (
				<div className="rounded-md border border-neutral-200 bg-white p-8 text-center">
					<div className="text-sm font-semibold text-gray-900">
						No attendance records found
					</div>
					<div className="mt-1 text-sm text-gray-500">
						Department attendance previews will appear here once records match the
						selected period.
					</div>
				</div>
			);
		}

		return (
			<div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
				<table className="w-full min-w-[980px] text-sm">
					<thead>
						<tr className="border-b border-neutral-200 bg-neutral-50 text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
							<th className="w-[300px] px-3 py-2">Employee</th>
							<th className="w-[150px] px-3 py-2">Shift</th>
							<th className="px-2 py-2 text-right">Sched</th>
							<th className="px-2 py-2 text-right">Pres</th>
							<th className="px-2 py-2 text-right">Late</th>
							<th className="px-2 py-2 text-right">Abs</th>
							<th className="px-2 py-2 text-right">LV</th>
							<th className="px-2 py-2 text-right">OT</th>
							<th className="w-[150px] px-3 py-2 text-right">State</th>
						</tr>
					</thead>
					<tbody>
						{departmentOverviewGroups.map((group) => {
							const isCollapsed = collapsedOverviewDepartments.has(group.key);

							return (
								<Fragment key={group.key}>
									<tr className="border-b border-neutral-200 bg-neutral-100/70 text-xs font-semibold text-gray-950">
										<td className="px-3 py-2">
											<button
												type="button"
												onClick={() => toggleOverviewDepartment(group.key)}
												className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
												{isCollapsed ? (
													<ChevronRight className="h-4 w-4 shrink-0 text-gray-700" />
												) : (
													<ChevronDown className="h-4 w-4 shrink-0 text-gray-700" />
												)}
												<span className="truncate text-sm font-semibold">
													{group.departmentName}
												</span>
												<span className="shrink-0 text-xs font-medium text-gray-500">
													{group.stats.totalRecords}{" "}
													{group.stats.totalRecords === 1
														? "record"
														: "records"}
												</span>
											</button>
										</td>
										<td className="px-3 py-2 text-gray-500">rolled up</td>
										<td className="px-2 py-2 text-right tabular-nums">
											{group.stats.scheduled}
										</td>
										<td className="px-2 py-2 text-right tabular-nums">
											{group.stats.present}
										</td>
										<td className="px-2 py-2 text-right">
											{renderOverviewMetric(group.stats.late, {
												tone: group.stats.late > 0 ? "warn" : "default",
											})}
										</td>
										<td className="px-2 py-2 text-right">
											{renderOverviewMetric(group.stats.absent, {
												tone: group.stats.absent > 0 ? "danger" : "default",
											})}
										</td>
										<td className="px-2 py-2 text-right tabular-nums">
											{group.stats.leave}
										</td>
										<td className="px-2 py-2 text-right tabular-nums">
											{group.stats.overtimeHours.toLocaleString(undefined, {
												maximumFractionDigits: 1,
											})}
										</td>
										<td className="px-3 py-2 text-right">
											<button
												type="button"
												onClick={() =>
													openAttendanceDepartment(group.departmentId)
												}
												className="text-xs font-bold text-neutral-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline">
												View all
											</button>
										</td>
									</tr>
									{!isCollapsed &&
										group.previewRows.map((item) => {
											const status = getAttendanceDisplayStatus(item);
											const isScheduled = ![
												"REST_DAY",
												"HOLIDAY",
												"CANCELLED",
												"SCHEDULED",
											].includes(status);
											const isPresent = ["PRESENT", "INCOMPLETE"].includes(
												status,
											);
											const isLate =
												(item.behaviorFlags || []).includes("TARDINESS") ||
												parseDurationToMinutes(item.lateHours) > 0;

											return (
												<tr
													key={`${group.key}-${item.id}`}
													className="border-b border-neutral-100 bg-white hover:bg-neutral-50">
													<td className="px-3 py-2">
														<div className="flex items-center gap-2">
															<span
																className={`h-2 w-2 shrink-0 rounded-full ${
																	status === "ABSENT"
																		? "bg-rose-600"
																		: isLate
																			? "bg-amber-500"
																			: isPresent
																				? "bg-emerald-600"
																				: "bg-slate-400"
																}`}
															/>
															<EmployeeTableCell
																profileId={getEmployeeProfileId(
																	item,
																)}
																fullName={item.employeeName || "-"}
																employeeId={item.employeeId}
																avatar={getEmployeeAvatar(item)}
															/>
														</div>
													</td>
													<td className="px-3 py-2 text-sm text-gray-600">
														{getShiftLabel(item)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{isScheduled ? 1 : 0}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{isPresent ? 1 : 0}
													</td>
													<td className="px-2 py-2 text-right">
														{renderOverviewMetric(isLate ? 1 : 0, {
															tone: isLate ? "warn" : "default",
														})}
													</td>
													<td className="px-2 py-2 text-right">
														{renderOverviewMetric(
															status === "ABSENT" ? 1 : 0,
															{
																tone:
																	status === "ABSENT"
																		? "danger"
																		: "default",
															},
														)}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{status === "LEAVE" ? 1 : 0}
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{(
															parseDurationToMinutes(
																item.overtimeHours,
															) / 60
														).toLocaleString(undefined, {
															maximumFractionDigits: 1,
														})}
													</td>
													<td className="px-3 py-2 text-right">
														<div className="flex justify-end">
															<div className="flex items-center justify-end gap-1">
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-7 w-7 rounded-md"
																	onClick={() => openFixAttendance(item)}
																	title="Fix Attendance"
																	aria-label={`Fix attendance for ${item.employeeName}`}
																>
																	<FileEdit className="h-4 w-4 text-orange-600" />
																</Button>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			variant="ghost"
																			size="icon"
																			className="h-7 w-7 rounded-md">
																			<MoreVertical className="h-4 w-4" />
																			<span className="sr-only">
																				Attendance actions
																			</span>
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent
																		align="end"
																		className="w-44">
																		<DropdownMenuItem
																			onClick={() =>
																				setSelectedRecord(item)
																			}>
																			<ListCheck className="mr-2 h-4 w-4" />
																			View Details
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</div>
													</td>
												</tr>
											);
										})}
									{!isCollapsed && (
										<tr className="border-b border-neutral-200 bg-white">
											<td colSpan={9} className="px-3 py-2">
												<div className="flex items-center justify-between gap-3">
													<span className="text-xs font-medium text-gray-500">
														Showing recent {group.previewRows.length} of{" "}
														{group.stats.totalRecords ||
															group.previewRows.length}
													</span>
													<button
														type="button"
														onClick={() =>
															openAttendanceDepartment(
																group.departmentId,
															)
														}
														className="text-xs font-bold text-neutral-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline">
														View all {group.departmentName}
													</button>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		);
	};

	return (
		<div className="space-y-6">
			<Modal
				open={!!selectedRecord}
				onOpenChange={(open) => !open && setSelectedRecord(null)}
				title="Attendance Details"
				className="max-w-4xl">
				{renderSelectedAttendanceDetails()}
			</Modal>

			{/* Import Modal */}
			<GenericImportModal
				open={action === "import"}
				onOpenChange={(open) => {
					if (!open) {
						updateSearchParams((next) => next.delete("action"));
						// Reset progress when closing
						setImportJobId(null);
					}
				}}
				title="Import Attendance"
				description="Upload a CSV/Excel file to bulk import attendance records"
				fields={IMPORT_FIELDS}
				onDownloadTemplate={handleDownloadTemplate}
				onImport={handleImport}
				isImporting={importAttendanceMutation.isPending || isPolling || !!importJobId}
				importProgress={progress}
				showCreateTimesheets={true}
			/>

			{/* Attendance Filters */}
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<h2 className="text-lg font-semibold text-gray-900 shrink-0">{title}</h2>
				<div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
					<AttendanceDateFilterPopover
						triggerLabel={dateFilterTriggerLabel}
						periodValue={selectedPeriodValue}
						presetOptions={datePresetOptions}
						onPeriodSelect={handlePeriodChange}
						onOpenPresets={() => setEnablePeriodOptions(true)}
						dateRange={dateRangeObj}
						onCustomRangeChange={handleCustomDateChange}
						isDateDisabled={isAttendanceDateDisabled}
					/>
					<AttendanceScopeFilterPopover
						controls={attendanceScopeFilterControls}
						presentGt10Days={presentGt10Days}
						onPresentGt10DaysChange={setPresentGt10Days}
						onClearAll={clearScopeAndShiftFilters}
					/>
				</div>
			</div>

			<Card className="overflow-hidden rounded-md border border-neutral-200 bg-white py-0 shadow-none">
				<CardContent className="p-0">
					<div className="grid divide-y divide-neutral-200 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] xl:divide-y-0">
						{/* Utilization & Attendance */}
						<div className="min-w-0 p-4 md:p-5 xl:border-r xl:border-neutral-200">
							<div className="flex items-end justify-between mb-4">
								<div>
									<h3 className="text-sm font-medium text-neutral-600 mb-1">
										Attendance Utilization
									</h3>
									<div className="flex items-baseline gap-2">
										<span
											className={`text-3xl font-semibold tabular-nums tracking-tight ${
												activeMetricTone.appliesTo === "attendance"
													? activeMetricTone.text
													: "text-neutral-900"
											}`}>
											{metricsLoading ? "..." : `${utilizationRate}%`}
										</span>
										<span className="text-sm text-neutral-500 mb-1">
											utilization rate
										</span>
									</div>
								</div>
								<div className="text-right">
									<div className="text-2xl font-semibold tabular-nums text-neutral-900">
										{displayMetricText(clockedInCount + leaveCount)}
									</div>
									<div className="text-xs text-neutral-500">
										of {displayMetricText(workDayCount)} work days
									</div>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-[148px_1fr] md:items-center">
								{renderUtilizationGauge(
									attendanceGaugeVisual.value,
									attendanceGaugeVisual.label,
								)}
								<div className="grid gap-1">
									{renderMetricRow("On time", onTimeCount, "ON_TIME", {
										colorClassName: "bg-neutral-700",
									})}
									{renderMetricRow("Late", lateCount, "LATE", {
										colorClassName: "bg-amber-500",
									})}
									{renderMetricRow("Absent", absentCount, "ABSENT", {
										colorClassName: "bg-rose-600",
									})}
									{renderMetricRow("Early out", earlyOutCount, "EARLY_OUT", {
										colorClassName: "bg-orange-500",
									})}
									{renderMetricRow(
										"Approved OT",
										approvedOvertimeCount,
										"OVERTIME",
										{
											total: approvedOvertimeCount + unapprovedOvertimeCount,
											colorClassName: "bg-neutral-700",
										},
									)}
									{renderMetricRow(
										"Unapproved OT",
										unapprovedOvertimeCount,
										"OVERTIME",
										{
											total: approvedOvertimeCount + unapprovedOvertimeCount,
											colorClassName: "bg-amber-500",
										},
									)}
								</div>
							</div>

							<div className="mt-4 border-t border-neutral-100 pt-3">
								<h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-600">
									Clock Presence
								</h3>
								<div className="grid gap-2 sm:grid-cols-3">
									{renderPresenceRow("Clocked in", clockedInCount, "CLOCKED_IN", {
										colorClassName: "bg-neutral-600",
									})}
									{renderPresenceRow(
										"Clocked out",
										clockedOutCount,
										"CLOCKED_OUT",
										{
											total: clockedInCount,
											colorClassName: "bg-neutral-800",
										},
									)}
									{renderPresenceRow(
										"Not clocked in",
										missingClockInCount,
										"MISSING_CLOCK_IN",
										{
											colorClassName: "bg-rose-600",
										},
									)}
								</div>
							</div>
						</div>

						<div className="grid min-w-0 divide-y divide-neutral-200 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)] md:divide-x md:divide-y-0">
							{/* Leaves Balance */}
							<div className="min-w-0 p-4 md:p-5">
								<div className="flex items-end justify-between mb-4">
									<div>
										<h3 className="text-sm font-medium text-neutral-600 mb-1">
											Leave Balances
										</h3>
										<div className="flex items-baseline gap-2">
											<span
												className={`text-2xl font-semibold tabular-nums tracking-tight ${
													activeMetricTone.appliesTo === "leave"
														? activeMetricTone.text
														: "text-neutral-900"
												}`}>
												{isLoadingLeaveBalances ? "..." : `${leaveVisualRate}%`}
											</span>
											<span className="text-sm text-neutral-500 mb-1">
												{leaveVisualLabel}
											</span>
										</div>
									</div>
									<div className="text-right">
										<div className="text-xl font-semibold tabular-nums text-neutral-900">
											{displayMetricValue(leaveCount)}
										</div>
										<div className="text-xs text-neutral-500">
											active leaves
										</div>
									</div>
								</div>

								<div className="space-y-4">
									<div>
										<div className="flex items-center justify-between mb-1.5 px-1">
											<span className="text-xs font-medium text-neutral-600">
												Total Available
											</span>
											<span className="text-sm font-semibold tabular-nums text-neutral-900">
												{displayLeaveBalanceValue(
													leaveBalanceTotals.available,
												)}
											</span>
										</div>
										<div className="mb-3">
											{renderSegmentedBar(
												[
													{
														key: "available",
														value: leaveBalanceTotals.available,
														className: "bg-emerald-600",
													},
													{
														key: "used",
														value: leaveBalanceTotals.used,
														className: "bg-amber-500",
													},
													{
														key: "pending",
														value: leaveBalanceTotals.pending,
														className: "bg-neutral-500",
													},
												],
												leaveBalanceMeasuredTotal,
											)}
										</div>
										<div className="grid grid-cols-2 gap-4 px-1">
											<div>
												<div className="flex items-center justify-between gap-2 mb-1">
													<span className="text-xs text-neutral-500">
														Used
													</span>
													<span className="text-xs font-medium tabular-nums text-neutral-900">
														{displayLeaveBalanceValue(
															leaveBalanceTotals.used,
														)}
													</span>
												</div>
												<div className="h-1.5 overflow-hidden bg-neutral-200/80">
													<div
														className="h-full bg-amber-500"
														style={{
															width: `${leaveBalanceMeasuredTotal > 0 ? Math.min(100, Math.round((leaveBalanceTotals.used / leaveBalanceMeasuredTotal) * 100)) : 0}%`,
														}}
													/>
												</div>
											</div>
											<div>
												<div className="flex items-center justify-between gap-2 mb-1">
													<span className="text-xs text-neutral-500">
														Pending
													</span>
													<span className="text-xs font-medium tabular-nums text-neutral-900">
														{displayLeaveBalanceValue(
															leaveBalanceTotals.pending,
														)}
													</span>
												</div>
												<div className="h-1.5 overflow-hidden bg-neutral-200/80">
													<div
														className="h-full bg-neutral-500"
														style={{
															width: `${leaveBalanceMeasuredTotal > 0 ? Math.min(100, Math.round((leaveBalanceTotals.pending / leaveBalanceMeasuredTotal) * 100)) : 0}%`,
														}}
													/>
												</div>
											</div>
										</div>
									</div>

									{leaveBalanceTypeRows.length > 0 && (
										<div className="grid gap-1 mt-4 pt-4 border-t border-neutral-100">
											{leaveBalanceTypeRows.map((item) => {
												const leaveStatus = `LEAVE_TYPE:${item.leaveType}`;
												const periodUsed = getPeriodLeaveUsed(
													item.leaveType,
												);
												const percent = getLeaveBalancePercent(
													periodUsed,
													item.totalEntitled,
												);
												const color = getLeaveTypeColor(item.leaveType);

												return (
													<button
														type="button"
														key={item.leaveType}
														aria-pressed={isMetricActive(leaveStatus)}
														onClick={() => handleMetricFilter(leaveStatus)}
														className={`cursor-pointer border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline-none ring-1 ring-transparent focus-visible:ring-neutral-300 ${
															isMetricActive(leaveStatus)
																? "border-l-orange-500 bg-neutral-100"
																: "border-l-transparent hover:bg-neutral-50"
														}`}>
														<div className="flex items-center justify-between gap-3 text-xs mb-1.5">
															<span className="font-medium text-neutral-700 truncate">
																{formatLeaveBalanceNumber(
																	periodUsed,
																)}
																/
																{formatLeaveBalanceNumber(
																	item.totalEntitled,
																)}{" "}
																{getLeaveTypeCode(item.leaveType)}
															</span>
															<span className="text-neutral-500 tabular-nums">
																{formatLeaveBalanceNumber(
																	item.available,
																)}{" "}
																left
															</span>
														</div>
														<div className="h-1.5 overflow-hidden bg-neutral-200/80">
															<div
																className="h-full"
																style={{
																	width: `${percent}%`,
																	backgroundColor: color,
																}}
															/>
														</div>
													</button>
												);
											})}
										</div>
									)}
								</div>
							</div>

							{/* Schedule Coverage */}
							<div className="min-w-0 p-4 md:p-5">
								<div className="mb-3 flex items-end justify-between">
									<div>
										<h3 className="text-sm font-medium text-neutral-600 mb-1">
											Schedule Coverage
										</h3>
										<div className="flex items-baseline gap-2">
											<span
												className={`text-2xl font-semibold tabular-nums tracking-tight ${
													activeMetricTone.appliesTo === "schedule"
														? activeMetricTone.text
														: "text-neutral-900"
												}`}>
												{metricsLoading
													? "..."
													: `${scheduleVisual.rate}%`}
											</span>
											<span className="text-sm text-neutral-500 mb-1">
												{scheduleVisual.label}
											</span>
										</div>
									</div>
								</div>

								<div className="grid gap-1">
									{renderCompactScheduleRow("Scheduled", workDayCount, {
										total: calendarDayCount,
										colorClassName: "bg-neutral-700",
									})}
									{renderCompactScheduleRow("Off-day work", workedOnRestDayCount, {
										total: Math.max(restDayCount, workedOnRestDayCount),
										colorClassName: "bg-orange-500",
										status: "WORKED_REST_DAY",
									})}
									{renderCompactScheduleRow("Holiday work", workedOnHolidayCount, {
										total: Math.max(holidayCount, workedOnHolidayCount),
										colorClassName: "bg-amber-500",
										status: "WORKED_HOLIDAY",
									})}
									{companyEventDayCount > 0 &&
										renderCompactScheduleRow(
											"Company event",
											companyEventDayCount,
											{
												total: calendarDayCount,
												colorClassName: "bg-orange-500",
											},
										)}
									{employeesMissingScheduleCount > 0 &&
										renderCompactScheduleRow(
											"Missing schedule",
											employeesMissingScheduleCount,
											{
												total: Math.max(
													employeesMissingScheduleCount,
													workDayCount,
												),
												colorClassName: "bg-rose-600",
												status: "MISSING_SCHEDULE",
											},
										)}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{showAttendanceTrend ? (
				<AttendanceDailyTrendSection
					visible={showAttendanceTrend}
					title={trendTitle}
					description={trendDescription}
					filters={{
						dateFrom: trendDateRange.from,
						dateTo: trendDateRange.to,
						search: debouncedSearch || undefined,
						status: statusFilter,
						departmentId: departmentFilter,
						reportToId: managerFilter,
						employeeId: employeeFilter,
						shiftType: shiftTypeFilter,
					}}
				/>
			) : null}

			{viewMode === "list" ? (
				<button
					type="button"
					onClick={returnToAttendanceOverview}
					className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-orange-600">
					<ArrowLeft className="h-4 w-4" />
					Back to attendance overview
				</button>
			) : null}

			{viewMode === "overview" ? (
				renderAttendanceOverviewTable()
			) : (
				<>
					<DataTable
						title="Attendance Records"
						description={`${activeFilterLabel ? `Showing ${activeFilterLabel} records - ` : ""}Attendance from ${formatDate(metricsDateRange.from, "short")} to ${formatDate(metricsDateRange.to, "short")}`}
						data={records}
						columns={columns}
						isLoading={isLoadingTimesheets}
						emptyMessage="No attendance records found"
						searchPlaceholder="Search employees..."
						searchValue={searchQuery}
						onSearch={setSearchQuery}
						customFilters={customFilters}
						filters={advancedFilters}
						filterValues={advancedFilterValues}
						onFilterChange={handleAdvancedFilterChange}
						filterButtonLabel="Advanced Filters"
						itemsPerPage={limitParam}
						currentPage={pageParam}
						totalItems={totalRecords}
						onPageChange={handlePageChange}
						onView={(item) => setSelectedRecord(item)}
						renderActions={(item) => (
							<div className="flex items-center justify-end gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 rounded-lg"
									onClick={() => openFixAttendance(item)}
									title="Fix Attendance"
									aria-label={`Fix attendance for ${item.employeeName}`}
								>
									<FileEdit className="h-4 w-4 text-orange-600" />
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
											<MoreVertical className="h-4 w-4" />
											<span className="sr-only">Attendance actions</span>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-44">
										<DropdownMenuItem onClick={() => setSelectedRecord(item)}>
											<ListCheck className="mr-2 h-4 w-4" />
											View Details
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					/>
				</>
			)}

			{fixAttendanceRecord && (
				<AttendanceFixModal
					open={!!fixAttendanceRecord}
					onOpenChange={(open) => {
						if (!open) setFixAttendanceRecord(null);
					}}
					employeeId={getEmployeeProfileId(fixAttendanceRecord) || fixAttendanceRecord.employeeId}
					employeeName={fixAttendanceRecord.employeeName || "Unknown Employee"}
					employeeCode={fixAttendanceRecord.employeeId || ""}
					date={fixAttendanceRecord.date}
					attendanceId={fixAttendanceRecord.isVirtual ? null : fixAttendanceRecord.id}
					originalStatus={fixAttendanceRecord.status}
					originalTimeIn={fixAttendanceRecord.timeIn}
					originalTimeOut={fixAttendanceRecord.timeOut}
				/>
			)}
		</div>
	);
}
