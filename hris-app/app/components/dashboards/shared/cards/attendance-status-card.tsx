import { CheckCircle, Users } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useEmployeeStatusSummary } from "~/lib/hooks/useMetrics";
import { useEmployees } from "~/lib/hooks/useEmployees";

interface AttendanceStatusCardProps {
	employeeId?: string;
}

export function AttendanceStatusCard({ employeeId }: AttendanceStatusCardProps) {
	const navigate = useNavigate();
	const todayStr = new Date().toISOString().slice(0, 10);
	const { data, isLoading } = useEmployeeStatusSummary(employeeId, todayStr, todayStr);
	const employeeAttendance = data?.metrics?.employeeStatusSummary || [];
	const { data: directReportsData } = useEmployees({
		page: 1,
		limit: 500,
		filter: employeeId ? `reportToId:${employeeId}` : undefined,
		fields: "id,employeeId",
		document: "true",
		pagination: "false",
		count: "false",
	});
	const directReports = useMemo(
		() =>
			directReportsData?.employees ||
			(Array.isArray(directReportsData?.data)
				? directReportsData.data
				: directReportsData?.data?.employees || []),
		[directReportsData],
	);
	const employeeIdMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of directReports as any[]) {
			if (item?.employeeId && item?.id) {
				map.set(String(item.employeeId), String(item.id));
			}
		}
		return map;
	}, [directReports]);

	const handleEmployeeRowClick = (employeeCode?: string) => {
		const resolvedId = employeeCode ? employeeIdMap.get(String(employeeCode)) : undefined;
		if (resolvedId) {
			navigate(`/employee/${resolvedId}`);
			return;
		}
		navigate("/employee/team");
	};

	return (
		<Card id="dashboard-team-attendance">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<Users className="w-5 h-5 text-orange-500" />
						Team Attendance Snapshot
					</CardTitle>
					<button
						onClick={() => navigate("/employee/team")}
						className="text-gray-600 text-sm hover:text-gray-800">
						View All &gt;
					</button>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center justify-center h-32">
						<div className="text-gray-600 text-sm">Loading...</div>
					</div>
				) : employeeAttendance.length === 0 ? (
					<div className="flex items-center justify-center h-32">
						<div className="text-gray-600 text-sm">No direct reports found</div>
					</div>
				) : (
					<div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
						{employeeAttendance.map((employee: any) => (
							<div
								key={employee.employeeId}
								role="button"
								tabIndex={0}
								onClick={() => handleEmployeeRowClick(employee.employeeId)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleEmployeeRowClick(employee.employeeId);
									}
								}}
								className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-orange-200 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0">
										<Users className="w-5 h-5 text-orange-600" />
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-gray-900 truncate">
											{employee.employeeName}
										</p>
										<span
											className={`inline-flex items-center gap-1 px-2 py-0.5 mt-1 text-xs rounded-full ${
												employee.status === "PRESENT"
													? "bg-green-100 text-green-800"
													: employee.status === "LEAVE"
														? "bg-yellow-100 text-yellow-800"
														: "bg-red-100 text-red-800"
											}`}>
											<CheckCircle className="w-3 h-3" />
											{employee.status}
										</span>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
