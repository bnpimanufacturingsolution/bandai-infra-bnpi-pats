import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import MobileSiteLayout from "~/layouts/mobile-site-layout";

export default function SitePayslip() {
	const [selectedMonth, setSelectedMonth] = useState("April 2023");

	const payslipData = {
		employeeName: "Joana",
		employeeId: "EMP-001",
		period: "April 1-30, 2023",
		basicSalary: "₱50,000.00",
		allowances: "₱5,000.00",
		deductions: "₱8,500.00",
		netPay: "₱46,500.00",
	};

	const earnings = [
		{ label: "Basic Salary", amount: "₱50,000.00" },
		{ label: "Transportation Allowance", amount: "₱3,000.00" },
		{ label: "Meal Allowance", amount: "₱2,000.00" },
	];

	const deductions = [
		{ label: "SSS", amount: "₱2,500.00" },
		{ label: "PhilHealth", amount: "₱1,500.00" },
		{ label: "Pag-IBIG", amount: "₱500.00" },
		{ label: "Tax", amount: "₱4,000.00" },
	];

	return (
		<MobileSiteLayout>
			<div className="min-h-screen bg-white">
				{/* Main Content */}
				<div className="px-6 py-6 space-y-6">
					{/* Period Selector */}
					<div className="flex items-center justify-between">
						<h2 className="text-base font-bold text-gray-900">Payslip</h2>
						<div className="flex items-center gap-2">
							<button className="p-1 hover:bg-gray-100 rounded">
								<ChevronLeft className="w-5 h-5 text-gray-600" />
							</button>
							<div className="px-4 py-1 border border-gray-300 rounded-md">
								<span className="text-sm font-medium text-gray-700">
									{selectedMonth}
								</span>
							</div>
							<button className="p-1 hover:bg-gray-100 rounded">
								<ChevronRight className="w-5 h-5 text-gray-600" />
							</button>
						</div>
					</div>

					{/* Payslip Card */}
					<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
						{/* Header Section */}
						<div className="bg-purple-700 px-6 py-4 text-white">
							<p className="text-sm opacity-90">Employee</p>
							<p className="text-lg font-bold">{payslipData.employeeName}</p>
							<p className="text-xs opacity-75">{payslipData.employeeId}</p>
						</div>

						{/* Period */}
						<div className="px-6 py-3 bg-purple-50 border-b border-gray-200">
							<p className="text-xs text-gray-600">Pay Period</p>
							<p className="text-sm font-semibold text-gray-900">
								{payslipData.period}
							</p>
						</div>

						{/* Earnings */}
						<div className="px-6 py-4 border-b border-gray-200">
							<p className="text-sm font-bold text-gray-900 mb-3">Earnings</p>
							<div className="space-y-2">
								{earnings.map((item, index) => (
									<div key={index} className="flex justify-between items-center">
										<span className="text-sm text-gray-600">{item.label}</span>
										<span className="text-sm font-medium text-gray-900">
											{item.amount}
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Deductions */}
						<div className="px-6 py-4 border-b border-gray-200">
							<p className="text-sm font-bold text-gray-900 mb-3">Deductions</p>
							<div className="space-y-2">
								{deductions.map((item, index) => (
									<div key={index} className="flex justify-between items-center">
										<span className="text-sm text-gray-600">{item.label}</span>
										<span className="text-sm font-medium text-red-600">
											-{item.amount}
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Net Pay */}
						<div className="px-6 py-4 bg-purple-50">
							<div className="flex justify-between items-center">
								<span className="text-base font-bold text-gray-900">Net Pay</span>
								<span className="text-lg font-bold text-purple-700">
									{payslipData.netPay}
								</span>
							</div>
						</div>
					</div>

					{/* Download Button */}
					<button className="w-full bg-purple-700 text-white py-3 rounded-lg font-medium hover:bg-purple-800 transition-colors flex items-center justify-center gap-2">
						<Download className="w-5 h-5" />
						Download Payslip
					</button>
				</div>
			</div>
		</MobileSiteLayout>
	);
}
