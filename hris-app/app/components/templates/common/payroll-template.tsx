import type { MouseEvent } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Download, ChevronRight, FileText, Filter } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { format } from "date-fns";

import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployeePayrolls, useDownloadPayslip } from "~/lib/hooks/useEmployeePayroll";
import { Skeleton } from "~/components/ui/skeleton";

interface EmployeePayrollDashboardProps {
	employeeIdOverride?: string;
}

function safeFormatDate(value?: string | Date | null, pattern = "MMM dd, yyyy") {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return format(date, pattern);
}

function EmployeePayrollDashboardSkeleton() {
	return (
		<div className="bg-gray-50/30 min-h-screen pb-12">
			<div className="grid lg:grid-cols-3 gap-8">
				<div className="lg:col-span-2 space-y-6">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-2">
							<div className="rounded-md bg-red-50 p-1.5">
								<FileText className="h-5 w-5 text-red-300" />
							</div>
							<Skeleton className="h-6 w-40" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-9 w-40 rounded-md" />
							<Skeleton className="h-9 w-24 rounded-md" />
						</div>
					</div>

					<div className="space-y-4">
						{Array.from({ length: 5 }).map((_, index) => (
							<div
								key={`payroll-skeleton-${index}`}
								className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
								<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
									<div className="flex items-center gap-4">
										<div className="bg-gray-50 rounded-lg p-3 min-w-[60px] space-y-2">
											<Skeleton className="h-3 w-8 mx-auto" />
											<Skeleton className="h-6 w-7 mx-auto" />
										</div>
										<div className="space-y-2">
											<Skeleton className="h-5 w-36" />
											<div className="flex items-center gap-2">
												<Skeleton className="h-4 w-24" />
												<Skeleton className="h-4 w-24" />
											</div>
										</div>
									</div>
									<div className="flex items-center justify-between md:justify-end gap-8 flex-1">
										<div className="text-right space-y-2">
											<Skeleton className="h-3 w-10 ml-auto" />
											<Skeleton className="h-5 w-24 ml-auto" />
										</div>
										<div className="text-right space-y-2 min-w-[100px]">
											<Skeleton className="h-3 w-14 ml-auto" />
											<Skeleton className="h-6 w-28 ml-auto" />
										</div>
										<div className="flex items-center gap-2">
											<Skeleton className="h-8 w-8 rounded-md" />
											<Skeleton className="h-5 w-5 rounded" />
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="space-y-6">
					<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
						<div className="flex items-center justify-between mb-6">
							<div className="flex items-center gap-2">
								<div className="p-1.5 bg-red-50 rounded-md">
									<Filter className="h-4 w-4 text-red-300" />
								</div>
								<Skeleton className="h-5 w-28" />
							</div>
							<Skeleton className="h-6 w-16 rounded-full" />
						</div>
						<Skeleton className="h-3 w-36 -mt-4 mb-6" />
						<div className="relative h-48 w-full flex items-center justify-center mb-6">
							<Skeleton className="h-40 w-40 rounded-full" />
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-6 w-24" />
							</div>
						</div>
						<div className="space-y-3">
							{Array.from({ length: 3 }).map((_, index) => (
								<div
									key={`payroll-summary-skeleton-${index}`}
									className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Skeleton className="h-2 w-2 rounded-full" />
										<Skeleton className="h-4 w-20" />
									</div>
									<Skeleton className="h-5 w-24" />
								</div>
							))}
						</div>
						<div className="mt-6 pt-4 border-t border-gray-100">
							<Skeleton className="h-9 w-full rounded-md" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function EmployeePayrollDashboard({
	employeeIdOverride,
}: EmployeePayrollDashboardProps = {}) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useAuth();
	const employeeId = employeeIdOverride || user?.metadata?.employee?.id;

	const { mutate: downloadPayslip, isPending: isDownloading } = useDownloadPayslip();

	const pageParam = Number(searchParams.get("page")) || 1;
	const limitParam = Number(searchParams.get("limit")) || 10;

	// Fetch payrolls only when we know which employee to load
	const { data: payrollsData, isLoading } = useEmployeePayrolls({
		page: pageParam,
		limit: limitParam,
		filter: employeeId ? `employeeId:${employeeId}` : undefined,
		sort: "payrollPeriod.endDate",
		order: "desc",
		enabled: Boolean(employeeId),
	});

	const items = (payrollsData as any)?.employeePayrolls || [];

	// Calculate Summary Data (from available items)
	// In a real app, this should come from a dedicated "year-to-date" endpoint
	const currentYear = new Date().getFullYear();
	const thisYearItems = items.filter((item: any) => {
		const endDate = item?.payrollPeriod?.endDate;
		if (!endDate) return false;
		const year = new Date(endDate).getFullYear();
		return !Number.isNaN(year) && year === currentYear;
	});

	const totalNet = thisYearItems.reduce(
		(acc: number, item: any) => acc + Number(item?.netPay || 0),
		0,
	);
	const totalTax = thisYearItems.reduce(
		(acc: number, item: any) => acc + Number(item?.taxAmount || 0),
		0,
	);
	const totalDeductions = thisYearItems.reduce(
		(acc: number, item: any) => acc + Number(item?.totalDeductions || 0),
		0,
	);
	const totalGross = thisYearItems.reduce(
		(acc: number, item: any) => acc + Number(item?.grossPay || 0),
		0,
	);
	const otherDeductions = Math.max(totalDeductions - totalTax, 0);

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
		}).format(amount);
	};

	const chartData = [
		{ name: "Net Pay", value: Math.max(totalNet, 0), color: "#E60000" }, // Bandai Red
		{ name: "Taxes", value: Math.max(totalTax, 0), color: "#F97316" }, // Orange
		{ name: "Deductions", value: otherDeductions, color: "#E5E7EB" }, // Gray
	].filter((entry) => entry.value > 0);

	const handleDownload = (e: MouseEvent, item: any) => {
		e.stopPropagation();
		const firstName =
			item?.employee?.person?.personalInfo?.firstName ||
			(user as any)?.metadata?.employee?.personalInfo?.firstName ||
			"Employee";
		const periodName = item?.payrollPeriod?.name || "payslip";
		downloadPayslip({
			id: item.id,
			name: `${firstName}-${periodName}`,
		});
	};

	if (employeeId && isLoading) {
		return <EmployeePayrollDashboardSkeleton />;
	}

	if (!employeeId) {
		return (
			<div className="bg-gray-50/30 min-h-screen pb-12">
				<div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500">
					No employee profile is linked to this account, so payslips cannot be loaded.
				</div>
			</div>
		);
	}

	return (
		<div className=" bg-gray-50/30 min-h-screen pb-12">
			<div className="grid lg:grid-cols-3 gap-8">
				{/* Left Column: Recent Payslips */}
				<div className="lg:col-span-2 space-y-6">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<FileText className="text-red-600 h-5 w-5" />
							<h2 className="text-lg font-bold text-gray-900">Recent Payslips</h2>
						</div>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" className="bg-white">
								<Filter className="h-3.5 w-3.5 mr-2" />
								Filter: Last 6 Months
							</Button>
							<Button size="sm">Export All</Button>
						</div>
					</div>

					<div className="space-y-4">
						{items.map((item: any) => {
							const employeeRecordId = item?.employee?.id || employeeId;
							const periodEnd = item?.payrollPeriod?.endDate;
							const periodDay = periodEnd
								? new Date(periodEnd).getDate()
								: null;

							return (
							<div
								key={item.id}
								onClick={() => {
									if (!employeeRecordId || !item?.id) return;
									navigate(
										`/employee/${employeeRecordId}/payroll/${item.id}`,
									);
								}}
								className="group bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4">
								<div className="flex items-center gap-4">
									<div className="bg-gray-50 rounded-lg p-3 text-center min-w-[60px]">
										<div className="text-xs font-bold text-gray-500 uppercase">
											{safeFormatDate(periodEnd, "MMM")}
										</div>
										<div className="text-xl font-bold text-gray-900 leading-none mt-0.5">
											{periodDay && !Number.isNaN(periodDay) ? periodDay : "—"}
										</div>
									</div>
									<div>
										<h3 className="mb-1 font-semibold text-gray-900">
											{item?.payrollPeriod?.name || "Regular Salary"}
										</h3>
										<p className="text-xs text-gray-500 flex items-center gap-1">
											{safeFormatDate(item?.payrollPeriod?.startDate)}{" "}
											-{" "}
											{safeFormatDate(item?.payrollPeriod?.endDate)}
										</p>
									</div>
								</div>

								<div className="flex items-center justify-between md:justify-end gap-8 flex-1">
									<div className="text-right">
										<div className="text-[10px] text-gray-400 uppercase font-medium">
											Gross
										</div>
										<div className="text-sm font-medium text-gray-600">
											{formatCurrency(Number(item?.grossPay || 0))}
										</div>
									</div>
									<div className="text-right min-w-[100px]">
										<div className="text-[10px] text-gray-400 uppercase font-medium">
											Net Pay
										</div>
										<div className="text-lg font-bold text-gray-900">
											{formatCurrency(Number(item?.netPay || 0))}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-gray-400 hover:text-red-600"
											onClick={(e) => handleDownload(e, item)}
											disabled={isDownloading}>
											<Download className="h-4 w-4" />
										</Button>
										<ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-red-500 transition-colors" />
									</div>
								</div>
							</div>
							);
						})}

						{items.length === 0 && (
							<div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-dashed">
								No payslips found.
							</div>
						)}
					</div>

					{items.length > 5 && (
						<div className="flex justify-center pt-2">
							<Button variant="ghost" className="text-red-600 hover:text-red-700">
								View Older Payslips <ChevronRight className="h-4 w-4 ml-1" />
							</Button>
						</div>
					)}
				</div>

				{/* Right Column: Summary & Actions */}
				<div className="space-y-6">
					{/* YTD Summary Card */}
					<div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
						<div className="flex items-center justify-between mb-6">
							<div className="flex items-center gap-2">
								<div className="p-1.5 bg-red-50 rounded-md text-red-600">
									<Filter className="h-4 w-4" />
								</div>
								<h3 className="font-bold text-gray-900">YTD Summary</h3>
							</div>
							<Badge variant="outline" className="font-normal">
								{currentYear}
							</Badge>
						</div>

						<p className="text-xs text-gray-400 -mt-4 mb-6">
							January 1 - {format(new Date(), "MMMM dd")}
						</p>

						<div className="relative h-48 w-full flex items-center justify-center mb-6">
							{chartData.length > 0 ? (
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={chartData}
											innerRadius={60}
											outerRadius={80}
											paddingAngle={5}
											dataKey="value">
											{chartData.map((entry, index) => (
												<Cell key={`cell-${index}`} fill={entry.color} />
											))}
										</Pie>
										<RechartsTooltip />
									</PieChart>
								</ResponsiveContainer>
							) : (
								<div className="h-40 w-40 rounded-full border-8 border-gray-100" />
							)}
							{/* Center Text */}
							<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
								<div className="text-[10px] uppercase text-gray-400 font-semibold">
									Total Gross
								</div>
								<div className="text-xl font-bold text-gray-900">
									{new Intl.NumberFormat("en-PH", {
										notation: "compact",
										compactDisplay: "short",
										style: "currency",
										currency: "PHP",
									}).format(totalGross)}
								</div>
							</div>
						</div>

						<div className="space-y-3">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<div className="w-2 h-2 rounded-full bg-[#E60000]"></div>
									<span className="text-gray-600">Net Pay</span>
								</div>
								<span className="font-bold text-gray-900">
									{formatCurrency(totalNet)}
								</span>
							</div>
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<div className="w-2 h-2 rounded-full bg-orange-400"></div>
									<span className="text-gray-600">Taxes</span>
								</div>
								<span className="font-bold text-gray-900">
									{formatCurrency(totalTax)}
								</span>
							</div>
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<div className="w-2 h-2 rounded-full bg-gray-200"></div>
									<span className="text-gray-600">Deductions</span>
								</div>
								<span className="font-bold text-gray-900">
									{formatCurrency(otherDeductions)}
								</span>
							</div>
						</div>

						<div className="mt-6 pt-4 border-t border-gray-100 text-center">
							<Button
								variant="ghost"
								className="w-full text-red-600 h-auto py-2 text-xs">
								View Detailed Report <ChevronRight className="h-3 w-3 ml-1" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
