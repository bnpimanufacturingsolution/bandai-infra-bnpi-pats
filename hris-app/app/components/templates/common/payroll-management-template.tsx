import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { formatDate } from "~/lib/utils/text-utils";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { DepartmentSectionPicker } from "~/components/molecules/DepartmentSectionPicker";
import {
	HrDataTableManagerFilter,
	hrDataTablePopoverSelectTriggerClass,
} from "~/components/molecules/HrDataTableFilters";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import { EmployeeTableCell } from "~/components/molecules/EmployeeTableCell";
import {
	Download,
	Eye,
	FileText,
	MoreVertical,
	X,
	Calendar,
	Clock,
	Banknote,
	ChevronLeft,
	ChevronRight,
	HelpCircle,
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { EmployeePayroll } from "~/types/employee-payroll";
import {
	useEmployeePayrolls,
	useEmployeePayroll,
	useDownloadPayslip,
	useResetGeneratedPayrolls,
} from "~/lib/hooks/useEmployeePayroll";
import { employeePayrollService } from "~/services/employee-payroll.service";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useSections } from "~/lib/hooks/useSections";
import { useEmployees } from "~/lib/hooks/useEmployees";
import {
	buildReportFileName,
	exportReport,
	formatReportCurrency,
	formatReportDate,
	getReportGeneratedByName,
	type ReportExportFormat,
} from "~/lib/utils/report-export";
import { useAuth } from "~/lib/hooks/use-auth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "~/components/ui/accordion";
import { themeColors } from "~/lib/config/theme";

interface PayrollManagementProps {
	title?: string;
	description?: string;
}

const getManilaDateString = () =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());

