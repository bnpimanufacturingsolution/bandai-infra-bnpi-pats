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
		<Card id="dashboard-time-off" className="h-full">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<Calendar className="w-5 h-5 text-orange-500" />
						Time Off
					</CardTitle>
					<button
						onClick={() => {
							if (!canNavigateToLeaveBalance) return;
							navigate(leaveBalancePath);
						}}
						disabled={!canNavigateToLeaveBalance}
						className={`text-sm ${
							canNavigateToLeaveBalance
								? "text-gray-600 hover:text-gray-800"
								: "text-gray-400 cursor-not-allowed"
						}`}>
						View All &gt;
					</button>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col">
				<div className="flex h-full flex-1 flex-col gap-4">
					{leaveBalances.length > 0 ? (
						<div className="space-y-3">
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
										className={`flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 transition-colors ${
											canNavigateToLeaveBalance
												? "hover:bg-gray-50 cursor-pointer"
												: "opacity-70 cursor-default"
										}`}>
										<div className="flex items-center gap-3">
											<div
												className={`flex h-9 w-9 items-center justify-center rounded-full border ${
													isSickLeave
														? "bg-blue-50 border-blue-100"
														: "bg-orange-50 border-orange-100"
												}`}>
												<Icon
													className={`w-5 h-5 ${
														isSickLeave
															? "text-blue-500"
															: "text-orange-500"
													}`}
												/>
											</div>
											<div>
												<p className="text-sm font-medium text-gray-900">
													{formatLeaveTypeLabel(balance.leaveType)}
												</p>
												<p className="text-xs text-gray-500">
													Annual allocation
												</p>
											</div>
										</div>
										<div className="text-right">
											<p className="text-base font-bold text-gray-900">
												{balance.available}
											</p>
											<p className="text-xs text-gray-500">
												{formatDayLabel(balance.available)}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
							<p className="text-sm font-medium text-gray-900">
								No leave balances available
							</p>
							<p className="mt-1 text-xs text-gray-500">
								Your leave balances will appear here once they are configured.
							</p>
						</div>
					)}

					<div className="pt-1">
						<Button className="w-full" onClick={() => navigate(requestPath)}>
							<Calendar className="w-4 h-4 mr-2" />
							Request Time Off
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
