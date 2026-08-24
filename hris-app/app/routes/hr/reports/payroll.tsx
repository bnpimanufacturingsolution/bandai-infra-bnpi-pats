import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { usePayrollSummaryMetrics } from "~/lib/hooks/useMetrics";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useEmployees } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	buildReportFileName,
	exportReport,
	formatReportCurrency,
	formatReportDate,
	getReportGeneratedByName,
	type ReportExportFormat,
} from "~/lib/utils/report-export";
import { REPORT_SCOPE_VALUES } from "~/lib/utils/report-scope";
import { PayrollReportFilterPopover } from "./components/PayrollReportFilterPopover";
import { ReportExportDialog } from "./components/ReportExportDialog";
import { ReportEmployeeCell } from "./components/ReportEmployeeCell";
import {
	reportTableBodyClassName,
	reportTableClassName,
	reportTableHeadClassName,
	reportTableRowClassName,
	reportTableScrollClassName,
	reportTableShellClassName,
} from "./components/reportTableStyles";
import { useReportScopeFilters } from "./useReportScopeFilters";
import { toast } from "sonner";

function formatMoney(value: number) {
	return formatReportCurrency(value);
}

function formatRegisterAmount(value: number) {
	return new Intl.NumberFormat("en-PH", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	}).format(Number(value || 0));
}

function formatHumanDate(value?: string | Date | null) {
	return formatReportDate(value);
}

function resolvePayrollRowEmployeeName(row: any) {
	const explicitName = String(row?.employeeName || row?.name || "").trim();
	if (explicitName) return explicitName;

	const personalInfo = row?.employee?.person?.personalInfo || row?.person?.personalInfo;
	const name = [
		personalInfo?.firstName,
		personalInfo?.middleName,
		personalInfo?.lastName,
	]
		.filter(Boolean)
		.join(" ")
		.trim();

	return name || row?.employeeCode || row?.employee?.employeeId || "N/A";
}

