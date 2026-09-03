import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	Eye,
	MoreVertical,
	ArrowLeft,
	Bell,
	UserRound,
	ChevronDown,
	ChevronRight,
	Loader2,
	Lock,
	Download,
	FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "~/lib/hooks/use-auth";
import timesheetService, {
	type LockPeriodTimesheetsResponse,
	type Timesheet,
} from "~/services/timesheet.service";
import {
	TIMESHEET_LIST_FIELDS,
	useTimesheets,
	useTimesheet,
	useHRTimesheetQueues,
	useLockPeriodTimesheets,
	useSendTimesheetReminder,
	useEnsurePeriodDrafts,
} from "~/lib/hooks/useTimesheets";
import { useTimesheetStatistics } from "~/lib/hooks/useMetrics";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { type Department } from "~/services/departments.service";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { TimesheetViewModal } from "~/components/organisms/TimesheetViewModal";
import { useEmployees } from "~/lib/hooks";
import { useSections } from "~/lib/hooks/useSections";
import { type Section } from "~/services/sections.service";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	HrDataTableManagerFilter,
	hrDataTableDepartmentFilterClass,
	hrDataTableFilterClass,
} from "~/components/molecules/HrDataTableFilters";
import { formatDate } from "~/lib/utils/text-utils";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import { ReportExportDialog } from "~/routes/hr/reports/components/ReportExportDialog";
import {
	exportReport,
	getReportGeneratedByName,
	type ReportExportColumn,
	type ReportExportDialogState,
	type ReportExportFormat,
} from "~/lib/utils/report-export";

const BUSINESS_TIME_ZONE = "Asia/Manila";
const PAST_PERIOD_LIMIT = 100;
const TIMESHEET_EXPORT_LIMIT = 5000;

type LockPeriodDialogState =
	| {
			mode: "confirm";
			periodId: string;
			periodLabel: string;
	  }
	| {
			mode: "result";
			periodLabel: string;
			result: LockPeriodTimesheetsResponse;
	  };

function getPayrollPeriodsFromResponse(data: any): any[] {
	return data?.payrollPeriods || data?.data?.payrollPeriods || [];
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

	return year && month && day
		? `${year}-${month}-${day}`
		: new Date().toISOString().split("T")[0];
}

function formatPeriodRange(period: any): string {
	if (!period?.startDate || !period?.endDate) return "";
	return `${formatDate(period.startDate, "short")} - ${formatDate(period.endDate, "short")}`;
}

function formatPayrollPeriodOption(period: any): string {
	const name = period?.name || period?.code || "Payroll period";
	const range = formatPeriodRange(period);
	return range ? `${name} | ${range}` : name;
}

type TimesheetQueueSection = {
	key: string;
	title: string;
	status: string[];
	count: number;
	rows: Timesheet[];
	emptyTitle: string;
	viewAllLabel: string;
};

type TimesheetExportRow = {
	businessStatus: string;
	employeeCode: string;
	employeeName: string;
	department: string;
	manager: string;
	payrollPeriod: string;
	periodStart: string;
	periodEnd: string;
	status: string;
	lockedStatus: string;
	totalHours: string;
	regularHours: string;
	overtimeHours: string;
	lateHours: string;
	undertimeEarlyOut: string;
};

type EmployeeTimesheetExportRow = {
	employeeGroup: string;
	department: string;
	employeeCode: string;
	employeeName: string;
	date: string;
	day: string;
	status: string;
	timeIn: string;
	breakTime: string;
	timeOut: string;
	totalHours: string;
	regularHours: string;
	overtimeHours: string;
	lateHours: string;
	undertimeHours: string;
	earlyOutHours: string;
	remarks: string;
};

const TIMESHEET_STATUS_OPTIONS = [
	{ value: "DRAFT", label: "Draft" },
	{ value: "SUBMITTED", label: "Submitted" },
	{ value: "APPROVED", label: "Approved" },
	{ value: "REJECTED", label: "Rejected" },
	{ value: "REVISED", label: "Revised" },
	{ value: "LOCKED", label: "Locked" },
];

const TIMESHEET_DTR_EXPORT_FIELDS = [
	...TIMESHEET_LIST_FIELDS,
	"timesheetlines.date",
	"timesheetlines.timeIn",
	"timesheetlines.timeOut",
	"timesheetlines.hoursWorked",
	"timesheetlines.regularHours",
	"timesheetlines.overtimeHours",
	"timesheetlines.undertimeHours",
	"timesheetlines.lateHours",
	"timesheetlines.earlyOutHours",
	"timesheetlines.status",
	"timesheetlines.employeeNotes",
	"timesheetlines.approverNotes",
	"timesheetlines.notes",
	"timesheetlines.metadata",
	"timesheetlines.breakMinutes",
	"timesheetlines.primaryMarker",
	"timesheetlines.isDeleted",
];