export function PayrollManagement({
	title = "Payroll",
	description = "Manage and import payroll records",
}: PayrollManagementProps) {
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	// Get search and filter params from URL
	const searchQuery = searchParams.get("search") || undefined;
	const activeTab = searchParams.get("tab") || "active";
	const selectedPeriodId = searchParams.get("periodId") || undefined;
	const departmentFilter = searchParams.get("departmentId") || undefined;
	const sectionFilter = searchParams.get("sectionId") || undefined;
	const managerFilter = searchParams.get("managerId") || undefined;
	const employeeFilter = searchParams.get("employeeId") || undefined;
	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;
	const resetGeneratedPayrollsMutation = useResetGeneratedPayrolls();
	const resetTriggerRef = useRef("");

	// Fetch departments for filter
	const { data: departmentsData } = useDepartments({
		page: 1,
		limit: 100,
		sort: "name",
		order: "asc",
	});
	const departments = (departmentsData as any)?.departments || [];
	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const sections = (sectionsData as any)?.sections || (sectionsData as any)?.data?.sections || [];
	const { data: employeesData } = useEmployees({
		page: 1,
		limit: 1000,
		sort: "employeeId",
		order: "asc",
	});
	const allEmployees = useMemo(
		() =>
			Array.isArray((employeesData as any)?.data)
				? (employeesData as any).data
				: (employeesData as any)?.data?.employees || (employeesData as any)?.employees || [],
		[employeesData],
	);

	// Find current period using Manila-local date to avoid UTC date drift.
	const today = getManilaDateString(); // YYYY-MM-DD format (Asia/Manila)
	const currentPeriodFilter = `startDate<=${today},endDate>=${today}`;

	const { data: currentPeriodData } = usePayrollPeriods({
		page: 1,
		limit: 1,
		filter: currentPeriodFilter,
		sort: "startDate",
		order: "desc",
	});
	const currentPeriod = (currentPeriodData as any)?.payrollPeriods?.[0];

	// Fetch past periods (exclude current period if exists) - periods that ended before today
	const pastPeriodFilter = `endDate<${today}`;
	const { data: pastPeriodsData } = usePayrollPeriods({
		page: 1,
		limit: 100,
		filter: pastPeriodFilter,
		sort: "startDate",
		order: "desc",
	});
	const pastPeriods = useMemo(
		() => (pastPeriodsData as any)?.payrollPeriods || [],
		[pastPeriodsData],
	);
	const selectedPastPeriod = pastPeriods.find((period: any) => period.id === selectedPeriodId);

	// Build filter string for API
	const filterParts = [];

	// Filter by payroll period (for active tab: current period ID, for past tab: selected period ID
	// or all past periods via payroll period end date)
	if (activeTab === "active" && currentPeriod?.id) {
		filterParts.push(`payrollPeriodId:${currentPeriod.id}`);
	} else if (activeTab === "past" && selectedPeriodId && selectedPeriodId !== "all") {
		filterParts.push(`payrollPeriodId:${selectedPeriodId}`);
	} else if (activeTab === "past") {
		filterParts.push(`payrollPeriod.endDate<${today}`);
	}

	// Filter by department
	if (departmentFilter && departmentFilter !== "all") {
		filterParts.push(`employee.departmentId:${departmentFilter}`);
	}
	if (sectionFilter && sectionFilter !== "all") {
		filterParts.push(`employee.sectionId:${sectionFilter}`);
	}
	if (managerFilter && managerFilter !== "all") {
		filterParts.push(`employee.reportToId:${managerFilter}`);
	}
	if (employeeFilter && employeeFilter !== "all") {
		filterParts.push(`employeeId:${employeeFilter}`);
	}

	const filterString = filterParts.length > 0 ? filterParts.join(",") : undefined;

	// React Query hooks with server-side search and filtering
	const { data: payrollsData, isLoading } = useEmployeePayrolls({
		page: pageParam,
		limit: limitParam,
		query: searchQuery,
		filter: filterString,
		count: true,
	});
	const items = (payrollsData as any)?.employeePayrolls || [];
	const totalPayrollItems = (payrollsData as any)?.pagination?.total || 0;
	const filteredItems = Array.isArray(items) ? items : [];

	const updateSearchParams = (mutator: (next: URLSearchParams) => void) => {
		setSearchParams((prev) => {
			const next = new URLSearchParams(prev);
			mutator(next);
			return next;
		});
	};

	const closePayrollDetail = () => {
		updateSearchParams((next) => {
			next.delete("action");
			next.delete("id");
		});
	};

	useEffect(() => {
		const shouldReset =
			searchParams.get("debug") === "true" &&
			searchParams.get("resetEmployeePayrolls") === "true";
		const triggerKey = searchParams.toString();
		if (!shouldReset || resetTriggerRef.current === triggerKey) return;

		resetTriggerRef.current = triggerKey;
		resetGeneratedPayrollsMutation.mutate(undefined, {
			onSuccess: () => {
				updateSearchParams((next) => {
					next.delete("debug");
					next.delete("resetEmployeePayrolls");
					next.delete("action");
					next.delete("id");
					next.delete("open");
					next.set("page", "1");
				});
			},
		});
	}, [searchParams, resetGeneratedPayrollsMutation]);

	// Normalize stale deep-links:
	// If tab says "past" but periodId is the current period, force Active tab.
	useEffect(() => {
		if (
			activeTab === "past" &&
			selectedPeriodId &&
			currentPeriod?.id &&
			selectedPeriodId === currentPeriod.id
		) {
			updateSearchParams((next) => {
				next.set("tab", "active");
				next.delete("periodId");
				next.set("page", "1");
			});
		}
	}, [activeTab, selectedPeriodId, currentPeriod?.id]);

	const handleTabChange = (tab: string) => {
		updateSearchParams((next) => {
			next.set("tab", tab);
			// Reset page when switching tabs
			next.set("page", "1");
			// Clear period selection when switching to active tab
			if (tab === "active") {
				next.delete("periodId");
			}
		});
	};

	const handleFilterChange = (filters: Record<string, string>) => {
		updateSearchParams((next) => {
			const keys = [
				"employeeId",
				"periodId",
				"departmentId",
				"sectionId",
				"managerId",
			] as const;
			keys.forEach((key) => {
				const value = filters[key];
				if (!value || value === "all") {
					next.delete(key);
				} else {
					next.set(key, value);
				}
			});
			next.delete("open");
			next.delete("action");
			next.delete("id");
			next.set("page", "1");
		});
	};

	const handleDepartmentFilterChange = (departmentId: string) => {
		updateSearchParams((next) => {
			if (departmentId === "all") {
				next.delete("departmentId");
				next.delete("sectionId");
			} else {
				next.set("departmentId", departmentId);
				next.delete("sectionId");
			}
			next.set("page", "1");
		});
	};

	const handleSectionFilterChange = (departmentId: string, sectionId: string) => {
		updateSearchParams((next) => {
			next.set("departmentId", departmentId);
			next.set("sectionId", sectionId);
			next.set("page", "1");
		});
	};

	const handleManagerFilterChange = (managerId: string) => {
		updateSearchParams((next) => {
			if (managerId === "all") {
				next.delete("managerId");
			} else {
				next.set("managerId", managerId);
			}
			next.set("page", "1");
		});
	};

	// Deep link URL params
	const action = searchParams.get("action");
	const id = searchParams.get("id");

	useEffect(() => {
		if (searchParams.get("open") !== "view") return;
		if (action === "view") return;
		if (!employeeFilter || employeeFilter === "all") return;
		if (!filteredItems.length) return;

		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", filteredItems[0].id);
			next.delete("open");
		});
	}, [action, employeeFilter, filteredItems, searchParams]);

	// Single payroll ID for fetching (when action is view)
	const activePayrollId = action === "view" ? id : null;
	const activePayrollListItem =
		activePayrollId && Array.isArray(filteredItems)
			? filteredItems.find((item) => item.id === activePayrollId)
			: undefined;
	const [periodScheduleWeekIndex, setPeriodScheduleWeekIndex] = useState(0);
	const [isExportingRegister, setIsExportingRegister] = useState(false);

	// Fetch payroll data when viewing (includes payroll period)
	const { data: payrollData, isLoading: isLoadingPayroll } = useEmployeePayroll(
		activePayrollId || "",
	);
	const payrollEmployeeProfileId =
		payrollData?.employee?.id || activePayrollListItem?.employee?.id || undefined;
	const linkedTimesheetId = payrollData?.timesheet?.id;
	// Download mutation
	const downloadPayslipMutation = useDownloadPayslip();
	const [viewingPayslipId, setViewingPayslipId] = useState<string | null>(null);

	// Helper: get employee name
	const getEmployeeName = (payroll: EmployeePayroll): string => {
		const p = payroll?.employee?.person?.personalInfo;
		if (!p) {
			return "N/A";
		}
		const middle = p.middleName ? ` ${p.middleName} ` : " ";
		return `${p.firstName}${middle}${p.lastName}`.trim();
	};
	const getEmployeeOptionLabel = (employee: any): string => {
		const firstName = employee.person?.personalInfo?.firstName || "";
		const lastName = employee.person?.personalInfo?.lastName || "";
		return `${firstName} ${lastName}`.trim() || employee.employeeId || "Unnamed Employee";
	};
	const employeeFilterOptions = useMemo(
		() =>
			allEmployees.map((employee: any) => ({
				value: employee.id,
				label: getEmployeeOptionLabel(employee),
			})),
		[allEmployees],
	);
	const managerFilterOptions = useMemo(() => {
		const managerIds = new Set(
			allEmployees
				.map((employee: any) => employee.reportToId)
				.filter((id: unknown): id is string => Boolean(id)),
		);
		return [
			{ value: "all", label: "All Manager" },
			...allEmployees
				.filter((employee: any) => managerIds.has(employee.id) || Boolean(employee.isManager))
				.map((employee: any) => ({
					value: employee.id,
					label: getEmployeeOptionLabel(employee),
				})),
		];
	}, [allEmployees]);
	const periodFilterOptions = useMemo(
		() =>
			pastPeriods.map((period: any) => ({
				value: period.id,
				label: period.name,
			})),
		[pastPeriods],
	);
	const payrollAdvancedFilters = [
		{
			key: "employeeId",
			label: "Employee",
			options: employeeFilterOptions,
		},
		...(activeTab === "past"
			? [
					{
						key: "periodId",
						label: "Period",
						options: periodFilterOptions,
					},
				]
			: []),
	];
	const payrollAdvancedFilterValues = {
		employeeId: employeeFilter || "",
		departmentId: departmentFilter || "",
		sectionId: sectionFilter || "",
		managerId: managerFilter || "",
		...(activeTab === "past" ? { periodId: selectedPeriodId || "" } : {}),
	};
	const payrollPopoverFilters = (
		<>
			<div className="w-full space-y-1.5">
				<label className="text-xs font-medium text-gray-600">Department</label>
				<DepartmentSectionPicker
					variant="datatable"
					departments={departments}
					sections={sections}
					departmentId={departmentFilter || "all"}
					sectionId={sectionFilter || "all"}
					className={hrDataTablePopoverSelectTriggerClass}
					onDepartmentChange={handleDepartmentFilterChange}
					onSectionChange={handleSectionFilterChange}
				/>
			</div>
			<div className="w-full space-y-1.5">
				<label className="text-xs font-medium text-gray-600">Manager</label>
				<HrDataTableManagerFilter
					value={managerFilter || "all"}
					onValueChange={handleManagerFilterChange}
					options={managerFilterOptions}
					dataUi="payroll-manager-trigger"
					triggerClassName={hrDataTablePopoverSelectTriggerClass}
				/>
			</div>
		</>
	);

	// Helper: format currency
	const formatCurrency = (amount: number): string => {
		return new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
		}).format(amount);
	};
	const formatExportMoney = (amount?: number | null): string =>
		formatReportCurrency(Number(amount || 0));
	const formatRegisterAmount = (amount?: number | null): string =>
		new Intl.NumberFormat("en-PH", {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2,
		}).format(Number(amount || 0));
	const getPayrollSourceAmounts = (payroll: Partial<EmployeePayroll>) =>
		(((payroll as any)?.metadata || {}) as any)?.payrollSourceAmounts || {};
	const getPayrollWorkDays = (payroll: Partial<EmployeePayroll>) =>
		Number(
			(payroll as any)?.metadata?.totalWorkDays ||
				(payroll.timesheetSnapshot as any)?.totalDays ||
				0,
		);
	const getPayrollMonthlyRate = (payroll: Partial<EmployeePayroll>) =>
		Number((payroll as any)?.metadata?.monthlyRate || payroll.employee?.basicSalary || 0);
	const getPayrollDivision = (payroll: Partial<EmployeePayroll>) =>
		(payroll.employee as any)?.section?.name ||
		(payroll.employee as any)?.section?.code ||
		"N/A";
	const payrollRegisterFieldNames = [
		"monthlySalary",
		"dailySalary",
		"numberOfDays",
		"lateUndertimeAmount",
		"regularOtHours",
		"restDayHours",
		"restDayHoursPay",
		"restDayOtHours",
		"restDayOtPay",
		"specialHolidayOtHours",
		"specialHolidayOtPay",
		"sunSpecialHolidayOtExcessHours",
		"sunSpecialHolidayOtExcessPay",
		"specialHolidayRestDayOtHours",
		"specialHolidayRestDayOtPay",
		"specialRestDayExcessHours",
		"specialRestDayExcessOtPay",
		"legalHolidayOtHours",
		"legalHolidayOtPay",
		"legalHolidayExcessPay",
		"legalHolidayRestDayPay",
		"legalHolidayExcess1Pay",
		"legalHolidayRestDayExcessPay",
		"leavePay",
		"christmasGift",
		"specialBonus",
		"mandatoryContributionAdjustment",
		"guaranteedBonus",
		"hysMealAllowance",
		"obAllowance",
		"otherAdjustment",
		"overtimeMealAllowance",
		"sportsfestOt",
		"fringeBenefit",
		"annualIncentive",
		"technicalSkillsAllowance",
		"aclVlConversionTaxable",
		"adjustmentOverusedLeave",
		"thirteenthMonthAdjustment",
		"productionIncentives",
		"otherCompensation",
		"adjustmentBasic",
		"adjustmentOtNd",
		"adjustmentNonTax",
		"excessDeduction",
		"deMinimisAllowance",
		"christmasGiftKid",
		"birthdayGiftKid",
		"birthdayGiftEmployee",
		"fringeBenefitTax",
		"sssEmergencyLoan",
		"philHealthContributionAdjustment",
		"excessInternetUsage",
		"taxPayable",
		"adjustmentBasicDeduction",
		"excessMlBenefits",
		"uniformDeduction",
		"sssLoanRestructuringProgram",
		"phicOnePercentDifferential",
		"modifiedHdmf2",
		"communityTaxCertificate",
		"hdmfContributionAdjustment",
		"personalCallsUsage",
		"healthInsurance",
		"shuttleService",
		"negativeAdjustment",
		"bnpiEmergencyLoan",
		"bnpiSalaryLoan",
		"rcbcLoan",
		"hdmfCalamityLoan",
		"hdmfSalaryLoan",
		"sssCalamityLoan",
		"sssSalaryLoan",
		"adjustmentHolidayPay",
		"communityTaxCert",
		"oneKChristmasGift",
		"taxRefund",
		"thirteenthMonthPay",
		"aclVlConversion",
		"otMealAllowance",
		"perfectAttendance",
		"mealAllowance",
		"lineLeaderAllowance",
		"totalReceivable",
	] as const;
	const payrollRegisterColumnDefs = [
		["Monthly Salary", "monthlySalary"],
		["Daily Salary", "dailySalary"],
		["No. of Days", "numberOfDays"],
		["Basic Salary", "basicPay"],
		["Absent-Amt", "absentDeduction"],
		["UT/Late-Amt", "lateUndertimeAmount"],
		["No. of Reg OT Hrs", "regularOtHours"],
		["Reg OT", "overtimePay"],
		["RD Hrs", "restDayHours"],
		["RD Hrs Pay", "restDayHoursPay"],
		["RD OT", "restDayOtHours"],
		["RD OT Pay", "restDayOtPay"],
		["Spc Hol OT Hrs", "specialHolidayOtHours"],
		["Spc Hol OT", "specialHolidayOtPay"],
		["Sun/Spc Hol OT Exc Hrs", "sunSpecialHolidayOtExcessHours"],
		["Sun/Spc Hol OT Exc", "sunSpecialHolidayOtExcessPay"],
		["Spc Hol RD OT Hrs", "specialHolidayRestDayOtHours"],
		["Spc RD OT", "specialHolidayRestDayOtPay"],
		["Spc RD Exc Hrs", "specialRestDayExcessHours"],
		["Spc RD Exc OT", "specialRestDayExcessOtPay"],
		["Leg Hol OT Hrs", "legalHolidayOtHours"],
		["Leg Hol OT", "legalHolidayOtPay"],
		["Leg Hol Exc", "legalHolidayExcessPay"],
		["Leg Hol RD", "legalHolidayRestDayPay"],
		["Leg Hol Exc1", "legalHolidayExcess1Pay"],
		["Leg Hol RD Exc", "legalHolidayRestDayExcessPay"],
		["Night Differential", "nightDiffPay"],
		["Leave", "leavePay"],
		["Christmas Gift", "christmasGift"],
		["Special Bonus", "specialBonus"],
		["Mandatory Cont Adjustment", "mandatoryContributionAdjustment"],
		["Guaranteed Bonus", "guaranteedBonus"],
		["HYS Meal Allowance", "hysMealAllowance"],
		["OB Allowance", "obAllowance"],
		["Other Adjustment", "otherAdjustment"],
		["Overtime Meal Allownce", "overtimeMealAllowance"],
		["Sportsfest OT", "sportsfestOt"],
		["Fringe Benefit", "fringeBenefit"],
		["Annual Incentive", "annualIncentive"],
		["Technical Skills Allowance", "technicalSkillsAllowance"],
		["ACL/VL Conversion Taxable", "aclVlConversionTaxable"],
		["Adjustment Overused Leave", "adjustmentOverusedLeave"],
		["13th Month Adjustment", "thirteenthMonthAdjustment"],
		["Production Incentives", "productionIncentives"],
		["Other Compensation", "otherCompensation"],
		["Adjustment Basic", "adjustmentBasic"],
		["Adjustment OT/ND", "adjustmentOtNd"],
		["Adjustment Non-Tax", "adjustmentNonTax"],
		["Excess Deduction", "excessDeduction"],
		["De Minimis Allowance", "deMinimisAllowance"],
		["Christmas Gift (Kid)", "christmasGiftKid"],
		["Birthday Gift (Kid)", "birthdayGiftKid"],
		["Birthday Gift (Employee)", "birthdayGiftEmployee"],
		["GrossPay", "grossPay"],
		["W/Tax", "taxAmount"],
		["FBTax", "fringeBenefitTax"],
		["SSS Cont", "sssContribution"],
		["PhilHealth", "philHealthContribution"],
		["Pagibig", "pagibigContribution"],
		["SSS Emergency Loan", "sssEmergencyLoan"],
		["PHEALTH CONTRI Adjustment", "philHealthContributionAdjustment"],
		["Excess Internet Usage", "excessInternetUsage"],
		["Tax Payable", "taxPayable"],
		["Adjustment Basic Deduction", "adjustmentBasicDeduction"],
		["Excess ML Benefits", "excessMlBenefits"],
		["Uniform Deduction", "uniformDeduction"],
		["SSS Loan Restructuring Program", "sssLoanRestructuringProgram"],
		["PHIC 1% DIFFERENTIAL", "phicOnePercentDifferential"],
		["Modified HDMF 2", "modifiedHdmf2"],
		["Community Tax Certificate", "communityTaxCertificate"],
		["HDMF Contribution Adjustment", "hdmfContributionAdjustment"],
		["Personal Calls Usage", "personalCallsUsage"],
		["Health Insurance", "healthInsurance"],
		["Shuttle Service", "shuttleService"],
		["Negative Adjustment", "negativeAdjustment"],
		["BNPI Emergency Loan", "bnpiEmergencyLoan"],
		["BNPI Salary Loan", "bnpiSalaryLoan"],
		["RCBC Loan", "rcbcLoan"],
		["HDMF Calamity Loan", "hdmfCalamityLoan"],
		["HDMF Salary Loan", "hdmfSalaryLoan"],
		["SSS Calamity Loan", "sssCalamityLoan"],
		["SSS Salary Loan", "sssSalaryLoan"],
		["TOTAL DEDN", "totalDeductions"],
		["NetPay", "netPay"],
		["Adjustment Holiday Pay", "adjustmentHolidayPay"],
		["Community Tax Cert", "communityTaxCert"],
		["1K Christmas Gift", "oneKChristmasGift"],
		["Tax Refund", "taxRefund"],
		["13th Month", "thirteenthMonthPay"],
		["ACL/VL Conversion", "aclVlConversion"],
		["OT Meal Allowance", "otMealAllowance"],
		["Perfect Attendance", "perfectAttendance"],
		["Meal Allowance", "mealAllowance"],
		["Line Leader Allowance", "lineLeaderAllowance"],
		["TotalReceivable", "totalReceivable"],
	] as const;
	const getPayrollRegisterValue = (
		item: EmployeePayroll,
		field: (typeof payrollRegisterColumnDefs)[number][1],
	) => {
		if (field === "monthlySalary") return item.monthlySalary ?? getPayrollMonthlyRate(item);
		if (field === "dailySalary") {
			return item.dailySalary ?? Number((item as any)?.metadata?.dailyRate || 0);
		}
		if (field === "numberOfDays") return item.numberOfDays ?? getPayrollWorkDays(item);
		if (field === "lateUndertimeAmount") {
			return (
				item.lateUndertimeAmount ??
				Number(item.lateDeduction || 0) + Number(item.earlyOutDeduction || 0)
			);
		}
		if (field === "totalReceivable") {
			return (
				item.totalReceivable ??
				Number(item.netPay || 0) +
					Number(getPayrollSourceAmounts(item).receivableOnlyBenefits || 0)
			);
		}
		return Number((item as any)[field] || 0);
	};
	const payrollRegisterColumns = [
		{
			header: "No.",
			accessor: (item: EmployeePayroll) => (item as any).registerNo || "",
			widthWeight: 0.5,
		},
		{
			header: "Emp. No.",
			accessor: (item: EmployeePayroll) => item.employee?.employeeId || "",
			widthWeight: 0.8,
			valueType: "text" as const,
		},
		{
			header: "Employee Name",
			accessor: (item: EmployeePayroll) => getEmployeeName(item),
			widthWeight: 2.2,
			valueType: "text" as const,
		},
		{
			header: "Department",
			accessor: (item: EmployeePayroll) => item.employee?.department?.name || "N/A",
			widthWeight: 1.2,
			valueType: "text" as const,
		},
		{
			header: "Division",
			accessor: (item: EmployeePayroll) => getPayrollDivision(item),
			widthWeight: 1.2,
			valueType: "text" as const,
		},
		{
			header: "Position",
			accessor: (item: EmployeePayroll) => item.employee?.position?.title || "N/A",
			widthWeight: 1.35,
			valueType: "text" as const,
		},
		...payrollRegisterColumnDefs.map(([header, field]) => ({
			header,
			accessor: (item: EmployeePayroll) =>
				formatRegisterAmount(getPayrollRegisterValue(item, field)),
			align: "right" as const,
			widthWeight:
				header.length > 22 ? 1.25 : header.length > 14 ? 1.05 : 0.9,
		})),
	];
	const fetchPayrollRowsForExport = async () => {
		const response = await employeePayrollService
			.clearQueryParams()
			.select([
				"id",
				"employee.person.personalInfo",
				"employee.employeeId",
				"employee.basicSalary",
				"employee.payFrequency",
				"employee.id",
				"employee.department.name",
				"employee.section.name",
				"employee.section.code",
				"employee.position.title",
				"payrollPeriod.id",
				"payrollPeriod.name",
				"payrollPeriod.startDate",
				"payrollPeriod.endDate",
				"payrollPeriod.payDate",
				"payrollPeriod.status",
				"basicPay",
				"overtimePay",
				"nightDiffPay",
				"holidayPay",
				"allowances",
				"bonuses",
				"taxAmount",
				"sssContribution",
				"philHealthContribution",
				"pagibigContribution",
				"loanDeductions",
				"absentDeduction",
				"lateDeduction",
				"earlyOutDeduction",
				"otherDeductions",
				"grossPay",
				"totalDeductions",
				"netPay",
				...payrollRegisterFieldNames,
				"timesheetSnapshot",
				"metadata",
			])
			.search(searchQuery)
			.paginate(1, Math.max(totalPayrollItems || limitParam || 100, 100))
			.sort("employee.employeeId", "asc")
			.setParams({
				filter: filterString,
				document: true,
				pagination: true,
				count: true,
			})
			.getEmployeePayrolls();

		return ((response as any)?.employeePayrolls ||
			(response as any)?.data?.employeePayrolls ||
			[]) as EmployeePayroll[];
	};

	const handleExportRegister = async (format: ReportExportFormat) => {
		if (isExportingRegister) return;
		try {
			setIsExportingRegister(true);
			const rows = await fetchPayrollRowsForExport();
			const exportRows = rows.map((row, index) => ({
				...row,
				registerNo: index + 1,
			}));

			if (!exportRows.length) {
				toast.error("No employee payroll rows available for the current filters.");
				return;
			}

			const activePeriod =
				activeTab === "active" ? currentPeriod : selectedPastPeriod || null;
			const periodLabel =
				activePeriod?.name ||
				rows[0]?.payrollPeriod?.name ||
				(activeTab === "past" ? "Past periods" : "Active period");
			const periodRange = activePeriod
				? `${formatReportDate(activePeriod.startDate)} - ${formatReportDate(activePeriod.endDate)}`
				: "Filtered periods";
			const departmentLabel =
				departmentFilter && departmentFilter !== "all"
					? departments.find((dept: any) => dept.id === departmentFilter)?.name ||
						departmentFilter
					: "All";
			const employeeLabel =
				employeeFilter && employeeFilter !== "all"
					? getEmployeeName(
							rows.find((row) => row.employee?.id === employeeFilter) ||
								({ employee: allEmployees.find((emp: any) => emp.id === employeeFilter) } as any),
						)
					: "All";
			const totals = rows.reduce(
				(current, row) => ({
					monthlySalary: current.monthlySalary + getPayrollMonthlyRate(row),
					otHolidayNightDiff:
						current.otHolidayNightDiff +
						Number(row.overtimePay || 0) +
						Number(row.holidayPay || 0) +
						Number(row.nightDiffPay || 0),
					grossPay: current.grossPay + Number(row.grossPay || 0),
					totalDeductions:
						current.totalDeductions + Number(row.totalDeductions || 0),
					netPay: current.netPay + Number(row.netPay || 0),
				}),
				{
					monthlySalary: 0,
					otHolidayNightDiff: 0,
					grossPay: 0,
					totalDeductions: 0,
					netPay: 0,
				},
			);
			const sectionLabel =
				new Set(rows.map((row) => getPayrollDivision(row)).filter(Boolean)).size === 1
					? getPayrollDivision(rows[0])
					: "All";

			await exportReport({
				format,
				config: {
					reportKey: "payroll-register",
					title: "Payroll Register Per Department/Employee",
					fileBaseName: buildReportFileName(
						"payroll-register",
						activePeriod?.startDate
							? String(activePeriod.startDate).slice(0, 10)
							: activeTab,
						activePeriod?.endDate ? "to" : undefined,
						activePeriod?.endDate ? String(activePeriod.endDate).slice(0, 10) : undefined,
						departmentFilter && departmentFilter !== "all" ? "department" : undefined,
						departmentFilter && departmentFilter !== "all" ? departmentLabel : undefined,
						employeeFilter && employeeFilter !== "all" ? "employee" : undefined,
						employeeFilter && employeeFilter !== "all" ? employeeLabel : undefined,
					),
					rows: exportRows,
					columns: payrollRegisterColumns,
					grouping: [
						{
							id: "section",
							label: "Section",
							getValue: (row: EmployeePayroll) => getPayrollDivision(row),
						},
					],
					filtersSummary: [
						{ label: "Payroll Period", value: periodLabel },
						{ label: "Period Range", value: periodRange },
						{
							label: "Pay Date",
							value: activePeriod?.payDate
								? formatReportDate(activePeriod.payDate)
								: "All",
						},
						{ label: "Department", value: departmentLabel },
						{ label: "Section", value: sectionLabel },
						{ label: "Employee", value: employeeLabel },
					],
					summaryRows: [
						{ label: "Employee Count", value: exportRows.length },
						{ label: "Total OT/Hol/ND", value: formatExportMoney(totals.otHolidayNightDiff) },
						{ label: "Total GrossPay", value: formatExportMoney(totals.grossPay) },
						{ label: "Total NetPay", value: formatExportMoney(totals.netPay) },
					],
					orientation: "landscape",
					pdfLayout: "payroll-register",
					organizationName: "BANDAI NAMCO PHILIPPINES INC.",
					generatedBy: getReportGeneratedByName(user),
				},
				options: { includeFiltersSummary: true, groupBy: "section" },
			});

			toast.success(`${format.toUpperCase()} payroll register exported.`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to export payroll register.",
			);
		} finally {
			setIsExportingRegister(false);
		}
	};
	// Helper function to convert "HH:MM" to decimal hours
	const parseHours = (timeStr?: string): number => {
		if (!timeStr) return 0;
		if (!timeStr.includes(":")) return parseFloat(timeStr);
		const [hours, minutes] = timeStr.split(":").map(Number);
		return hours + (minutes || 0) / 60;
	};

	// Helper function to sum time strings in HH:MM format directly
	const sumTimeStrings = (timeStrings: string[]): string => {
		let totalMinutes = 0;
		for (const timeStr of timeStrings) {
			if (!timeStr || timeStr === "0:00") continue;
			const [hours, minutes] = timeStr.split(":").map(Number);
			totalMinutes += hours * 60 + (minutes || 0);
		}
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return `${hours}:${minutes.toString().padStart(2, "0")}`;
	};

	// Helper to format time
	const formatTime = (timeStr: string | null) => {
		if (!timeStr) return "";
		try {
			const date = new Date(timeStr);
			return date.toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: true,
			});
		} catch {
			return "";
		}
	};

	// Helper to get week label
	const getWeekLabel = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const handleDownloadPayslip = () => {
		if (!payrollData?.id) return;

		downloadPayslipMutation.mutate({
			id: payrollData.id,
			name: getEmployeeName(payrollData as EmployeePayroll),
		});
	};

	const handleDownloadPayslipForRow = (payroll: EmployeePayroll) => {
		downloadPayslipMutation.mutate({
			id: payroll.id,
			name: getEmployeeName(payroll),
		});
	};

	const handleViewPayslipForRow = async (payroll: EmployeePayroll) => {
		setViewingPayslipId(payroll.id);
		const pdfWindow = window.open("", "_blank");
		if (!pdfWindow) {
			toast.error("Allow pop-ups to view the payslip PDF");
			setViewingPayslipId(null);
			return;
		}
		pdfWindow.opener = null;
		pdfWindow.document.title = "Loading payslip";
		pdfWindow.document.body.textContent = "Loading payslip...";

		try {
			const blob = await employeePayrollService.generatePayslipPdf(payroll.id);
			const url = window.URL.createObjectURL(blob);
			pdfWindow.location.href = url;
			window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
		} catch (error: any) {
			pdfWindow.close();
			toast.error(error?.message || "Failed to open payslip PDF");
		} finally {
			setViewingPayslipId(null);
		}
	};

	const payrollAttendanceBreakdown =
		payrollData?.timesheetSnapshot?.breakdown ||
		payrollData?.timesheet?.breakdown ||
		((payrollData as any)?.dailyBreakdown ?? []);
	const payrollPeriodScheduleWeeks =
		((payrollData as any)?.metadata?.periodScheduleWeeks as any[]) || [];
	const payrollGracePeriodMinutes =
		(payrollData as any)?.metadata?.weeklySchedule?.find(
			(schedule: any) => typeof schedule?.gracePeriodMinutes === "number",
		)?.gracePeriodMinutes ??
		payrollData?.schedule?.gracePeriodMinutes ??
		0;

	const getCurrentPeriodWeekIndex = () => {
		if (!payrollPeriodScheduleWeeks.length) return 0;
		const today = new Date();
		const index = payrollPeriodScheduleWeeks.findIndex((week: any) => {
			const start = new Date(week.weekStart);
			const end = new Date(week.weekEnd);
			return today >= start && today <= end;
		});
		return index >= 0 ? index : 0;
	};

	useEffect(() => {
		setPeriodScheduleWeekIndex(getCurrentPeriodWeekIndex());
	}, [activePayrollId, payrollPeriodScheduleWeeks.length]);

	const clampedPeriodScheduleWeekIndex =
		payrollPeriodScheduleWeeks.length > 0
			? Math.min(periodScheduleWeekIndex, payrollPeriodScheduleWeeks.length - 1)
			: 0;
	const activePeriodScheduleWeek =
		payrollPeriodScheduleWeeks[clampedPeriodScheduleWeekIndex] || null;
	const payrollComputationView = payrollData?.employeePayrollComputationView || null;
	const payrollRateSummary = payrollComputationView?.rateSummary || null;
	const toFiniteNumber = (value: unknown, fallback = 0) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};
	const payrollGrossPay = toFiniteNumber(payrollData?.grossPay);
	const payrollTotalDeductions = toFiniteNumber(payrollData?.totalDeductions);
	const payrollNetPay = toFiniteNumber(payrollData?.netPay);
	const payrollReceivableOnlyAmount = toFiniteNumber(
		payrollComputationView?.totalReceivableFormula.postNetTotal,
	);
	const payrollTotalReceivable = toFiniteNumber(
		payrollData?.totalReceivable,
		payrollNetPay + payrollReceivableOnlyAmount,
	);
	const payrollTotalReceivableDelta = payrollTotalReceivable - payrollNetPay;
	const shouldShowPayrollReceivable =
		Math.abs(payrollTotalReceivableDelta) >= 0.005 ||
		Math.abs(payrollReceivableOnlyAmount) >= 0.005;
	const payrollWorkedAttendance =
		payrollData?.timesheetSnapshot?.totalHoursWorked &&
		payrollData?.timesheetSnapshot?.daysPresent != null
			? `${payrollData.timesheetSnapshot.totalHoursWorked} / ${payrollData.timesheetSnapshot.daysPresent}d`
			: payrollData?.timesheetSnapshot?.totalHoursWorked ||
				(payrollData?.timesheetSnapshot?.daysPresent != null
					? `${payrollData.timesheetSnapshot.daysPresent}d present`
					: null);
	const payrollPeriodRange =
		payrollData?.payrollPeriod?.startDate && payrollData?.payrollPeriod?.endDate
			? `${formatDate(payrollData.payrollPeriod.startDate, "short")} - ${formatDate(
					payrollData.payrollPeriod.endDate,
					"short",
				)}`
			: "N/A";
	const formatCorrectionMinutes = (minutes: number) => {
		const m = Math.max(0, Math.round(Number(minutes) || 0));
		const h = Math.floor(m / 60);
		const mm = m % 60;
		return `${h}:${String(mm).padStart(2, "0")}`;
	};
	const formatSignedMinutes = (minutes: number) => {
		const n = Math.round(Number(minutes) || 0);
		const abs = formatCorrectionMinutes(Math.abs(n));
		if (n > 0) return `+${abs}`;
		if (n < 0) return `-${abs}`;
		return abs;
	};
	type PayrollCorrectionLine = NonNullable<
		NonNullable<EmployeePayroll["metadata"]>["payrollCorrections"]
	>[number];
	const payrollCorrections: PayrollCorrectionLine[] = Array.isArray(
		(payrollData as EmployeePayroll | undefined)?.metadata?.payrollCorrections,
	)
		? ((payrollData as EmployeePayroll).metadata!.payrollCorrections as PayrollCorrectionLine[])
		: [];
	const hasPayrollCorrections = payrollCorrections.length > 0;
	const payrollCorrectionTotal = payrollCorrections.reduce(
		(sum, line) => sum + (Number(line.amount) || 0),
		0,
	);
	const payrollCorrectionDayRows = payrollCorrections.flatMap((line, lineIndex) => {
		const deltas = Array.isArray(line.dayDeltas) ? line.dayDeltas : [];
		if (deltas.length === 0) {
			return [
				{
					key: `${line.correctionId || lineIndex}-summary`,
					lineLabel: line.label || "Prior-period correction",
					sourcePeriod: line.sourcePayrollPeriodName || null,
					date: "—",
					hoursType: "—",
					beforeMinutes: null as number | null,
					afterMinutes: null as number | null,
					deltaMinutes: null as number | null,
					timeIn: null as string | null,
					timeOut: null as string | null,
					lineAmount: Number(line.amount) || 0,
				},
			];
		}
		return deltas.map((delta, deltaIndex) => ({
			key: `${line.correctionId || lineIndex}-${delta.date || deltaIndex}`,
			lineLabel: line.label || "Prior-period correction",
			sourcePeriod: line.sourcePayrollPeriodName || null,
			date: delta.date || "—",
			hoursType: delta.hoursType || "—",
			beforeMinutes:
				delta.beforeMinutes != null ? Number(delta.beforeMinutes) || 0 : null,
			afterMinutes: delta.afterMinutes != null ? Number(delta.afterMinutes) || 0 : null,
			deltaMinutes: delta.deltaMinutes != null ? Number(delta.deltaMinutes) || 0 : null,
			timeIn: delta.timeIn || null,
			timeOut: delta.timeOut || null,
			lineAmount: Number(line.amount) || 0,
		}));
	});
	const baseGrossFormulaRows = payrollComputationView?.grossPayRows || [];
	const isBenefitComputationRow = (row: {
		field?: string;
		isBenefitSource?: boolean;
	}) =>
		row.isBenefitSource === true ||
		String(row.field || "").startsWith("source:employeeBenefit") ||
		String(row.field || "").startsWith("source:employeeLoan");
	const hasCorrectionInComputationView = baseGrossFormulaRows.some((row) =>
		String((row as { field?: string }).field || "").startsWith("payrollCorrection:"),
	);
	// Client fallback when view was built before correction rows were included server-side
	const grossFormulaDisplayRows =
		hasCorrectionInComputationView || !hasPayrollCorrections
			? baseGrossFormulaRows
			: [
					...baseGrossFormulaRows,
					...payrollCorrections
						.map((line, index) => {
							const amount = Number(line.amount) || 0;
							if (Math.abs(amount) < 0.005) return null;
							return {
								label: String(line.label || "Prior-period correction").trim() ||
									"Prior-period correction",
								field: `payrollCorrection:${line.correctionId || index}`,
								operation: (amount < 0 ? "SUBTRACT" : "ADD") as "ADD" | "SUBTRACT",
								amount: Math.abs(amount),
								payrollRole: "INCLUDED_IN_GROSSPAY" as const,
								explanation: line.sourcePayrollPeriodName
									? `Source period: ${line.sourcePayrollPeriodName}.`
									: "Next-period applied PayrollCorrection retro line.",
							};
						})
						.filter((row): row is NonNullable<typeof row> => Boolean(row)),
				];
	// Partition: base earnings → benefits (tax groups) → corrections / residual
	const isCorrectionComputationRow = (row: { field?: string }) =>
		String(row.field || "").startsWith("payrollCorrection:") ||
		String(row.field || "") === "otherCompensation";
	const grossBenefitRows = grossFormulaDisplayRows.filter((row) =>
		isBenefitComputationRow(row as { field?: string; isBenefitSource?: boolean }),
	);
	const grossBaseRows = grossFormulaDisplayRows.filter(
		(row) =>
			!isBenefitComputationRow(row as { field?: string; isBenefitSource?: boolean }) &&
			!isCorrectionComputationRow(row as { field?: string }),
	);
	const grossTrailingRows = grossFormulaDisplayRows.filter(
		(row) =>
			!isBenefitComputationRow(row as { field?: string; isBenefitSource?: boolean }) &&
			isCorrectionComputationRow(row as { field?: string }),
	);
	const grossBenefitTaxableRows = grossBenefitRows.filter(
		(row) => (row as { isTaxable?: boolean | null }).isTaxable !== false,
	);
	const grossBenefitNonTaxableRows = grossBenefitRows.filter(
		(row) => (row as { isTaxable?: boolean | null }).isTaxable === false,
	);
	const deductionFormulaRows = payrollComputationView?.deductionRows || [];
	const postNetFormulaRows = payrollComputationView?.postNetRows || [];
	const payrollSummaryCells = [
		{
			label: "GrossPay",
			value: formatCurrency(payrollGrossPay),
			tone: "text-gray-950",
			lines: [
				"Pay included before deductions: basic allocation, OT, leave, and gross-included items.",
				hasPayrollCorrections
					? `Includes ${formatCurrency(payrollCorrectionTotal)} from prior-period PayrollCorrection retro line(s).`
					: "Post-net items are not included here.",
			],
		},
		{
			label: "Deductions",
			value: formatCurrency(payrollTotalDeductions),
			tone: "text-rose-700",
			lines: [
				"Tax, statutory items, loans, and other deductions taken after GrossPay.",
			],
		},
		{
			label: "NetPay",
			value: formatCurrency(payrollNetPay),
			tone: "text-orange-700",
			lines: [
				"Gross pay less total deductions.",
			],
		},
		...(shouldShowPayrollReceivable
			? [
					{
						label: "TotalReceivable",
						value: formatCurrency(payrollTotalReceivable),
						tone: "text-gray-950",
						lines: [
							"NetPay plus items added after NetPay, such as receivable-only benefits.",
						],
					},
				]
			: []),
		...(payrollWorkedAttendance
			? [
					{
						label: "Worked / Attendance",
						value: payrollWorkedAttendance,
						tone: "text-gray-950",
						lines: [
							"Saved attendance snapshot used when payroll was generated.",
						],
					},
				]
			: []),
	];
	// Group breakdown by weeks
	const groupByWeeks = () => {
		if (!payrollAttendanceBreakdown?.length) return [];

		// First, deduplicate days by date
		const daysByDate: { [date: string]: any } = {};
		payrollAttendanceBreakdown.forEach((day: any) => {
			const dateStr = new Date(day.date).toISOString().split("T")[0];
			const hours = parseHours(day.hoursWorked);
			const existingDay = daysByDate[dateStr];

			if (!existingDay) {
				daysByDate[dateStr] = day;
			} else {
				const existingHours = parseHours(existingDay.hoursWorked);
				if (existingHours === 0 && hours > 0) {
					daysByDate[dateStr] = day;
				}
			}
		});

		// Now group deduplicated days by weeks
		const weeks: { [key: string]: any[] } = {};
		Object.values(daysByDate).forEach((day) => {
			const date = new Date(day.date);
			const dayMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			const weekStart = new Date(dayMidnight);
			const dayOfWeek = dayMidnight.getDay(); // 0 is Sunday
			const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
			weekStart.setDate(dayMidnight.getDate() + diff);

			const weekKey = weekStart.toISOString().split("T")[0];

			if (!weeks[weekKey]) {
				weeks[weekKey] = [];
			}
			weeks[weekKey].push(day);
		});

		// Sort weeks by date (oldest first)
		const sortedWeeks = Object.entries(weeks).sort(
			([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
		);

		return sortedWeeks.map(([weekStart, days]) => {
			// Sort days within each week by date
			const sortedDays = days.sort(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
			);
			// Sum time strings directly to avoid precision loss
			const totalTime = sumTimeStrings(sortedDays.map((day) => day.hoursWorked || "0:00"));
			return {
				weekKey: weekStart,
				weekLabel: `Week of ${getWeekLabel(weekStart)}`,
				days: sortedDays,
				totalTime,
			};
		});
	};

	const formatScheduleWindow = (day: any) => {
		if (day?.isRestDay || !day?.startTime || !day?.endTime) return "Off Day";
		const formatScheduleTime = (value: string | null | undefined) => {
			if (!value) return "";
			const [hoursRaw, minutesRaw] = value.split(":").map(Number);
			if (Number.isNaN(hoursRaw) || Number.isNaN(minutesRaw)) return value;
			const suffix = hoursRaw >= 12 ? "PM" : "AM";
			const hours = hoursRaw % 12 === 0 ? 12 : hoursRaw % 12;
			return `${hours}:${String(minutesRaw).padStart(2, "0")} ${suffix}`;
		};
		return `${formatScheduleTime(day.startTime)} - ${formatScheduleTime(day.endTime)}`;
	};

	const formatSnapshotScheduleWindow = (snapshot: any) => {
		const start = snapshot?.shiftStartTime || snapshot?.startTime;
		const end = snapshot?.shiftEndTime || snapshot?.endTime;
		if (!start || !end) return "Off Day";
		return `${String(start).slice(0, 5)} - ${String(end).slice(0, 5)}`;
	};

	const cleanNumber = (value: unknown, fallback = 0) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};

	const formatPlainNumber = (value: unknown, maximumFractionDigits = 2) =>
		new Intl.NumberFormat("en-PH", {
			maximumFractionDigits,
			minimumFractionDigits: 0,
		}).format(cleanNumber(value));

	const formatRateNumber = (value: unknown) =>
		new Intl.NumberFormat("en-PH", {
			maximumFractionDigits: 4,
			minimumFractionDigits: 0,
		}).format(cleanNumber(value));

	const formatPayEquation = (
		left: string,
		operator: string,
		right: string,
		result: unknown,
	) => `${left} ${operator} ${right} = ${formatCurrency(cleanNumber(result))}`;

	const ValueHover = ({
		children,
		lines,
		className = "",
	}: {
		children: ReactNode;
		lines: Array<string | null | undefined>;
		className?: string;
	}) => {
		const visibleLines = lines.filter(Boolean);
		if (!visibleLines.length) return <>{children}</>;

		return (
			<Tooltip>
				<TooltipTrigger>
					<span
						className={`inline-flex cursor-default items-center justify-end border-b border-dotted border-current/30 ${className}`}>
						{children}
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-[320px] whitespace-normal text-xs leading-5 text-slate-700">
					{visibleLines.map((line, index) => (
						<div key={`${line}-${index}`}>{line}</div>
					))}
				</TooltipContent>
			</Tooltip>
		);
	};

	const HeaderHelp = ({
		label,
		lines,
		className = "",
	}: {
		label: string;
		lines: Array<string | null | undefined>;
		className?: string;
	}) => (
		<ValueHover lines={lines} className={className}>
			{label}
		</ValueHover>
	);

	const SummaryHelp = ({
		label,
		lines,
	}: {
		label: string;
		lines: Array<string | null | undefined>;
	}) => {
		const visibleLines = lines.filter(Boolean);
		if (!visibleLines.length) return <>{label}</>;

		return (
			<Tooltip>
				<TooltipTrigger>
					<button
						type="button"
						className="inline-flex min-w-0 items-center gap-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
						<span className="truncate">{label}</span>
						<HelpCircle className="h-3.5 w-3.5 shrink-0 text-gray-400" />
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-[260px] whitespace-normal text-xs leading-5 text-gray-700">
					{visibleLines.map((line, index) => (
						<p key={`${line}-${index}`}>{line}</p>
					))}
				</TooltipContent>
			</Tooltip>
		);
	};

	const getAttendanceDayHelp = (day: any) => {
		const snapshot = day?.scheduleSnapshot || day?.metadata?.scheduleSnapshot || null;
		return [
			`Schedule: ${formatSnapshotScheduleWindow(snapshot)}`,
			snapshot?.name || snapshot?.scheduleName || null,
			"Basis: saved timesheet schedule snapshot.",
		];
	};

	const getDailyPayHelp = (dailyBreakdownItem: any, field: string) => {
		const bucketPay = dailyBreakdownItem?.metadata?.bandaiApprovedBucketDayPay;
		const hours = bucketPay?.hours || {};
		const reconciled =
			dailyBreakdownItem?.metadata?.payrollCentavoReconciliation?.[field];
		if (bucketPay) {
			const hourlyRate = cleanNumber(bucketPay.premiumHourlyRate);
			const dailyRate = cleanNumber(bucketPay.regularDailyRate);
			const equations: string[] = [];

			if (field === "regularPay") {
				equations.push(
					formatPayEquation(
						`${formatPlainNumber(hours.regularDays)} day${cleanNumber(hours.regularDays) === 1 ? "" : "s"}`,
						"x",
						formatCurrency(dailyRate),
						bucketPay.regularPay,
					),
				);
			}

			if (field === "overtimePay") {
				equations.push(
					formatPayEquation(
						`${formatPlainNumber(hours.regOtHrs)} hr${cleanNumber(hours.regOtHrs) === 1 ? "" : "s"}`,
						"x",
						`${formatCurrency(hourlyRate)} x 1.25`,
						bucketPay.overtimePay,
					),
				);
			}

			if (field === "nightDiffPay") {
				const nightAmount = cleanNumber(hours.nightDiffPayAmount);
				equations.push(
					nightAmount > 0
						? `${formatCurrency(nightAmount)} = ${formatCurrency(bucketPay.nightDiffPay)}`
						: formatPayEquation(
								`${formatPlainNumber(hours.regNdHrs)} hr${cleanNumber(hours.regNdHrs) === 1 ? "" : "s"}`,
								"x",
								`${formatCurrency(hourlyRate)} x 0.1`,
								bucketPay.nightDiffPay,
							),
				);
			}

			if (field === "holidayPay") {
				const holidayParts = [
					{
						hours: hours.rdHrs,
						multiplier: 1.3,
						result: bucketPay.restDayPay,
					},
					{
						hours: hours.rdOtHrs,
						multiplier: 1.69,
						result: bucketPay.restDayOtPay,
					},
					{
						hours: hours.spclHrs,
						multiplier: bucketPay.specialHolidayPay ? 1.3 : 0.3,
						result: bucketPay.specialHolidayPay,
					},
					{
						hours: hours.rholHrs,
						multiplier: 2,
						result: bucketPay.legalHolidayPay,
					},
				].filter((part) => cleanNumber(part.hours) > 0 || cleanNumber(part.result) > 0);

				holidayParts.forEach((part) => {
					equations.push(
						formatPayEquation(
							`${formatPlainNumber(part.hours)} hr${cleanNumber(part.hours) === 1 ? "" : "s"}`,
							"x",
							`${formatCurrency(hourlyRate)} x ${formatRateNumber(part.multiplier)}`,
							part.result,
						),
					);
				});
				equations.push(`Total = ${formatCurrency(bucketPay.holidayPay || 0)}`);
			}

			return [
				...equations,
				reconciled ? `Adjustment ${formatCurrency(reconciled)}` : null,
			];
		}
		return [
			"Value follows the saved payroll record.",
			dailyBreakdownItem?.scheduleSnapshot
				? `Schedule: ${formatSnapshotScheduleWindow(dailyBreakdownItem.scheduleSnapshot)}`
				: null,
		];
	};

	const getRateBreakdownHelp = (rateKey: string, rateBreakdown: any) => {
		const item = rateBreakdown?.[rateKey];
		const inputs = item?.inputs || {};
		const result = item?.result || 0;

		if (rateKey === "dailyRate") {
			return [
				`${formatCurrency(inputs.periodBasicSalary || 0)} / ${formatPlainNumber(inputs.totalWorkDays)} days = ${formatCurrency(result)}`,
			];
		}
		if (rateKey === "hourlyRate") {
			return [
				`${formatCurrency(inputs.dailyRate || 0)} / ${formatPlainNumber(inputs.workingHoursPerDay)} hrs = ${formatCurrency(result)}`,
			];
		}
		if (rateKey === "minuteRate") {
			return [
				`${formatCurrency(inputs.hourlyRate || 0)} / 60 mins = ${formatCurrency(result)}`,
			];
		}
		if (rateKey === "overtimeRate") {
			return [
				`${formatCurrency(inputs.hourlyRate || 0)} x ${formatRateNumber(inputs.multiplier)} = ${formatCurrency(result)}`,
			];
		}
		if (rateKey === "nightDiffRate") {
			return [
				`${formatCurrency(inputs.hourlyRate || 0)} x ${formatRateNumber(inputs.multiplier)} = ${formatCurrency(result)}`,
			];
		}

		return [];
	};

	const getRateBasisLabel = () => {
		if (!payrollRateSummary) return "Saved payroll rates";
		if (payrollRateSummary.method === "BNPI_DIRECT_313_APPROVED_BUCKETS") {
			return "Direct 313-day payroll basis";
		}
		if (payrollRateSummary.method === "TIMESHEET_PERIOD_WORK_DAYS") {
			return "Period work-day basis";
		}
		return "Saved payroll rates";
	};

	const getRateBasisProofLines = () => {
		if (!payrollRateSummary) return [];
		const monthlyRate = cleanNumber(payrollRateSummary.monthlySalary);
		const premiumDailyRate = cleanNumber(payrollRateSummary.bnpiDailyRate);
		const premiumHourlyRate = cleanNumber(payrollRateSummary.bnpiHourlyRate);
		const displayDailyRate = cleanNumber(payrollRateSummary.dailySalary);

		if (payrollRateSummary.method === "BNPI_DIRECT_313_APPROVED_BUCKETS") {
			return [
				`Payroll daily: (${formatCurrency(
					monthlyRate,
				)} x 12) / 313 = ${formatCurrency(
					premiumDailyRate,
				)}`,
				`Payroll hourly: ${formatCurrency(
					premiumDailyRate,
				)} / 8 = ${formatCurrency(
					premiumHourlyRate,
				)}`,
				`Display/allocation daily: ${formatCurrency(displayDailyRate)}`,
				"Display daily is kept separate from the payroll factor rate.",
			];
		}

		return [
			`Display daily: ${formatCurrency(displayDailyRate)}`,
			premiumHourlyRate > 0 ? `Payroll hourly: ${formatCurrency(premiumHourlyRate)}` : null,
		];
	};

	const getRateBasisRows = () => {
		if (!payrollRateSummary) return [];
		return [
			{
				label: "Display daily",
				value: payrollRateSummary.dailySalary,
				note: "Allocation display",
			},
			{
				label: "Payroll daily",
				value: payrollRateSummary.bnpiDailyRate,
				note:
					payrollRateSummary.method === "BNPI_DIRECT_313_APPROVED_BUCKETS"
						? "313-day basis"
						: "Saved proof",
			},
			{
				label: "Payroll hourly",
				value: payrollRateSummary.bnpiHourlyRate,
				note: "OT/rest/holiday/ND",
			},
			{
				label: "Regular OT hours",
				value: payrollRateSummary.regularOtHours,
				note: "Approved timesheet hours",
				format: "hours",
			},
		].filter((row) => cleanNumber(row.value) > 0 || row.format === "hours");
	};

	const RateBreakdownCard = ({
		label,
		rateKey,
		rateBreakdown,
	}: {
		label: string;
		rateKey: string;
		rateBreakdown: any;
	}) => (
		<div className="min-w-0 border-l border-gray-200 pl-2 first:border-l-0 first:pl-0">
			<div className="truncate text-[11px] font-medium text-gray-500">
				{label}
			</div>
			<div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
				<ValueHover lines={getRateBreakdownHelp(rateKey, rateBreakdown)}>
					{formatCurrency(rateBreakdown?.[rateKey]?.result || 0)}
				</ValueHover>
			</div>
		</div>
	);

	const getPeriodScheduleDayLabel = (day: any) => {
		if (!day) return "Work Day";
		if (day.isOvernight) return "Night Shift";
		if (day.isRestDay) return "Off Day";
		return "Work Day";
	};

	// Percentage widths leave room for sticky Actions (~132px) so table-fixed
	// stays inside the content shell without horizontal scroll.
	const columns: Column<EmployeePayroll>[] = [
		{
			key: "employee",
			label: "Employee",
			width: "20%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			render: (_, item) => (
				<EmployeeTableCell
					profileId={item.employee?.id}
					fullName={getEmployeeName(item)}
					employeeId={item.employee?.employeeId || "No ID"}
					avatar={item.employee?.user?.avatar ?? null}
					className="min-w-0"
				/>
			),
		},
		{
			key: "payrollPeriod.name",
			label: "Period",
			width: "14%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			render: (_, item) => (
				<div className="min-w-0 leading-tight">
					<div className="truncate text-xs font-medium text-gray-900">
						{item.payrollPeriod?.name || "N/A"}
					</div>
					<div className="truncate text-[11px] text-gray-500">
						{item.payrollPeriod?.startDate
							? formatDate(item.payrollPeriod.startDate, "short")
							: "N/A"}
						{" – "}
						{item.payrollPeriod?.endDate
							? formatDate(item.payrollPeriod.endDate, "short")
							: "N/A"}
					</div>
				</div>
			),
		},
		{
			key: "employee.payFrequency",
			label: "Freq.",
			width: "9%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			render: (_, item) => {
				const val = ((item.employee as any).payFrequency || "MONTHLY") as string;
				const formatted = val
					?.toLowerCase()
					.replace(/_/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
				return (
					<Badge
						variant="outline"
						className="max-w-full truncate px-1.5 py-0 text-[10px] font-normal leading-4">
						{formatted || val}
					</Badge>
				);
			},
		},
		{
			key: "basicPay",
			label: "Basic",
			width: "11%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			headerClassName: "text-right",
			render: (_, item) => (
				<span className="block truncate text-right font-mono text-xs tabular-nums">
					{formatCurrency(item.basicPay)}
				</span>
			),
		},
		{
			key: "grossPay",
			label: "Gross",
			width: "11%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			headerClassName: "text-right",
			render: (value) => (
				<span className="block truncate text-right font-mono text-xs tabular-nums">
					{formatCurrency(value)}
				</span>
			),
		},
		{
			key: "totalDeductions",
			label: "Deduct.",
			width: "11%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			headerClassName: "text-right",
			render: (value) => (
				<span className="block truncate text-right font-mono text-xs tabular-nums text-red-600">
					-{formatCurrency(value)}
				</span>
			),
		},
		{
			key: "netPay",
			label: "Net",
			width: "12%",
			className: "max-w-0 overflow-hidden px-2 py-2",
			headerClassName: "text-right",
			render: (value) => (
				<span className="block truncate text-right font-mono text-xs font-semibold tabular-nums text-green-700">
					{formatCurrency(value)}
				</span>
			),
		},
	];

	const handleView = (payroll: EmployeePayroll) => {
		updateSearchParams((next) => {
			next.set("action", "view");
			next.set("id", payroll.id);
		});
	};

	const handleOpenEmployeeProfile = (employeeId?: string | null) => {
		if (!employeeId) return;
		navigate(`/employee/${employeeId}`);
	};

	const renderActions = (item: EmployeePayroll) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="w-8 h-8 p-0">
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={() => handleView(item)}>
					<Eye className="h-4 w-4 mr-2" /> View Details
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => handleViewPayslipForRow(item)}
					disabled={viewingPayslipId === item.id}>
					<FileText className="h-4 w-4 mr-2" />
					{viewingPayslipId === item.id ? "Opening Payslip" : "View Payslip"}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => handleDownloadPayslipForRow(item)}
					disabled={downloadPayslipMutation.isPending}>
					<Download className="h-4 w-4 mr-2" /> Download PDF
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// Server-side search handler
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

	// Server-side pagination handler
	const handlePageChange = (page: number) => {
		updateSearchParams((next) => {
			next.set("page", page.toString());
		});
	};

	return (
		<div className="space-y-6">
			<Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
				<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
					<TabsList>
						<TabsTrigger value="active">Active Payroll Period</TabsTrigger>
						<TabsTrigger value="past">Past Periods</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="active" className="space-y-4">
					{currentPeriod ? (
						<DataTable
							title={title}
							description={`${description} for ${currentPeriod.name}`}
							data={filteredItems}
							columns={columns}
							renderActions={renderActions}
							isLoading={isLoading}
							emptyMessage="No payroll records found"
							emptyDescription="Payroll records will appear here once generated."
							searchWidth="w-80"
							searchPlaceholder="Search payroll..."
							toolbarAlign="right"
							itemsPerPage={limitParam}
							currentPage={pageParam}
							totalItems={totalPayrollItems}
							onSearch={handleSearch}
							onPageChange={handlePageChange}
							searchValue={searchQuery || ""}
							filters={payrollAdvancedFilters}
							filterValues={payrollAdvancedFilterValues}
							onFilterChange={handleFilterChange}
							filterButtonLabel="Filters"
							filterColumns={2}
							filterPopoverExtra={payrollPopoverFilters}
							showExport
							onExportCSV={() => handleExportRegister("csv")}
							onExportPDF={() => handleExportRegister("pdf")}
							onExportExcel={() => handleExportRegister("xlsx")}
						/>
					) : (
						<div className="text-center py-8 text-gray-500">
							<p>No active payroll period found for today.</p>
							<p className="text-sm mt-2">
								Please create a payroll period that includes today&apos;s date.
							</p>
						</div>
					)}
				</TabsContent>

				<TabsContent value="past" className="space-y-4">
					<DataTable
						title={title}
						description={
							selectedPeriodId && selectedPeriodId !== "all"
								? `${description} - Selected Period`
								: "All past payroll records"
						}
						data={filteredItems}
						columns={columns}
						renderActions={renderActions}
						isLoading={isLoading}
						emptyMessage="No payroll records found"
						emptyDescription="Select a period to view payroll records."
						searchWidth="w-80"
						searchPlaceholder="Search payroll..."
						toolbarAlign="right"
						itemsPerPage={limitParam}
						currentPage={pageParam}
						totalItems={totalPayrollItems}
						onSearch={handleSearch}
						onPageChange={handlePageChange}
						searchValue={searchQuery || ""}
						filters={payrollAdvancedFilters}
						filterValues={payrollAdvancedFilterValues}
						onFilterChange={handleFilterChange}
						filterButtonLabel="Filters"
						filterColumns={2}
						filterPopoverExtra={payrollPopoverFilters}
						showExport
						onExportCSV={() => handleExportRegister("csv")}
						onExportPDF={() => handleExportRegister("pdf")}
						onExportExcel={() => handleExportRegister("xlsx")}
					/>
				</TabsContent>
			</Tabs>

			{/* Import Modal */}

			{/* View Modal */}
			<Modal
				open={action === "view"}
				onOpenChange={(open) => {
					if (!open) {
						closePayrollDetail();
					}
				}}
				showCloseButton={false}
				closeOnBackdropClick
				className="max-w-6xl p-5">
				{isLoadingPayroll ? (
					<div className="flex items-center justify-center py-12">
						<div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-400 border-t-transparent"></div>
					</div>
				) : payrollData ? (
					<div className="space-y-4">
						{/* Modal Header (Timesheet-style) */}
						<div className="flex items-start justify-between">
							<div className="space-y-0.5">
								<h2 className="text-lg font-bold leading-none tracking-tight">
									Payroll summary
								</h2>
							</div>
							<div className="flex items-center">
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
									onClick={closePayrollDetail}>
									<X className="h-4 w-4" />
									<span className="sr-only">Close</span>
								</Button>
							</div>
						</div>

						{/* Header Section */}
						<div className="rounded-lg border border-gray-200 bg-white p-3">
							<button
								type="button"
								onClick={() => handleOpenEmployeeProfile(payrollEmployeeProfileId)}
								disabled={!payrollEmployeeProfileId}
								className="flex min-w-0 w-full items-start gap-3 rounded-md text-left transition enabled:cursor-pointer enabled:hover:bg-orange-50/60 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-orange-300 disabled:cursor-default disabled:opacity-100">
								<EmployeeAvatar
									src={(payrollData as EmployeePayroll)?.employee?.user?.avatar}
									alt={getEmployeeName(payrollData as EmployeePayroll)}
									size="md"
									className="shrink-0"
								/>
								<div className="min-w-0 flex-1">
									<h3 className="text-base font-semibold text-gray-900 truncate">
										{getEmployeeName(payrollData as EmployeePayroll)}
									</h3>
									<p className="mt-0.5 min-w-0 truncate text-xs text-gray-500">
										<span className="truncate">
											{payrollData.payrollPeriod?.name || "Payroll period"}
										</span>
										{payrollData.payrollPeriod?.startDate &&
											payrollData.payrollPeriod?.endDate && (
												<span className="ml-2 pl-2 border-l border-gray-300">
													{payrollPeriodRange}
												</span>
											)}
									</p>
									<div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
										<span className="max-w-full truncate">{payrollData.employee?.employeeId || "N/A"}</span>
										<span aria-hidden="true" className="text-gray-300">/</span>
										<span className="max-w-[220px] truncate">
											{payrollData.employee?.department?.name || "N/A"}
										</span>
										<span aria-hidden="true" className="text-gray-300">/</span>
										<span className="max-w-[260px] truncate">
											{payrollData.employee?.position?.title || "N/A"}
										</span>
									</div>
								</div>
							</button>
							{/* Notes hidden */}
						</div>

						<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
							<div className="grid gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-5">
								{payrollSummaryCells.map((cell) => (
									<div key={cell.label} className="min-w-0 bg-white px-3 py-2.5">
										<div className="text-xs font-medium text-gray-500">
											<SummaryHelp label={cell.label} lines={cell.lines} />
										</div>
										<div
											className={`mt-1 break-words text-sm font-semibold tabular-nums ${cell.tone}`}>
											{cell.value}
										</div>
									</div>
								))}
							</div>
						</div>

						<Accordion
							type="multiple"
							defaultValue={
								hasPayrollCorrections
									? ["earnings-deductions", "prior-period-corrections"]
									: ["earnings-deductions"]
							}
							className="rounded-lg border border-gray-200 bg-white">
							<AccordionItem value="earnings-deductions" className="border-b border-gray-200">
								<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
									Payroll computation
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
												{grossBaseRows.map((row) => (
													<div
														key={`gross-${(row as { field?: string }).field || row.label}-${row.amount}`}
														className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
														<span className="min-w-0 truncate font-medium text-gray-900">
															{row.label}
														</span>
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
												{grossBenefitRows.length > 0 && (
													<div className="bg-slate-50/80">
														<div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
															Benefits applied
														</div>
														{grossBenefitNonTaxableRows.length > 0 && (
															<div>
																<div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-800/80">
																	Non-taxable
																</div>
																{grossBenefitNonTaxableRows.map((row) => (
																	<div
																		key={`gross-nt-${(row as { field?: string }).field || row.label}-${row.amount}`}
																		className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																		<span className="min-w-0 truncate font-medium text-gray-900">
																			{row.label}
																		</span>
																		<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-gray-950">
																			{row.operation === "SUBTRACT" ? "-" : "+"}
																			{formatCurrency(row.amount)}
																		</span>
																	</div>
																))}
															</div>
														)}
														{grossBenefitTaxableRows.length > 0 && (
															<div>
																<div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-900/80">
																	Taxable
																</div>
																{grossBenefitTaxableRows.map((row) => (
																	<div
																		key={`gross-t-${(row as { field?: string }).field || row.label}-${row.amount}`}
																		className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
																		<span className="min-w-0 truncate font-medium text-gray-900">
																			{row.label}
																		</span>
																		<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-gray-950">
																			{row.operation === "SUBTRACT" ? "-" : "+"}
																			{formatCurrency(row.amount)}
																		</span>
																	</div>
																))}
															</div>
														)}
													</div>
												)}
												{grossTrailingRows.map((row) => {
													const isCorrection = String(
														(row as { field?: string }).field || "",
													).startsWith("payrollCorrection:");
													const explanation = String(
														(row as { explanation?: string }).explanation || "",
													).trim();
													return (
														<div
															key={`gross-trail-${(row as { field?: string }).field || row.label}-${row.amount}`}
															className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
															<div className="min-w-0">
																<span className="block truncate font-medium text-gray-900">
																	{row.label}
																</span>
																{isCorrection && explanation ? (
																	<span className="mt-0.5 block truncate text-[10px] text-gray-500">
																		{explanation}
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
													);
												})}
												<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-orange-50 px-3 py-2 text-sm">
													<span className="font-semibold text-orange-950">GrossPay</span>
													<span className="font-mono font-bold tabular-nums text-orange-950">
														{formatCurrency(payrollGrossPay)}
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
												{deductionFormulaRows.map((row) => (
													<div
														key={`deduction-${row.label}-${row.amount}`}
														className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
														<span className="min-w-0 truncate font-medium text-gray-900">
															{row.label}
														</span>
														<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-rose-700">
															-{formatCurrency(row.amount)}
														</span>
													</div>
												))}
												<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-rose-50 px-3 py-2 text-sm">
													<span className="font-semibold text-rose-950">
														Total Deductions
													</span>
													<span className="font-mono font-bold tabular-nums text-rose-950">
														-{formatCurrency(payrollTotalDeductions)}
													</span>
												</div>
												<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-emerald-50 px-3 py-2 text-sm">
													<span className="font-semibold text-emerald-950">NetPay</span>
													<span className="font-mono font-bold tabular-nums text-emerald-950">
														{formatCurrency(payrollNetPay)}
													</span>
												</div>
												{postNetFormulaRows.map((row) => (
													<div
														key={`post-net-${row.label}-${row.amount}`}
														className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs">
														<span className="min-w-0 truncate font-medium text-gray-900">
															{row.label}
														</span>
														<span className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-sky-700">
															+{formatCurrency(row.amount)}
														</span>
													</div>
												))}
												<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-sky-50 px-3 py-2 text-sm">
													<span className="font-semibold text-sky-950">
														TotalReceivable
													</span>
													<span className="font-mono font-bold tabular-nums text-sky-950">
														{formatCurrency(payrollTotalReceivable)}
													</span>
												</div>
											</div>
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>

						{/* Salary and rate basis */}
							{(payrollData as any).metadata && (
								<AccordionItem value="rates-used" className="border-b border-gray-200">
									<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
										Rates used
									</AccordionTrigger>
									<AccordionContent className="px-3 pb-3">
							<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
								<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<h4 className="text-sm font-semibold text-gray-800">
											Salary and rates
										</h4>
										{payrollRateSummary && (
											<Badge
												variant="outline"
												className="h-5 max-w-full rounded-md border-gray-300 px-2 text-[10px] font-normal">
												{getRateBasisLabel()}
											</Badge>
										)}
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant="outline"
											className="h-5 rounded-md border-gray-300 px-2 text-[10px] font-normal">
											{(
												(payrollData as any).metadata.payFrequency ||
												"N/A"
											).replace("_", " ")}
										</Badge>
										<Banknote className="h-4 w-4 text-gray-400" />
									</div>
								</div>
								<div
									className={
										payrollRateSummary
											? "grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
											: "grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
									}>
									<div className="grid grid-cols-3 gap-x-3 gap-y-2 border-b border-gray-200 p-3 md:border-b-0 md:border-r">
										<div className="min-w-0">
											<div className="truncate text-[11px] font-medium text-gray-500">
												Monthly salary
											</div>
											<div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
												{formatCurrency(
													(payrollData as any).metadata.monthlyRate ||
														(payrollData as any).metadata.basicSalary ||
														0,
												)}
											</div>
										</div>
										<div className="min-w-0">
											<div className="truncate text-[11px] font-medium text-gray-500">
												Basic period
											</div>
											<div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
												{formatCurrency(
													(payrollData as any).metadata.basicSalary || 0,
												)}
											</div>
										</div>
										<div className="min-w-0">
											<div className="truncate text-[11px] font-medium text-gray-500">
												Working days
											</div>
											<div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
												{(payrollData as any).metadata.workingDays || 0}
											</div>
										</div>
									</div>
									{payrollRateSummary && (
										<div className="border-b border-gray-200 p-3 md:border-b-0 md:border-r">
											<div className="grid grid-cols-2 gap-x-4 gap-y-2">
												{getRateBasisRows().map((row) => (
													<div key={row.label} className="min-w-0">
														<div className="truncate text-[11px] font-medium text-gray-500">
															{row.label}
														</div>
														<div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
															{row.format === "hours"
																? `${formatPlainNumber(row.value)} hrs`
																: formatCurrency(row.value)}
														</div>
													</div>
												))}
											</div>
											<div className="mt-3 border-t border-gray-200 pt-2 text-xs leading-5 text-gray-700">
												<ValueHover
													lines={getRateBasisProofLines()}
													className="max-w-full text-left font-medium text-gray-900">
													<span className="truncate">Rate proof</span>
												</ValueHover>
											</div>
										</div>
									)}
									{(payrollData as any).rateBreakdown && (
										<div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 md:grid-cols-2 xl:grid-cols-5">
											<RateBreakdownCard
												label="Daily"
												rateKey="dailyRate"
												rateBreakdown={(payrollData as any).rateBreakdown}
											/>
											<RateBreakdownCard
												label="Hourly"
												rateKey="hourlyRate"
												rateBreakdown={(payrollData as any).rateBreakdown}
											/>
											<RateBreakdownCard
												label="Minute"
												rateKey="minuteRate"
												rateBreakdown={(payrollData as any).rateBreakdown}
											/>
											<RateBreakdownCard
												label="OT"
												rateKey="overtimeRate"
												rateBreakdown={(payrollData as any).rateBreakdown}
											/>
											<RateBreakdownCard
												label="ND"
												rateKey="nightDiffRate"
												rateBreakdown={(payrollData as any).rateBreakdown}
											/>
										</div>
									)}
								</div>
							</div>
									</AccordionContent>
								</AccordionItem>
						)}

						{/* Attendance Summary + Weekly Schedule */}
							{(payrollData.timesheetSnapshot ||
							(payrollData as any).metadata?.weeklySchedule ||
							payrollPeriodScheduleWeeks.length > 0) && (
								<AccordionItem value="attendance-basis" className="border-b border-gray-200">
									<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
										Attendance basis
									</AccordionTrigger>
									<AccordionContent className="px-3 pb-3">
									<div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
								{payrollData.timesheetSnapshot && (
									<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
										<div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
											<h4 className="text-sm font-semibold text-gray-900">
												Attendance snapshot
											</h4>
											<Calendar className="h-4 w-4 text-gray-400" />
										</div>
										<div className="p-3">
											<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-4">
												<div className="min-w-0 bg-white px-3 py-2">
													<div className="text-[11px] font-medium text-gray-500">
														Total Days
													</div>
													<div className="mt-1 text-base font-semibold leading-none text-gray-950">
														{payrollData.timesheetSnapshot.totalDays ||
															0}
													</div>
												</div>
												<div className="min-w-0 bg-white px-3 py-2">
													<div className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
														<HeaderHelp
															label="Present"
															lines={[
																"Counted from the saved payroll timesheet snapshot.",
																"Hover a daily row for the exact schedule used that day.",
															]}
														/>
													</div>
													<div className="mt-1 text-base font-semibold leading-none text-gray-950">
														{payrollData.timesheetSnapshot
															.daysPresent || 0}
													</div>
												</div>
												<div className="min-w-0 bg-white px-3 py-2">
													<div className="text-[11px] font-medium text-gray-500">
														Absent
													</div>
													<div className="mt-1 text-base font-semibold leading-none text-rose-700">
														{payrollData.timesheetSnapshot.daysAbsent ||
															0}
													</div>
												</div>
												<div className="min-w-0 bg-white px-3 py-2">
													<div className="text-[11px] font-medium text-gray-500">
														Rest Days
													</div>
													<div className="mt-1 text-base font-semibold leading-none text-gray-950">
														{payrollData.timesheetSnapshot
															.daysRestDay || 0}
													</div>
												</div>
											</div>
										</div>
									</div>
								)}

								{(((payrollData as any).metadata?.weeklySchedule as any[])?.length >
									0 ||
									payrollPeriodScheduleWeeks.length > 0) && (
									<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
										<div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
											<div className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-2">
												<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
													<h4 className="text-sm font-semibold text-gray-900">
														Period schedule
													</h4>
													<p className="text-[11px] text-gray-500">
														Grace period: {payrollGracePeriodMinutes}{" "}
														min
													</p>
													<span className="text-[11px] font-semibold text-gray-700">
														{Number(
															activePeriodScheduleWeek?.totalHours ??
																(payrollData as any).metadata
																	.weeklyTotalHours ??
																0,
														).toFixed(1)}{" "}
														hrs/week
													</span>
												</div>
												{payrollPeriodScheduleWeeks.length > 0 && (
													<div className="flex items-center gap-1">
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="h-7 w-7 rounded-md border-gray-200 p-0 text-gray-600 hover:bg-gray-50"
															disabled={
																clampedPeriodScheduleWeekIndex <= 0
															}
															onClick={() =>
																setPeriodScheduleWeekIndex((prev) =>
																	Math.max(0, prev - 1),
																)
															}>
															<ChevronLeft className="h-3.5 w-3.5" />
														</Button>
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="h-7 rounded-md border-gray-200 bg-white px-3 text-xs text-gray-700 hover:bg-gray-50"
															onClick={() =>
																setPeriodScheduleWeekIndex(
																	getCurrentPeriodWeekIndex(),
																)
															}>
															Current
														</Button>
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="h-7 w-7 rounded-md border-gray-200 p-0 text-gray-600 hover:bg-gray-50"
															disabled={
																clampedPeriodScheduleWeekIndex >=
																payrollPeriodScheduleWeeks.length -
																	1
															}
															onClick={() =>
																setPeriodScheduleWeekIndex((prev) =>
																	Math.min(
																		payrollPeriodScheduleWeeks.length -
																			1,
																		prev + 1,
																	),
																)
															}>
															<ChevronRight className="h-3.5 w-3.5" />
														</Button>
													</div>
												)}
											</div>
										</div>
										<div className="p-3">
											{payrollPeriodScheduleWeeks.length > 0 ? (
												<div className="space-y-3">
													<div className="flex flex-wrap items-center justify-between gap-2">
														<div className="text-xs font-semibold text-gray-700">
															{getWeekLabel(
																activePeriodScheduleWeek?.weekStart,
															)}{" "}
															-{" "}
															{getWeekLabel(
																activePeriodScheduleWeek?.weekEnd,
															)}
														</div>
													</div>
													<div className="overflow-x-auto pb-1">
														<div className="flex min-w-max items-stretch gap-2">
															{(
																activePeriodScheduleWeek?.days || []
															).map((day: any) => (
																<div
																	key={day.date}
																	className={`w-[118px] shrink-0 rounded-md border px-3 py-2 text-center ${
																		day.isRestDay
																			? "border-gray-200 bg-gray-50"
																			: day.isOvernight
																				? "border-orange-200 bg-orange-50"
																				: "border-gray-200 bg-white"
																	}`}>
																	<div className="text-[10px] font-semibold text-gray-700">
																		{day.weekday}
																	</div>
																	<div className="mt-1 text-[10px] text-gray-500">
																		{new Date(
																			day.date,
																		).toLocaleDateString(
																			"en-US",
																			{
																				month: "short",
																				day: "numeric",
																			},
																		)}
																	</div>
																	<div
																		className={`mt-2 text-[11px] font-semibold ${
																			day.isOvernight
																				? "text-orange-700"
																				: day.isRestDay
																					? "text-slate-600"
																					: "text-[#1f2937]"
																		}`}>
																		{getPeriodScheduleDayLabel(
																			day,
																		)}
																	</div>
																	<div className="mt-1 text-[10px] leading-4 text-gray-600">
																		{formatScheduleWindow(day)}
																	</div>
																</div>
															))}
														</div>
													</div>
												</div>
											) : (
												<div className="flex gap-2 text-center">
													{(
														payrollData as any
													).metadata.weeklySchedule.map(
														(schedule: any, idx: number) => (
															<div
																key={idx}
																className={`flex-1 py-1.5 px-1 rounded-md border ${
																	schedule.isRestDay
																		? "bg-slate-100 border-blue-200 text-blue-800"
																		: "bg-white border-gray-300 text-gray-900"
																}`}>
																<div className="text-[10px] font-semibold">
																	{schedule.day}
																</div>
																<div className="text-[10px] mt-0.5 font-medium">
																	{schedule.isRestDay
																		? "Rest"
																		: `${schedule.hours}h`}
																</div>
															</div>
														),
													)}
												</div>
											)}
										</div>
									</div>
								)}
							</div>
									</AccordionContent>
								</AccordionItem>
						)}

						{/* Prior-period corrections (applied as retro on this payslip) */}
							{hasPayrollCorrections && (
								<AccordionItem
									value="prior-period-corrections"
									className="border-b border-gray-200">
									<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
										<span className="flex min-w-0 flex-wrap items-center gap-2">
											Prior-period corrections
											<Badge
												variant="outline"
												className="h-5 rounded-md border-orange-200 bg-orange-50 px-2 text-[10px] font-normal text-orange-800">
												{formatCurrency(payrollCorrectionTotal)}
											</Badge>
										</span>
									</AccordionTrigger>
									<AccordionContent className="px-3 pb-3">
										<div className="space-y-3">
											<p className="text-[11px] text-gray-500">
												Approved PayrollCorrection lines applied on this payslip as
												labeled retro. Day deltas are from the locked source period
												and do not rewrite that period&apos;s timesheet.
											</p>
											{payrollCorrections.map((line, lineIndex) => {
												const deltas = Array.isArray(line.dayDeltas)
													? line.dayDeltas
													: [];
												const amount = Number(line.amount) || 0;
												return (
													<div
														key={line.correctionId || `corr-${lineIndex}`}
														className="overflow-hidden rounded-md border border-gray-200 bg-white"
														data-testid={`payroll-summary-correction-${line.correctionId || lineIndex}`}>
														<div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
															<div className="min-w-0">
																<div className="text-sm font-semibold text-gray-900">
																	{line.label || "Prior-period correction"}
																</div>
																<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
																	{line.sourcePayrollPeriodName ? (
																		<span>
																			Source: {line.sourcePayrollPeriodName}
																		</span>
																	) : null}
																	{line.requestId ? (
																		<span>
																			Req {String(line.requestId).slice(0, 8)}…
																		</span>
																	) : null}
																	{line.status ? (
																		<Badge
																			variant="outline"
																			className="h-5 rounded-md px-1.5 text-[10px] font-normal">
																			{line.status}
																		</Badge>
																	) : null}
																</div>
															</div>
															<div
																className={`text-sm font-semibold tabular-nums ${
																	amount < 0 ? "text-rose-700" : "text-emerald-700"
																}`}>
																{amount < 0 ? "-" : "+"}
																{formatCurrency(Math.abs(amount))}
															</div>
														</div>
														{deltas.length > 0 ? (
															<div className="max-h-[240px] overflow-auto">
																<table className="w-full text-left text-xs">
																	<thead className="sticky top-0 bg-white text-[10px] font-semibold uppercase tracking-wide text-gray-500">
																		<tr className="border-b border-gray-100">
																			<th className="px-3 py-1.5">Date</th>
																			<th className="px-3 py-1.5">Type</th>
																			<th className="px-3 py-1.5 text-right">
																				Before
																			</th>
																			<th className="px-3 py-1.5 text-right">
																				After
																			</th>
																			<th className="px-3 py-1.5 text-right">
																				Delta
																			</th>
																			<th className="px-3 py-1.5">Clocks</th>
																		</tr>
																	</thead>
																	<tbody className="divide-y divide-gray-50">
																		{deltas.map((delta, deltaIndex) => {
																			const deltaMin =
																				delta.deltaMinutes != null
																					? Number(delta.deltaMinutes) || 0
																					: (Number(delta.afterMinutes) || 0) -
																						(Number(delta.beforeMinutes) || 0);
																			return (
																				<tr
																					key={`${delta.date || deltaIndex}-${delta.hoursType || ""}`}
																					className="text-gray-800">
																					<td className="whitespace-nowrap px-3 py-1.5 font-medium">
																						{delta.date || "—"}
																					</td>
																					<td className="px-3 py-1.5">
																						{delta.hoursType || "—"}
																					</td>
																					<td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-600">
																						{formatCorrectionMinutes(
																							Number(delta.beforeMinutes) || 0,
																						)}
																					</td>
																					<td className="px-3 py-1.5 text-right font-mono tabular-nums text-gray-600">
																						{formatCorrectionMinutes(
																							Number(delta.afterMinutes) || 0,
																						)}
																					</td>
																					<td
																						className={`px-3 py-1.5 text-right font-mono font-semibold tabular-nums ${
																							deltaMin > 0
																								? "text-emerald-700"
																								: deltaMin < 0
																									? "text-rose-700"
																									: "text-gray-500"
																						}`}>
																						{formatSignedMinutes(deltaMin)}
																					</td>
																					<td className="whitespace-nowrap px-3 py-1.5 text-gray-500">
																						{delta.timeIn || delta.timeOut
																							? `${delta.timeIn || "—"}–${delta.timeOut || "—"}`
																							: "—"}
																					</td>
																				</tr>
																			);
																		})}
																	</tbody>
																</table>
															</div>
														) : (
															<div className="px-3 py-2 text-xs text-gray-500">
																No day-level deltas stored on this correction line.
															</div>
														)}
													</div>
												);
											})}
											<div className="flex items-center justify-between rounded-md border border-orange-100 bg-orange-50/60 px-3 py-2 text-sm">
												<span className="font-semibold text-orange-950">
													Corrections total (in GrossPay)
												</span>
												<span className="font-mono font-bold tabular-nums text-orange-950">
													{payrollCorrectionTotal < 0 ? "-" : "+"}
													{formatCurrency(Math.abs(payrollCorrectionTotal))}
												</span>
											</div>
										</div>
									</AccordionContent>
								</AccordionItem>
							)}

						{/* Daily Breakdown */}
							{((payrollData.timesheet?.breakdown?.length || 0) > 0 ||
							((payrollData as any).dailyBreakdown?.length || 0) > 0 ||
							hasPayrollCorrections) && (
								<AccordionItem value="daily-detail" className="border-b-0">
									<AccordionTrigger className="px-3 py-2.5 text-sm font-semibold text-gray-900 hover:no-underline">
										Daily detail
									</AccordionTrigger>
									<AccordionContent className="px-3 pb-3">
							<div className="space-y-5">
								{/* 1. Daily Attendance Logs */}
								{((payrollData.timesheet?.breakdown?.length || 0) > 0 ||
									((payrollData as any).dailyBreakdown?.length || 0) > 0) && (
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
											<Clock className="w-4 h-4 text-gray-500" />
											Daily Attendance Logs
										</h4>
										<div className="flex items-center gap-2">
											{linkedTimesheetId ? (
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														navigate(
															`/hr/timesheets?tab=active&action=view&id=${linkedTimesheetId}`,
														)
													}
													className="h-7 px-2 text-xs">
													View Timesheet
												</Button>
											) : (
												<span className="text-xs text-gray-400">
													No linked timesheet
												</span>
											)}
											<span className="text-xs text-gray-500">
												Work hours and attendance status
											</span>
										</div>
									</div>
									<div className="border rounded-lg overflow-hidden shadow-sm">
										<div className="max-h-[400px] overflow-y-auto">
											<table className="w-full text-xs text-left">
												<thead className="bg-gray-50 text-gray-700 font-medium border-b sticky top-0 bg-white shadow-sm z-10">
													<tr className="text-xs">
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r align-bottom pb-2">
															Date
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r align-bottom pb-2">
															Status
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r align-bottom pb-2">
															Day Type
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r min-w-[80px] align-bottom pb-2">
															In
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r min-w-[80px] align-bottom pb-2">
															Out
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 text-right font-medium align-bottom pb-2">
															<HeaderHelp
																label="Total"
																lines={[
																	"Total worked time from the effective timesheet line.",
																	"Schedule comes from the same line snapshot.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-gray-50 text-right align-bottom pb-2">
															Reg
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-red-50/20 text-right text-red-600 align-bottom pb-2">
															Late
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-red-50/20 text-right text-red-600 align-bottom pb-2">
															Early Out
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/30 text-right text-blue-700 align-bottom pb-2">
															<HeaderHelp
																label="OT"
																lines={[
																	"Approved overtime hours from the effective timesheet line.",
																	"Pay may use approved OT workbook buckets when present.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/30 text-center text-blue-700 align-bottom pb-2">
															OTC
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-stone-50 text-right text-stone-700 align-bottom pb-2">
															Shortfall
														</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-gray-100">
													{payrollAttendanceBreakdown.map(
														(day: any, idx: number) => (
															<tr
																key={idx}
																className={`transition-colors ${
																	day.status === "ABSENT"
																		? "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500"
																		: "hover:bg-gray-50"
																}`}>
																<td className="py-2 px-3 text-gray-600 whitespace-nowrap border-r font-medium">
																	{new Date(
																		day.date,
																	).toLocaleDateString(
																		undefined,
																		{
																			month: "short",
																			day: "numeric",
																			weekday: "short",
																		},
																	)}
																</td>
																<td className="py-2 px-3 whitespace-nowrap border-r">
																	<Badge
																		variant={
																			day.status === "PRESENT"
																				? "success"
																				: day.status ===
																					  "ABSENT"
																					? "destructive"
																					: day.status ===
																						  "REST_DAY"
																						? "secondary"
																						: "outline"
																		}
																		className={`text-[10px] px-1.5 py-0.5 h-auto ${
																			day.status === "ABSENT"
																				? "text-white"
																				: day.status ===
																					  "REST_DAY"
																					? "bg-orange-500 text-white border-orange-500 hover:bg-orange-500"
																					: ""
																		}`}>
																		{day.status}
																	</Badge>
																</td>
																<td className="py-2 px-3 whitespace-nowrap border-r">
																	<Badge
																		variant="outline"
																		className="text-[10px] px-1.5 py-0.5 h-auto">
																		{day.dayTypeDisplay ||
																			day.dayType ||
																			"-"}
																	</Badge>
																</td>
																<td className="py-2 px-3 text-gray-600 whitespace-nowrap bg-gray-50/20 text-xs">
																	{day.timeIn
																		? new Date(
																				day.timeIn,
																			).toLocaleTimeString(
																				[],
																				{
																					hour: "2-digit",
																					minute: "2-digit",
																				},
																			)
																		: "-"}
																</td>
																<td className="py-2 px-3 text-gray-600 whitespace-nowrap border-r bg-gray-50/20 text-xs">
																	{day.timeOut
																		? new Date(
																				day.timeOut,
																			).toLocaleTimeString(
																				[],
																				{
																					hour: "2-digit",
																					minute: "2-digit",
																				},
																			)
																		: "-"}
																</td>
																<td className="py-2 px-3 text-gray-900 font-bold whitespace-nowrap text-right">
																	<ValueHover
																		lines={getAttendanceDayHelp(
																			day,
																		)}>
																		{day.hoursWorked || "0:00"}
																	</ValueHover>
																</td>
																<td className="py-2 px-3 text-gray-600 whitespace-nowrap text-right">
																	{day.regularHours || "0:00"}
																</td>
																<td className="py-2 px-3 text-red-600 whitespace-nowrap text-right text-xs">
																	{day.lateHours !== "0:00"
																		? day.lateHours
																		: "-"}
																</td>
																<td className="py-2 px-3 text-rose-600 whitespace-nowrap text-right text-xs">
																	{day.earlyOutHours !== "0:00"
																		? day.earlyOutHours
																		: "-"}
																</td>
																<td className="py-2 px-3 text-blue-700 whitespace-nowrap text-right text-xs font-semibold">
																	{day.overtimeHours !== "0:00"
																		? day.overtimeHours
																		: "-"}
																</td>
																<td className="py-2 px-3 text-blue-700 whitespace-nowrap text-center text-xs font-bold bg-blue-50/30">
																	{(() => {
																		const hours = parseInt(
																			day.overtimeHours?.split(
																				":",
																			)[0] || "0",
																			10,
																		);
																		return hours > 0
																			? hours
																			: "-";
																	})()}
																</td>
																<td className="py-2 px-3 text-stone-700 whitespace-nowrap text-right text-xs">
																	{sumTimeStrings([
																		day.lateHours || "0:00",
																		day.earlyOutHours || "0:00",
																	]) !== "0:00"
																		? sumTimeStrings([
																				day.lateHours ||
																					"0:00",
																				day.earlyOutHours ||
																					"0:00",
																			])
																		: "-"}
																</td>
															</tr>
														),
													)}
													{/* Total Row */}
													<tr className="bg-gray-100 font-semibold border-t-2 border-gray-200 text-xs">
														<td
															colSpan={3}
															className="py-2 px-3 text-gray-700 border-r">
															TOTALS
														</td>
														<td
															colSpan={2}
															className="py-2 px-3 border-r bg-gray-50"></td>
														<td className="py-2 px-3 text-right text-gray-900">
															{payrollData.timesheetSnapshot
																?.totalHoursWorked || "0:00"}
														</td>
														<td className="py-2 px-3 text-right text-gray-900">
															{payrollData.timesheetSnapshot
																?.totalRegularHours || "0:00"}
														</td>
														<td className="py-2 px-3 text-right text-red-700">
															{payrollData.timesheetSnapshot
																?.totalLateHours || "0:00"}
														</td>
														<td className="py-2 px-3 text-right text-rose-700">
															{payrollData.timesheetSnapshot
																?.totalEarlyOutHours || "0:00"}
														</td>
														<td className="py-2 px-3 text-right text-blue-700">
															{payrollData.timesheetSnapshot
																?.totalOvertimeHours || "0:00"}
														</td>
														<td className="py-2 px-3 text-center text-blue-800 font-bold bg-blue-50/30">
															{(
																payrollData.timesheet?.breakdown ||
																(payrollData as any)
																	.dailyBreakdown ||
																[]
															).reduce(
																(sum: number, d: any) =>
																	sum +
																	(parseInt(
																		d.overtimeHours?.split(
																			":",
																		)[0] || "0",
																		10,
																	) || 0),
																0,
															) || "-"}
														</td>
														<td className="py-2 px-3 text-right text-stone-700">
															{sumTimeStrings([
																payrollData.timesheetSnapshot
																	?.totalLateHours || "0:00",
																payrollData.timesheetSnapshot
																	?.totalEarlyOutHours || "0:00",
															])}
														</td>
													</tr>
												</tbody>
											</table>
										</div>
									</div>
								</div>
								)}

								{/* 2. Daily Pay Computation */}
								{((payrollData as any).dailyBreakdown?.length || 0) > 0 && (
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
											<Banknote className="w-4 h-4 text-gray-500" />
											Daily Pay Computation
										</h4>
										<span className="text-xs text-gray-500">
											Earnings and deductions breakdown
										</span>
									</div>
									<div className="border rounded-lg overflow-hidden shadow-sm">
										<div className="max-h-[400px] overflow-y-auto">
											<table className="w-full text-xs text-left">
												<thead className="bg-gray-50 text-gray-700 font-medium border-b sticky top-0 bg-white shadow-sm z-10">
													<tr>
														<th
															rowSpan={2}
															className="py-2 px-3 whitespace-nowrap bg-gray-50 border-r align-bottom pb-3">
															Date
														</th>
														<th
															colSpan={5}
															className="py-1 px-3 bg-blue-50 text-center text-xs text-blue-800 font-semibold border-b border-r border-blue-100">
															EARNINGS
														</th>
														<th
															colSpan={3}
															className="py-1 px-3 bg-red-50 text-center text-xs text-red-700 font-semibold border-b border-r border-red-100">
															DEDUCTIONS
														</th>
														<th
															rowSpan={2}
															className="py-2 px-3 whitespace-nowrap bg-emerald-50 text-right align-bottom pb-3 border-l text-emerald-800">
															Gross Pay
														</th>
													</tr>
													<tr className="text-xs">
														{/* Earnings */}
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/40 text-right text-blue-900">
															<HeaderHelp
																label="Regular Pay"
																lines={[
																	"Basic pay distributed across approved regular days.",
																	"Uses approved workbook bucket basis when present.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/40 text-right text-blue-900">
															<HeaderHelp
																label="OT Pay"
																lines={[
																	"Regular approved OT bucket.",
																	"Rest/holiday OT remains in Holiday/Rest when the approved bucket is combined.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/40 text-right text-blue-900">
															<HeaderHelp
																label="Night Diff"
																lines={[
																	"Night shift differential bucket or calculator premium.",
																	"Kept separate from regular pay.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-50/40 text-right text-blue-900">
															<HeaderHelp
																label="Holiday"
																lines={[
																	"Holiday/rest premium bucket.",
																	"Includes rest-day OT when the approved payroll basis uses a combined rate.",
																]}
															/>
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-blue-100/50 text-right font-semibold border-r border-blue-200 text-blue-900">
															Total Earnings
														</th>

														{/* Deductions */}
														<th className="py-2 px-3 whitespace-nowrap bg-red-50/50 text-right">
															Late Ded.
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-red-50/50 text-right">
															Early Out
														</th>
														<th className="py-2 px-3 whitespace-nowrap bg-red-50/50 text-right border-r border-red-200">
															Shortfall
														</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-gray-100">
													{(
														payrollData.timesheet?.breakdown ||
														(payrollData as any).dailyBreakdown ||
														[]
													).map((day: any, idx: number) => {
														const dailyBreakdownItem = (
															payrollData as any
														).dailyBreakdown?.[idx];
														const netDayPay =
															dailyBreakdownItem?.netDayPay || 0;
														const isAbsent = day.status === "ABSENT";
														const hasNegativeNetPay = netDayPay < 0;

														return (
															<tr
																key={idx}
																className={`transition-colors ${
																	isAbsent || hasNegativeNetPay
																		? "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500"
																		: "hover:bg-gray-50"
																}`}>
																<td className="py-2 px-3 text-gray-600 whitespace-nowrap border-r font-medium">
																	{new Date(
																		day.date,
																	).toLocaleDateString(
																		undefined,
																		{
																			month: "short",
																			day: "numeric",
																			weekday: "short",
																		},
																	)}
																</td>

																{/* Earnings */}
																<td className="py-2 px-3 text-right font-mono text-blue-900 bg-blue-50/25 whitespace-nowrap text-xs">
																	<span className="inline-flex items-center justify-end gap-1">
																		<ValueHover
																			lines={getDailyPayHelp(
																				dailyBreakdownItem,
																				"regularPay",
																			)}>
																			{dailyBreakdownItem
																				?.earnings?.regularPay
																				? formatCurrency(
																						dailyBreakdownItem
																							.earnings
																							.regularPay,
																					)
																				: "-"}
																		</ValueHover>
																	</span>
																</td>
																<td className="py-2 px-3 text-right font-mono text-blue-700 bg-blue-50/25 whitespace-nowrap text-xs">
																	<span className="inline-flex items-center justify-end gap-1">
																		<ValueHover
																			lines={getDailyPayHelp(
																				dailyBreakdownItem,
																				"overtimePay",
																			)}>
																			{dailyBreakdownItem
																				?.earnings?.overtimePay &&
																			dailyBreakdownItem.earnings
																				.overtimePay > 0
																				? formatCurrency(
																						dailyBreakdownItem
																							.earnings
																							.overtimePay,
																					)
																				: "-"}
																		</ValueHover>
																	</span>
																</td>
																<td className="py-2 px-3 text-right font-mono text-blue-700 bg-blue-50/25 whitespace-nowrap text-xs">
																	<span className="inline-flex items-center justify-end gap-1">
																		<ValueHover
																			lines={getDailyPayHelp(
																				dailyBreakdownItem,
																				"nightDiffPay",
																			)}>
																			{dailyBreakdownItem
																				?.earnings
																				?.nightDiffPay &&
																			dailyBreakdownItem.earnings
																				.nightDiffPay > 0
																				? formatCurrency(
																						dailyBreakdownItem
																							.earnings
																							.nightDiffPay,
																					)
																				: "-"}
																		</ValueHover>
																	</span>
																</td>
																<td className="py-2 px-3 text-right font-mono text-blue-700 bg-blue-50/25 whitespace-nowrap text-xs">
																	<span className="inline-flex items-center justify-end gap-1">
																		<ValueHover
																			lines={getDailyPayHelp(
																				dailyBreakdownItem,
																				"holidayPay",
																			)}>
																			{dailyBreakdownItem
																				?.earnings?.holidayPay &&
																			dailyBreakdownItem.earnings
																				.holidayPay > 0
																				? formatCurrency(
																						dailyBreakdownItem
																							.earnings
																							.holidayPay,
																					)
																				: "-"}
																		</ValueHover>
																	</span>
																</td>
																<td className="py-2 px-3 text-right font-mono text-blue-900 bg-blue-100/30 whitespace-nowrap font-semibold border-r border-blue-200">
																	{dailyBreakdownItem?.earnings
																		?.totalDayPay
																		? formatCurrency(
																				dailyBreakdownItem
																					.earnings
																					.totalDayPay,
																			)
																		: "-"}
																</td>

																{/* Deductions */}
																<td className="py-2 px-3 text-right font-mono text-red-600 bg-red-50/20 whitespace-nowrap text-xs">
																	{dailyBreakdownItem?.deductions
																		?.latePenalty &&
																	dailyBreakdownItem.deductions
																		.latePenalty > 0
																		? formatCurrency(
																				dailyBreakdownItem
																					.deductions
																					.latePenalty,
																			)
																		: "-"}
																</td>
																<td className="py-2 px-3 text-right font-mono text-red-600 bg-red-50/20 whitespace-nowrap text-xs">
																	{dailyBreakdownItem?.deductions
																		?.earlyOutPenalty &&
																	dailyBreakdownItem.deductions
																		.earlyOutPenalty > 0
																		? formatCurrency(
																				dailyBreakdownItem
																					.deductions
																					.earlyOutPenalty,
																			)
																		: "-"}
																</td>
																<td className="py-2 px-3 text-right font-mono text-red-600 bg-red-50/20 whitespace-nowrap text-xs border-r border-red-200">
																	{dailyBreakdownItem?.deductions
																		?.shortfallPenalty &&
																	dailyBreakdownItem.deductions
																		.shortfallPenalty > 0
																		? formatCurrency(
																				dailyBreakdownItem
																					.deductions
																					.shortfallPenalty,
																			)
																		: "-"}
																</td>

																{/* Net Pay */}
																<td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30 whitespace-nowrap border-l border-emerald-100">
																	{netDayPay
																		? formatCurrency(netDayPay)
																		: "-"}
																</td>
															</tr>
														);
													})}

													{/* Total Row */}
													<tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
														<td className="py-3 px-3 text-gray-900 border-r">
															TOTAL
														</td>

														{/* Earnings Totals */}
														<td className="py-3 px-3 text-right font-mono text-blue-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.earnings?.regularPay ||
																			0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-blue-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.earnings
																			?.overtimePay || 0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-blue-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.earnings
																			?.nightDiffPay || 0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-blue-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.earnings?.holidayPay ||
																			0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-blue-900 font-bold border-r border-blue-200">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.earnings
																			?.totalDayPay || 0),
																	0,
																) || 0,
															)}
														</td>

														{/* Deductions Totals */}
														<td className="py-3 px-3 text-right font-mono text-red-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.deductions
																			?.latePenalty || 0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-red-900">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.deductions
																			?.earlyOutPenalty || 0),
																	0,
																) || 0,
															)}
														</td>
														<td className="py-3 px-3 text-right font-mono text-red-900 border-r border-red-200">
															{formatCurrency(
																(
																	payrollData as any
																).dailyBreakdown?.reduce(
																	(sum: number, day: any) =>
																		sum +
																		(day.deductions
																			?.shortfallPenalty ||
																			0),
																	0,
																) || 0,
															)}
														</td>

														{/* Net Totals */}
														<td className="py-3 px-3 text-right font-mono text-lg text-emerald-900 border-l border-emerald-200 font-bold">
															{formatCurrency(
																payrollData.grossPay || 0,
															)}
														</td>
													</tr>
												</tbody>
											</table>
										</div>
									</div>
								</div>
								)}

								{/* 3. Prior-period corrections (category for GrossPay tally) */}
								{hasPayrollCorrections && (
									<div
										className="space-y-3"
										data-testid="payroll-summary-daily-corrections">
										<div className="flex items-center justify-between">
											<h4 className="flex items-center gap-2 text-sm font-bold text-gray-900">
												Prior-period corrections
											</h4>
											<span className="text-xs text-gray-500">
												Retro category applied on this payslip (not this
												period&apos;s attendance)
											</span>
										</div>
										<div className="overflow-hidden rounded-lg border border-orange-100 shadow-sm">
											<div className="max-h-[320px] overflow-y-auto">
												<table className="w-full text-left text-xs">
													<thead className="sticky top-0 z-10 border-b bg-orange-50/80 text-[10px] font-semibold uppercase tracking-wide text-orange-900/80">
														<tr>
															<th className="px-3 py-2">Source / line</th>
															<th className="px-3 py-2">Date</th>
															<th className="px-3 py-2">Type</th>
															<th className="px-3 py-2 text-right">
																Before
															</th>
															<th className="px-3 py-2 text-right">
																After
															</th>
															<th className="px-3 py-2 text-right">
																Delta
															</th>
															<th className="px-3 py-2 text-right">
																Line amount
															</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-gray-100 bg-white">
														{payrollCorrectionDayRows.map((row) => (
															<tr key={row.key} className="text-gray-800">
																<td className="max-w-[220px] px-3 py-2">
																	<div className="truncate font-medium text-gray-900">
																		{row.lineLabel}
																	</div>
																	{row.sourcePeriod ? (
																		<div className="truncate text-[10px] text-gray-500">
																			{row.sourcePeriod}
																		</div>
																	) : null}
																</td>
																<td className="whitespace-nowrap px-3 py-2 font-medium">
																	{row.date}
																</td>
																<td className="px-3 py-2">{row.hoursType}</td>
																<td className="px-3 py-2 text-right font-mono tabular-nums text-gray-600">
																	{row.beforeMinutes == null
																		? "—"
																		: formatCorrectionMinutes(
																				row.beforeMinutes,
																			)}
																</td>
																<td className="px-3 py-2 text-right font-mono tabular-nums text-gray-600">
																	{row.afterMinutes == null
																		? "—"
																		: formatCorrectionMinutes(
																				row.afterMinutes,
																			)}
																</td>
																<td
																	className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
																		(row.deltaMinutes || 0) > 0
																			? "text-emerald-700"
																			: (row.deltaMinutes || 0) < 0
																				? "text-rose-700"
																				: "text-gray-500"
																	}`}>
																	{row.deltaMinutes == null
																		? "—"
																		: formatSignedMinutes(
																				row.deltaMinutes,
																			)}
																</td>
																<td className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">
																	{/* Amount is per line; repeated for multi-day lines for context */}
																	{formatCurrency(row.lineAmount)}
																</td>
															</tr>
														))}
													</tbody>
													<tfoot className="border-t border-orange-100 bg-orange-50/60">
														<tr>
															<td
																colSpan={6}
																className="px-3 py-2.5 text-sm font-semibold text-orange-950">
																+ Prior-period corrections (in GrossPay)
															</td>
															<td className="px-3 py-2.5 text-right font-mono text-sm font-bold tabular-nums text-orange-950">
																{payrollCorrectionTotal < 0 ? "-" : "+"}
																{formatCurrency(
																	Math.abs(payrollCorrectionTotal),
																)}
															</td>
														</tr>
														<tr>
															<td
																colSpan={6}
																className="px-3 py-2 text-xs font-medium text-gray-600">
																Saved GrossPay (includes corrections + period
																earnings)
															</td>
															<td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums text-gray-950">
																{formatCurrency(payrollGrossPay)}
															</td>
														</tr>
													</tfoot>
												</table>
											</div>
										</div>
									</div>
								)}
							</div>
									</AccordionContent>
								</AccordionItem>
						)}
						</Accordion>

						{/* Action Buttons */}
						<div className="flex justify-end gap-2 pt-3 border-t">
							<Button
								variant="outline"
								onClick={() => {
									updateSearchParams((next) => {
										next.delete("action");
										next.delete("id");
									});
								}}>
								Close
							</Button>
						</div>
					</div>
				) : (
					<div className="text-center py-8 text-gray-500">No payroll data available</div>
				)}
			</Modal>
		</div>
	);
}
