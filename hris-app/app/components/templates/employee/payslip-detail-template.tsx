import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Printer, Share2, Building2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { useEmployeePayroll, useDownloadPayslip } from "~/lib/hooks/useEmployeePayroll";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/use-auth";
import { format } from "date-fns";

export default function PayslipDetailTemplate() {
	const { id, payslipId } = useParams();
	const navigate = useNavigate();
	const { user } = useAuth();

	const { data: payroll, isLoading, error } = useEmployeePayroll(payslipId || "");
	const { data: employeeRecord } = useEmployee(id || "");
	const { mutate: downloadPayslip, isPending: isDownloading } = useDownloadPayslip();

	const handleBack = () => {
		navigate(-1);
	};

	const handleDownload = () => {
		if (payroll) {
			downloadPayslip({
				id: payroll.id,
				name: `${payroll.employee.person.personalInfo.firstName}-${payroll.employee.person.personalInfo.lastName}-${payroll.payrollPeriod.name}`,
			});
		}
	};

	const handlePrint = () => {
		window.print();
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
		}).format(amount);
	};
	const hasObjectIdPattern = (value?: string | null) =>
		Boolean(value && /[a-f0-9]{24}/i.test(value));
	const toToken = (value?: string | null, maxLength = 16) =>
		(value || "")
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, maxLength);

	if (isLoading) {
		return (
			<div className="flex justify-center items-center min-h-[60vh]">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>
		);
	}

	if (error || !payroll) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
				<h2 className="text-xl font-semibold text-red-600">Failed to load payslip</h2>
				<Button onClick={handleBack}>Go Back</Button>
			</div>
		);
	}

	const {
		employee,
		payrollPeriod,
		basicPay,
		grossPay,
		netPay,
		taxAmount,
		sssContribution,
		philHealthContribution,
		pagibigContribution,
		totalDeductions,
		overtimePay = 0,
		nightDiffPay = 0,
		holidayPay = 0,
		allowances = 0,
		bonuses = 0,
		lateDeduction = 0,
		earlyOutDeduction = 0,
		absentDeduction = 0,
		loanDeductions = 0,
		otherDeductions = 0,
	} = payroll;
	const attendanceAdjustments = absentDeduction + lateDeduction + earlyOutDeduction;
	const totalEarnings = basicPay + overtimePay + nightDiffPay + holidayPay + allowances + bonuses;
	const displayPayrollDeductions = totalDeductions;

	const person = employee.person.personalInfo;
	const fullName = `${person.firstName} ${person.lastName}`;
	const positionTitle = employee.position?.title || employeeRecord?.position?.title;
	const departmentName = employee.department?.name || employeeRecord?.department?.name;
	const sidebarLogoUrl =
		"https://res.cloudinary.com/dyal0wstg/image/upload/v1759107126/Bandai_Ni_Bryan_1_1_ruj2ty.webp";
	const organizationName =
		(employeeRecord as any)?.organization?.name ||
		(employeeRecord as any)?.metadata?.organization?.name ||
		user?.organization?.name;
	const organizationLogo = sidebarLogoUrl;
	const rawDocumentRef = payroll.metadata?.payslip?.documentNumber || "";
	const fallbackDocumentRef = `PSL-${
		toToken(payrollPeriod.name, 12) || "PERIOD"
	}-${toToken(employee.employeeId, 12) || "EMPLOYEE"}`;
	const displayDocumentRef =
		rawDocumentRef && !hasObjectIdPattern(rawDocumentRef)
			? rawDocumentRef
			: fallbackDocumentRef;

	return (
		<div className="container mx-auto py-8 px-4 max-w-5xl">
			{/* Header Actions */}
			<div className="flex items-center justify-between mb-6 print:hidden">
				<button
					onClick={handleBack}
					className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
					<ArrowLeft className="w-4 h-4 mr-2" />
					Back to Payroll Overview
				</button>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleDownload}
						disabled={isDownloading}>
						<Download className="w-4 h-4 mr-2" />
						Download PDF
					</Button>
				</div>
			</div>

			{/* Payslip Paper Container */}
			<div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden print:shadow-none print:border-none">
				{/* Company Header */}
				<div className="p-8 border-b border-gray-100">
					<div className="flex justify-between items-start">
						<div className="flex gap-4">
							{organizationLogo ? (
								<div className="h-12 w-12 rounded-lg overflow-hidden border border-gray-100">
									<img
										src={organizationLogo}
										alt={`${organizationName || "Organization"} logo`}
										className="h-full w-full object-contain bg-white"
									/>
								</div>
							) : (
								<div className="h-12 w-12 bg-red-50 rounded-lg flex items-center justify-center text-red-600">
									<Building2 className="h-6 w-6" />
								</div>
							)}
							<div>
								<h1 className="text-xl font-bold text-gray-900">
									{organizationName || "Payslip"}
								</h1>
							</div>
						</div>
						<div className="text-right space-y-1">
							<div className="text-sm text-gray-500">
								<span className="font-medium text-gray-700 mr-2">
									Document Ref:
								</span>
								{displayDocumentRef}
							</div>
							<div className="text-sm text-gray-500">
								<span className="font-medium text-gray-700 mr-2">Pay Date:</span>
								{payrollPeriod.payDate
									? format(new Date(payrollPeriod.payDate), "MMM dd, yyyy")
									: ""}
							</div>
							<div className="text-xs text-gray-400 mt-2">
								Pay Period
								<br />
								{payrollPeriod.startDate
									? format(new Date(payrollPeriod.startDate), "MMM dd, yyyy")
									: ""}{" "}
								—{" "}
								{payrollPeriod.endDate
									? format(new Date(payrollPeriod.endDate), "MMM dd, yyyy")
									: ""}
							</div>
						</div>
					</div>
				</div>

				{/* Employee Info & Net Pay Banner */}
				<div className="bg-gray-50/50 p-8 border-b border-gray-100">
					<div className="flex flex-col md:flex-row justify-between items-center gap-6">
						<div className="flex items-center gap-4 w-full md:w-auto">
							<div className="h-14 w-14 rounded-full bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center text-red-700 font-bold text-lg border-2 border-white shadow-sm">
								{person.firstName[0]}
								{person.lastName[0]}
							</div>
							<div>
								<h2 className="text-lg font-bold text-gray-900">{fullName}</h2>
								<div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
									<span className="font-medium text-red-600">
										{employee.employeeId}
									</span>
									{positionTitle && (
										<>
											<span>•</span>
											<span>{positionTitle}</span>
										</>
									)}
									{departmentName && (
										<>
											<span>•</span>
											<span>{departmentName}</span>
										</>
									)}
								</div>
							</div>
						</div>
						<div className="w-full md:w-auto bg-red-50 rounded-lg p-4 border border-red-100 min-w-[280px]">
							<div className="text-center">
								<div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">
									Net Pay Distribution
								</div>
								<div className="text-3xl font-extrabold text-red-700">
									{formatCurrency(netPay)}
								</div>
								<div className="text-xs text-red-600 mt-1 flex justify-center items-center gap-1">
									<div className="w-2 h-2 rounded-full bg-red-500"></div>
									{displayDocumentRef}
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Breakdown Columns */}
				<div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-gray-50/30">
					{/* Earnings Column */}
					<div className="p-8">
						<h3 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">
							<div className="w-1 h-4 bg-red-500 rounded-full mr-3"></div>
							EARNINGS
						</h3>
						<div className="space-y-4">
							<div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
								<div>
									<div className="font-medium text-gray-800">Basic Salary</div>
									<div className="text-xs text-gray-500">Monthly Rate</div>
								</div>
								<div className="font-semibold text-gray-900 tabular-nums">
									{formatCurrency(basicPay)}
								</div>
							</div>
							{overtimePay > 0 && (
								<div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
									<div>
										<div className="font-medium text-gray-800">Overtime</div>
									</div>
									<div className="font-semibold text-gray-900 tabular-nums">
										{formatCurrency(overtimePay)}
									</div>
								</div>
							)}
							{nightDiffPay > 0 && (
								<div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
									<div>
										<div className="font-medium text-gray-800">Night Diff</div>
									</div>
									<div className="font-semibold text-gray-900 tabular-nums">
										{formatCurrency(nightDiffPay)}
									</div>
								</div>
							)}
							{holidayPay > 0 && (
								<div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
									<div>
										<div className="font-medium text-gray-800">Holiday Pay</div>
									</div>
									<div className="font-semibold text-gray-900 tabular-nums">
										{formatCurrency(holidayPay)}
									</div>
								</div>
							)}
							{(allowances > 0 || bonuses > 0) && (
								<div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
									<div>
										<div className="font-medium text-gray-800">
											Allowances & Bonuses
										</div>
									</div>
									<div className="font-semibold text-gray-900 tabular-nums">
										{formatCurrency(allowances + bonuses)}
									</div>
								</div>
							)}
							<div className="flex justify-between items-center py-2 border-t border-gray-200 text-sm">
								<div className="font-semibold text-gray-800">TOTAL EARNINGS</div>
								<div className="font-bold text-gray-900 tabular-nums">
									{formatCurrency(totalEarnings)}
								</div>
							</div>
						</div>

						<div className="mt-8 pt-4 border-t border-gray-100 flex justify-between items-end">
							<div className="text-sm font-medium text-gray-500">GROSS PAY</div>
							<div className="text-xl font-bold text-gray-900">
								{formatCurrency(grossPay)}
							</div>
						</div>
					</div>

					{/* Deductions Column */}
					<div className="p-8">
						<h3 className="flex items-center text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">
							<div className="w-1 h-4 bg-orange-500 rounded-full mr-3"></div>
							DEDUCTIONS
						</h3>

						<div className="space-y-6">
							<div>
								<div className="text-xs font-semibold text-gray-500 uppercase mb-3">
									Attendance Deductions
								</div>
								<div className="space-y-3">
									{absentDeduction > 0 && (
										<div className="flex justify-between items-center text-sm">
											<span className="text-gray-600">Absent</span>
											<span className="font-semibold text-red-700 tabular-nums">
												-{formatCurrency(absentDeduction)}
											</span>
										</div>
									)}
									{lateDeduction > 0 && (
										<div className="flex justify-between items-center text-sm">
											<span className="text-gray-600">Late</span>
											<span className="font-semibold text-red-700 tabular-nums">
												-{formatCurrency(lateDeduction)}
											</span>
										</div>
									)}
									{earlyOutDeduction > 0 && (
										<div className="flex justify-between items-center text-sm">
											<span className="text-gray-600">Early Out</span>
											<span className="font-semibold text-red-700 tabular-nums">
												-{formatCurrency(earlyOutDeduction)}
											</span>
										</div>
									)}
									{attendanceAdjustments > 0 && (
										<div className="flex justify-between items-center text-sm border-t border-gray-200 pt-3">
											<span className="text-gray-700 font-medium">
												Attendance Subtotal
											</span>
											<span className="font-bold text-red-700 tabular-nums">
												-{formatCurrency(attendanceAdjustments)}
											</span>
										</div>
									)}
								</div>
							</div>

							<div>
								<div className="text-xs font-semibold text-gray-500 uppercase mb-3">
									Taxes
								</div>
								<div className="space-y-3">
									{taxAmount > 0 && (
										<div className="flex justify-between items-center text-sm">
											<span className="text-gray-600">Withholding</span>
											<span className="font-semibold text-red-700 tabular-nums">
												-{formatCurrency(taxAmount)}
											</span>
										</div>
									)}
								</div>
							</div>

							<div>
								<div className="text-xs font-semibold text-gray-500 uppercase mb-3">
									Contributions
								</div>
								<div className="space-y-3">
									<div className="flex justify-between items-center text-sm">
										<span className="text-gray-600">SSS</span>
										<span className="font-semibold text-red-700 tabular-nums">
											-{formatCurrency(sssContribution)}
										</span>
									</div>
									<div className="flex justify-between items-center text-sm">
										<span className="text-gray-600">PhilHealth</span>
										<span className="font-semibold text-red-700 tabular-nums">
											-{formatCurrency(philHealthContribution)}
										</span>
									</div>
									<div className="flex justify-between items-center text-sm">
										<span className="text-gray-600">Pag-IBIG</span>
										<span className="font-semibold text-red-700 tabular-nums">
											-{formatCurrency(pagibigContribution)}
										</span>
									</div>
								</div>
							</div>
							{loanDeductions > 0 && (
								<div className="flex justify-between items-center text-sm">
									<span className="text-gray-600">Loan Deductions</span>
									<span className="font-semibold text-red-700 tabular-nums">
										-{formatCurrency(loanDeductions)}
									</span>
								</div>
							)}
							{otherDeductions > 0 && (
								<div className="flex justify-between items-center text-sm">
									<span className="text-gray-600">Other Deductions</span>
									<span className="font-semibold text-red-700 tabular-nums">
										-{formatCurrency(otherDeductions)}
									</span>
								</div>
							)}

							<div className="pt-4 border-t border-gray-200/60 flex justify-between items-end mt-4">
								<div className="text-sm font-medium text-red-600">
									TOTAL GOV'T CONTRIBUTIONS
								</div>
								<div className="text-xl font-bold text-red-600">
									-{formatCurrency(displayPayrollDeductions)}
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Note/Footer */}
				<div className="bg-gray-50 p-6 border-t border-gray-100">
					<div className="flex flex-col md:flex-row gap-6 text-sm text-gray-500">
						<div className="flex-1">
							<span className="font-bold text-gray-700 block mb-1">
								Note to Employee:
							</span>
							This payslip includes your salary for the period. Please retain this
							document for your tax records. If you have questions, contact your HR
							team.
						</div>
						<div className="text-right">
							<div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
								<div className="text-gray-600">Gross Pay</div>
								<div className="font-semibold text-gray-900">
									{formatCurrency(grossPay)}
								</div>
								<div className="text-gray-600">Tax Deductions</div>
								<div className="font-semibold text-gray-900">
									-{formatCurrency(displayPayrollDeductions)}
								</div>
								<div className="text-lg font-bold text-red-700 mt-2">NET PAY</div>
								<div className="text-lg font-bold text-red-700 mt-2 tabular-nums">
									{formatCurrency(netPay)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
