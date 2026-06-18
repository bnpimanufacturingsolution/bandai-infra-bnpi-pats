import type { Employee } from "~/services/employees.service";
import { AlertCircle, Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";

interface LeaveBalance {
	leaveType: string;
	totalEntitled: number;
	used: number;
	pending: number;
	available: number;
	carriedOver: number | null;
	maxCarryOver: number | null;
	periodStart: string;
	periodEnd: string;
}

interface LeaveBalanceTabProps {
	employee: Employee;
}

export function LeaveBalanceTab({ employee }: LeaveBalanceTabProps) {
	const leaveBalances: LeaveBalance[] = employee.leaveBalances || [];

	if (!leaveBalances || leaveBalances.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
					<Calendar className="w-8 h-8 text-gray-400" />
				</div>
				<p className="text-gray-900 font-medium">No leave balance information</p>
				<p className="text-gray-500 text-sm mt-1">
					Leave balances will appear here once configured
				</p>
			</div>
		);
	}

	const formatLeaveType = (type: string) =>
		type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

	const formatDate = (dateString: string) =>
		new Date(dateString).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	const totalEntitled = leaveBalances.reduce((sum, b) => sum + b.totalEntitled, 0);
	const totalAvailable = leaveBalances.reduce((sum, b) => sum + b.available, 0);
	const totalUsed = leaveBalances.reduce((sum, b) => sum + b.used, 0);
	const totalPending = leaveBalances.reduce((sum, b) => sum + b.pending, 0);

	return (
		<div className="space-y-8">
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Calendar className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Leave Summary</h3>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div className="border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-gray-500 uppercase">
								Entitled
							</span>
							<Calendar className="w-4 h-4 text-orange-500" />
						</div>
						<p className="text-xl font-semibold text-gray-900">{totalEntitled}</p>
						<p className="text-xs text-gray-500 mt-1">days</p>
					</div>
					<div className="border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-gray-500 uppercase">
								Available
							</span>
							<CheckCircle2 className="w-4 h-4 text-orange-500" />
						</div>
						<p className="text-xl font-semibold text-orange-600">{totalAvailable}</p>
						<p className="text-xs text-gray-500 mt-1">days</p>
					</div>
					<div className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-gray-500 uppercase">
								Used
							</span>
							<XCircle className="w-4 h-4 text-gray-400" />
						</div>
						<p className="text-xl font-semibold text-gray-600">{totalUsed}</p>
						<p className="text-xs text-gray-500 mt-1">days</p>
					</div>
					<div className="border border-gray-200 rounded-xl p-4 hover:border-amber-300 transition-colors">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-gray-500 uppercase">
								Pending
							</span>
							<Clock className="w-4 h-4 text-amber-500" />
						</div>
						<p className="text-xl font-semibold text-amber-600">{totalPending}</p>
						<p className="text-xs text-gray-500 mt-1">days</p>
					</div>
				</div>
			</section>
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<CheckCircle2 className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Leave Type Breakdown</h3>
				</div>
				<div className="space-y-4">
					{leaveBalances.map((balance, index) => (
						<div
							key={index}
							className="border border-gray-200 rounded-xl overflow-hidden hover:border-orange-300 transition-colors">
							<div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
								<div className="flex items-center gap-3">
									<Calendar className="w-4 h-4 text-orange-500" />
									<span className="text-sm font-medium text-gray-700">
										{formatLeaveType(balance.leaveType)}
									</span>
								</div>
								<span className="text-xs text-gray-500">
									{formatDate(balance.periodStart)} -{" "}
									{formatDate(balance.periodEnd)}
								</span>
							</div>
							<div className="divide-y divide-gray-100">
								<div className="flex items-center justify-between px-4 py-3">
									<span className="text-sm font-medium text-gray-700">
										Available
									</span>
									<span className="text-sm text-orange-600 font-medium">
										{balance.available} days
									</span>
								</div>
								<div className="flex items-center justify-between px-4 py-3">
									<span className="text-sm font-medium text-gray-700">
										Entitled
									</span>
									<span className="text-sm text-gray-600">
										{balance.totalEntitled} days
									</span>
								</div>
								<div className="flex items-center justify-between px-4 py-3">
									<span className="text-sm font-medium text-gray-700">Used</span>
									<span className="text-sm text-gray-500">
										{balance.used} days
									</span>
								</div>
								<div className="flex items-center justify-between px-4 py-3">
									<span className="text-sm font-medium text-gray-700">
										Pending
									</span>
									<span className="text-sm text-amber-600">
										{balance.pending} days
									</span>
								</div>
								{balance.carriedOver !== null && (
									<div className="flex items-center justify-between px-4 py-3">
										<span className="text-sm font-medium text-gray-700">
											Carried Over
										</span>
										<span className="text-sm text-blue-600">
											{balance.carriedOver} days
										</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
