import { Calendar, Heart } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useAuth } from "~/lib/hooks/use-auth";
import { useEmployee } from "~/lib/hooks/useEmployees";
import type { DashboardRole } from "../role-dashboard.types";

interface TimeOffCardProps {
	role: DashboardRole;
	employeeId?: string;
}

type DisplayLeaveBalance = {
	leaveType: string;
	available: number;
	icon: typeof Calendar;
};

const getLeaveIcon = (leaveType: string) => {
	const normalized = leaveType.toLowerCase();
	return normalized.includes("sick") ? Heart : Calendar;
};

const formatLeaveTypeLabel = (leaveType: string) =>
	leaveType
		.toLowerCase()
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

const formatDayLabel = (value: number) => (value === 1 ? "day available" : "days available");

export function TimeOffCard({ role, employeeId }: TimeOffCardProps) {
	const navigate = useNavigate();
	const { user } = useAuth();
	const resolvedEmployeeId = employeeId || user?.metadata?.employee?.id || "";
	const { data: employee } = useEmployee(resolvedEmployeeId, ["id", "leaveBalances"], {
		document: true,
	});
	const leaveBalancePath = resolvedEmployeeId
		? `/employee/${resolvedEmployeeId}?tab=leave-balance`
		: "";
	const canNavigateToLeaveBalance = !!leaveBalancePath;
	const requestPath =
		role === "employee" || role === "employee-manager"
			? "/employee/requests?action=create&kind=leave"
			: "/hr/requests/leave";
	const leaveBalances = useMemo<DisplayLeaveBalance[]>(() => {
		const balances = employee?.leaveBalances || [];

		return balances
			.filter((balance) => typeof balance.available === "number" && balance.available >= 0)
			.sort((a, b) => b.available - a.available)
			.slice(0, 2)
			.map((balance) => ({
				leaveType: balance.leaveType,
				available: balance.available,
				icon: getLeaveIcon(balance.leaveType),
			}));
	}, [employee?.leaveBalances]);

	return (
		<Card id="dashboard-time-off" className="h-full gap-4 overflow-hidden py-4">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-base font-semibold">
						<Calendar className="h-4 w-4 text-gray-400" />
						Time Off
					</CardTitle>
					<button
						onClick={() => {
							if (!canNavigateToLeaveBalance) return;
							navigate(leaveBalancePath);
						}}
						disabled={!canNavigateToLeaveBalance}
						className={`text-xs ${
							canNavigateToLeaveBalance
								? "text-gray-400 hover:text-gray-600"
								: "text-gray-300 cursor-not-allowed"
						}`}>
						View all →
					</button>
				</div>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col pt-0">
				<div className="flex min-h-0 flex-1 flex-col">
					{leaveBalances.length > 0 ? (
						<div className="min-h-0 flex-1 divide-y divide-gray-100">
							{leaveBalances.map((balance, index) => {
								const Icon = balance.icon;
								const isSickLeave = Icon === Heart;
								return (
									<div
										key={`${balance.leaveType}-${index}`}
										onClick={() => {
											if (!canNavigateToLeaveBalance) return;
											navigate(leaveBalancePath);
										}}
										className={`flex items-center justify-between py-1.5 transition-colors ${
											canNavigateToLeaveBalance
												? "hover:bg-gray-50 cursor-pointer -mx-1 px-1 rounded"
												: "opacity-70 cursor-default"
										}`}>
										<div className="flex items-center gap-2">
											<div
												className={`flex h-7 w-7 items-center justify-center rounded-md ${
													isSickLeave ? "bg-blue-50" : "bg-orange-50"
												}`}>
												<Icon
													className={`h-3.5 w-3.5 ${
														isSickLeave ? "text-blue-500" : "text-orange-500"
													}`}
												/>
											</div>
											<span className="text-sm font-medium text-gray-800">
												{formatLeaveTypeLabel(balance.leaveType)}
											</span>
										</div>
										<div className="text-right tabular-nums">
											<span className="text-sm font-semibold text-gray-900">
												{balance.available}
											</span>
											<span className="ml-1 text-xs text-gray-400">days</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-center text-sm text-gray-500">
							No leave balances configured
						</div>
					)}

					<Button size="sm" className="mt-auto w-full shrink-0" onClick={() => navigate(requestPath)}>
						<Calendar className="mr-2 h-4 w-4" />
						Request Time Off
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