const payrollRegisterColumnDefs = [
	["Monthly Salary", "monthlySalary"],
	["Daily Salary", "dailySalary"],
	["No. of Days", "numberOfDays"],
	["Basic Salary", "basicPay"],
	["Absent-Amt", "absentDeduction"],
	["Late/UT", "lateUndertimeAmount"],
	["Reg OT Hrs", "regularOtHours"],
	["Reg OT", "overtimePay"],
	["Rest Day Hrs", "restDayHours"],
	["Rest Day", "restDayHoursPay"],
	["Rest Day OT Hrs", "restDayOtHours"],
	["Rest Day OT", "restDayOtPay"],
	["Special Holiday OT Hrs", "specialHolidayOtHours"],
	["Special Holiday OT", "specialHolidayOtPay"],
	["Sun/Spl Holiday OT Excess Hrs", "sunSpecialHolidayOtExcessHours"],
	["Sun/Spl Holiday OT Excess", "sunSpecialHolidayOtExcessPay"],
	["Spl Hol Rest Day OT Hrs", "specialHolidayRestDayOtHours"],
	["Spl Hol Rest Day OT", "specialHolidayRestDayOtPay"],
	["Spl Rest Day Excess Hrs", "specialRestDayExcessHours"],
	["Spl Rest Day Excess OT", "specialRestDayExcessOtPay"],
	["Legal Holiday OT Hrs", "legalHolidayOtHours"],
	["Legal Holiday OT", "legalHolidayOtPay"],
	["Legal Holiday Excess", "legalHolidayExcessPay"],
	["Legal Holiday Rest Day", "legalHolidayRestDayPay"],
	["Legal Holiday Excess 1", "legalHolidayExcess1Pay"],
	["Legal Holiday Rest Day Excess", "legalHolidayRestDayExcessPay"],
	["Night Differential", "nightDiffPay"],
	["Leave Pay", "leavePay"],
	["Christmas Gift", "christmasGift"],
	["Special Bonus", "specialBonus"],
	["Mandatory Contri. Adjustment", "mandatoryContributionAdjustment"],
	["Guaranteed Bonus", "guaranteedBonus"],
	["HYS Meal Allowance", "hysMealAllowance"],
	["OB Allowance", "obAllowance"],
	["Other Adjustment", "otherAdjustment"],
	["Overtime Meal Allowance", "overtimeMealAllowance"],
	["Sportsfest OT", "sportsfestOt"],
	["Fringe Benefit", "fringeBenefit"],
	["Annual Incentive", "annualIncentive"],
	["Technical Skills Allowance", "technicalSkillsAllowance"],
	["ACL VL Conversion Taxable", "aclVlConversionTaxable"],
	["Adjustment Overused Leave", "adjustmentOverusedLeave"],
	["13th Month Adjustment", "thirteenthMonthAdjustment"],
	["Production Incentives", "productionIncentives"],
	["Other Compensation", "otherCompensation"],
	["Adjustment Basic", "adjustmentBasic"],
	["Adjustment OT/ND", "adjustmentOtNd"],
	["Adjustment Non Tax", "adjustmentNonTax"],
	["Excess Deduction", "excessDeduction"],
	["De Minimis", "deMinimisAllowance"],
	["GrossPay", "grossPay"],
	["W/Tax", "taxAmount"],
	["SSS Cont", "sssContribution"],
	["PhilHealth", "philHealthContribution"],
	["Pagibig", "pagibigContribution"],
	["Christmas Gift Kid", "christmasGiftKid"],
	["Birthday Gift Kid", "birthdayGiftKid"],
	["Birthday Gift Employee", "birthdayGiftEmployee"],
	["Fringe Benefit Tax", "fringeBenefitTax"],
	["SSS Emergency Loan", "sssEmergencyLoan"],
	["PhilHealth Adjustment", "philHealthContributionAdjustment"],
	["Excess Internet Usage", "excessInternetUsage"],
	["Tax Payable", "taxPayable"],
	["Adjustment Basic Deduction", "adjustmentBasicDeduction"],
	["Excess ML Benefits", "excessMlBenefits"],
	["Uniform Deduction", "uniformDeduction"],
	["SSS Loan Restructuring", "sssLoanRestructuringProgram"],
	["PHIC 1% Differential", "phicOnePercentDifferential"],
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
	["Adjustment Holiday Pay", "adjustmentHolidayPay"],
	["Community Tax Cert", "communityTaxCert"],
	["1K Christmas Gift", "oneKChristmasGift"],
	["Tax Refund", "taxRefund"],
	["13th Month Pay", "thirteenthMonthPay"],
	["ACL VL Conversion", "aclVlConversion"],
	["OT Meal Allowance", "otMealAllowance"],
	["Perfect Attendance", "perfectAttendance"],
	["Meal Allowance", "mealAllowance"],
	["Line Leader Allowance", "lineLeaderAllowance"],
	["TOTAL DEDN", "totalDeductions"],
	["NetPay", "netPay"],
	["TotalReceivable", "totalReceivable"],
] as const;

const visibleAdjustmentColumns = [
	["Perfect Attendance", "perfectAttendance"],
	["Meal Allowance", "mealAllowance"],
	["HYS Meal", "hysMealAllowance"],
	["Adjustment OT/ND", "adjustmentOtNd"],
	["Modified HDMF 2", "modifiedHdmf2"],
	["TotalReceivable", "totalReceivable"],
] as const;

function SummaryMetricCard({
	title,
	value,
}: {
	title: string;
	value: string | number;
}) {
	return (
		<Card className="border border-gray-200">
			<CardHeader className="pb-2">
				<CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="text-base font-bold whitespace-nowrap overflow-hidden text-ellipsis">
					{value}
				</div>
			</CardContent>
		</Card>
	);
}