export default function TimesheetsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [collapsedQueues, setCollapsedQueues] = useState<Set<string>>(
		() => new Set(["approved"]),
	);
	const [lockPeriodDialog, setLockPeriodDialog] = useState<LockPeriodDialogState | null>(
		null,
	);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [exportingEmployeeDtrId, setExportingEmployeeDtrId] = useState<string | null>(null);
	const { user } = useAuth(); // Auth check

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const statusFilter = searchParams.get("status") || undefined;
	const departmentFilter = searchParams.get("departmentId") || undefined;
	const sectionFilter = searchParams.get("sectionId") || undefined;
	const managerFilter = searchParams.get("managerId") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const tabParam = searchParams.get("tab") || "active";
	const activeTab = tabParam === "today" ? "active" : tabParam;
	const selectedPeriodCode = searchParams.get("periodCode") || undefined;
	const employeeFilter = searchParams.get("employeeId") || undefined;
	const shouldPrepareDrafts = searchParams.get("prepareDrafts") === "1";
	const ensurePeriodDraftsMutation = useEnsurePeriodDrafts();

	// Fetch departments for filter
	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 100,
		sort: "name",
		order: "asc",
	});
	const departments = useMemo(
		() => (((departmentsData as any)?.departments || []) as Department[]),
		[departmentsData],
	);
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 500,
		sort: "name",
		order: "asc",
	});
	const sections = useMemo(
		() =>
			(((sectionsData as any)?.sections || (sectionsData as any)?.data?.sections || []) as Section[]),
		[sectionsData],
	);
	// Find current period using Manila-local date to avoid UTC date drift.
	const today = getDateKeyInTimeZone(new Date(), BUSINESS_TIME_ZONE);
	const currentPeriodFilter = `startDate<=${today},endDate>=${today}`;

	const { data: currentPeriodData } = usePayrollPeriods({
		page: 1,
		limit: 1,
		filter: currentPeriodFilter,
		sort: "startDate",
		order: "desc",
	});
	const currentPeriod = getPayrollPeriodsFromResponse(currentPeriodData)?.[0];
	const activePeriodCode =
		activeTab === "active" ? selectedPeriodCode || currentPeriod?.code : undefined;
	const lockPeriodMutation = useLockPeriodTimesheets();
	const sendReminderMutation = useSendTimesheetReminder();

	// Fetch past periods so HR can inspect older cutoffs even when a period has no timesheet yet.
	const pastPeriodFilter = `endDate<${today}`;
	const { data: pastPeriodsData } = usePayrollPeriods({
		page: 1,
		limit: PAST_PERIOD_LIMIT,
		filter: pastPeriodFilter,
		sort: "startDate",
		order: "desc",
	});
	const pastPeriods = useMemo(
		() => getPayrollPeriodsFromResponse(pastPeriodsData),
		[pastPeriodsData],
	);

	useEffect(() => {
		if (activeTab !== "past" || pastPeriods.length === 0) return;
		if (selectedPeriodCode) return;

		const fallbackPeriod = pastPeriods[0];
		if (!fallbackPeriod?.code) return;
		updateSearchParams((next) => {
			next.set("periodCode", fallbackPeriod.code);
			next.set("page", "1");
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab, pastPeriods, selectedPeriodCode]);

	// Build filter string for API (after we have currentPeriod data)
	const filterParts = [];
	if (statusFilter) {
		const statuses = statusFilter
			.split(",")
			.map((status) => status.trim())
			.filter(Boolean);
		if (statuses.length > 1) {
			filterParts.push(`or(${statuses.map((status) => `status:${status}`).join(";")})`);
		} else {
			filterParts.push(`status:${statusFilter}`);
		}
	}
	if (departmentFilter && departmentFilter !== "all") {
		filterParts.push(`employee.departmentId:${departmentFilter}`);
	}
	if (sectionFilter && sectionFilter !== "all") {
		filterParts.push(`employee.sectionId:${sectionFilter}`);
	}

	// Filter by reporting manager
	if (managerFilter && managerFilter !== "all") {
		filterParts.push(`employee.reportToId:${managerFilter}`);
	}

	// Filter by employee ID (deep linking support)
	if (employeeFilter) {
		filterParts.push(`employeeId:${employeeFilter}`);
	}

	// Filter by payroll period. The past tab must always exclude active/future periods,
	// even when "All Periods" is selected.
	if (activeTab === "active" && activePeriodCode) {
		filterParts.push(`payrollPeriod.code:${activePeriodCode}`);
	} else if (activeTab === "past" && selectedPeriodCode && selectedPeriodCode !== "all") {
		filterParts.push(`payrollPeriod.code:${selectedPeriodCode}`);
	} else if (activeTab === "past") {
		filterParts.push(`payrollPeriod.endDate<${today}`);
	}

	const filterString = filterParts.length > 0 ? filterParts.join(",") : undefined;
	const canFetchTimesheets = activeTab !== "active" || Boolean(activePeriodCode);
	const queueFilterString = useMemo(() => {
		const queueFilterParts: string[] = [];
		if (departmentFilter && departmentFilter !== "all") {
			queueFilterParts.push(`employee.departmentId:${departmentFilter}`);
		}
		if (sectionFilter && sectionFilter !== "all") {
			queueFilterParts.push(`employee.sectionId:${sectionFilter}`);
		}
		if (managerFilter && managerFilter !== "all") {
			queueFilterParts.push(`employee.reportToId:${managerFilter}`);
		}
		if (employeeFilter) {
			queueFilterParts.push(`employeeId:${employeeFilter}`);
		}
		if (activeTab === "active" && activePeriodCode) {
			queueFilterParts.push(`payrollPeriod.code:${activePeriodCode}`);
		}
		return queueFilterParts.length > 0 ? queueFilterParts.join(",") : undefined;
	}, [activePeriodCode, activeTab, departmentFilter, employeeFilter, managerFilter, sectionFilter]);
	const isActiveOverview =
		activeTab === "active" &&
		!statusFilter &&
		!searchQuery &&
		!employeeFilter &&
		pageParam === 1;

	const { data: timesheetsData, isLoading } = useTimesheets({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
		enabled: canFetchTimesheets && !isActiveOverview,
	});
	const { data: timesheetQueuesData, isLoading: isLoadingQueues } = useHRTimesheetQueues({
		limit: 5,
		queueLimit: 5,
		filter: queueFilterString,
		count: true,
		enabled: activeTab === "active" && Boolean(activePeriodCode),
	});

	const { data: managersData } = useEmployees({
		page: 1,
		limit: 100, // Reasonable limit for managers list
		filter: "directReports:exists",
	});

	const navigate = useNavigate();
	const items: Timesheet[] = (timesheetsData as any)?.timesheets || [];

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	// Single timesheet ID for fetching the view modal.
	const activeTimesheetId = action === "view" ? id : null;
	const isTimesheetViewOpen = action === "view" && Boolean(activeTimesheetId);

	// Single useTimesheet hook for all modals (edit, view, delete)
	const { data: activeTimesheet, isLoading: isLoadingTimesheet } = useTimesheet(
		activeTimesheetId || "",
		{
			enabled: Boolean(activeTimesheetId),
			...(isTimesheetViewOpen
				? { staleTime: 0, refetchOnMount: "always" as const }
				: {}),
		},
	);

	// Sync tab state from URL if not present (separate effect to avoid dependency issues)
	useEffect(() => {
		if (!searchParams.get("tab") || searchParams.get("tab") === "today") {
			updateSearchParams((next) => {
				next.set("tab", "active");
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Fetch managers for filter

	const managers = (managersData as any)?.employees || [];
	const managerFilterOptions = [
		{ value: "all", label: "All Manager" },
		...managers.map((manager: any) => {
			const firstName = manager.person?.personalInfo?.firstName || "";
			const lastName = manager.person?.personalInfo?.lastName || "";
			return {
				value: manager.id,
				label: `${firstName} ${lastName}`.trim() || manager.employeeId || "Unnamed Manager",
			};
		}),
	];

	const filterOptions: FilterOption[] = [
		{
			key: "status",
			label: "Status",
			options: TIMESHEET_STATUS_OPTIONS,
		},
		...(activeTab === "past"
			? [
					{
						key: "periodCode",
						label: "Period",
						options: pastPeriods.map((period: any) => ({
							value: period.code || period.id,
							label: formatPayrollPeriodOption(period),
						})),
					},
				]
			: []),
	];
	const advancedFilterValues = {
		status: statusFilter && !statusFilter.includes(",") ? statusFilter : "",
		...(activeTab === "past" ? { periodCode: selectedPeriodCode || "" } : {}),
	};

	const columns: Column<Timesheet>[] = [
		{
			key: "employeeId",
			label: "Employee",
			width: "250px",
			render: (value, item) => {
				// Safely access nested properties
				const firstName = (item as any).employee?.person?.personalInfo?.firstName || "";
				const lastName = (item as any).employee?.person?.personalInfo?.lastName || "";
				const fullName = `${firstName} ${lastName}`.trim();

				return (
					<EmployeeTableCell
						profileId={(item as any).employee?.id}
						fullName={fullName || item.employeeId || "-"}
						employeeId={getEmployeeCode(item)}
						avatar={item.employee?.user?.avatar || null}
					/>
				);
			},
		},
		{
			key: "payrollPeriodId", // Using ID for key, but rendering period info
			label: "Period",
			width: "200px",
			render: (value, item) => (
				<div className="flex flex-col text-sm">
					{item.payrollPeriod ? (
						<>
							<span className="font-medium">{item.payrollPeriod.name}</span>

							<span className="text-gray-500 text-xs mt-1">
								{formatDate(item.payrollPeriod.startDate, "short")} -{" "}
								{formatDate(item.payrollPeriod.endDate, "short")}
							</span>
						</>
					) : (
						<span className="text-gray-400">-</span>
					)}
				</div>
			),
		},
		{
			key: "status",
			label: "Status",
			width: "130px",
			render: (value, item) => {
				return <StatusBadge status={item.lockedAt ? "LOCKED" : value} />;
			},
		},
		{
			key: "totalHoursWorked",
			label: "Total Hours",
			width: "120px",
			render: (value) => <span className="font-mono font-medium">{value || "0:00"}</span>,
		},
		{
			key: "totalOvertimeHours",
			label: "Overtime",
			width: "120px",
			render: (value) => (
				<span
					className={`font-mono font-medium ${
						value && value !== "0:00" ? "text-green-600" : "text-gray-400"
					}`}>
					{value || "0:00"}
				</span>
			),
		},
		{
			key: "totalLateHours",
			label: "Late",
			width: "100px",
			render: (value) => (
				<span
					className={`font-mono font-medium ${
						value && value !== "0:00" ? "text-red-600" : "text-gray-400"
					}`}>
					{value || "0:00"}
				</span>
			),
		},
	];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const handleView = (timesheet: Timesheet) => {
		const timesheetId = timesheet.id;
		if (!timesheetId) return;
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", timesheetId);
		});
	};

	const getTimesheetDisplayStatus = (item: Timesheet) =>
		item.lockedAt ? "LOCKED" : String(item.status || "").toUpperCase();

	const getEmployeeFullName = (employee?: Timesheet["employee"]) => {
		const firstName = employee?.person?.personalInfo?.firstName || "";
		const lastName = employee?.person?.personalInfo?.lastName || "";
		return `${firstName} ${lastName}`.trim();
	};

	const getEmployeeAvatar = (item: Timesheet) => item.employee?.user?.avatar || null;

	const getEmployeeCode = (item: Timesheet) => {
		const rawEmployeeId = String(item.employeeId || "");
		const nestedEmployeeId = String(item.employee?.employeeId || "").trim();
		const nestedEmployeeCode = String(item.employee?.employeeCode || "").trim();
		return (
			nestedEmployeeId ||
			nestedEmployeeCode ||
			(/^[0-9a-f]{24}$/i.test(rawEmployeeId) ? "" : rawEmployeeId) ||
			"-"
		);
	};

	const getManagerName = (employee?: Timesheet["employee"]) => {
		const manager = employee?.reportTo as any;
		if (!manager) return "Unassigned";
		const firstName = manager.firstName || manager.person?.personalInfo?.firstName || "";
		const lastName = manager.lastName || manager.person?.personalInfo?.lastName || "";
		return `${firstName} ${lastName}`.trim() || manager.employeeId || manager.employeeCode || "Unassigned";
	};

	const getSupervisorName = (item: Timesheet) => {
		const manager = item.employee?.reportTo as any;
		if (!manager) return "assigned supervisor";
		const firstName = manager.firstName || manager.person?.personalInfo?.firstName || "";
		const lastName = manager.lastName || manager.person?.personalInfo?.lastName || "";
		const name = `${firstName} ${lastName}`.trim();
		return name || manager.employeeId || "assigned supervisor";
	};

	const getReminderTarget = (item: Timesheet) => {
		const status = getTimesheetDisplayStatus(item);
		const employeeName =
			getEmployeeFullName(item.employee) ||
			item.employee?.employeeId ||
			item.employeeId ||
			"Employee";

		if (status === "SUBMITTED") {
			return {
				label: "Manager approval",
				target: getSupervisorName(item),
				kind: "manager_approval" as const,
			};
		}

		if (status === "DRAFT") {
			return {
				label: "Employee submission",
				target: employeeName,
				kind: "employee_submit" as const,
			};
		}

		if (status === "REJECTED" || status === "REVISED") {
			return {
				label: "Employee correction",
				target: employeeName,
				kind: "employee_correct" as const,
			};
		}

		return {
			label: "Payroll Ready",
			target: "No reminder needed",
			kind: null,
		};
	};

	const openEmployeeProfile = (item: Timesheet) => {
		const profileId = item.employee?.id;
		if (!profileId) {
			toast.error("Employee profile is not available for this timesheet.");
			return;
		}
		navigate(`/employee/${profileId}`);
	};

	const handleReminderAction = (
		item: Timesheet,
		kind: "manager_approval" | "employee_submit" | "employee_correct",
	) => {
		if (!item.id) {
			toast.error("Timesheet is not available for reminders.");
			return;
		}
		sendReminderMutation.mutate({ timesheetId: item.id, kind });
	};

	const renderActions = (item: Timesheet) => {
		const status = getTimesheetDisplayStatus(item);
		const shouldRemindManager = status === "SUBMITTED";
		const shouldRemindToSubmit = status === "DRAFT";
		const shouldRemindToCorrect = status === "REJECTED" || status === "REVISED";

		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="w-8 h-8 p-0">
						<MoreVertical className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuItem onClick={() => handleView(item)}>
						<Eye className="h-4 w-4 mr-2" /> View Timesheet
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => void handleEmployeeTimesheetExport(item)}
						disabled={exportingEmployeeDtrId === item.id}>
						{exportingEmployeeDtrId === item.id ? (
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						) : (
							<FileText className="h-4 w-4 mr-2" />
						)}
						Export Employee Timesheet
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openEmployeeProfile(item)}>
						<UserRound className="h-4 w-4 mr-2" /> Open Employee Profile
					</DropdownMenuItem>

					{shouldRemindManager || shouldRemindToSubmit || shouldRemindToCorrect ? (
						<>
							<DropdownMenuSeparator />
							{shouldRemindManager ? (
								<DropdownMenuItem
									disabled={sendReminderMutation.isPending}
									onClick={() => handleReminderAction(item, "manager_approval")}>
									<Bell className="h-4 w-4 mr-2" /> Remind Manager
								</DropdownMenuItem>
							) : null}
							{shouldRemindToSubmit ? (
								<DropdownMenuItem
									disabled={sendReminderMutation.isPending}
									onClick={() => handleReminderAction(item, "employee_submit")}>
									<Bell className="h-4 w-4 mr-2" /> Remind Employee to Submit
								</DropdownMenuItem>
							) : null}
							{shouldRemindToCorrect ? (
								<DropdownMenuItem
									disabled={sendReminderMutation.isPending}
									onClick={() => handleReminderAction(item, "employee_correct")}>
									<Bell className="h-4 w-4 mr-2" /> Remind Employee to Correct
								</DropdownMenuItem>
							) : null}
						</>
					) : null}

				</DropdownMenuContent>
			</DropdownMenu>
		);
	};

	// Check if modal should show loading state for deep links
	const isDeepLinkLoading = !!activeTimesheetId && isLoadingTimesheet;

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

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			if (filters.status && filters.status !== "all") {
				next.set("status", filters.status);
			} else {
				next.delete("status");
			}
			if (activeTab === "past") {
				if (filters.periodCode && filters.periodCode !== "all") {
					next.set("periodCode", filters.periodCode);
				} else {
					next.delete("periodCode");
				}
			}

			if (filters.departmentId) {
				if (filters.departmentId === "all") {
					next.delete("departmentId");
					next.delete("sectionId");
				} else {
					next.set("departmentId", filters.departmentId);
				}
			}

			if (filters.sectionId) {
				if (filters.sectionId === "all") {
					next.delete("sectionId");
				} else {
					next.set("sectionId", filters.sectionId);
				}
			}

			if (filters.managerId) {
				if (filters.managerId === "all") {
					next.delete("managerId");
				} else {
					next.set("managerId", filters.managerId);
				}
			}

			next.set("page", "1");
		});
	};

	const handleDepartmentScopeChange = (departmentId: string) => {
		updateSearchParams((next) => {
			if (departmentId === "all") {
				next.delete("departmentId");
			} else {
				next.set("departmentId", departmentId);
			}
			next.delete("sectionId");
			next.set("page", "1");
		});
	};

	const handleSectionScopeChange = (departmentId: string, sectionId: string) => {
		updateSearchParams((next) => {
			next.set("departmentId", departmentId);
			next.set("sectionId", sectionId);
			next.set("page", "1");
		});
	};

	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	const handleTabChange = (tab: string) => {
		updateSearchParams((next) => {
			next.set("tab", tab);
			// Reset page when switching tabs
			next.set("page", "1");
			// Clear period selection when switching to active tab
			if (tab === "active") {
				next.delete("periodId");
			}
			if (tab !== "past") {
				next.delete("periodCode");
			}
		});
	};

	// Calculate metrics via Backend
	const activePeriodId = useMemo(() => {
		if (activeTab === "active") return currentPeriod?.id;
		if (activeTab === "past") {
			return pastPeriods.find((p: any) => p.code === selectedPeriodCode)?.id;
		}
		return undefined;
	}, [activeTab, currentPeriod, pastPeriods, selectedPeriodCode]);

	const statsFilter = useMemo(() => {
		const filter: Record<string, any> = {};
		if (departmentFilter && departmentFilter !== "all") filter.departmentId = departmentFilter;
		if (sectionFilter && sectionFilter !== "all") filter.sectionId = sectionFilter;
		if (managerFilter && managerFilter !== "all") filter.managerId = managerFilter;
		if (activePeriodId) filter.payrollPeriodId = activePeriodId;
		return filter;
	}, [departmentFilter, sectionFilter, managerFilter, activePeriodId]);

	const { data: statsData } = useTimesheetStatistics(statsFilter, {
		enabled: activeTab !== "active",
	});

	useEffect(() => {
		if (!shouldPrepareDrafts || !activePeriodId) return;
		if (!statusFilter?.split(",").map((status) => status.trim()).includes("DRAFT")) return;

		let cancelled = false;
		const prepareDrafts = async () => {
			try {
				for (let attempt = 0; attempt < 5; attempt += 1) {
					const result = await ensurePeriodDraftsMutation.mutateAsync({
						payrollPeriodId: activePeriodId,
						createLimit: 500,
					});
					if (cancelled) return;
					if (!result.remainingDraftsToPrepare || result.remainingDraftsToPrepare <= 0) {
						break;
					}
				}
			} catch (error: any) {
				toast.error(error?.message || "Failed to prepare draft timesheets.");
			} finally {
				if (!cancelled) {
					updateSearchParams((next) => {
						next.delete("prepareDrafts");
					});
				}
			}
		};

		prepareDrafts();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activePeriodId, shouldPrepareDrafts, statusFilter]);

	const metrics = useMemo(() => {
		if (activeTab === "active" && timesheetQueuesData?.timesheetSummary) {
			const summary = timesheetQueuesData.timesheetSummary;
			const total = summary.total || 0;
			return {
				total,
				submitted: summary.submitted || 0,
				approved: summary.approved || 0,
				actionRequired: summary.correction || 0,
				draft: summary.draft || 0,
				approvalRate: total > 0 ? Math.round(((summary.approved || 0) / total) * 100) : 0,
				submissionRate:
					total > 0 ? Math.round(((summary.submitted || 0) / total) * 100) : 0,
				actionRate: total > 0 ? Math.round(((summary.correction || 0) / total) * 100) : 0,
				draftRate: total > 0 ? Math.round(((summary.draft || 0) / total) * 100) : 0,
			};
		}
		if (!statsData?.metrics?.timesheetStatistics) {
			return {
				total: 0,
				submitted: 0,
				approved: 0,
				actionRequired: 0,
				draft: 0,
				approvalRate: 0,
				submissionRate: 0,
				actionRate: 0,
				draftRate: 0,
			};
		}
		return statsData.metrics.timesheetStatistics;
	}, [activeTab, statsData, timesheetQueuesData?.timesheetSummary]);

	const summaryPeriodLabel =
		activeTab === "past"
			? selectedPeriodCode && selectedPeriodCode !== "all"
				? "Selected period"
				: "Past periods"
			: "Active period";
	const selectedPastPeriod = useMemo(
		() =>
			activeTab === "past" && selectedPeriodCode && selectedPeriodCode !== "all"
				? pastPeriods.find((period: any) => period.code === selectedPeriodCode)
				: null,
		[activeTab, pastPeriods, selectedPeriodCode],
	);
	const selectedPeriodMeta =
		activeTab === "active"
			? formatPeriodRange(currentPeriod)
			: selectedPastPeriod
				? formatPeriodRange(selectedPastPeriod)
				: `${pastPeriods.length} recent period${pastPeriods.length === 1 ? "" : "s"}`;

	const timesheetStats = [
		{
			label: summaryPeriodLabel,
			value: metrics.total,
			meta: selectedPeriodMeta || "Total timesheets",
		},
		{
			label: "Employee follow-up",
			value: metrics.draft + metrics.actionRequired,
			meta: `${metrics.draft} draft / ${metrics.actionRequired} correction`,
		},
		{
			label: "Manager approval",
			value: metrics.submitted,
			meta: "Submitted, waiting review",
		},
		{
			label: "Payroll ready",
			value: metrics.approved,
			meta: "Approved timesheets",
		},
	];

	const reportTotalRows =
		isActiveOverview
			? metrics.total
			: Number((timesheetsData as any)?.pagination?.total ?? (timesheetsData as any)?.count ?? items.length);
	const isSinglePeriodExportScope =
		activeTab === "active" || Boolean(selectedPeriodCode && selectedPeriodCode !== "all");
	const isDepartmentExportScope = Boolean(departmentFilter && departmentFilter !== "all");
	const isManagerExportScope = Boolean(managerFilter && managerFilter !== "all");
	const isEmployeeExportScope = Boolean(employeeFilter);

	const formatExportDate = (value?: string | null) => (value ? formatDate(value, "short") : "-");
	const buildUndertimeEarlyOutValue = (item: Timesheet) => {
		const undertime = item.totalUndertimeHours || "0:00";
		const earlyOut = item.totalEarlyOutHours || "0:00";
		return earlyOut && earlyOut !== "0:00" ? `${undertime} / ${earlyOut}` : undertime;
	};
	const formatExportDateKey = (value?: string | null) => {
		if (!value) return "-";
		const textValue = String(value);
		if (/^\d{4}-\d{2}-\d{2}/.test(textValue)) return textValue.slice(0, 10);
		return formatExportDate(value);
	};
	const getTimesheetBusinessStatus = (item: Timesheet) => {
		const status = getTimesheetDisplayStatus(item);
		if (status === "DRAFT") return "Needs Employee Submission";
		if (status === "SUBMITTED") return "Needs Manager Approval";
		if (status === "REJECTED" || status === "REVISED") return "Needs Employee Correction";
		if (status === "APPROVED" || status === "LOCKED") return "Payroll Ready";
		return status || "-";
	};
	const mapTimesheetToExportRow = (item: Timesheet): TimesheetExportRow => {
		const employeeName = getEmployeeFullName(item.employee);
		const period = item.payrollPeriod;
		return {
			businessStatus: getTimesheetBusinessStatus(item),
			employeeCode: getEmployeeCode(item),
			employeeName: employeeName || getEmployeeCode(item),
			department: item.employee?.department?.name || "Unassigned",
			manager: getManagerName(item.employee),
			payrollPeriod: period?.name || period?.code || "-",
			periodStart: formatExportDateKey(period?.startDate),
			periodEnd: formatExportDateKey(period?.endDate),
			status: getTimesheetDisplayStatus(item),
			lockedStatus: item.lockedAt ? "Yes" : "No",
			totalHours: item.totalHoursWorked || "0:00",
			regularHours: item.totalRegularHours || "0:00",
			overtimeHours: item.totalOvertimeHours || "0:00",
			lateHours: item.totalLateHours || "0:00",
			undertimeEarlyOut: buildUndertimeEarlyOutValue(item),
		};
	};
	const getTimesheetExportColumns = (
		options: { includeStatusColumn?: boolean } = {},
	): ReportExportColumn<TimesheetExportRow>[] => [
		...(isEmployeeExportScope
			? []
			: ([
					{ header: "Employee ID", accessor: "employeeCode", widthWeight: 0.9 },
					{ header: "Employee Name", accessor: "employeeName", widthWeight: 1.6 },
				] as ReportExportColumn<TimesheetExportRow>[])),
		...(isDepartmentExportScope
			? []
			: ([
					{ header: "Department", accessor: "department", widthWeight: 1.2 },
				] as ReportExportColumn<TimesheetExportRow>[])),
		...(isManagerExportScope
			? []
			: ([{ header: "Manager", accessor: "manager", widthWeight: 1.2 }] as ReportExportColumn<TimesheetExportRow>[])),
		...(isSinglePeriodExportScope
			? []
			: ([
					{ header: "Payroll Period", accessor: "payrollPeriod", widthWeight: 1.25 },
					{ header: "Period Start", accessor: "periodStart", widthWeight: 1.05 },
					{ header: "Period End", accessor: "periodEnd", widthWeight: 1.05 },
				] as ReportExportColumn<TimesheetExportRow>[])),
		...(options.includeStatusColumn === false
			? []
			: ([{ header: "Status", accessor: "status", widthWeight: 0.75 }] as ReportExportColumn<TimesheetExportRow>[])),
		{ header: "Locked", accessor: "lockedStatus", widthWeight: 0.55 },
		{ header: "Total Hours", accessor: "totalHours", align: "right", widthWeight: 0.8 },
		{ header: "Regular Hours", accessor: "regularHours", align: "right", widthWeight: 0.85 },
		{ header: "Overtime", accessor: "overtimeHours", align: "right", widthWeight: 0.75 },
		{ header: "Late", accessor: "lateHours", align: "right", widthWeight: 0.65 },
		{ header: "Undertime / EO", accessor: "undertimeEarlyOut", align: "right", widthWeight: 1 },
	];
	const getExportScopeTitle = () => {
		const periodLabel =
			activeTab === "active"
				? currentPeriod?.name || activePeriodCode || "Active Payroll Period"
				: selectedPastPeriod?.name ||
					(selectedPeriodCode && selectedPeriodCode !== "all"
						? selectedPeriodCode
						: "Past Periods");
		const scopeParts = [
			periodLabel,
			isDepartmentExportScope
				? departments.find((dept: Department) => dept.id === departmentFilter)?.name
				: null,
			sectionFilter && sectionFilter !== "all"
				? sections.find((section) => section.id === sectionFilter)?.name
				: null,
			isManagerExportScope
				? getEmployeeFullName(managers.find((manager: any) => manager.id === managerFilter))
				: null,
			isEmployeeExportScope ? "Employee" : null,
		].filter(Boolean);
		return scopeParts.join(" / ");
	};
	const businessStatusOrder = [
		"Needs Employee Submission",
		"Needs Manager Approval",
		"Needs Employee Correction",
		"Payroll Ready",
	];
	const exportGrouping = [
		{
			id: "department",
			label: "Department",
			getValue: (row: TimesheetExportRow) => row.department,
		},
		{
			id: "manager",
			label: "Manager",
			getValue: (row: TimesheetExportRow) => row.manager,
		},
		{
			id: "employee",
			label: "Employee",
			getValue: (row: TimesheetExportRow) => `${row.employeeName} (${row.employeeCode})`,
		},
		{
			id: "businessStatus",
			label: "Business Status",
			getValue: (row: TimesheetExportRow) => row.businessStatus,
			sortOrder: businessStatusOrder,
		},
	];
	const buildTimesheetExportTallies = (rows: TimesheetExportRow[]) => {
		const counts = rows.reduce<Record<string, number>>((acc, row) => {
			acc[row.businessStatus] = (acc[row.businessStatus] || 0) + 1;
			return acc;
		}, {});
		return [
			...businessStatusOrder.map((label) => ({
				label,
				value: counts[label] || 0,
			})),
			{ label: "Grand Total", value: rows.length },
		];
	};
	const buildTimesheetCompactSummaryLine = (rows: TimesheetExportRow[]) => {
		const tallies = buildTimesheetExportTallies(rows);
		const summaryParts = tallies
			.filter((item) => item.label !== "Grand Total")
			.filter((item) => item.value > 0)
			.map((item) => {
				const readableLabel =
					item.label === "Needs Employee Submission"
						? "awaiting employee submission"
						: item.label === "Needs Manager Approval"
							? "awaiting manager approval"
							: item.label === "Needs Employee Correction"
								? "needing employee correction"
								: item.label === "Payroll Ready"
									? "payroll ready"
									: item.label.toLowerCase();
				return `${item.value} ${readableLabel}`;
			});
		const timesheetLabel = rows.length === 1 ? "timesheet" : "timesheets";
		return summaryParts.length
			? `${rows.length} ${timesheetLabel}: ${summaryParts.join(", ")}`
			: `${rows.length} ${timesheetLabel}`;
	};
	const buildTimesheetExportConfig = (
		rows: TimesheetExportRow[],
		options: { forPdf?: boolean } = {},
	) => ({
		reportKey: "hr-timesheets",
		title: `HR Timesheet Summary - ${getExportScopeTitle()}`,
		fileBaseName: `hr-timesheet-summary-${activeTab}-${activePeriodCode || selectedPeriodCode || today}`,
		rows,
		columns: getTimesheetExportColumns({ includeStatusColumn: !options.forPdf }),
		grouping: exportGrouping,
		summaryRows: buildTimesheetExportTallies(rows),
		compactSummaryLine: options.forPdf ? buildTimesheetCompactSummaryLine(rows) : undefined,
		orientation: "landscape" as const,
		organizationName: "BANDAI NAMCO PHILIPPINES INC.",
		generatedBy: getReportGeneratedByName(user),
		emptyStateMessage: "No timesheets found for the selected filters",
	});
	const openExportModal = () => {
		if (!canFetchTimesheets) {
			toast.error("No payroll period is available for export.");
			return;
		}
		if (reportTotalRows === 0) {
			toast.error("No timesheets match the current filters.");
			return;
		}
		setIsExportModalOpen(true);
	};
	const fetchTimesheetExportRows = async () => {
		const targetLimit = Math.min(
			Math.max(reportTotalRows || items.length || 100, limitParam, 100),
			TIMESHEET_EXPORT_LIMIT,
		);
		const response = await timesheetService.getTimesheetsForExport({
			fields: TIMESHEET_LIST_FIELDS.join(","),
			page: 1,
			limit: targetLimit,
			query: searchQuery,
			filter: filterString,
		});
		const total = Number(response.pagination?.total ?? response.count ?? response.timesheets?.length ?? 0);
		if (total > (response.timesheets || []).length) {
			throw new Error(
				`Export scope has ${total} timesheets, but only ${(response.timesheets || []).length} were returned. Narrow the scope before exporting.`,
			);
		}
		return (response.timesheets || []).map(mapTimesheetToExportRow);
	};
	const fetchTimesheetsForEmployeeExport = async () => {
		const targetLimit = Math.min(
			Math.max(reportTotalRows || items.length || 100, limitParam, 100),
			TIMESHEET_EXPORT_LIMIT,
		);
		const response = await timesheetService.getTimesheetsForExport({
			fields: TIMESHEET_DTR_EXPORT_FIELDS.join(","),
			page: 1,
			limit: targetLimit,
			query: searchQuery,
			filter: filterString,
		});
		const total = Number(response.pagination?.total ?? response.count ?? response.timesheets?.length ?? 0);
		if (total > (response.timesheets || []).length) {
			throw new Error(
				`Export scope has ${total} timesheets, but only ${(response.timesheets || []).length} were returned. Narrow the scope before exporting.`,
			);
		}
		return response;
	};
	const handleExport = async (
		format: ReportExportFormat,
		exportState: ReportExportDialogState,
	) => {
		try {
			setIsExporting(true);
			if (exportState.reportMode === "employee-timesheet-pdf") {
				const response = await fetchTimesheetsForEmployeeExport();
				const employeeRows = mapTimesheetsToEmployeeRows(response.timesheets || []);
				if (!employeeRows.length) {
					toast.error("No employee timesheet rows are available for the selected scope.");
					return;
				}
				await exportReport({
					format,
					config: {
						reportKey: "employee-timesheets",
						title: `Employee Timesheet - ${getExportScopeTitle()}`,
						fileBaseName: `employee-timesheets-${activeTab}-${activePeriodCode || selectedPeriodCode || today}`,
						rows: employeeRows,
						columns: employeeTimesheetExportColumns,
						grouping: [
							{
								id: "employee",
								label: "Employee",
								getValue: (row: EmployeeTimesheetExportRow) => row.employeeGroup,
							},
						],
						orientation: "landscape",
						organizationName: "BANDAI NAMCO PHILIPPINES INC.",
						generatedBy: getReportGeneratedByName(user),
						emptyStateMessage: "No employee timesheet rows found",
					},
					options: { includeFiltersSummary: false, groupBy: "employee" },
				});
				setIsExportModalOpen(false);
				return;
			}
			const rows = await fetchTimesheetExportRows();
			if (!rows.length) {
				toast.error("No timesheets match the current filters.");
				return;
			}
			await exportReport({
				format,
				config: buildTimesheetExportConfig(rows, { forPdf: format === "pdf" }),
				options: {
					...exportState,
					includeFiltersSummary: false,
					groupBy: format === "pdf" ? "businessStatus" : undefined,
				},
			});
			setIsExportModalOpen(false);
		} catch (error: any) {
			toast.error(error?.message || "Failed to export HR timesheets.");
		} finally {
			setIsExporting(false);
		}
	};

	const formatDtrClock = (value?: string | null) => {
		if (!value) return "-";
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return "-";
		return parsed.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	const formatDtrDayName = (value?: string | null) => {
		if (!value) return "-";
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return "-";
		return parsed.toLocaleDateString("en-US", { weekday: "short" });
	};

	const formatBreakTime = (line: any) => {
		const breakDisplay = line?.metadata?.breakDisplay;
		if (typeof breakDisplay === "string" && breakDisplay.trim()) return breakDisplay;
		const breakMinutes = Number(line?.metadata?.breakMinutes ?? line?.breakMinutes ?? 0);
		if (!Number.isFinite(breakMinutes) || breakMinutes <= 0) return "-";
		return `${breakMinutes}m`;
	};

	const buildEmployeeTimesheetRemarks = (line: any) => {
		const remarks = [
			line?.primaryMarker && line.primaryMarker !== "HOURS" ? line.primaryMarker : null,
			line?.employeeNotes,
			line?.approverNotes,
			line?.notes,
		]
			.map((value) => String(value || "").trim())
			.filter(Boolean);
		return remarks.length ? remarks.join(" / ") : "-";
	};

	const mapTimesheetToEmployeeRows = (timesheet: Timesheet): EmployeeTimesheetExportRow[] => {
		const breakdown = Array.isArray(timesheet.breakdown) ? timesheet.breakdown : [];
		const employeeName = getEmployeeFullName(timesheet.employee) || getEmployeeCode(timesheet);
		const employeeCode = getEmployeeCode(timesheet);
		const department = timesheet.employee?.department?.name || "Unassigned";
		const employeeGroup = isDepartmentExportScope
			? `${employeeName} (${employeeCode})`
			: `${department} / ${employeeName} (${employeeCode})`;
		return breakdown.map((line: any) => {
			const date = line?.metadata?.businessDate || line?.businessDate || line?.date;
			return {
				employeeGroup,
				department,
				employeeCode,
				employeeName,
				date: formatExportDateKey(date),
				day: formatDtrDayName(date),
				status: line?.status || "-",
				timeIn: formatDtrClock(line?.timeIn),
				breakTime: formatBreakTime(line),
				timeOut: formatDtrClock(line?.timeOut),
				totalHours: line?.hoursWorked || "0:00",
				regularHours: line?.regularHours || "0:00",
				overtimeHours: line?.overtimeHours || "0:00",
				lateHours: line?.lateHours || "0:00",
				undertimeHours: line?.undertimeHours || "0:00",
				earlyOutHours: line?.earlyOutHours || "0:00",
				remarks: buildEmployeeTimesheetRemarks(line),
			};
		});
	};

	const mapTimesheetsToEmployeeRows = (timesheets: Timesheet[]) =>
		timesheets
			.flatMap(mapTimesheetToEmployeeRows)
			.sort((left, right) => {
				const groupCompare = left.employeeGroup.localeCompare(right.employeeGroup);
				if (groupCompare !== 0) return groupCompare;
				return left.date.localeCompare(right.date);
			});

	const employeeTimesheetExportColumns: ReportExportColumn<EmployeeTimesheetExportRow>[] = [
		{ header: "Date", accessor: "date", widthWeight: 0.9 },
		{ header: "Day", accessor: "day", widthWeight: 0.55 },
		{ header: "Status", accessor: "status", widthWeight: 0.9 },
		{ header: "Time In", accessor: "timeIn", widthWeight: 0.75 },
		{ header: "Break", accessor: "breakTime", widthWeight: 0.6 },
		{ header: "Time Out", accessor: "timeOut", widthWeight: 0.75 },
		{ header: "Total", accessor: "totalHours", align: "right", widthWeight: 0.7 },
		{ header: "Regular", accessor: "regularHours", align: "right", widthWeight: 0.7 },
		{ header: "OT", accessor: "overtimeHours", align: "right", widthWeight: 0.55 },
		{ header: "Late", accessor: "lateHours", align: "right", widthWeight: 0.55 },
		{ header: "Undertime", accessor: "undertimeHours", align: "right", widthWeight: 0.75 },
		{ header: "Early Out", accessor: "earlyOutHours", align: "right", widthWeight: 0.75 },
		{ header: "Remarks", accessor: "remarks", widthWeight: 1.4 },
	];

	const handleEmployeeTimesheetExport = async (item: Timesheet) => {
		if (!item.id || exportingEmployeeDtrId) return;
		try {
			setExportingEmployeeDtrId(item.id);
			const timesheet = await timesheetService.getTimesheetById(item.id);
			const rows = mapTimesheetToEmployeeRows(timesheet);
			if (!rows.length) {
				toast.error("No employee timesheet rows are available for this employee.");
				return;
			}
			const employeeName =
				getEmployeeFullName(timesheet.employee) || getEmployeeCode(timesheet);
			const employeeCode = getEmployeeCode(timesheet);
			const period = timesheet.payrollPeriod;
			await exportReport({
				format: "pdf",
				config: {
					reportKey: "employee-timesheet",
					title: `Employee Timesheet - ${employeeName}`,
					fileBaseName: `employee-timesheet-${employeeCode}-${period?.code || today}`,
					rows,
					columns: employeeTimesheetExportColumns,
					orientation: "landscape",
					organizationName: "BANDAI NAMCO PHILIPPINES INC.",
					generatedBy: getReportGeneratedByName(user),
					emptyStateMessage: "No employee timesheet rows found",
				},
				options: { includeFiltersSummary: false },
			});
		} catch (error: any) {
			toast.error(error?.message || "Failed to export employee timesheet.");
		} finally {
			setExportingEmployeeDtrId(null);
		}
	};

	const handleLockSelectedPeriod = () => {
		if (!activePeriodId || lockPeriodMutation.isPending) return;
		const label =
			activeTab === "past"
				? selectedPastPeriod?.name || selectedPeriodCode || "this payroll period"
				: currentPeriod?.name || currentPeriod?.code || "this payroll period";
		setLockPeriodDialog({
			mode: "confirm",
			periodId: activePeriodId,
			periodLabel: label,
		});
	};

	const confirmLockSelectedPeriod = async () => {
		if (!lockPeriodDialog || lockPeriodDialog.mode !== "confirm") return;
		const { periodId, periodLabel } = lockPeriodDialog;
		const result = await lockPeriodMutation.mutateAsync(periodId);
		setLockPeriodDialog({
			mode: "result",
			periodLabel,
			result,
		});
	};

	const openQueueList = (statuses: string[]) => {
		updateSearchParams((next) => {
			next.set("tab", "active");
			next.set("status", statuses.join(","));
			next.set("page", "1");
		});
	};

	const returnToOverview = () => {
		updateSearchParams((next) => {
			next.delete("status");
			next.delete("search");
			next.delete("employeeId");
			next.set("page", "1");
		});
	};

	const toggleQueue = (key: string) => {
		setCollapsedQueues((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const queueSections: TimesheetQueueSection[] = [
		{
			key: "draft",
			title: "Needs Employee Submission",
			status: ["DRAFT"],
			count: metrics.draft,
			rows: timesheetQueuesData?.timesheetQueues?.draft?.timesheets || [],
			emptyTitle: "No draft timesheets in queue",
			viewAllLabel: "View all employee drafts",
		},
		{
			key: "submitted",
			title: "Needs Manager Approval",
			status: ["SUBMITTED"],
			count: metrics.submitted,
			rows: timesheetQueuesData?.timesheetQueues?.submitted?.timesheets || [],
			emptyTitle: "No manager approvals in queue",
			viewAllLabel: "View all manager approvals",
		},
		{
			key: "correction",
			title: "Needs Employee Correction",
			status: ["REJECTED", "REVISED"],
			count: metrics.actionRequired,
			rows: timesheetQueuesData?.timesheetQueues?.correction?.timesheets || [],
			emptyTitle: "No corrections in queue",
			viewAllLabel: "View all corrections",
		},
		{
			key: "approved",
			title: "Payroll Ready",
			status: ["APPROVED"],
			count: metrics.approved,
			rows: timesheetQueuesData?.timesheetQueues?.approved?.timesheets || [],
			emptyTitle: "No approved timesheets ready",
			viewAllLabel: "View payroll-ready timesheets",
		},
	];

	const renderQueueOverview = () => (
		<div className="space-y-3">
			{isLoadingQueues ? (
				<div className="rounded-md border border-dashed border-neutral-200 px-4 py-8 text-sm text-gray-500">
					Loading active timesheet queues...
				</div>
			) : (
				queueSections.map((section) => {
					const isCollapsed = collapsedQueues.has(section.key);
					const itemLabel = section.count === 1 ? "item" : "items";
					return (
						<div
							key={section.key}
							className="overflow-hidden rounded-md border border-neutral-200 bg-white">
							<button
								type="button"
								onClick={() => toggleQueue(section.key)}
								className="flex w-full items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
								<div className="flex min-w-0 items-center gap-2">
									{isCollapsed ? (
										<ChevronRight className="h-4 w-4 shrink-0 text-gray-700" />
									) : (
										<ChevronDown className="h-4 w-4 shrink-0 text-gray-700" />
									)}
									<span className="truncate text-sm font-semibold text-gray-900">
										{section.title}
									</span>
								</div>
								<span className="shrink-0 text-xs font-semibold text-neutral-600">
									{section.count} {itemLabel}
								</span>
							</button>
							{!isCollapsed ? (
								<>
									<div className="overflow-x-auto">
										<table className="w-full min-w-[1120px] table-fixed text-sm">
											<thead>
												<tr className="border-b border-neutral-200 bg-white text-left text-[10px] font-bold uppercase tracking-wide text-gray-600">
													<th className="w-[240px] px-3 py-2">
														Employee
													</th>
													<th className="w-[250px] px-3 py-2">
														Blocker / Reminder
													</th>
													<th className="w-[240px] px-3 py-2">Period</th>
													<th className="w-[140px] px-3 py-2">Status</th>
													<th className="w-[130px] px-3 py-2 text-right">
														Hours
													</th>
													<th className="w-[80px] px-3 py-2 text-right">
														Actions
													</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-neutral-100 bg-white">
												{section.rows.length > 0 ? (
													section.rows.map((item) => {
														const reminder = getReminderTarget(item);
														return (
															<tr
																key={item.id || item.code}
																className="hover:bg-neutral-50">
																<td className="px-3 py-2">
																<EmployeeTableCell
																		profileId={
																			item.employee?.id
																		}
																		fullName={
																			getEmployeeFullName(
																				item.employee,
																			) ||
																			item.employee
																				?.employeeId ||
																			item.employeeId ||
																			"-"
																		}
																		employeeId={
																			item.employee
																				?.employeeId ||
																			item.employeeId ||
																			"-"
																		}
																		avatar={getEmployeeAvatar(item)}
																	/>
																</td>
																<td className="px-3 py-2">
																	<div className="flex min-w-0 items-center justify-between gap-3">
																		<div className="min-w-0">
																			<div className="truncate whitespace-nowrap text-sm font-medium text-gray-900">
																				{reminder.label}
																			</div>
																			<div className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-500">
																				{reminder.target}
																			</div>
																		</div>
																	</div>
																</td>
																<td className="px-3 py-2">
																	<div className="min-w-0">
																		<div className="truncate whitespace-nowrap text-sm font-semibold text-gray-900">
																			{item.payrollPeriod
																				?.name || "-"}
																		</div>
																		<div className="mt-0.5 truncate whitespace-nowrap text-xs text-gray-500">
																			{item.payrollPeriod
																				? `${formatDate(item.payrollPeriod.startDate, "short")} - ${formatDate(item.payrollPeriod.endDate, "short")}`
																				: "-"}
																		</div>
																	</div>
																</td>
																<td className="px-3 py-2">
																	<StatusBadge
																		status={item.status}
																	/>
																</td>
																<td className="px-3 py-2 text-right font-mono text-sm">
																	{item.totalHoursWorked ||
																		"0:00"}
																</td>
																<td className="px-3 py-2 text-right">
																	{renderActions(item)}
																</td>
															</tr>
														);
													})
												) : (
													<tr>
														<td
															colSpan={6}
															className="px-3 py-4 text-sm text-gray-500">
															{section.emptyTitle}
														</td>
													</tr>
												)}
											</tbody>
										</table>
									</div>
									<div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
										<span className="text-xs text-gray-500">
											Showing recent {section.rows.length} of {section.count}
										</span>
										<button
											type="button"
											onClick={() => openQueueList(section.status)}
											className="text-xs font-bold text-gray-700 underline-offset-4 hover:text-orange-600 hover:underline">
											{section.viewAllLabel}
										</button>
									</div>
								</>
							) : null}
						</div>
					);
				})
			)}
		</div>
	);

	const renderScopeFilters = () => (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			<div className={hrDataTableDepartmentFilterClass}>
			<DepartmentSectionPicker
				variant="datatable"
				departments={departments}
				sections={sections}
				departmentId={departmentFilter}
				sectionId={sectionFilter}
				onDepartmentChange={handleDepartmentScopeChange}
				onSectionChange={handleSectionScopeChange}
			/>
			</div>

			<div className={hrDataTableFilterClass}>
				<HrDataTableManagerFilter
					value={managerFilter || "all"}
					onValueChange={(value: string) =>
					handleFilterChange({
						status: statusFilter || "",
						departmentId: departmentFilter || "",
						managerId: value,
					})
					}
					options={managerFilterOptions}
					dataUi="timesheet-manager-trigger"
				/>
			</div>
		</div>
	);

	return (
		<div className="space-y-6">
			<div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
				<div className="grid divide-y divide-neutral-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
					{timesheetStats.map((stat) => (
						<div key={stat.label} className="min-w-0 px-4 py-3">
							<div className="truncate whitespace-nowrap text-xs font-medium text-neutral-500">
								{stat.label}
							</div>
							<div className="mt-1 flex items-baseline gap-2">
								<span className="text-2xl font-semibold tabular-nums text-neutral-950">
									{stat.value}
								</span>
								<div className="truncate whitespace-nowrap text-xs text-neutral-500">
									{stat.meta}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			<Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
						<TabsList className="h-9 w-fit shrink-0 rounded-md">
							<TabsTrigger value="active" className="whitespace-nowrap">
								Active Payroll Period
							</TabsTrigger>
							<TabsTrigger value="past" className="whitespace-nowrap">
								Past Periods
							</TabsTrigger>
						</TabsList>

						{renderScopeFilters()}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 w-fit rounded-md border-neutral-200 px-3 text-sm font-medium"
							disabled={!canFetchTimesheets || isExporting}
							onClick={openExportModal}>
							{isExporting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Download className="mr-2 h-4 w-4" />
							)}
							{isExporting ? "Exporting..." : "Export"}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 w-fit rounded-md border-neutral-200 px-3 text-sm font-medium"
							disabled={!activePeriodId || lockPeriodMutation.isPending}
							onClick={handleLockSelectedPeriod}>
							{lockPeriodMutation.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Lock className="mr-2 h-4 w-4" />
							)}
							{lockPeriodMutation.isPending ? "Locking..." : "Lock Period"}
						</Button>
					</div>
				</div>

				<TabsContent value="active" className="m-0">
					{currentPeriod ? (
						isActiveOverview ? (
							<div>{renderQueueOverview()}</div>
						) : (
							<div className="space-y-3">
								<button
									type="button"
									onClick={returnToOverview}
									className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-orange-600">
									<ArrowLeft className="h-4 w-4" />
									Back to grouped view
								</button>
								<DataTable
									title="Active Timesheets"
									data={items}
									columns={columns}
									filters={filterOptions}
									filterValues={advancedFilterValues}
									renderActions={renderActions}
									isLoading={isLoading}
									emptyMessage="No timesheets found"
									emptyDescription="Timesheets will appear here once submitted."
									searchWidth="w-80"
									searchPlaceholder="Search timesheets..."
									itemsPerPage={limitParam}
									currentPage={pageParam}
									totalItems={(timesheetsData as any)?.pagination?.total}
									onSearch={handleSearch}
									onFilterChange={handleFilterChange}
									onPageChange={handlePageChange}
									searchValue={searchQuery || ""}
									filterButtonLabel="Advanced Filters"
									noCard
								/>
							</div>
						)
					) : (
						<div className="text-center py-8 text-gray-500">
							<p>No active payroll period found for today.</p>
							<p className="text-sm mt-2">
								Please create a payroll period that includes today&apos;s date.
							</p>
						</div>
					)}
				</TabsContent>

				<TabsContent value="past" className="m-0">
					<div className="space-y-3">
						<DataTable
							title="Past Timesheets"
							data={items}
							columns={columns}
							filters={filterOptions}
							filterValues={advancedFilterValues}
							filterButtonLabel="Advanced Filters"
							renderActions={renderActions}
							isLoading={isLoading}
							emptyMessage="No timesheets found"
							emptyDescription={
								selectedPeriodCode && selectedPeriodCode !== "all"
									? "No timesheets found for the selected period."
									: "Select a period to view timesheets."
							}
							searchWidth="w-80"
							searchPlaceholder="Search timesheets..."
							itemsPerPage={limitParam}
							currentPage={pageParam}
							totalItems={(timesheetsData as any)?.pagination?.total}
							onSearch={handleSearch}
							onFilterChange={handleFilterChange}
							onPageChange={handlePageChange}
							searchValue={searchQuery || ""}
							noCard
						/>
					</div>
				</TabsContent>
			</Tabs>

			<Modal
				open={Boolean(lockPeriodDialog)}
				onOpenChange={(open) => {
					if (!open && !lockPeriodMutation.isPending) setLockPeriodDialog(null);
				}}
				title={
					lockPeriodDialog?.mode === "result"
						? lockPeriodDialog.result.locked > 0
							? "Period locked"
							: "Period already locked"
						: "Lock approved timesheets"
				}
				description={
					lockPeriodDialog
						? `${lockPeriodDialog.periodLabel} will be frozen at the timesheet snapshot boundary.`
						: undefined
				}
				className="max-w-md">
				{lockPeriodDialog?.mode === "confirm" ? (
					<div className="space-y-4">
						<div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
							Draft, submitted, rejected, and revised timesheets stay unlocked as
							blockers. Approved rows that lock successfully will show as Locked in this
							table.
						</div>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setLockPeriodDialog(null)}
								disabled={lockPeriodMutation.isPending}>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={confirmLockSelectedPeriod}
								disabled={lockPeriodMutation.isPending}>
								{lockPeriodMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Lock className="mr-2 h-4 w-4" />
								)}
								{lockPeriodMutation.isPending ? "Locking..." : "Lock Period"}
							</Button>
						</div>
					</div>
				) : null}
				{lockPeriodDialog?.mode === "result" ? (
					<div className="space-y-4">
						<div className="grid grid-cols-3 divide-x divide-neutral-200 rounded-md border border-neutral-200">
							<div className="px-3 py-2">
								<div className="text-xs text-neutral-500">Approved</div>
								<div className="mt-1 text-xl font-semibold tabular-nums text-neutral-950">
									{lockPeriodDialog.result.approvedTotal}
								</div>
							</div>
							<div className="px-3 py-2">
								<div className="text-xs text-neutral-500">Locked now</div>
								<div className="mt-1 text-xl font-semibold tabular-nums text-neutral-950">
									{lockPeriodDialog.result.locked}
								</div>
							</div>
							<div className="px-3 py-2">
								<div className="text-xs text-neutral-500">Already locked</div>
								<div className="mt-1 text-xl font-semibold tabular-nums text-neutral-950">
									{lockPeriodDialog.result.alreadyLocked}
								</div>
							</div>
						</div>
						{Object.values(lockPeriodDialog.result.blockers || {}).some(
							(count) => Number(count || 0) > 0,
						) ? (
							<div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
								Some timesheets still need employee or manager action before payroll can
								consume them.
							</div>
						) : null}
						<div className="flex justify-end">
							<Button type="button" onClick={() => setLockPeriodDialog(null)}>
								Done
							</Button>
						</div>
					</div>
				) : null}
			</Modal>

			{/* View Modal - Using reusable TimesheetViewModal component */}
			<TimesheetViewModal
				isOpen={action === "view"}
				onClose={() => {
					updateSearchParams((next) => {
						next.delete("action");
						next.delete("id");
					});
				}}
				timesheet={activeTimesheet || null}
				isLoading={isDeepLinkLoading}
				showActions={false}
				approvedEditedDaysSummary={activeTimesheet?.approvedEditedDaysSummary ?? null}
			/>

			<ReportExportDialog
				title="Export HR Timesheets"
				description={`Selected scope: ${getExportScopeTitle()}`}
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				isExporting={isExporting}
				options={[
					{
						format: "pdf",
						reportMode: "hr-timesheet-summary-pdf",
						label: "Export HR Timesheet Summary PDF",
					},
					{
						format: "pdf",
						reportMode: "employee-timesheet-pdf",
						label: "Export Employee Timesheet PDF",
					},
					{
						format: "csv",
						label: "Export CSV",
					},
					{
						format: "xlsx",
						label: "Export Excel",
					},
				]}
				onExport={handleExport}
			/>

		</div>
	);
}