export default function PayrollReportsPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const {
		scope,
		dateRange,
		fromIso,
		toIso,
		activeMonth,
		activeYear,
		yearOptions,
		setScope,
		setMonth,
		setYear,
		setDateRange,
		clearFilters: clearScopeFilters,
	} = useReportScopeFilters();
	const [selectedDepartment, setSelectedDepartment] = useState(
		() => searchParams.get("departmentId") || "all",
	);
	const [selectedManager, setSelectedManager] = useState(
		() => searchParams.get("reportToId") || "all",
	);
	const [selectedPeriodId, setSelectedPeriodId] = useState(
		() => searchParams.get("payrollPeriodId") || searchParams.get("periodId") || "all",
	);
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

	const { data: payrollPeriodsData } = usePayrollPeriods({
		page: 1,
		limit: 200,
		sort: "payDate",
		order: "desc",
	});

	const payrollPeriods = useMemo(
		() => (payrollPeriodsData as any)?.payrollPeriods || [],
		[payrollPeriodsData],
	);
	const selectedPayrollPeriod = useMemo(
		() =>
			selectedPeriodId === "all"
				? null
				: payrollPeriods.find((period: any) => period.id === selectedPeriodId) || null,
		[payrollPeriods, selectedPeriodId],
	);
	const effectiveFromIso =
		selectedPayrollPeriod?.startDate && selectedPeriodId !== "all"
			? selectedPayrollPeriod.startDate
			: fromIso;
	const effectiveToIso =
		selectedPayrollPeriod?.endDate && selectedPeriodId !== "all"
			? selectedPayrollPeriod.endDate
			: toIso;
	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];
	const { data: employeesData } = useEmployees({ limit: 1000 });
	const allEmployees = useMemo(
		() =>
			Array.isArray((employeesData as any)?.data)
				? (employeesData as any).data
				: (employeesData as any)?.data?.employees ||
					(employeesData as any)?.employees ||
					[],
		[employeesData],
	);

	const managerCandidates = useMemo(() => {
		const matches = allEmployees.filter((emp: any) => {
			const role = String(emp?.role || "").toLowerCase();
			return Boolean(emp?.isManager || emp?.isHrManager || role.includes("manager"));
		});
		return matches.length > 0 ? matches : allEmployees;
	}, [allEmployees]);

	const managerOptions = useMemo((): Array<{ id: string; label: string }> => {
		const filtered =
			selectedDepartment === "all"
				? managerCandidates
				: managerCandidates.filter((emp: any) => emp.department?.id === selectedDepartment);

		return filtered.map((emp: any) => ({
			id: String(emp.id),
			label:
				`${emp.person?.personalInfo?.firstName || ""} ${emp.person?.personalInfo?.lastName || ""}`.trim() ||
				String(emp.employeeId || emp.id),
		}));
	}, [managerCandidates, selectedDepartment]);

	const periodOptions = useMemo((): Array<{ id: string; name: string }> => {
		return payrollPeriods.map((period: any) => ({
			id: String(period.id),
			name: String(period.name || period.id),
		}));
	}, [payrollPeriods]);

	const activeFiltersCount = useMemo(() => {
		const now = new Date();
		const isDefaultScope =
			scope === REPORT_SCOPE_VALUES.MONTHLY &&
			Number(activeMonth) === now.getMonth() &&
			Number(activeYear) === now.getFullYear();

		let count = 0;
		if (!isDefaultScope) count += 1;
		if (selectedDepartment !== "all") count += 1;
		if (selectedManager !== "all") count += 1;
		if (selectedPeriodId !== "all") count += 1;
		return count;
	}, [activeMonth, activeYear, scope, selectedDepartment, selectedManager, selectedPeriodId]);

	const { data, isLoading, error } = usePayrollSummaryMetrics(
		fromIso,
		toIso,
		selectedPeriodId === "all" ? undefined : selectedPeriodId,
		selectedDepartment === "all" ? undefined : selectedDepartment,
		selectedManager === "all" ? undefined : selectedManager,
	);

	const summary = data?.metrics?.payrollSummary;
	const rows = summary?.payrolls || [];
	const sectionLabel = useMemo(() => {
		const sections = Array.from(
			new Set(rows.map((row) => row.division).filter((value) => value && value !== "N/A")),
		);
		if (sections.length === 1) return sections[0];
		return sections.length > 1 ? sections.join(", ") : "All";
	}, [rows]);
	const totalOtHolidayNightDiff = rows.reduce(
		(sum, item) =>
			sum + (item.overtimePay || 0) + (item.holidayPay || 0) + (item.nightDiffPay || 0),
		0,
	);
	const fileBaseName = buildReportFileName(
		"payroll-register",
		effectiveFromIso,
		"to",
		effectiveToIso,
		selectedDepartment !== "all" ? "department" : undefined,
		selectedDepartment !== "all" ? selectedDepartment : undefined,
		selectedManager !== "all" ? "manager" : undefined,
		selectedManager !== "all" ? selectedManager : undefined,
		selectedPeriodId !== "all" ? "period" : undefined,
		selectedPeriodId !== "all" ? selectedPeriodId : undefined,
	);

	const clearFilters = () => {
		setSelectedPeriodId("all");
		setSelectedDepartment("all");
		setSelectedManager("all");
		clearScopeFilters();
	};

	const goToEmployeePayroll = (row: (typeof rows)[number]) => {
		navigate(
			`/hr/hr-payroll?tab=past&periodId=${encodeURIComponent(row.payrollPeriodId)}&employeeId=${encodeURIComponent(row.employeeId)}&open=view&page=1`,
		);
	};

	const exportColumns = [
		{
			header: "No.",
			accessor: (item: (typeof rows)[number]) => item.rowNo || "",
			widthWeight: 0.5,
			valueType: "number" as const,
		},
		{
			header: "Emp. No.",
			accessor: "employeeCode" as const,
			widthWeight: 0.8,
			valueType: "text" as const,
		},
		{
			header: "Employee Name",
			accessor: (item: (typeof rows)[number]) => resolvePayrollRowEmployeeName(item),
			widthWeight: 2.35,
			valueType: "text" as const,
		},
		{
			header: "Department",
			accessor: "department" as const,
			widthWeight: 1.35,
			valueType: "text" as const,
		},
		{
			header: "Division",
			accessor: "division" as const,
			widthWeight: 1.35,
			valueType: "text" as const,
		},
		{
			header: "Position",
			accessor: "position" as const,
			widthWeight: 1.45,
			valueType: "text" as const,
		},
		...payrollRegisterColumnDefs.map(([header, field]) => ({
			header,
			accessor: (item: (typeof rows)[number]) => formatRegisterAmount(Number(item[field] || 0)),
			align: "right" as const,
			widthWeight: header.length > 18 ? 1.25 : 1,
		})),
	];

	const exportConfig = {
		reportKey: "payroll-report",
		title: "Payroll Register Per Department/Employee",
		fileBaseName,
		rows,
		columns: exportColumns,
		filtersSummary: [
			{
				label: "Period Range",
				value: `${formatHumanDate(effectiveFromIso)} - ${formatHumanDate(effectiveToIso)}`,
			},
			{
				label: "Pay Date",
				value: selectedPayrollPeriod?.payDate
					? formatHumanDate(selectedPayrollPeriod.payDate)
					: "All",
			},
			{
				label: "Department",
				value:
					selectedDepartment === "all"
						? "All"
						: departments.find((dept: any) => dept.id === selectedDepartment)?.name ||
							selectedDepartment,
			},
			{
				label: "Manager",
				value:
					selectedManager === "all"
						? "All"
						: managerOptions.find(
								(manager: { id: string; label: string }) =>
									manager.id === selectedManager,
							)?.label || selectedManager,
			},
			{
				label: "Payroll Period",
				value:
					selectedPeriodId === "all"
						? "All"
						: selectedPayrollPeriod?.name || selectedPeriodId,
			},
			{ label: "Section", value: sectionLabel },
		],
		grouping: [
			{
				id: "section",
				label: "Section",
				getValue: (row: (typeof rows)[number]) => row.division || "Unassigned",
			},
		],
		summaryRows: [
			{ label: "Employee Count", value: rows.length || 0 },
			{ label: "Total OT/Hol/ND", value: formatMoney(totalOtHolidayNightDiff) },
			{ label: "Total GrossPay", value: formatMoney(summary?.totalGrossPay || 0) },
			{ label: "Total NetPay", value: formatMoney(summary?.totalNetPay || 0) },
		],
		orientation: "landscape" as const,
		pdfLayout: "payroll-register" as const,
		organizationName: "BANDAI NAMCO PHILIPPINES INC.",
		generatedBy: getReportGeneratedByName(user),
	};

	const openExportModal = () => {
		if (!rows.length) {
			toast.error("No payroll rows available to export.");
			return;
		}

		setIsExportModalOpen(true);
	};

	const handleExport = async (
		format: ReportExportFormat,
		exportState: { includeFiltersSummary: boolean; groupBy?: string },
	) => {
		await exportReport({
			format,
			config: exportConfig,
			options: { ...exportState, groupBy: "section" },
		});
		setIsExportModalOpen(false);
	};
	const primarySummaryCards = [
		{
			title: "Periods Covered",
			value: summary?.periodsCovered || 0,
		},
		{
			title: "Processed Employees",
			value: summary?.processedEmployees || 0,
		},
		{
			title: "Gross Pay",
			value: formatMoney(summary?.totalGrossPay || 0),
		},
		{
			title: "Total Deductions",
			value: formatMoney(summary?.totalDeductions || 0),
		},
		{
			title: "Net Pay",
			value: formatMoney(summary?.totalNetPay || 0),
		},
	];
	const secondarySummaryCards = [
		{
			title: "Benefits",
			value: formatMoney(summary?.totalBenefits || 0),
		},
		{ title: "Tax", value: formatMoney(summary?.totalTaxAmount || 0) },
		{ title: "SSS", value: formatMoney(summary?.totalSSS || 0) },
		{ title: "PhilHealth", value: formatMoney(summary?.totalPhilHealth || 0) },
		{ title: "Pag-IBIG", value: formatMoney(summary?.totalPagibig || 0) },
		{ title: "Loans", value: formatMoney(summary?.totalLoans || 0) },
	];

	useEffect(() => {
		const nextSearchParams = new URLSearchParams(searchParams);

		if (selectedDepartment !== "all") {
			nextSearchParams.set("departmentId", selectedDepartment);
		} else {
			nextSearchParams.delete("departmentId");
		}

		if (selectedManager !== "all") {
			nextSearchParams.set("reportToId", selectedManager);
		} else {
			nextSearchParams.delete("reportToId");
		}

		if (selectedPeriodId !== "all") {
			nextSearchParams.set("payrollPeriodId", selectedPeriodId);
		} else {
			nextSearchParams.delete("payrollPeriodId");
		}

		if (nextSearchParams.toString() !== searchParams.toString()) {
			setSearchParams(nextSearchParams, { replace: true });
		}
	}, [selectedDepartment, selectedManager, selectedPeriodId, searchParams, setSearchParams]);

	return (
		<div className="space-y-6 p-6">
			<Card>
				<CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1.5">
						<CardTitle>Payroll Reports</CardTitle>
						<CardDescription>
							Per-employee payroll register using pay-date and organization filters
						</CardDescription>
					</div>
					<div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
						<PayrollReportFilterPopover
							scope={scope}
							activeMonth={activeMonth}
							activeYear={activeYear}
							yearOptions={yearOptions}
							dateRange={dateRange}
							onScopeChange={setScope}
							onMonthChange={setMonth}
							onYearChange={setYear}
							onDateRangeChange={setDateRange}
							departments={departments}
							selectedDepartment={selectedDepartment}
							onDepartmentChange={(value) => {
								setSelectedDepartment(value);
								setSelectedManager("all");
							}}
							managerOptions={managerOptions}
							selectedManager={selectedManager}
							onManagerChange={setSelectedManager}
							periodOptions={periodOptions}
							selectedPeriodId={selectedPeriodId}
							onPeriodChange={setSelectedPeriodId}
							activeFiltersCount={activeFiltersCount}
							onClearAll={clearFilters}
						/>
						<Button variant="outline" className="h-9" onClick={openExportModal}>
							<Download className="mr-2 h-4 w-4" />
							Export
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{scope === REPORT_SCOPE_VALUES.QUARTERLY ? (
						<p className="text-sm text-gray-500">
							Quarterly scope uses the selected month as the quarter anchor.
						</p>
					) : null}

					{isLoading ? (
						<div className="text-center py-8 text-gray-500">
							Loading payroll metrics...
						</div>
					) : error ? (
						<div className="text-center py-8 text-red-500">
							Error loading payroll metrics: {error.message}
						</div>
					) : (
						<>
							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
								{primarySummaryCards.map((metric) => (
									<SummaryMetricCard
										key={metric.title}
										title={metric.title}
										value={metric.value}
									/>
								))}
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
								{secondarySummaryCards.map((metric) => (
									<SummaryMetricCard
										key={metric.title}
										title={metric.title}
										value={metric.value}
									/>
								))}
							</div>

							<div className={reportTableShellClassName}>
								<div className={reportTableScrollClassName}>
									<table className={`${reportTableClassName} min-w-[1760px]`}>
										<thead className={reportTableHeadClassName}>
											<tr>
												<th className="px-4 py-3 text-right font-medium">
													No.
												</th>
												<th className="px-6 py-3 text-left font-medium">
													Employee
												</th>
												<th className="px-4 py-3 text-left font-medium">
													Position
												</th>
												<th className="px-6 py-3 text-right font-medium">
													Monthly Salary
												</th>
												<th className="px-4 py-3 text-right font-medium">
													Days
												</th>
												<th className="px-6 py-3 text-right font-medium">
													Basic
												</th>
												<th className="px-6 py-3 text-right font-medium">
													Abs/Late
												</th>
												<th className="px-6 py-3 text-right font-medium">
													OT/Hol/ND
												</th>
												<th className="px-6 py-3 text-right font-medium">
													Other Earn
												</th>
												{visibleAdjustmentColumns.slice(0, 5).map(([header]) => (
													<th
														key={header}
														className="px-6 py-3 text-right font-medium">
														{header}
													</th>
												))}
												<th className="px-6 py-3 text-right font-medium">
													GrossPay
												</th>
												<th className="px-6 py-3 text-right font-medium">
													Total Dedn
												</th>
												<th className="px-6 py-3 text-right font-medium">
													NetPay
												</th>
												<th className="px-6 py-3 text-right font-medium">
													TotalReceivable
												</th>
											</tr>
										</thead>
										<tbody className={reportTableBodyClassName}>
											{rows.length > 0 ? (
												rows.map((item) => (
													<tr
														key={item.id}
														className={reportTableRowClassName}>
														<td className="px-4 py-3 text-right">
															{item.rowNo || ""}
														</td>
														<td className="px-6 py-3">
															<ReportEmployeeCell
																rosterEmployees={allEmployees}
																employeeId={item.employeeId}
																employeeCode={item.employeeCode}
																fullName={item.employeeName}
																onClick={() => goToEmployeePayroll(item)}
															/>
														</td>
														<td className="px-4 py-3">
															<span className="block max-w-[160px] truncate">
																{item.position}
															</span>
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(item.monthlySalary || 0)}
														</td>
														<td className="px-4 py-3 text-right">
															{item.workDays || 0}
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(item.basicPay || 0)}
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(
																(item.absentDeduction || 0) +
																	(item.lateDeduction || 0) +
																	(item.earlyOutDeduction || 0),
															)}
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(
																(item.overtimePay || 0) +
																	(item.holidayPay || 0) +
																	(item.nightDiffPay || 0),
															)}
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(item.otherEarn || 0)}
														</td>
														{visibleAdjustmentColumns
															.slice(0, 5)
															.map(([header, field]) => (
																<td
																	key={`${item.id}-${field}`}
																	className="px-6 py-3 text-right">
																	{formatMoney(
																		Number(item[field] || 0),
																	)}
																</td>
															))}
														<td className="px-6 py-3 text-right">
															{formatMoney(item.grossPay || 0)}
														</td>
														<td className="px-6 py-3 text-right">
															{formatMoney(item.totalDeductions || 0)}
														</td>
														<td className="px-6 py-3 text-right font-semibold">
															{formatMoney(item.netPay || 0)}
														</td>
														<td className="px-6 py-3 text-right font-semibold">
															{formatMoney(item.totalReceivable || 0)}
														</td>
													</tr>
												))
											) : (
												<tr>
													<td
														colSpan={18}
														className="px-6 py-8 text-center text-gray-500">
														No employee payroll rows found for the
														selected filters.
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>
			<ReportExportDialog
				title="Export Payroll Report"
				description="Choose how to export the current payroll register."
				open={isExportModalOpen}
				onOpenChange={setIsExportModalOpen}
				showIncludeFiltersToggle
				options={[
					{
						format: "pdf",
						label: "Export PDF",
						helperText: "Download the selected payroll register as a PDF.",
					},
					{
						format: "csv",
						label: "Export CSV",
						helperText: "Download the same register rows as a CSV file.",
					},
					{
						format: "xlsx",
						label: "Export Excel",
						helperText: "Download the complete register with styled, filterable columns.",
					},
				]}
				onExport={handleExport}
			/>
		</div>
	);
}
